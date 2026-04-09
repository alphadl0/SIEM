using System;
using System.Collections.Generic;
using System.Linq;

namespace backend.src.helpers;

/// <summary>
/// Shared pagination and query projection helpers.
/// Previously inline static methods in Program.cs.
/// </summary>
public static class QueryHelper
{
    public static int NormalizePage(int? page)
    {
        return page.GetValueOrDefault(1) < 1 ? 1 : page.GetValueOrDefault(1);
    }

    public static int NormalizePageSize(int? pageSize, int defaultValue)
    {
        var value = pageSize.GetValueOrDefault(defaultValue);
        if (value < 1)
        {
            return defaultValue;
        }

        return Math.Min(value, 100);
    }

    public static int GetScalarCount(Azure.Monitor.Query.Models.LogsTable table)
    {
        if (table.Rows.Count == 0 || table.Columns.Count == 0)
        {
            return 0;
        }

        var firstColumn = table.Columns[0].Name;
        var raw = table.Rows[0][firstColumn];
        return raw switch
        {
            int count => count,
            long count => checked((int)count),
            _ when int.TryParse(raw?.ToString(), out var parsed) => parsed,
            _ => 0
        };
    }

    public static IEnumerable<Dictionary<string, object?>> ProjectRows(Azure.Monitor.Query.Models.LogsTable table)
    {
        return table.Rows.Select(row =>
            table.Columns.ToDictionary(column => column.Name, column => (object?)row[column.Name]));
    }
}
