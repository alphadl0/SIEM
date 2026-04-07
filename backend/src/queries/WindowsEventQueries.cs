namespace backend.src.queries;

public static class WindowsEventQueries {

public static string GetQuery() => @"
Event
| where EventLog == 'System'
| where EventID == 7045
| project TimeGenerated,
          Computer,
          EventID,
          RenderedDescription = coalesce(tostring(column_ifexists('RenderedDescription', '')), tostring(column_ifexists('ParameterXml', ''))),
          Source = tostring(column_ifexists('Source', '')),
          EventLevelName = tostring(column_ifexists('EventLevelName', ''))
| where isnotempty(Computer)
| order by TimeGenerated desc";

}
