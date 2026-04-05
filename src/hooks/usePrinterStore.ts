/**
 * Hook para gestionar la impresora preferida localmente con tauri-plugin-store.
 * En entorno web (no Tauri) todas las funciones son no-ops silenciosos.
 */

const isTauri = () => typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';

const STORE_FILE = 'sellyx-config.json';
const PRINTER_KEY = 'printerName';

async function getStore() {
  if (!isTauri()) return null;
  const { load } = await import('@tauri-apps/plugin-store');
  return load(STORE_FILE, { autoSave: true, defaults: {} });
}

export async function getSavedPrinter(): Promise<string | null> {
  try {
    const store = await getStore();
    if (!store) return null;
    return await store.get<string>(PRINTER_KEY) ?? null;
  } catch {
    return null;
  }
}

export async function savePrinter(name: string): Promise<void> {
  try {
    const store = await getStore();
    if (!store) return;
    await store.set(PRINTER_KEY, name);
  } catch {
    // silencioso
  }
}

export async function listPrinters(): Promise<string[]> {
  try {
    if (!isTauri()) return [];
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string[]>('list_printers');
  } catch {
    return [];
  }
}

export async function applyPrinterAndPrint(fallback: () => void): Promise<void> {
  try {
    if (!isTauri()) { fallback(); return; }
    const saved = await getSavedPrinter();
    if (saved) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('set_default_printer', { name: saved });
    }
    fallback(); // window.print() — ahora apunta a la impresora correcta
  } catch {
    fallback();
  }
}
