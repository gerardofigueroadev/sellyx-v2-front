import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiProduct, ApiCategory, CartItem } from '../types';
import ProductCard from '../components/ProductCard';
import Cart, { PaymentMethod, OrderType } from '../components/Cart';
import ShiftPrintReceipt, { ShiftReportData } from '../components/ShiftPrintReceipt';
import { OrderTicketData, ClientTicket, KitchenTicket } from '../components/OrderTicket';
import { saveOrderToOutbox, markOrderSynced, getPendingKitchenOrders, markKitchenCompletedLocally, getNextTicketNumberForShift } from '../lib/db';
import { startSyncService, stopSyncService, requestImmediateSync, drainBeforeShiftClose } from '../lib/syncService';
import { useSync } from '../hooks/useSync';
import { isTauri } from '../lib/isTauri';

import API_URL from '../config';
import { applyPrinterAndPrint } from '../hooks/usePrinterStore';
const API = `${API_URL}/api`;
const apiFetch = (token: string, path: string, opts?: RequestInit) =>
  fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });

const GRADIENTS: Record<string, string> = {
  orange: 'bg-gradient-to-r from-orange-600 to-amber-500',
  blue:   'bg-gradient-to-r from-blue-600 to-cyan-500',
  purple: 'bg-gradient-to-r from-purple-600 to-pink-500',
  green:  'bg-gradient-to-r from-green-600 to-emerald-500',
  red:    'bg-gradient-to-r from-red-600 to-rose-500',
  yellow: 'bg-gradient-to-r from-yellow-500 to-amber-400',
  pink:   'bg-gradient-to-r from-pink-600 to-fuchsia-500',
  cyan:   'bg-gradient-to-r from-cyan-600 to-teal-500',
};
function getGradient(color: string) { return GRADIENTS[color] ?? GRADIENTS.blue; }

// ─── Kitchen types ────────────────────────────────────────────────────────────
interface KitchenOrder {
  id: number;            // server id (0 si todavía es local)
  localId?: string;      // presente si proviene del outbox offline
  isLocal?: boolean;     // badge visual
  orderNumber: string;
  ticketNumber: number | string;
  createdAt: string;
  items: { id?: number; quantity: number; product: { name: string; emoji: string }; notes?: string }[];
}

function elapsed(dateStr: string) {
  const m = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (m < 1) return '< 1 min';
  return `${m} min`;
}

function urgencyStyle(dateStr: string, warningMins = 5, dangerMins = 15) {
  const m = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (m < warningMins) return { card: 'border-green-500/30 bg-green-500/5',  badge: 'bg-green-500/20 text-green-400',  dot: 'bg-green-400' };
  if (m < dangerMins)  return { card: 'border-amber-500/40 bg-amber-500/5',  badge: 'bg-amber-500/20 text-amber-400',  dot: 'bg-amber-400 animate-pulse' };
  return                      { card: 'border-red-500/40 bg-red-500/5',      badge: 'bg-red-500/20 text-red-400',      dot: 'bg-red-400 animate-pulse' };
}

