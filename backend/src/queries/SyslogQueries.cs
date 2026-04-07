namespace backend.src.queries;

public static class SyslogQueries {

public static string GetQuery() => @"
Syslog
| where ProcessName in~ ('sshd', 'sudo', 'useradd', 'groupadd', 'usermod')
    or SyslogMessage has_any ('Failed password for', 'authentication failure', 'new user', 'sudo', 'useradd')
| project TimeGenerated,
          HostName,
          ProcessName = tostring(column_ifexists('ProcessName', '')),
          SyslogMessage = tostring(column_ifexists('SyslogMessage', '')),
          SeverityLevel = tostring(column_ifexists('SeverityLevel', '')),
          Facility = tostring(column_ifexists('Facility', ''))
| where isnotempty(HostName) and isnotempty(SyslogMessage)
| order by TimeGenerated desc";

}
