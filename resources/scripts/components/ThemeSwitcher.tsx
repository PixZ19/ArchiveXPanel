/**
 * Theme Switcher
 * ----------------------------------------------------------------------------
 * Quick dropdown for switching between dark / light / AMOLED and adjusting
 * density. Proves runtime theming works end-to-end without a rebuild.
 */

import { useState, useRef, useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import type { ThemeVariant, DensityMode } from '@/types/theme';

export function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useThemeStore();

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const variants: Array<{ id: ThemeVariant; label: string; preview: string }> = [
    { id: 'dark', label: 'Dark', preview: '#0A0B14' },
    { id: 'light', label: 'Light', preview: '#F7F8FA' },
    { id: 'amoled', label: 'AMOLED', preview: '#000000' },
  ];

  const densities: DensityMode[] = ['compact', 'comfortable', 'spacious', 'accessibility'];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-md p-1.5 text-text-muted hover:bg-surface-2 hover:text-text"
        title="Switch theme"
      >
        <span
          className="block h-4 w-4 rounded-full border border-border"
          style={{ background: 'var(--gradient)' }}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-border bg-surface-2 p-3 shadow-lg">
          <div className="mb-3">
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-text-dim">
              Variant
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setTheme({ ...theme, variant: v.id, source: 'user' })}
                  className={`flex flex-col items-center gap-1 rounded-md border p-2 transition-colors ${
                    theme.variant === v.id
                      ? 'border-accent bg-surface-3'
                      : 'border-border hover:border-border-strong'
                  }`}
                >
                  <div
                    className="h-5 w-5 rounded-full border border-border"
                    style={{ background: v.preview }}
                  />
                  <span className="text-[10px]">{v.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-text-dim">
              Density
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {densities.map((d) => (
                <button
                  key={d}
                  onClick={() => setTheme({ ...theme, density: d, source: 'user' })}
                  className={`rounded-md border px-2 py-1.5 text-xs capitalize transition-colors ${
                    theme.density === d
                      ? 'border-accent bg-surface-3'
                      : 'border-border hover:border-border-strong'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-text-dim">
              Glass Intensity · {theme.glassIntensity}%
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={theme.glassIntensity}
              onChange={(e) =>
                setTheme({ ...theme, glassIntensity: parseInt(e.target.value, 10) })
              }
              className="w-full accent-accent"
            />
          </div>
        </div>
      )}
    </div>
  );
}
