import { getDesktopData, hasDesktopData, saveDesktopPreferences } from './desktopData.js';

export const STORAGE_THEME = 'lolTheme';
export const LEGACY_THEME_KEY = 'lol-theme';

function getDefaultStorage() {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function loadTheme(storage, prefersDark = false) {
  if (storage === undefined && hasDesktopData()) return getDesktopData().preferences.theme || (prefersDark ? 'dark' : 'light');
  if (storage === undefined) storage = getDefaultStorage();
  const savedTheme = storage?.getItem(STORAGE_THEME) || storage?.getItem(LEGACY_THEME_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
  return prefersDark ? 'dark' : 'light';
}

export function saveTheme(theme, storage) {
  if (storage === undefined && hasDesktopData()) return saveDesktopPreferences({ theme });
  if (storage === undefined) storage = getDefaultStorage();
  if (!storage) return;
  storage.setItem(STORAGE_THEME, theme);
  storage.removeItem(LEGACY_THEME_KEY);
}
