namespace backend.src.queries;

public static class AzureActivityQueries
{
    public static string GetQuery()
    {
        return @"
AzureActivity
| where CategoryValue in ('Administrative', 'Security', 'Alert')
| project TimeGenerated, Caller, OperationNameValue, _ResourceId, ActivityStatusValue, CallerIpAddress
| order by TimeGenerated desc
";
    }
}
