/** Light/dark theme helpers. Dark mode is a `dark` class on <html>; the shared
 *  globals.css redefines the colour tokens under `.dark`, so toggling the class
 *  re-themes the whole app. The initial class is applied by the inline script in
 *  index.html (before React mounts) to avoid a flash. */

const STORAGE_KEY = "theme";

/** Whether dark mode is currently active. */
export function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

/** Apply and persist the theme. */
export function setTheme(dark: boolean): void {
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
  } catch {
    /* localStorage unavailable — theme still applies for this session */
  }
}
