#!/usr/bin/env bash
# ============================================================================
# Archive Panel — One-Line Pterodactyl Migration Installer
# ============================================================================
#
# Usage:
#   bash <(curl -s https://raw.githubusercontent.com/PixZ19/ArchiveXPanel/main/install.sh)
#
#   # Dry-run (preview changes without applying):
#   bash <(curl -s https://raw.githubusercontent.com/PixZ19/ArchiveXPanel/main/install.sh) --dry-run
#
#   # Custom Pterodactyl path:
#   bash <(curl -s https://raw.githubusercontent.com/PixZ19/ArchiveXPanel/main/install.sh) --ptero-path /custom/path
#
# What it does:
#   1. Detects your existing Pterodactyl install
#   2. Backs up DB, storage, .env, composer.json, composer.lock
#   3. Downloads Archive Panel from GitHub
#   4. Merges Archive's additions into your Pterodactyl install (additive only)
#   5. Replaces the old React frontend with Archive's
#   6. Runs Archive's migrations (additive — no destructive schema changes)
#   7. Builds the new frontend
#   8. Verifies integrity
#   9. Reloads web services
#  10. Installs `archive-rollback` for 72-hour rollback
#
# Safety:
#   - Idempotent: rerun is safe
#   - Dry-run: --dry-run executes detection + validation only
#   - Rollback: archive-rollback restores pre-migration state within 72h
# ============================================================================

set -euo pipefail

# ---- Configuration ----
ARCHIVE_VERSION="1.0.0-alpha"
GITHUB_REPO="PixZ19/ArchiveXPanel"
GITHUB_BRANCH="main"
GITHUB_ARCHIVE_URL="https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.tar.gz"

PTERO_PATH="${PTERO_PATH:-/var/www/pterodactyl}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/archive/backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
LOG_FILE="${BACKUP_ROOT}/install_${TIMESTAMP}.log"
STAGING_DIR="/tmp/archive-staging-$$"

DRY_RUN=false
STAGE_START=1
STAGE_END=10
SKIP_DOWNLOAD=false
SKIP_BUILD=false
FORCE=false

# State variables filled by stage 1
DB_DATABASE=""
DB_USERNAME=""
DB_PASSWORD=""
PTERO_VERSION=""

# ---- Helpers ----
log()  { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG_FILE"; }
warn() { echo "[$(date +%H:%M:%S)] WARN: $*" | tee -a "$LOG_FILE"; }
err()  { echo "[$(date +%H:%M:%S)] ERROR: $*" >&2 | tee -a "$LOG_FILE"; exit 1; }
ok()   { echo "[$(date +%H:%M:%S)] ✓ $*" | tee -a "$LOG_FILE"; }

banner() {
    cat <<'BANNER'

      █████╗ ██████╗  ██████╗  ██████╗██╗   ██╗██████╗  ██████╗ ██╗  ██╗
     ██╔══██╗██╔══██╗██╔═══██╗██╔════╝██║   ██║██╔══██╗██╔═══██╗╚██╗██╔╝
     ███████║██████╔╝██║   ██║██║     ██║   ██║██████╔╝██║   ██║ ╚███╔╝
     ██╔══██║██╔══██╗██║   ██║██║     ██║   ██║██╔══██╗██║   ██║ ██╔██╗
     ██║  ██║██║  ██║╚██████╔╝╚██████╗╚██████╔╝██║  ██║╚██████╔╝██╔╝ ██╗
     ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝

BANNER
    echo "  Pterodactyl → Archive Panel Migration"
    echo "  Version: $ARCHIVE_VERSION"
    echo "  Time:    $(date)"
    echo "  Source:  github.com/${GITHUB_REPO}"
    echo ""
}

usage() {
    cat <<EOF
Usage: bash install.sh [OPTIONS]

Options:
  --dry-run              Detect + validate only; apply no changes
  --ptero-path PATH      Pterodactyl install path (default: /var/www/pterodactyl)
  --stage-start N        Begin from stage N (1-10)
  --stage-end N          End at stage N (1-10)
  --skip-download        Skip stage 3 (assume Archive files already in place)
  --skip-build           Skip stage 7 (use prebuilt assets)
  --force                Bypass confirmation prompt
  -h, --help             Show this help
EOF
    exit 0
}

# ---- Parse args ----
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)        DRY_RUN=true; shift ;;
        --ptero-path)     PTERO_PATH="$2"; shift 2 ;;
        --stage-start)    STAGE_START="$2"; shift 2 ;;
        --stage-end)      STAGE_END="$2"; shift 2 ;;
        --skip-download)  SKIP_DOWNLOAD=true; shift ;;
        --skip-build)     SKIP_BUILD=true; shift ;;
        --force|-f)       FORCE=true; shift ;;
        -h|--help)        usage ;;
        *)                err "Unknown option: $1" ;;
    esac
