using System;
using Microsoft.Extensions.Configuration;

namespace backend.src.helpers;

/// <summary>
/// Centralized configuration/environment variable resolution.
/// Replaces duplicated GetSetting/CleanSetting methods across services and pollers.
/// </summary>
public static class SettingsHelper
{
    /// <summary>
    /// Reads a setting from IConfiguration first, then falls back to environment variables.
    /// Trims whitespace and removes carriage return / newline characters.
    /// </summary>
    public static string Get(IConfiguration? configuration, string key)
    {
        var raw = configuration?[key]
            ?? Environment.GetEnvironmentVariable(key)
            ?? string.Empty;
        return raw.Trim().Replace("\r", "").Replace("\n", "");
    }

    /// <summary>
    /// Reads a setting from environment variables only (for pollers without IConfiguration).
    /// </summary>
    public static string GetEnv(string key)
    {
        return Get(null, key);
    }
}
