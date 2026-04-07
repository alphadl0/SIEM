import { useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { CircleUserRound } from 'lucide-react';
import { fetchApiJson, type PagedResponse } from '../lib/backend';

const PAGE_SIZE = 25;

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

  useEffect(() => {
    const fetchLogs = async () => {
      if (!accounts[0]) {
        return;
      }

      try {
        setLoading(true);
        const data = await fetchApiJson<PagedResponse<AccessLogRow>>(
          instance,
          accounts[0],
          `/api/signin-logs?page=${page}&pageSize=${PAGE_SIZE}`,
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
    };

    if (accounts.length > 0) {
      void fetchLogs();
    }
  }, [instance, accounts, page]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
         <div className="card" style={{ flex: 1, textAlign: 'center', padding: '1.5rem' }}>
            <p style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginBottom: '0.5rem' }}>TOTAL ATTEMPTS (24H)</p>
            <h2 style={{ margin: 0 }}>{totalCount}</h2>
         </div>
         <div className="card" style={{ flex: 1, textAlign: 'center', padding: '1.5rem' }}>
            <p style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginBottom: '0.5rem' }}>FAILED SIGN-INS</p>
            <h2 style={{ margin: 0, color: '#ef4444' }}>{failedCount}</h2>
         </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CircleUserRound size={22} className="text-primary" /> Identity Logs
        </h3>
        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
        {loading ? <p>Analyzing Entra ID logs...</p> : (
          <table className="identity-log-table">
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
                    const timestampLabel = new Date(log.TimeGenerated).toLocaleString();
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
        {!loading && totalCount > PAGE_SIZE && (
          <PaginationBar
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

function PaginationBar({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        Showing {start}-{end} of {totalCount}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button
          className="btn-outline"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          style={{ opacity: page <= 1 ? 0.45 : 1 }}
        >
          Previous
        </button>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', minWidth: '72px', textAlign: 'center' }}>
          Page {page} / {totalPages}
        </span>
        <button
          className="btn-outline"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          style={{ opacity: page >= totalPages ? 0.45 : 1 }}
        >
          Next
        </button>
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
