using Azure.Core;
using Azure.ResourceManager;
using Azure.ResourceManager.Compute;
using Azure.ResourceManager.Compute.Models;
using Azure.ResourceManager.Network;
using Azure.ResourceManager.Network.Models;
using Azure.ResourceManager.Resources;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System;
using System.Collections.Concurrent;
using System.Globalization;
using Microsoft.Extensions.Logging;
using backend.src.helpers;

namespace backend.src.services;

public class VmRunCommandService
{
    private static readonly TimeSpan GuestInsightsCacheDuration = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan NetworkInsightsCacheDuration = TimeSpan.FromMinutes(5);
    private readonly ConcurrentDictionary<string, CachedGuestInsights> _guestInsightsCache = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, CachedNetworkInsights> _networkInsightsCache = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, double?> _vmMemoryCache = new(StringComparer.OrdinalIgnoreCase);
    private readonly ILogger<VmRunCommandService> _logger;
    private readonly Azure.Identity.DefaultAzureCredential _credential;
    private readonly Lazy<ArmClient> _armClient;

    public VmRunCommandService(ILogger<VmRunCommandService> logger, Azure.Identity.DefaultAzureCredential credential)
    {
        _logger = logger;
        _credential = credential;
        _armClient = new Lazy<ArmClient>(() => new ArmClient(credential));
    }

    public async Task<VmGuestInsights> GetGuestInsightsAsync(VirtualMachineResource vm, bool isRunning, CancellationToken cancellationToken)
    {
        if (_guestInsightsCache.TryGetValue(vm.Data.Name, out var cached) &&
            DateTimeOffset.UtcNow - cached.CapturedAtUtc < GuestInsightsCacheDuration)
        {
            return cached.Data;
        }

        var fallback = await BuildFallbackGuestInsightsAsync(vm, cancellationToken);
        if (!isRunning)
        {
            return await GetCachedOrFallbackGuestInsightsAsync(vm, cancellationToken);
        }

        try
        {
            var command = BuildGuestInsightsCommand(vm.Data.StorageProfile?.OSDisk?.OSType?.ToString() ?? string.Empty);
            var result = await vm.RunCommandAsync(Azure.WaitUntil.Completed, command, cancellationToken);
            var output = result.Value?.Value?.FirstOrDefault()?.Message ?? string.Empty;
            var details = ParseGuestInsights(output, fallback);
            _guestInsightsCache[vm.Data.Name] = new CachedGuestInsights(details, DateTimeOffset.UtcNow);
            return details;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Unable to retrieve guest insights for VM {VmName}. Falling back to Azure metadata.", vm.Data.Name);
            return cached?.Data ?? fallback;
        }
    }

    public async Task<VmGuestInsights> GetCachedOrFallbackGuestInsightsAsync(VirtualMachineResource vm, CancellationToken cancellationToken)
    {
        return _guestInsightsCache.TryGetValue(vm.Data.Name, out var cached)
            ? cached.Data
            : await BuildFallbackGuestInsightsAsync(vm, cancellationToken);
    }

    private async Task<VmGuestInsights> BuildFallbackGuestInsightsAsync(VirtualMachineResource vm, CancellationToken cancellationToken)
    {
        var osType = vm.Data.StorageProfile?.OSDisk?.OSType?.ToString() ?? "Unknown";
        var imageReference = vm.Data.StorageProfile?.ImageReference;
        var osProfile = vm.Data.OSProfile;
        var osLabel = FirstNonEmpty(
            imageReference?.Offer?.ToString(),
            osProfile?.WindowsConfiguration is not null ? "Windows" : null,
            osProfile?.LinuxConfiguration is not null ? "Linux" : null,
            imageReference?.Publisher?.ToString(),
            osType);
        var osVersion = FirstNonEmpty(
            imageReference?.Sku?.ToString(),
            imageReference?.ExactVersion?.ToString(),
            string.Empty);
        var diskTotalGb = vm.Data.StorageProfile?.OSDisk?.DiskSizeGB is int sizeGb
            ? Convert.ToDouble(sizeGb, CultureInfo.InvariantCulture)
            : (double?)null;
        var memoryTotalGb = await GetMemoryFromVmSizeAsync(vm, cancellationToken);
        var networkInsights = await GetNetworkInsightsAsync(vm, cancellationToken);

        return new VmGuestInsights
        {
            OsLabel = osLabel,
            OsVersion = osVersion,
            MemoryTotalGb = memoryTotalGb,
            DiskTotalGb = diskTotalGb,
            PrivateIpAddress = networkInsights.PrivateIpAddress,
            PublicIpAddress = networkInsights.PublicIpAddress
        };
    }

