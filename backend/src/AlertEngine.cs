using backend.src.services;
using Microsoft.AspNetCore.SignalR;
using System;
using System.Collections.Concurrent;
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
    private readonly ConcurrentDictionary<string, Alert> _alerts = new(StringComparer.Ordinal);
    private readonly GeoService _geoService;
    private readonly IHubContext<SiemHub> _hubContext;

    public AlertEngine(GeoService geoService, IHubContext<SiemHub> hubContext)
    {
        _geoService = geoService;
        _hubContext = hubContext;
    }

    public async Task ProcessSecurityEventAsync(DateTime timestamp, string computer, int eventId, string account, string ipAddress, string targetAccount, string processName, string memberName, CancellationToken ct, bool broadcast = true)
    {
        switch (eventId)
        {
            case 4624:
                await CreateAlert(timestamp, "Logon Succeeded (Windows)", "Low", computer, ipAddress, $"User {account} logged in successfully.", ct, broadcast);
                break;

            case 4625:
                await CreateAlert(timestamp, "Failed Login Attempt (Windows)", "Medium", computer, ipAddress, $"Failed login attempt for account: {account}", ct, broadcast);
                break;

            case 4672:
                await CreateAlert(timestamp, "Privilege Escalation (Windows)", "High", computer, ipAddress, $"Special privileges assigned to: {account}", ct, broadcast);
                break;

            case 4688:
                if (processName.Contains("powershell.exe", StringComparison.OrdinalIgnoreCase) || processName.Contains("cmd.exe", StringComparison.OrdinalIgnoreCase))
                {
                    await CreateAlert(timestamp, "Suspicious Process Execution", "Medium", computer, ipAddress, $"Process started: {processName} by {account}", ct, broadcast);
                }
                break;

            case 4720:
                await CreateAlert(timestamp, "New Account Created", "High", computer, ipAddress, $"New user account created: {targetAccount} by {account}", ct, broadcast);
                break;

            case 4732:
                await CreateAlert(timestamp, "Security Group Membership Change", "Medium", computer, ipAddress, $"Member {memberName} added to group by {account}", ct, broadcast);
                break;

            case 4663:
                await CreateAlert(timestamp, "Sensitive Object Access", "Medium", computer, ipAddress, $"Access attempt on sensitive object by {account}", ct, broadcast);
                break;
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
            
            await CreateAlert(timestamp, "Failed SSH Login (Linux)", "Medium", hostName, ip, $"Failed SSH login attempt for user '{user}' detected in syslog.", ct, broadcast);
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
        string GetUserFromAudit(string data)
        {
            var acctMatch = Regex.Match(data, @"acct=""?([^""\s]+)""?");
            if (acctMatch.Success) return acctMatch.Groups[1].Value;

            var uidMatch = Regex.Match(data, @"(?:a?uid|user)=""?([^""\s]+)""?");
            if (uidMatch.Success) return uidMatch.Groups[1].Value;

            return "Unknown";
        }

        string sourceUser = GetUserFromAudit(rawData);

        if (rawData.Contains("/etc/passwd") || rawData.Contains("/etc/shadow") || rawData.Contains("/etc/sudoers"))
        {
            if (rawData.Contains("wa") || rawData.Contains("write"))
            {
                await CreateAlert(timestamp, "Sensitive File Modification", "Critical", computer, sourceUser, $"Write/Append attempt on sensitive file: {rawData}", ct, broadcast);
            }
        }

        if (rawData.Contains("exe=\"/usr/bin/sudo\"") || rawData.Contains("exe=\"/bin/sudo\""))
        {
            // Avoid duplicate numeric UID alerts (like "1000") by skipping rows lacking a proper account name.
            // Sudo executions emit multiple audit rows; the one with acct="username" will be processed instead.
            if (long.TryParse(sourceUser, out _) && !rawData.Contains("acct="))
            {
                return;
            }

            await CreateAlert(timestamp, "Privilege Escalation (Sudo)", "High", computer, sourceUser, "Sudo execution detected", ct, broadcast);
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
        if (!string.Equals(result, "success", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrEmpty(result))
        {
            await CreateAlert(timestamp, "Failed Tenant Operation", "Low", "Entra ID Audit", identity, $"Administrative action '{activity}' failed. Reason: {resultDesc}", ct, broadcast);
        }

        if (activity.Contains("delete user", StringComparison.OrdinalIgnoreCase) ||
            activity.Contains("add member to role", StringComparison.OrdinalIgnoreCase) ||
            activity.Contains("reset password", StringComparison.OrdinalIgnoreCase))
        {
            await CreateAlert(timestamp, "Critical Identity Change", "High", "Entra ID Audit", identity, $"Security-sensitive operation detected: {activity} targeting {targets}", ct, broadcast);
        }
    }

    public PagedResult<Alert> GetRecentAlertsPage(int page, int pageSize, bool? excludeAzure = null)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _alerts.Values.AsEnumerable();

        if (excludeAzure == true)
        {
            query = query.Where(a => !string.Equals(a.SourceIp, "Azure RM", StringComparison.OrdinalIgnoreCase) &&
                                     !a.Title.Contains("cloud resource", StringComparison.OrdinalIgnoreCase));
        }

        var filteredAlerts = query
            .OrderByDescending(alert => alert.Timestamp)
            .ToArray();

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
            var actionName = "Modification";
            if (operationName.Contains("delete", StringComparison.OrdinalIgnoreCase)) actionName = "Deletion";
            else if (operationName.Contains("write", StringComparison.OrdinalIgnoreCase)) actionName = "Creation/Update";
            else if (operationName.Contains("action", StringComparison.OrdinalIgnoreCase)) actionName = "Action";
            var title = $"Cloud Resource {actionName} ({status})";

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
        var key = CreateAlertKey(alert);
        if (!_alerts.TryAdd(key, alert))
        {
            return false; // Duplicate — already exists
        }

        // Evict oldest entries if over capacity
        // Using a snapshot approach to avoid O(n) inside a hot path
        if (_alerts.Count > MaxAlertHistory)
        {
            var keysToRemove = _alerts
                .OrderBy(entry => entry.Value.Timestamp)
                .Take(_alerts.Count - MaxAlertHistory)
                .Select(entry => entry.Key)
                .ToList();

            foreach (var oldKey in keysToRemove)
            {
                _alerts.TryRemove(oldKey, out _);
            }
        }

        return true;
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
            alert.Title.Trim(),
            alert.Vm.Trim(),
            alert.SourceIp.Trim(),
            alert.Description.Trim());
    }
}
