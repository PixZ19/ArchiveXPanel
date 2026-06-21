<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the archive_theme_id column to the users table.
 * Allows per-user theme override (resolved via the Theme inheritance chain).
 *
 * No foreign key constraint — avoids MySQL errno 150 (charset/engine mismatch
 * between Pterodactyl's users table and our archive_themes table across
 * different Pterodactyl versions and MySQL configurations). Eloquent handles
 * the relationship at the application layer.
 */
return new class extends Migration {
    public function up(): void
    {
        // Check if column already exists (idempotent for re-runs)
        if (!Schema::hasColumn('users', 'archive_theme_id')) {
            Schema::table('users', function (Blueprint $table) {
                $table->unsignedBigInteger('archive_theme_id')
                    ->nullable()
                    ->after('email');
                $table->index('archive_theme_id');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('users', 'archive_theme_id')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropIndex(['archive_theme_id']);
                $table->dropColumn('archive_theme_id');
            });
        }
    }
};
