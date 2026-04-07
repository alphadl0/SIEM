namespace backend.src.queries;

public static class AADUserRiskEventsQueries {

public static string GetQuery() => @"
AADUserRiskEvents
| extend RiskStateText = tostring(column_ifexists('RiskState', ''))
| extend RiskLevelText = tostring(column_ifexists('RiskLevel', ''))
| extend IpAddressText = coalesce(tostring(column_ifexists('IpAddress', '')), tostring(column_ifexists('IPAddress', '')))
| extend LocationText = coalesce(tostring(column_ifexists('Location', '')), tostring(column_ifexists('LocationDetails', '')), 'Unknown')
| where RiskStateText !in~ ('remediated', 'dismissed')
| project TimeGenerated,
          DetectedDateTime = tostring(column_ifexists('DetectedDateTime', '')),
          RiskEventType = tostring(column_ifexists('RiskEventType', '')),
          RiskLevel = RiskLevelText,
          RiskState = RiskStateText,
          RiskDetail = tostring(column_ifexists('RiskDetail', '')),
          IpAddress = IpAddressText,
          UserPrincipalName = tostring(column_ifexists('UserPrincipalName', '')),
          UserDisplayName = tostring(column_ifexists('UserDisplayName', '')),
          Location = LocationText,
          Source = tostring(column_ifexists('Source', ''))
| where isnotempty(UserPrincipalName) or isnotempty(IpAddress)
| order by TimeGenerated desc";

}
