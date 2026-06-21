# Archive Panel

> A next-generation maintained fork of Pterodactyl. Built to feel like Linear × Raycast × GitHub × Vercel × Reviactyl × Pterodactyl — while preserving full Wings compatibility.

**Archive Panel is NOT a theme, NOT a plugin, and NOT a standalone application.** It is a long-term maintained fork of Pterodactyl, with a new React frontend, runtime theming engine, AI gateway, command center, and Console 2.0 — all layered on top of Pterodactyl's unchanged Laravel backend and Wings daemon protocol.

## What's in this repo

This is a **fork of Pterodactyl** with the following modifications:

| Layer | Status | Location |
|-------|--------|----------|
| Laravel backend | **Unchanged** from Pterodactyl | `app/`, `database/migrations/`, `routes/`, `config/` |
| React frontend | **Replaced** (Archive's own) | `resources/scripts/` |
| Design system | **New** — runtime-themable tokens | `resources/scripts/styles/tokens.css` |
| Theme engine | **New** — DB-backed, admin-editable | `app/Archive/Models/Theme.php` + migration |
| AI Gateway | **New** — provider-agnostic | `app/Archive/AI/` |
| Migration installer | **New** — safe + reversible | `install.sh` |

Pterodactyl's `app/`, `database/migrations/`, `routes/`, and `config/` are preserved verbatim so the project can track upstream. Archive's additions live in `app/Archive/`, `database/migrations/archive/`, and `routes/archive.php` — clearly separated so merge conflicts with upstream are minimal.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  React Frontend (resources/scripts/)                         │
│  ├─ Design system (CSS variable tokens)                      │
│  ├─ ThemeProvider (runtime theme injection)                  │
│  ├─ Command Center (Ctrl+K)                                  │
│  ├─ Console 2.0 (ring buffer + virtualized renderer)         │
│  └─ Dashboard, Server Console, Account                       │
└────────────────────────────┬─────────────────────────────────┘
                             │ HTTPS + WebSocket
┌────────────────────────────┴─────────────────────────────────┐
│  Laravel Backend (Pterodactyl unchanged + Archive additions) │
│  ├─ Pterodactyl Core: /api/client, /api/application          │
│  ├─ Archive: /api/archive/theme (resolved theme)             │
│  ├─ Archive: /api/archive/ai/* (Gateway)                     │
│  └─ ArchiveServiceProvider (wires everything)                │
└────────────────────────────┬─────────────────────────────────┘
                             │ REST + WebSocket
                    ┌────────┴────────┐
                    │ Pterodactyl Wings│  (unchanged Go daemon)
                    └─────────────────┘
```

## Quick Start (Development)

```bash
# 1. Install PHP deps
composer install

# 2. Install JS deps
npm ci

# 3. Configure environment
cp .env.example .env
php artisan key:generate

# 4. Run migrations (Pterodactyl's + Archive's additive)
php artisan migrate --force
php artisan migrate --path=database/migrations/archive --force

# 5. Build frontend
npm run build

# 6. Serve
php artisan serve
```

## Migration from Existing Pterodactyl

```bash
# On your existing Pterodactyl server:
bash <(curl -fsSL https://archivepanel.example/install.sh)

# Or dry-run first:
bash <(curl -fsSL https://archivepanel.example/install.sh) --dry-run
```

The installer:
1. Detects your existing Pterodactyl install
2. Backs up DB, storage, and .env
3. Applies Archive's additive migrations (no destructive changes)
4. Builds the new frontend
5. Verifies integrity (Laravel boots, service provider registered, theme table exists)
6. Cuts over (reloads PHP-FPM + nginx)
7. Installs `archive-rollback` command for 72-hour rollback window

## Runtime Theming — How It Works

Every CSS color/spacing/font/radius is a CSS custom property on `:root`. Components read from these tokens via Tailwind classes. When an admin changes the theme:

1. The Theme record is updated in `archive_themes` (DB)
2. On next page load, `ThemeController::resolved()` returns the resolved theme (user override → workspace → installation default)
3. The frontend `themeStore` sets `data-theme` and `data-density` attributes on `<html>` plus any inline overrides via a `<style>` tag
4. Every component repaints against the new token map — no rebuild required

Three variants ship out of the box (dark / light / AMOLED), four density modes (comfortable / compact / spacious / accessibility), and admin-defined overrides on top.

## AI Gateway

The frontend never calls AI providers directly. All requests go through `/api/archive/ai/*`, which:

1. Authenticates the user
2. Resolves the active provider via `ProviderRegistry` (default: Dolphin)
3. Applies rate limits (configurable, default 30/min)
4. Writes an audit log entry
5. Proxies to the provider with SSE streaming
6. Returns chunks to the frontend as they arrive

Provider config in `config/archive.php`:

```php
'routing' => [
    'light'  => 'dolphin',   // cheap, fast
    'medium' => 'dolphin',
    'heavy'  => 'openai',    // route heavy tasks to a more powerful model
],
```

## What's NOT in v1.0-alpha (intentionally)

These are documented in the architecture review but **deliberately deferred**:

- Visual Network Designer (deferred to v1.x)
- Infrastructure Planner (deferred to v1.x)
- Extension SDK + sandbox (deferred — security-critical, needs more time)
- Bedrock Hub + Template Marketplace (Modrinth + Hangar ship first)
- Visual workflow builder (deferred — extend Pterodactyl's schedules first)

See `docs/architecture-review.pdf` for the full roadmap and rationale.

## License

MIT — same as Pterodactyl.
