using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace backend.src.helpers;

/// <summary>
/// Validates KQL queries before execution against Log Analytics.
/// Prevents KQL injection by restricting allowed tables and blocking dangerous operations.
/// </summary>
public static class KqlValidator
{
    /// <summary>
    /// Maximum query length to prevent abuse via excessively large queries.
    /// </summary>
    private const int MaxQueryLength = 10_000;

    /// <summary>
    /// Tables that authenticated users are allowed to query.
    /// Any query referencing a table not in this list will be rejected.
    /// </summary>
    private static readonly HashSet<string> AllowedTables = new(StringComparer.OrdinalIgnoreCase)
    {
        "SecurityEvent",
        "Syslog",
        "Event",
        "LinuxAudit_CL",
        "SigninLogs",
        "AuditLogs",
        "AzureActivity",
        "Heartbeat",
        "Perf",
        "CommonSecurityLog",
        "WindowsFirewall",
        "W3CIISLog",
        "OfficeActivity",
        "SecurityAlert",
        "SecurityIncident",
        "ThreatIntelligenceIndicator",
        "DeviceEvents",
        "DeviceProcessEvents",
        "DeviceNetworkEvents",
        "DeviceFileEvents",
        "DeviceLogonEvents"
    };

    /// <summary>
    /// Patterns that are never allowed in user-submitted KQL queries.
    /// These could be used for data exfiltration, modification, or abuse.
    /// </summary>
    private static readonly string[] BlockedPatterns = new[]
    {
        ".set ",
        ".set-or-append ",
        ".set-or-replace ",
        ".drop ",
        ".create ",
        ".alter ",
        ".delete ",
        ".ingest ",
        ".export ",
        ".attach ",
        "cluster(",
        "database(",
        "externaldata",
    };

    public static KqlValidationResult Validate(string? query)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return KqlValidationResult.Fail("Query is required.");
        }

        if (query.Length > MaxQueryLength)
        {
            return KqlValidationResult.Fail($"Query must not exceed {MaxQueryLength} characters.");
        }

        var lowerQuery = query.ToLowerInvariant();

        // Check for blocked management commands
        foreach (var pattern in BlockedPatterns)
        {
            if (lowerQuery.Contains(pattern, StringComparison.OrdinalIgnoreCase))
            {
                return KqlValidationResult.Fail($"Query contains a blocked operation: '{pattern.Trim()}'.");
            }
        }

        // Extract the root table name from the query (first identifier before a pipe, whitespace, or keyword)
        var rootTable = ExtractRootTable(query);
        if (rootTable == null)
        {
            return KqlValidationResult.Fail("Unable to determine the root table of the query.");
        }

        if (!AllowedTables.Contains(rootTable))
        {
            return KqlValidationResult.Fail($"Table '{rootTable}' is not in the list of allowed tables.");
        }

        // Check for union with non-allowed tables
        var unionTables = ExtractUnionTables(query);
        foreach (var table in unionTables)
        {
            if (!AllowedTables.Contains(table))
            {
                return KqlValidationResult.Fail($"Union references disallowed table '{table}'.");
            }
        }

        return KqlValidationResult.Ok();
    }

    private static string? ExtractRootTable(string query)
    {
        // Match the first word-like identifier (table name) at the start of the query
        // Skips leading whitespace, comments, and let statements
        var trimmed = query.TrimStart();

        // Handle 'let' statements — skip to the final expression
        if (trimmed.StartsWith("let ", StringComparison.OrdinalIgnoreCase))
        {
            var lastSemicolon = trimmed.LastIndexOf(';');
            if (lastSemicolon >= 0 && lastSemicolon < trimmed.Length - 1)
            {
                trimmed = trimmed[(lastSemicolon + 1)..].TrimStart();
            }
        }

        // Handle 'union' as root
        if (trimmed.StartsWith("union", StringComparison.OrdinalIgnoreCase))
        {
            var tables = ExtractUnionTables(query);
            return tables.FirstOrDefault();
        }

        var match = Regex.Match(trimmed, @"^([A-Za-z_][A-Za-z0-9_]*)");
        return match.Success ? match.Groups[1].Value : null;
    }

    private static IEnumerable<string> ExtractUnionTables(string query)
    {
        // Find all table names referenced in union statements
        // Pattern: union (TableA), (TableB) or union TableA, TableB
        var unionMatch = Regex.Match(query, @"\bunion\b\s*(.+?)(?:\||\z)", RegexOptions.IgnoreCase | RegexOptions.Singleline);
        if (!unionMatch.Success)
        {
            yield break;
        }

        var unionBody = unionMatch.Groups[1].Value;

        // Extract identifiers that look like table references
        // Matches patterns like: (TableName | ...) or just TableName
        var tableMatches = Regex.Matches(unionBody, @"(?:^|[(,])\s*([A-Za-z_][A-Za-z0-9_]*)");
        foreach (Match match in tableMatches)
        {
            var tableName = match.Groups[1].Value.Trim();
            // Skip KQL keywords
            if (!IsKqlKeyword(tableName))
            {
                yield return tableName;
            }
        }
    }

    private static bool IsKqlKeyword(string value)
    {
        return value.Equals("where", StringComparison.OrdinalIgnoreCase)
            || value.Equals("project", StringComparison.OrdinalIgnoreCase)
            || value.Equals("extend", StringComparison.OrdinalIgnoreCase)
            || value.Equals("summarize", StringComparison.OrdinalIgnoreCase)
            || value.Equals("order", StringComparison.OrdinalIgnoreCase)
            || value.Equals("take", StringComparison.OrdinalIgnoreCase)
            || value.Equals("limit", StringComparison.OrdinalIgnoreCase)
            || value.Equals("join", StringComparison.OrdinalIgnoreCase)
            || value.Equals("let", StringComparison.OrdinalIgnoreCase)
            || value.Equals("print", StringComparison.OrdinalIgnoreCase)
            || value.Equals("count", StringComparison.OrdinalIgnoreCase)
            || value.Equals("distinct", StringComparison.OrdinalIgnoreCase)
            || value.Equals("serialize", StringComparison.OrdinalIgnoreCase)
            || value.Equals("kind", StringComparison.OrdinalIgnoreCase)
            || value.Equals("isfuzzy", StringComparison.OrdinalIgnoreCase)
            || value.Equals("withsource", StringComparison.OrdinalIgnoreCase);
    }
}

public sealed class KqlValidationResult
{
    public bool IsValid { get; private init; }
    public string? Error { get; private init; }

    public static KqlValidationResult Ok() => new() { IsValid = true };
    public static KqlValidationResult Fail(string error) => new() { IsValid = false, Error = error };
}
