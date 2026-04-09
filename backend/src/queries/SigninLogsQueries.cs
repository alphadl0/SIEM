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
| extend LocationDetailsBag = todynamic(column_ifexists('LocationDetails', dynamic(null)))
| extend DeviceDetailBag = todynamic(column_ifexists('DeviceDetail', dynamic(null)))
| project CreatedDateTime = todatetime(column_ifexists('CreatedDateTime', TimeGenerated)),
          UserPrincipalName = tostring(column_ifexists('UserPrincipalName', '')),
          UserDisplayName = tostring(column_ifexists('UserDisplayName', '')),
          UserType = tostring(column_ifexists('UserType', '')),
          IPAddress = tostring(column_ifexists('IPAddress', '')),
          LocationDetails = pack('city', tostring(LocationDetailsBag.city), 'state', tostring(LocationDetailsBag.state), 'countryOrRegion', tostring(LocationDetailsBag.countryOrRegion), 'geoCoordinates', LocationDetailsBag.geoCoordinates),
          DeviceDetail = pack('displayName', tostring(DeviceDetailBag.displayName), 'operatingSystem', tostring(DeviceDetailBag.operatingSystem), 'browser', tostring(DeviceDetailBag.browser), 'trustType', tostring(DeviceDetailBag.trustType)),
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
          ResultDescription = tostring(column_ifexists('ResultDescription', '')),
          Identity = tostring(column_ifexists('Identity', '')),
          OperationName = tostring(column_ifexists('OperationName', ''))";
    }
}
