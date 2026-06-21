<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Archive Panel — Themes Table Migration
 * ----------------------------------------------------------------------------
 * Creates the archive_themes table. Purely additive — does NOT touch any
 * existing Pterodactyl table. The user-theme link lives in a separate column
 * added to the users table by add_archive_theme_to_users.php.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('archive_themes', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->text('description')->nullable();
            $table->enum('variant', ['dark', 'light', 'amoled'])->default('dark');
            $table->enum('density', ['comfortable', 'compact', 'spacious', 'accessibility'])->default('comfortable');
            $table->enum('motion', ['standard', 'reduced'])->default('standard');
            $table->unsignedTinyInteger('glass_intensity')->default(65);
            $table->json('overrides')->nullable();
            $table->enum('scope', ['installation', 'workspace', 'user'])->default('installation');
            $table->boolean('is_default')->default(false);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['scope', 'is_default']);
        });

        // Seed a default installation theme
        \DB::table('archive_themes')->insert([
            'name'           => 'Archive Dark (default)',
            'description'    => 'Deep space with indigo→cyan accents. The Archive Panel signature theme.',
            'variant'        => 'dark',
            'density'        => 'comfortable',
            'motion'         => 'standard',
            'glass_intensity'=> 65,
            'overrides'      => null,
            'scope'          => 'installation',
            'is_default'     => true,
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('archive_themes');
    }
};
