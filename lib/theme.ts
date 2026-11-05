export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export const THEME_STORAGE_KEY = 'sudoku-snap:theme';
export const THEME_COLORS = { light: '#f3f5f7', dark: '#101722' } as const;

export function parseThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}

export function readThemePreference(environment: Window = window): ThemePreference {
  try {
    return parseThemePreference(environment.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

function systemIsDark(environment: Window): boolean {
  return environment.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function applyTheme(
  preference: ThemePreference,
  environment: Window = window,
): ResolvedTheme {
  const theme = resolveTheme(preference, systemIsDark(environment));
  const document = environment.document;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
  }
  meta.content = THEME_COLORS[theme];
  return theme;
}

// Retain the in-memory choice if storage is blocked or full.
let currentPreference: ThemePreference | undefined;
const subscribers = new Set<(preference: ThemePreference) => void>();

export function setThemePreference(
  preference: ThemePreference,
  environment: Window = window,
): void {
  currentPreference = preference;
  try {
    environment.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Private browsing and disabled storage must not disable theme controls.
  }
  applyTheme(preference, environment);
  subscribers.forEach((notify) => notify(preference));
}

export function watchTheme(
  notify: (preference: ThemePreference) => void,
  environment: Window = window,
): () => void {
  currentPreference ??= readThemePreference(environment);
  const refresh = () => {
    const preference = currentPreference ?? 'system';
    applyTheme(preference, environment);
    notify(preference);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    currentPreference = readThemePreference(environment);
    refresh();
  };
  const media = environment.matchMedia?.('(prefers-color-scheme: dark)');
  subscribers.add(notify);
  media?.addEventListener('change', refresh);
  environment.addEventListener('storage', onStorage);
  refresh();
  return () => {
    subscribers.delete(notify);
    media?.removeEventListener('change', refresh);
    environment.removeEventListener('storage', onStorage);
  };
}

// Self-contained so the same code runs before hydration, without a client bundle.
function bootstrapTheme(key: string, colors: Record<ResolvedTheme, string>) {
  let preference: string | null = null;
  try {
    preference = window.localStorage.getItem(key);
  } catch {}
  const theme =
    preference === 'light' || preference === 'dark'
      ? preference
      : window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
  }
  meta.content = colors[theme];
}

export const THEME_BOOTSTRAP_SCRIPT = `(${bootstrapTheme.toString()})(${JSON.stringify(THEME_STORAGE_KEY)},${JSON.stringify(THEME_COLORS)});`;