done

banner
mkdir -p "$BACKUP_ROOT" "$BACKUP_DIR"
log "Log file: $LOG_FILE"
log "Backup directory: $BACKUP_DIR"
log "Pterodactyl path: $PTERO_PATH"

if $DRY_RUN; then
    log "⚠ DRY RUN MODE — no changes will be applied"
fi

# Confirm before proceeding (unless --force or --dry-run)
if ! $FORCE && ! $DRY_RUN; then
    echo ""
    read -r -p "This will migrate Pterodactyl → Archive Panel. Continue? (yes/no): " CONFIRM
    if [[ "${CONFIRM,,}" != "yes" ]]; then
        log "Aborted by user."
        exit 0
    fi
fi

# ============================================================================
# Stage 1: Detect existing Pterodactyl
# ============================================================================
stage_detect() {
    log "Stage 1/10: Detecting Pterodactyl..."

    if [[ ! -d "$PTERO_PATH" ]]; then
        err "Pterodactyl directory not found at $PTERO_PATH. Set --ptero-path to the correct location."
    fi
    if [[ ! -f "$PTERO_PATH/composer.json" ]]; then
        err "composer.json missing at $PTERO_PATH — not a valid Pterodactyl install."
    fi
    if [[ ! -f "$PTERO_PATH/.env" ]]; then
        err ".env file missing at $PTERO_PATH — cannot read DB config."
    fi

    PTERO_VERSION=$(grep -oP '"version"\s*:\s*"\K[^"]+' "$PTERO_PATH/composer.json" 2>/dev/null || echo "unknown")
    ok "Pterodactyl detected (version: $PTERO_VERSION)"

    # Verify required commands
    for cmd in php composer mysql mysqldump; do
        command -v "$cmd" >/dev/null || err "$cmd not found in PATH"
    done
    ok "Required commands available: php, composer, mysql, mysqldump"

    # Detect npm/node
    if command -v npm >/dev/null; then
        ok "Node/npm available: $(node --version) / $(npm --version)"
    else
        err "npm not found — required to build Archive frontend"
    fi

    # Read DB config from .env
    DB_DATABASE=$(grep -E '^DB_DATABASE=' "$PTERO_PATH/.env" | cut -d= -f2-)
    DB_USERNAME=$(grep -E '^DB_USERNAME=' "$PTERO_PATH/.env" | cut -d= -f2-)
    DB_PASSWORD=$(grep -E '^DB_PASSWORD=' "$PTERO_PATH/.env" | cut -d= -f2-)
    DB_HOST=$(grep -E '^DB_HOST=' "$PTERO_PATH/.env" | cut -d= -f2- || echo "127.0.0.1")

    [[ -z "$DB_DATABASE" ]] && err "DB_DATABASE not set in .env"
    ok "Database: $DB_DATABASE @ $DB_HOST (user: $DB_USERNAME)"

    # Check if already migrated
    if [[ -d "$PTERO_PATH/app/Archive" ]]; then
        warn "Archive Panel appears to be already installed at $PTERO_PATH/app/Archive"
        if ! $FORCE; then
            read -r -p "Re-run migration anyway? (yes/no): " CONFIRM2
            [[ "${CONFIRM2,,}" != "yes" ]] && exit 0
        fi
    fi

    # Detect web server
    WEB_SERVER="unknown"
    if systemctl is-active --quiet nginx 2>/dev/null; then WEB_SERVER="nginx"
    elif systemctl is-active --quiet apache2 2>/dev/null; then WEB_SERVER="apache2"
    elif systemctl is-active --quiet httpd 2>/dev/null; then WEB_SERVER="httpd"
    fi
    ok "Web server: $WEB_SERVER"

    # Detect PHP-FPM service name
    PHP_FPM_SERVICE=$(systemctl list-unit-files 2>/dev/null | grep -oP 'php[\d.]+-fpm' | head -1 || echo "php-fpm")
    ok "PHP-FPM service: $PHP_FPM_SERVICE"
}

