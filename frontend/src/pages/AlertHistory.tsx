import { useCallback, useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { ShieldAlert } from 'lucide-react';
import { useSignalR, type AlertEvent } from '../hooks/useSignalR';
import { fetchApiJson, type PagedResponse } from '../lib/backend';
import { FilterBar } from '../components/FilterBar';
import { Pagination } from '../components/Pagination';

const PAGE_SIZE = 25;

export default function AlertHistory() {
  const { instance, accounts } = useMsal();
  const { alerts: liveAlerts } = useSignalR();
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [severity, setSeverity] = useState('all');

  const fetchHistory = useCallback(async () => {
    if (!accounts[0]) {
      return;
    }

    try {
      setLoading(true);
      const url = `/api/alerts?page=${page}&pageSize=${PAGE_SIZE}&searchTerm=${encodeURIComponent(searchTerm)}&severity=${severity}`;
      const data = await fetchApiJson<PagedResponse<AlertEvent>>(
        instance,
        accounts[0],
        url
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
  }, [instance, accounts, page, searchTerm, severity]);

  useEffect(() => {
    if (accounts.length > 0) {
      void fetchHistory();
    }
  }, [fetchHistory, accounts.length]);

  const onSearch = useCallback((val: string) => {
    setSearchTerm(val);
    setPage(1); // Reset to first page
  }, []);

  const onFilterChange = useCallback((key: string, val: string) => {
    if (key === 'severity') {
      setSeverity(val);
      setPage(1);
    }
  }, []);

  const displayedAlerts = (alerts.length > 0 || searchTerm !== '' || severity !== 'all') ? alerts : (page === 1 ? liveAlerts : []);
  const effectiveTotalCount = totalCount > 0 ? totalCount : displayedAlerts.length;
  const totalPages = Math.max(1, Math.ceil(effectiveTotalCount / PAGE_SIZE));

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-xl">
        <h1 className="m-0 text-xl flex items-center gap-sm"><ShieldAlert size={32} /> Security Incidents</h1>
      </div>

      <FilterBar 
        onSearch={onSearch}
        onFilterChange={onFilterChange}
        placeholder="Filter by Source, Use Case or ID..."
        filters={[
          {
            key: 'severity',
            label: 'Severity',
            value: severity,
            options: [
              { label: 'All Levels', value: 'all' },
              { label: 'Critical', value: 'Critical' },
              { label: 'High', value: 'High' },
              { label: 'Medium', value: 'Medium' },
              { label: 'Low', value: 'Low' }
            ]
          }
        ]}
      />

      <div className="card">
        {error && displayedAlerts.length === 0 && <p className="text-critical">{error}</p>}
        {(loading && alerts.length === 0) ? <p>Loading history...</p> : (
          <table className="contrast-table-head incident-table">
            <thead>
              <tr>
                <th>TIMESTAMP</th>
                <th>USE CASE</th>
                <th>SEVERITY</th>
                <th>SOURCE</th>
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
                    <span className="badge neutral incident-truncate">{alert.vm}</span>
                  </td>
                  <td className="incident-cell" title={alert.description}>
                    <span className="incident-truncate">{alert.description}</span>
                  </td>
                </tr>
              ))}
              {displayedAlerts.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="text-center text-muted" style={{ padding: '2rem' }}>
                    No matching incidents found for your filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        {!loading && effectiveTotalCount > PAGE_SIZE && (
          <Pagination
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

