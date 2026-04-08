using Azure.Monitor.Query;
using backend.src;
using backend.src.queries;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace backend.src.services;

public class AlertHistoryService
{
    private readonly LogsQueryClient _client;
    private readonly AlertEngine _alertEngine;
    private readonly ILogger<AlertHistoryService> _logger;
    private readonly string _workspaceId;
    private readonly SemaphoreSlim _hydrateLock = new(1, 1);
    private volatile bool _isHydrated;

    public AlertHistoryService(
        LogsQueryClient client,
        AlertEngine alertEngine,
        IConfiguration configuration,
        ILogger<AlertHistoryService> logger)
    {
        _client = client;
        _alertEngine = alertEngine;
        _logger = logger;
        _workspaceId = (configuration["LOG_ANALYTICS_WORKSPACE_ID"] ?? Environment.GetEnvironmentVariable("LOG_ANALYTICS_WORKSPACE_ID") ?? string.Empty)
            .Trim()
            .Replace("\r", string.Empty)
            .Replace("\n", string.Empty);
    }

    public async Task<PagedResult<Alert>> GetPagedAlertsAsync(int page, int pageSize, string? searchTerm = null, string? severity = null, bool? excludeAzure = null, CancellationToken cancellationToken = default)
    {
        await EnsureHydratedAsync(cancellationToken);
        return _alertEngine.GetRecentAlertsPage(page, pageSize, searchTerm, severity, excludeAzure);
    }

