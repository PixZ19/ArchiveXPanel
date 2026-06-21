<?php

namespace Archive\Http\Controllers;

use Archive\Models\Theme;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * Theme Controller
 * ----------------------------------------------------------------------------
 * Serves the resolved theme to the frontend on boot, and exposes admin
 * endpoints for managing themes (CRUD + set-default).
 *
 * Routes:
 *   GET    /api/archive/theme              — resolved theme for current user
 *   GET    /api/archive/themes             — list all themes (admin)
 *   POST   /api/archive/themes             — create (admin)
 *   PUT    /api/archive/themes/{id}        — update (admin)
 *   DELETE /api/archive/themes/{id}        — delete (admin)
 *   POST   /api/archive/themes/{id}/default — set as installation default (admin)
 *   PUT    /api/archive/account/theme      — set current user's theme override
 */
class ThemeController extends Controller
{
    public function __construct()
    {
        $this->middleware('auth');
        $this->middleware('admin')->only(['index', 'store', 'update', 'destroy', 'setDefault']);
    }

    /**
     * Resolved theme for the current user.
     * This is what the frontend fetches on boot to apply tokens.
     */
    public function resolved(Request $request)
    {
        $theme = Theme::resolveForUser($request->user());
        return response()->json($theme);
    }

    /**
     * Set the current user's theme override.
     */
    public function setUserTheme(Request $request)
    {
        $data = $request->validate([
            'theme_id' => ['required', 'exists:archive_themes,id'],
        ]);

        $request->user()->update(['archive_theme_id' => $data['theme_id']]);
        return response()->json(Theme::resolveForUser($request->user()));
    }

    // ============ Admin endpoints ============

    public function index()
    {
        return response()->json(Theme::all());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name'            => ['required', 'string', 'max:120'],
            'description'     => ['nullable', 'string'],
            'variant'         => ['required', 'in:dark,light,amoled'],
            'density'         => ['required', 'in:comfortable,compact,spacious,accessibility'],
            'motion'          => ['required', 'in:standard,reduced'],
            'glass_intensity' => ['integer', 'min:0', 'max:100'],
            'overrides'       => ['nullable', 'array'],
            'scope'           => ['required', 'in:installation,workspace,user'],
        ]);

        if (isset($data['overrides'])) {
            $data['overrides'] = Theme::validateOverrides($data['overrides'], $data['variant']);
        }

        $theme = Theme::create(array_merge($data, [
            'created_by' => $request->user()->id,
        ]));

        return response()->json($theme, 201);
    }

    public function update(Request $request, Theme $theme)
    {
        $data = $request->validate([
            'name'            => ['sometimes', 'string', 'max:120'],
            'description'     => ['nullable', 'string'],
            'variant'         => ['sometimes', 'in:dark,light,amoled'],
            'density'         => ['sometimes', 'in:comfortable,compact,spacious,accessibility'],
            'motion'          => ['sometimes', 'in:standard,reduced'],
            'glass_intensity' => ['sometimes', 'integer', 'min:0', 'max:100'],
            'overrides'       => ['nullable', 'array'],
        ]);

        if (isset($data['overrides'])) {
            $data['overrides'] = Theme::validateOverrides($data['overrides'], $theme->variant);
        }

        $theme->update($data);
        return response()->json($theme);
    }

    public function destroy(Theme $theme)
    {
        if ($theme->is_default) {
            return response()->json(['error' => 'Cannot delete the default theme'], 422);
        }
        $theme->delete();
        return response()->json(null, 204);
    }

    public function setDefault(Theme $theme)
    {
        if ($theme->scope !== Theme::SCOPE_INSTALLATION) {
            return response()->json(['error' => 'Only installation-scoped themes can be default'], 422);
        }

        \DB::transaction(function () use ($theme) {
            Theme::where('scope', Theme::SCOPE_INSTALLATION)
                ->where('is_default', true)
                ->update(['is_default' => false]);
            $theme->update(['is_default' => true]);
        });

        return response()->json($theme);
    }
}
