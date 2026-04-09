using System;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading;
using System.Threading.Tasks;
using Azure.Core;
using Azure.Identity;
using Azure.Monitor.Query;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using backend.src.helpers;
using backend.src.queries;

namespace backend.src.services
{
    public class LogQueryService
    {
        private static readonly LogsQueryOptions QueryOptions = new()
        {
            ServerTimeout = TimeSpan.FromSeconds(30)
        };

        private readonly LogsQueryClient _client;
        private readonly DefaultAzureCredential _credential;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _configuration;
        private readonly ILogger<LogQueryService> _logger;

        public LogQueryService(
            LogsQueryClient client,
            DefaultAzureCredential credential,
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            ILogger<LogQueryService> logger)
        {
            _client = client;
            _credential = credential;
            _httpClientFactory = httpClientFactory;
            _configuration = configuration;
            _logger = logger;
        }

        public async Task<object?> GetSigninLogsAsync(int? page, int? pageSize, CancellationToken cancellationToken)
        {
            var workspaceId = SettingsHelper.Get(_configuration, "LOG_ANALYTICS_WORKSPACE_ID");
            if (string.IsNullOrWhiteSpace(workspaceId)) return null;

            var normalizedPage = QueryHelper.NormalizePage(page);
            var normalizedPageSize = QueryHelper.NormalizePageSize(pageSize, 25);
            var skip = (normalizedPage - 1) * normalizedPageSize;
            var timeRange = new QueryTimeRange(TimeSpan.FromDays(30));

            var response = await _client.QueryWorkspaceAsync(
                workspaceId,
                SigninLogsQueries.GetRecentLogsPageQuery(skip, normalizedPageSize),
                timeRange,
                QueryOptions,
                cancellationToken);

            var totalResponse = await _client.QueryWorkspaceAsync(
                workspaceId,
                SigninLogsQueries.GetRecentLogsCountQuery(),
                timeRange,
                QueryOptions,
                cancellationToken);

            return new
            {
                items = QueryHelper.ProjectRows(response.Value.Table).ToArray(),
                page = normalizedPage,
                pageSize = normalizedPageSize,
                totalCount = QueryHelper.GetScalarCount(totalResponse.Value.Table)
            };
        }

        public async Task<object?> GetAuditLogsAsync(int? page, int? pageSize, CancellationToken cancellationToken)
        {
            var workspaceId = SettingsHelper.Get(_configuration, "LOG_ANALYTICS_WORKSPACE_ID");
            if (string.IsNullOrWhiteSpace(workspaceId)) return null;

            var normalizedPage = QueryHelper.NormalizePage(page);
            var normalizedPageSize = QueryHelper.NormalizePageSize(pageSize, 25);
            var skip = (normalizedPage - 1) * normalizedPageSize;
            var timeRange = new QueryTimeRange(TimeSpan.FromDays(30));

            var response = await _client.QueryWorkspaceAsync(
                workspaceId,
                AuditLogsQueries.GetRecentLogsPageQuery(skip, normalizedPageSize),
                timeRange,
                QueryOptions,
                cancellationToken);

            var totalResponse = await _client.QueryWorkspaceAsync(
                workspaceId,
                AuditLogsQueries.GetRecentLogsCountQuery(),
                timeRange,
                QueryOptions,
                cancellationToken);

            return new
            {
                items = QueryHelper.ProjectRows(response.Value.Table).ToArray(),
                page = normalizedPage,
                pageSize = normalizedPageSize,
                totalCount = QueryHelper.GetScalarCount(totalResponse.Value.Table)
            };
        }

        public async Task<string?> GetSchemaAsync(CancellationToken cancellationToken)
        {
            var workspaceId = SettingsHelper.Get(_configuration, "LOG_ANALYTICS_WORKSPACE_ID");
            if (string.IsNullOrWhiteSpace(workspaceId)) return null;

            var token = await _credential.GetTokenAsync(new TokenRequestContext(new[] { "https://api.loganalytics.io/.default" }), cancellationToken);
            using var httpClient = _httpClientFactory.CreateClient();
            httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token.Token);
            var response = await httpClient.GetAsync($"https://api.loganalytics.io/v1/workspaces/{workspaceId}/metadata", cancellationToken);
            
            if (response.IsSuccessStatusCode)
            {
                return await response.Content.ReadAsStringAsync(cancellationToken);
            }
            return null;
        }

        public async Task<object?> ExecuteSearchAsync(string query, CancellationToken cancellationToken)
        {
            var workspaceId = SettingsHelper.Get(_configuration, "LOG_ANALYTICS_WORKSPACE_ID");
            if (string.IsNullOrWhiteSpace(workspaceId)) return null;

            var validation = KqlValidator.Validate(query);
            if (!validation.IsValid)
            {
                _logger.LogWarning("Blocked KQL query: {Error}. Query: {Query}", validation.Error, query.Length > 200 ? query[..200] + "..." : query);
                throw new InvalidOperationException(validation.Error);
            }

            // Enforce a safety limit if the query doesn't already contain one
            var safeQuery = query;
            if (!query.Contains("| take ", StringComparison.OrdinalIgnoreCase) &&
                !query.Contains("| limit ", StringComparison.OrdinalIgnoreCase))
            {
                safeQuery = query.TrimEnd() + "\n| take 500";
            }

            var response = await _client.QueryWorkspaceAsync(
                workspaceId,
                safeQuery,
                new QueryTimeRange(TimeSpan.FromHours(1)),
                QueryOptions,
                cancellationToken);

            return QueryHelper.ProjectRows(response.Value.Table);
        }

        public async Task<object?> GetProcessLogsAsync(CancellationToken cancellationToken)
        {
            var workspaceId = SettingsHelper.Get(_configuration, "LOG_ANALYTICS_WORKSPACE_ID");
            if (string.IsNullOrWhiteSpace(workspaceId)) return null;

            var response = await _client.QueryWorkspaceAsync(
                workspaceId,
                ProcessEventQueries.GetQuery(),
                new QueryTimeRange(TimeSpan.FromHours(1)),
                QueryOptions,
                cancellationToken);

            return QueryHelper.ProjectRows(response.Value.Table);
        }
    }
}