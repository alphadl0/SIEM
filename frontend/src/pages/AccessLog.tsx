import { useCallback, useEffect, useState, type DragEventHandler } from 'react';
import { useMsal } from '@azure/msal-react';
import { CircleUserRound } from 'lucide-react';
import { formatTimestamp } from '../lib/format';
import { fetchApiJson, type PagedResponse } from '../lib/backend';
import { Pagination } from '../components/Pagination';

const PAGE_SIZE = 10;

interface LocationDetails {
  city?: string;
  state?: string;
  countryOrRegion?: string;
  geoCoordinates?: {
    latitude?: number;
    longitude?: number;
  };
}

interface DeviceDetail {
  displayName?: string;
  operatingSystem?: string;
  browser?: string;
  trustType?: string;
}

interface AccessLogRow {
  CreatedDateTime: string;
  UserPrincipalName?: string;
  UserDisplayName?: string;
  UserType?: string;
  IPAddress?: string;
  LocationDetails?: LocationDetails;
  DeviceDetail?: DeviceDetail;
  RiskLevelAggregated?: string;
  RiskLevelDuringSignIn?: string;
  RiskState?: string;
  RiskEventTypes_V2?: string;
  RiskDetail?: string;
  ConditionalAccessStatus?: string;
  AppDisplayName?: string;
  ClientAppUsed?: string;
  ResourceDisplayName?: string;
  ResultSignature?: string;
  ResultDescription?: string;
  Identity?: string;
  OperationName?: string;
}

type ColumnKey =
  | 'CreatedDateTime'
  | 'UserPrincipalName'
  | 'UserDisplayName'
  | 'UserType'
  | 'IPAddress'
  | 'LocationDetails'
  | 'DeviceDetail'
  | 'RiskLevelAggregated'
  | 'RiskLevelDuringSignIn'
  | 'RiskState'
  | 'RiskEventTypes_V2'
  | 'RiskDetail'
  | 'ConditionalAccessStatus'
  | 'AppDisplayName'
  | 'ClientAppUsed'
  | 'ResourceDisplayName'
  | 'ResultSignature'
  | 'ResultDescription'
  | 'Identity'
  | 'OperationName';

interface AccessLogColumn {
  key: ColumnKey;
  label: string;
  render: (log: AccessLogRow) => string;
}

const ACCESS_LOG_COLUMNS: AccessLogColumn[] = [
  { key: 'CreatedDateTime', label: 'Created Date Time', render: (log) => formatTimestamp(log.CreatedDateTime) },
  { key: 'UserPrincipalName', label: 'User Principal Name', render: (log) => log.UserPrincipalName ?? '' },
  { key: 'UserDisplayName', label: 'User Display Name', render: (log) => log.UserDisplayName ?? '' },
  { key: 'UserType', label: 'User Type', render: (log) => log.UserType ?? '' },
  { key: 'IPAddress', label: 'IP Address', render: (log) => log.IPAddress ?? '' },
  { key: 'LocationDetails', label: 'Location Details', render: (log) => getReadableLocation(log) },
  { key: 'DeviceDetail', label: 'Device Detail', render: (log) => getDeviceLabel(log) },
  { key: 'RiskLevelAggregated', label: 'Risk Level Aggregated', render: (log) => log.RiskLevelAggregated ?? '' },
  { key: 'RiskLevelDuringSignIn', label: 'Risk Level During Sign In', render: (log) => log.RiskLevelDuringSignIn ?? '' },
  { key: 'RiskState', label: 'Risk State', render: (log) => log.RiskState ?? '' },
  { key: 'RiskEventTypes_V2', label: 'Risk Event Types V2', render: (log) => log.RiskEventTypes_V2 ?? '' },
  { key: 'RiskDetail', label: 'Risk Detail', render: (log) => log.RiskDetail ?? '' },
  { key: 'ConditionalAccessStatus', label: 'Conditional Access Status', render: (log) => log.ConditionalAccessStatus ?? '' },
  { key: 'AppDisplayName', label: 'App Display Name', render: (log) => log.AppDisplayName ?? '' },
  { key: 'ClientAppUsed', label: 'Client App Used', render: (log) => log.ClientAppUsed ?? '' },
  { key: 'ResourceDisplayName', label: 'Resource Display Name', render: (log) => log.ResourceDisplayName ?? '' },
  { key: 'ResultSignature', label: 'Result Signature', render: (log) => log.ResultSignature ?? '' },
  { key: 'ResultDescription', label: 'Result Description', render: (log) => log.ResultDescription ?? '' },
  { key: 'Identity', label: 'Identity', render: (log) => log.Identity ?? '' },
  { key: 'OperationName', label: 'Operation Name', render: (log) => log.OperationName ?? '' },
];

const ACCESS_LOG_COLUMN_MAP = ACCESS_LOG_COLUMNS.reduce(
  (acc, column) => ({ ...acc, [column.key]: column }),
  {} as Record<ColumnKey, AccessLogColumn>
);

