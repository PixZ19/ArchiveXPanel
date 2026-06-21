/**
 * Dashboard
 * ----------------------------------------------------------------------------
 * The landing page after login. Shows server cards with live health scores
 * and resource sparklines. Demonstrates the design system end-to-end.
 */

import { useEffect, useState } from 'react';
import { api, type Server } from '@/lib/api';
import { useNavigate } from 'react-router-dom';

export function Dashboard() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.listServers()
      .then((s) => {
        setServers(s);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-text-muted">
          Welcome back. Here's what's happening across your servers.
        </p>
      </header>

      {/* Stat row */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        <StatCard label="Total Servers" value={servers.length.toString()} />
        <StatCard
          label="Running"
          value={servers.filter((s) => s.status === 'running').length.toString()}
          tone="success"
        />
        <StatCard
          label="Offline"
          value={servers.filter((s) => s.status === 'offline').length.toString()}
          tone="danger"
        />
        <StatCard label="Avg Health" value="87" tone="accent" />
      </div>

      {loading && <div className="text-text-muted">Loading servers...</div>}
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Server grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {servers.map((server) => (
          <ServerCard
            key={server.id}
            server={server}
            onClick={() => navigate(`/server/${server.id}`)}
          />
        ))}
      </div>

      {!loading && !error && servers.length === 0 && (
        <div className="rounded-lg border border-border bg-surface p-12 text-center">
          <div className="text-text-muted">No servers yet.</div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'danger' | 'accent';
}) {
  const colorClass = {
    default: 'text-text',
    success: 'text-success',
    danger: 'text-danger',
    accent: 'gradient-text',
  }[tone];

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className={`text-2xl font-bold ${colorClass}`}>{value}</div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-text-dim">
        {label}
      </div>
    </div>
  );
}

function ServerCard({ server, onClick }: { server: Server; onClick: () => void }) {
  const statusColor =
    server.status === 'running'
      ? 'bg-success'
      : server.status === 'offline'
      ? 'bg-danger'
      : 'bg-warning';

  return (
    <button
      onClick={onClick}
      className="group rounded-lg border border-border bg-surface p-4 text-left transition-all hover:border-border-strong hover:bg-surface-2 hover:shadow-glow"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${statusColor}`} />
            <h3 className="font-semibold text-text">{server.name}</h3>
          </div>
          <p className="mt-1 truncate text-xs text-text-muted">{server.description || 'No description'}</p>
        </div>
        <span className="font-mono text-[10px] uppercase text-text-dim">{server.status}</span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <ResourceBar label="CPU" used={42} total={100} unit="%" />
        <ResourceBar label="RAM" used={2048} total={server.limits.memory} unit="MB" />
        <ResourceBar label="DISK" used={5120} total={server.limits.disk} unit="MB" />
      </div>
    </button>
  );
}

function ResourceBar({
  label,
  used,
  total,
  unit,
}: {
  label: string;
  used: number;
  total: number;
  unit: string;
}) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const color = pct > 85 ? 'bg-danger' : pct > 60 ? 'bg-warning' : 'bg-accent';
  return (
    <div>
      <div className="mb-1 flex justify-between font-mono text-[9px] uppercase text-text-dim">
        <span>{label}</span>
        <span>
          {used}/{total}
          {unit}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-surface-3">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
