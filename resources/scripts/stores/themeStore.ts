/**
 * Theme Store (Zustand)
 * ----------------------------------------------------------------------------
 * The store holds the currently resolved theme. On change, it applies the
 * theme to the document root by setting `data-theme` and `data-density`
 * attributes plus any inline overrides via a `<style>` tag.
 *
 * Themes are resolved by the backend through an inheritance chain:
 *   user override → workspace theme → installation default
 * The frontend just receives the resolved theme and applies it.
 */

import { create } from 'zustand';
import type { ResolvedTheme, ThemeTokens } from '@/types/theme';

interface ThemeState {
  theme: ResolvedTheme;
  /** Inline override block injected as a <style> tag in <head>. */
  overrideStyleId: string;
  setTheme: (theme: ResolvedTheme) => void;
  applyOverrides: (overrides: NonNullable<ThemeTokens['overrides']>) => void;
  resetOverrides: () => void;
}

const defaultTheme: ResolvedTheme = {
  variant: 'dark',
  density: 'comfortable',
  motion: 'standard',
  glassIntensity: 65,
  source: 'system',
};

const OVERRIDE_STYLE_ID = 'archive-theme-overrides';

function applyThemeToDOM(theme: ResolvedTheme): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme.variant);
  root.setAttribute('data-density', theme.density);
  if (theme.motion === 'reduced') {
    root.style.setProperty('--dur-fast', '0ms');
    root.style.setProperty('--dur-base', '0ms');
    root.style.setProperty('--dur-slow', '0ms');
  }
  // Glass intensity scales the blur amount
  const blur = Math.round((theme.glassIntensity / 100) * 20);
  root.style.setProperty('--glass-blur', `${blur}px`);
}

function applyOverrides(overrides: NonNullable<ThemeTokens['overrides']>): void {
  let style = document.getElementById(OVERRIDE_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = OVERRIDE_STYLE_ID;
    document.head.appendChild(style);
  }
  const lines: string[] = [];
  if (overrides.accent) lines.push(`--c-accent: ${hexToRgb(overrides.accent)};`);
  if (overrides.accent2) lines.push(`--c-accent-2: ${hexToRgb(overrides.accent2)};`);
  if (overrides.accent3) lines.push(`--c-accent-3: ${hexToRgb(overrides.accent3)};`);
  if (overrides.bg) lines.push(`--c-bg: ${hexToRgb(overrides.bg)};`);
  if (overrides.surface) lines.push(`--c-surface: ${hexToRgb(overrides.surface)};`);
  style.textContent = lines.length ? `:root { ${lines.join(' ')} }` : '';
}

function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `${r} ${g} ${b}`;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: defaultTheme,
  overrideStyleId: OVERRIDE_STYLE_ID,
  setTheme: (theme) => {
    applyThemeToDOM(theme);
    if (theme.overrides) applyOverrides(theme.overrides);
    set({ theme });
  },
  applyOverrides: (overrides) => {
    applyOverrides(overrides);
    set({ theme: { ...get().theme, overrides } });
  },
  resetOverrides: () => {
    const style = document.getElementById(OVERRIDE_STYLE_ID);
    if (style) style.textContent = '';
    set({ theme: { ...get().theme, overrides: undefined } });
  },
}));

// Apply default theme on module load
applyThemeToDOM(defaultTheme);
