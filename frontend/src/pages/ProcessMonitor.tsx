import { useEffect, useState, useMemo } from 'react';
import { useMsal } from '@azure/msal-react';
import { Activity, Cpu, Server } from 'lucide-react';
import { fetchApiJson } from '../lib/backend';
import { FilterBar } from '../components/FilterBar';
import { Pagination } from '../components/Pagination';

const PAGE_SIZE = 50;

export default function ProcessMonitor() {
  const { instance, accounts } = useMsal();
  const [procs, setProcs] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
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
        const query = `
          union 
          (SecurityEvent | where EventID in (4624, 4625, 4672, 4688, 4720, 4732, 4663, 7045) | where Account !in~ ('SYSTEM', 'LOCAL SERVICE', 'NETWORK SERVICE', 'DWM-1', 'DWM-2', 'DWM-3') | project TimeGenerated, Computer, NewProcessName = coalesce(NewProcessName, Activity, tostring(EventID)), CommandLine = coalesce(CommandLine, tostring(EventID)), Account),
          (Event | where EventLog == 'System' and EventID == 7045 | project TimeGenerated, Computer, NewProcessName = tostring(Source), CommandLine = coalesce(RenderedDescription, ParameterXml, tostring(EventID)), Account = "System"),
          (LinuxAudit_CL | where RawData has_any ('sensitive_auth', 'exec_tracking', 'type=USER_CMD') | extend User = extract("auid=([^ ]+)", 1, RawData) | where User != "4294967295" | extend Process = extract("exe=\\"([^\\"]+)\\"", 1, RawData), Cmd = extract("comm=\\"([^\\"]+)\\"", 1, RawData) | where Process !in~ ('/usr/bin/dash', '/usr/bin/dircolors', '/usr/bin/dirname', '/usr/bin/basename', '/usr/bin/locale', '/usr/bin/cut', '/usr/bin/gawk', '/usr/bin/sed', '/usr/bin/id', '/usr/bin/grep', '/usr/bin/lesspipe', '/bin/sh', '/bin/bash') | project TimeGenerated, Computer, NewProcessName = coalesce(Process, "Auditd"), CommandLine = Cmd, Account = User),
            (Syslog | where ProcessName in~ ('sshd', 'sudo', 'su', 'useradd', 'usermod', 'passwd', 'groupadd', 'chown', 'chmod', 'whoami') | extend ExtractedUser = coalesce(extract("([a-zA-Z0-9_-]+) : TTY=", 1, SyslogMessage), extract("user=([a-zA-Z0-9_-]+)", 1, SyslogMessage)) | project TimeGenerated, Computer = HostName, NewProcessName = ProcessName, CommandLine = SyslogMessage, Account = iif(isnotempty(ExtractedUser), ExtractedUser, "Syslog"))
          | order by TimeGenerated desc
          | take 1000
        `.trim();
        const data = await fetchApiJson<Record<string, any>[]>(
          instance,
          accounts[0],
          `/api/search`,
          { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
          },
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
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      p.Computer?.toLowerCase().includes(s) ||
      p.NewProcessName?.toLowerCase().includes(s) ||
      p.CommandLine?.toLowerCase().includes(s) ||
      p.Account?.toLowerCase().includes(s)
    );
  });

  const totalCount = filteredProcs.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentProcs = filteredProcs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="fade-in">
      <FilterBar
        onSearch={(term) => {
          setSearchTerm(term);
          setPage(1);
        }}
        placeholder="Filter by endpoint, process or actor..."
      />

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
                <tr key={i}>
                     <td className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{new Date(p.TimeGenerated).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
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
