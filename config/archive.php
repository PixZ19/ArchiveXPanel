<?php

/**
 * Archive Panel — Configuration
 * ----------------------------------------------------------------------------
 * All Archive-specific config lives here. Published to config/archive.php
 * on install. Edit via .env overrides for secrets.
 */

return [

    // ============ AI Gateway ============
    'ai' => [

        // Default routing — which provider handles which capability class.
        // Override in .env: ARCHIVE_AI_ROUTING_HEAVY=openai
        'routing' => [
            'light'  => env('ARCHIVE_AI_ROUTING_LIGHT',  'dolphin'),
            'medium' => env('ARCHIVE_AI_ROUTING_MEDIUM', 'dolphin'),
            'heavy'  => env('ARCHIVE_AI_ROUTING_HEAVY',  'dolphin'),
        ],

        // Global rate limit per user (per minute)
        'rate_limit_per_minute' => env('ARCHIVE_AI_RATE_LIMIT', 30),

        // Provider configs
        'dolphin' => [
            'api_key' => env('DOLPHIN_API_KEY', ''),  // public endpoint — key optional
            'timeout' => env('DOLPHIN_TIMEOUT', 120),
            'rpm'     => env('DOLPHIN_RPM', 30),
        ],

        // Future providers — uncomment when implemented
        // 'openai' => [
        //     'api_key' => env('OPENAI_API_KEY'),
        //     'model'   => env('OPENAI_MODEL', 'gpt-4o'),
        // ],
        // 'gemini' => [
        //     'api_key' => env('GEMINI_API_KEY'),
        // ],
        // 'ollama' => [
        //     'host' => env('OLLAMA_HOST', 'http://localhost:11434'),
        // ],
    ],

    // ============ Theming ============
    'theme' => [
        // Whether end users can override their theme. Disable for strict branding.
        'user_override_enabled' => env('ARCHIVE_THEME_USER_OVERRIDE', true),

        // Whether WCAG AA validation blocks theme saves
        'wcag_strict' => env('ARCHIVE_THEME_WCAG_STRICT', true),

        // Theme marketplace (future)
        'marketplace_enabled' => env('ARCHIVE_THEME_MARKETPLACE', false),
    ],

    // ============ Console 2.0 ============
    'console' => [
        // Ring buffer capacity per connected client (lines)
        'buffer_capacity' => env('ARCHIVE_CONSOLE_BUFFER', 100000),

        // Max buffer capacity (admin can raise buffer_capacity up to this)
        'buffer_max' => env('ARCHIVE_CONSOLE_BUFFER_MAX', 1000000),
    ],

    // ============ Multi-Tab ============
    'multi_tab' => [
        // Max tabs per user session
        'max_tabs' => env('ARCHIVE_MULTI_TAB_MAX', 12),
    ],
];
