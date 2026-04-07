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

export default function Dashboard() {
  const {
    alerts,
    vmStatuses,
    lastPoll,
    connectionStatus = "Connecting",
    connectionError,
  } = useSignalR();

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

  return (
    <div className="fade-in">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Overview Dashboard</h2>
            <div className={`badge ${
                connectionStatus === 'Connected' ? 'low' : 
                connectionStatus === 'Unauthorized' ? 'critical' : 'medium'
            }`} style={{ fontSize: '0.6rem' }}>
                SIGNALR: {connectionStatus.toUpperCase()}
            </div>
        </div>
        {lastPoll && (
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Poll: {new Date(lastPoll.timestamp).toLocaleTimeString()} •
            Status:{" "}
            <span style={{ color: "var(--secondary)" }}>{lastPoll.status}</span>
          </div>
        )}
      </div>
      {connectionError && connectionStatus !== "Connected" && (
        <div
          className="card"
          style={{ marginBottom: "1rem", padding: "0.85rem 1rem", color: "#991b1b" }}
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1.2fr",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        <div className="card">
          <h3
            style={{
              marginBottom: "1.5rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <Activity size={20} color="var(--primary)" /> Security Event Trends
          </h3>
          <div style={{ height: "300px", width: "100%" }}>
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

        <div className="card">
          <h3
            style={{
              marginBottom: "1.5rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <TerminalSquare size={20} color="var(--primary)" /> Infrastructure
            Status
          </h3>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            {Object.entries(vmStatuses).map(([vmName, vm]) => (
              <div
                key={vmName}
                style={{
                  borderBottom: "1px solid var(--border-light)",
                  paddingBottom: "0.8rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "0.3rem",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{vmName}</span>
                  <span
                    className={`badge ${getVmBadgeTone(vm.status)}`}
                    style={{ fontSize: "0.65rem" }}
                  >
                    {getVmDashboardLabel(vm.status)}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  📍 {vm.location} • {vm.vmSize}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h3
          style={{
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <ShieldAlert size={20} color="var(--destructive)" /> Live Security
          Activity
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table className="contrast-table-head overview-feed-table">
            <thead>
              <tr>
                <th>TIME</th>
                <th>USE CASE</th>
                <th>SOURCE VM</th>
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
                alerts.map((alert, idx) => (
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
                      <span className="overview-feed-truncate">{alert.vm}</span>
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
