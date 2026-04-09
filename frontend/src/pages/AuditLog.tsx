import { useCallback, useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { FileText } from 'lucide-react';
import { formatTimestamp } from '../lib/format';
import { fetchApiJson, type PagedResponse } from '../lib/backend';
import { Pagination } from '../components/Pagination';

const PAGE_SIZE = 10;

interface AuditLogRow {
  TimeGenerated: string;
  ActivityDisplayName?: string;
  Category?: string;
  Identity?: string;
  LoggedByService?: string;
  Result?: string;
  ResultDescription?: string;
  TargetResources?: string;
}

export default function AuditLog() {
  const { instance, accounts } = useMsal();
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!accounts[0]) {
      return;
    }

    try {
      setLoading(true);
      const url = `/api/audit-logs?page=${page}&pageSize=${PAGE_SIZE}`;
      const data = await fetchApiJson<PagedResponse<AuditLogRow>>(
        instance,
        accounts[0],
        url
      );
      setLogs(data.items);
      setTotalCount(data.totalCount);
      setFailedCount(data.failedCount ?? 0);
      setError(null);
    } catch (err) {
      console.error('Failed to load audit logs', err);
      setError(err instanceof Error ? err.message : 'Failed to load audit logs.');
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
      <div className="flex gap-md mb-xl">
         <div className="card text-center" style={{ flex: 1, padding: '1.5rem' }}>
            <p className="text-xs font-semibold mb-sm text-secondary">TOTAL AUDIT EVENTS (1H)</p>
            <h2 className="m-0">{totalCount}</h2>
         </div>
         <div className="card text-center" style={{ flex: 1, padding: '1.5rem' }}>
            <p className="text-xs font-semibold mb-sm text-secondary">FAILED EVENTS</p>
            <h2 className="m-0 text-critical">{failedCount}</h2>
         </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <h3 className="flex items-center gap-sm mb-lg text-primary">
            <FileText size={22} className="text-primary" /> Audit Logs
        </h3>
        {error && <p className="text-critical">{error}</p>}
        {loading ? <p>Analyzing Entra ID audit logs...</p> : (
          <table className="identity-log-table" style={{ minWidth: '100%', width: 'max-content' }}>
            <thead>
              <tr>
                <th>TIMESTAMP</th>
                <th>IDENTITY</th>
                <th>ACTIVITY</th>
                <th>CATEGORY</th>
                <th>SERVICE</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={i}>
                  {(() => {
                    const isSuccess = log.Result?.toLowerCase() === "success";
                    const timestampLabel = formatTimestamp(log.TimeGenerated);
                    const identityLabel = log.Identity || 'Unknown user';
                    const activityLabel = log.ActivityDisplayName || 'Unknown activity';
                    const categoryLabel = log.Category || 'Unknown category';
                    const serviceLabel = log.LoggedByService || 'Unknown service';

                    return (
                      <>
                  <td className="identity-log-cell identity-log-timestamp" title={timestampLabel}>
                    {timestampLabel}
                  </td>
                  <td className="identity-log-cell identity-log-identity" title={identityLabel}>
                    {identityLabel}
                  </td>
                  <td className="identity-log-cell" title={activityLabel}>
                    <span className="badge neutral identity-log-badge">{activityLabel}</span>
                    {log.ResultDescription && (
                        <div style={{fontSize: '0.75rem', marginTop: '4px', color: 'var(--text-muted)'}}>{log.ResultDescription}</div>
                    )}
                  </td>
                  <td className="identity-log-cell">
                    {categoryLabel}
                  </td>
                  <td className="identity-log-cell">
                    {serviceLabel}
                  </td>
                  <td className="identity-log-cell">
                    <span className={`badge ${isSuccess ? "low" : "critical"} identity-log-status-badge`}>
                      {log.Result || 'Unknown'}
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
