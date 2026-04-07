using Azure.Identity;
using Azure.ResourceManager;
using Azure.ResourceManager.Compute;
using Azure.ResourceManager.Compute.Models;
using Azure.ResourceManager.Resources;
using Azure.Core;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using backend.src.services;
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

    public VmStatusPoller(IHubContext<SiemHub> hubContext, ILogger<VmStatusPoller> logger, VmRunCommandService vmRunCommandService)
    {
        _hubContext = hubContext;
        _logger = logger;
        _vmRunCommandService = vmRunCommandService;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var credential = new DefaultAzureCredential();
        ArmClient client = new ArmClient(credential);
        var subId = Environment.GetEnvironmentVariable("AZURE_SUBSCRIPTION_ID")?.Trim().Replace("\r", "").Replace("\n", "");
        var rgName = Environment.GetEnvironmentVariable("AZURE_RESOURCE_GROUP")?.Trim().Replace("\r", "").Replace("\n", "");
        
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
                            var status = GetPowerStatus(response.Value);
                            var isRunning = IsRunningStatus(status);
                            var cachedInsights = await _vmRunCommandService.GetCachedOrFallbackGuestInsightsAsync(vm, stoppingToken);

                            await PublishVmStatusAsync(vm, status, cachedInsights, stoppingToken);

                            if (isRunning)
                            {
                                var refreshedInsights = await _vmRunCommandService.GetGuestInsightsAsync(vm, isRunning, stoppingToken);
                                if (!AreEquivalent(cachedInsights, refreshedInsights))
                                {
                                    await PublishVmStatusAsync(vm, status, refreshedInsights, stoppingToken);
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

            await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
        }
    }

    private async Task PublishVmStatusAsync(VirtualMachineResource vm, string status, VmGuestInsights guestInsights, CancellationToken cancellationToken)
    {
        await _hubContext.Clients.Group("security-team").SendAsync("vmStatus", new
        {
            vmName = vm.Data.Name,
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
            diskTotalGb = guestInsights.DiskTotalGb
        }, cancellationToken);
    }

    private static string GetPowerStatus(VirtualMachineInstanceView instanceView)
    {
        var powerStatus = instanceView.Statuses
            .FirstOrDefault(status => status.Code.StartsWith("PowerState/", StringComparison.OrdinalIgnoreCase));

        if (!string.IsNullOrWhiteSpace(powerStatus?.DisplayStatus))
        {
            return powerStatus.DisplayStatus.Trim();
        }

        return powerStatus?.Code switch
        {
            string code when code.Contains("running", StringComparison.OrdinalIgnoreCase) => "VM running",
            string code when code.Contains("restarting", StringComparison.OrdinalIgnoreCase) => "VM restarting",
            string code when code.Contains("starting", StringComparison.OrdinalIgnoreCase) => "VM starting",
            string code when code.Contains("stopping", StringComparison.OrdinalIgnoreCase) => "VM stopping",
            string code when code.Contains("deallocating", StringComparison.OrdinalIgnoreCase) => "VM deallocating",
            string code when code.Contains("deallocated", StringComparison.OrdinalIgnoreCase) => "VM deallocated",
            string code when code.Contains("stopped", StringComparison.OrdinalIgnoreCase) => "VM stopped",
            _ => "VM unknown"
        };
    }

    private static bool IsRunningStatus(string status)
    {
        return status.Contains("running", StringComparison.OrdinalIgnoreCase);
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
