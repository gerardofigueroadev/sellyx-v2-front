import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const API = 'http://localhost:3000/api';
const apiFetch = (token: string, path: string, opts?: RequestInit) =>
  fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });

// ─── Types ────────────────────────────────────────────────────────────────────
type OrderStatus = 'pending' | 'completed' | 'cancelled';
type OrderChannel = 'pos' | 'chatbot' | 'web';

interface OrderItem {
  id: number;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  product: { id: number; name: string; emoji: string };
}

interface Order {
  id: number;
  orderNumber: string;
  ticketNumber: number;
  status: OrderStatus;
  paymentMethod: 'cash' | 'card' | 'transfer';
  channel: OrderChannel;
  total: number;
  notes: string | null;
  createdAt: string;
  branch: { id: number; name: string } | null;
  user: { id: number; name: string } | null;
  shift: { id: number; type: 'pos' | 'system' } | null;
  items: OrderItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<OrderStatus, string> = {
  pending:   'Pendiente',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

const STATUS_STYLE: Record<OrderStatus, string> = {
  pending:   'bg-amber-500/15 text-amber-400 border-amber-500/20',
  completed: 'bg-green-500/15 text-green-400 border-green-500/20',
  cancelled: 'bg-red-500/15 text-red-400 border-red-500/20',
};

const CHANNEL_LABEL: Record<OrderChannel, string> = {
  pos:     '🖥️ POS',
  chatbot: '🤖 Chatbot',
  web:     '🌐 Web',
};

const PAYMENT_LABEL: Record<string, string> = {
  cash:     '💵 Efectivo',
  card:     '💳 Tarjeta',
  transfer: '📱 QR / Tigo',
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Ahora';
  if (m < 60) return `Hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h}h`;
  return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function OrderDetailModal({
  order, token, onClose, onUpdated, isAdmin,
}: {
  order: Order; token: string; onClose: () => void; onUpdated: (o: Order) => void; isAdmin: boolean;
}) {
  const [loading, setLoading] = useState(false);

  const action = async (act: 'complete' | 'cancel') => {
    setLoading(true);
    const res = await apiFetch(token, `/orders/${order.id}/${act}`, { method: 'PATCH' });
    if (res.ok) onUpdated(await res.json());
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-700 shrink-0">
          <div>
            <p className="text-slate-400 text-xs mb-0.5">{CHANNEL_LABEL[order.channel]}</p>
            <div className="flex items-baseline gap-2">
              <h2 className="text-white font-black text-2xl">#{order.ticketNumber}</h2>
              <span className="text-slate-500 text-xs">{order.orderNumber}</span>
            </div>
            <p className="text-slate-500 text-xs mt-0.5">
              {new Date(order.createdAt).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} · {formatTime(order.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_STYLE[order.status]}`}>
              {STATUS_LABEL[order.status]}
            </span>
            <button onClick={onClose} className="text-slate-500 hover:text-white text-xl ml-1">✕</button>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {order.items.map(item => (
            <div key={item.id} className="flex items-center gap-3 bg-slate-700/40 rounded-xl px-4 py-3">
              <span className="text-2xl shrink-0">{item.product.emoji || '🍽️'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{item.product.name}</p>
                <p className="text-slate-400 text-xs">Bs. {Number(item.unitPrice).toFixed(2)} × {item.quantity}</p>
              </div>
              <p className="text-white text-sm font-semibold shrink-0">Bs. {Number(item.subtotal).toFixed(2)}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 space-y-3 shrink-0">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Pago</span>
            <span className="text-slate-300">{PAYMENT_LABEL[order.paymentMethod]}</span>
          </div>
          {order.user && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Cajero</span>
              <span className="text-slate-300">{order.user.name}</span>
            </div>
          )}
          {isAdmin && order.branch && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Sucursal</span>
              <span className="text-slate-300">{order.branch.name}</span>
            </div>
          )}
          {order.notes && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Nota</span>
              <span className="text-slate-300 text-right max-w-[60%]">{order.notes}</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-1 border-t border-slate-700/50">
            <span className="text-slate-300 font-medium">Total</span>
            <span className="text-white font-bold text-xl">Bs. {Number(order.total).toFixed(2)}</span>
          </div>

          {order.status === 'pending' && (
            <div className="flex gap-2 pt-1">
              <button onClick={() => action('cancel')} disabled={loading}
                className="flex-1 bg-slate-700 hover:bg-red-600/30 border border-slate-600 hover:border-red-500/40 text-slate-300 hover:text-red-400 py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={() => action('complete')} disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-50 flex items-center justify-center gap-2">
                {loading && <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full inline-block" />}
                Completar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-700/40">
      <div className="h-4 w-32 bg-slate-700 rounded animate-pulse" />
      <div className="h-4 w-16 bg-slate-700 rounded animate-pulse" />
      <div className="flex-1 h-4 bg-slate-700/50 rounded animate-pulse" />
      <div className="h-4 w-20 bg-slate-700 rounded animate-pulse" />
      <div className="h-6 w-24 bg-slate-700 rounded-full animate-pulse" />
    </div>
  );
}

// ─── Date period filter ───────────────────────────────────────────────────────
type Period = 'day' | 'week' | 'month' | 'year';

const PERIOD_LABELS: { key: Period; label: string }[] = [
  { key: 'day',   label: 'Hoy' },
  { key: 'week',  label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'year',  label: 'Año' },
];

function inPeriod(dateStr: string, period: Period): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  if (period === 'day')   return d.toDateString() === now.toDateString();
  if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (period === 'year')  return d.getFullYear() === now.getFullYear();
  // week: lunes a domingo de la semana actual
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  return d >= startOfWeek && d < endOfWeek;
}

function PeriodFilter({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex gap-1 bg-slate-800 border border-slate-700/50 rounded-xl p-1">
      {PERIOD_LABELS.map(({ key, label }) => (
        <button key={key} onClick={() => onChange(key)}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
            value === key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
          }`}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const STATUS_FILTERS: { key: 'all' | OrderStatus; label: string }[] = [
  { key: 'all',       label: 'Todos' },
  { key: 'pending',   label: 'Pendientes' },
  { key: 'completed', label: 'Completados' },
  { key: 'cancelled', label: 'Cancelados' },
];

export default function OrdersPage() {
  const { token, hasPermission } = useAuth();
  const isAdmin = hasPermission('orders:view_all');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | OrderStatus>('all');
  const [period, setPeriod] = useState<Period>('day');
  const [selected, setSelected] = useState<Order | null>(null);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState<number | 'all'>('all');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await apiFetch(token, '/orders');
    if (res.ok) setOrders(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleUpdated = (updated: Order) => {
    setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
    setSelected(updated);
  };

  // Aplicar filtro de periodo primero, luego estado y búsqueda, ordenar por ticketNumber desc
  const periodOrders = orders.filter(o => inPeriod(o.createdAt, period));

  // Branches únicas para el filtro de admin
  const branches = isAdmin
    ? Array.from(new Map(orders.filter(o => o.branch).map(o => [o.branch!.id, o.branch!])).values())
    : [];

  const filtered = periodOrders
    .filter(o => {
      const matchesFilter = filter === 'all' || o.status === filter;
      const matchesSearch = !search || o.orderNumber.toLowerCase().includes(search.toLowerCase());
      const matchesBranch = !isAdmin || branchFilter === 'all' || o.branch?.id === branchFilter;
      return matchesFilter && matchesSearch && matchesBranch;
    })
    .sort((a, b) => b.ticketNumber - a.ticketNumber);

  const counts = {
    all:       periodOrders.length,
    pending:   periodOrders.filter(o => o.status === 'pending').length,
    completed: periodOrders.filter(o => o.status === 'completed').length,
    cancelled: periodOrders.filter(o => o.status === 'cancelled').length,
  };

  const completedTotal = periodOrders
    .filter(o => o.status === 'completed')
    .reduce((s, o) => s + Number(o.total), 0);

  if (!hasPermission('sales:view')) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-slate-500">Sin acceso a pedidos</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-slate-900">
      {selected && token && (
        <OrderDetailModal
          order={selected} token={token}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
          isAdmin={isAdmin}
        />
      )}

      {/* Header */}
      <div className="shrink-0 border-b border-slate-700/50 px-6 py-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Pedidos</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {loading ? 'Cargando...' : `${periodOrders.length} pedido(s) · Bs. ${completedTotal.toFixed(2)} completados`}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <PeriodFilter value={period} onChange={setPeriod} />
          {isAdmin && branches.length > 1 && (
            <select
              value={branchFilter}
              onChange={e => setBranchFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todas las sucursales</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por número..."
            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
          />
          <button onClick={load}
            className="text-sm text-slate-400 hover:text-white hover:bg-slate-700 px-3 py-2 rounded-xl transition">
            ↻
          </button>
        </div>
      </div>

      {/* Filtros estado */}
      <div className="shrink-0 border-b border-slate-700/50 px-6 py-3 flex gap-2">
        {STATUS_FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition ${
              filter === f.key
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}>
            {f.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
              filter === f.key ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'
            }`}>
              {counts[f.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {/* Table header */}
        <div className={`sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700/50 px-5 py-3 grid gap-4 text-xs font-semibold uppercase tracking-wider text-slate-500 ${
          isAdmin ? 'grid-cols-[1fr_auto_auto_auto_auto_auto_auto_auto]' : 'grid-cols-[1fr_auto_auto_auto_auto_auto_auto]'
        }`}>
          <span>Orden</span>
          <span className="w-28">Turno</span>
          {isAdmin && <span className="w-28">Sucursal</span>}
          <span className="w-24 text-center">Canal</span>
          <span className="w-24 text-center">Hora</span>
          <span className="w-20 text-center">Items</span>
          <span className="w-28 text-right">Total</span>
          <span className="w-28 text-center">Estado</span>
        </div>

        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-5xl mb-3">📋</p>
            <p className="text-slate-400 font-medium">No hay pedidos</p>
            <p className="text-slate-600 text-sm mt-1">
              {filter !== 'all' ? 'Prueba con otro filtro' : 'Los pedidos aparecerán aquí al cobrar'}
            </p>
          </div>
        ) : (
          filtered.map(order => (
            <div
              key={order.id}
              onClick={() => setSelected(order)}
              className={`px-5 py-4 border-b border-slate-700/30 grid gap-4 items-center hover:bg-slate-800/60 cursor-pointer transition-colors group ${
                isAdmin ? 'grid-cols-[1fr_auto_auto_auto_auto_auto_auto_auto]' : 'grid-cols-[1fr_auto_auto_auto_auto_auto_auto]'
              }`}
            >
              {/* Número */}
              <div className="flex items-center gap-2.5">
                <span className="text-white font-black text-base shrink-0">#{order.ticketNumber}</span>
                <div>
                  <p className="text-slate-400 text-xs group-hover:text-blue-400 transition-colors">
                    {order.orderNumber}
                  </p>
                  {order.user && (
                    <p className="text-slate-500 text-xs">{order.user.name}</p>
                  )}
                </div>
              </div>

              {/* Turno */}
              <div className="w-28">
                {order.shift ? (
                  <div>
                    <p className="text-slate-300 text-xs font-medium">
                      {order.shift.type === 'system' ? '🤖 Sistema' : `🖥️ #${order.shift.id}`}
                    </p>
                    <p className="text-slate-600 text-xs capitalize">{order.shift.type === 'system' ? 'Digital' : 'POS'}</p>
                  </div>
                ) : (
                  <span className="text-slate-600 text-xs">—</span>
                )}
              </div>

              {/* Sucursal (solo admin) */}
              {isAdmin && (
                <div className="w-28">
                  <p className="text-slate-300 text-xs font-medium truncate">{order.branch?.name ?? '—'}</p>
                </div>
              )}

              {/* Canal */}
              <div className="w-24 text-center">
                <span className="text-xs text-slate-400">{CHANNEL_LABEL[order.channel]}</span>
              </div>

              {/* Hora */}
              <div className="w-24 text-center">
                <p className="text-slate-300 text-sm">{formatTime(order.createdAt)}</p>
                <p className="text-slate-600 text-xs">{timeAgo(order.createdAt)}</p>
              </div>

              {/* Items */}
              <div className="w-20 text-center">
                <span className="text-slate-400 text-sm">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Total */}
              <div className="w-28 text-right">
                <p className="text-white font-bold text-sm">Bs. {Number(order.total).toFixed(2)}</p>
                <p className="text-slate-500 text-xs">{PAYMENT_LABEL[order.paymentMethod]}</p>
              </div>

              {/* Estado */}
              <div className="w-28 flex justify-center">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_STYLE[order.status]}`}>
                  {STATUS_LABEL[order.status]}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
