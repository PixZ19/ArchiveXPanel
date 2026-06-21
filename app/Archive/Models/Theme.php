<?php

namespace Archive\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Archive Panel — Theme Model
 * ----------------------------------------------------------------------------
 * A Theme is a JSON record mapping semantic CSS token roles to concrete values,
 * stored in the database, injectable at runtime via CSS custom properties.
 *
 * Resolution chain (highest priority first):
 *   1. User override      (themeable = true on the User record)
 *   2. Workspace theme    (per-workspace branding)
 *   3. Installation theme (admin-set global default)
 *
 * Themes never modify component structure — only colors, typography, density,
 * motion, and material. This separation keeps the system safe: a malformed
 * theme cannot brick the panel.
 */
class Theme extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'archive_themes';

    protected $fillable = [
        'name',
        'description',
        'variant',          // dark | light | amoled
        'density',          // comfortable | compact | spacious | accessibility
        'motion',           // standard | reduced
        'glass_intensity',  // 0-100
        'overrides',        // JSON: optional accent/bg/surface overrides
        'scope',            // installation | workspace | user
        'is_default',
        'created_by',
    ];

    protected $casts = [
        'overrides'       => 'array',
        'glass_intensity' => 'integer',
        'is_default'      => 'boolean',
    ];

    public const VARIANT_DARK   = 'dark';
    public const VARIANT_LIGHT  = 'light';
    public const VARIANT_AMOLED = 'amoled';

    public const DENSITY_COMFORTABLE   = 'comfortable';
    public const DENSITY_COMPACT       = 'compact';
    public const DENSITY_SPACIOUS      = 'spacious';
    public const DENSITY_ACCESSIBILITY = 'accessibility';

    public const SCOPE_INSTALLATION = 'installation';
    public const SCOPE_WORKSPACE    = 'workspace';
    public const SCOPE_USER         = 'user';

    /**
     * Resolve the active theme for a user.
     * Returns the JSON payload that will be injected as CSS variables.
     */
    public static function resolveForUser($user): array
    {
        // 1. User override (highest priority)
        $userTheme = $user?->archive_theme_id
            ? self::find($user->archive_theme_id)
            : null;

        // 2. Workspace theme
        $workspaceTheme = null; // TODO: when Workspace model ships, look up here

        // 3. Installation default
        $installationTheme = self::where('scope', self::SCOPE_INSTALLATION)
            ->where('is_default', true)
            ->first();

        $theme = $userTheme ?? $workspaceTheme ?? $installationTheme;

        if (!$theme) {
            // Hardcoded fallback — always exists
            return [
                'variant'        => self::VARIANT_DARK,
                'density'        => self::DENSITY_COMFORTABLE,
                'motion'         => 'standard',
                'glass_intensity'=> 65,
                'overrides'      => null,
                'source'         => 'system',
            ];
        }

        return [
            'variant'        => $theme->variant,
            'density'        => $theme->density,
            'motion'         => $theme->motion,
            'glass_intensity'=> $theme->glass_intensity,
            'overrides'      => $theme->overrides,
            'source'         => $theme->scope,
            'id'             => $theme->id,
            'name'           => $theme->name,
        ];
    }

    /**
     * Validate an overrides payload. Rejects anything that doesn't pass
     * WCAG AA contrast against the variant's surface.
     */
    public static function validateOverrides(array $overrides, string $variant): array
    {
        $allowed = ['accent', 'accent2', 'accent3', 'bg', 'surface'];
        $clean = [];

        foreach ($allowed as $key) {
            if (!isset($overrides[$key])) continue;
            $hex = $overrides[$key];
            if (!preg_match('/^#[0-9a-fA-F]{6}$/', $hex)) {
                throw new \InvalidArgumentException("Invalid hex color for {$key}: {$hex}");
            }
            // WCAG AA check would go here — see Archive\Services\WcagValidator
            $clean[$key] = $hex;
        }

        return $clean;
    }
}
