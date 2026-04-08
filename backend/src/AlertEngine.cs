using backend.src.services;
using Microsoft.AspNetCore.SignalR;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace backend.src;

public class Alert
{
    public string Title { get; set; } = "";
    public string Severity { get; set; } = "";
    public string Vm { get; set; } = "";
    public string SourceIp { get; set; } = "";
    public GeoInfo? Geo { get; set; }
    public string Description { get; set; } = "";
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

public class AlertEngine
{
    private const int MaxAlertHistory = 2000;
    private readonly Dictionary<string, Alert> _alerts = new(StringComparer.Ordinal);
    private readonly object _alertsSync = new();
    private readonly GeoService _geoService;
    private readonly IHubContext<SiemHub> _hubContext;

    public AlertEngine(GeoService geoService, IHubContext<SiemHub> hubContext)
    {
        _geoService = geoService;
        _hubContext = hubContext;
    }

    public async Task ProcessSecurityEventAsync(DateTime timestamp, string computer, int eventId, string account, string ipAddress, string targetAccount, string processName, string memberName, CancellationToken ct, bool broadcast = true)
    {
        if (eventId == 4624)
        {
            await CreateAlert(timestamp, "Logon Succeeded (Windows)", "Low", computer, ipAddress, $"User {account} logged in successfully.", ct, broadcast);
        }

        if (eventId == 4625)
        {
            await CreateAlert(timestamp, "Failed Login Attempt (Windows)", "Low", computer, ipAddress, $"Failed login attempt for account: {account}", ct, broadcast);
        }

        if (eventId == 4672)
        {
            await CreateAlert(timestamp, "Privilege Escalation (Windows)", "Medium", computer, ipAddress, $"Special privileges assigned to: {account}", ct, broadcast);
        }

        if (eventId == 4688 && (processName.ToLower().Contains("powershell.exe") || processName.ToLower().Contains("cmd.exe")))
        {
            await CreateAlert(timestamp, "Suspicious Process Execution", "Medium", computer, ipAddress, $"Process started: {processName} by {account}", ct, broadcast);
        }

        if (eventId == 4720)
        {
            await CreateAlert(timestamp, "New Account Created", "High", computer, ipAddress, $"New user account created: {targetAccount} by {account}", ct, broadcast);
        }

        if (eventId == 4732)
        {
            await CreateAlert(timestamp, "Security Group Membership Change", "Medium", computer, ipAddress, $"Member {memberName} added to group by {account}", ct, broadcast);
        }

        if (eventId == 4663)
        {
            await CreateAlert(timestamp, "Sensitive Object Access", "Low", computer, ipAddress, $"Access attempt on sensitive object by {account}", ct, broadcast);
        }
    }

    public async Task ProcessSyslogAsync(DateTime timestamp, string hostName, string message, string severity, CancellationToken ct, bool broadcast = true)
    {
        if (message.Contains("Failed password for", StringComparison.OrdinalIgnoreCase))
        {
            var ipMatch = Regex.Match(message, @"\b(?:\d{1,3}\.){3}\d{1,3}\b");
            string ip = ipMatch.Success ? ipMatch.Value : "Unknown";
            
            var userMatch = Regex.Match(message, @"Failed password for (?:invalid user )?(?<user>\S+)");
            string user = userMatch.Success ? userMatch.Groups["user"].Value : "Unknown";
            
            await CreateAlert(timestamp, "Failed SSH Login (Linux)", "Low", hostName, ip, $"Failed SSH login attempt for user '{user}' detected in syslog.", ct, broadcast);
        }

        if (message.Contains("new user", StringComparison.OrdinalIgnoreCase) && message.Contains("name=", StringComparison.OrdinalIgnoreCase))
        {
            await CreateAlert(timestamp, "New Account Created (Linux)", "High", hostName, "Internal", $"New user detection in syslog: {message}", ct, broadcast);
        }
    }

    public async Task ProcessWindowsEventAsync(DateTime timestamp, string computer, int eventId, string description, CancellationToken ct, bool broadcast = true)
    {
        if (eventId == 7045)
        {
            await CreateAlert(timestamp, "New Service Installed", "High", computer, "Internal", $"New service installation: {description}", ct, broadcast);
        }
    }

