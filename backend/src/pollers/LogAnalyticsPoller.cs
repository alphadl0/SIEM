using Azure.Identity;
using Azure.Monitor.Query;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using backend.src.queries;
using backend.src.helpers;
using System.Collections.Concurrent;
using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace backend.src.pollers;

public class LogAnalyticsPoller : BackgroundService
{
    private readonly IHubContext<SiemHub> _hubContext;
    private readonly ILogger<LogAnalyticsPoller> _logger;
    private readonly AlertEngine _alertEngine;
    private readonly LogsQueryClient _client;
    private readonly string _workspaceId;
    private readonly ConcurrentDictionary<string, DateTime> _processedKeys = new();
    private DateTime _lastKeyCleanupUtc = DateTime.MinValue;

    public LogAnalyticsPoller(IHubContext<SiemHub> hubContext, ILogger<LogAnalyticsPoller> logger, AlertEngine alertEngine, LogsQueryClient client)
    {
        _hubContext = hubContext;
        _logger = logger;
        _alertEngine = alertEngine;
        _client = client;
        _workspaceId = (Environment.GetEnvironmentVariable("LOG_ANALYTICS_WORKSPACE_ID") ?? "").Trim().Replace("\r", "").Replace("\n", "");
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var client = _client;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (!string.IsNullOrEmpty(_workspaceId))
                {
                    var timeRange = new QueryTimeRange(TimeSpan.FromMinutes(25)); // Slightly longer to ensure no gaps at 10s poll

                    var results = await Task.WhenAll(
                        SafeQueryAsync(client, _workspaceId, SecurityEventQueries.GetQuery(), timeRange, stoppingToken),
                        SafeQueryAsync(client, _workspaceId, SyslogQueries.GetQuery(), timeRange, stoppingToken),
                        SafeQueryAsync(client, _workspaceId, WindowsEventQueries.GetQuery(), timeRange, stoppingToken),
                        SafeQueryAsync(client, _workspaceId, LinuxAuditQueries.GetQuery(), timeRange, stoppingToken),
                        SafeQueryAsync(client, _workspaceId, AzureActivityQueries.GetQuery(), timeRange, stoppingToken),
                        SafeQueryAsync(client, _workspaceId, SigninLogsQueries.GetQuery(), timeRange, stoppingToken)
                    );

                    // 1. Process SecurityEvents
                    var secEvents = results[0]?.Value?.Table;
                    if (secEvents != null) {
                    foreach (var row in secEvents.Rows) {
                        if (!ShouldProcess("SecurityEvent",
                            row["TimeGenerated"],
                            row["Computer"],
                            row["EventID"],
                            row["Account"],
                            row["IpAddress"],
                            row["TargetAccount"],
                            row["NewProcessName"],
                            row["MemberName"]))
                        {
                            continue;
                        }

                        await _alertEngine.ProcessSecurityEventAsync(
                            GetTimestamp(row["TimeGenerated"]),
                            row["Computer"]?.ToString() ?? "",
                            Convert.ToInt32(row["EventID"]),
                            row["Account"]?.ToString() ?? "",
                            row["IpAddress"]?.ToString() ?? "",
                            row["TargetAccount"]?.ToString() ?? "",
                            row["NewProcessName"]?.ToString() ?? "",
                            row["MemberName"]?.ToString() ?? "",
                            stoppingToken
                        );
                    }
                    }

                    // 2. Process Syslog
                    var syslogs = results[1]?.Value?.Table;
                    if (syslogs != null) {
                    foreach (var row in syslogs.Rows) {
                        if (!ShouldProcess("Syslog",
                            row["TimeGenerated"],
                            row["HostName"],
                            row["ProcessName"],
                            row["SyslogMessage"]))
                        {
                            continue;
                        }

                        await _alertEngine.ProcessSyslogAsync(
                            GetTimestamp(row["TimeGenerated"]),
                            row["HostName"]?.ToString() ?? "",
                            row["SyslogMessage"]?.ToString() ?? "",
                            row["SeverityLevel"]?.ToString() ?? "",
                            stoppingToken
                        );
                    }
                    }

                    // 3. Process Windows Events
                    var winEvents = results[2]?.Value?.Table;
                    if (winEvents != null) {
                    foreach (var row in winEvents.Rows) {
                        if (!ShouldProcess("WindowsEvent",
                            row["TimeGenerated"],
                            row["Computer"],
                            row["EventID"],
                            row["RenderedDescription"]))
                        {
                            continue;
                        }

                        await _alertEngine.ProcessWindowsEventAsync(
                            GetTimestamp(row["TimeGenerated"]),
                            row["Computer"]?.ToString() ?? "",
                            Convert.ToInt32(row["EventID"]),
                            row["RenderedDescription"]?.ToString() ?? "",       
                            stoppingToken
                        );
                    }
                    }

                    // 4. Process Linux Audit
                    var linuxAudits = results[3]?.Value?.Table;
                    if (linuxAudits != null) {
                    foreach (var row in linuxAudits.Rows) {
                        if (!ShouldProcess("LinuxAudit",
                            row["TimeGenerated"],
                            row["Computer"],
                            row["ResourceId"],
                            row["RawData"]))
                        {
                            continue;
                        }

                        await _alertEngine.ProcessLinuxAuditAsync(
                            GetTimestamp(row["TimeGenerated"]),
                            row["Computer"]?.ToString() ?? "",
                            row["RawData"]?.ToString() ?? "",
                            stoppingToken
                        );
                    }
                    }

                    // 5. Process Azure Activity
                    var azureActivities = results[4]?.Value?.Table;
                    if (azureActivities != null) {
                    foreach (var row in azureActivities.Rows) {
                        if (!ShouldProcess("AzureActivity",
                            row["TimeGenerated"],
                            row["Caller"],
                            row["OperationNameValue"],
                            row["_ResourceId"],
                            row["ActivityStatusValue"]))
                        {
                            continue;
                        }

                        await _alertEngine.ProcessAzureActivityLogAsync(        
                            GetTimestamp(row["TimeGenerated"]),
                            row["Caller"]?.ToString() ?? "",
                            row["OperationNameValue"]?.ToString() ?? "",        
                            row["_ResourceId"]?.ToString() ?? "",
                            row["ActivityStatusValue"]?.ToString() ?? "",       
                            row["CallerIpAddress"]?.ToString() ?? "Unknown",
                            stoppingToken
                        );
                    }
                    }

                    // 6. Process Signin Logs
                    var signinLogs = results[5]?.Value?.Table;
                    if (signinLogs != null) {
                    foreach (var row in signinLogs.Rows) {
                        if (!ShouldProcess("SigninLogs",
                            row["TimeGenerated"],
                            row["UserPrincipalName"],
                            row["IPAddress"],
                            row["AppDisplayName"]))
                        {
                            continue;
                        }

                        await _alertEngine.ProcessSigninLogAsync(
                            GetTimestamp(row["TimeGenerated"]),
                            row["UserPrincipalName"]?.ToString() ?? "",
                            row["IPAddress"]?.ToString() ?? "",
                            row["AppDisplayName"]?.ToString() ?? "",
                            row["Location"]?.ToString() ?? "",
                            row["DeviceDetail"]?.ToString() ?? "",
                            row["ConditionalAccessStatus"]?.ToString() ?? "",   
                            row["ResultType"]?.ToString() ?? "",
                            row["ResultDescription"]?.ToString() ?? "",
                            stoppingToken
                        );
                    }
                    }

                    await _hubContext.Clients.Group("security-team").SendAsync("pollStatus", new { status = "success", timestamp = DateTime.UtcNow }, stoppingToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error querying log analytics.");
            }

            await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
        }
    }

