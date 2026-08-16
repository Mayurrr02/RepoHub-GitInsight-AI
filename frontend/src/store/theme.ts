import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeState {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'repohub_theme';

function getSystemTheme(): ResolvedTheme {
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch (e) {
    // Ignore storage errors
  }
  return 'dark';
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') {
    return getSystemTheme();
  }
  return mode;
}

function applyThemeToDOM(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.classList.add('light');
    root.style.colorScheme = 'light';
  }
}

const initialTheme = getStoredTheme();
const initialResolved = resolveTheme(initialTheme);
applyThemeToDOM(initialResolved);

export const useThemeStore = create<ThemeState>((set, get) => {
  // Listen for system theme changes if in system mode
  if (typeof window !== 'undefined' && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (get().theme === 'system') {
        const newResolved = getSystemTheme();
        applyThemeToDOM(newResolved);
        set({ resolvedTheme: newResolved });
      }
    });
  }

  return {
    theme: initialTheme,
    resolvedTheme: initialResolved,
    setTheme: (theme: ThemeMode) => {
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch (e) {
        // Ignore
      }
      const resolved = resolveTheme(theme);
      applyThemeToDOM(resolved);
      set({ theme, resolvedTheme: resolved });
    },
    toggleTheme: () => {
      const currentResolved = get().resolvedTheme;
      const nextTheme: ThemeMode = currentResolved === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, nextTheme);
      } catch (e) {
        // Ignore
      }
      applyThemeToDOM(nextTheme);
      set({ theme: nextTheme, resolvedTheme: nextTheme });
    },
  };
});
