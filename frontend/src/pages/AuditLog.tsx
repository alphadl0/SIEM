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
                    const timestampLabel = formatTimestamp(log.ActivityDateTime);

                    return (
                      <>
                        <td className="identity-log-cell">{timestampLabel}</td>
                        <td className="identity-log-cell">{log.Identity}</td>
                        <td className="identity-log-cell">{log.ActivityDisplayName}</td>
                        <td className="identity-log-cell">{log.OperationName}</td>
                        <td className="identity-log-cell">{log.Category}</td>
                        <td className="identity-log-cell">{log.LoggedByService}</td>
                        <td className="identity-log-cell">{log.Result}</td>
                        <td className="identity-log-cell">{log.ResultDescription}</td>
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
