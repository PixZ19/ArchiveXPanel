/**
 * Command Store
 * ----------------------------------------------------------------------------
 * The command registry. Core commands are registered at boot; extensions
 * (when the SDK ships) will register their own via the same API.
 *
 * The store also holds the open/closed state and the current query — kept
 * in Zustand so the palette component and any trigger can manipulate it.
 */

import { create } from 'zustand';

export type CommandCategory = 'navigate' | 'act' | 'search' | 'ai' | 'create';

export interface Command {
  id: string;
  title: string;
  subtitle?: string;
  category: CommandCategory;
  keywords?: string[];
  shortcut?: string;
  icon?: string;
  action: () => void | Promise<void>;
}

interface CommandState {
  isOpen: boolean;
  query: string;
  commands: Command[];
  recentIds: string[];
  open: () => void;
  close: () => void;
  toggle: () => void;
  setQuery: (q: string) => void;
  register: (cmd: Command) => void;
  unregister: (id: string) => void;
  recordRecent: (id: string) => void;
}

const STORAGE_KEY = 'archive.recent-commands';
const MAX_RECENT = 10;

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveRecent(ids: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

export const useCommandStore = create<CommandState>((set, get) => ({
  isOpen: false,
  query: '',
  commands: [],
  recentIds: loadRecent(),
  open: () => set({ isOpen: true, query: '' }),
  close: () => set({ isOpen: false, query: '' }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen, query: s.isOpen ? s.query : '' })),
  setQuery: (q) => set({ query: q }),
  register: (cmd) =>
    set((s) => ({
      commands: s.commands.some((c) => c.id === cmd.id)
        ? s.commands.map((c) => (c.id === cmd.id ? cmd : c))
        : [...s.commands, cmd],
    })),
  unregister: (id) =>
    set((s) => ({ commands: s.commands.filter((c) => c.id !== id) })),
  recordRecent: (id) => {
    const next = [id, ...get().recentIds.filter((r) => r !== id)].slice(0, MAX_RECENT);
    saveRecent(next);
    set({ recentIds: next });
  },
}));

/**
 * Fuzzy match — simple substring + token coverage scoring.
 * Good enough for ~500 commands; switch to fuse.js if scale demands.
 */
export function scoreCommand(cmd: Command, query: string): number {
  if (!query) return cmd.category === 'navigate' ? 1 : 0;
  const q = query.toLowerCase();
  const title = cmd.title.toLowerCase();
  const subtitle = (cmd.subtitle ?? '').toLowerCase();
  const keywords = (cmd.keywords ?? []).join(' ').toLowerCase();

  if (title === q) return 1000;
  if (title.startsWith(q)) return 500;
  if (title.includes(q)) return 200;
  if (subtitle.includes(q)) return 100;
  if (keywords.includes(q)) return 80;

  // Token coverage
  const tokens = q.split(/\s+/).filter(Boolean);
  const haystack = `${title} ${subtitle} ${keywords}`;
  const hits = tokens.filter((t) => haystack.includes(t)).length;
  return hits === tokens.length ? 50 + hits * 5 : 0;
}
