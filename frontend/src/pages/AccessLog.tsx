import { useCallback, useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { CircleUserRound } from 'lucide-react';
import { fetchApiJson, type PagedResponse } from '../lib/backend';
import { FilterBar } from '../components/FilterBar';
import { Pagination } from '../components/Pagination';

const PAGE_SIZE = 10;

interface AccessLogRow {
  TimeGenerated: string;
  UserPrincipalName?: string;
  AppDisplayName?: string;
  IPAddress?: string;
  City?: string;
  Country?: string;
  Location?: string;
  DeviceName?: string;
  DeviceOperatingSystem?: string;
  DeviceBrowser?: string;
  ResultType?: string;
}

export default function AccessLog() {
  const { instance, accounts } = useMsal();
  const [logs, setLogs] = useState<AccessLogRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState('all');

  const fetchLogs = useCallback(async () => {
    if (!accounts[0]) {
      return;
    }

    try {
      setLoading(true);
      const url = `/api/signin-logs?page=${page}&pageSize=${PAGE_SIZE}&searchTerm=${encodeURIComponent(searchTerm)}&status=${status}`;
      const data = await fetchApiJson<PagedResponse<AccessLogRow>>(
        instance,
        accounts[0],
        url
      );
      setLogs(data.items);
      setTotalCount(data.totalCount);
      setFailedCount(data.failedCount ?? 0);
      setError(null);
    } catch (err) {
      console.error('Failed to load sign-in logs', err);
      setError(err instanceof Error ? err.message : 'Failed to load sign-in logs.');
    } finally {
      setLoading(false);
    }
  }, [instance, accounts, page, searchTerm, status]);

  useEffect(() => {
    if (accounts.length > 0) {
      void fetchLogs();
    }
  }, [fetchLogs, accounts.length]);

  const onSearch = useCallback((val: string) => {
    setSearchTerm(val);
    setPage(1);
  }, []);

  const onFilterChange = useCallback((key: string, val: string) => {
    if (key === 'status') {
      setStatus(val);
      setPage(1);
    }
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="fade-in">
      <div className="flex gap-md mb-xl">
         <div className="card text-center" style={{ flex: 1, padding: '1.5rem' }}>
            <p className="text-xs font-semibold mb-sm text-secondary">TOTAL ATTEMPTS (24H)</p>
            <h2 className="m-0">{totalCount}</h2>
         </div>
         <div className="card text-center" style={{ flex: 1, padding: '1.5rem' }}>
            <p className="text-xs font-semibold mb-sm text-secondary">FAILED SIGN-INS</p>
            <h2 className="m-0 text-critical">{failedCount}</h2>
         </div>
      </div>

      <FilterBar 
        onSearch={onSearch}
        onFilterChange={onFilterChange}
        placeholder="Search users, IPs or applications..."
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: status,
            options: [
              { label: 'All Statuses', value: 'all' },
              { label: 'Success', value: 'success' },
              { label: 'Failed', value: 'failed' }
            ]
          }
        ]}
      />

      <div className="card" style={{ overflowX: 'auto' }}>
        <h3 className="flex items-center gap-sm mb-lg text-primary">
            <CircleUserRound size={22} className="text-primary" /> Identity Logs
        </h3>
        {error && <p className="text-critical">{error}</p>}
        {loading ? <p>Analyzing Entra ID logs...</p> : (
          <table className="identity-log-table" style={{ minWidth: '100%', width: 'max-content' }}>
            <thead>
              <tr>
                <th>TIMESTAMP</th>
                <th>IDENTITY</th>
                <th>APPLICATION</th>
                <th>SOURCE IP</th>
                <th>DEVICE</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={i}>
                  {(() => {
                    const isSuccess = log.ResultType === "0";
                    const deviceLabel = getDeviceLabel(log);
                    const deviceParts = getDeviceParts(log);
                    const timestampLabel = new Date(log.TimeGenerated).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
                    const identityLabel = log.UserPrincipalName || 'Unknown user';
                    const appLabel = log.AppDisplayName || 'Unknown app';
                    const sourceParts = getSourceLocationParts(log);
                    const locationLabel = getSourceLocationLabel(log);

                    return (
                      <>
                  <td className="identity-log-cell identity-log-timestamp" title={timestampLabel}>
                    {timestampLabel}
                  </td>
                  <td className="identity-log-cell identity-log-identity" title={identityLabel}>
                    {identityLabel}
                  </td>
                  <td className="identity-log-cell" title={appLabel}>
                    <span className="badge neutral identity-log-badge">{appLabel}</span>
                  </td>
                  <td className="identity-log-cell identity-log-cell-stacked" title={locationLabel}>
                    <div className="identity-log-stack">
                      <span className="identity-log-primary">{sourceParts.primary}</span>
                      {sourceParts.secondary && (
                        <span className="identity-log-subline">{sourceParts.secondary}</span>
                      )}
                    </div>
                  </td>
                  <td className="identity-log-cell identity-log-cell-stacked" title={deviceLabel}>
                    <div className="identity-log-stack">
                      <span className="identity-log-primary">{deviceParts.primary}</span>
                      {deviceParts.secondary && (
                        <span className="identity-log-subline">{deviceParts.secondary}</span>
                      )}
                    </div>
                  </td>
                  <td className="identity-log-cell">
                    <span className={`badge ${isSuccess ? "low" : "critical"} identity-log-status-badge`}>
                      {isSuccess ? "Success" : "Failed"}
                    </span>
                  </td>
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

function getDeviceLabel(log: AccessLogRow) {
  const values = [log.DeviceName, log.DeviceOperatingSystem, log.DeviceBrowser]
    .map(normalizeKnownValue)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  return Array.from(new Set(values)).join(' • ') || 'Unavailable';
}

function getDeviceParts(log: AccessLogRow) {
  const deviceName = normalizeKnownValue(log.DeviceName);
  const operatingSystem = normalizeKnownValue(log.DeviceOperatingSystem);
  const browser = normalizeKnownValue(log.DeviceBrowser);

  const primary = deviceName || operatingSystem || browser || 'Unavailable';
  const secondaryValues = Array.from(
    new Set(
      [operatingSystem, browser].filter(
        (value): value is string => Boolean(value) && value !== primary,
      ),
    ),
  );

  return {
    primary,
    secondary: secondaryValues.join(' • '),
  };
}

function getSourceLocationParts(log: AccessLogRow) {
  return {
    primary: log.IPAddress?.trim() || 'Unknown IP',
    secondary: getReadableLocation(log),
  };
}

function getSourceLocationLabel(log: AccessLogRow) {
  const ipAddress = log.IPAddress?.trim() || 'Unknown IP';
  const locationLabel = getReadableLocation(log);

  return locationLabel ? `${ipAddress} • ${locationLabel}` : ipAddress;
}

function getReadableLocation(log: AccessLogRow) {
  const legacyLocation = parseLegacyLocation(log.Location);
  const city = firstNonEmpty(log.City, legacyLocation.city);
  const country = toCountryName(firstNonEmpty(log.Country, legacyLocation.country));

  if (city && country) {
    return `${city}, ${country}`;
  }

  return city || country || legacyLocation.fallback;
}

function parseLegacyLocation(location?: string) {
  const value = location?.trim();

  if (!value || value.toLowerCase() === 'unknown') {
    return { city: '', country: '', fallback: '' };
  }

  const slashParts = value.split('/').map((part) => part.trim()).filter(Boolean);

  if (slashParts.length >= 2) {
    return {
      country: slashParts[0],
      city: slashParts[1],
      fallback: value,
    };
  }

  const commaParts = value.split(',').map((part) => part.trim()).filter(Boolean);

  if (commaParts.length >= 2) {
    return {
      city: commaParts[0],
      country: commaParts[1],
      fallback: value,
    };
  }

  return { city: '', country: '', fallback: value };
}

function firstNonEmpty(...values: Array<string | undefined>) {
  return values
    .map((value) => value?.trim())
    .find((value): value is string => typeof value === 'string' && value.length > 0 && value.toLowerCase() !== 'unknown') || '';
}

function normalizeKnownValue(value?: string) {
  const normalized = value?.trim();

  if (!normalized || normalized.toLowerCase() === 'unknown') {
    return '';
  }

  return normalized;
}

function toCountryName(value?: string) {
  const normalized = value?.trim();

  if (!normalized) {
    return '';
  }

  if (/^[A-Za-z]{2}$/.test(normalized)) {
    try {
      return new Intl.DisplayNames(['en'], { type: 'region' }).of(normalized.toUpperCase()) || normalized.toUpperCase();
    } catch {
      return normalized.toUpperCase();
    }
  }

  return normalized;
}

