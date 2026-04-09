import { useCallback, useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { CircleUserRound } from 'lucide-react';
import { formatTimestamp, normalizeKnownValue } from '../lib/format';
import { fetchApiJson, type PagedResponse } from '../lib/backend';
import { Pagination } from '../components/Pagination';

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
  ResultDescription?: string;
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
        url
      );
      setLogs(data.items);
      setTotalCount(data.totalCount);
      setError(null);
    } catch (err) {
      console.error('Failed to load sign-in logs', err);
      setError(err instanceof Error ? err.message : 'Failed to load sign-in logs.');
    } finally {
      setLoading(false);
    }
  }, [instance, accounts, page]);

  useEffect(() => {
    if (accounts.length > 0) {
      void fetchLogs();
    }
  }, [fetchLogs, accounts.length]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="fade-in">
      <div className="card" style={{ overflowX: 'auto' }}>
        <h3 className="flex items-center gap-sm mb-lg text-primary">
            <CircleUserRound size={22} className="text-primary" /> Identity Logs
        </h3>
        {error && <p className="text-critical">{error}</p>}
        {loading ? <p>Analyzing Entra ID logs...</p> : (
          <table className="identity-log-table" style={{ minWidth: '100%', width: 'max-content' }}>
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
                <th>Result Description</th>
                <th>Identity</th>
                <th>Operation Name</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={i}>
                  {(() => {
                    const deviceLabel = getDeviceLabel(log);
                    const timestampLabel = formatTimestamp(log.CreatedDateTime);
                    const locationLabel = getReadableLocation(log);

                    return (
                      <>
                        <td className="identity-log-cell">{timestampLabel}</td>
                        <td className="identity-log-cell">{log.UserPrincipalName}</td>
                        <td className="identity-log-cell">{log.UserDisplayName}</td>
                        <td className="identity-log-cell">{log.UserType}</td>
                        <td className="identity-log-cell">{log.IPAddress}</td>
                        <td className="identity-log-cell">{locationLabel}</td>
                        <td className="identity-log-cell">{deviceLabel}</td>
                        <td className="identity-log-cell">{log.RiskLevelAggregated}</td>
                        <td className="identity-log-cell">{log.RiskLevelDuringSignIn}</td>
                        <td className="identity-log-cell">{log.RiskState}</td>
                        <td className="identity-log-cell">{log.RiskEventTypes_V2}</td>
                        <td className="identity-log-cell">{log.RiskDetail}</td>
                        <td className="identity-log-cell">{log.ConditionalAccessStatus}</td>
                        <td className="identity-log-cell">{log.AppDisplayName}</td>
                        <td className="identity-log-cell">{log.ClientAppUsed}</td>
                        <td className="identity-log-cell">{log.ResourceDisplayName}</td>
                        <td className="identity-log-cell">{log.ResultSignature}</td>
                        <td className="identity-log-cell">{log.ResultDescription}</td>
                        <td className="identity-log-cell">{log.Identity}</td>
                        <td className="identity-log-cell">{log.OperationName}</td>
                      </>
                    );
                  })()}
                </tr>
              ))}
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
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return {};
}

function getDeviceLabel(log: AccessLogRow) {
  const d = parseDynamic<DeviceDetail>(log.DeviceDetail);
  const values = [d.displayName, d.operatingSystem, d.browser, d.trustType]
    .map(normalizeKnownValue)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  return Array.from(new Set(values)).join(' • ') || 'Unavailable';
}

function getReadableLocation(log: AccessLogRow) {
  const loc = parseDynamic<LocationDetails>(log.LocationDetails);
  const parts = [loc.city, loc.state, loc.countryOrRegion]
    .map(normalizeKnownValue)
    .filter(Boolean);
  
  let result = parts.join(', ');
  
  if (loc.geoCoordinates && typeof loc.geoCoordinates === 'object') {
    const hasLatLong = loc.geoCoordinates.latitude !== undefined && loc.geoCoordinates.longitude !== undefined;
    if (hasLatLong) {
      const coords = `[${loc.geoCoordinates.latitude}, ${loc.geoCoordinates.longitude}]`;
      result = result ? `${result} ${coords}` : coords;
    }
  }
  
  return result || 'Unknown Location';
}

