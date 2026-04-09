using Azure.Monitor.Query;
using backend.src;
using backend.src.queries;
using backend.src.helpers;
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
        _workspaceId = SettingsHelper.Get(configuration, "LOG_ANALYTICS_WORKSPACE_ID");
    }

    public async Task<PagedResult<Alert>> GetPagedAlertsAsync(int page, int pageSize, bool? excludeAzure = null, CancellationToken cancellationToken = default)
    {
        await EnsureHydratedAsync(cancellationToken);
        return _alertEngine.GetRecentAlertsPage(page, pageSize, excludeAzure);
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
                SafeQueryHelper.QueryAsync(_client, _workspaceId, SecurityEventQueries.GetQuery(), timeRange, _logger, cancellationToken),
                SafeQueryHelper.QueryAsync(_client, _workspaceId, SyslogQueries.GetQuery(), timeRange, _logger, cancellationToken),
                SafeQueryHelper.QueryAsync(_client, _workspaceId, WindowsEventQueries.GetQuery(), timeRange, _logger, cancellationToken),
                SafeQueryHelper.QueryAsync(_client, _workspaceId, LinuxAuditQueries.GetQuery(), timeRange, _logger, cancellationToken),
                SafeQueryHelper.QueryAsync(_client, _workspaceId, SigninLogsQueries.GetQuery(), timeRange, _logger, cancellationToken),
                SafeQueryHelper.QueryAsync(_client, _workspaceId, AuditLogsQueries.GetQuery(), timeRange, _logger, cancellationToken),
                SafeQueryHelper.QueryAsync(_client, _workspaceId, AzureActivityQueries.GetQuery(), timeRange, _logger, cancellationToken)
            );

            var securityEvents = results[0]?.Value?.Table?.Rows;
            if (securityEvents != null) foreach (var row in securityEvents)
            {
                await _alertEngine.ProcessSecurityEventAsync(
                    TimestampHelper.GetTimestamp(row["TimeGenerated"]),
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

            var syslogs = results[1]?.Value?.Table?.Rows;
            if (syslogs != null) foreach (var row in syslogs)
            {
                await _alertEngine.ProcessSyslogAsync(
                    TimestampHelper.GetTimestamp(row["TimeGenerated"]),
                    row["HostName"]?.ToString() ?? string.Empty,
                    row["SyslogMessage"]?.ToString() ?? string.Empty,
                    row["SeverityLevel"]?.ToString() ?? string.Empty,
                    cancellationToken,
                    broadcast: false);
            }

            var windowsEvents = results[2]?.Value?.Table?.Rows;
            if (windowsEvents != null) foreach (var row in windowsEvents)
            {
                await _alertEngine.ProcessWindowsEventAsync(
                    TimestampHelper.GetTimestamp(row["TimeGenerated"]),
                    row["Computer"]?.ToString() ?? string.Empty,
                    Convert.ToInt32(row["EventID"]),
                    row["RenderedDescription"]?.ToString() ?? string.Empty,
                    cancellationToken,
                    broadcast: false);
            }

            var linuxAudits = results[3]?.Value?.Table?.Rows;
            if (linuxAudits != null) foreach (var row in linuxAudits)
            {
                await _alertEngine.ProcessLinuxAuditAsync(
                    TimestampHelper.GetTimestamp(row["TimeGenerated"]),
                    row["Computer"]?.ToString() ?? string.Empty,
                    row["RawData"]?.ToString() ?? string.Empty,
                    cancellationToken,
                    broadcast: false);
            }

            var signinLogs = results[4]?.Value?.Table?.Rows;
            if (signinLogs != null) foreach (var row in signinLogs)
            {
                await _alertEngine.ProcessSigninLogAsync(
                    TimestampHelper.GetTimestamp(row["TimeGenerated"]),
                    row["UserPrincipalName"]?.ToString() ?? string.Empty,
                    row["IPAddress"]?.ToString() ?? string.Empty,
                    row["AppDisplayName"]?.ToString() ?? string.Empty,
                    row["Location"]?.ToString() ?? string.Empty,
                    row["DeviceDetail"]?.ToString() ?? string.Empty,
                    row["ConditionalAccessStatus"]?.ToString() ?? string.Empty,
                    row["ResultType"]?.ToString() ?? string.Empty,
                    cancellationToken,
                    broadcast: false);
            }

            var auditLogs = results[5]?.Value?.Table?.Rows;
            if (auditLogs != null) foreach (var row in auditLogs)
            {
                // Note: AuditLogsQueries.GetQuery() renames TimeGenerated to ActivityDateTime
                // Note: TargetResources is not projected by the query, so targets will be empty
                await _alertEngine.ProcessAuditLogAsync(
                    TimestampHelper.GetTimestamp(row["ActivityDateTime"]),
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

            var azureActivities = results[6]?.Value?.Table?.Rows;
            if (azureActivities != null) foreach (var row in azureActivities)
            {
                await _alertEngine.ProcessAzureActivityLogAsync(
                    TimestampHelper.GetTimestamp(row["TimeGenerated"]),
                    row["Caller"]?.ToString() ?? string.Empty,
                    row["OperationNameValue"]?.ToString() ?? string.Empty,
                    row["_ResourceId"]?.ToString() ?? string.Empty,
                    row["ActivityStatusValue"]?.ToString() ?? string.Empty,
                    row["CallerIpAddress"]?.ToString() ?? "Unknown",
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

}
