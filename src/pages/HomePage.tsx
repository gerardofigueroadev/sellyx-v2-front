import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { ApiProduct, ApiCategory, CartItem } from '../types';
import ProductCard from '../components/ProductCard';
import Cart, { PaymentMethod, OrderType } from '../components/Cart';
import ShiftPrintReceipt, { ShiftReportData } from '../components/ShiftPrintReceipt';
import { OrderTicketData, ClientTicket, KitchenTicket } from '../components/OrderTicket';
import { saveOrderToOutbox, markOrderSynced } from '../lib/db';
import { startSyncService, stopSyncService } from '../lib/syncService';
import { useSync } from '../hooks/useSync';

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
  id: number;
  orderNumber: string;
  ticketNumber: number;
  createdAt: string;
  items: { id: number; quantity: number; product: { name: string; emoji: string } }[];
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

function KitchenStrip({ token, refreshKey, onComplete, branchId, warningMins, dangerMins }: {
  token: string; refreshKey: number; onComplete: () => void; branchId: number | null;
  warningMins: number; dangerMins: number;
}) {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [completing, setCompleting] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallback(async () => {
    const qs = branchId ? `?branchId=${branchId}` : '';
    const res = await apiFetch(token, `/orders${qs}`);
    if (res.ok) {
      const all = await res.json();
      setOrders(all.filter((o: any) => o.status === 'pending'));
    }
  }, [token, branchId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Re-render cada minuto para actualizar los timers sin llamar a la API
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const complete = async (id: number) => {
    setCompleting(id);
    const res = await apiFetch(token, `/orders/${id}/complete`, { method: 'PATCH' });
    if (res.ok) {
      setOrders(prev => prev.filter(o => o.id !== id));
      onComplete();
    }
    setCompleting(null);
  };

  return (
    <div className="shrink-0 border-t border-slate-700/50 bg-slate-900">
      {/* Strip header */}
      <div className="flex items-center justify-between px-4 pt-1.5 pb-1">
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
        </div>
      </div>

      {/* Cards */}
      {!collapsed && <div className="flex gap-2 overflow-x-auto px-4 pb-2.5 pt-0.5">
        {orders.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-2 text-slate-600 text-xs">
            Sin pedidos pendientes
          </div>
        ) : (
          orders.map(order => {
            const style = urgencyStyle(order.createdAt, warningMins, dangerMins);
            return (
              <div key={order.id}
                className={`shrink-0 w-36 xl:w-44 rounded-lg border px-2 xl:px-2.5 py-1.5 xl:py-2 flex flex-col gap-1 xl:gap-1.5 ${style.card}`}>
                {/* Card header */}
                <div className="flex items-center justify-between gap-1">
                  <span className="text-white text-sm font-black">#{order.ticketNumber}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0 ${style.badge}`}>
                    <span className={`w-1 h-1 rounded-full inline-block ${style.dot}`} />
                    {elapsed(order.createdAt)}
                  </span>
                </div>

                {/* Items */}
                <div className="space-y-0.5">
                  {order.items.map(item => (
                    <div key={item.id} className="flex items-center gap-1">
                      <span className="text-xs">{item.product?.emoji || '🍽️'}</span>
                      <span className="text-slate-300 text-[11px] flex-1 truncate">{item.product?.name ?? '(eliminado)'}</span>
                      <span className="text-white text-[11px] font-bold shrink-0">×{item.quantity}</span>
                    </div>
                  ))}
                </div>

                {/* Complete button */}
                <button
                  onClick={() => complete(order.id)}
                  disabled={completing === order.id}
                  className="w-full bg-slate-700/80 hover:bg-green-600 text-slate-300 hover:text-white text-[11px] font-semibold py-1 rounded transition disabled:opacity-50">
                  {completing === order.id ? '...' : '✓ Listo'}
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
  const isTauri = '__TAURI__' in window;
  const { isOnline, pendingCount, syncing } = useSync();
  const [forceOffline] = useState(() => localStorage.getItem('pos_force_offline') === 'true');
  const isEffectivelyOffline = forceOffline || !isOnline;
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [checkoutMsg, setCheckoutMsg] = useState('');
  const [kitchenKey, setKitchenKey] = useState(0);

  const isAdmin = hasPermission('orders:view_all');

  // Shift state
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [showOpenModal, setShowOpenModal]   = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [shiftError, setShiftError]         = useState('');
  const [printReport,  setPrintReport]      = useState<ShiftReportData | null>(null);
  const [printTicket,  setPrintTicket]      = useState<OrderTicketData | null>(null);
  const [printPhase,   setPrintPhase]       = useState<'client' | 'kitchen' | null>(null);
  const [orgSettings,  setOrgSettings]      = useState<Record<string, any>>({});
  const [mobileCatId,  setMobileCatId]      = useState<number | null>(null);
  const [layoutMode,   setLayoutMode]       = useState<'grid' | 'columns'>(() =>
    (localStorage.getItem('pos_layout') as 'grid' | 'columns') ?? 'grid'
  );

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
      if (printPhase === 'client' && orgSettings.autoPrintTicketOnOrder) {
        // Avanzar a cocina en el siguiente ciclo de render
        setPrintPhase('kitchen');
      } else {
        setPrintTicket(null);
        setPrintPhase(null);
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
        apiFetch(token, `/products/available${qs}`),
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

  // Cargar settings una sola vez al montar
  useEffect(() => {
    if (!token) return;
    apiFetch(token, '/organizations/my/settings')
      .then(r => r.ok ? r.json() : null)
      .then(s => { if (s) setOrgSettings(s); })
      .catch(() => {});
  }, [token]);

  // Servicio de sincronización offline (solo en Tauri)
  useEffect(() => {
    if (!isTauri || !token) return;
    startSyncService(getValidToken, API);
    return () => stopSyncService();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenShift = async (amount: number, notes: string) => {
    setShiftLoading(true); setShiftError('');

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
    } else {
      setShiftError(data.message ?? 'Error al abrir caja');
    }
    setShiftLoading(false);
  };

  const handleCloseShift = async (amount: number, notes: string, cancelPending: boolean) => {
    if (!activeShift) return;
    setShiftLoading(true); setShiftError('');
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
      setShowCloseModal(false);
      setKitchenKey(k => k + 1);

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
      setShiftError(data.message ?? 'Error al cerrar caja');
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
      setCheckoutMsg('⚠️ Debes abrir la caja antes de cobrar');
      setTimeout(() => setCheckoutMsg(''), 3000);
      return;
    }

    const total = cartItems.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
    const localId = crypto.randomUUID();
    const clientCreatedAt = new Date().toISOString();

    // Intentar crear cliente solo cuando hay conexión
    let resolvedCustomerId = customerId;
    if (!resolvedCustomerId && customerPhone && !isEffectivelyOffline) {
      try {
        const customerRes = await apiFetch(token, '/customers', {
          method: 'POST',
          body: JSON.stringify({ phone: customerPhone }),
        });
        if (customerRes.ok) resolvedCustomerId = (await customerRes.json()).id;
      } catch { /* offline, skip */ }
    }

    const payload = {
      localId,
      clientCreatedAt,
      shiftId: activeShift.id,
      channel: 'pos',
      paymentMethod,
      orderType,
      items: cartItems.map(i => ({
        productId:   i.id,
        quantity:    i.quantity,
        unitPrice:   Number(i.price),
        productName: i.name,
        ...(i.note ? { notes: i.note } : {}),
      })),
      ...(resolvedCustomerId ? { customerId: resolvedCustomerId } : {}),
      ...(isAdmin && activeBranchId ? { branchId: activeBranchId } : {}),
    };

    // Guardar en outbox PRIMERO — garantía de que no se pierde aunque se corte la conexión
    if (isTauri) {
      await saveOrderToOutbox(localId, payload).catch(() => {});
    }

    let serverOrder: any = null;
    try {
      const res = await apiFetch(token, '/orders', { method: 'POST', body: JSON.stringify(payload) });
      if (res.ok) {
        serverOrder = await res.json();
        if (isTauri) await markOrderSynced(localId, serverOrder.id).catch(() => {});
      } else {
        const d = await res.json().catch(() => ({}));
        if (!isTauri) {
          setCheckoutMsg(`⚠️ ${d.message ?? 'Error al registrar venta'}`);
          setTimeout(() => setCheckoutMsg(''), 3000);
          return;
        }
      }
    } catch { /* error de red — la orden queda en outbox para sync posterior */ }

    // Construir ticket con datos del servidor o con datos locales (modo offline)
    const ticketData: OrderTicketData = serverOrder
      ? {
          ticketNumber:  serverOrder.ticketNumber,
          orderNumber:   serverOrder.orderNumber,
          paymentMethod,
          items: (serverOrder.items ?? []).map((item: any) => ({
            name:      item.product?.name ?? item.productName ?? '—',
            quantity:  item.quantity,
            unitPrice: parseFloat(item.unitPrice),
            subtotal:  parseFloat(item.subtotal),
            notes:     item.notes ?? undefined,
          })),
          total:       parseFloat(serverOrder.total),
          notes:       serverOrder.notes ?? undefined,
          branchName:  serverOrder.branch?.name ?? (user as any)?.branch?.name ?? '',
          orgName,
          cashierName: (user as any)?.name,
          createdAt:   serverOrder.createdAt ?? clientCreatedAt,
          currency,
          orderType:   serverOrder.orderType ?? orderType,
        }
      : {
          // Ticket local cuando offline
          ticketNumber:  parseInt(localStorage.getItem('last_offline_ticket') ?? '0') + 1,
          orderNumber:   `LOCAL-${localId.slice(0, 8).toUpperCase()}`,
          paymentMethod,
          items: cartItems.map(i => ({
            name:      i.name,
            quantity:  i.quantity,
            unitPrice: Number(i.price),
            subtotal:  Number(i.price) * i.quantity,
          })),
          total,
          branchName:  (user as any)?.branch?.name ?? '',
          orgName,
          cashierName: (user as any)?.name,
          createdAt:   clientCreatedAt,
          currency,
          orderType,
        };

    if (!serverOrder) {
      const nextTicket = parseInt(localStorage.getItem('last_offline_ticket') ?? '0') + 1;
      localStorage.setItem('last_offline_ticket', String(nextTicket));
    }

    setCheckoutMsg(serverOrder
      ? `✅ Venta registrada — ${currency} ${total.toFixed(2)}`
      : `📦 Sin conexión — guardada (${currency} ${total.toFixed(2)})`
    );
    setCartItems([]);
    if (serverOrder) setKitchenKey(k => k + 1);
    setPrintTicket(ticketData);
    setPrintPhase('client');
    setTimeout(() => setCheckoutMsg(''), 4000);
  };

  const shiftTime = activeShift
    ? new Date(activeShift.openedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: true })
    : null;

  const orgName = (user as any)?.organization?.name ?? 'Mi Negocio';

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
          onClose={() => { setShowOpenModal(false); setShiftError(''); }}
          onConfirm={handleOpenShift}
        />
      )}
      {showCloseModal && (
        <CloseShiftModal
          onClose={() => { setShowCloseModal(false); setShiftError(''); }}
          onConfirm={handleCloseShift}
        />
      )}

      {/* Header */}
      <header className="bg-slate-800/50 border-b border-slate-700/50 px-4 py-3 xl:px-6 xl:py-4 flex items-center justify-between shrink-0 gap-3">
        <div className="shrink-0">
          <h1 className="text-white font-bold text-base xl:text-xl">Punto de Venta</h1>
          <p className="text-slate-400 text-xs xl:text-sm">
            {loading ? 'Cargando menú...' : `${products.length} productos disponibles`}
          </p>
        </div>

        {/* Caja / Turno */}
        {canManageShift && (
          <div className="flex items-center gap-3">
            {shiftError && (
              <span className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg">
                ⚠️ {shiftError}
              </span>
            )}

            {activeShift ? (
              <>
                <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-lg">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
                  <span className="text-green-400 text-xs font-medium">Caja abierta desde {shiftTime}</span>
                </div>
                <button
                  onClick={() => setShowCloseModal(true)}
                  disabled={shiftLoading}
                  className="bg-red-600/80 hover:bg-red-600 text-white text-xs font-bold px-4 py-2 rounded-lg transition disabled:opacity-50">
                  🔴 Cerrar Caja
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowOpenModal(true)}
                disabled={shiftLoading}
                className="bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition disabled:opacity-50">
                🟢 Abrir Caja
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-4 shrink-0">
          {/* Indicador offline / sync */}
          {isEffectivelyOffline && (
            <div className="flex items-center gap-1.5 bg-amber-500/15 border border-amber-500/30 px-3 py-1.5 rounded-lg text-xs text-amber-300 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
              {forceOffline ? 'Modo sin conexión' : 'Sin conexión'}{pendingCount > 0 ? ` · ${pendingCount} pendiente${pendingCount !== 1 ? 's' : ''}` : ''}
            </div>
          )}
          {!isEffectivelyOffline && syncing && (
            <div className="flex items-center gap-1.5 bg-blue-500/15 border border-blue-500/30 px-3 py-1.5 rounded-lg text-xs text-blue-300 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
              Sincronizando...
            </div>
          )}
          {!isEffectivelyOffline && !syncing && pendingCount > 0 && (
            <div className="flex items-center gap-1.5 bg-green-500/15 border border-green-500/30 px-3 py-1.5 rounded-lg text-xs text-green-300 font-medium">
              ↑ {pendingCount} por sincronizar
            </div>
          )}
          {checkoutMsg && (
            <div className={`border px-4 py-2 rounded-xl text-sm font-medium ${checkoutMsg.startsWith('⚠️')
              ? 'bg-red-500/20 border-red-500/30 text-red-300'
              : checkoutMsg.startsWith('📦')
                ? 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                : 'bg-green-500/20 border-green-500/30 text-green-300'}`}>
              {checkoutMsg}
            </div>
          )}
          <div className="text-slate-400 text-sm">
            {new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex flex-col lg:flex-row" style={{ flex: '1 1 0%', minHeight: 0, overflow: 'hidden' }}>

        {/* ── Área de productos ── */}
        <div style={{ flex: '1 1 0%', minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Filtro de categorías + toggle de layout */}
          {!loading && categories.length > 0 && (
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

              {/* Toggle layout */}
              <div style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', background: 'rgb(15,23,42)', borderRadius: 8, padding: 3, gap: 2, border: '1px solid rgba(71,85,105,0.4)' }}>
                <button
                  onClick={() => { setLayoutMode('grid'); localStorage.setItem('pos_layout', 'grid'); }}
                  title="Vista en filas"
                  style={{
                    padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                    background: layoutMode === 'grid' ? '#3b82f6' : 'transparent',
                    color: layoutMode === 'grid' ? 'white' : '#64748b',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                  </svg>
                </button>
                <button
                  onClick={() => { setLayoutMode('columns'); localStorage.setItem('pos_layout', 'columns'); }}
                  title="Vista en columnas"
                  style={{
                    padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                    background: layoutMode === 'columns' ? '#3b82f6' : 'transparent',
                    color: layoutMode === 'columns' ? 'white' : '#64748b',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="8" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="16" y2="21"/>
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Productos */}
          <div style={{ flex: '1 1 0%', minHeight: 0, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {loading ? (
              [1, 2, 3].map(n => (
                <div key={n} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ height: 34, borderRadius: 10, background: 'rgba(51,65,85,0.4)', width: 140 }} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>
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
                }, minmax(160px, 1fr))`,
                gap: 10, alignItems: 'start',
              }}>
                {categories
                  .filter(cat => mobileCatId === null || cat.id === mobileCatId)
                  .map(cat => {
                    const catProducts = products.filter(p => p.category?.id === cat.id);
                    return (
                      <div key={cat.id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <div className={`${getGradient(cat.color)} flex items-center gap-2 px-3 py-2 rounded-xl shadow-sm`}>
                          <span style={{ fontSize: 16 }}>{cat.emoji || '🍽️'}</span>
                          <span className="text-white font-bold text-xs">{cat.name}</span>
                          <span className="text-white/60 text-xs ml-auto">{catProducts.filter(p => p.isAvailable).length}/{catProducts.length}</span>
                        </div>
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
                const catProducts = products.filter(p => p.category?.id === cat.id);
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>
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

          {/* Kitchen strip */}
          {token && !!orgSettings.showKitchenStrip && (
            <KitchenStrip
              token={token}
              refreshKey={kitchenKey}
              onComplete={() => setKitchenKey(k => k + 1)}
              branchId={activeBranchId}
              warningMins={Number(orgSettings.kitchenWarningMins ?? 5)}
              dangerMins={Number(orgSettings.kitchenDangerMins ?? 15)}
            />
          )}
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
  );
}
