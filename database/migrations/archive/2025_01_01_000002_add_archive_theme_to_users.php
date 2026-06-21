<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the archive_theme_id column to the users table.
 * Allows per-user theme override (resolved via the Theme inheritance chain).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('archive_theme_id')
                ->nullable()
                ->after('email')
                ->constrained('archive_themes')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['archive_theme_id']);
            $table->dropColumn('archive_theme_id');
        });
    }
};
