interface PaginationProps {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
}: PaginationProps) {
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
          style={{ 
            opacity: page <= 1 ? 0.45 : 1,
            cursor: page <= 1 ? 'not-allowed' : 'pointer'
          }}
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
          style={{ 
            opacity: page >= totalPages ? 0.45 : 1,
            cursor: page >= totalPages ? 'not-allowed' : 'pointer'
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
