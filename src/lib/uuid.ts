/**
 * Generador de UUID v4 seguro en TODO navegador/WebView.
 *
 * Por qué NO usar `crypto.randomUUID()` directo: solo existe en contextos
 * seguros (HTTPS/localhost) y en navegadores recientes. En WebViews/Chrome
 * viejos de algunas tablets (ej. Honor) `crypto.randomUUID` es `undefined`, y
 * llamarlo lanza `TypeError` → si ocurre dentro del render/handler de React sin
 * try/catch, revienta el árbol y deja la PANTALLA EN BLANCO. Esto rompía el
 * checkout (efectivo/QR) del POS web en esas tablets.
 *
 * Estrategia por capas (de mejor a peor, nunca lanza):
 *  1. `crypto.randomUUID()` si existe (rápido, criptográficamente fuerte).
 *  2. `crypto.getRandomValues()` armando el UUID v4 a mano (soportado en
 *     navegadores muy viejos, incluso sin contexto seguro en muchos casos).
 *  3. `Math.random()` como último recurso (no cripto, pero suficiente para un
 *     id local idempotente de una venta; jamás deja caer la venta).
 */
export function safeUUID(): string {
  const c: Crypto | undefined =
    typeof crypto !== 'undefined' ? crypto : undefined;

  // 1) API nativa moderna
  if (c && typeof c.randomUUID === 'function') {
    try {
      return c.randomUUID();
    } catch {
      /* cae al siguiente método */
    }
  }

  // 2) getRandomValues → UUID v4 manual (RFC 4122)
  if (c && typeof c.getRandomValues === 'function') {
    try {
      const bytes = new Uint8Array(16);
      c.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40; // versión 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante
      const hex: string[] = [];
      for (let i = 0; i < 256; i++) hex.push((i + 0x100).toString(16).slice(1));
      return (
        hex[bytes[0]] + hex[bytes[1]] + hex[bytes[2]] + hex[bytes[3]] + '-' +
        hex[bytes[4]] + hex[bytes[5]] + '-' +
        hex[bytes[6]] + hex[bytes[7]] + '-' +
        hex[bytes[8]] + hex[bytes[9]] + '-' +
        hex[bytes[10]] + hex[bytes[11]] + hex[bytes[12]] +
        hex[bytes[13]] + hex[bytes[14]] + hex[bytes[15]]
      );
    } catch {
      /* cae al siguiente método */
    }
  }

  // 3) Último recurso: Math.random (no cripto, pero nunca falla)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
