import React from "react";
import { Activity, Logs, ShieldAlert, TerminalSquare } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useSignalR } from "../hooks/useSignalR";
import { getVmBadgeTone, getVmDashboardLabel } from "../lib/vmStatus";
import { Pagination } from "../components/Pagination";

const ALERTS_PAGE_SIZE = 10;

export default function Dashboard() {
  const {
    alerts,
    vmStatuses,
    lastPoll,
    connectionStatus = "Connecting",
    connectionError,
  } = useSignalR();

  const [alertsPage, setAlertsPage] = React.useState(1);

  // Process data for charts
  const chartData = React.useMemo(() => {
    const grouped = new Map<string, { name: string; sortKey: number; count: number }>();

    for (const alert of alerts) {
      const timestamp = new Date(alert.timestamp);
      const bucketTime = new Date(timestamp);
      bucketTime.setSeconds(0, 0);

      const name = timestamp.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const key = bucketTime.toISOString();
      const existing = grouped.get(key);

      if (existing) {
        existing.count += 1;
      } else {
        grouped.set(key, { name, sortKey: bucketTime.getTime(), count: 1 });
      }
    }

    return Array.from(grouped.values())
      .sort((left, right) => left.sortKey - right.sortKey)
      .slice(-10)
      .map(({ name, count }) => ({ name, count }));
  }, [alerts]);

  const totalPages = Math.max(1, Math.ceil(alerts.length / ALERTS_PAGE_SIZE));
  const paginatedAlerts = React.useMemo(() => {
    const start = (alertsPage - 1) * ALERTS_PAGE_SIZE;
    return alerts.slice(start, start + ALERTS_PAGE_SIZE);
  }, [alerts, alertsPage]);

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-md">
        <div className="flex items-center gap-md">
            <h2 className="m-0 text-lg">Overview Dashboard</h2>
            <div className={`badge ${
                connectionStatus === 'Connected' ? 'low' : 
                connectionStatus === 'Unauthorized' ? 'critical' : 'medium'
            }`} style={{ fontSize: '0.6rem' }}>
                SIGNALR: {connectionStatus.toUpperCase()}
            </div>
        </div>
        {lastPoll && (
          <div className="text-xs text-secondary">
            Poll: {new Date(lastPoll.timestamp).toLocaleTimeString()} •
            Status:{" "}
            <span className="text-success">{lastPoll.status}</span>
          </div>
        )}
      </div>
      {connectionError && connectionStatus !== "Connected" && (
        <div
          className="card mb-md text-critical"
          style={{ padding: "0.85rem 1rem" }}
        >
          Realtime diagnostics: {connectionError}
        </div>
      )}

      <div
        className="dashboard-summary-grid"
      >
        <div
          className="card dashboard-summary-card"
        >
          <div
            className="dashboard-summary-icon"
            style={{
              background: "rgba(34, 139, 34, 0.1)",
              color: "var(--secondary)",
            }}
          >
            <Activity size={20} />
          </div>
          <div>
            <h3
              className="dashboard-summary-label"
              style={{
                margin: 0,
                color: "var(--text-primary)",
              }}
            >
              Monitored Infrastructure
            </h3>
            <p
              className="dashboard-summary-value"
              style={{
                fontWeight: "bold",
                margin: "0.1rem 0 0 0",
              }}
            >
              {Object.keys(vmStatuses).length} VMs
            </p>
          </div>
        </div>

        <div
          className="card dashboard-summary-card"
        >
          <div
            className="dashboard-summary-icon"
            style={{
              background: "rgba(139, 0, 0, 0.1)",
              color: "var(--destructive)",
            }}
          >
            <ShieldAlert size={20} />
          </div>
          <div>
            <h3
              className="dashboard-summary-label"
              style={{
                margin: 0,
                color: "var(--text-primary)",
              }}
            >
              Critical Alerts (Live)
            </h3>
            <p
              className="dashboard-summary-value"
              style={{
                fontWeight: "bold",
                margin: "0.1rem 0 0 0",
              }}
            >
              {alerts.filter((a) => a.severity === "Critical").length}
            </p>
          </div>
        </div>

        <div
          className="card dashboard-summary-card"
        >
          <div
            className="dashboard-summary-icon"
            style={{
              background: "rgba(17, 75, 95, 0.1)",
              color: "var(--primary)",
            }}
          >
            <Logs size={18} />
          </div>
          <div>
            <h3
              className="dashboard-summary-label"
              style={{
                margin: 0,
                color: "var(--text-primary)",
              }}
            >
              Total Security Events
            </h3>
            <p
              className="dashboard-summary-value"
              style={{
                fontWeight: "bold",
                margin: "0.1rem 0 0 0",
              }}
            >
              {alerts.length}
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-md mb-md">
        <div className="card" style={{ flex: 2 }}>
          <h3 className="flex items-center gap-sm mb-lg text-primary">
            <Activity size={20} color="var(--primary)" /> Security Event Trends
          </h3>
          <div style={{ height: "220px", width: "100%" }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="var(--text-muted)"
                  fontSize={12}
                />
                <YAxis stroke="var(--text-muted)" fontSize={12} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="var(--primary)"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card" style={{ flex: 1.2 }}>
          <h3 className="flex items-center gap-sm mb-lg text-primary">
            <TerminalSquare size={20} color="var(--primary)" /> Infrastructure
            Status
          </h3>
          <div className="flex flex-col gap-md">
            {Object.entries(vmStatuses).map(([vmName, vm]) => (
              <div
                key={vmName}
                style={{
                  borderBottom: "1px solid var(--border-light)",
                  paddingBottom: "0.8rem",
                }}
              >
                <div className="flex justify-between mb-sm">
                  <span className="font-semibold">{vmName}</span>
                  <span
                    className={`badge ${getVmBadgeTone(vm.status)}`}
                    style={{ fontSize: "0.65rem" }}
                  >
                    {getVmDashboardLabel(vm.status)}
                  </span>
                </div>
                <div className="text-xs text-secondary">
                  📍 {vm.location} • {vm.vmSize}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card">
        <h3 className="flex items-center gap-sm mb-lg text-primary">
          <ShieldAlert size={20} color="var(--destructive)" /> Live Security
          Activity
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table className="contrast-table-head overview-feed-table">
            <thead>
              <tr>
                <th>TIME</th>
                <th>USE CASE</th>
                <th>SOURCE</th>
                <th>SOURCE IP</th>
                <th>SEVERITY</th>
                <th>DESCRIPTION</th>
              </tr>
            </thead>
            <tbody>
              {alerts.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="overview-feed-empty"
                    style={{
                      textAlign: "center",
                    }}
                  >
                    No security alerts detected. Systems are stable.
                  </td>
                </tr>
              ) : (
                paginatedAlerts.map((alert, idx) => (
                  <tr key={idx}>
                    <td
                      className="overview-feed-cell overview-feed-timestamp"
                      title={new Date(alert.timestamp).toLocaleTimeString()}
                    >
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="overview-feed-cell overview-feed-strong" title={alert.useCaseId}>
                      {alert.useCaseId}
                    </td>
                    <td className="overview-feed-cell" title={alert.vm}>
                      <span className="badge neutral overview-feed-truncate">{alert.vm}</span>
                    </td>
                    <td className="overview-feed-cell" title={`${alert.sourceIp}${alert.geo ? ` • ${formatGeoLocation(alert.geo.city, alert.geo.country)}` : ""}`}>
                      <span className="overview-feed-truncate">{alert.sourceIp}</span>
                      {alert.geo && (
                        <div className="overview-feed-subline">
                          {formatGeoLocation(alert.geo.city, alert.geo.country)}
                        </div>
                      )}
                    </td>
                    <td className="overview-feed-cell">
                      <span
                        className={`badge ${alert.severity === "Critical" ? "critical" : alert.severity === "High" ? "high" : "medium"} overview-feed-status-badge`}
                      >
                        {alert.severity}
                      </span>
                    </td>
                    <td className="overview-feed-cell" title={alert.description}>
                      <span className="overview-feed-truncate">{alert.description}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {alerts.length > ALERTS_PAGE_SIZE && (
          <Pagination
            page={alertsPage}
            totalPages={totalPages}
            totalCount={alerts.length}
            pageSize={ALERTS_PAGE_SIZE}
            onPageChange={setAlertsPage}
          />
        )}
      </div>
    </div>
  );
}

function formatGeoLocation(city?: string, country?: string) {
  const parts = [city, country]
    .map((value) => value?.trim())
    .filter((value): value is string => typeof value === "string" && value.length > 0 && value.toLowerCase() !== "unknown");

  return parts.join(", ") || "Unknown";
}
