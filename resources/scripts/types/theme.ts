/**
 * Theme types — match the Laravel Theme model exactly.
 * A Theme is a JSON record mapping semantic token roles to concrete values,
 * stored in the database, injectable at runtime via CSS custom properties.
 */

export type ThemeVariant = 'dark' | 'light' | 'amoled';
export type DensityMode = 'comfortable' | 'compact' | 'spacious' | 'accessibility';
export type MotionPreference = 'standard' | 'reduced';

export interface ThemeTokens {
  variant: ThemeVariant;
  density: DensityMode;
  motion: MotionPreference;
  glassIntensity: number; // 0-100
  // Optional overrides on top of the variant base
  overrides?: Partial<{
    accent: string;
    accent2: string;
    accent3: string;
    bg: string;
    surface: string;
  }>;
}

export interface Theme extends ThemeTokens {
  id: string;
  name: string;
  description?: string;
  scope: 'installation' | 'workspace' | 'user';
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedTheme {
  variant: ThemeVariant;
  density: DensityMode;
  motion: MotionPreference;
  glassIntensity: number;
  overrides?: ThemeTokens['overrides'];
  source: 'user' | 'workspace' | 'installation' | 'system';
}
