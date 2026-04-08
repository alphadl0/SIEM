import { Search } from 'lucide-react';
import { useState, useEffect } from 'react';

interface FilterOption {
  label: string;
  value: string;
}

interface FilterBarProps {
  onSearch: (value: string) => void;
  onFilterChange?: (key: string, value: string) => void;
  filters?: {
    key: string;
    label: string;
    options: FilterOption[];
    value: string;
  }[];
  placeholder?: string;
}

export function FilterBar({ onSearch, onFilterChange, filters, placeholder = "Search..." }: FilterBarProps) {
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(searchTerm);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm, onSearch]);

  return (
    <div className="filter-bar fade-in" style={{ 
      display: 'flex', 
      gap: '1.25rem', 
      alignItems: 'center', 
      marginBottom: '1.5rem', 
      flexWrap: 'wrap',
      background: 'rgba(255, 255, 255, 0.4)',
      backdropFilter: 'blur(10px)',
      padding: '0.75rem 1rem',
      borderRadius: '14px',
      border: '1px solid rgba(255, 255, 255, 0.6)',
      boxShadow: '0 4px 15px rgba(0,0,0,0.03)'
    }}>
      <div style={{ position: 'relative', flex: '1', minWidth: '280px' }}>
        <Search size={18} style={{ 
          position: 'absolute', 
          left: '14px', 
          top: '50%', 
          transform: 'translateY(-50%)', 
          color: 'var(--primary)',
          opacity: 0.7
        }} />
        <input
          type="text"
          className="input"
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ 
            paddingLeft: '2.75rem', 
            width: '100%', 
            height: '42px',
            background: 'white',
            border: '1px solid rgba(17, 75, 95, 0.1)',
            borderRadius: '10px'
          }}
        />
      </div>
      
      {filters?.map((f) => (
        <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ 
            fontSize: '0.8rem', 
            color: 'var(--text-secondary)', 
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.03em'
          }}>{f.label}</span>
          <select
            className="input"
            value={f.value}
            onChange={(e) => onFilterChange?.(f.key, e.target.value)}
            style={{ 
              height: '42px', 
              minWidth: '140px', 
              padding: '0 1rem',
              background: 'white',
              border: '1px solid rgba(17, 75, 95, 0.1)',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            {f.options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
