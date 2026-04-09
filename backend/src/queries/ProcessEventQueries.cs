namespace backend.src.queries;

/// <summary>
/// KQL query for the Forensic Process Monitor page.
/// Previously embedded as inline KQL inside the frontend ProcessMonitor.tsx component.
/// </summary>
public static class ProcessEventQueries
{
    public static string GetQuery() => @"
union 
(SecurityEvent | where EventID in (4624, 4625, 4672, 4688, 4720, 4732, 4663, 7045) | where Account !in~ ('SYSTEM', 'LOCAL SERVICE', 'NETWORK SERVICE', 'DWM-1', 'DWM-2', 'DWM-3') | project TimeGenerated, Computer, NewProcessName = coalesce(NewProcessName, Activity, tostring(EventID)), CommandLine = coalesce(CommandLine, tostring(EventID)), Account),
(Event | where EventLog == 'System' and EventID == 7045 | project TimeGenerated, Computer, NewProcessName = tostring(Source), CommandLine = coalesce(RenderedDescription, ParameterXml, tostring(EventID)), Account = ""System""),
(LinuxAudit_CL | where RawData has_any ('sensitive_auth', 'exec_tracking', 'type=USER_CMD') | extend User = extract(""auid=([^ ]+)"", 1, RawData) | where User != ""4294967295"" | extend Process = extract(""exe=\""([^\""]+)\"""", 1, RawData), Cmd = extract(""comm=\""([^\""]+)\"""", 1, RawData) | where Process !in~ ('/usr/bin/dash', '/usr/bin/dircolors', '/usr/bin/dirname', '/usr/bin/basename', '/usr/bin/locale', '/usr/bin/cut', '/usr/bin/gawk', '/usr/bin/sed', '/usr/bin/id', '/usr/bin/grep', '/usr/bin/lesspipe', '/bin/sh', '/bin/bash') | project TimeGenerated, Computer, NewProcessName = coalesce(Process, ""Auditd""), CommandLine = Cmd, Account = User),
  (Syslog | where ProcessName in~ ('sshd', 'sudo', 'su', 'useradd', 'usermod', 'passwd', 'groupadd', 'chown', 'chmod', 'whoami') | extend ExtractedUser = coalesce(extract(""([a-zA-Z0-9_-]+) : TTY="", 1, SyslogMessage), extract(""user=([a-zA-Z0-9_-]+)"", 1, SyslogMessage)) | project TimeGenerated, Computer = HostName, NewProcessName = ProcessName, CommandLine = SyslogMessage, Account = iif(isnotempty(ExtractedUser), ExtractedUser, ""Syslog""))
| order by TimeGenerated desc
| take 1000";
}
