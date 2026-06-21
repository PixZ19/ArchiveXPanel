/**
 * Archive API client
 * ----------------------------------------------------------------------------
 * Wraps axios with auth, error normalization, and typed response shapes.
 * Hits Pterodactyl's existing /api/client and /api/application endpoints —
 * we don't add new endpoints for existing capabilities.
 *
 * New Archive-specific endpoints (AI Gateway, Theme admin) live under
 * /api/archive/* — see routes/archive.php.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

const CSRF_TOKEN = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';

export const http: AxiosInstance = axios.create({
  baseURL: '/',
  withCredentials: true,
  headers: {
    'X-CSRF-TOKEN': CSRF_TOKEN,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ errors?: Array<{ code: string; detail: string; source?: string }> }>) => {
    if (error.response?.status === 401) {
      // Session expired — redirect to login
      window.location.href = '/auth/login';
      return Promise.reject(error);
    }
    // Normalize Pterodactyl's error envelope
    const normalized = new Error(
      error.response?.data?.errors?.[0]?.detail ?? error.message ?? 'Unknown error'
    );
    (normalized as any).status = error.response?.status;
    (normalized as any).code = error.response?.data?.errors?.[0]?.code;
    return Promise.reject(normalized);
  }
);

// ============ Pterodactyl Client API (unchanged contract) ============

export interface Server {
  id: string;
  uuid: string;
  identifier: string;
  name: string;
  description: string;
  status: 'starting' | 'stopping' | 'running' | 'offline';
  limits: { memory: number; swap: number; disk: number; io: number; cpu: number; threads: string | null };
  feature_limits: { databases: number; allocations: number; backups: number };
  node: string;
  sftp_details: { ip: string; port: number };
}

export const api = {
  /** GET /api/client — list servers the user can access */
  async listServers(): Promise<Server[]> {
    const { data } = await http.get<{ data: Array<{ attributes: Server }> }>('/api/client');
    return data.data.map((s) => s.attributes);
  },

  /** GET /api/client/servers/{server} — single server */
  async getServer(id: string): Promise<Server> {
    const { data } = await http.get<{ attributes: Server }>(`/api/client/servers/${id}`);
    return data.attributes;
  },

  /** POST /api/client/servers/{server}/power — send power action */
  async sendPower(serverId: string, action: 'start' | 'stop' | 'restart' | 'kill'): Promise<void> {
    await http.post(`/api/client/servers/${serverId}/power`, { signal: action });
  },

  // ============ Archive-specific endpoints ============

  /** GET /api/archive/theme — resolved theme for current user */
  async getResolvedTheme() {
    const { data } = await http.get('/api/archive/theme');
    return data;
  },

  /** POST /api/archive/ai/stream — SSE stream from the AI Gateway */
  async *streamAI(
    messages: Array<{ role: string; content: string }>,
    capability: string
  ): AsyncIterable<string> {
    const res = await fetch('/api/archive/ai/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': CSRF_TOKEN },
      body: JSON.stringify({ messages, capability }),
    });
    if (!res.ok || !res.body) throw new Error(`AI stream failed: ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
  },
};
