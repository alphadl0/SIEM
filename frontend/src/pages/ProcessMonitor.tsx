import { useEffect, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { Activity, Cpu } from 'lucide-react';
import { fetchApiJson } from '../lib/backend';

export default function ProcessMonitor() {
  const { instance, accounts } = useMsal();
  const [procs, setProcs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          (LinuxAudit_CL | where RawData has_any ('sensitive_auth', 'exec_tracking', 'type=USER_CMD') | extend User = extract("auid=([^ ]+)", 1, RawData) | where User != "4294967295" | extend Process = extract("exe=\\\"([^\\\"]+)\\\"", 1, RawData), Cmd = extract("comm=\\\"([^\\\"]+)\\\"", 1, RawData) | project TimeGenerated, Computer, NewProcessName = coalesce(Process, "Auditd"), CommandLine = Cmd, Account = User),
          (Syslog | where ProcessName in~ ('sshd', 'sudo', 'useradd') | project TimeGenerated, Computer = HostName, NewProcessName = ProcessName, CommandLine = SyslogMessage, Account = "Syslog")
          | order by TimeGenerated desc 
          | take 50
        `.trim();
        const data = await fetchApiJson<any[]>(
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

  return (
    <div className="fade-in">
      <div className="card">
        <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={22} className="text-primary" /> Forensic Processes
        </h3>
        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
        {loading ? <p>Analyzing system execution logs...</p> : (
          <table>
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
              {procs.map((p, i) => (
                <tr key={i}>
                   <td style={{ fontSize: '0.75rem', opacity: 0.7 }}>{new Date(p.TimeGenerated).toLocaleTimeString()}</td>
                   <td style={{ fontWeight: 600 }}>{p.Computer}</td>
                   <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '4px', borderRadius: '4px' }}><Cpu size={14} /></div>
                        {p.NewProcessName?.split('\\').pop() || p.NewProcessName}
                    </div>
                   </td>
                   <td style={{ maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.8rem' }}>
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
