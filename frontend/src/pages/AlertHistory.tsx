import { useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { ShieldAlert } from 'lucide-react';
import { useSignalR, type AlertEvent } from '../hooks/useSignalR';
import { fetchApiJson, type PagedResponse } from '../lib/backend';

const PAGE_SIZE = 25;

export default function AlertHistory() {
  const { instance, accounts } = useMsal();
  const { alerts: liveAlerts } = useSignalR();
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!accounts[0]) {
        return;
      }

      try {
        setLoading(true);
        const data = await fetchApiJson<PagedResponse<AlertEvent>>(
          instance,
          accounts[0],
          `/api/alerts?page=${page}&pageSize=${PAGE_SIZE}`,
        );
        setAlerts(data.items);
        setTotalCount(data.totalCount);
        setError(null);
      } catch (err) {
        console.error('Failed to load alert history', err);
        setError(err instanceof Error ? err.message : 'Failed to load alert history.');
      } finally {
        setLoading(false);
      }
    };

    if (accounts.length > 0) {
      void fetchHistory();
    }
  }, [instance, accounts, page]);

  const displayedAlerts = alerts.length > 0 ? alerts : page === 1 ? liveAlerts : [];
  const effectiveTotalCount = totalCount > 0 ? totalCount : displayedAlerts.length;
  const totalPages = Math.max(1, Math.ceil(effectiveTotalCount / PAGE_SIZE));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0 }}><ShieldAlert size={32} style={{ verticalAlign: 'middle', marginRight: '0.8rem' }} /> Security Incidents</h1>
      </div>

      <div className="card">
        {error && displayedAlerts.length === 0 && <p style={{ color: '#b91c1c' }}>{error}</p>}
        {loading ? <p>Loading history...</p> : (
          <table className="contrast-table-head incident-table">
            <thead>
              <tr>
                <th>TIMESTAMP</th>
                <th>USE CASE</th>
                <th>SEVERITY</th>
                <th>VM</th>
                <th>DESCRIPTION</th>
              </tr>
            </thead>
            <tbody>
              {displayedAlerts.map((alert, i) => (
                <tr key={i}>
                  <td className="incident-cell incident-timestamp" title={new Date(alert.timestamp).toLocaleString()}>
                    {new Date(alert.timestamp).toLocaleString()}
                  </td>
                  <td className="incident-cell incident-strong" title={alert.useCaseId}>
                    {alert.useCaseId}
                  </td>
                  <td className="incident-cell">
                    <span className={`badge ${alert.severity === 'Critical' ? 'critical' : alert.severity === 'High' ? 'high' : 'medium'} incident-status-badge`}>
                      {alert.severity}
                    </span>
                  </td>
                  <td className="incident-cell" title={alert.vm}>
                    <span className="incident-truncate">{alert.vm}</span>
                  </td>
                  <td className="incident-cell" title={alert.description}>
                    <span className="incident-truncate">{alert.description}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && effectiveTotalCount > PAGE_SIZE && (
          <PaginationBar
            page={page}
            totalPages={totalPages}
            totalCount={effectiveTotalCount}
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
