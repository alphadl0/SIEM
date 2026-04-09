import { useCallback, useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { FileText } from 'lucide-react';
import { formatTimestamp } from '../lib/format';
import { fetchApiJson, type PagedResponse } from '../lib/backend';
import { Pagination } from '../components/Pagination';

const PAGE_SIZE = 10;

interface AuditLogRow {
  ActivityDateTime: string;
  ActivityDisplayName?: string;
  Category?: string;
  Identity?: string;
  LoggedByService?: string;
  OperationName?: string;
  Result?: string;
  ResultDescription?: string;
}

export default function AuditLog() {
  const { instance, accounts } = useMsal();
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
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
      const url = `/api/audit-logs?page=${page}&pageSize=${PAGE_SIZE}`;
      const data = await fetchApiJson<PagedResponse<AuditLogRow>>(
        instance,
        accounts[0],
        url
      );
      setLogs(data.items);
      setTotalCount(data.totalCount);
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
      <div className="card" style={{ overflowX: 'auto' }}>
        <h3 className="flex items-center gap-sm mb-lg text-primary">
            <FileText size={22} className="text-primary" /> Audit Logs
        </h3>
        {error && <p className="text-critical">{error}</p>}
        {loading ? <p>Analyzing Entra ID audit logs...</p> : (
          <table className="identity-log-table" style={{ minWidth: '100%', width: 'max-content' }}>
            <thead>
              <tr>
                <th>Activity Date Time</th>
                <th>Identity</th>
                <th>Activity Display Name</th>
                <th>Operation Name</th>
                <th>Category</th>
                <th>Logged By Service</th>
                <th>Result</th>
                <th>Result Description</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={i}>
                  {(() => {
                    const isSuccess = log.Result?.toLowerCase() === "success";
                    const timestampLabel = formatTimestamp(log.ActivityDateTime);
                    const identityLabel = log.Identity || 'Unknown identity';
                    const activityLabel = log.ActivityDisplayName || 'Unknown activity';
                    const operationLabel = log.OperationName || 'Unknown operation';
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
                  </td>
                  <td className="identity-log-cell" title={operationLabel}>
                    {operationLabel}
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
                  <td className="identity-log-cell">
                    {log.ResultDescription && (
                        <div style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>{log.ResultDescription}</div>
                    )}
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