function KitchenStrip({ refreshKey, onComplete, warningMins, dangerMins, vertical = false, products = [], shiftOpenedAt }: {
  token: string; refreshKey: number; onComplete: () => void; branchId: number | null;
  warningMins: number; dangerMins: number; vertical?: boolean;
  products?: ApiProduct[];
  shiftOpenedAt?: string | null;
}) {
  const tauri = isTauri();

  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [completing, setCompleting] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  // Cola local-first: lee del SQLite outbox, que es la fuente de verdad de cocina.
  // No depende del servidor — el cajero ve la cola al instante incluso con red mala.
  // Acotada al turno actual: si no hay turno, fallback a últimas 24h (defensa contra
  // mostrar tickets viejos cuando se cierra y reabre la caja).
  const load = useCallback(async () => {
    if (!tauri) { setOrders([]); return; }
    try {
      const fallback24h = Date.now() - 24 * 60 * 60 * 1000;
      const sinceTs = shiftOpenedAt
        ? new Date(shiftOpenedAt).getTime()
        : fallback24h;
      const rows = await getPendingKitchenOrders(sinceTs);
      const mapped: KitchenOrder[] = rows.map(o => {
        let payload: any = {};
        try { payload = JSON.parse(o.payload); } catch {}
        const isUnsynced = o.synced === 0;
        return {
          id: o.server_id ?? 0,
          localId: o.local_id,
          isLocal: isUnsynced,
          orderNumber: o.local_id.slice(0, 8).toUpperCase(),
          // El ticketNumber real lo generó la PC y está en el payload. Solo si
          // faltara (órdenes viejas pre-cambio) caemos al sufijo del localId.
          ticketNumber: payload.ticketNumber ?? o.local_id.slice(0, 4).toUpperCase(),
          createdAt: payload.clientCreatedAt ?? new Date(o.created_at).toISOString(),
          items: (payload.items ?? []).map((it: any) => {
            const product = products.find(p => p.id === it.productId);
            return {
              id: it.productId,
              quantity: it.quantity,
              product: {
                name: it.productName ?? product?.name ?? '?',
                emoji: product?.emoji ?? '🍽️',
              },
              notes: it.notes,
            };
          }),
        };
      });
      setOrders(mapped);
    } catch (e) {
      console.warn('[KITCHEN] load: SQLite read failed', String(e));
    }
  }, [tauri, products, shiftOpenedAt]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Re-render cada minuto para actualizar los timers sin tocar nada más
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  // Complete local-first: actualiza SQLite (instantáneo) y dispara sync en background.
  // No espera red — la UI refleja el cambio al toque y JAMÁS reaparece la orden
  // porque la cocina se nutre del estado local, no del servidor.
  const complete = async (order: KitchenOrder) => {
    if (!order.localId) {
      console.warn('[KITCHEN] complete: orden sin localId — no se puede completar localmente', order);
      return;
    }
    const key = order.localId;
    setCompleting(key);

    try {
      // 1) Persistir en SQLite — fuente de verdad local
      await markKitchenCompletedLocally(order.localId);
      // 2) Quitar de UI optimistamente
      setOrders(prev => prev.filter(o => o.localId !== key));
      onComplete();
      // 3) Disparar sync en background — sin esperar
      requestImmediateSync();
    } catch (e) {
      console.warn('[KITCHEN] complete: SQLite write failed', String(e));
      // Si falla SQLite (raro), recargamos para no dejar la UI inconsistente
      load();
    } finally {
      setCompleting(null);
    }
  };

  const containerClass = vertical
    ? 'flex flex-col flex-1 min-h-0 bg-slate-900'
    : 'shrink-0 border-t border-slate-700/50 bg-slate-900';

  const cardsContainerClass = vertical
    ? 'flex flex-col gap-2 overflow-y-auto px-2 pb-2.5 pt-0.5 flex-1 min-h-0'
    : 'flex gap-2 overflow-x-auto px-4 pb-2.5 pt-0.5';

  const cardClass = vertical
    ? 'w-full rounded-lg border px-2.5 py-2 flex flex-col gap-1.5'
    : 'shrink-0 w-36 xl:w-44 rounded-lg border px-2 xl:px-2.5 py-1.5 xl:py-2 flex flex-col gap-1 xl:gap-1.5';

  return (
    <div className={containerClass}>
      {/* Strip header */}
      <div className="flex items-center justify-between px-3 pt-1.5 pb-1 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">🍳</span>
          <span className="text-slate-400 text-xs font-semibold">Cola de cocina</span>
          {orders.length > 0 && (
            <span className="bg-amber-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
              {orders.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="text-slate-600 hover:text-slate-400 text-xs transition">↻</button>
          {!vertical && (
            <button
              onClick={() => setCollapsed(c => !c)}
              className="flex items-center gap-1 text-slate-500 hover:text-slate-300 text-xs font-medium transition px-2 py-0.5 rounded hover:bg-slate-700/50"
            >
              {collapsed ? (
                <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3"><path strokeLinecap="round" d="M5 15l7-7 7 7"/></svg> Mostrar</>
              ) : (
                <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3"><path strokeLinecap="round" d="M19 9l-7 7-7-7"/></svg> Minimizar</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Cards */}
      {(vertical || !collapsed) && <div className={cardsContainerClass}>
        {orders.length === 0 ? (
          <div className={`${vertical ? 'flex-1' : 'flex-1'} flex items-center justify-center py-2 text-slate-600 text-xs`}>
            Sin pedidos pendientes
          </div>
        ) : (
          orders.map(order => {
            const style = urgencyStyle(order.createdAt, warningMins, dangerMins);
            const key = order.localId ?? `s${order.id}`;
            return (
              <div key={key} className={`${cardClass} ${style.card}`}>
                {/* Card header */}
                <div className="flex items-center justify-between gap-1">
                  {order.isLocal ? (
                    <span className="text-amber-300 text-[11px] font-black flex items-center gap-1" title="Pedido offline pendiente de sincronizar">
                      📦 #{order.ticketNumber}
                    </span>
                  ) : (
                    <span className="text-white text-sm font-black">#{order.ticketNumber}</span>
                  )}
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0 ${style.badge}`}>
                    <span className={`w-1 h-1 rounded-full inline-block ${style.dot}`} />
                    {elapsed(order.createdAt)}
                  </span>
                </div>

                {/* Items */}
                <div className="space-y-0.5">
                  {order.items.map((item, i) => (
                    <div key={`${item.id ?? 'x'}-${i}`} className="flex items-center gap-1">
                      <span className="text-xs">{item.product?.emoji || '🍽️'}</span>
                      <span className="text-slate-300 text-[11px] flex-1 truncate">{item.product?.name ?? '(eliminado)'}</span>
                      <span className="text-white text-[11px] font-bold shrink-0">×{item.quantity}</span>
                    </div>
                  ))}
                </div>

                {/* Complete button */}
                <button
                  onClick={() => complete(order)}
                  disabled={completing === key}
                  className="w-full bg-slate-700/80 hover:bg-green-600 text-slate-300 hover:text-white text-[11px] font-semibold py-1 rounded transition disabled:opacity-50">
                  {completing === key ? '...' : '✓ Listo'}
                </button>
              </div>
            );
          })
        )}
      </div>}
    </div>
  );
}

// ─── Shift types ──────────────────────────────────────────────────────────────
interface Shift {
  id: number;
  type: 'pos' | 'system';
  status: 'open' | 'closed';
  openingAmount: number;
  openedAt: string;
  user: { id: number; name: string } | null;
}

// ─── Modal Abrir Caja ─────────────────────────────────────────────────────────
// ─── Modal Confirmación de Impresión ──────────────────────────────────────────
// TODO (deuda técnica): hoy ignora el flag `autoPrintTicketOnOrder` por decisión
// de negocio — siempre pregunta. Reconciliar con la configuración más adelante.
function PrintConfirmModal({ onChoose, onClose }: {
  onChoose: (choice: 'client' | 'kitchen' | 'both') => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-xl">🖨️</span>
            <h2 className="text-white font-bold">Imprimir ticket</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl">✕</button>
        </div>
        <div className="px-6 py-4 text-slate-300 text-sm">
          ¿Desea imprimir el ticket en el POS?
        </div>
        <div className="grid grid-cols-1 gap-2 px-6 pb-4">
          <button
            onClick={() => onChoose('both')}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 transition"
          >
            Imprimir ambos (cliente + cocina)
          </button>
          <button
            onClick={() => onChoose('client')}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-white bg-slate-700 hover:bg-slate-600 transition"
          >
            Solo cliente
          </button>
          <button
            onClick={() => onChoose('kitchen')}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-white bg-slate-700 hover:bg-slate-600 transition"
          >
            Solo cocina
          </button>
        </div>
        <div className="px-6 pb-5">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-700/50 transition"
          >
            No imprimir
          </button>
        </div>
      </div>
    </div>
  );
}

function OpenShiftModal({ onConfirm, onClose }: {
  onConfirm: (amount: number, notes: string) => void;
  onClose: () => void;
}) {
  const { currency } = useAuth();
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-xl">🟢</span>
            <h2 className="text-white font-bold">Abrir Caja</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl">✕</button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Monto inicial en caja ({currency})</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0.00" autoFocus
              className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-lg font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Observaciones (opcional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Ej: Turno mañana"
              className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-700">
          <button onClick={onClose} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-medium transition">Cancelar</button>
          <button onClick={() => onConfirm(parseFloat(amount) || 0, notes)}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-green-600 hover:bg-green-500 transition">
            Abrir Caja
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Cerrar Caja ────────────────────────────────────────────────────────
interface PendingInfo { pendingCount: number; pendingOrders: { ticketNumber: number; total: number; itemCount: number }[] }

function CloseShiftModal({ onConfirm, onClose }: {
  onConfirm: (amount: number, notes: string, cancelPending: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const { currency } = useAuth();
  const [step, setStep]           = useState<'amount' | 'warning'>('amount');
  const [amount, setAmount]       = useState('');
  const [notes, setNotes]         = useState('');
  const [pending, setPending]     = useState<PendingInfo | null>(null);
  const [loading, setLoading]     = useState(false);

  const handleNext = async () => {
    // primer intento sin cancelPending — el backend responderá si hay pendientes
    setLoading(true);
    await onConfirm(parseFloat(amount) || 0, notes, false);
    setLoading(false);
  };

  // HomePage llama a este setter si el backend devuelve pendingCount
  (CloseShiftModal as any)._setPending = (info: PendingInfo) => {
    setPending(info);
    setStep('warning');
  };

  const handleForceClose = async () => {
    setLoading(true);
    await onConfirm(parseFloat(amount) || 0, notes, true);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {step === 'amount' && <>
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
            <div className="flex items-center gap-2"><span className="text-xl">🔴</span><h2 className="text-white font-bold">Cerrar Caja</h2></div>
            <button onClick={onClose} className="text-slate-500 hover:text-white text-xl">✕</button>
          </div>
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Monto contado en caja ({currency})</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0.00" autoFocus
                className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-lg font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Observaciones (opcional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Ej: Faltaron Bs. 30 por cambio dado"
                className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-slate-700">
            <button onClick={onClose} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-medium transition">Cancelar</button>
            <button onClick={handleNext} disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 transition flex items-center justify-center gap-2">
              {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />}
              Cerrar Caja
            </button>
          </div>
        </>}

        {step === 'warning' && pending && <>
          <div className="px-6 py-4 border-b border-slate-700 flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h2 className="text-white font-bold">Pedidos pendientes</h2>
              <p className="text-slate-400 text-xs mt-0.5">Hay {pending.pendingCount} pedido(s) sin completar</p>
            </div>
          </div>
          <div className="px-6 py-4 space-y-2 max-h-52 overflow-y-auto">
            {pending.pendingOrders.map(o => (
              <div key={o.ticketNumber} className="flex items-center justify-between bg-slate-700/40 rounded-lg px-3 py-2 text-sm">
                <span className="text-white font-bold">#{o.ticketNumber}</span>
                <span className="text-slate-400">{o.itemCount} item(s)</span>
                <span className="text-amber-400 font-medium">{currency} {Number(o.total).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="px-6 py-4 border-t border-slate-700 space-y-2">
            <p className="text-slate-400 text-xs text-center">¿Deseas cancelar estos pedidos y cerrar el turno?</p>
            <div className="flex gap-2">
              <button onClick={() => setStep('amount')} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-medium transition">
                Volver
              </button>
              <button onClick={handleForceClose} disabled={loading}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2">
                {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />}
                Cancelar y cerrar
              </button>
            </div>
          </div>
        </>}

      </div>
    </div>
  );
}

// ─── HomePage ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const { token, user, hasPermission, activeBranchId, currency, getValidToken } = useAuth();
  const toast = useToast();
  const tauri = isTauri();
  const orgName = (user as any)?.organization?.name ?? 'Mi Negocio';
  const { isOnline, pendingCount, syncing } = useSync();
  const [forceOffline] = useState(() => localStorage.getItem('pos_force_offline') === 'true');
  const isEffectivelyOffline = forceOffline || !isOnline;
  const [products, setProducts] = useState<ApiProduct[]>(() => {
    try { return JSON.parse(localStorage.getItem('products_cache') ?? '{}').data ?? []; }
    catch { return []; }
  });
  const [categories, setCategories] = useState<ApiCategory[]>(() => {
    try { return JSON.parse(localStorage.getItem('categories_cache') ?? '{}').data ?? []; }
    catch { return []; }
  });
  const [loading, setLoading] = useState(() => {
    // Si tenemos cache, no mostrar loader
    return !localStorage.getItem('products_cache');
  });
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  // Idempotency key estable mientras el carrito tenga items. Se regenera al
  // vaciarlo (tras un checkout). Si el cajero hace doble-click, ambos POST
  // llevan el mismo localId y el backend deduplica via orders.service.ts.
  const [cartLocalId, setCartLocalId] = useState(() => crypto.randomUUID());
  const [kitchenKey, setKitchenKey] = useState(0);

  const isAdmin = hasPermission('orders:view_all');

  // Shift state
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [showOpenModal, setShowOpenModal]   = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [printReport,  setPrintReport]      = useState<ShiftReportData | null>(null);
  const [printTicket,  setPrintTicket]      = useState<OrderTicketData | null>(null);
  const [printPhase,   setPrintPhase]       = useState<'client' | 'kitchen' | null>(null);
  const [pendingPrintTicket, setPendingPrintTicket] = useState<OrderTicketData | null>(null);
  const [printChoice,  setPrintChoice]      = useState<'client' | 'kitchen' | 'both' | null>(null);
  const [orgSettings,  setOrgSettings]      = useState<Record<string, any>>(() => {
    try { return JSON.parse(localStorage.getItem('pos_org_settings') ?? '{}'); }
    catch { return {}; }
  });
  const [mobileCatId,  setMobileCatId]      = useState<number | null>(null);
  const layoutMode: 'grid' | 'columns' = orgSettings.posLayout === 'columns' ? 'columns' : 'grid';
  const showCategoryFilters = orgSettings.showCategoryFilters !== false;

  // useEffect garantiza que el div ya está en el DOM antes de imprimir
  useEffect(() => {
    if (!printReport) return;
    const cleanup = () => setPrintReport(null);
    window.addEventListener('afterprint', cleanup, { once: true });
    applyPrinterAndPrint(() => window.print());
    return () => window.removeEventListener('afterprint', cleanup);
  }, [printReport]);

  // Impresión de tickets: si hay fase activa imprime y avanza a la siguiente
  useEffect(() => {
    if (!printTicket || !printPhase) return;
    const onAfterPrint = () => {
      // Solo encadena cocina cuando el usuario eligió "ambos" en el modal
      if (printPhase === 'client' && printChoice === 'both') {
        setPrintPhase('kitchen');
      } else {
        setPrintTicket(null);
        setPrintPhase(null);
        setPrintChoice(null);
      }
    };
    window.addEventListener('afterprint', onAfterPrint, { once: true });
    applyPrinterAndPrint(() => window.print());
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, [printPhase]); // eslint-disable-line react-hooks/exhaustive-deps

  const canManageShift = hasPermission('sales:create');


  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const qs = activeBranchId ? `?branchId=${activeBranchId}` : '';
      const [pRes, cRes] = await Promise.all([
        apiFetch(token, `/products${qs}`),
        apiFetch(token, `/categories${qs}`),
      ]);
      if (pRes.ok) {
        const prods: ApiProduct[] = await pRes.json();
        setProducts(prods);
        localStorage.setItem('products_cache', JSON.stringify({ data: prods, cachedAt: Date.now() }));
      }
      if (cRes.ok) {
        const cats: ApiCategory[] = await cRes.json();
        setCategories(cats);
        localStorage.setItem('categories_cache', JSON.stringify({ data: cats, cachedAt: Date.now() }));
      }
    } catch {
      // Offline: cargar desde cache
      try {
        const pc = localStorage.getItem('products_cache');
        const cc = localStorage.getItem('categories_cache');
        if (pc) setProducts(JSON.parse(pc).data ?? []);
        if (cc) setCategories(JSON.parse(cc).data ?? []);
      } catch { /* ignore */ }
    } finally {
      setLoading(false);
    }
  }, [token, activeBranchId]);

  useEffect(() => { fetchData(); }, [fetchData]);


  // Re-fetch shift and kitchen whenever the active branch changes
  useEffect(() => {
    if (!token || !canManageShift) return;

    if (!navigator.onLine || forceOffline) {
      const cached = localStorage.getItem('pos_active_shift');
      if (cached) { try { setActiveShift(JSON.parse(cached)); } catch { setActiveShift(null); } }
      setKitchenKey(k => k + 1);
      return;
    }

    let cancelled = false;
    const qs = activeBranchId ? `?branchId=${activeBranchId}` : '';
    apiFetch(token, `/shifts/active${qs}`)
      .then(async res => {
        if (cancelled) return;
        if (!res.ok) {
          const cached = localStorage.getItem('pos_active_shift');
          if (cached) { try { if (!cancelled) setActiveShift(JSON.parse(cached)); } catch { if (!cancelled) setActiveShift(null); } }
          else if (!cancelled) setActiveShift(null);
          return;
        }
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!cancelled) {
          setActiveShift(data ?? null);
          if (data) localStorage.setItem('pos_active_shift', JSON.stringify(data));
          else localStorage.removeItem('pos_active_shift');
        }
      })
      .catch(() => {
        if (!cancelled) {
          const cached = localStorage.getItem('pos_active_shift');
          if (cached) { try { setActiveShift(JSON.parse(cached)); } catch { setActiveShift(null); } }
        }
      });
    setKitchenKey(k => k + 1);
    return () => { cancelled = true; };
  }, [activeBranchId, token, canManageShift, forceOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sincronizar apertura de caja pendiente cuando vuelve la conexión
  useEffect(() => {
    if (!isOnline || forceOffline || !token || !activeShift || activeShift.id !== -1) return;
    const pending = localStorage.getItem('pos_pending_shift_open');
    if (!pending) return;
    apiFetch(token, '/shifts/open', { method: 'POST', body: pending })
      .then(async res => {
        if (!res.ok) return;
        const data = await res.json();
        setActiveShift(data);
        localStorage.setItem('pos_active_shift', JSON.stringify(data));
        localStorage.removeItem('pos_pending_shift_open');
      })
      .catch(() => {});
  }, [isOnline, forceOffline, token, activeShift?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sincronizar cierre de caja pendiente cuando vuelve la conexión
  useEffect(() => {
    if (!isOnline || forceOffline || !token) return;
    const pending = localStorage.getItem('pos_pending_shift_close');
    if (!pending) return;
    let body: any;
    try { body = JSON.parse(pending); } catch { localStorage.removeItem('pos_pending_shift_close'); return; }
    if (!body.shiftId || body.shiftId < 0) { localStorage.removeItem('pos_pending_shift_close'); return; }
    apiFetch(token, `/shifts/${body.shiftId}/close`, {
      method: 'PATCH',
      body: JSON.stringify({ closingAmount: body.closingAmount, notes: body.notes, cancelPending: body.cancelPending }),
    })
      .then(async res => {
        if (!res.ok) return;
        localStorage.removeItem('pos_pending_shift_close');
        toast.success('Cierre de caja sincronizado');
      })
      .catch(() => {});
  }, [isOnline, forceOffline, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar settings una sola vez al montar (con cache offline)
  useEffect(() => {
    if (!token) return;
    apiFetch(token, '/organizations/my/settings')
      .then(r => r.ok ? r.json() : null)
      .then(s => {
        if (s) {
          setOrgSettings(s);
          localStorage.setItem('pos_org_settings', JSON.stringify(s));
        }
      })
      .catch(() => {/* offline: mantener cache */});
  }, [token]);

  // Servicio de sincronización offline (solo en Tauri)
  useEffect(() => {
    if (!tauri || !token) return;
    startSyncService(getValidToken, API);
    return () => stopSyncService();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Limpieza de claves legacy del modelo viejo (TTL + inflight + cache servidor).
  // ANTES de borrar pos_pending_completes, intentamos drenarlo al backend:
  // si el cliente actualiza de 1.0.2 → 1.0.4 con completes pendientes de
  // sincronizar, esos PATCHes nunca llegaron. Si los borramos sin enviar,
  // esas órdenes quedan "pending" para siempre en el dashboard cloud y los
  // reportes subreportan revenue. Drenar es best-effort: si falla, igual borra
  // (estado anterior tampoco las habría enviado, así que no perdemos nada nuevo).
  useEffect(() => {
    let cancelled = false;
    const drainLegacyCompletes = async () => {
      try {
        const raw = localStorage.getItem('pos_pending_completes');
        if (raw && token && navigator.onLine) {
          const queue = JSON.parse(raw) as Array<{ serverId?: number; localId?: string }>;
          const serverIds = queue
            .map(q => q.serverId)
            .filter((id): id is number => typeof id === 'number' && id > 0);
          // PATCHes best-effort, en paralelo, con timeout corto para no bloquear el arranque.
          await Promise.all(serverIds.map(id =>
            apiFetch(token, `/orders/${id}/complete`, {
              method: 'PATCH',
              signal: AbortSignal.timeout(10_000),
            }).catch(() => {})
          ));
        }
      } catch { /* ignore */ }
      if (cancelled) return;
      try {
        localStorage.removeItem('pos_pending_completes');
        localStorage.removeItem('pos_kitchen_inflight_completes');
        Object.keys(localStorage)
          .filter(k => k.startsWith('pos_kitchen_pending'))
          .forEach(k => localStorage.removeItem(k));
      } catch { /* ignore */ }
    };
    drainLegacyCompletes();
    return () => { cancelled = true; };
  }, [token]);

  const handleOpenShift = async (amount: number, notes: string) => {
    setShiftLoading(true);

    if (!navigator.onLine || forceOffline) {
      const localShift: Shift = {
        id: -1,
        type: 'pos',
        status: 'open',
        openingAmount: amount,
        openedAt: new Date().toISOString(),
        user: user ? { id: user.id, name: user.name } : null,
      };
      localStorage.setItem('pos_active_shift', JSON.stringify(localShift));
      localStorage.setItem('pos_pending_shift_open', JSON.stringify({
        openingAmount: amount, notes,
        ...(isAdmin && activeBranchId ? { branchId: activeBranchId } : {}),
      }));
      setActiveShift(localShift);
      setShowOpenModal(false);
      setShiftLoading(false);
      toast.warning('Caja abierta sin conexión — se sincronizará cuando vuelva el internet');
      return;
    }

    const res = await apiFetch(token!, '/shifts/open', {
      method: 'POST',
      body: JSON.stringify({ openingAmount: amount, notes, ...(isAdmin && activeBranchId ? { branchId: activeBranchId } : {}) }),
    });
    const data = await res.json();
    if (res.ok) {
      setActiveShift(data);
      localStorage.setItem('pos_active_shift', JSON.stringify(data));
      setShowOpenModal(false);
      toast.success('Caja abierta');
    } else {
      toast.error(data.message ?? 'Error al abrir caja');
    }
    setShiftLoading(false);
  };

  const handleCloseShift = async (amount: number, notes: string, cancelPending: boolean) => {
    if (!activeShift) return;
    setShiftLoading(true);

    // Caja local que nunca se sincronizó: solo limpiar todo (no existe en server)
    if (activeShift.id === -1) {
      localStorage.removeItem('pos_active_shift');
      localStorage.removeItem('pos_pending_shift_open');
      setActiveShift(null);
      setShowCloseModal(false);
      setKitchenKey(k => k + 1);
      setShiftLoading(false);
      toast.success('Caja cerrada (local)');
      return;
    }

    // Caja real pero offline: encolar el cierre para sincronizar
    if (!navigator.onLine || forceOffline) {
      localStorage.setItem('pos_pending_shift_close', JSON.stringify({
        shiftId: activeShift.id, closingAmount: amount, notes, cancelPending,
      }));
      localStorage.removeItem('pos_active_shift');
      setActiveShift(null);
      setShowCloseModal(false);
      setKitchenKey(k => k + 1);
      setShiftLoading(false);
      toast.warning('Caja cerrada sin conexión — se sincronizará cuando vuelva el internet');
      return;
    }

    // CRÍTICO: antes de cerrar, subir al server las ventas creadas y TODOS los
    // "Listo" que aún estén solo en local. Si no, el backend las ve 'pending' y
    // las cancela al cerrar (bug: se perdían ventas ya cobradas). Solo en el
    // primer intento (cancelPending=false); si el cajero ya aceptó cancelar, no.
    if (!cancelPending) {
      try {
        const { remaining } = await drainBeforeShiftClose(getValidToken, API);
        if (remaining > 0) {
          // Quedaron ventas sin sincronizar (sin red o red muy lenta). No
          // cerramos a ciegas: avisamos para que reintente y no se pierdan
          // ventas cobradas. El estado local ya está a salvo en SQLite.
          const msg = navigator.onLine
            ? `Hay ${remaining} venta(s) sin sincronizar. Espera unos segundos y vuelve a cerrar la caja.`
            : `Sin conexión: hay ${remaining} venta(s) sin subir. Conéctate a internet antes de cerrar la caja.`;
          toast.error(msg);
          requestImmediateSync();
          setShiftLoading(false);
          return;
        }
      } catch {
        // Si el drenaje falla por completo, seguimos: el backend igual avisará
        // de pendientes y el cajero decide. No bloqueamos el cierre.
      }
    }

    const res = await apiFetch(token!, `/shifts/${activeShift.id}/close`, {
      method: 'PATCH',
      body: JSON.stringify({ closingAmount: amount, notes, cancelPending }),
    });
    const data = await res.json();
    if (res.ok) {
      const closedShiftId = activeShift.id;
      setActiveShift(null);
      localStorage.removeItem('pos_active_shift');
      localStorage.removeItem('pos_pending_shift_open');
      localStorage.removeItem('pos_pending_shift_close');
      setShowCloseModal(false);
      setKitchenKey(k => k + 1);
      toast.success('Caja cerrada');

      // Auto-print si el flag está activado
      const settingsRes = await apiFetch(token!, '/organizations/my/settings');
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        if (settings.autoPrintOnShiftClose) {
          const reportRes = await apiFetch(token!, `/shifts/${closedShiftId}/report`);
          if (reportRes.ok) setPrintReport(await reportRes.json());
        }
      }
    } else if (data?.pendingCount) {
      // El backend advierte sobre pendientes → pasar al paso de advertencia
      (CloseShiftModal as any)._setPending?.({ pendingCount: data.pendingCount, pendingOrders: data.pendingOrders });
    } else {
      toast.error(data.message ?? 'Error al cerrar caja');
    }
    setShiftLoading(false);
  };

  const handleAdd = (product: ApiProduct) => {
    setCartItems(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) return prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const handleRemove = (id: number) => setCartItems(prev => prev.filter(i => i.id !== id));

  const handleCheckout = async (paymentMethod: PaymentMethod, orderType: OrderType, customerId: number | null = null, customerPhone: string | null = null) => {
    if (!token || cartItems.length === 0) return;

    // POS requiere turno activo
    if (!activeShift) {
      toast.warning('Debes abrir la caja antes de cobrar');
      return;
    }

    // Idempotencia: usar el localId estable del carrito. Si el cajero hace
    // doble-click ANTES de que el botón se deshabilite, ambos POST llevan el
    // mismo localId y orders.service.ts lo deduplica.
    const localId = cartLocalId;
    const itemsSnapshot = cartItems;
    const total = itemsSnapshot.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
    const clientCreatedAt = new Date().toISOString();

    // ── ticketNumber generado AQUÍ (la PC es la fuente de la verdad) ────────
    // Correlativo por turno desde el outbox local. Este MISMO número se imprime
    // y se envía al backend, que lo respeta tal cual. Así el ticket impreso
    // coincide siempre con el de la nube, incluso offline.
    let ticketNumber: number;
    if (tauri) {
      ticketNumber = await getNextTicketNumberForShift(activeShift.id).catch(() => {
        // Fallback si SQLite falla: contador en localStorage por turno
        const k = `ticket_shift_${activeShift.id}`;
        const n = parseInt(localStorage.getItem(k) ?? '0') + 1;
        localStorage.setItem(k, String(n));
        return n;
      });
    } else {
      // Web sin Tauri (sin outbox): contador por turno en localStorage
      const k = `ticket_shift_${activeShift.id}`;
      ticketNumber = parseInt(localStorage.getItem(k) ?? '0') + 1;
      localStorage.setItem(k, String(ticketNumber));
    }

    const buildPayload = (resolvedCustomerId: number | null) => ({
      localId,
      clientCreatedAt,
      shiftId: activeShift.id,
      ticketNumber,
      channel: 'pos',
      paymentMethod,
      orderType,
      items: itemsSnapshot.map(i => ({
        productId:   i.id,
        quantity:    i.quantity,
        unitPrice:   Number(i.price),
        productName: i.name,
        ...(i.note ? { notes: i.note } : {}),
      })),
      ...(resolvedCustomerId ? { customerId: resolvedCustomerId } : {}),
      ...(isAdmin && activeBranchId ? { branchId: activeBranchId } : {}),
    });

    // ── Local-first: persistir en outbox + cerrar UI inmediatamente ─────────
    // El POST a /orders se hace en background — el cliente no espera el
    // roundtrip a Railway, que puede tomar varios segundos.
    if (tauri) {
      // Persistencia durable. Si el cajero da doble-click, INSERT OR IGNORE
      // garantiza que solo entra una vez (PK = localId).
      // Si SQLite falla (disco lleno, lock, permisos), advertimos al cajero
      // para que conserve el ticket impreso — la venta podría no estar respaldada.
      await saveOrderToOutbox(localId, buildPayload(customerId)).catch(e => {
        console.error('[CHECKOUT] saveOrderToOutbox failed', e);
        toast.warning('Aviso: venta no respaldada localmente — conserve el ticket impreso');
      });
    }

    const ticketData: OrderTicketData = {
      ticketNumber,
      orderNumber:   `LOCAL-${localId.slice(0, 8).toUpperCase()}`,
      paymentMethod,
      items: itemsSnapshot.map(i => ({
        name:      i.name,
        quantity:  i.quantity,
        unitPrice: Number(i.price),
        subtotal:  Number(i.price) * i.quantity,
        notes:     i.note,
      })),
      total,
      branchName:  (user as any)?.branch?.name ?? '',
      orgName,
      cashierName: (user as any)?.name,
      createdAt:   clientCreatedAt,
      currency,
      orderType,
    };

    // UI optimista: vaciar carrito, regenerar localId, refrescar cocina, mostrar print
    setCartItems([]);
    setCartLocalId(crypto.randomUUID());
    setKitchenKey(k => k + 1);
    setPendingPrintTicket(ticketData);
    toast.success(`Venta registrada — ${currency} ${total.toFixed(2)}`);

    // ── Sincronización en background ────────────────────────────────────────
    // Customer creation: no bloquea, se resuelve antes del POST de la orden si
    // alcanza, sino la orden se sincroniza sin customerId y el cliente se asocia
    // a futuras visitas.
    const syncInBackground = async () => {
      let resolvedCustomerId = customerId;
      if (!resolvedCustomerId && customerPhone && navigator.onLine) {
        try {
          const customerRes = await apiFetch(token, '/customers', {
            method: 'POST',
            body: JSON.stringify({ phone: customerPhone }),
          });
          if (customerRes.ok) resolvedCustomerId = (await customerRes.json()).id;
        } catch { /* offline o error, seguir sin customerId */ }
      }

      if (!navigator.onLine || isEffectivelyOffline) {
        // Offline: ya está en outbox (tauri) o se perderá el background POST
        // pero el syncService reintentará cuando vuelva la red.
        if (tauri) requestImmediateSync();
        return;
      }

      try {
        const res = await apiFetch(token, '/orders', {
          method: 'POST',
          body: JSON.stringify(buildPayload(resolvedCustomerId)),
        });
        if (res.ok) {
          const serverOrder = await res.json();
          if (tauri) {
            await markOrderSynced(localId, serverOrder.id).catch(() => {});
            // Si el cajero ya marcó "Listo" entre el saveOrderToOutbox y este
            // markOrderSynced, su complete está en SQLite con server_id=null
            // y no podía sincronizarse. Ahora con server_id seteado, forzamos
            // un ciclo de sync para que el PATCH /complete salga sin esperar 30s.
            requestImmediateSync();
          }
        } else if (tauri) {
          // El sync service reintentará en próximo ciclo (ya está en outbox).
          requestImmediateSync();
        } else {
          // Web sin outbox: avisar al usuario que la orden no llegó al server.
          const d = await res.json().catch(() => ({}));
          toast.error(d.message ?? 'Error al sincronizar venta — reintenta');
        }
      } catch {
        // Red cayó entre el click y el POST. Si tauri, syncService la levantará.
        if (tauri) requestImmediateSync();
        else toast.error('Sin conexión — venta no sincronizada');
      }
    };
    syncInBackground();
  };

  const shiftTime = activeShift
    ? new Date(activeShift.openedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: true })
    : null;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Auto-print on shift close */}
      {printReport && <ShiftPrintReceipt data={printReport} orgName={orgName} currency={currency} />}
      {/* Impresión de tickets: cliente primero, luego cocina (2 cortes separados) */}
      {printTicket && printPhase === 'client' && (
        <div id="thermal-print-area">
          <ClientTicket d={printTicket} cur={printTicket.currency ?? 'Bs.'} />
        </div>
      )}
      {printTicket && printPhase === 'kitchen' && (
        <div id="thermal-print-area">
          <KitchenTicket d={printTicket} />
        </div>
      )}

      {showOpenModal && (
        <OpenShiftModal
          onClose={() => setShowOpenModal(false)}
          onConfirm={handleOpenShift}
        />
      )}
      {showCloseModal && (
        <CloseShiftModal
          onClose={() => setShowCloseModal(false)}
          onConfirm={handleCloseShift}
        />
      )}
      {pendingPrintTicket && (
        <PrintConfirmModal
          onClose={() => setPendingPrintTicket(null)}
          onChoose={choice => {
            const data = pendingPrintTicket;
            setPendingPrintTicket(null);
            setPrintChoice(choice);
            setPrintTicket(data);
            setPrintPhase(choice === 'kitchen' ? 'kitchen' : 'client');
          }}
        />
      )}

      {/* Content */}
      <div className="flex flex-col lg:flex-row" style={{ flex: '1 1 0%', minHeight: 0, overflow: 'hidden' }}>

        {/* ── Área de productos ── */}
        <div style={{ flex: '1 1 0%', minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Filtros de categorías (configurable desde Settings) */}
          {showCategoryFilters && !loading && categories.length > 0 && (
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px 0', overflowX: 'auto', scrollbarWidth: 'none' }}>
              <button
                onClick={() => setMobileCatId(null)}
                style={{
                  flexShrink: 0, padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  border: `1.5px solid ${mobileCatId === null ? 'transparent' : 'rgba(71,85,105,0.5)'}`,
                  background: mobileCatId === null ? '#3b82f6' : 'rgb(30,41,59)',
                  color: mobileCatId === null ? 'white' : '#94a3b8',
                  cursor: 'pointer', transition: 'all 0.1s',
                }}
              >
                Todos
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setMobileCatId(mobileCatId === cat.id ? null : cat.id)}
                  className={mobileCatId === cat.id ? getGradient(cat.color) : ''}
                  style={{
                    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    border: `1.5px solid ${mobileCatId === cat.id ? 'transparent' : 'rgba(71,85,105,0.5)'}`,
                    background: mobileCatId === cat.id ? undefined : 'rgb(30,41,59)',
                    color: mobileCatId === cat.id ? 'white' : '#94a3b8',
                    cursor: 'pointer', transition: 'all 0.1s', whiteSpace: 'nowrap',
                  }}
                >
                  <span>{cat.emoji || '🍽️'}</span>
                  {cat.name}
                </button>
              ))}
            </div>
          )}

          {/* Productos */}
          <div style={{ flex: '1 1 0%', minHeight: 0, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {loading ? (
              [1, 2, 3].map(n => (
                <div key={n} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ height: 34, borderRadius: 10, background: 'rgba(51,65,85,0.4)', width: 140 }} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
                    {[...Array(n === 1 ? 5 : 2)].map((_, i) => (
                      <div key={i} style={{ height: 72, borderRadius: 10, background: 'rgba(51,65,85,0.25)' }} />
                    ))}
                  </div>
                </div>
              ))
            ) : categories.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, color: '#64748b' }}>
                <span style={{ fontSize: 48 }}>🗂️</span>
                <p style={{ fontWeight: 600, color: '#94a3b8' }}>No hay categorías configuradas</p>
              </div>
            ) : layoutMode === 'columns' ? (
              /* ── Vista columnas: una columna por categoría en grid horizontal ── */
              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${
                  (mobileCatId === null ? categories : categories.filter(c => c.id === mobileCatId)).length
                }, minmax(140px, 1fr))`,
                gap: 8, alignItems: 'start',
              }}>
                {categories
                  .filter(cat => mobileCatId === null || cat.id === mobileCatId)
                  .map(cat => {
                    const catProducts = products
                      .filter(p => p.category?.id === cat.id)
                      .sort((a, b) => ((a as any).sortOrder ?? 0) - ((b as any).sortOrder ?? 0) || a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
                    return (
                      <div key={cat.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {catProducts.map(p => (
                          <ProductCard
                            key={p.id} product={p} onAdd={handleAdd}
                            quantity={cartItems.find(i => i.id === p.id)?.quantity ?? 0}
                            categoryColor={cat.color}
                            showEmoji={orgSettings.showProductEmoji !== false}
                            compact
                          />
                        ))}
                      </div>
                    );
                  })}
              </div>
            ) : (
              /* ── Vista grid: secciones por categoría en filas ── */
              categories
                .filter(cat => mobileCatId === null || cat.id === mobileCatId)
                .map(cat => {
                const catProducts = products
                  .filter(p => p.category?.id === cat.id)
                  .sort((a, b) => ((a as any).sortOrder ?? 0) - ((b as any).sortOrder ?? 0) || a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
                return (
                  <div key={cat.id}>
                    <div className={`${getGradient(cat.color)} flex items-center gap-2 px-4 py-2 rounded-xl mb-2.5 shadow-sm`}
                      style={{ display: 'inline-flex' }}>
                      <span style={{ fontSize: 18 }}>{cat.emoji || '🍽️'}</span>
                      <span className="text-white font-bold text-sm">{cat.name}</span>
                      <span className="text-white/60 text-xs font-medium">
                        {catProducts.filter(p => p.isAvailable).length}/{catProducts.length}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
                      {catProducts.map(p => (
                        <ProductCard
                          key={p.id} product={p} onAdd={handleAdd}
                          quantity={cartItems.find(i => i.id === p.id)?.quantity ?? 0}
                          categoryColor={cat.color}
                          showEmoji={orgSettings.showProductEmoji !== false}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Kitchen strip — abajo (default) */}
          {token && !!orgSettings.showKitchenStrip && orgSettings.kitchenStripPosition !== 'right' && (
            <KitchenStrip
              token={token}
              refreshKey={kitchenKey}
              onComplete={() => setKitchenKey(k => k + 1)}
              branchId={activeBranchId}
              warningMins={Number(orgSettings.kitchenWarningMins ?? 5)}
              dangerMins={Number(orgSettings.kitchenDangerMins ?? 15)}
              products={products}
              shiftOpenedAt={activeShift?.openedAt ?? null}
            />
          )}
        </div>

        {/* ── Cola de cocina vertical (columna entre productos y cart) ── */}
        {token && !!orgSettings.showKitchenStrip && orgSettings.kitchenStripPosition === 'right' && (
          <div className="hidden lg:flex w-48 xl:w-56 shrink-0 flex-col border-l border-slate-700/50 overflow-hidden">
            <KitchenStrip
              token={token}
              refreshKey={kitchenKey}
              onComplete={() => setKitchenKey(k => k + 1)}
              branchId={activeBranchId}
              warningMins={Number(orgSettings.kitchenWarningMins ?? 5)}
              dangerMins={Number(orgSettings.kitchenDangerMins ?? 15)}
              vertical
              products={products}
              shiftOpenedAt={activeShift?.openedAt ?? null}
            />
          </div>
        )}

        {/* ── Columna derecha: topbar + Cart ── */}
        <div className="w-full lg:w-64 xl:w-80 2xl:w-96 shrink-0 flex flex-col max-h-[40vh] lg:max-h-none border-t lg:border-t-0 lg:border-l border-slate-700/50 overflow-hidden">

          {/* Topbar compacta */}
          <div className="px-3 py-2 border-b border-slate-700/50 bg-slate-800/60 shrink-0 space-y-1.5">
            {/* Caja / turno */}
            {canManageShift && (
              activeShift ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 px-2 py-1 rounded-md min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block shrink-0" />
                    <span className="text-green-400 text-[11px] font-medium truncate">Caja {shiftTime}</span>
                  </div>
                  <button
                    onClick={() => setShowCloseModal(true)}
                    disabled={shiftLoading}
                    className="bg-red-600/80 hover:bg-red-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-md transition disabled:opacity-50 shrink-0">
                    🔴 Cerrar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowOpenModal(true)}
                  disabled={shiftLoading}
                  className="w-full bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-md transition disabled:opacity-50">
                  🟢 Abrir Caja
                </button>
              )
            )}

            {/* Estado y fecha */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-slate-500 text-[11px] capitalize">
                {new Date().toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
              {isEffectivelyOffline && (
                <div className="flex items-center gap-1 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded text-[10px] text-amber-300 font-medium">
                  <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse inline-block" />
                  {forceOffline ? 'Offline' : 'Sin red'}{pendingCount > 0 ? `·${pendingCount}` : ''}
                </div>
              )}
              {!isEffectivelyOffline && syncing && (
                <div className="flex items-center gap-1 bg-blue-500/15 border border-blue-500/30 px-1.5 py-0.5 rounded text-[10px] text-blue-300 font-medium">
                  <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse inline-block" />
                  Sync...
                </div>
              )}
              {!isEffectivelyOffline && !syncing && pendingCount > 0 && (
                <div className="bg-green-500/15 border border-green-500/30 px-1.5 py-0.5 rounded text-[10px] text-green-300 font-medium">
                  ↑{pendingCount}
                </div>
              )}
            </div>
          </div>

          <Cart
            items={cartItems}
            onRemove={handleRemove}
            onClear={() => setCartItems([])}
            onCheckout={(pm, ot, cid, cphone) => handleCheckout(pm, ot, cid, cphone)}
            allowItemNotes={!!orgSettings.allowItemNotes}
            showCustomerLookup={!!orgSettings.showCustomerLookup}
            onNoteChange={(id, note) => setCartItems(prev => prev.map(i => i.id === id ? { ...i, note } : i))}
          />
        </div>
      </div>

    </div>
  );
}
