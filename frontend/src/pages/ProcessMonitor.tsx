import { useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { Activity, Cpu } from 'lucide-react';
import { fetchApiJson } from '../lib/backend';
import { FilterBar } from '../components/FilterBar';

export default function ProcessMonitor() {
  const { instance, accounts } = useMsal();
  const [procs, setProcs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

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
          (Syslog | where ProcessName in~ ('sshd', 'sudo', 'useradd') | project TimeGenerated, Computer = HostName, NewProcessName = ProcessName, CommandLine = SyslogMessage, Account = "Syslog")
          | order by TimeGenerated desc 
          | take 50
        `.trim();
        const data = await fetchApiJson<Record<string, unknown>[]>(
          instance,
          accounts[0],
          `/api/search?query=${encodeURIComponent(query)}`,
          { method: 'POST' },
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
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      p.Computer?.toLowerCase().includes(s) ||
      p.NewProcessName?.toLowerCase().includes(s) ||
      p.CommandLine?.toLowerCase().includes(s) ||
      p.Account?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="fade-in">
      <FilterBar 
        onSearch={setSearchTerm}
        placeholder="Filter by endpoint, process or actor..."
      />

      <div className="card">
        <h3 className="flex items-center gap-sm mb-lg text-primary">
            <Activity size={22} className="text-primary" /> Forensic Processes
        </h3>
        {error && <p className="text-critical">{error}</p>}
        {loading ? <p>Analyzing system execution logs...</p> : (
          <table className="contrast-table-head">
            <thead>
              <tr>
                <th>TIME</th>
                <th>ENDPOINT</th>
                <th>PROCESS</th>
                <th>COMMAND LINE</th>
                <th>ACTOR</th>
              </tr>
            </thead>
            <tbody>
              {filteredProcs.map((p, i) => (
                <tr key={i}>
                   <td className="text-xs text-muted font-medium">{new Date(p.TimeGenerated).toLocaleTimeString()}</td>
                   <td className="font-semibold">{p.Computer}</td>
                   <td>
                    <div className="flex items-center gap-sm">
                        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '4px', borderRadius: '4px' }}><Cpu size={14} /></div>
                        {p.NewProcessName?.split('\\').pop() || p.NewProcessName}
                    </div>
                   </td>
                   <td style={{ maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }} className="text-sm">
                    {p.CommandLine || 'System Execution'}
                   </td>
                   <td><span className="badge medium">{p.Account}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