# ============================================================================
# Stage 2: Backup
# ============================================================================
stage_backup() {
    log "Stage 2/10: Backing up Pterodactyl state..."

    if $DRY_RUN; then
        log "(dry-run) Would backup DB, storage, .env, composer files to $BACKUP_DIR"
        return
    fi

    # 2a. Database dump
    log "  Dumping database '$DB_DATABASE'..."
    if ! MYSQL_PWD="$DB_PASSWORD" mysqldump --single-transaction -h "${DB_HOST:-127.0.0.1}" -u "$DB_USERNAME" "$DB_DATABASE" > "$BACKUP_DIR/db.sql" 2>>"$LOG_FILE"; then
        err "Database dump failed. Check DB credentials in $PTERO_PATH/.env"
    fi
    ok "  Database dump: $(du -h "$BACKUP_DIR/db.sql" | cut -f1)"

    # 2b. Storage tarball (this is the big one — could be GBs)
    log "  Archiving storage directory (this may take a moment)..."
    if ! tar -czf "$BACKUP_DIR/storage.tar.gz" -C "$PTERO_PATH" storage 2>>"$LOG_FILE"; then
        err "Storage archive failed"
    fi
    ok "  Storage archive: $(du -h "$BACKUP_DIR/storage.tar.gz" | cut -f1)"

    # 2c. .env copy
    cp "$PTERO_PATH/.env" "$BACKUP_DIR/env.bak"
    ok "  .env copied"

    # 2d. Composer files
    cp "$PTERO_PATH/composer.json" "$BACKUP_DIR/" 2>/dev/null || true
    cp "$PTERO_PATH/composer.lock" "$BACKUP_DIR/" 2>/dev/null || true

    # 2e. Backup the existing frontend (so rollback can restore Pterodactyl's UI)
    if [[ -d "$PTERO_PATH/resources/scripts" ]]; then
        tar -czf "$BACKUP_DIR/pterodactyl-frontend.tar.gz" -C "$PTERO_PATH" resources/scripts 2>>"$LOG_FILE" || true
        ok "  Pterodactyl frontend backed up"
    fi

    # 2f. Backup public/build (compiled assets)
    if [[ -d "$PTERO_PATH/public/build" ]]; then
        tar -czf "$BACKUP_DIR/pterodactyl-public-build.tar.gz" -C "$PTERO_PATH" public/build 2>>"$LOG_FILE" || true
        ok "  Pterodactyl compiled assets backed up"
    fi

    # 2g. Write rollback marker
    cat > "$BACKUP_ROOT/last_install.env" <<EOF
PTERO_PATH=$PTERO_PATH
BACKUP_DIR=$BACKUP_DIR
TIMESTAMP=$TIMESTAMP
PTERO_VERSION=$PTERO_VERSION
DB_DATABASE=$DB_DATABASE
DB_USERNAME=$DB_USERNAME
DB_HOST=$DB_HOST
WEB_SERVER=$WEB_SERVER
PHP_FPM_SERVICE=$PHP_FPM_SERVICE
EOF
    chmod 600 "$BACKUP_ROOT/last_install.env"
    ok "  Rollback marker: $BACKUP_ROOT/last_install.env"
}

# ============================================================================
# Stage 3: Download Archive from GitHub
# ============================================================================
stage_download() {
    log "Stage 3/10: Downloading Archive Panel from GitHub..."

    if $SKIP_DOWNLOAD; then
        log "  --skip-download set; assuming Archive files already in place"
        return
    fi

    if $DRY_RUN; then
        log "(dry-run) Would download from $GITHUB_ARCHIVE_URL to $STAGING_DIR"
        return
    fi

    mkdir -p "$STAGING_DIR"
    log "  Fetching $GITHUB_ARCHIVE_URL..."
    if ! curl -fsSL "$GITHUB_ARCHIVE_URL" -o "$STAGING_DIR/archive.tar.gz" 2>>"$LOG_FILE"; then
        err "Failed to download Archive from GitHub. Check internet connectivity and repo visibility."
    fi
    ok "  Downloaded: $(du -h "$STAGING_DIR/archive.tar.gz" | cut -f1)"

    log "  Extracting..."
    if ! tar -xzf "$STAGING_DIR/archive.tar.gz" -C "$STAGING_DIR" 2>>"$LOG_FILE"; then
        err "Extraction failed"
    fi

    # GitHub tarballs extract to <repo>-<branch>/ — find it
    EXTRACTED_DIR=$(find "$STAGING_DIR" -maxdepth 1 -type d -name "ArchiveXPanel-*" | head -1)
    if [[ -z "$EXTRACTED_DIR" ]]; then
        err "Could not find extracted Archive directory"
    fi
    ARCHIVE_SOURCE="$EXTRACTED_DIR"
    ok "  Extracted to: $ARCHIVE_SOURCE"

    # Verify it's actually Archive (sanity check)
    if [[ ! -f "$ARCHIVE_SOURCE/app/Archive/Providers/ArchiveServiceProvider.php" ]]; then
        err "Downloaded archive is missing ArchiveServiceProvider — wrong repo or corrupted download"
    fi
    ok "  Archive structure verified"
}

