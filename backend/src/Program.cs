using backend.src;
using backend.src.queries;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;
using System.Threading.Tasks;
using Azure.Monitor.Query;
using Azure.Identity;
using Azure.ResourceManager;
using Azure.ResourceManager.Compute;
using Azure.ResourceManager.Compute.Models;
using Azure.ResourceManager.Resources;
using backend.src.services;
using Microsoft.Extensions.Logging;

DotNetEnv.Env.Load();

var builder = WebApplication.CreateBuilder(args);
var tenantId = CleanSetting(GetSetting(builder.Configuration, "AZURE_TENANT_ID"));
var allowedGroupId = CleanSetting(GetSetting(builder.Configuration, "ENTRA_SECURITY_GROUP_ID"));
var requiredRole = CleanSetting(GetSetting(builder.Configuration, "ENTRA_REQUIRED_ROLE"));
var clientId = CleanSetting(GetSetting(builder.Configuration, "ENTRA_CLIENT_ID"));
var appIdUri = CleanSetting(GetSetting(builder.Configuration, "ENTRA_APP_ID_URI"));
var requiredScope = CleanSetting(GetSetting(builder.Configuration, "ENTRA_REQUIRED_SCOPE"));
var allowedOrigins = BuildAllowedOrigins(CleanSetting(GetSetting(builder.Configuration, "FRONTEND_URL")));

if (string.IsNullOrWhiteSpace(requiredScope))
{
    requiredScope = "access_as_user";
}

if (string.IsNullOrWhiteSpace(tenantId))
{
    throw new InvalidOperationException("AZURE_TENANT_ID must be configured for Entra token validation.");
}

// Add services to the container.
builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = $"https://login.microsoftonline.com/{tenantId}/v2.0";

        var validAudiences = BuildValidAudiences(clientId, appIdUri);
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateAudience = validAudiences.Length > 0,
            ValidAudiences = validAudiences,
            ValidateIssuer = true
        };
        
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hub"))
                {
                    context.Token = accessToken;
                }

                return Task.CompletedTask;
            },
            OnChallenge = context =>
            {
                var logger = context.HttpContext.RequestServices
                    .GetRequiredService<ILoggerFactory>()
                    .CreateLogger("JwtBearer");

                logger.LogWarning(
                    "Authentication challenge for {Path}. Error: {Error}. Description: {Description}",
                    context.Request.Path,
                    context.Error,
                    context.ErrorDescription);

                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("SecurityTeamPolicy", policy => 
    {
        policy.RequireAuthenticatedUser();
        policy.RequireAssertion(context =>
        {
            var user = context.User;
            var hasScope = string.IsNullOrWhiteSpace(requiredScope) || HasScope(user, requiredScope);
            var membershipConfigured = !string.IsNullOrWhiteSpace(allowedGroupId) || !string.IsNullOrWhiteSpace(requiredRole);
            var hasGroupAccess = !string.IsNullOrWhiteSpace(allowedGroupId) && HasAnyClaim(
                user,
                allowedGroupId,
                "groups",
                "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups");
            var hasRoleAccess = !string.IsNullOrWhiteSpace(requiredRole) && (
                user.IsInRole(requiredRole) ||
                HasAnyClaim(user, requiredRole, "roles", ClaimTypes.Role));

            return hasScope && (!membershipConfigured || hasGroupAccess || hasRoleAccess);
        });
    });
});

builder.Services.AddHttpClient<backend.src.services.GeoService>();
builder.Services.AddSingleton<backend.src.AlertEngine>();
builder.Services.AddSingleton<backend.src.services.AlertHistoryService>();
builder.Services.AddSingleton<backend.src.services.VmRunCommandService>();
builder.Services.AddSingleton(new DefaultAzureCredential());
builder.Services.AddSingleton(new LogsQueryClient(new DefaultAzureCredential()));

builder.Services.AddSignalR();
builder.Services.AddHostedService<backend.src.pollers.LogAnalyticsPoller>();
builder.Services.AddHostedService<backend.src.pollers.VmStatusPoller>();

