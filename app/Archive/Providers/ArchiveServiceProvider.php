<?php

namespace Archive\Providers;

use Archive\AI\ProviderRegistry;
use Illuminate\Support\ServiceProvider;

/**
 * Archive Panel — Service Provider
 * ----------------------------------------------------------------------------
 * Registers all Archive-specific services with Laravel's container.
 * Loaded via config/app.php → 'providers' array.
 *
 * This is the entry point that wires Archive into Pterodactyl's existing
 * application container WITHOUT modifying Pterodactyl's core code.
 */
class ArchiveServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Merge Archive config
        $this->mergeConfigFrom(__DIR__ . '/../../config/archive.php', 'archive');

        // Bind the AI provider registry as a singleton
        $this->app->singleton(ProviderRegistry::class, function ($app) {
            $registry = new ProviderRegistry($app);
            // Default driver is configured in config/archive.php
            return $registry;
        });

        // Register the AI Gateway as a facade accessor
        $this->app->alias(ProviderRegistry::class, 'archive.ai');
    }

    public function boot(): void
    {
        // Load Archive migrations (separate dir keeps them isolated from Ptero's)
        $this->loadMigrationsFrom(__DIR__ . '/../../database/migrations/archive');

        // Load Archive routes (registered under /api/archive/*)
        $this->loadRoutesFrom(__DIR__ . '/../../routes/archive.php');

        // Publish config (php artisan vendor:publish --tag=archive-config)
        $this->publishes([
            __DIR__ . '/../../config/archive.php' => config_path('archive.php'),
        ], 'archive-config');

        // Rate limiter for AI requests
        $this->configureRateLimiter();
    }

    private function configureRateLimiter(): void
    {
        if (!app()->bound(\Illuminate\Cache\RateLimiter::class)) return;

        \RateLimiter::for('archive-ai', function (\Illuminate\Http\Request $request) {
            return \Illuminate\Cache\RateLimit\Limit::perMinute(
                config('archive.ai.rate_limit_per_minute', 30)
            )->by($request->user()?->id ?: $request->ip());
        });
    }
}
