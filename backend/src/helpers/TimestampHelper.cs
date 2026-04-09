using System;

namespace backend.src.helpers;

/// <summary>
/// Shared timestamp normalization used by pollers, services, and API handlers.
/// Previously duplicated in LogAnalyticsPoller, AlertHistoryService, and Program.cs.
/// </summary>
public static class TimestampHelper
{
    public static DateTime GetTimestamp(object? value)
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
