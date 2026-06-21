/**
 * Command Center (Ctrl + K)
 * ----------------------------------------------------------------------------
 * Global command palette. Surfaced via Cmd/Ctrl+K from anywhere.
 * Lists registered commands fuzzy-matched against the current query.
 * Mirrors the Linear / Raycast / Vercel pattern users already know.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCommandStore, scoreCommand, type CommandCategory } from '@/stores/commandStore';
import { api } from '@/lib/api';

const CATEGORY_LABEL: Record<CommandCategory, string> = {
  navigate: 'Navigate',
  act: 'Act',
  search: 'Search',
  ai: 'AI',
  create: 'Create',
};

const CATEGORY_PREFIX: Record<string, CommandCategory> = {
  '>': 'navigate',
  '/': 'search',
  '?': 'ai',
  '+': 'create',
  '!': 'act',
};

export function CommandCenter() {
  const { isOpen, query, commands, recentIds, close, setQuery, recordRecent } = useCommandStore();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // Force-register core commands every time the palette opens (cheap).
  useEffect(() => {
    if (!isOpen) return;
    const store = useCommandStore.getState();
    const core: Parameters<typeof store.register>[0][] = [
      {
        id: 'nav.dashboard',
        title: 'Go to Dashboard',
        category: 'navigate',
        keywords: ['home', 'dashboard', 'overview'],
        action: () => navigate('/dashboard'),
      },
      {
        id: 'nav.servers',
        title: 'Go to Servers',
        category: 'navigate',
        keywords: ['servers', 'list'],
        action: () => navigate('/servers'),
      },
      {
        id: 'nav.account',
        title: 'Go to Account Settings',
        category: 'navigate',
        keywords: ['account', 'settings', 'profile'],
        action: () => navigate('/account'),
      },
      {
        id: 'nav.theme',
        title: 'Open Theme Switcher',
        category: 'navigate',
        keywords: ['theme', 'appearance', 'dark', 'light'],
        action: () => navigate('/account/preferences'),
      },
      {
        id: 'ai.explain',
        title: 'Ask Archive AI...',
        category: 'ai',
        keywords: ['ai', 'ask', 'explain', 'help'],
        action: async () => {
          const stream = api.streamAI(
            [{ role: 'user', content: query.replace(/^\?/, '').trim() }],
            'general'
          );
          for await (const chunk of stream) {
            console.log(chunk); // TODO: route to AI side panel
          }
        },
      },
    ];
    core.forEach((c) => store.register(c));
  }, [isOpen, query, navigate]);

  // Reset selection on query change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const filtered = useMemo(() => {
    // Detect category prefix
    let cat: CommandCategory | undefined;
    let q = query;
    const first = query[0];
    if (first && CATEGORY_PREFIX[first]) {
      cat = CATEGORY_PREFIX[first];
      q = query.slice(1).trim();
    }
    const list = cat ? commands.filter((c) => c.category === cat) : commands;
    return list
      .map((c) => ({ cmd: c, score: scoreCommand(c, q) }))
      .filter((x) => x.score > 0 || !q)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.cmd)
      .slice(0, 20);
  }, [commands, query]);

  // Group by category for display
  const grouped = useMemo(() => {
    const groups: Record<CommandCategory, typeof filtered> = {
      navigate: [], act: [], search: [], ai: [], create: [],
    };
    filtered.forEach((cmd) => groups[cmd.category].push(cmd));
    return groups;
  }, [filtered]);

  // Recent commands (when no query)
  const recent = useMemo(() => {
    if (query) return [];
    return recentIds
      .map((id) => commands.find((c) => c.id === id))
      .filter(Boolean)
      .slice(0, 5) as typeof filtered;
  }, [query, recentIds, commands]);

  function execute(cmd: (typeof filtered)[number]) {
    recordRecent(cmd.id);
    cmd.action();
    close();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) execute(filtered[selectedIndex]);
    }
  }

  if (!isOpen) return null;

  const flatList = filtered;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center bg-black/60 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="glass mt-32 w-[640px] max-w-[90vw] overflow-hidden rounded-xl shadow-glass"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search or run a command...  ( > navigate  / search  ? ai  + create  ! act )"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-base text-text outline-none placeholder:text-text-dim"
        />

        <div className="max-h-[400px] overflow-y-auto p-2">
          {flatList.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-text-muted">
              No commands match "{query}"
            </div>
          )}

          {recent.length > 0 && (
            <CategoryGroup title="Recent">
              {recent.map((cmd) => (
                <CommandRow
                  key={cmd.id}
                  cmd={cmd}
                  isSelected={flatList[selectedIndex]?.id === cmd.id}
                  onClick={() => execute(cmd)}
                  onHover={() => setSelectedIndex(flatList.indexOf(cmd))}
                />
              ))}
            </CategoryGroup>
          )}

          {(Object.keys(grouped) as CommandCategory[]).map((cat) => {
            if (grouped[cat].length === 0) return null;
            return (
              <CategoryGroup key={cat} title={CATEGORY_LABEL[cat]}>
                {grouped[cat].map((cmd) => (
                  <CommandRow
                    key={cmd.id}
                    cmd={cmd}
                    isSelected={flatList[selectedIndex]?.id === cmd.id}
                    onClick={() => execute(cmd)}
                    onHover={() => setSelectedIndex(flatList.indexOf(cmd))}
                  />
                ))}
              </CategoryGroup>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-surface-2/50 px-4 py-2 font-mono text-[10px] text-text-dim">
          <div className="flex gap-3">
            <span>↑↓ navigate</span>
            <span>↵ execute</span>
            <span>esc close</span>
          </div>
          <span>Archive Command Center</span>
        </div>
      </div>
    </div>
  );
}

function CategoryGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-text-dim">
        {title}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function CommandRow({
  cmd,
  isSelected,
  onClick,
  onHover,
}: {
  cmd: Parameters<typeof useCommandStore.getState>['register'][0];
  isSelected: boolean;
  onClick: () => void;
  onHover: () => void;
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
        isSelected ? 'bg-surface-3 text-text' : 'text-text-muted hover:bg-surface-2'
      }`}
    >
      <span className="w-5 text-center text-sm opacity-70">{cmd.icon ?? '▸'}</span>
      <div className="flex-1">
        <div className="text-sm font-medium">{cmd.title}</div>
        {cmd.subtitle && <div className="text-xs text-text-dim">{cmd.subtitle}</div>}
      </div>
      {cmd.shortcut && (
        <kbd className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]">
          {cmd.shortcut}
        </kbd>
      )}
    </button>
  );
}
