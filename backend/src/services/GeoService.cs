using System;
using System.Collections.Concurrent;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
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

public class IpApiResponse
{
    public string status { get; set; } = "";
    public string country { get; set; } = "";
    public string countryCode { get; set; } = "";
    public string city { get; set; } = "";
    public string isp { get; set; } = "";
    public double? lat { get; set; }
    public double? lon { get; set; }
}

public class GeoService
{
    private static readonly Regex PrivateIp = new(@"^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)", RegexOptions.Compiled);
    private readonly ConcurrentDictionary<string, GeoInfo> _cache = new();
    private readonly IHttpClientFactory _httpClientFactory;

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

        try
        {
            var client = _httpClientFactory.CreateClient();
            var res = await client.GetFromJsonAsync<IpApiResponse>($"http://ip-api.com/json/{ip}?fields=city,country,countryCode,isp,lat,lon,status");
            var geo = new GeoInfo
            {
                Ip = ip,
                City = res?.status == "success" ? res.city ?? "Unknown" : "Unknown",
                Country = res?.status == "success" ? res.country ?? "Unknown" : "Unknown",
                CountryCode = res?.status == "success" ? res.countryCode ?? "??" : "??",
                Isp = res?.status == "success" ? res.isp ?? "Unknown" : "Unknown",
                Lat = res?.status == "success" ? res.lat : null,
                Lon = res?.status == "success" ? res.lon : null,
                IsPrivate = false
            };
            _cache[ip] = geo;
            return geo;
        }
        catch
        {
            return new GeoInfo { Ip = ip, City = "Unknown", Country = "Unknown", IsPrivate = false };
        }
    }
}
