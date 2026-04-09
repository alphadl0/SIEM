using Azure.Identity;
using Azure.Monitor.Query;
using Azure.Monitor.Query.Models;
using Azure.ResourceManager;
using Azure.ResourceManager.Resources;
using Azure.ResourceManager.Sql;
using Azure.ResourceManager.Sql.Models;
using Azure.Core;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace backend.src.pollers;

public class SqlStatusPoller : BackgroundService
{
    private readonly IHubContext<SiemHub> _hubContext;
    private readonly ILogger<SqlStatusPoller> _logger;
    private readonly DefaultAzureCredential _credential;

    public SqlStatusPoller(IHubContext<SiemHub> hubContext, ILogger<SqlStatusPoller> logger, DefaultAzureCredential credential)
    {
        _hubContext = hubContext;
        _logger = logger;
        _credential = credential;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var credential = _credential;
        ArmClient client = new ArmClient(credential);
        var subId = Environment.GetEnvironmentVariable("AZURE_SUBSCRIPTION_ID")?.Trim().Replace("\r", "").Replace("\n", "");
        var rgName = Environment.GetEnvironmentVariable("AZURE_RESOURCE_GROUP")?.Trim().Replace("\r", "").Replace("\n", "");
        
        while (!stoppingToken.IsCancellationRequested)
        {
            if (!string.IsNullOrEmpty(subId) && !string.IsNullOrEmpty(rgName))
            {
                try
                {
                    _logger.LogInformation("Polling SQL status for Subscription: {sub} / RG: {rg}", subId, rgName);
                    ResourceIdentifier rgId = ResourceGroupResource.CreateResourceIdentifier(subId, rgName);
                    ResourceGroupResource rg = client.GetResourceGroupResource(rgId);
                    
                    int sqlCount = 0;
                    await foreach (var sqlServer in rg.GetSqlServers().GetAllAsync(cancellationToken: stoppingToken))
                    {
                        try
                        {
                            sqlCount++;
                            var status = sqlServer.Data.State ?? "Ready";
                            if (status.Equals("Ready", StringComparison.OrdinalIgnoreCase)) status = "Online";
                            
                            // Publish the Server
                            await _hubContext.Clients.Group("security-team").SendAsync("sqlStatus", new
                            {
                                name = sqlServer.Data.Name,
                                type = "SQL Server",
                                status = status,
                                location = sqlServer.Data.Location.DisplayName,
                                size = sqlServer.Data.Version ?? "Unknown Version",
                                publicIpAddress = sqlServer.Data.FullyQualifiedDomainName ?? "Unknown FQDN"
                            }, stoppingToken);

                            // SQL Databases
                            // Removed MetricsQueryClient initialization as we no longer query database storage on this loop
                            await foreach (var db in sqlServer.GetSqlDatabases().GetAllAsync(cancellationToken: stoppingToken))
                            {
                                if (db.Data.Name.Equals("master", StringComparison.OrdinalIgnoreCase)) continue;

                                sqlCount++;
                                var dbStatus = db.Data.Status?.ToString() ?? "Online";
                                double? usedSpaceGb = null;

                                if (dbStatus.Equals("Online", StringComparison.OrdinalIgnoreCase))
                                {
                                    // Removed slow MetricsQueryClient call as storage used is not strictly critical for 
                                    // real-time SIEM alerts and caused polling delays.
                                }

                                await _hubContext.Clients.Group("security-team").SendAsync("sqlStatus", new
                                {
                                    name = $"{sqlServer.Data.Name}/{db.Data.Name}",
                                    type = "SQL Database",
                                    status = dbStatus,
                                    location = db.Data.Location.DisplayName,
                                    size = db.Data.Sku != null ? $"{db.Data.Sku.Name}" + (db.Data.Sku.Capacity.HasValue ? $"_{db.Data.Sku.Capacity.Value}" : "") : "Unknown SKU",
                                    diskUsedGb = usedSpaceGb,
                                    diskTotalGb = db.Data.MaxSizeBytes.HasValue ? Math.Round((double)db.Data.MaxSizeBytes.Value / Math.Pow(1024, 3), 2) : (double?)null
                                }, stoppingToken);
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Unable to refresh SQL Server status for {sqlName}.", sqlServer.Data.Name);
                        }
                    }

                    _logger.LogInformation("Found {sqlCount} SQL Assets in {rg}", sqlCount, rgName);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "CRITICAL: Asset Poller failure for RG {rg}.", rgName);
                }
            }

            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        }
    }
}