    private VirtualMachineResource CreateVirtualMachineResource(string vmName)
    {
        var client = _armClient.Value;
        var subId = SettingsHelper.GetEnv("AZURE_SUBSCRIPTION_ID");
        var rgName = SettingsHelper.GetEnv("AZURE_RESOURCE_GROUP");

        if (string.IsNullOrEmpty(subId) || string.IsNullOrEmpty(rgName))
        {
            throw new InvalidOperationException("AZURE_SUBSCRIPTION_ID and AZURE_RESOURCE_GROUP must be configured.");
        }

        var id = Azure.ResourceManager.Compute.VirtualMachineResource.CreateResourceIdentifier(subId, rgName, vmName);
        return client.GetVirtualMachineResource(id);
    }



    private SubscriptionResource CreateSubscriptionResource()
    {
        var subId = SettingsHelper.GetEnv("AZURE_SUBSCRIPTION_ID");
        if (string.IsNullOrWhiteSpace(subId))
        {
            throw new InvalidOperationException("AZURE_SUBSCRIPTION_ID must be configured.");
        }

        return _armClient.Value.GetSubscriptionResource(new ResourceIdentifier($"/subscriptions/{subId}"));
    }

    private static RunCommandInput BuildGuestInsightsCommand(string osType)
    {
        var isWindows = osType.Equals("Windows", StringComparison.OrdinalIgnoreCase);
        var input = new RunCommandInput(isWindows ? "RunPowerShellScript" : "RunShellScript");

        if (isWindows)
        {
            input.Script.Add("$os = Get-CimInstance Win32_OperatingSystem");
            input.Script.Add("$computer = Get-CimInstance Win32_ComputerSystem");
            input.Script.Add("$disk = Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='C:'\"");
            input.Script.Add("Write-Output (\"SIEM_MEMORY_TOTAL_GB=\" + [math]::Round(($computer.TotalPhysicalMemory / 1GB), 1))");
            input.Script.Add("Write-Output (\"SIEM_MEMORY_USED_GB=\" + [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1MB), 1))");
            input.Script.Add("if ($disk -ne $null) {");
            input.Script.Add("  Write-Output (\"SIEM_DISK_USED_GB=\" + [math]::Round((($disk.Size - $disk.FreeSpace) / 1GB), 1))");
            input.Script.Add("  Write-Output (\"SIEM_DISK_TOTAL_GB=\" + [math]::Round(($disk.Size / 1GB), 1))");
            input.Script.Add("}");
        }
        else
        {
            input.Script.Add("MEM_TOTAL_KB=$(awk '/MemTotal/ {print $2}' /proc/meminfo)");
            input.Script.Add("MEM_AVAILABLE_KB=$(awk '/MemAvailable/ {print $2}' /proc/meminfo)");
            input.Script.Add("DISK_USED_BYTES=$(df -B1 / --output=used | tail -1 | tr -d ' ')");
            input.Script.Add("DISK_TOTAL_BYTES=$(df -B1 / --output=size | tail -1 | tr -d ' ')");
            input.Script.Add("if [ -n \"$MEM_TOTAL_KB\" ]; then awk \"BEGIN { printf \\\"SIEM_MEMORY_TOTAL_GB=%.1f\\\\n\\\", $MEM_TOTAL_KB / 1024 / 1024 }\"; fi");
            input.Script.Add("if [ -n \"$MEM_TOTAL_KB\" ] && [ -n \"$MEM_AVAILABLE_KB\" ]; then awk \"BEGIN { printf \\\"SIEM_MEMORY_USED_GB=%.1f\\\\n\\\", ($MEM_TOTAL_KB - $MEM_AVAILABLE_KB) / 1024 / 1024 }\"; fi");
            input.Script.Add("if [ -n \"$DISK_USED_BYTES\" ]; then awk \"BEGIN { printf \\\"SIEM_DISK_USED_GB=%.1f\\\\n\\\", $DISK_USED_BYTES / 1024 / 1024 / 1024 }\"; fi");
            input.Script.Add("if [ -n \"$DISK_TOTAL_BYTES\" ]; then awk \"BEGIN { printf \\\"SIEM_DISK_TOTAL_GB=%.1f\\\\n\\\", $DISK_TOTAL_BYTES / 1024 / 1024 / 1024 }\"; fi");
        }

        return input;
    }

