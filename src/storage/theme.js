export const STORAGE_THEME = 'lolTheme';
export const LEGACY_THEME_KEY = 'lol-theme';

function getDefaultStorage() {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function loadTheme(storage = getDefaultStorage(), prefersDark = false) {
  const savedTheme = storage?.getItem(STORAGE_THEME) || storage?.getItem(LEGACY_THEME_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
  return prefersDark ? 'dark' : 'light';
}

export function saveTheme(theme, storage = getDefaultStorage()) {
  if (!storage) return;
  storage.setItem(STORAGE_THEME, theme);
  storage.removeItem(LEGACY_THEME_KEY);
}
