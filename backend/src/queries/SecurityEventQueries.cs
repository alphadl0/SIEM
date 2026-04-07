namespace backend.src.queries;

public static class SecurityEventQueries {

public static string GetQuery() => @"
SecurityEvent
| where EventID in (4624, 4625, 4663, 4672, 4688, 4720, 4732)
| extend NormalizedAccount = coalesce(tostring(column_ifexists('Account', '')), tostring(column_ifexists('SubjectAccount', '')), tostring(column_ifexists('AccountName', '')))
| extend NormalizedIpAddress = tostring(column_ifexists('IpAddress', ''))
| extend NormalizedTargetAccount = coalesce(tostring(column_ifexists('TargetAccount', '')), tostring(column_ifexists('TargetUserName', '')))
| extend NormalizedMemberName = coalesce(tostring(column_ifexists('MemberName', '')), tostring(column_ifexists('GroupMemberName', '')))
| project TimeGenerated,
          Computer,
          EventID,
          Account = NormalizedAccount,
          IpAddress = NormalizedIpAddress,
          LogonType = tostring(column_ifexists('LogonType', '')),
          NewProcessName = tostring(column_ifexists('NewProcessName', '')),
          CommandLine = tostring(column_ifexists('CommandLine', '')),
          TargetAccount = NormalizedTargetAccount,
          MemberName = NormalizedMemberName,
          Activity = tostring(column_ifexists('Activity', ''))
| where isnotempty(Computer)
| order by TimeGenerated desc";

}