    private static VmGuestInsights ParseGuestInsights(string output, VmGuestInsights fallback)
    {
        string osLabel = fallback.OsLabel;
        string osVersion = fallback.OsVersion;
        string privateIpAddress = fallback.PrivateIpAddress;
        string publicIpAddress = fallback.PublicIpAddress;
        double? memoryUsedGb = fallback.MemoryUsedGb;
        double? memoryTotalGb = fallback.MemoryTotalGb;
        double? diskUsedGb = fallback.DiskUsedGb;
        double? diskTotalGb = fallback.DiskTotalGb;

        foreach (var rawLine in output.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var line = rawLine.Trim();
            if (!line.StartsWith("SIEM_", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var separatorIndex = line.IndexOf('=');
            if (separatorIndex <= 0)
            {
                continue;
            }

            var key = line[..separatorIndex];
            var value = line[(separatorIndex + 1)..].Trim();

            switch (key)
            {
                case "SIEM_OS_LABEL":
                    osLabel = FirstNonEmpty(value, osLabel);
                    break;
                case "SIEM_OS_VERSION":
                    osVersion = FirstNonEmpty(value, osVersion);
                    break;
                case "SIEM_MEMORY_USED_GB":
                    memoryUsedGb = ParseNullableDouble(value) ?? memoryUsedGb;
                    break;
                case "SIEM_MEMORY_TOTAL_GB":
                    memoryTotalGb = ParseNullableDouble(value) ?? memoryTotalGb;
                    break;
                case "SIEM_DISK_USED_GB":
                    diskUsedGb = ParseNullableDouble(value) ?? diskUsedGb;
                    break;
                case "SIEM_DISK_TOTAL_GB":
                    diskTotalGb = ParseNullableDouble(value) ?? diskTotalGb;
                    break;
            }
        }

        return new VmGuestInsights
        {
            OsLabel = osLabel,
            OsVersion = osVersion,
            PrivateIpAddress = privateIpAddress,
            PublicIpAddress = publicIpAddress,
            MemoryUsedGb = memoryUsedGb,
            MemoryTotalGb = memoryTotalGb,
            DiskUsedGb = diskUsedGb,
            DiskTotalGb = diskTotalGb
        };
    }

    private static double? ParseNullableDouble(string value)
    {
        if (double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed))
        {
            return parsed;
        }

        return null;
    }

    private async Task<double?> GetMemoryFromVmSizeAsync(VirtualMachineResource vm, CancellationToken cancellationToken)
    {
        var vmSize = vm.Data.HardwareProfile?.VmSize?.ToString();
        if (string.IsNullOrWhiteSpace(vmSize))
        {
            return null;
        }

        var cacheKey = $"{vm.Data.Location}:{vmSize}";
        if (_vmMemoryCache.TryGetValue(cacheKey, out var cached))
        {
            return cached;
        }

        try
        {
            var subscription = CreateSubscriptionResource();
            VirtualMachineSize? size = null;

            await foreach (var item in subscription.GetVirtualMachineSizesAsync(vm.Data.Location, cancellationToken))
            {
                if (string.Equals(item.Name, vmSize, StringComparison.OrdinalIgnoreCase))
                {
                    size = item;
                    break;
                }
            }

            var memoryTotalGb = size?.MemoryInMB is int memoryInMb
                ? Math.Round(memoryInMb / 1024d, 1)
                : (double?)null;

            _vmMemoryCache[cacheKey] = memoryTotalGb;
            return memoryTotalGb;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Unable to resolve memory size for VM size {VmSize} in {Location}.", vmSize, vm.Data.Location);
            return null;
        }
    }

    private async Task<NetworkInsights> GetNetworkInsightsAsync(VirtualMachineResource vm, CancellationToken cancellationToken)
    {
        if (_networkInsightsCache.TryGetValue(vm.Data.Name, out var cached) &&
            DateTimeOffset.UtcNow - cached.CapturedAtUtc < NetworkInsightsCacheDuration)
        {
            return cached.Data;
        }

        var privateAddresses = new List<string>();
        var publicAddresses = new List<string>();
        var client = _armClient.Value;

        foreach (var nicReference in vm.Data.NetworkProfile?.NetworkInterfaces ?? [])
        {
            if (nicReference.Id is null)
            {
                continue;
            }

            try
            {
                var nic = client.GetNetworkInterfaceResource(nicReference.Id);
                var nicData = (await nic.GetAsync(cancellationToken: cancellationToken)).Value.Data;

                foreach (var ipConfiguration in nicData.IPConfigurations)
                {
                    AddDistinct(privateAddresses, ipConfiguration.PrivateIPAddress);

                    if (ipConfiguration.PublicIPAddress?.Id is not null)
                    {
                        var publicIp = client.GetPublicIPAddressResource(ipConfiguration.PublicIPAddress.Id);
                        var publicIpData = (await publicIp.GetAsync(cancellationToken: cancellationToken)).Value.Data;
                        AddDistinct(publicAddresses, publicIpData.IPAddress);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Unable to retrieve network details for VM {VmName}.", vm.Data.Name);
            }
        }

        var result = new NetworkInsights(
            privateAddresses.Count > 0 ? string.Join(", ", privateAddresses) : string.Empty,
            publicAddresses.Count > 0 ? string.Join(", ", publicAddresses) : string.Empty);

        _networkInsightsCache[vm.Data.Name] = new CachedNetworkInsights(result, DateTimeOffset.UtcNow);
        return result;
    }

    private static string FirstNonEmpty(params string?[] values)
    {
        return values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim() ?? string.Empty;
    }

    private static void AddDistinct(List<string> values, string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return;
        }

        if (!values.Contains(value, StringComparer.OrdinalIgnoreCase))
        {
            values.Add(value.Trim());
        }
    }

    private sealed record CachedGuestInsights(VmGuestInsights Data, DateTimeOffset CapturedAtUtc);
    private sealed record CachedNetworkInsights(NetworkInsights Data, DateTimeOffset CapturedAtUtc);
}

public sealed class VmGuestInsights
{
    public string OsLabel { get; init; } = string.Empty;
    public string OsVersion { get; init; } = string.Empty;
    public string PrivateIpAddress { get; init; } = string.Empty;
    public string PublicIpAddress { get; init; } = string.Empty;
    public double? MemoryUsedGb { get; init; }
    public double? MemoryTotalGb { get; init; }
    public double? DiskUsedGb { get; init; }
    public double? DiskTotalGb { get; init; }
}

public sealed record NetworkInsights(string PrivateIpAddress, string PublicIpAddress);