// Ensure the hub uses the routing /hub and requires Auth
var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseCors("FrontendPolicy");

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/alerts", async (int? page, int? pageSize, string? searchTerm, string? severity, backend.src.services.AlertHistoryService historyService, ILoggerFactory loggerFactory, CancellationToken cancellationToken) =>
{
    var logger = loggerFactory.CreateLogger("AlertsApi");
    logger.LogInformation("Fetch alerts: page={Page}, size={Size}, search='{Search}', severity='{Severity}'", page, pageSize, searchTerm, severity);
    var normalizedPage = NormalizePage(page);
    var normalizedPageSize = NormalizePageSize(pageSize, 25);
    var result = await historyService.GetPagedAlertsAsync(normalizedPage, normalizedPageSize, searchTerm, severity, cancellationToken);
    return Results.Ok(result);
}).RequireAuthorization("SecurityTeamPolicy");

app.MapGet("/api/vm-statuses", async (VmRunCommandService vmRunCommandService, DefaultAzureCredential credential, ILoggerFactory loggerFactory, CancellationToken cancellationToken) =>
{
    var subId = CleanSetting(GetSetting(builder.Configuration, "AZURE_SUBSCRIPTION_ID"));
    var rgName = CleanSetting(GetSetting(builder.Configuration, "AZURE_RESOURCE_GROUP"));

    if (string.IsNullOrWhiteSpace(subId) || string.IsNullOrWhiteSpace(rgName))
    {
        return Results.Ok(Array.Empty<object>());
    }

    var logger = loggerFactory.CreateLogger("VmStatusSnapshot");
    var client = new ArmClient(credential);
    var resourceGroup = client.GetResourceGroupResource(ResourceGroupResource.CreateResourceIdentifier(subId, rgName));
    var vmStatuses = new List<object>();

    await foreach (var vm in resourceGroup.GetVirtualMachines().GetAllAsync(cancellationToken: cancellationToken))
    {
        try
        {
            var instanceView = await vm.InstanceViewAsync(cancellationToken: cancellationToken);
            var guestInsights = await vmRunCommandService.GetCachedOrFallbackGuestInsightsAsync(vm, cancellationToken);

            vmStatuses.Add(ProjectVmStatus(vm, GetVmPowerStatus(instanceView.Value), guestInsights));
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Unable to snapshot VM status for {VmName}.", vm.Data.Name);
        }
    }

    return Results.Ok(vmStatuses);
}).RequireAuthorization("SecurityTeamPolicy");

app.MapGet("/api/signin-logs", async (int? page, int? pageSize, string? searchTerm, string? status, LogsQueryClient client, ILoggerFactory loggerFactory, CancellationToken cancellationToken) =>
{
    var logger = loggerFactory.CreateLogger("SigninLogsApi");
    logger.LogInformation("Fetch signin-logs: page={Page}, size={Size}, search='{Search}', status='{Status}'", page, pageSize, searchTerm, status);
    var workspaceId = CleanSetting(GetSetting(builder.Configuration, "LOG_ANALYTICS_WORKSPACE_ID"));

    if (string.IsNullOrWhiteSpace(workspaceId))
    {
        return Results.Problem("LOG_ANALYTICS_WORKSPACE_ID is not configured.", statusCode: 500);
    }

    var normalizedPage = NormalizePage(page);
    var normalizedPageSize = NormalizePageSize(pageSize, 25);
    var skip = (normalizedPage - 1) * normalizedPageSize;
    var timeRange = new QueryTimeRange(TimeSpan.FromHours(24));

    var response = await client.QueryWorkspaceAsync(
        workspaceId,
        SigninLogsQueries.GetRecentLogsPageQuery(skip, normalizedPageSize, searchTerm, status),
        timeRange,
        cancellationToken: cancellationToken);

    var totalResponse = await client.QueryWorkspaceAsync(
        workspaceId,
        SigninLogsQueries.GetRecentLogsCountQuery(searchTerm, status),
        timeRange,
        cancellationToken: cancellationToken);

    var failedResponse = await client.QueryWorkspaceAsync(
        workspaceId,
        SigninLogsQueries.GetFailedLogsCountQuery(),
        timeRange,
        cancellationToken: cancellationToken);

    return Results.Ok(new
    {
        items = ProjectRows(response.Value.Table).ToArray(),
        page = normalizedPage,
        pageSize = normalizedPageSize,
        totalCount = GetScalarCount(totalResponse.Value.Table),
        failedCount = GetScalarCount(failedResponse.Value.Table)
    });
}).RequireAuthorization("SecurityTeamPolicy");

