/**
 * Server Console Page
 * ----------------------------------------------------------------------------
 * Wraps Console 2.0 with the server header (name, status, power actions).
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Console2 } from '@/components/Console2';
import { api, type Server } from '@/lib/api';

export function ServerConsolePage() {
  const { id } = useParams<{ id: string }>();
  const [server, setServer] = useState<Server | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getServer(id).then(setServer).catch(console.error);
  }, [id]);

  if (!server) return <div className="text-text-muted">Loading server...</div>;

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{server.name}</h1>
          <p className="text-sm text-text-muted">{server.node}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => api.sendPower(server.id, 'start')}
            className="rounded-md border border-success/30 bg-success/10 px-3 py-1.5 text-sm text-success hover:bg-success/20"
          >
            ▶ Start
          </button>
          <button
            onClick={() => api.sendPower(server.id, 'restart')}
            className="rounded-md border border-warning/30 bg-warning/10 px-3 py-1.5 text-sm text-warning hover:bg-warning/20"
          >
            ↻ Restart
          </button>
          <button
            onClick={() => api.sendPower(server.id, 'stop')}
            className="rounded-md border border-danger/30 bg-danger/10 px-3 py-1.5 text-sm text-danger hover:bg-danger/20"
          >
            ■ Stop
          </button>
        </div>
      </header>

      <div className="flex-1">
        <Console2 serverId={server.id} />
      </div>
    </div>
  );
}