    public async Task ProcessLinuxAuditAsync(DateTime timestamp, string computer, string rawData, CancellationToken ct, bool broadcast = true)
    {
        if (rawData.Contains("/etc/passwd") || rawData.Contains("/etc/shadow") || rawData.Contains("/etc/sudoers"))
        {
            if (rawData.Contains("wa") || rawData.Contains("write"))
            {
                await CreateAlert(timestamp, "Sensitive File Modification", "Critical", computer, "Unknown", $"Write/Append attempt on sensitive file: {rawData}", ct, broadcast);
            }
        }

        if (rawData.Contains("exe=\"/usr/bin/sudo\"") || rawData.Contains("exe=\"/bin/sudo\""))
        {
            await CreateAlert(timestamp, "Privilege Escalation (Sudo)", "Low", computer, "Unknown", "Sudo execution detected", ct, broadcast);
        }
    }

    public async Task ProcessSigninLogAsync(DateTime timestamp, string upn, string ip, string app, string location, string deviceStr, string authStatus, string resultType, string resultDesc, CancellationToken ct, bool broadcast = true)
    {
        if (resultType != "0")
        {
            await CreateAlert(timestamp, "Failed Entra ID Sign-in", "Low", "Azure AD", ip, $"User {upn} failed to sign into {app}. Reason: {resultDesc}", ct, broadcast);
        }

        if (!string.IsNullOrEmpty(location) && (location.Contains("Unknown") || location.Length < 3))
        {
            await CreateAlert(timestamp, "Geo-Anomalous Sign-in", "Medium", "Azure AD", ip, $"User {upn} signed in from an unusual location: {location}", ct, broadcast);
        }
    }

    public async Task ProcessAuditLogAsync(DateTime timestamp, string activity, string category, string identity, string service, string result, string resultDesc, string targets, CancellationToken ct, bool broadcast = true)
    {
        if (result != "success" && !string.IsNullOrEmpty(result))
        {
            await CreateAlert(timestamp, "Failed Tenant Operation", "Low", "Entra ID Audit", identity, $"Administrative action '{activity}' failed. Reason: {resultDesc}", ct, broadcast);
        }

        string act = activity.ToLower();
        if (act.Contains("delete user") || act.Contains("add member to role") || act.Contains("reset password"))
        {
            await CreateAlert(timestamp, "Critical Identity Change", "High", "Entra ID Audit", identity, $"Security-sensitive operation detected: {activity} targeting {targets}", ct, broadcast);
        }
    }

    public async Task ProcessRiskyUserAsync(DateTime timestamp, string upn, string displayName, string riskLevel, string riskState, string riskDetail, CancellationToken ct, bool broadcast = true)
    {
        if (riskState == "atRisk" || riskState == "confirmedCompromised")
        {
            string severity = riskLevel switch
            {
                "high" => "Critical",
                "medium" => "High",
                _ => "Medium"
            };
            await CreateAlert(timestamp, "Risky User Detected", severity, "Entra ID Protection", upn, $"User {displayName} ({upn}) flagged as {riskState}. Risk level: {riskLevel}. Detail: {riskDetail}", ct, broadcast);
        }
    }

    public async Task ProcessUserRiskEventAsync(DateTime timestamp, string upn, string displayName, string eventType, string riskLevel, string riskState, string riskDetail, string ip, string location, CancellationToken ct, bool broadcast = true)
    {
        if (riskState != "remediated" && riskState != "dismissed")
        {
            string severity = riskLevel switch
            {
                "high" => "Critical",
                "medium" => "High",
                _ => "Medium"
            };
            await CreateAlert(timestamp, "Identity Risk Event", severity, "Entra ID Protection", ip, $"High-risk event '{eventType}' detected for {displayName} ({upn}) from {location}. Detail: {riskDetail}", ct, broadcast);
        }
    }

    public PagedResult<Alert> GetRecentAlertsPage(int page, int pageSize, string? searchTerm = null, string? severity = null)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);