app.MapPost("/api/search", async (string query, LogsQueryClient client, CancellationToken cancellationToken) => {
    var workspaceId = CleanSetting(GetSetting(builder.Configuration, "LOG_ANALYTICS_WORKSPACE_ID"));

    if (string.IsNullOrWhiteSpace(workspaceId))
    {
        return Results.Problem("LOG_ANALYTICS_WORKSPACE_ID is not configured.", statusCode: 500);
    }

    if (string.IsNullOrWhiteSpace(query))
    {
        return Results.BadRequest("Query is required.");
    }

    var response = await client.QueryWorkspaceAsync(
        workspaceId,
        query,
        new QueryTimeRange(TimeSpan.FromHours(24)),
        cancellationToken: cancellationToken);

    var table = response.Value.Table;
    return Results.Ok(ProjectRows(table));
}).RequireAuthorization("SecurityTeamPolicy");

app.MapHub<SiemHub>("/hub").RequireAuthorization("SecurityTeamPolicy");

app.Run();

static string GetSetting(ConfigurationManager configuration, string key)
{
    return configuration[key] ?? Environment.GetEnvironmentVariable(key) ?? string.Empty;
}

static string CleanSetting(string? value)
{
    return value?.Trim().Replace("\r", "").Replace("\n", "") ?? string.Empty;
}

static string[] BuildAllowedOrigins(string configuredOrigins)
{
    var origins = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "http://localhost:3000",
        "https://localhost:3000",
        "http://127.0.0.1:3000",
        "https://127.0.0.1:3000",
        "http://localhost:5173",
        "https://localhost:5173",
        "http://127.0.0.1:5173",
        "https://127.0.0.1:5173"
    };

    foreach (var origin in configuredOrigins.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
    {
        origins.Add(origin.TrimEnd('/'));
    }

    return origins.ToArray();
}

static string[] BuildValidAudiences(string clientId, string appIdUri)
{
    var audiences = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

    if (!string.IsNullOrWhiteSpace(clientId))
    {
        audiences.Add(clientId);
        audiences.Add($"api://{clientId}");
    }

    if (!string.IsNullOrWhiteSpace(appIdUri))
    {
        audiences.Add(appIdUri);
    }

    return audiences.ToArray();
}

static bool HasScope(ClaimsPrincipal user, string requiredScope)
{
    return user.FindAll("scp")
            .SelectMany(claim => claim.Value.Split(' ', StringSplitOptions.RemoveEmptyEntries))
            .Any(scope => string.Equals(scope, requiredScope, StringComparison.OrdinalIgnoreCase))
        || user.FindAll("http://schemas.microsoft.com/identity/claims/scope")
            .SelectMany(claim => claim.Value.Split(' ', StringSplitOptions.RemoveEmptyEntries))
            .Any(scope => string.Equals(scope, requiredScope, StringComparison.OrdinalIgnoreCase));
}

static bool HasAnyClaim(ClaimsPrincipal user, string requiredValue, params string[] claimTypes)
{
    return claimTypes.Any(claimType =>
        user.Claims.Any(claim =>
            string.Equals(claim.Type, claimType, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(claim.Value, requiredValue, StringComparison.OrdinalIgnoreCase)));
}

static IEnumerable<Dictionary<string, object?>> ProjectRows(Azure.Monitor.Query.Models.LogsTable table)
{
    return table.Rows.Select(row =>
        table.Columns.ToDictionary(column => column.Name, column => (object?)row[column.Name]));
}

static int NormalizePage(int? page)
{
    return page.GetValueOrDefault(1) < 1 ? 1 : page.GetValueOrDefault(1);
}

static int NormalizePageSize(int? pageSize, int defaultValue)
{
    var value = pageSize.GetValueOrDefault(defaultValue);
    if (value < 1)
    {
        return defaultValue;
    }

    return Math.Min(value, 100);
}

static int GetScalarCount(Azure.Monitor.Query.Models.LogsTable table)
{
    if (table.Rows.Count == 0 || table.Columns.Count == 0)
    {
        return 0;
    }

    var firstColumn = table.Columns[0].Name;
    var raw = table.Rows[0][firstColumn];
    return raw switch
    {
        int count => count,
        long count => checked((int)count),
        _ when int.TryParse(raw?.ToString(), out var parsed) => parsed,
        _ => 0
    };
}

static object ProjectVmStatus(VirtualMachineResource vm, string status, VmGuestInsights guestInsights)
{
    return new
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
    };
}

static string GetVmPowerStatus(VirtualMachineInstanceView instanceView)
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
