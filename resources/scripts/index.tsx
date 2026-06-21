/**
 * Archive Panel — Application Entry
 * ----------------------------------------------------------------------------
 * Boots the React app, mounts the router, applies the resolved theme.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Dashboard } from '@/pages/Dashboard';
import { ServerConsolePage } from '@/pages/ServerConsolePage';
import { useThemeStore } from '@/stores/themeStore';
import { api } from '@/lib/api';

import '@/styles/tokens.css';

// Resolve theme from backend on boot, apply it.
// Falls back to system default if the request fails (e.g. not logged in yet).
api.getResolvedTheme()
  .then((theme) => useThemeStore.getState().setTheme(theme))
  .catch(() => {/* use default */});

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/servers" element={<Dashboard />} />
          <Route path="/server/:id" element={<ServerConsolePage />} />
          <Route path="/account" element={<div className="text-text-muted">Account settings — coming soon</div>} />
          <Route path="/account/security" element={<div className="text-text-muted">Security — coming soon</div>} />
          <Route path="/account/api-keys" element={<div className="text-text-muted">API keys — coming soon</div>} />
          <Route path="/account/preferences" element={<div className="text-text-muted">Preferences — coming soon</div>} />
          <Route path="/admin/*" element={<div className="text-text-muted">Admin — coming soon</div>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><App /></React.StrictMode>);
