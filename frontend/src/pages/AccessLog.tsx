import { useCallback, useEffect, useState, useMemo } from "react";
import { useMsal } from "@azure/msal-react";
import { CircleUserRound } from "lucide-react";
import { formatTimestamp, normalizeKnownValue } from "../lib/format";
import { fetchApiJson, type PagedResponse } from "../lib/backend";
import { Pagination } from "../components/Pagination";

const PAGE_SIZE = 10;

interface LocationDetails {
  city?: string;
  state?: string;
  countryOrRegion?: string;
  geoCoordinates?: {
    latitude?: number;
    longitude?: number;
  };
}

interface DeviceDetail {
  displayName?: string;
  operatingSystem?: string;
  browser?: string;
  trustType?: string;
}

interface AccessLogRow {
  CreatedDateTime: string;
  UserPrincipalName?: string;
  UserDisplayName?: string;
  UserType?: string;
  IPAddress?: string;
  LocationDetails?: LocationDetails;
  DeviceDetail?: DeviceDetail;
  RiskLevelAggregated?: string;
  RiskLevelDuringSignIn?: string;
  RiskState?: string;
  RiskEventTypes_V2?: string;
  RiskDetail?: string;
  ConditionalAccessStatus?: string;
  AppDisplayName?: string;
  ClientAppUsed?: string;
  ResourceDisplayName?: string;
  ResultSignature?: string;
  Identity?: string;
  OperationName?: string;
}

export default function AccessLog() {
  const { instance, accounts } = useMsal();
  const [logs, setLogs] = useState<AccessLogRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!accounts[0]) {
      return;
    }

    try {
      setLoading(true);
      const url = `/api/signin-logs?page=${page}&pageSize=${PAGE_SIZE}`;
      const data = await fetchApiJson<PagedResponse<AccessLogRow>>(
        instance,
        accounts[0],
        url,
      );
      setLogs(data.items);
      setTotalCount(data.totalCount);
      setError(null);
    } catch (err) {
      console.error("Failed to load sign-in logs", err);
      setError(
        err instanceof Error ? err.message : "Failed to load sign-in logs.",
      );
    } finally {
      setLoading(false);
    }
  }, [instance, accounts, page]);

  useEffect(() => {
    if (accounts.length > 0) {
      void fetchLogs();
    }
  }, [fetchLogs, accounts.length]);

  const parsedLogs = useMemo(
    () =>
      logs.map((log, index) => {
        const loc = parseDynamic<LocationDetails>(log.LocationDetails);
        const dev = parseDynamic<DeviceDetail>(log.DeviceDetail);
        return {
          key: `${log.CreatedDateTime}-${log.UserPrincipalName}-${index}`,
          timestamp: formatTimestamp(log.CreatedDateTime),
          userPrincipalName: log.UserPrincipalName,
          userDisplayName: log.UserDisplayName,
          userType: log.UserType,
          ipAddress: log.IPAddress,
          city: normalizeKnownValue(loc.city),
          state: normalizeKnownValue(loc.state),
          countryOrRegion: normalizeKnownValue(loc.countryOrRegion),
          deviceDisplayName: normalizeKnownValue(dev.displayName),
          operatingSystem: normalizeKnownValue(dev.operatingSystem),
          browser: normalizeKnownValue(dev.browser),
          trustType: normalizeKnownValue(dev.trustType),
          riskLevelAggregated: log.RiskLevelAggregated,
          riskLevelDuringSignIn: log.RiskLevelDuringSignIn,
          riskState: log.RiskState,
          riskEventTypes_V2: log.RiskEventTypes_V2,
          riskDetail: log.RiskDetail,
          conditionalAccessStatus: log.ConditionalAccessStatus,
          appDisplayName: log.AppDisplayName,
          clientAppUsed: log.ClientAppUsed,
          resourceDisplayName: log.ResourceDisplayName,
          resultSignature: log.ResultSignature,
          identity: log.Identity,
          operationName: log.OperationName,
        };
      }),
    [logs],
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-xl">
        <h1 className="m-0 text-xl flex items-center gap-sm"><CircleUserRound size={32} /> Identity Logs</h1>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        {error && <p className="text-critical">{error}</p>}
        {loading ? (
          <p>Analyzing Entra ID logs...</p>
        ) : (
          <table
            className="identity-log-table"
            style={{ minWidth: "100%", width: "max-content" }}
          >
            <thead>
              <tr>
                <th>Created Date Time</th>
                <th>User Principal Name</th>
                <th>User Display Name</th>
                <th>User Type</th>
                <th>IP Address</th>
                <th>Location Details</th>
                <th>Device Detail</th>
                <th>Risk Level Aggregated</th>
                <th>Risk Level During Sign In</th>
                <th>Risk State</th>
                <th>Risk Event Types V2</th>
                <th>Risk Detail</th>
                <th>Conditional Access Status</th>
                <th>App Display Name</th>
                <th>Client App Used</th>
                <th>Resource Display Name</th>
                <th>Result Signature</th>
                <th>Identity</th>
                <th>Operation Name</th>
              </tr>
            </thead>
            <tbody>
              {parsedLogs.map((log) => (
                <tr key={log.key}>
                  <td className="identity-log-cell">{log.timestamp}</td>
                  <td className="identity-log-cell">{log.userPrincipalName}</td>
                  <td className="identity-log-cell">{log.userDisplayName}</td>
                  <td className="identity-log-cell">{log.userType}</td>
                  <td className="identity-log-cell">{log.ipAddress}</td>
                  <td className="identity-log-cell">
                    {[log.city, log.state, log.countryOrRegion].filter(Boolean).join(', ') || 'Unknown'}
                  </td>
                  <td className="identity-log-cell">
                    {[log.deviceDisplayName, log.operatingSystem, log.browser, log.trustType].filter(Boolean).join(', ') || 'Unknown'}
                  </td>
                  <td className="identity-log-cell">{log.riskLevelAggregated}</td>
                  <td className="identity-log-cell">{log.riskLevelDuringSignIn}</td>
                  <td className="identity-log-cell">{log.riskState}</td>
                  <td className="identity-log-cell">{log.riskEventTypes_V2}</td>
                  <td className="identity-log-cell">{log.riskDetail}</td>
                  <td className="identity-log-cell">{log.conditionalAccessStatus}</td>
                  <td className="identity-log-cell">{log.appDisplayName}</td>
                  <td className="identity-log-cell">{log.clientAppUsed}</td>
                  <td className="identity-log-cell">{log.resourceDisplayName}</td>
                  <td className="identity-log-cell">{log.resultSignature}</td>
                  <td className="identity-log-cell">{log.identity}</td>
                  <td className="identity-log-cell">{log.operationName}</td>
                </tr>
              ))}
              {parsedLogs.length === 0 && !loading && (
                <tr>
                  <td colSpan={19} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No sign-in logs found for the selected time period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        {!loading && totalCount > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  );
}

function parseDynamic<T>(value: unknown): T | Partial<T> {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return {};
}
