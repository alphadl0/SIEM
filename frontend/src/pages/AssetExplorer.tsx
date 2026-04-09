import { useSignalR } from '../hooks/useSignalR';
import { Server, Activity, MapPin, Cpu, Network, Globe, HardDrive, Database, ArrowDownUp, MemoryStick, Monitor, Gauge } from 'lucide-react';
import { getVmAssetLabel, getVmBadgeTone, isVmRunning } from '../lib/vmStatus';

export default function AssetExplorer() {
  const { vmStatuses, sqlStatuses } = useSignalR();

  const vms = Object.values(vmStatuses).map(vm => ({
    name: vm.vmName,
    type: vm.type || "Virtual Machine",
    status: vm.status,
    location: vm.location,
    size: vm.vmSize,
    publicIpAddress: vm.publicIpAddress,
    privateIpAddress: vm.privateIpAddress,
    osLabel: vm.osLabel,
    osVersion: vm.osVersion,
    memoryUsedGb: vm.memoryUsedGb,
    memoryTotalGb: vm.memoryTotalGb,
    diskUsedGb: vm.diskUsedGb,
    diskTotalGb: vm.diskTotalGb,
    networkInMbps: vm.networkInMbps,
    networkOutMbps: vm.networkOutMbps,
    cpuPercent: vm.cpuPercent
  }));

  const sqls = Object.values(sqlStatuses).map(sql => ({
    name: sql.name,
    type: sql.type || "SQL Server",
    status: sql.status,
    location: sql.location,
    size: sql.size,
    publicIpAddress: sql.publicIpAddress,
    privateIpAddress: undefined as string | undefined,
    osLabel: undefined as string | undefined,
    osVersion: undefined as string | undefined,
    memoryUsedGb: undefined as number | undefined,
    memoryTotalGb: undefined as number | undefined,
    diskUsedGb: sql.diskUsedGb,
    diskTotalGb: sql.diskTotalGb,
    networkInMbps: undefined as number | undefined,
    networkOutMbps: undefined as number | undefined,
    cpuPercent: undefined as number | undefined
  }));

  const assets = [...vms, ...sqls].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="fade-in">
      <div style={{ marginBottom: '3rem' }}>
        <h1 className="m-0 text-xl flex items-center gap-sm"><Server size={28} /> Infrastructure Assets</h1>
      </div>
      
      {assets.length > 0 ? (
        <div>
          <div className="flex-row items-center" style={{ marginBottom: '1.5rem' }}>
            <h2 className="text-xl font-semibold">Virtual Machines</h2>
          </div>
          <div className="grid mb-8" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1.25rem' }}>
            {assets.filter(a => a.type === "Virtual Machine" || !a.type).map((vm, i) => {
              const icon = <Cpu size={18} className="text-muted" />;
              const label = vm.type ? vm.type.toUpperCase() : "VIRTUAL MACHINE";
              
              const tone = getVmBadgeTone(vm.status);
              const statusLabel = getVmAssetLabel(vm.status);
              
              let borderColor = 'var(--destructive)';
              if (tone === 'online') borderColor = 'var(--secondary)';
              else if (tone === 'medium') borderColor = 'var(--warning)';

              let animClass = '';
              const normalizedStatus = vm.status?.trim().toLowerCase() ?? '';
              if (normalizedStatus.includes('starting') || normalizedStatus.includes('restarting')) {
                animClass = 'anim-starting';
              } else if (normalizedStatus.includes('stopping') || normalizedStatus.includes('deallocating')) {
                animClass = 'anim-stopping';
              }

              return (
              <div
                key={`vm-${i}`}
                className={`card asset-card ${animClass}`}
                style={{ borderLeft: `4px solid ${borderColor}` }}
              >
                <div className="asset-card-header">
                  <div className="asset-card-type text-muted">
                    {icon}
                    <span>{label}</span>
                  </div>
                  <span className={`badge ${tone} text-xs`}>
                    {statusLabel}
                  </span>
                </div>
                
                <h3 className="asset-card-name" style={{ wordBreak: 'break-word' }}>{vm.name}</h3>
                
                <div className="asset-card-panel">
                    <div className="asset-card-details">
                        <DetailItem icon={<MapPin size={18} />} label="Region" value={vm.location || 'N/A'} />
                        <DetailItem icon={<Server size={18} />} label="VM Size" value={vm.size || 'Standard'} />
                        <DetailItem icon={<Network size={18} />} label="Private IP" value={formatAddress(vm.privateIpAddress, 'Unavailable')} />
                        <DetailItem icon={<Globe size={18} />} label="Public IP" value={formatAddress(vm.publicIpAddress, 'Not assigned')} wrapValue={false} />
                        <DetailItem icon={<Monitor size={18} />} label="OS" value={formatOsLabel(vm.osLabel, vm.osVersion)} />
                        <DetailItem icon={<Gauge size={18} />} label="CPU" value={formatCpu(vm.cpuPercent, isVmRunning(vm.status))} />
                        <DetailItem icon={<MemoryStick size={18} />} label="RAM" value={formatMemory(vm.memoryUsedGb, vm.memoryTotalGb, isVmRunning(vm.status))} />
                        <DetailItem icon={<HardDrive size={18} />} label="Disk" value={formatDisk(vm.diskUsedGb, vm.diskTotalGb, isVmRunning(vm.status))} />
                        <DetailItem icon={<ArrowDownUp size={18} />} label="Network" value={formatBandwidth(vm.networkInMbps, vm.networkOutMbps, isVmRunning(vm.status))} />
                    </div>
                </div>
              </div>
              );
            })}
          </div>

          <div className="flex-row items-center" style={{ marginTop: '4rem', marginBottom: '1.5rem' }}>
            <h2 className="text-xl font-semibold">Database Assets</h2>
          </div>
          <div className="grid mb-8" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1.25rem' }}>
            {assets.filter(a => a.type === "SQL Server" || a.type === "SQL Database").map((db, i) => {
              const isSqlServer = db.type === "SQL Server";
              const isSqlDatabase = db.type === "SQL Database";

              const icon = <Database size={18} className="text-muted" />;
              const label = db.type ? db.type.toUpperCase() : "DATABASE";
              
              const statusStr = db.status?.toLowerCase() || "";
              const runningBorder = statusStr === "ready" || statusStr === "online";
              const tone = runningBorder ? "online" : "offline";
              const statusLabel = db.status?.toUpperCase() || "UNKNOWN";
              const borderColor = runningBorder ? 'var(--secondary)' : 'var(--destructive)';

              return (
              <div
                key={`db-${i}`}
                className="card asset-card"
                style={{ borderLeft: `4px solid ${borderColor}` }}
              >
                <div className="asset-card-header">
                  <div className="asset-card-type text-muted">
                    {icon}
                    <span>{label}</span>
                  </div>
                  <span className={`badge ${tone} text-xs`}>
                    {statusLabel}
                  </span>
                </div>
                
                <h3 className="asset-card-name" style={{ wordBreak: 'break-word' }}>{db.name}</h3>
                
                <div className="asset-card-panel">
                    <div className="asset-card-details">
                        <DetailItem icon={<MapPin size={18} />} label="Region" value={db.location || 'N/A'} />
                        <DetailItem icon={<Activity size={18} />} label={isSqlServer ? "Version" : "SKU"} value={db.size || 'Standard'} />
                        {!isSqlDatabase && (
                          <DetailItem icon={<Globe size={18} />} label="FQDN" value={formatAddress(db.publicIpAddress, 'Not assigned')} wrapValue={true} />
                        )}
                        {isSqlDatabase && (db.diskTotalGb !== undefined || db.diskUsedGb !== undefined) && (
                          <DetailItem icon={<HardDrive size={18} />} label="Storage" value={formatDisk(db.diskUsedGb, db.diskTotalGb)} />
                        )}
                    </div>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid mb-6" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          <div className="card"><p>Scanning Azure environment for managed resources...</p></div>
        </div>
      )}
    </div>
  );
}

function DetailItem({
  icon,
  label,
  value,
  valueColor,
  stacked = false,
  wrapValue = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
  stacked?: boolean;
  wrapValue?: boolean;
}) {
  return (
    <div className={`asset-detail-row${stacked ? ' asset-detail-row-stacked' : ''}${wrapValue && !stacked ? ' asset-detail-row-wrap' : ''}`}>
      <div className="asset-detail-label" title={label}>
        <div className="flex justify-center text-muted" style={{ minWidth: '28px' }}>
          {icon}
        </div>
        <span>{label}</span>
      </div>
      <span
        className={`asset-detail-value${wrapValue ? ' asset-detail-value-wrap' : ''}`}
        title={value}
        style={{
          fontWeight: valueColor ? 700 : 600,
          color: valueColor,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function formatOsLabel(osLabel?: string, osVersion?: string) {
  const parts = [osLabel, osVersion]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return parts.join(' • ') || 'Unavailable';
}

function formatMemory(memoryUsedGb?: number, memoryTotalGb?: number, isRunning?: boolean) {
  if (isRunning === false) return 'Unavailable';

  if (typeof memoryUsedGb === 'number' && typeof memoryTotalGb === 'number') {
    return `${memoryUsedGb.toFixed(1)} GB / ${memoryTotalGb.toFixed(1)} GB`;
  }

  if (typeof memoryTotalGb === 'number') {
    return `${memoryTotalGb.toFixed(1)} GB`;
  }

  return 'Gathering...';
}

function formatDisk(diskUsedGb?: number, diskTotalGb?: number, isRunning?: boolean) {
  if (isRunning === false) return 'Unavailable';

  if (typeof diskUsedGb === 'number' && typeof diskTotalGb === 'number') {
    return `${diskUsedGb.toFixed(1)} GB / ${diskTotalGb.toFixed(1)} GB`;
  }

  if (typeof diskTotalGb === 'number') {
    return `${diskTotalGb.toFixed(1)} GB`;
  }

  return 'Gathering...';
}

function formatAddress(value?: string, emptyLabel = 'Unavailable') {
  return value?.trim() || emptyLabel;
}

function formatBandwidth(networkInMbps?: number, networkOutMbps?: number, isRunning?: boolean) {
  if (isRunning === false) return 'Unavailable';
  const inVal = typeof networkInMbps === 'number' ? networkInMbps.toFixed(2) : '--';
  const outVal = typeof networkOutMbps === 'number' ? networkOutMbps.toFixed(2) : '--';
  if (inVal === '--' && outVal === '--') return 'Gathering...';
  return `↓ ${inVal} M / ↑ ${outVal} M`;
}

function formatCpu(cpuPercent?: number, isRunning?: boolean) {
  if (isRunning === false) return 'Unavailable';
  if (typeof cpuPercent === 'number') return `${cpuPercent.toFixed(1)}%`;
  return 'Gathering...';
}
