namespace backend.src.queries;

public static class AADRiskyUsersQueries {

public static string GetQuery() => @"
AADRiskyUsers
| extend RiskLevelText = tostring(column_ifexists('RiskLevel', ''))
| extend RiskStateText = tostring(column_ifexists('RiskState', ''))
| where RiskStateText in~ ('atRisk', 'confirmedCompromised') or RiskLevelText in~ ('high', 'medium')
| project TimeGenerated,
          UserPrincipalName = tostring(column_ifexists('UserPrincipalName', '')),
          UserDisplayName = tostring(column_ifexists('UserDisplayName', '')),
          UserId = tostring(column_ifexists('UserId', '')),
          RiskLevel = RiskLevelText,
          RiskState = RiskStateText,
          RiskDetail = tostring(column_ifexists('RiskDetail', '')),
          RiskLastUpdatedDateTime = tostring(column_ifexists('RiskLastUpdatedDateTime', '')),
          IsDeleted = tostring(column_ifexists('IsDeleted', ''))
| where isnotempty(UserPrincipalName)
| order by TimeGenerated desc";

}
