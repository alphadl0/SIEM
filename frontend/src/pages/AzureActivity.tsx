import { CloudRain } from "lucide-react";
import { useSignalR, type AlertEvent } from "../hooks/useSignalR";
import { Pagination } from "../components/Pagination";
import { formatTimestamp, getSeverityBadgeClass } from "../lib/format";
import React from "react";

const ALERTS_PAGE_SIZE = 15;

export default function AzureActivity() {
  const { alerts } = useSignalR();
  const [azurePage, setAzurePage] = React.useState(1);

  const azureAlerts = React.useMemo(
    () =>
      alerts.filter(
        (a) =>
          a.sourceIp === "Azure RM" ||
          a.title.toLowerCase().includes("cloud resource")
      ),
    [alerts]
  );

  const totalAzurePages = Math.max(
    1,
    Math.ceil(azureAlerts.length / ALERTS_PAGE_SIZE)
  );

  const paginatedAzure = React.useMemo(() => {
    const start = (azurePage - 1) * ALERTS_PAGE_SIZE;
    return azureAlerts.slice(start, start + ALERTS_PAGE_SIZE);
  }, [azureAlerts, azurePage]);

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-xl">
        <h1 className="m-0 text-xl flex items-center gap-sm"><CloudRain size={32} /> Azure Activity Log</h1>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="contrast-table-head overview-feed-table">
            <thead>
              <tr>
                <th>TIMESTAMP</th>
                <th>NAME</th>
                <th>TARGET</th>
                <th>SOURCE</th>
                <th>SEVERITY</th>
                <th>DESCRIPTION</th>
              </tr>
            </thead>
            <tbody>
              {azureAlerts.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="overview-feed-empty"
                    style={{ textAlign: "center" }}
                  >
                    No Azure Activity detected.
                  </td>
                </tr>
              ) : (
                paginatedAzure.map((alert: AlertEvent, idx: number) => (
                  <tr key={`${alert.timestamp}-${alert.title}-${alert.vm}-${idx}`}>
                    <td className="overview-feed-cell overview-feed-timestamp">
                      {formatTimestamp(alert.timestamp)}
                    </td>
                    <td className="overview-feed-cell overview-feed-strong">
                      {alert.title}
                    </td>
                    <td className="overview-feed-cell">
                      <span className="badge neutral overview-feed-truncate">
                        {alert.vm}
                      </span>
                    </td>
                    <td className="overview-feed-cell">{alert.sourceIp}</td>
                    <td className="overview-feed-cell">
                      <span
                        className={`badge ${getSeverityBadgeClass(alert.severity)} overview-feed-status-badge`}
                      >
                        {alert.severity}
                      </span>
                    </td>
                    <td
                      className="overview-feed-cell"
                      title={alert.description}
                    >
                      <span className="overview-feed-truncate">
                        {alert.description}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {azureAlerts.length > ALERTS_PAGE_SIZE && (
          <Pagination
            page={azurePage}
            totalPages={totalAzurePages}
            totalCount={azureAlerts.length}
            pageSize={ALERTS_PAGE_SIZE}
            onPageChange={setAzurePage}
          />
        )}
      </div>
    </div>
  );
}