    private async Task<Azure.Response<Azure.Monitor.Query.Models.LogsQueryResult>?> SafeQueryAsync(LogsQueryClient client, string workspaceId, string query, QueryTimeRange timeRange, CancellationToken ct)
    {
        try
        {
            return await client.QueryWorkspaceAsync(workspaceId, query, timeRange, cancellationToken: ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to query workspace for historical alerts.");
            return null;
        }
    }

    private async Task EnsureHydratedAsync(CancellationToken cancellationToken)
    {
        if (_isHydrated || string.IsNullOrWhiteSpace(_workspaceId))
        {
            return;
        }

        await _hydrateLock.WaitAsync(cancellationToken);
        try
        {
            if (_isHydrated)
            {
                return;
            }

            var timeRange = new QueryTimeRange(TimeSpan.FromHours(1));
            var results = await Task.WhenAll(
                SafeQueryAsync(_client, _workspaceId, SecurityEventQueries.GetQuery(), timeRange, cancellationToken),
                SafeQueryAsync(_client, _workspaceId, SyslogQueries.GetQuery(), timeRange, cancellationToken),
                SafeQueryAsync(_client, _workspaceId, WindowsEventQueries.GetQuery(), timeRange, cancellationToken),
                SafeQueryAsync(_client, _workspaceId, LinuxAuditQueries.GetQuery(), timeRange, cancellationToken),
                SafeQueryAsync(_client, _workspaceId, SigninLogsQueries.GetQuery(), timeRange, cancellationToken),
                SafeQueryAsync(_client, _workspaceId, AuditLogsQueries.GetQuery(), timeRange, cancellationToken),
                SafeQueryAsync(_client, _workspaceId, AADRiskyUsersQueries.GetQuery(), timeRange, cancellationToken),
                SafeQueryAsync(_client, _workspaceId, AADUserRiskEventsQueries.GetQuery(), timeRange, cancellationToken),
                SafeQueryAsync(_client, _workspaceId, AzureActivityQueries.GetQuery(), timeRange, cancellationToken)
            );

            if (results[0] != null) foreach (var row in results[0].Value.Table.Rows)
            {
                await _alertEngine.ProcessSecurityEventAsync(
                    GetTimestamp(row["TimeGenerated"]),
                    row["Computer"]?.ToString() ?? string.Empty,
                    Convert.ToInt32(row["EventID"]),
                    row["Account"]?.ToString() ?? string.Empty,
                    row["IpAddress"]?.ToString() ?? string.Empty,
                    row["TargetAccount"]?.ToString() ?? string.Empty,
                    row["NewProcessName"]?.ToString() ?? string.Empty,
                    row["MemberName"]?.ToString() ?? string.Empty,
                    cancellationToken,
                    broadcast: false);
            }

            if (results[1] != null) foreach (var row in results[1].Value.Table.Rows)
            {
                await _alertEngine.ProcessSyslogAsync(
                    GetTimestamp(row["TimeGenerated"]),
                    row["HostName"]?.ToString() ?? string.Empty,
                    row["SyslogMessage"]?.ToString() ?? string.Empty,
                    row["SeverityLevel"]?.ToString() ?? string.Empty,
                    cancellationToken,
                    broadcast: false);
            }

            if (results[2] != null) foreach (var row in results[2].Value.Table.Rows)
            {
                await _alertEngine.ProcessWindowsEventAsync(
                    GetTimestamp(row["TimeGenerated"]),
                    row["Computer"]?.ToString() ?? string.Empty,
                    Convert.ToInt32(row["EventID"]),
                    row["RenderedDescription"]?.ToString() ?? string.Empty,
                    cancellationToken,
                    broadcast: false);
            }

            if (results[3] != null) foreach (var row in results[3].Value.Table.Rows)
            {
                await _alertEngine.ProcessLinuxAuditAsync(
                    GetTimestamp(row["TimeGenerated"]),
                    row["Computer"]?.ToString() ?? string.Empty,
                    row["RawData"]?.ToString() ?? string.Empty,
                    cancellationToken,
                    broadcast: false);
            }

            if (results[4] != null) foreach (var row in results[4].Value.Table.Rows)
            {
                await _alertEngine.ProcessSigninLogAsync(
                    GetTimestamp(row["TimeGenerated"]),
                    row["UserPrincipalName"]?.ToString() ?? string.Empty,
                    row["IPAddress"]?.ToString() ?? string.Empty,
                    row["AppDisplayName"]?.ToString() ?? string.Empty,
                    row["Location"]?.ToString() ?? string.Empty,
                    row["DeviceDetail"]?.ToString() ?? string.Empty,
                    row["ConditionalAccessStatus"]?.ToString() ?? string.Empty,
                    row["ResultType"]?.ToString() ?? string.Empty,
                    row["ResultDescription"]?.ToString() ?? string.Empty,
                    cancellationToken,
                    broadcast: false);
            }

            if (results[5] != null) foreach (var row in results[5].Value.Table.Rows)
            {
                await _alertEngine.ProcessAuditLogAsync(
                    GetTimestamp(row["TimeGenerated"]),
                    row["ActivityDisplayName"]?.ToString() ?? string.Empty,
                    row["Category"]?.ToString() ?? string.Empty,
                    row["Identity"]?.ToString() ?? string.Empty,
                    row["LoggedByService"]?.ToString() ?? string.Empty,
                    row["Result"]?.ToString() ?? string.Empty,
                    row["ResultDescription"]?.ToString() ?? string.Empty,
                    row["TargetResources"]?.ToString() ?? string.Empty,
                    cancellationToken,
                    broadcast: false);
            }

            if (results[6] != null) foreach (var row in results[6].Value.Table.Rows)
            {
                await _alertEngine.ProcessRiskyUserAsync(
                    GetTimestamp(row["TimeGenerated"]),
                    row["UserPrincipalName"]?.ToString() ?? string.Empty,
                    row["UserDisplayName"]?.ToString() ?? string.Empty,
                    row["RiskLevel"]?.ToString() ?? string.Empty,
                    row["RiskState"]?.ToString() ?? string.Empty,
                    row["RiskDetail"]?.ToString() ?? string.Empty,
                    cancellationToken,
                    broadcast: false);
            }

            if (results[7] != null) foreach (var row in results[7].Value.Table.Rows)
            {
                await _alertEngine.ProcessUserRiskEventAsync(
                    GetTimestamp(row["TimeGenerated"]),
                    row["UserPrincipalName"]?.ToString() ?? string.Empty,
                    row["UserDisplayName"]?.ToString() ?? string.Empty,
                    row["RiskEventType"]?.ToString() ?? string.Empty,
                    row["RiskLevel"]?.ToString() ?? string.Empty,
                    row["RiskState"]?.ToString() ?? string.Empty,
                    row["RiskDetail"]?.ToString() ?? string.Empty,
                    row["IpAddress"]?.ToString() ?? string.Empty,
                    row["Location"]?.ToString() ?? string.Empty,
                    cancellationToken,
                    broadcast: false);
            }

            if (results[8] != null) foreach (var row in results[8].Value.Table.Rows)
            {
                await _alertEngine.ProcessAzureActivityLogAsync(
                    GetTimestamp(row["TimeGenerated"]),
                    row["Caller"]?.ToString() ?? string.Empty,
                    row["OperationNameValue"]?.ToString() ?? string.Empty,
                    row["_ResourceId"]?.ToString() ?? string.Empty,
                    row["ActivityStatusValue"]?.ToString() ?? string.Empty,
                    $"IP: {row["CallerIpAddress"]?.ToString() ?? "Unknown"}",
                    cancellationToken,
                    broadcast: false);
            }

            _isHydrated = true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unable to hydrate historical alerts from Log Analytics.");
        }
        finally
        {
            _hydrateLock.Release();
        }
    }

    private static DateTime GetTimestamp(object? value)
    {
        return value switch
        {
            DateTimeOffset offset => offset.UtcDateTime,
            DateTime timestamp when timestamp.Kind == DateTimeKind.Utc => timestamp,
            DateTime timestamp when timestamp.Kind == DateTimeKind.Local => timestamp.ToUniversalTime(),
            DateTime timestamp => DateTime.SpecifyKind(timestamp, DateTimeKind.Utc),
            _ => DateTime.UtcNow
        };
    }
}
