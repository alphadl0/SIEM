using System;
using System.Collections.Concurrent;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace backend.src.services;

public class GeoInfo
{
    public string Ip { get; set; } = "";
    public string City { get; set; } = "";
    public string Country { get; set; } = "";
    public string CountryCode { get; set; } = "";
    public string Isp { get; set; } = "";
    public double? Lat { get; set; }
    public double? Lon { get; set; }
    public bool IsPrivate { get; set; }
}

/// <summary>
/// Response shape from ipwho.is (free HTTPS GeoIP provider).
/// </summary>
public class IpApiResponse
{
    public bool success { get; set; }
    public string country { get; set; } = "";
    public string country_code { get; set; } = "";
    public string city { get; set; } = "";
    public string connection_isp { get; set; } = "";
    public double? latitude { get; set; }
    public double? longitude { get; set; }

    // Legacy ip-api.com compatibility aliases
    public string status { get; set; } = "";
    public string countryCode { get; set; } = "";
    public string isp { get; set; } = "";
    public double? lat { get; set; }
    public double? lon { get; set; }
}

public class GeoService
{
    private static readonly Regex PrivateIp = new(@"^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)", RegexOptions.Compiled);
    private readonly ConcurrentDictionary<string, GeoInfo> _cache = new();
    private readonly IHttpClientFactory _httpClientFactory;

    /// <summary>
    /// Rate limiter to avoid hitting GeoIP provider rate limits (free tiers typically allow ~45/min).
    /// </summary>
    private readonly SemaphoreSlim _rateLimiter = new(10, 10);

    public GeoService(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
    }

    public async Task<GeoInfo> LookupAsync(string ip)
    {
        if (string.IsNullOrEmpty(ip)) return new GeoInfo { Ip = "Unknown", IsPrivate = true };

        if (_cache.TryGetValue(ip, out var cached)) return cached;

        if (PrivateIp.IsMatch(ip) || ip == "127.0.0.1" || ip == "::1")
        {
            var pInfo = new GeoInfo { Ip = ip, City = "Internal", Country = "Internal Network", CountryCode = "-", Isp = "-", IsPrivate = true };
            _cache[ip] = pInfo;
            return pInfo;
        }

        // Rate limit external API calls
        if (!await _rateLimiter.WaitAsync(TimeSpan.FromSeconds(5)))
        {
            return new GeoInfo { Ip = ip, City = "Rate Limited", Country = "Unknown", IsPrivate = false };
        }

        try
        {
            var client = _httpClientFactory.CreateClient();
            var res = await client.GetFromJsonAsync<IpApiResponse>($"https://ipwho.is/{ip}");
            var isSuccess = res?.success == true || res?.status == "success";
            var geo = new GeoInfo
            {
                Ip = ip,
                City = isSuccess ? FirstNonEmpty(res?.city) : "Unknown",
                Country = isSuccess ? FirstNonEmpty(res?.country) : "Unknown",
                CountryCode = isSuccess ? FirstNonEmpty(res?.country_code, res?.countryCode) : "??",
                Isp = isSuccess ? FirstNonEmpty(res?.connection_isp, res?.isp) : "Unknown",
                Lat = isSuccess ? (res?.latitude ?? res?.lat) : null,
                Lon = isSuccess ? (res?.longitude ?? res?.lon) : null,
                IsPrivate = false
            };
            _cache[ip] = geo;
            return geo;
        }
        catch
        {
            return new GeoInfo { Ip = ip, City = "Unknown", Country = "Unknown", IsPrivate = false };
        }
        finally
        {
            _rateLimiter.Release();
        }
    }

    private static string FirstNonEmpty(params string?[] values)
    {
        foreach (var v in values)
        {
            if (!string.IsNullOrWhiteSpace(v) && !v.Equals("Unknown", StringComparison.OrdinalIgnoreCase))
                return v;
        }
        return "Unknown";
    }
}
