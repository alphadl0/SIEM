using Azure.Identity;
using Azure.Monitor.Query;
using Azure.Monitor.Query.Models;
using Azure.ResourceManager;
using Azure.ResourceManager.Compute;
using Azure.ResourceManager.Compute.Models;
using Azure.ResourceManager.Resources;
using Azure.Core;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using backend.src.services;
using backend.src.helpers;
using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace backend.src.pollers;

public class VmStatusPoller : BackgroundService
{
    private readonly IHubContext<SiemHub> _hubContext;
    private readonly ILogger<VmStatusPoller> _logger;
    private readonly VmRunCommandService _vmRunCommandService;
    private readonly DefaultAzureCredential _credential;

    public VmStatusPoller(IHubContext<SiemHub> hubContext, ILogger<VmStatusPoller> logger, VmRunCommandService vmRunCommandService, DefaultAzureCredential credential)
    {
        _hubContext = hubContext;
        _logger = logger;
        _vmRunCommandService = vmRunCommandService;
        _credential = credential;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var credential = _credential;
        ArmClient client = new ArmClient(credential);
        var metricsClient = new MetricsQueryClient(credential);
        var subId = SettingsHelper.GetEnv("AZURE_SUBSCRIPTION_ID");
        var rgName = SettingsHelper.GetEnv("AZURE_RESOURCE_GROUP");
        
        while (!stoppingToken.IsCancellationRequested)
        {
            if (!string.IsNullOrEmpty(subId) && !string.IsNullOrEmpty(rgName))
            {
                try
                {
                    _logger.LogInformation("Polling VM status for Subscription: {sub} / RG: {rg}", subId, rgName);
                    ResourceIdentifier rgId = ResourceGroupResource.CreateResourceIdentifier(subId, rgName);
                    ResourceGroupResource rg = client.GetResourceGroupResource(rgId);
                    
                    int count = 0;
                    await foreach (var vm in rg.GetVirtualMachines().GetAllAsync(cancellationToken: stoppingToken))
                    {
                        try
                        {
                            count++;
                            var response = await vm.InstanceViewAsync(cancellationToken: stoppingToken);
                            var status = VmPowerStatusHelper.GetPowerStatus(response.Value);
                            var isRunning = VmPowerStatusHelper.IsRunningStatus(status);
                            var cachedInsights = await _vmRunCommandService.GetCachedOrFallbackGuestInsightsAsync(vm, stoppingToken);

                            double? networkInMbps = null;
                            double? networkOutMbps = null;
                            double? cpuPercent = null;

                            if (isRunning)
                            {
                                try
                                {
                                    var metricsResponse = await metricsClient.QueryResourceAsync(
                                        vm.Id,
                                        new[] { "Percentage CPU", "Network In", "Network Out" },
                                        new MetricsQueryOptions
                                        {
                                            TimeRange = new QueryTimeRange(TimeSpan.FromMinutes(15)),
                                            Granularity = TimeSpan.FromMinutes(5)
                                        },
                                        cancellationToken: stoppingToken
                                    );

                                    // CPU percentage
                                    var cpuMetric = metricsResponse.Value.Metrics.FirstOrDefault(m => m.Name.Equals("Percentage CPU", StringComparison.OrdinalIgnoreCase));
                                    if (cpuMetric != null)
                                    {
                                        var lastCpuVal = cpuMetric.TimeSeries.SelectMany(t => t.Values).LastOrDefault(v => v.Average.HasValue);
                                        if (lastCpuVal != null && lastCpuVal.Average.HasValue)
                                        {
                                            cpuPercent = Math.Round(lastCpuVal.Average.Value, 1);
                                        }
                                    }

                                    // Network In
                                    var netInMetric = metricsResponse.Value.Metrics.FirstOrDefault(m => m.Name.Equals("Network In", StringComparison.OrdinalIgnoreCase));
                                    if (netInMetric != null)
                                    {
                                        var lastVal = netInMetric.TimeSeries.SelectMany(t => t.Values).LastOrDefault(v => v.Total.HasValue || v.Average.HasValue);
                                        if (lastVal != null)
                                        {
                                            var bytesIn = lastVal.Total ?? lastVal.Average;
                                            if (bytesIn.HasValue) networkInMbps = Math.Round((bytesIn.Value * 8) / (5 * 60) / 1000000.0, 2);
                                        }
                                    }

                                    // Network Out
                                    var netOutMetric = metricsResponse.Value.Metrics.FirstOrDefault(m => m.Name.Equals("Network Out", StringComparison.OrdinalIgnoreCase));
                                    if (netOutMetric != null)
                                    {
                                        var lastVal = netOutMetric.TimeSeries.SelectMany(t => t.Values).LastOrDefault(v => v.Total.HasValue || v.Average.HasValue);
                                        if (lastVal != null)
                                        {
                                            var bytesOut = lastVal.Total ?? lastVal.Average;
                                            if (bytesOut.HasValue) networkOutMbps = Math.Round((bytesOut.Value * 8) / (5 * 60) / 1000000.0, 2);
                                        }
                                    }
                                }
                                catch (Exception metricEx)
                                {
                                    _logger.LogWarning(metricEx, "Failed to fetch metrics for VM {vmName}", vm.Data.Name);
                                }
                            }

                            await PublishVmStatusAsync(vm, status, cachedInsights, networkInMbps, networkOutMbps, cpuPercent, stoppingToken);

                            if (isRunning)
                            {
                                var refreshedInsights = await _vmRunCommandService.GetGuestInsightsAsync(vm, isRunning, stoppingToken);
                                if (!AreEquivalent(cachedInsights, refreshedInsights))
                                {
                                    await PublishVmStatusAsync(vm, status, refreshedInsights, networkInMbps, networkOutMbps, cpuPercent, stoppingToken);
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Unable to refresh VM status for {vmName}.", vm.Data.Name);
                        }
                    }
                    _logger.LogInformation("Found {count} VMs in {rg}", count, rgName);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "CRITICAL: VM Poller failure for RG {rg}. Check Azure Permissions and az login status.", rgName);
                }
            }

            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
        }
    }

    private async Task PublishVmStatusAsync(VirtualMachineResource vm, string status, VmGuestInsights guestInsights, double? networkInMbps, double? networkOutMbps, double? cpuPercent, CancellationToken cancellationToken)
    {
        await _hubContext.Clients.Group("security-team").SendAsync("vmStatus", new
        {
            vmName = vm.Data.Name,
            type = "Virtual Machine",
            status,
            location = vm.Data.Location.DisplayName,
            vmSize = vm.Data.HardwareProfile?.VmSize?.ToString() ?? "Unknown Size",
            osLabel = guestInsights.OsLabel,
            osVersion = guestInsights.OsVersion,
            privateIpAddress = guestInsights.PrivateIpAddress,
            publicIpAddress = guestInsights.PublicIpAddress,
            memoryUsedGb = guestInsights.MemoryUsedGb,
            memoryTotalGb = guestInsights.MemoryTotalGb,
            diskUsedGb = guestInsights.DiskUsedGb,
            diskTotalGb = guestInsights.DiskTotalGb,
            networkInMbps,
            networkOutMbps,
            cpuPercent
        }, cancellationToken);
    }

    private static bool AreEquivalent(VmGuestInsights left, VmGuestInsights right)
    {
        return string.Equals(left.OsLabel, right.OsLabel, StringComparison.OrdinalIgnoreCase)
            && string.Equals(left.OsVersion, right.OsVersion, StringComparison.OrdinalIgnoreCase)
            && string.Equals(left.PrivateIpAddress, right.PrivateIpAddress, StringComparison.OrdinalIgnoreCase)
            && string.Equals(left.PublicIpAddress, right.PublicIpAddress, StringComparison.OrdinalIgnoreCase)
            && Nullable.Equals(left.MemoryUsedGb, right.MemoryUsedGb)
            && Nullable.Equals(left.MemoryTotalGb, right.MemoryTotalGb)
            && Nullable.Equals(left.DiskUsedGb, right.DiskUsedGb)
            && Nullable.Equals(left.DiskTotalGb, right.DiskTotalGb);
    }
}
