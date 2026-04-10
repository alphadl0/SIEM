import React from "react";
import { Logs, AlertTriangle, Server } from "lucide-react";
import { formatTimestamp, getSeverityBadgeClass } from "../lib/format";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useSignalR, type AlertEvent } from "../hooks/useSignalR";
import { Pagination } from "../components/Pagination";

const ALERTS_PAGE_SIZE = 10;

export default function Dashboard() {
  const {
    alerts,
    vmStatuses,
  } = useSignalR();

  const [alertsPage, setAlertsPage] = React.useState(1);

  const knownVms = React.useMemo(() => new Set(Object.keys(vmStatuses)), [vmStatuses]);
  
  // Memoized categorization
  const isFailedLogin = React.useCallback((a: AlertEvent) => 
    a.title.toLowerCase().includes("failed login") || 
    (a.title.toLowerCase().includes("authentication failed")) ||
    (a.description?.toLowerCase().includes("failed password")), []);

  const isLoginAttempt = React.useCallback((a: AlertEvent) => 
    a.title.toLowerCase().includes("login") || 
    a.title.toLowerCase().includes("logon") || 
    a.title.toLowerCase().includes("session opened") ||
    a.title.toLowerCase().includes("authentication"), []);

  // Split feeds
  const hostAlerts = React.useMemo(() => alerts.filter(a => 
    a.sourceIp !== "Azure RM" && 
    !a.title.toLowerCase().includes("cloud resource") &&
    a.title.toLowerCase() !== "authsettings" // Hardcode filter for strange non-server artifacts
  ), [alerts]);

  const totalPages = Math.max(1, Math.ceil(hostAlerts.length / ALERTS_PAGE_SIZE));  
  const paginatedAlerts = React.useMemo(() => {
    const start = (alertsPage - 1) * ALERTS_PAGE_SIZE;
    return hostAlerts.slice(start, start + ALERTS_PAGE_SIZE);
  }, [hostAlerts, alertsPage]);

  // Derived Analytics
  const failedLoginTrends = React.useMemo(() => {
    const grouped = new Map<string, { name: string; sortKey: number; count: number }>();
    const failedAlerts = alerts.filter(isFailedLogin);

    for (const alert of failedAlerts) {
      const timestamp = new Date(alert.timestamp);
      const bucketTime = new Date(timestamp);
      bucketTime.setSeconds(0, 0);
      const name = timestamp.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });  // trend chart label — intentionally short format
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
      .slice(-15)
      .map(({ name, count }) => ({ name, failedLogins: count }));
  }, [alerts, isFailedLogin]);

  const targetedServers = React.useMemo(() => {
    const counts = new Map<string, number>();
    const loginAlerts = hostAlerts.filter(isLoginAttempt);
    for (const a of loginAlerts) {
      // Must be a known server, else ignore
      if (a.vm && a.vm !== "Unknown" && (knownVms.has(a.vm) || (!a.vm.includes("authsettings")))) {
        counts.set(a.vm, (counts.get(a.vm) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([server, count]) => ({ server, count }));
  }, [hostAlerts, isLoginAttempt, knownVms]);

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-md">
        <div className="flex items-center gap-md">
            <h2 className="m-0 text-lg">Overview Dashboard</h2>
        </div>
      </div>

      <div className="flex gap-md mb-md">
        <div className="card" style={{ flex: 2 }}>
          <h3 className="flex items-center gap-sm mb-lg text-primary">
            <AlertTriangle size={20} color="var(--destructive)" /> Failed Login Trends
          </h3>
          <div style={{ height: "220px", width: "100%" }}>
            <ResponsiveContainer>
              <LineChart data={failedLoginTrends}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />        
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="failedLogins" stroke="var(--destructive)" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card" style={{ flex: 1.2 }}>
          <h3 className="flex items-center gap-sm mb-lg text-primary">
            <Server size={20} color="var(--primary)" /> Most Targeted Servers (Login Attempts)
          </h3>
          <div className="flex flex-col gap-md">
            {targetedServers.length === 0 ? (
              <div className="text-secondary text-sm">No login attempts logged recently.</div>
            ) : targetedServers.map((t, idx) => (
              <div key={idx} style={{ borderBottom: "1px solid var(--border-light)", paddingBottom: "0.8rem" }}>
                <div className="flex justify-between mb-sm">
                  <span className="font-semibold">{t.server}</span>
                  <span className="badge high" style={{ fontSize: "0.65rem" }}>{t.count} Attempts</span>
                </div>
                <div className="text-xs text-secondary">Identified from Linux Audit & Syslog feeds</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card mb-md">
        <h3 className="flex items-center gap-sm mb-lg text-primary">
          <Logs size={20} color="var(--primary)" /> Live Security Feed (Host Activity)
        </h3>
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
              {hostAlerts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="overview-feed-empty" style={{ textAlign: "center" }}>
                    No security alerts detected. Systems are stable.
                  </td>
                </tr>
              ) : (
                paginatedAlerts.map((alert, idx) => (
                  <tr key={`${alert.timestamp}-${alert.title}-${alert.vm}-${idx}`}>
                    <td className="overview-feed-cell overview-feed-timestamp">{formatTimestamp(alert.timestamp)}</td>
                    <td className="overview-feed-cell overview-feed-strong">{alert.title}</td>
                    <td className="overview-feed-cell"><span className="badge neutral overview-feed-truncate">{alert.vm}</span></td>
                    <td className="overview-feed-cell">{alert.sourceIp}</td>
                    <td className="overview-feed-cell">
                      <span className={`badge ${getSeverityBadgeClass(alert.severity)} overview-feed-status-badge`}>
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
        {hostAlerts.length > ALERTS_PAGE_SIZE && (
          <Pagination page={alertsPage} totalPages={totalPages} totalCount={hostAlerts.length} pageSize={ALERTS_PAGE_SIZE} onPageChange={setAlertsPage} />
        )}
      </div>



    </div>
  );
}