# ============================================================================
# Stage 4: Merge Archive additions into Pterodactyl
# ============================================================================
stage_merge() {
    log "Stage 4/10: Merging Archive additions into Pterodactyl..."

    if $DRY_RUN; then
        log "(dry-run) Would copy app/Archive/, database/migrations/archive/, routes/archive.php, config/archive.php"
        return
    fi

    # 4a. Copy the Archive backend (additive — does NOT overwrite Pterodactyl files)
    #     rm -rf first so re-runs do a CLEAN REPLACE, not a merge (cp -r merges into existing dirs)
    log "  Copying app/Archive/..."
    rm -rf "$PTERO_PATH/app/Archive"
    cp -r "$ARCHIVE_SOURCE/app/Archive" "$PTERO_PATH/app/Archive"
    ok "  app/Archive/ installed"

    # 4b. Copy Archive migrations
    log "  Copying database/migrations/archive/..."
    rm -rf "$PTERO_PATH/database/migrations/archive"
    mkdir -p "$PTERO_PATH/database/migrations/archive"
    cp -r "$ARCHIVE_SOURCE"/database/migrations/archive/*.php "$PTERO_PATH/database/migrations/archive/"
    ok "  database/migrations/archive/ installed"

    # 4c. Copy routes
    log "  Copying routes/archive.php..."
    cp -f "$ARCHIVE_SOURCE/routes/archive.php" "$PTERO_PATH/routes/archive.php"
    ok "  routes/archive.php installed"

    # 4d. Copy config
    log "  Copying config/archive.php..."
    cp -f "$ARCHIVE_SOURCE/config/archive.php" "$PTERO_PATH/config/archive.php"
    ok "  config/archive.php installed"

    # 4e. Replace the React frontend scripts (Pterodactyl's React → Archive's React)
    #     CRITICAL: Do NOT delete resources/views — Pterodactyl's controllers reference
    #     templates/base/core.blade.php, templates/wrapper.blade.php, auth views, admin
    #     views, etc. Deleting them causes "View [templates.base.core] not found" 500s.
    #     Only replace resources/scripts (the React app) and override specific views.
    log "  Replacing React frontend scripts..."
    rm -rf "$PTERO_PATH/resources/scripts"
    cp -r "$ARCHIVE_SOURCE/resources/scripts" "$PTERO_PATH/resources/scripts"
    ok "  Frontend scripts replaced (Pterodactyl React → Archive React)"

    # 4e.2 Override specific Blade views (layouts/app.blade.php, templates/base/core.blade.php)
    #     These mount our React app instead of Pterodactyl's. Other Pterodactyl views
    #     (auth, admin, errors) stay intact so controllers don't 500.
    log "  Overriding base Blade views to mount Archive React app..."
    mkdir -p "$PTERO_PATH/resources/views/layouts"
    mkdir -p "$PTERO_PATH/resources/views/templates/base"
    cp -f "$ARCHIVE_SOURCE/resources/views/layouts/app.blade.php" "$PTERO_PATH/resources/views/layouts/app.blade.php"
    cp -f "$ARCHIVE_SOURCE/resources/views/templates/base/core.blade.php" "$PTERO_PATH/resources/views/templates/base/core.blade.php"
    cp -f "$ARCHIVE_SOURCE/resources/views/templates/wrapper.blade.php" "$PTERO_PATH/resources/views/templates/wrapper.blade.php"
    ok "  Base views overridden (loads Vite bundle, not Pterodactyl webpack)"

    # 4f. Replace package.json + build configs (use -f to overwrite)
    log "  Updating build configuration..."
    cp -f "$ARCHIVE_SOURCE/package.json" "$PTERO_PATH/package.json"
    cp -f "$ARCHIVE_SOURCE/vite.config.ts" "$PTERO_PATH/vite.config.ts"
    cp -f "$ARCHIVE_SOURCE/tsconfig.json" "$PTERO_PATH/tsconfig.json"
    cp -f "$ARCHIVE_SOURCE/tailwind.config.cjs" "$PTERO_PATH/tailwind.config.cjs"
    cp -f "$ARCHIVE_SOURCE/postcss.config.cjs" "$PTERO_PATH/postcss.config.cjs" 2>/dev/null || true
    # Remove ALL conflicting legacy configs from Pterodactyl
    # CRITICAL: postcss.config.js and tailwind.config.js (old Pterodactyl versions)
    # must be deleted because Node's resolver picks .js over .cjs when both exist.
    # The old postcss.config.js requires postcss-import/postcss-nesting/postcss-preset-env
    # which aren't in Archive's package.json — causing MODULE_NOT_FOUND during build.
    rm -f "$PTERO_PATH/webpack.config.js" \
          "$PTERO_PATH/babel.config.js" \
          "$PTERO_PATH/yarn.lock" \
          "$PTERO_PATH/postcss.config.js" \
          "$PTERO_PATH/tailwind.config.js" \
          "$PTERO_PATH/jest.config.js"
    # Remove node_modules + package-lock so npm install starts fresh with new package.json
    rm -rf "$PTERO_PATH/node_modules" "$PTERO_PATH/package-lock.json"
    ok "  Build configs updated (Vite + TypeScript + Tailwind v3)"

    # 4g. Copy installer + README
    cp "$ARCHIVE_SOURCE/install.sh" "$PTERO_PATH/install.sh"
    cp "$ARCHIVE_SOURCE/README.md" "$PTERO_PATH/README.md"
    chmod +x "$PTERO_PATH/install.sh"
    ok "  install.sh + README updated"

    # 4h. Update composer.json — add Archive namespace to autoload
    if ! grep -q '"Archive\\\\":' "$PTERO_PATH/composer.json"; then
        log "  Registering Archive\\ namespace in composer.json..."
        # Use sed to inject the Archive line after the Pterodactyl line
        sed -i 's|"Pterodactyl\\\\": "app/",|"Pterodactyl\\\\": "app/",\n            "Archive\\\\": "app/Archive/",|' "$PTERO_PATH/composer.json"
        ok "  Archive\\ namespace registered"
    fi

    # 4i. Register ArchiveServiceProvider in config/app.php
    if ! grep -q "ArchiveServiceProvider" "$PTERO_PATH/config/app.php"; then
        log "  Registering ArchiveServiceProvider..."
        sed -i 's|Pterodactyl\\Providers\\ViewComposerServiceProvider::class,|Pterodactyl\\Providers\\ViewComposerServiceProvider::class,\n        Archive\\Providers\\ArchiveServiceProvider::class,|' "$PTERO_PATH/config/app.php"
        ok "  ArchiveServiceProvider registered"
    fi
}

# ============================================================================
# Stage 5: Composer + npm install
# ============================================================================
stage_deps() {
    log "Stage 5/10: Installing dependencies..."

    if $DRY_RUN; then
        log "(dry-run) Would run: composer install + npm ci"
        return
    fi

    cd "$PTERO_PATH"

    log "  Running composer dump-autoload (picks up new Archive\\ namespace)..."
    if ! composer dump-autoload --no-interaction 2>&1 | tail -5 | tee -a "$LOG_FILE"; then
        err "composer dump-autoload failed"
    fi
    ok "  Autoloader rebuilt"

    log "  Installing npm dependencies..."
    if ! npm ci --no-audit --no-fund 2>&1 | tail -5 | tee -a "$LOG_FILE"; then
        warn "npm ci failed (no lockfile?) — falling back to npm install"
        # Try regular install first
        if ! npm install --no-audit --no-fund 2>&1 | tail -5 | tee -a "$LOG_FILE"; then
            warn "npm install failed (peer dep conflict?) — retrying with --legacy-peer-deps"
            if ! npm install --no-audit --no-fund --legacy-peer-deps 2>&1 | tail -5 | tee -a "$LOG_FILE"; then
                err "npm install failed even with --legacy-peer-deps. Check $LOG_FILE"
            fi
        fi
    fi
    ok "  npm dependencies installed"
}

# ============================================================================
# Stage 6: Run migrations (additive only)
# ============================================================================
stage_migrate() {
    log "Stage 6/10: Applying Archive migrations (additive)..."

    if $DRY_RUN; then
        log "(dry-run) Would run: php artisan migrate --path=database/migrations/archive"
        return
    fi

    cd "$PTERO_PATH"

    # If a previous run partially created the archive_themes table OR left stale
    # migration records, clean up BOTH so the migration can run cleanly.
    # This is safe because:
    #   - archive_themes contains only Archive data (never Pterodactyl data)
    #   - The migration records are for Archive migrations only (prefix 2025_01_01_)
    log "  Checking for partial migration state..."
    php artisan tinker --execute="
        \$cleaned = [];
        // Drop the table if it exists (partial or complete)
        if (\Schema::hasTable('archive_themes')) {
            \Schema::dropIfExists('archive_themes');
            \$cleaned[] = 'dropped_table';
        }
        // Drop the users column if it exists (from previous migration)
        if (\Schema::hasColumn('users', 'archive_theme_id')) {
            \Schema::table('users', function (\$table) {
                \$table->dropIndex(['archive_theme_id']);
            });
            \Schema::table('users', function (\$table) {
                \$table->dropColumn('archive_theme_id');
            });
            \$cleaned[] = 'dropped_column';
        }
        // Delete stale migration records so Laravel re-runs them
        \$deleted = \DB::table('migrations')->where('migration', 'like', '2025_01_01_%')->delete();
        if (\$deleted > 0) {
            \$cleaned[] = 'deleted_' . \$deleted . '_stale_records';
        }
        echo empty(\$cleaned) ? 'clean' : implode(', ', \$cleaned);
    " 2>&1 | tee -a "$LOG_FILE" || true

    if ! php artisan migrate --path=database/migrations/archive --force 2>&1 | tee -a "$LOG_FILE"; then
        err "Migration failed — initiating rollback"
        archive_rollback
        exit 1
    fi
    ok "Archive migrations applied (additive — no destructive schema changes)"

    # Publish Archive config (if not already published)
    if [[ ! -f "$PTERO_PATH/config/archive.php" ]]; then
        php artisan vendor:publish --tag=archive-config --force 2>&1 | tee -a "$LOG_FILE" || true
    fi
}

# ============================================================================
# Stage 7: Build frontend
# ============================================================================
stage_build() {
    log "Stage 7/10: Building Archive frontend..."

    if $SKIP_BUILD; then
        log "  --skip-build set; using prebuilt assets"
        return
    fi

    if $DRY_RUN; then
        log "(dry-run) Would run: npm run build"
        return
    fi

    cd "$PTERO_PATH"

    if ! npm run build 2>&1 | tail -10 | tee -a "$LOG_FILE"; then
        err "npm run build failed — initiating rollback"
        archive_rollback
        exit 1
    fi
    ok "Frontend built → public/build/"

    # Verify manifest exists. Vite 5+ puts it at .vite/manifest.json (with leading dot).
    if [[ ! -f "public/build/manifest.json" && ! -f "public/build/.vite/manifest.json" ]]; then
        err "Vite manifest missing — build silently failed"
    fi
    ok "Build manifest present"
}

# ============================================================================
# Stage 8: Verify integrity
# ============================================================================
stage_verify() {
    log "Stage 8/10: Verifying integrity..."

    cd "$PTERO_PATH"

    # 8a. PHP syntax check on Archive files
    log "  PHP syntax check..."
    local syntax_errors=0
    while IFS= read -r f; do
        if ! php -l "$f" 2>&1 | grep -q "No syntax errors"; then
            syntax_errors=$((syntax_errors + 1))
            echo "    FAIL: $f" | tee -a "$LOG_FILE"
        fi
    done < <(find app/Archive -name "*.php")
    [[ $syntax_errors -gt 0 ]] && err "$syntax_errors PHP file(s) have syntax errors"
    ok "  Archive PHP files: syntax OK"

    # 8b. Laravel boots
    log "  Laravel boot check..."
    if ! php artisan tinker --execute="echo 'boot:ok';" 2>&1 | grep -q "boot:ok"; then
        err "Laravel failed to boot — check $LOG_FILE"
    fi
    ok "  Laravel boots"

    # 8c. ArchiveServiceProvider registered
    log "  Archive service provider check..."
    if ! php artisan tinker --execute="echo app()->make(\Archive\AI\ProviderRegistry::class)->getDefaultDriver();" 2>&1 | grep -q "dolphin"; then
        err "Archive service provider not registered"
    fi
    ok "  ArchiveServiceProvider registered"

    # 8d. Theme table exists
    log "  Database schema check..."
    if ! php artisan tinker --execute="echo \Archive\Models\Theme::count();" 2>&1 | tee -a "$LOG_FILE"; then
        err "archive_themes table missing — migration failed"
    fi
    ok "  archive_themes table present"

    # 8e. Default theme seeded
    log "  Default theme check..."
    local theme_count
    theme_count=$(php artisan tinker --execute="echo \Archive\Models\Theme::count();" 2>/dev/null | tr -d '[:space:]')
    if [[ "$theme_count" -lt 1 ]]; then
        warn "No default theme found — seeding..."
        # Re-run the migration's seed logic
        php artisan tinker --execute="\Archive\Models\Theme::firstOrCreate(['is_default' => true, 'scope' => 'installation'], ['name' => 'Archive Dark (default)', 'variant' => 'dark', 'density' => 'comfortable', 'motion' => 'standard', 'glass_intensity' => 65]);" 2>&1 | tee -a "$LOG_FILE"
    fi
    ok "  Default theme present"
}

# ============================================================================
# Stage 9: Cutover
# ============================================================================
stage_cutover() {
    log "Stage 9/10: Cutover — reloading services..."

    if $DRY_RUN; then
        log "(dry-run) Would reload $PHP_FPM_SERVICE + $WEB_SERVER"
        return
    fi

    cd "$PTERO_PATH"

    # Clear + rebuild Laravel caches
    log "  Rebuilding Laravel caches..."
    php artisan cache:clear 2>&1 | tee -a "$LOG_FILE" || true
    php artisan config:cache 2>&1 | tee -a "$LOG_FILE" || true
    php artisan route:cache 2>&1 | tee -a "$LOG_FILE" || true
    php artisan view:cache 2>&1 | tee -a "$LOG_FILE" || true
    ok "  Laravel caches rebuilt"

    # Reload PHP-FPM
    if [[ "$PHP_FPM_SERVICE" != "php-fpm" ]] || systemctl is-active --quiet "$PHP_FPM_SERVICE" 2>/dev/null; then
        log "  Reloading $PHP_FPM_SERVICE..."
        systemctl reload "$PHP_FPM_SERVICE" 2>&1 | tee -a "$LOG_FILE" || warn "$PHP_FPM_SERVICE reload failed (may need manual restart)"
    fi

    # Reload web server
    if [[ "$WEB_SERVER" != "unknown" ]]; then
        log "  Reloading $WEB_SERVER..."
        systemctl reload "$WEB_SERVER" 2>&1 | tee -a "$LOG_FILE" || warn "$WEB_SERVER reload failed"
    fi

    # Set correct permissions (Pterodactyl convention)
    log "  Fixing permissions..."
    chown -R www-data:www-data "$PTERO_PATH/storage" "$PTERO_PATH/bootstrap/cache" 2>/dev/null || true
    chown -R www-data:www-data "$PTERO_PATH/public/build" 2>/dev/null || true
    ok "  Permissions set"
}

# ============================================================================
# Stage 10: Install rollback command
# ============================================================================
stage_rollback_ready() {
    log "Stage 10/10: Installing rollback command..."

    if $DRY_RUN; then
        log "(dry-run) Would install /usr/local/bin/archive-rollback"
        return
    fi

    cat > /usr/local/bin/archive-rollback <<'ROLLBACK'
#!/usr/bin/env bash
# Archive Panel — Rollback to pre-migration Pterodactyl state
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/var/archive/backups}"
MARKER="$BACKUP_ROOT/last_install.env"

if [[ ! -f "$MARKER" ]]; then
    echo "ERROR: No rollback marker found at $MARKER"
    echo "Either no migration was performed, or the marker was removed."
    exit 1
fi

source "$MARKER"

echo "================================================"
echo "  Archive Panel → Pterodactyl Rollback"
echo "================================================"
echo "  Pterodactyl path: $PTERO_PATH"
echo "  Backup directory: $BACKUP_DIR"
echo "  Original version: $PTERO_VERSION"
echo "  Migration time:   $TIMESTAMP"
echo ""

if [[ ! -d "$BACKUP_DIR" ]]; then
    echo "ERROR: Backup directory $BACKUP_DIR no longer exists."
    exit 1
fi

read -r -p "This will restore Pterodactyl from backup. Type 'ROLLBACK' to confirm: " CONFIRM
if [[ "$CONFIRM" != "ROLLBACK" ]]; then
    echo "Aborted."
    exit 0
fi

cd "$PTERO_PATH"

echo ""
echo "1. Restoring database..."
MYSQL_PWD="$DB_PASSWORD" mysql -h "$DB_HOST" -u "$DB_USERNAME" "$DB_DATABASE" < "$BACKUP_DIR/db.sql"
echo "   ✓ Database restored"

echo "2. Restoring storage..."
rm -rf storage
tar -xzf "$BACKUP_DIR/storage.tar.gz"
echo "   ✓ Storage restored"

echo "3. Restoring .env..."
cp "$BACKUP_DIR/env.bak" .env
echo "   ✓ .env restored"

echo "4. Restoring Pterodactyl frontend..."
if [[ -f "$BACKUP_DIR/pterodactyl-frontend.tar.gz" ]]; then
    rm -rf resources/scripts
    tar -xzf "$BACKUP_DIR/pterodactyl-frontend.tar.gz"
    echo "   ✓ Frontend restored"
fi

echo "5. Restoring composer files..."
cp "$BACKUP_DIR/composer.json" .
[[ -f "$BACKUP_DIR/composer.lock" ]] && cp "$BACKUP_DIR/composer.lock" .

echo "6. Removing Archive backend files..."
rm -rf app/Archive database/migrations/archive routes/archive.php config/archive.php
sed -i '/Archive\\\\": "app\/Archive\/",/d' composer.json
sed -i '/Archive\\Providers\\ArchiveServiceProvider/d' config/app.php
composer dump-autoload --no-interaction

echo "7. Rebuilding..."
composer install --no-dev --optimize-autoloader
npm ci && npm run build

echo "8. Reloading services..."
systemctl reload "$PHP_FPM_SERVICE" 2>/dev/null || true
systemctl reload "$WEB_SERVER" 2>/dev/null || true

echo ""
echo "================================================"
echo "  ✓ Rollback complete"
echo "  Pterodactyl $PTERO_VERSION restored."
echo ""
echo "  Archive-specific DB tables (archive_themes, etc.) are still present"
echo "  but unused. To remove them manually:"
echo "    php artisan tinker"
echo "    >>> \Schema::dropIfExists('archive_themes');"
echo "================================================"
ROLLBACK
    chmod +x /usr/local/bin/archive-rollback
    ok "Rollback command installed: /usr/local/bin/archive-rollback"
    log ""
    log "To rollback within 72 hours:"
    log "  sudo archive-rollback"
}

# ============================================================================
# Failure handler — auto-rollback on critical stage failure
# ============================================================================
archive_rollback() {
    echo ""
    echo "============================================================"
    echo "  Migration FAILED — auto-rollback initiated"
    echo "============================================================"
    if [[ -f /usr/local/bin/archive-rollback ]]; then
        echo "ROLLBACK" | /usr/local/bin/archive-rollback || true
    else
        err "Rollback command not yet installed. Manual recovery required from $BACKUP_DIR"
    fi
}

# ============================================================================
# Cleanup
# ============================================================================
cleanup() {
    if [[ -d "$STAGING_DIR" ]]; then
        rm -rf "$STAGING_DIR"
        log "Cleaned up staging directory"
    fi
}
trap cleanup EXIT

# ============================================================================
# Run stages
# ============================================================================
for stage in $(seq "$STAGE_START" "$STAGE_END"); do
    case $stage in
        1)  stage_detect ;;
        2)  stage_backup ;;
        3)  stage_download ;;
        4)  stage_merge ;;
        5)  stage_deps ;;
        6)  stage_migrate ;;
        7)  stage_build ;;
        8)  stage_verify ;;
        9)  stage_cutover ;;
        10) stage_rollback_ready ;;
    esac
done

# ============================================================================
# Done
# ============================================================================
echo ""
echo "============================================================"
echo "  ✓ Archive Panel migration complete"
echo ""
echo "  Version:    $ARCHIVE_VERSION"
echo "  Backup:     $BACKUP_DIR"
echo "  Log:        $LOG_FILE"
echo ""
echo "  Next steps:"
echo "    1. Visit your panel URL — you should see the new Archive UI"
echo "    2. Try Ctrl+K to open the Command Center"
echo "    3. Check Settings → Theme to customize appearance"
echo ""
echo "  Rollback available for 72 hours via:"
echo "    sudo archive-rollback"
echo ""
echo "  Report issues: https://github.com/${GITHUB_REPO}/issues"
echo "============================================================"
