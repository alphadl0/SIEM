import { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { Search, Terminal, Play } from 'lucide-react';
import { fetchApiJson } from '../lib/backend';

export default function SecuritySearch() {
  const { instance, accounts } = useMsal();
  const [query, setQuery] = useState('SecurityEvent | take 20');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!accounts[0]) {
      return;
    }

    setLoading(true);

    try {
      const data = await fetchApiJson<any[]>(
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
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}><Search size={28} style={{ verticalAlign: 'middle', marginRight: '0.8rem' }} /> KQL Log Explorer</h1>
      </div>
      
      <div className="card" style={{marginBottom: '1.5rem'}}>
        <h3 style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem'}}><Terminal size={20}/> KQL Query Editor</h3>
        <textarea 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: '100%', height: '100px', background: '#1e293b', color: '#e2e8f0', border: 'none', padding: '1rem', borderRadius: '8px', fontFamily: 'monospace', marginBottom: '1rem' }}
        />
        <button className="btn" onClick={handleSearch} disabled={loading} style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
          <Play size={18}/> {loading ? 'Running...' : 'Execute Query'}
        </button>
      </div>

      <div className="card" style={{overflowX: 'auto'}}>
        <h3>Results ({results.length})</h3>
        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
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
                  {Object.values(row).map((v: any, j) => <td key={j} style={{fontSize: '0.8rem'}}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p style={{color: 'var(--text-muted)'}}>No results. Enter a KQL query and click Execute.</p>}
      </div>
    </div>
  );
}
