/**
 * App Shell
 * ----------------------------------------------------------------------------
 * The persistent layout: sidebar (navigation), topbar (command palette trigger,
 * notifications, theme switcher), and the routed content area.
 *
 * Cmd/Ctrl+K opens the Command Center from anywhere.
 */

import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { CommandCenter } from '@/components/CommandCenter';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { useCommandStore } from '@/stores/commandStore';

export function AppShell() {
  const openCommandCenter = useCommandStore((s) => s.open);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openCommandCenter();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openCommandCenter]);

  return (
    <div className="flex h-screen w-full bg-bg text-text">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar onOpenCommand={openCommandCenter} />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
      <CommandCenter />
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="flex w-60 flex-col border-r border-border bg-surface">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div
          className="h-7 w-7 rounded-md"
          style={{ background: 'var(--gradient)' }}
        />
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-tight">Archive</span>
          <span className="font-mono text-[10px] text-text-dim">v1.0-alpha</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        <NavSection title="Servers">
          <NavItem to="/dashboard" label="Dashboard" icon="▤" />
          <NavItem to="/servers" label="All Servers" icon="⊡" />
        </NavSection>
        <NavSection title="Account">
          <NavItem to="/account" label="Settings" icon="⚙" />
          <NavItem to="/account/security" label="Security" icon="⛨" />
          <NavItem to="/account/api-keys" label="API Keys" icon="⚿" />
        </NavSection>
        <NavSection title="Admin">
          <NavItem to="/admin/nodes" label="Nodes" icon="▣" />
          <NavItem to="/admin/users" label="Users" icon="◍" />
          <NavItem to="/admin/settings" label="Settings" icon="⚙" />
        </NavSection>
      </nav>

      <div className="border-t border-border p-2">
        <div className="rounded-md bg-surface-2 px-3 py-2 text-xs text-text-muted">
          Press <kbd className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd> for commands
        </div>
      </div>
    </aside>
  );
}

function NavSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-text-dim">
        {title}
      </div>
      <div className="mt-1 flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function NavItem({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
          isActive
            ? 'bg-surface-2 text-text'
            : 'text-text-muted hover:bg-surface-2/50 hover:text-text'
        }`
      }
    >
      <span className="w-4 text-center text-xs opacity-70">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}

function Topbar({ onOpenCommand }: { onOpenCommand: () => void }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-4">
      <button
        onClick={onOpenCommand}
        className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-text-muted transition-colors hover:border-border-strong hover:text-text"
      >
        <span>⌕</span>
        <span>Search or run a command...</span>
        <kbd className="ml-12 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
      </button>

      <div className="flex items-center gap-2">
        <ThemeSwitcher />
        <button className="rounded-md p-1.5 text-text-muted hover:bg-surface-2 hover:text-text">
          <span className="text-base">🔔</span>
        </button>
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-accent to-accent-2" />
      </div>
    </header>
  );
}
