/** Detecta si el código corre dentro de Tauri (desktop). */
export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  return typeof w.__TAURI_INTERNALS__ !== 'undefined' || typeof w.__TAURI__ !== 'undefined';
}