        Alert[] filteredAlerts;
        lock (_alertsSync)
        {
            var query = _alerts.Values.AsEnumerable();

            if (!string.IsNullOrWhiteSpace(severity) && !string.Equals(severity, "all", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(a => string.Equals(a.Severity, severity, StringComparison.OrdinalIgnoreCase));
            }

            if (!string.IsNullOrWhiteSpace(searchTerm))
            {
                var searchLower = searchTerm.ToLowerInvariant();
                query = query.Where(a => 
                    a.Vm.ToLowerInvariant().Contains(searchLower) || 
                    a.Description.ToLowerInvariant().Contains(searchLower) ||
                    a.Title.ToLowerInvariant().Contains(searchLower));
            }

            filteredAlerts = query
                .OrderByDescending(alert => alert.Timestamp)
                .ToArray();
        }

        var totalCount = filteredAlerts.Length;
        var items = filteredAlerts
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToArray();

        return new PagedResult<Alert>(items, page, pageSize, totalCount);
    }

    public IEnumerable<Alert> GetRecentAlerts()
    {
        return GetRecentAlertsPage(1, MaxAlertHistory).Items;
    }

    public async Task ProcessAzureActivityLogAsync(DateTime timestamp, string caller, string operationName, string resourceId, string status, string description, CancellationToken ct, bool broadcast = true)
    {
        if (operationName.Contains("write", StringComparison.OrdinalIgnoreCase) || operationName.Contains("delete", StringComparison.OrdinalIgnoreCase) || operationName.Contains("action", StringComparison.OrdinalIgnoreCase))
        {
            var severity = operationName.Contains("delete", StringComparison.OrdinalIgnoreCase) ? "High" : "Medium";
            var title = $"Cloud Resource Modification ({status})";
            await CreateAlert(timestamp, title, severity, ExtractResourceName(resourceId), "Azure RM", $"Caller '{caller}' performed '{operationName}' on '{ExtractResourceName(resourceId)}'. Details: {description}", ct, broadcast);
        }
    }

    private string ExtractResourceName(string resourceId)
    {
        if (string.IsNullOrWhiteSpace(resourceId)) return "Unknown Resource";
        var parts = resourceId.Split('/');
        return parts.Length > 0 ? parts[^1] : "Unknown Resource";
    }

    private async Task CreateAlert(DateTime timestamp, string title, string severity, string vm, string ip, string desc, CancellationToken ct, bool broadcast)
    {
        var normalizedTimestamp = NormalizeTimestamp(timestamp);
        var geo = !string.IsNullOrEmpty(ip) && ip != "Unknown" && ip != "Internal"
            ? await _geoService.LookupAsync(ip)
            : null;

        var alert = new Alert
        {
            Title = title,
            Severity = severity,
            Vm = vm,
            SourceIp = ip,
            Geo = geo,
            Description = desc,
            Timestamp = normalizedTimestamp
        };

        if (!StoreAlert(alert))
        {
            return;
        }

        if (broadcast)
        {
            await _hubContext.Clients.Group("security-team").SendAsync("newAlert", alert, ct);
        }
    }

    private bool StoreAlert(Alert alert)
    {
        lock (_alertsSync)
        {
            var key = CreateAlertKey(alert);
            if (_alerts.ContainsKey(key))
            {
                return false;
            }

            _alerts[key] = alert;

            while (_alerts.Count > MaxAlertHistory)
            {
                var oldestAlert = _alerts
                    .OrderBy(entry => entry.Value.Timestamp)
                    .First();

                _alerts.Remove(oldestAlert.Key);
            }

            return true;
        }
    }

    private static DateTime NormalizeTimestamp(DateTime timestamp)
    {
        if (timestamp == default)
        {
            return DateTime.UtcNow;
        }

        return timestamp.Kind switch
        {
            DateTimeKind.Utc => timestamp,
            DateTimeKind.Local => timestamp.ToUniversalTime(),
            _ => DateTime.SpecifyKind(timestamp, DateTimeKind.Utc)
        };
    }

    private static string CreateAlertKey(Alert alert)
    {
        return string.Join("|",
            alert.Timestamp.ToUniversalTime().ToString("O"),
            alert.Vm.Trim(),
            alert.SourceIp.Trim(),
            alert.Description.Trim());
    }
}
