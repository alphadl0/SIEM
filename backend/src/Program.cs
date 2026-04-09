using backend.src;
using backend.src.queries;
using backend.src.helpers;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;
using System.Threading.Tasks;
using Azure.Monitor.Query;
using Azure.Identity;
using Azure.ResourceManager;
using Azure.ResourceManager.Sql;
using Azure.ResourceManager.Sql.Models;
using Azure.ResourceManager.Compute;
using Azure.ResourceManager.Compute.Models;
using Azure.ResourceManager.Resources;
using backend.src.services;
using Microsoft.Extensions.Logging;

DotNetEnv.Env.Load();

var builder = WebApplication.CreateBuilder(args);
var tenantId = SettingsHelper.Get(builder.Configuration, "AZURE_TENANT_ID");
var allowedGroupId = SettingsHelper.Get(builder.Configuration, "ENTRA_SECURITY_GROUP_ID");
var requiredRole = SettingsHelper.Get(builder.Configuration, "ENTRA_REQUIRED_ROLE");
var clientId = SettingsHelper.Get(builder.Configuration, "ENTRA_CLIENT_ID");
var appIdUri = SettingsHelper.Get(builder.Configuration, "ENTRA_APP_ID_URI");
var requiredScope = SettingsHelper.Get(builder.Configuration, "ENTRA_REQUIRED_SCOPE");
var allowedOrigins = BuildAllowedOrigins(SettingsHelper.Get(builder.Configuration, "FRONTEND_URL"));

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

builder.Services.AddHttpClient();
var defaultCredential = new DefaultAzureCredential();
builder.Services.AddSingleton(defaultCredential);
builder.Services.AddSingleton(new LogsQueryClient(defaultCredential));
builder.Services.AddSingleton<backend.src.services.GeoService>();
builder.Services.AddSingleton<backend.src.AlertEngine>();
builder.Services.AddSingleton<backend.src.services.AlertHistoryService>();
builder.Services.AddSingleton<backend.src.services.VmRunCommandService>();

builder.Services.AddSignalR();
builder.Services.AddControllers();
builder.Services.AddSingleton<backend.src.services.AssetService>();
builder.Services.AddSingleton<backend.src.services.LogQueryService>();
builder.Services.AddHostedService<backend.src.pollers.LogAnalyticsPoller>();
builder.Services.AddHostedService<backend.src.pollers.VmStatusPoller>();
builder.Services.AddHostedService<backend.src.pollers.SqlStatusPoller>();

// Ensure the hub uses the routing /hub and requires Auth
var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseCors("FrontendPolicy");

app.UseDefaultFiles();
app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.MapHub<SiemHub>("/hub").RequireAuthorization("SecurityTeamPolicy");

app.MapFallbackToFile("index.html");

app.Run();



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


