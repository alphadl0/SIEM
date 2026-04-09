import { useEffect, useState, useMemo } from 'react';
import { useMsal } from '@azure/msal-react';
import { Activity, Cpu, Server } from 'lucide-react';
import { formatTimestamp } from '../lib/format';
import { fetchApiJson } from '../lib/backend';
import { Pagination } from '../components/Pagination';

const PAGE_SIZE = 50;

export interface ProcessRecord {
  TimeGenerated: string;
  Computer: string;
  NewProcessName: string;
  CommandLine: string;
  Account: string;
}

export default function ProcessMonitor() {
  const { instance, accounts } = useMsal();
  const [procs, setProcs] = useState<ProcessRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);

  const assetCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of procs) {
      if (!p.Computer) continue;
      counts[p.Computer] = (counts[p.Computer] || 0) + 1;
    }
    return Object.entries(counts).sort((a,b) => b[1] - a[1]);
  }, [procs]);

  useEffect(() => {
    const fetchProcs = async () => {
      if (!accounts[0]) {
        return;
      }

      try {
        const data = await fetchApiJson<ProcessRecord[]>(
          instance,
          accounts[0],
          `/api/process-logs`,
        );
        setProcs(data);
        setError(null);
      } catch (err) {
        console.error('Failed to load process telemetry', err);
        setError(err instanceof Error ? err.message : 'Failed to load process telemetry.');
      } finally {
        setLoading(false);
      }
    };

    if (accounts.length > 0) {
      void fetchProcs();
    }
  }, [instance, accounts]);

  const filteredProcs = procs.filter(p => {
    if (selectedAsset && p.Computer !== selectedAsset) return false;
    return true;
  });

  const totalCount = filteredProcs.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentProcs = filteredProcs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="fade-in">
      <div className="card" style={{ overflowX: 'auto' }}>
        <h3 className="flex items-center justify-between gap-sm mb-md text-primary">
          <div className="flex items-center gap-sm">
            <Activity size={22} className="text-primary" /> Forensic Processes
            {selectedAsset && <span className="badge neutral ml-sm">Filtered by: {selectedAsset}</span>}
          </div>
        </h3>

        <div className="flex flex-wrap gap-sm mb-lg">
          {assetCounts.map(([computer, count]) => (
            <button 
              key={computer} 
              className={`flex items-center gap-sm transition-all`}
              onClick={() => {
                setSelectedAsset(selectedAsset === computer ? null : computer);
                setPage(1);
              }}
              style={{
                background: selectedAsset === computer ? 'var(--primary)' : '#f8fafc',
                color: selectedAsset === computer ? 'white' : 'var(--text-primary)',
                border: selectedAsset === computer ? '1px solid var(--primary)' : '1px solid var(--border-light)',
                padding: '6px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: '0.85rem'
              }}
            >
              <Server size={14} style={{ color: selectedAsset === computer ? 'white' : '#16a34a' }} />
              {computer}
              <span 
                style={{ 
                  background: selectedAsset === computer ? 'rgba(255,255,255,0.2)' : '#e2e8f0', 
                  padding: '2px 6px', 
                  borderRadius: '12px',
                  fontSize: '0.75rem'
                }}
              >
                {count}
              </span>
            </button>
          ))}
        </div>

        {error && <p className="text-critical">{error}</p>}
        {loading ? <p>Analyzing system execution logs...</p> : (
          <table className="contrast-table-head">
            <thead>
              <tr>
                <th>TIMESTAMP</th>
                <th>ENDPOINT</th>
                <th>PROCESS</th>
                <th>COMMAND LINE</th>
                <th>ACTOR</th>
              </tr>
            </thead>
            <tbody>
              {currentProcs.map((p, i) => (
                <tr key={`${p.TimeGenerated}-${p.Computer}-${p.Account}-${i}`}>
                     <td className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{formatTimestamp(p.TimeGenerated)}</td>
                   <td className="font-semibold">{p.Computer}</td>
                   <td>
                    <div className="flex items-center gap-sm">
                        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '4px', borderRadius: '4px' }}><Cpu size={14} /></div>
                        {p.NewProcessName?.split('\\').pop() || p.NewProcessName}
                    </div>
                   </td>
                   <td className="text-sm" style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {p.CommandLine || 'System Execution'}
                   </td>
                   <td><span className="badge medium">{p.Account}</span></td>
                </tr>
              ))}
              {currentProcs.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No process telemetry found.
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
