namespace backend.src.queries;

public static class SigninLogsQueries
{
    public static string GetQuery() => @"
SigninLogs
| extend LocationDetailsBag = parse_json(tostring(column_ifexists('LocationDetails', '{}')))
| extend DeviceDetailBag = parse_json(tostring(column_ifexists('DeviceDetail', '{}')))
| extend NormalizedLocation = strcat(tostring(LocationDetailsBag.countryOrRegion), iff(isempty(tostring(LocationDetailsBag.city)), '', strcat(' / ', tostring(LocationDetailsBag.city))))
| extend NormalizedDevice = strcat(tostring(DeviceDetailBag.operatingSystem), iff(isempty(tostring(DeviceDetailBag.browser)), '', strcat(' / ', tostring(DeviceDetailBag.browser))))
| extend ResultTypeText = tostring(column_ifexists('ResultType', ''))
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
          ResultType = ResultTypeText
| where isnotempty(UserPrincipalName) or isnotempty(IPAddress)
| order by TimeGenerated desc";


    public static string GetRecentLogsPageQuery(int skip, int take) => $@"
{GetRecentLogsBaseQuery()}
| order by CreatedDateTime desc
| serialize RowNumber = row_number()
| where RowNumber > {skip} and RowNumber <= {skip + take}
| project-away RowNumber";

    public static string GetRecentLogsCountQuery() => $@"
{GetRecentLogsBaseQuery()}
| count";

    private static string GetRecentLogsBaseQuery()
    {
        return $@"
SigninLogs
| extend loc = parse_json(tostring(column_ifexists('LocationDetails', '')))
| extend dev = parse_json(tostring(column_ifexists('DeviceDetail', '')))
| project CreatedDateTime = todatetime(column_ifexists('CreatedDateTime', TimeGenerated)),
          UserPrincipalName = tostring(column_ifexists('UserPrincipalName', '')),
          UserDisplayName = tostring(column_ifexists('UserDisplayName', '')),
          UserType = tostring(column_ifexists('UserType', '')),
          IPAddress = tostring(column_ifexists('IPAddress', '')),
          LocationDetails = tostring(pack(
              'city', tostring(loc.city),
              'state', tostring(loc.state),
              'countryOrRegion', tostring(loc.countryOrRegion)
          )),
          DeviceDetail = tostring(pack(
              'displayName', tostring(dev.displayName),
              'operatingSystem', tostring(dev.operatingSystem),
              'browser', tostring(dev.browser),
              'trustType', tostring(dev.trustType)
          )),
          RiskLevelAggregated = tostring(column_ifexists('RiskLevelAggregated', '')),
          RiskLevelDuringSignIn = tostring(column_ifexists('RiskLevelDuringSignIn', '')),
          RiskState = tostring(column_ifexists('RiskState', '')),
          RiskEventTypes_V2 = tostring(column_ifexists('RiskEventTypes_V2', '')),
          RiskDetail = tostring(column_ifexists('RiskDetail', '')),
          ConditionalAccessStatus = tostring(column_ifexists('ConditionalAccessStatus', '')),
          AppDisplayName = tostring(column_ifexists('AppDisplayName', '')),
          ClientAppUsed = tostring(column_ifexists('ClientAppUsed', '')),
          ResourceDisplayName = tostring(column_ifexists('ResourceDisplayName', '')),
          ResultSignature = tostring(column_ifexists('ResultSignature', column_ifexists('ResultType', ''))),
          Identity = tostring(column_ifexists('Identity', '')),
          OperationName = tostring(column_ifexists('OperationName', ''))";
    }
}
