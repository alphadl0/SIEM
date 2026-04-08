import { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { Search, Terminal, Play } from 'lucide-react';
import { fetchApiJson } from '../lib/backend';

export default function SecuritySearch() {
  const { instance, accounts } = useMsal();
  const [query, setQuery] = useState('SecurityEvent | take 20');
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!accounts[0]) {
      return;
    }

    setLoading(true);

    try {
      const data = await fetchApiJson<Record<string, unknown>[]>(
        instance,
        accounts[0],
        `/api/search?query=${encodeURIComponent(query)}`,
        { method: 'POST' },
      );
      setResults(data);
      setError(null);
    } catch (err) {
      console.error('Failed to run KQL search', err);
      setError(err instanceof Error ? err.message : 'Failed to run KQL search.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-md">
        <h1 className="m-0 text-xl flex items-center gap-sm"><Search size={28} /> KQL Log Explorer</h1>
      </div>
      
      <div className="card mb-lg">
        <h3 className="flex items-center gap-sm mb-md text-primary"><Terminal size={20}/> KQL Query Editor</h3>
        <textarea 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: '100%', height: '100px', background: '#1e293b', color: '#e2e8f0', border: 'none', padding: '1rem', borderRadius: '8px', fontFamily: 'monospace' }}
          className="mb-md"
        />
        <button className="btn flex items-center gap-sm" onClick={handleSearch} disabled={loading}>
          <Play size={18}/> {loading ? 'Running...' : 'Execute Query'}
        </button>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <h3 className="text-primary mb-md">Results ({results.length})</h3>
        {error && <p className="text-critical">{error}</p>}
        {results.length > 0 ? (
          <table>
            <thead>
              <tr>
                {Object.keys(results[0]).map(k => <th key={k}>{k.toUpperCase()}</th>)}
              </tr>
            </thead>
            <tbody>
              {results.map((row, i) => (
                <tr key={i}>
                  {Object.values(row).map((v: unknown, j) => <td key={j} className="text-sm">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-muted">No results. Enter a KQL query and click Execute.</p>}
      </div>
    </div>
  );
}
