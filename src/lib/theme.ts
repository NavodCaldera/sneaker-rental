/** Day (light) or night (dark) mode, picked with the header switch. */
export type Theme = "light" | "dark";

/** Cookie remembering the visitor's pick, so the server renders the right mode. */
export const THEME_COOKIE = "theme";

export function parseTheme(value: string | undefined): Theme | null {
  return value === "light" || value === "dark" ? value : null;
}
