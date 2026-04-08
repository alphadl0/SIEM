import { useState } from 'react';
import { useSignalR } from '../hooks/useSignalR';
import { Server, Activity, MapPin, Cpu, CheckCircle, Network, Globe, HardDrive } from 'lucide-react';
import { getVmAssetLabel, getVmBadgeTone, isVmRunning } from '../lib/vmStatus';
import { FilterBar } from '../components/FilterBar';

export default function AssetExplorer() {
  const { vmStatuses } = useSignalR();
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState('all');

  const vms = Object.values(vmStatuses).filter(vm => {
    const matchesSearch = !searchTerm || 
      vm.vmName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vm.osLabel?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = status === 'all' || 
      (status === 'running' && isVmRunning(vm.status)) ||
      (status === 'stopped' && !isVmRunning(vm.status));

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="fade-in">
      <div className="mb-lg">
        <h1 className="m-0 text-xl flex items-center gap-sm"><Server size={28} /> Infrastructure Assets</h1>
      </div>

      <FilterBar 
        onSearch={setSearchTerm}
        onFilterChange={(key, val) => key === 'status' && setStatus(val)}
        placeholder="Filter by VM name or OS..."
        filters={[
          {
            key: 'status',
            label: 'Power Status',
            value: status,
            options: [
              { label: 'All Assets', value: 'all' },
              { label: 'Running', value: 'running' },
              { label: 'Stopped', value: 'stopped' }
            ]
          }
        ]}
      />
      
      <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(450px, 1fr))', gap: '0.75rem' }}>
        {vms.length > 0 ? vms.map((vm, i) => (
          <div
            key={i}
            className="card asset-card"
            style={{ borderLeft: `4px solid ${isVmRunning(vm.status) ? 'var(--secondary)' : 'var(--destructive)'}` }}
          >
            <div className="asset-card-header">
              <div className="asset-card-type text-muted">
                <Cpu size={18} className="text-muted" />
                <span>VIRTUAL MACHINE</span>
              </div>
              <span className={`badge ${getVmBadgeTone(vm.status)} text-xs`}>
                {getVmAssetLabel(vm.status)}
              </span>
            </div>
            
            <h3 className="asset-card-name">{vm.vmName}</h3>
            
            <div className="asset-card-panel">
                <div className="asset-card-details">
                    <DetailItem icon={<MapPin size={18} />} label="Region" value={vm.location || 'N/A'} />
                    <DetailItem icon={<Activity size={18} />} label="VM Size" value={vm.vmSize || 'Standard'} />
                    <DetailItem icon={<Network size={18} />} label="Private IP" value={formatAddress(vm.privateIpAddress, 'Unavailable')} />
                    <DetailItem icon={<Globe size={18} />} label="Public IP" value={formatAddress(vm.publicIpAddress, 'Not assigned')} />
                    <DetailItem
                      icon={<Cpu size={18} />}
                      label="OS"
                      value={formatOsLabel(vm.osLabel, vm.osVersion)}
                    />
                    <DetailItem
                      icon={<Activity size={18} />}
                      label="RAM"
                      value={formatMemory(vm.memoryUsedGb, vm.memoryTotalGb)}
                    />
                    <DetailItem
                      icon={<HardDrive size={18} />}
                      label="Disk"
                      value={formatDisk(vm.diskUsedGb, vm.diskTotalGb)}
                    />
                    <DetailItem
                      icon={<CheckCircle size={18} className="text-success" />}
                      label="SIEM Agent Health"
                      value="CONNECTED"
                      valueColor="var(--secondary)"
                    />
                </div>
            </div>
          </div>
        )) : <div className="card"><p>Scanning Azure environment for managed resources...</p></div>}
      </div>
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

function formatMemory(memoryUsedGb?: number, memoryTotalGb?: number) {
  if (typeof memoryUsedGb === 'number' && typeof memoryTotalGb === 'number') {
    return `${memoryUsedGb.toFixed(1)} GB / ${memoryTotalGb.toFixed(1)} GB`;
  }

  if (typeof memoryTotalGb === 'number') {
    return `Used unavailable / ${memoryTotalGb.toFixed(1)} GB`;
  }

  return 'Unavailable';
}

function formatDisk(diskUsedGb?: number, diskTotalGb?: number) {
  if (typeof diskUsedGb === 'number' && typeof diskTotalGb === 'number') {
    return `${diskUsedGb.toFixed(1)} GB / ${diskTotalGb.toFixed(1)} GB`;
  }

  if (typeof diskTotalGb === 'number') {
    return `Used unavailable / ${diskTotalGb.toFixed(1)} GB`;
  }

  return 'Unavailable';
}

function formatAddress(value?: string, emptyLabel = 'Unavailable') {
  return value?.trim() || emptyLabel;
}
