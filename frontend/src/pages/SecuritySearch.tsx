import { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { Search, Terminal, Play } from 'lucide-react';
import { fetchApiJson } from '../lib/backend';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { Pagination } from '../components/Pagination';

// Set up KQL Worker Environment

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';    

import kustoWorker from '@kusto/monaco-kusto/release/esm/kusto.worker?worker';  
import '@kusto/monaco-kusto';
import { getKustoWorker } from '@kusto/monaco-kusto';

self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === 'kusto') return new kustoWorker();
    return new editorWorker();
  },
};

loader.config({ monaco });

const PAGE_SIZE = 10;

export default function SecuritySearch() {
  const { instance, accounts } = useMsal();
  const [query, setQuery] = useState('SecurityEvent | take 20');
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const handleSearch = async () => {
    if (!accounts[0]) {
      return;
    }

    setLoading(true);

    try {
      const data = await fetchApiJson<Record<string, unknown>[]>(
        instance,
        accounts[0],
        `/api/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query })
        },
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

  const totalCount = results.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentResults = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-xl">
        <h1 className="m-0 text-xl flex items-center gap-sm"><Search size={32} /> KQL Log Explorer</h1>
      </div>

      <div className="card mb-lg">
        <h3 className="flex items-center gap-sm mb-md text-primary"><Terminal size={20}/> KQL Query Editor</h3>
        <div style={{ height: '300px', width: '100%', border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden', marginBottom: '1rem', paddingTop: '10px', background: '#1e1e1e' }}>
          <Editor
            height="100%"
            defaultLanguage="kusto"
            theme="vs-dark"
            value={query}
            onChange={(value) => setQuery(value || '')}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              fontFamily: "'Cascadia Code', 'Fira Code', monospace",
              scrollBeyondLastLine: false,
              wordWrap: 'on'
            }}
            loading={<div style={{ padding: '1rem', color: '#e2e8f0' }}>Loading Kusto IntelliSense...</div>}
            onMount={(editor) => {
              if (!accounts[0]) return;
          
              fetchApiJson<{tables?: {name: string, description?: string, columns?: {name: string, type?: string}[]}[]}>(instance, accounts[0], '/api/schema')
                .then(schemaInfo => {
                  const tables = (schemaInfo?.tables || []).map((t: {name: string, description?: string, columns?: {name: string, type?: string}[]}) => ({
                    name: t.name,
                    docstring: t.description || "",
                    columns: (t.columns || []).map((c: {name: string, type?: string}) => ({
                        name: c.name,
                        type: c.type || "string"
                    }))
                  }));
          
                  const engineSchema = {
                      clusterType: "Engine" as const,
                      cluster: {
                          connectionString: "LogAnalytics",
                          databases: [{
                              name: "Workspace",
                              tables: tables,
                              functions: [],
                              graphs: [],
                              entityGroups: [],
                              majorVersion: 0,
                              minorVersion: 0
                          }]
                      },
                      database: {
                          name: "Workspace",
                          tables: tables,
                          functions: [],
                          graphs: [],
                          entityGroups: [],
                          majorVersion: 0,
                          minorVersion: 0
                      }
                  };
          
                  getKustoWorker().then(workerAccessor => {
                      const model = editor.getModel();
                      if (!model) return;
                      workerAccessor(model.uri).then(worker => {
                          worker.setSchema(engineSchema);
                      }).catch(e => console.warn('Kusto Worker Setup Failed:', e));       
                  });
                })
                .catch(err => console.warn('Failed to fetch schema for autocomplete:', err));
            }}
          />
        </div>
        <div className="flex gap-sm">
          <button className="btn btn-no-anim flex items-center gap-sm" onClick={() => { setPage(1); handleSearch(); }} disabled={loading}>
            {loading ? <div className="spinner" /> : <Play size={18} />} {loading ? "Executing" : "Execute Query"}
          </button>
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <h3 className="text-primary mb-md">Results ({results.length})</h3>      
        {error && <p className="text-critical">{error}</p>}
        {results.length > 0 ? (
          <>
            <table className="contrast-table-head">
              <thead>
                <tr>
                  {Object.keys(results[0]).map(k => <th key={k}>{k.toUpperCase()}</th>)}
                </tr>
              </thead>
              <tbody>
                {currentResults.map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).map((v: unknown, j) => <td key={j} className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td>)}     
                  </tr>
                ))}
              </tbody>
            </table>
            
            {!loading && totalCount > 0 && (
              <Pagination
                page={page}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            )}
          </>
        ) : <p className="text-muted">No results. Enter a KQL query and click Execute.</p>}
      </div>
    </div>
  );
}




