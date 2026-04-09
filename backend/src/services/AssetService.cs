using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Azure.Identity;
using Azure.ResourceManager;
using Azure.ResourceManager.Compute;
using Azure.ResourceManager.Sql;
using Azure.ResourceManager.Resources;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using backend.src.helpers;

namespace backend.src.services
{
    public class AssetService
    {
        private readonly DefaultAzureCredential _credential;
        private readonly VmRunCommandService _vmRunCommandService;
        private readonly IConfiguration _configuration;
        private readonly ILogger<AssetService> _logger;

        public AssetService(
            DefaultAzureCredential credential, 
            VmRunCommandService vmRunCommandService, 
            IConfiguration configuration, 
            ILogger<AssetService> logger)
        {
            _credential = credential;
            _vmRunCommandService = vmRunCommandService;
            _configuration = configuration;
            _logger = logger;
        }

        private string CleanSetting(string? value)
        {
            return value?.Trim().Replace("\r", "").Replace("\n", "") ?? string.Empty;
        }

        private string GetSetting(string key)
        {
            return _configuration[key] ?? Environment.GetEnvironmentVariable(key) ?? string.Empty;
        }

        private ResourceGroupResource? GetResourceGroup()
        {
            var subId = CleanSetting(GetSetting("AZURE_SUBSCRIPTION_ID"));
            var rgName = CleanSetting(GetSetting("AZURE_RESOURCE_GROUP"));

            if (string.IsNullOrWhiteSpace(subId) || string.IsNullOrWhiteSpace(rgName))
                return null;

            var client = new ArmClient(_credential);
            return client.GetResourceGroupResource(ResourceGroupResource.CreateResourceIdentifier(subId, rgName));
        }

        public async Task<List<object>> GetVmStatusesAsync(CancellationToken cancellationToken)
        {
            var resourceGroup = GetResourceGroup();
            if (resourceGroup == null) return new List<object>();

            var vmStatuses = new List<object>();

            await foreach (var vm in resourceGroup.GetVirtualMachines().GetAllAsync(cancellationToken: cancellationToken))
            {
                try
                {
                    var instanceView = await vm.InstanceViewAsync(cancellationToken: cancellationToken);
                    var guestInsights = await _vmRunCommandService.GetCachedOrFallbackGuestInsightsAsync(vm, cancellationToken);
                    var status = VmPowerStatusHelper.GetPowerStatus(instanceView.Value);

                    vmStatuses.Add(new
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
                        diskTotalGb = guestInsights.DiskTotalGb
                    });
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Unable to snapshot VM status for {VmName}.", vm.Data.Name);
                }
            }

            return vmStatuses;
        }

        public async Task<List<object>> GetSqlStatusesAsync(CancellationToken cancellationToken)
        {
            var resourceGroup = GetResourceGroup();
            if (resourceGroup == null) return new List<object>();

            var sqlStatuses = new List<object>();

            await foreach (var sqlServer in resourceGroup.GetSqlServers().GetAllAsync(cancellationToken: cancellationToken))
            {
                try
                {
                    var status = sqlServer.Data.State ?? "Ready";
                    sqlStatuses.Add(new
                    {
                        name = sqlServer.Data.Name,
                        type = "SQL Server",
                        status = status,
                        location = sqlServer.Data.Location.DisplayName,
                        size = sqlServer.Data.Version ?? "Unknown Version",
                        publicIpAddress = sqlServer.Data.FullyQualifiedDomainName ?? "Unknown FQDN",
                        diskUsedGb = (double?)null,
                        diskTotalGb = (double?)null
                    });

                    await foreach (var db in sqlServer.GetSqlDatabases().GetAllAsync(cancellationToken: cancellationToken))
                    {
                        if (db.Data.Name.Equals("master", StringComparison.OrdinalIgnoreCase)) continue;

                        sqlStatuses.Add(new
                        {
                            name = $"{sqlServer.Data.Name}/{db.Data.Name}",
                            type = "SQL Database",
                            status = db.Data.Status?.ToString() ?? "Online",
                            location = db.Data.Location.DisplayName,
                            size = db.Data.Sku != null ? (!db.Data.Sku.Name.EndsWith("_" + db.Data.Sku.Capacity.ToString()) && db.Data.Sku.Capacity.HasValue ? $"{db.Data.Sku.Name}_{db.Data.Sku.Capacity}" : db.Data.Sku.Name) : "Unknown SKU",
                            diskUsedGb = (double?)null,
                            diskTotalGb = db.Data.MaxSizeBytes.HasValue ? Math.Round((double)db.Data.MaxSizeBytes.Value / Math.Pow(1024, 3), 2) : (double?)null
                        });
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Unable to snapshot SQL status for {SqlName}.", sqlServer.Data.Name);
                }
            }

            return sqlStatuses;
        }
    }
}