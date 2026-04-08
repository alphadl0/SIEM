namespace backend.src.queries;

public static class SigninLogsQueries
{
    public static string GetQuery() => @"
SigninLogs
| extend LocationDetailsBag = todynamic(column_ifexists('LocationDetails', dynamic(null)))
| extend DeviceDetailBag = todynamic(column_ifexists('DeviceDetail', dynamic(null)))
| extend NormalizedLocation = strcat(tostring(LocationDetailsBag.countryOrRegion), iff(isempty(tostring(LocationDetailsBag.city)), '', strcat(' / ', tostring(LocationDetailsBag.city))))
| extend NormalizedDevice = strcat(tostring(DeviceDetailBag.operatingSystem), iff(isempty(tostring(DeviceDetailBag.browser)), '', strcat(' / ', tostring(DeviceDetailBag.browser))))
| extend ResultTypeText = tostring(column_ifexists('ResultType', ''))
| extend ResultDescriptionText = tostring(column_ifexists('ResultDescription', ''))
| extend ConditionalAccessStatusText = tostring(column_ifexists('ConditionalAccessStatus', ''))
| extend Location = iff(isempty(trim(' ', NormalizedLocation)), tostring(column_ifexists('Location', 'Unknown')), trim(' ', NormalizedLocation))
| where ResultTypeText != '0' or isempty(Location) or strlen(Location) < 3 or Location has 'Unknown'
| project TimeGenerated,
          UserPrincipalName = tostring(column_ifexists('UserPrincipalName', '')),
          UserDisplayName = tostring(column_ifexists('UserDisplayName', '')),
          AppDisplayName = tostring(column_ifexists('AppDisplayName', '')),     
          IPAddress = tostring(column_ifexists('IPAddress', '')),
          Location,
          DeviceDetail = iff(isempty(trim(' ', NormalizedDevice)), 'Unknown', trim(' ', NormalizedDevice)),
          AuthenticationDetails = tostring(column_ifexists('AuthenticationDetails', '')),
          ConditionalAccessStatus = ConditionalAccessStatusText,
          ResultType = ResultTypeText,
          ResultDescription = ResultDescriptionText
| where isnotempty(UserPrincipalName) or isnotempty(IPAddress)
| order by TimeGenerated desc";

    public static string GetRecentLogsQuery(int take = 50) => GetRecentLogsPageQuery(0, take);

    public static string GetRecentLogsPageQuery(int skip, int take, string? searchTerm = null, string? status = null) => $@"
{GetRecentLogsBaseQuery(searchTerm, status)}
| order by TimeGenerated desc
| serialize RowNumber = row_number()
| where RowNumber > {skip} and RowNumber <= {skip + take}
| project-away RowNumber";

    public static string GetRecentLogsCountQuery(string? searchTerm = null, string? status = null) => $@"
{GetRecentLogsBaseQuery(searchTerm, status)}
| count";

    public static string GetFailedLogsCountQuery() => $@"
SigninLogs
| where ResultType != '0'
| count";

    private static string GetRecentLogsBaseQuery(string? searchTerm = null, string? status = null)
    {
        var filter = "";
        if (!string.IsNullOrWhiteSpace(status))
        {
            filter += status.ToLower() switch
            {
                "success" => "| where ResultType == '0' ",
                "failed" => "| where ResultType != '0' ",
                _ => ""
            };
        }

        if (!string.IsNullOrWhiteSpace(searchTerm))
        {
            var s = searchTerm.Replace("'", "\\'");
            filter += $"| where UserPrincipalName has '{s}' or IPAddress has '{s}' or AppDisplayName has '{s}' or Location has '{s}' ";
        }

        return $@"
SigninLogs
| extend LocationDetailsBag = todynamic(column_ifexists('LocationDetails', dynamic(null)))
| extend DeviceDetailBag = todynamic(column_ifexists('DeviceDetail', dynamic(null)))
| project TimeGenerated,
          UserPrincipalName = tostring(column_ifexists('UserPrincipalName', '')),
          AppDisplayName = tostring(column_ifexists('AppDisplayName', '')),     
          IPAddress = tostring(column_ifexists('IPAddress', '')),
          City = trim(' ', tostring(LocationDetailsBag.city)),
          Country = trim(' ', tostring(LocationDetailsBag.countryOrRegion)),
          Location = trim(' ', tostring(column_ifexists('Location', ''))),
          DeviceName = tostring(DeviceDetailBag.displayName),
          DeviceOperatingSystem = tostring(DeviceDetailBag.operatingSystem),
          DeviceBrowser = tostring(DeviceDetailBag.browser),
          ResultType = tostring(column_ifexists('ResultType', ''))
{filter}";
    }
}
