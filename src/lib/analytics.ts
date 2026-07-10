import posthog from 'posthog-js';
import { isTauri } from './isTauri';

/**
 * Integración de PostHog (métricas y logs de producto) para Sellyx front.
 *
 * Consideraciones del repo:
 * - Dual Tauri/web: marcamos cada evento con `platform` (desktop|web) y la
 *   versión de la app para poder segmentar en PostHog.
 * - Offline-first (el POS de escritorio opera sin red): posthog-js ya bufferea
 *   y reintenta el envío; no bloquea la UI. No lo desactivamos offline para no
 *   perder eventos — se envían cuando vuelve la conexión.
 * - Seguro por defecto: si no hay VITE_POSTHOG_KEY (p. ej. en desarrollo),
 *   `initAnalytics` simplemente no hace nada y los helpers son no-ops.
 */

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com';

let enabled = false;

/** Inicializa PostHog una sola vez. No-op si no hay key configurada. */
export function initAnalytics(): void {
  if (enabled || !KEY) return;

  posthog.init(KEY, {
    api_host: HOST,
    // Captura automática de clicks/pageviews. person_profiles 'identified_only'
    // evita crear perfiles anónimos por cada visita (menos ruido y costo).
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    // No se pierden eventos si la app está offline: se reintentan al reconectar.
    autocapture: true,
    // Metadatos comunes a TODOS los eventos → segmentar desktop vs web y versión.
    loaded: (ph) => {
      ph.register({
        platform: isTauri() ? 'desktop' : 'web',
        app_version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown',
      });
    },
  });

  enabled = true;
}

/** Registra un evento personalizado (no-op si PostHog no está activo). */
export function captureEvent(event: string, props?: Record<string, unknown>): void {
  if (!enabled) return;
  posthog.capture(event, props);
}

/**
 * Asocia los eventos a un usuario concreto tras el login. Usamos el id del
 * usuario y adjuntamos rol/org para poder segmentar (sin datos sensibles).
 */
export function identifyUser(
  userId: string | number,
  props?: { role?: string; orgId?: number; orgName?: string },
): void {
  if (!enabled) return;
  posthog.identify(String(userId), props);
}

/** Limpia la identidad al cerrar sesión (evita mezclar usuarios en un dispositivo). */
export function resetAnalytics(): void {
  if (!enabled) return;
  posthog.reset();
}