export default function AccessLog() {
  const { instance, accounts } = useMsal();
  const [logs, setLogs] = useState<AccessLogRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(() => ACCESS_LOG_COLUMNS.map((column) => column.key));
  const [draggedColumn, setDraggedColumn] = useState<ColumnKey | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ColumnKey | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!accounts[0]) {
      return;
    }

    try {
      setLoading(true);
      const url = `/api/signin-logs?page=${page}&pageSize=${PAGE_SIZE}`;
      const data = await fetchApiJson<PagedResponse<AccessLogRow>>(
        instance,
        accounts[0],
        url
      );
      setLogs(data.items);
      setTotalCount(data.totalCount);
      setError(null);
    } catch (err) {
      console.error('Failed to load sign-in logs', err);
      setError(err instanceof Error ? err.message : 'Failed to load sign-in logs.');
    } finally {
      setLoading(false);
    }
  }, [instance, accounts, page]);

  useEffect(() => {
    if (accounts.length > 0) {
      void fetchLogs();
    }
  }, [fetchLogs, accounts.length]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const handleColumnDragStart = (columnKey: ColumnKey): DragEventHandler<HTMLTableCellElement> => () => {
    setDraggedColumn(columnKey);
    setDragOverColumn(null);
  };
  const handleColumnDragOver = (columnKey: ColumnKey): DragEventHandler<HTMLTableCellElement> => (event) => {
    event.preventDefault();
    if (columnKey !== dragOverColumn) {
      setDragOverColumn(columnKey);
    }
  };
  const handleColumnDrop = (columnKey: ColumnKey): DragEventHandler<HTMLTableCellElement> => (event) => {
    event.preventDefault();
    setColumnOrder((currentOrder) => reorderColumns(currentOrder, draggedColumn, columnKey));
    setDraggedColumn(null);
    setDragOverColumn(null);
  };
  const handleColumnDragEnd: DragEventHandler<HTMLTableCellElement> = () => {
    setDraggedColumn(null);
    setDragOverColumn(null);
  };

  return (
    <div className="fade-in">
      <div className="card" style={{ overflowX: 'auto' }}>
        <h3 className="flex items-center gap-sm mb-lg text-primary">
            <CircleUserRound size={22} className="text-primary" /> Identity Logs
        </h3>
        {error && <p className="text-critical">{error}</p>}
        {loading ? <p>Analyzing Entra ID logs...</p> : (
          <table className="identity-log-table" style={{ minWidth: '100%', width: 'max-content' }}>
            <thead>
              <tr>
                {columnOrder.map((columnKey) => {
                  const column = ACCESS_LOG_COLUMN_MAP[columnKey];
                  return (
                    <th
                      key={columnKey}
                      draggable
                      className={`identity-log-header-drag${draggedColumn === columnKey ? ' dragging' : ''}${dragOverColumn === columnKey ? ' drag-over' : ''}`}
                      onDragStart={handleColumnDragStart(columnKey)}
                      onDragOver={handleColumnDragOver(columnKey)}
                      onDrop={handleColumnDrop(columnKey)}
                      onDragEnd={handleColumnDragEnd}
                      title="Drag to reorder columns"
                    >
                      {column.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={i}>
                  {columnOrder.map((columnKey) => (
                    <td key={columnKey} className="identity-log-cell">
                      {ACCESS_LOG_COLUMN_MAP[columnKey].render(log)}
                    </td>
                  ))}
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

function normalizeKnownValue(value?: string | number | null): string {
  if (value == null) return '';
  const str = String(value).trim();
  if (!str || str.toLowerCase() === 'unknown' || str.toLowerCase() === 'null') {
    return '';
  }
  return str;
}

function getDeviceLabel(log: AccessLogRow) {
  const d = log.DeviceDetail || {};
  const values = [d.displayName, d.operatingSystem, d.browser, d.trustType]
    .map(normalizeKnownValue)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  return Array.from(new Set(values)).join(' • ') || 'Unavailable';
}

function getReadableLocation(log: AccessLogRow) {
  const loc = log.LocationDetails || {};
  const parts = [loc.city, loc.state, loc.countryOrRegion]
    .map(normalizeKnownValue)
    .filter(Boolean);
  
  let result = parts.join(', ');
  
  if (loc.geoCoordinates && typeof loc.geoCoordinates === 'object') {
    const hasLatLong = loc.geoCoordinates.latitude !== undefined && loc.geoCoordinates.longitude !== undefined;
    if (hasLatLong) {
      const coords = `[${loc.geoCoordinates.latitude}, ${loc.geoCoordinates.longitude}]`;
      result = result ? `${result} ${coords}` : coords;
    }
  }
  
  return result || 'Unknown Location';
}

function reorderColumns(order: ColumnKey[], draggedColumn: ColumnKey | null, targetColumn: ColumnKey): ColumnKey[] {
  if (!draggedColumn || draggedColumn === targetColumn) {
    return order;
  }

  const sourceIndex = order.indexOf(draggedColumn);
  const targetIndex = order.indexOf(targetColumn);
  if (sourceIndex < 0 || targetIndex < 0) {
    return order;
  }

  const nextOrder = [...order];
  nextOrder.splice(sourceIndex, 1);
  nextOrder.splice(targetIndex, 0, draggedColumn);
  return nextOrder;
}
