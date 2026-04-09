using System;
using System.Threading;
using System.Threading.Tasks;
using Azure.Monitor.Query;
using Azure.Monitor.Query.Models;
using Microsoft.Extensions.Logging;

namespace backend.src.helpers;

/// <summary>
/// Shared safe-query wrapper used by pollers and hydration services.
/// Returns null on failure instead of throwing, with structured warning logs.
/// Previously duplicated in LogAnalyticsPoller and AlertHistoryService.
/// </summary>
public static class SafeQueryHelper
{
    private static readonly LogsQueryOptions DefaultOptions = new()
    {
        ServerTimeout = TimeSpan.FromSeconds(30)
    };

    public static async Task<Azure.Response<LogsQueryResult>?> QueryAsync(
        LogsQueryClient client,
        string workspaceId,
        string query,
        QueryTimeRange timeRange,
        ILogger logger,
        CancellationToken cancellationToken,
        LogsQueryOptions? options = null)
    {
        try
        {
            return await client.QueryWorkspaceAsync(
                workspaceId,
                query,
                timeRange,
                options ?? DefaultOptions,
                cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to query Log Analytics workspace.");
            return null;
        }
    }
}
