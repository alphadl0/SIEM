namespace backend.src.queries;

public static class AuditLogsQueries {

    public static string GetQuery() => @"
AuditLogs
| extend InitiatedByBag = todynamic(column_ifexists('InitiatedBy', dynamic(null)))
| extend ActorIdentity = coalesce(
    tostring(InitiatedByBag.user.userPrincipalName),
    tostring(InitiatedByBag.user.displayName),
    tostring(InitiatedByBag.app.displayName),
    tostring(InitiatedByBag.app.servicePrincipalId),
    'Unknown')
| extend ActivityName = coalesce(tostring(column_ifexists('ActivityDisplayName', '')), tostring(column_ifexists('OperationName', '')))
| extend ResultText = tostring(column_ifexists('Result', ''))
| extend ResultDescriptionText = tostring(column_ifexists('ResultDescription', ''))
| where tolower(ResultText) != 'success'
    or ActivityName has_any ('Delete user', 'Add member to role', 'Reset password', 'Add service principal credentials', 'Update application', 'Consent to application')
| project ActivityDateTime = TimeGenerated,
          ActivityDisplayName = ActivityName,
          Category = tostring(column_ifexists('Category', '')),
          Identity = ActorIdentity,
          LoggedByService = tostring(column_ifexists('LoggedByService', '')),
          Result = ResultText,
          ResultDescription = ResultDescriptionText
| order by ActivityDateTime desc";

    public static string GetRecentLogsPageQuery(int skip, int take) => $@"
{GetRecentLogsBaseQuery()}
| order by ActivityDateTime desc
| serialize RowNumber = row_number()
| where RowNumber > {skip} and RowNumber <= {skip + take}
| project-away RowNumber";

    public static string GetRecentLogsCountQuery() => $@"
{GetRecentLogsBaseQuery()}
| count";

    private static string GetRecentLogsBaseQuery()
    {
        return @"
AuditLogs
| extend InitiatedByBag = todynamic(column_ifexists('InitiatedBy', dynamic(null)))
| extend ActorIdentity = coalesce(
    tostring(InitiatedByBag.user.userPrincipalName),
    tostring(InitiatedByBag.user.displayName),
    tostring(InitiatedByBag.app.displayName),
    tostring(InitiatedByBag.app.servicePrincipalId),
    'Unknown')
| extend ActivityName = coalesce(tostring(column_ifexists('ActivityDisplayName', '')), tostring(column_ifexists('OperationName', '')))
| extend ResultText = tostring(column_ifexists('Result', ''))
| extend ResultDescriptionText = tostring(column_ifexists('ResultDescription', ''))
| project ActivityDateTime = TimeGenerated,
          ActivityDisplayName = ActivityName,
          Category = tostring(column_ifexists('Category', '')),
          Identity = ActorIdentity,
          LoggedByService = tostring(column_ifexists('LoggedByService', '')),
          Result = ResultText,
          ResultDescription = ResultDescriptionText";
    }
}
