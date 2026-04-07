namespace backend.src.queries;

public static class LinuxAuditQueries {

public static string GetQuery() => @"
LinuxAudit_CL
| where RawData has_any ('/etc/passwd', '/etc/shadow', '/etc/sudoers', 'exe=""/usr/bin/sudo""', 'exe=""/bin/sudo""')
| project TimeGenerated,
          Computer = coalesce(tostring(column_ifexists('Computer', '')), tostring(column_ifexists('HostName', ''))),
          ResourceId = tostring(column_ifexists('ResourceId', '')),
          RawData = tostring(column_ifexists('RawData', ''))
| where isnotempty(Computer) and isnotempty(RawData)
| order by TimeGenerated desc";

}