    private bool ShouldProcess(string source, params object?[] keyParts)
    {
        CleanupProcessedKeys();

        var fingerprint = string.Join("|", keyParts.Select(part => part?.ToString()?.Trim() ?? string.Empty));
        if (string.IsNullOrWhiteSpace(fingerprint))
        {
            return false;
        }

        return _processedKeys.TryAdd($"{source}|{fingerprint}", DateTime.UtcNow);
    }

    private async Task<Azure.Response<Azure.Monitor.Query.Models.LogsQueryResult>?> SafeQueryAsync(LogsQueryClient client, string workspaceId, string query, QueryTimeRange timeRange, CancellationToken ct)
    {
        try
        {
            return await client.QueryWorkspaceAsync(workspaceId, query, timeRange, cancellationToken: ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Poller failed to query workspace.");
            return null;
        }
    }

    private void CleanupProcessedKeys()
    {
        var now = DateTime.UtcNow;
        if (now - _lastKeyCleanupUtc < TimeSpan.FromMinutes(5))
        {
            return;
        }

        _lastKeyCleanupUtc = now;
        var cutoff = now - TimeSpan.FromHours(1);

        foreach (var item in _processedKeys)
        {
            if (item.Value < cutoff)
            {
                _processedKeys.TryRemove(item.Key, out _);
            }
        }
    }

    private static DateTime GetTimestamp(object? value)
    {
        return TimestampHelper.GetTimestamp(value);
    }
}
