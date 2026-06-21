<?php

/**
 * Archive Panel — Routes
 * ----------------------------------------------------------------------------
 * All Archive-specific endpoints live under /api/archive/*. The frontend
 * talks to these for new capabilities (AI, themes). Existing Pterodactyl
 * endpoints (/api/client, /api/application) are unchanged.
 */

use Archive\Http\Controllers\AIGatewayController;
use Archive\Http\Controllers\ThemeController;
use Illuminate\Support\Facades\Route;

Route::prefix('api/archive')->middleware(['web', 'auth'])->group(function () {

    // ============ Theme endpoints ============
    Route::get('theme', [ThemeController::class, 'resolved'])->name('archive.theme.resolved');
    Route::put('account/theme', [ThemeController::class, 'setUserTheme'])->name('archive.theme.user');

    Route::middleware(['admin'])->group(function () {
        Route::get('themes', [ThemeController::class, 'index'])->name('archive.themes.index');
        Route::post('themes', [ThemeController::class, 'store'])->name('archive.themes.store');
        Route::put('themes/{theme}', [ThemeController::class, 'update'])->name('archive.themes.update');
        Route::delete('themes/{theme}', [ThemeController::class, 'destroy'])->name('archive.themes.destroy');
        Route::post('themes/{theme}/default', [ThemeController::class, 'setDefault'])->name('archive.themes.default');
    });

    // ============ AI Gateway ============
    Route::post('ai/chat', [AIGatewayController::class, 'chat'])->name('archive.ai.chat');
    Route::post('ai/stream', [AIGatewayController::class, 'stream'])->name('archive.ai.stream');
    Route::post('ai/cancel', [AIGatewayController::class, 'cancel'])->name('archive.ai.cancel');
});
