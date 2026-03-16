import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';

import API_URL from '../config';
const API = `${API_URL}/api`;
const apiFetch = (token: string, path: string) =>
  fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });

// ─── Types ────────────────────────────────────────────────────────────────────
interface Branch { id: number; name: string; }

interface Summary {
  totalSales: number; totalOrders: number; avgTicket: number;
  cashSales: number; cardSales: number; transferSales: number;
}
interface HourRow  { hour: string; total: number; orders: number; }
interface DayRow   { day: string;  total: number; orders: number; }
interface Product  { name: string; qty: number; total: number; }
interface ShiftRow {
  id: number; openedAt: string; closedAt: string | null;
  branch: string; cashier: string; openingAmount: number;
  closingAmount: number | null; sales: number; orders: number;
  difference: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const bs = (n: number) => `Bs. ${n.toFixed(2)}`;
const fmtDay = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
const fmtDt  = (d: string) => new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function today() { return new Date().toISOString().split('T')[0]; }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

const PRESETS = [
  { label: 'Hoy',         from: () => today(),      to: () => today() },
  { label: 'Ayer',        from: () => daysAgo(1),   to: () => daysAgo(1) },
  { label: 'Últimos 7d',  from: () => daysAgo(6),   to: () => today() },
  { label: 'Últimos 30d', from: () => daysAgo(29),  to: () => today() },
];

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];

// ─── UI helpers ───────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'blue' }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  const colors: Record<string, string> = {
    blue:   'bg-blue-500/10 border-blue-500/20 text-blue-400',
    green:  'bg-green-500/10 border-green-500/20 text-green-400',
    amber:  'bg-amber-500/10 border-amber-500/20 text-amber-400',
    purple: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
  };
  return (
    <div className={`rounded-2xl border p-4 ${colors[color]}`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-black text-white">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children, loading }: { title: string; children: React.ReactNode; loading: boolean }) {
  return (
    <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-5">
      <h3 className="text-white font-semibold text-sm mb-4">{title}</h3>
      {loading
        ? <div className="h-52 rounded-xl bg-slate-700/40 animate-pulse" />
        : children}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-semibold">
          {p.name}: {p.dataKey === 'total' ? bs(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

// ─── Tab: Ventas por hora ──────────────────────────────────────────────────────
function TabVentas({ token, params, loading }: {
  token: string; params: string; loading: boolean;
}) {
  const [hourData, setHourData] = useState<HourRow[]>([]);
  const [dayData,  setDayData]  = useState<DayRow[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoadingLocal(true);
    Promise.all([
      apiFetch(token, `/reports/by-hour?${params}`).then(r => r.json()),
      apiFetch(token, `/reports/by-day?${params}`).then(r => r.json()),
    ]).then(([h, d]) => { setHourData(h); setDayData(d); })
      .finally(() => setLoadingLocal(false));
  }, [token, params]);

  const isLoading = loading || loadingLocal;

  return (
    <div className="space-y-5">
      <ChartCard title="Ventas por hora del día" loading={isLoading}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={hourData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="hour" tick={{ fill: '#94a3b8', fontSize: 10 }} interval={2} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="total" name="Ventas" stroke="#3b82f6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Ventas por día" loading={isLoading}>
        {dayData.length === 0
          ? <p className="text-slate-500 text-sm text-center py-12">Sin datos para el período seleccionado</p>
          : <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dayData.map(d => ({ ...d, day: fmtDay(d.day) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" name="Ventas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
        }
      </ChartCard>
    </div>
  );
}

// ─── Tab: Productos ────────────────────────────────────────────────────────────
function TabProductos({ token, params, loading }: {
  token: string; params: string; loading: boolean;
}) {
  const [data, setData] = useState<Product[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoadingLocal(true);
    apiFetch(token, `/reports/products?${params}`)
      .then(r => r.json()).then(setData)
      .finally(() => setLoadingLocal(false));
  }, [token, params]);

  const isLoading = loading || loadingLocal;
  const top10 = data.slice(0, 10);

  return (
    <div className="space-y-5">
      <ChartCard title="Top productos por cantidad vendida" loading={isLoading}>
        {data.length === 0
          ? <p className="text-slate-500 text-sm text-center py-12">Sin datos para el período</p>
          : <ResponsiveContainer width="100%" height={Math.max(200, top10.length * 36)}>
              <BarChart data={top10} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={120} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="qty" name="Cantidad" radius={[0, 4, 4, 0]}>
                  {top10.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
        }
      </ChartCard>

      {/* Tabla detalle */}
      {!isLoading && data.length > 0 && (
        <div className="bg-slate-800 border border-slate-700/50 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-900/50">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">#</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Producto</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 text-right">Cant.</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {data.map((p, i) => (
                <tr key={i} className="bg-slate-800 hover:bg-slate-700/40 transition-colors">
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{i + 1}</td>
                  <td className="px-4 py-2.5 text-white font-medium">{p.name}</td>
                  <td className="px-4 py-2.5 text-slate-300 text-right">{p.qty}</td>
                  <td className="px-4 py-2.5 text-white font-semibold text-right">{bs(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Turnos ───────────────────────────────────────────────────────────────
function TabTurnos({ token, params, loading }: {
  token: string; params: string; loading: boolean;
}) {
  const [data, setData] = useState<ShiftRow[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoadingLocal(true);
    apiFetch(token, `/reports/shifts?${params}`)
      .then(r => r.json()).then(setData)
      .finally(() => setLoadingLocal(false));
  }, [token, params]);

  const isLoading = loading || loadingLocal;

  if (isLoading) return (
    <div className="space-y-3">
      {[1,2,3].map(i => <div key={i} className="h-14 rounded-xl bg-slate-800 border border-slate-700/50 animate-pulse" />)}
    </div>
  );

  if (data.length === 0) return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-4xl mb-3">🕐</p>
      <p className="text-slate-400 font-medium">Sin turnos en este período</p>
    </div>
  );

  return (
    <div className="bg-slate-800 border border-slate-700/50 rounded-2xl overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-700 bg-slate-900/50">
            {['Cajero','Sucursal','Apertura','Cierre','Órdenes','Ventas','Dif. caja'].map(h => (
              <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/50">
          {data.map(s => (
            <tr key={s.id} className="bg-slate-800 hover:bg-slate-700/40 transition-colors">
              <td className="px-4 py-3 text-white font-medium">{s.cashier}</td>
              <td className="px-4 py-3 text-slate-300">{s.branch}</td>
              <td className="px-4 py-3 text-slate-300 text-xs">{fmtDt(s.openedAt)}</td>
              <td className="px-4 py-3 text-slate-300 text-xs">{s.closedAt ? fmtDt(s.closedAt) : <span className="text-green-400">Abierto</span>}</td>
              <td className="px-4 py-3 text-slate-300">{s.orders}</td>
              <td className="px-4 py-3 text-white font-semibold">{bs(s.sales)}</td>
              <td className="px-4 py-3">
                {s.difference === null ? <span className="text-slate-500">—</span> : (
                  <span className={`font-semibold text-xs ${s.difference === 0 ? 'text-green-400' : s.difference > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                    {s.difference >= 0 ? '+' : ''}{bs(s.difference)}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Tab: Pagos ────────────────────────────────────────────────────────────────
function TabPagos({ summary, loading }: { summary: Summary | null; loading: boolean }) {
  if (loading || !summary) return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {[1,2].map(i => <div key={i} className="h-64 rounded-2xl bg-slate-800 border border-slate-700/50 animate-pulse" />)}
    </div>
  );

  const pieData = [
    { name: 'Efectivo',       value: summary.cashSales,     color: '#10b981' },
    { name: 'Tarjeta',        value: summary.cardSales,     color: '#3b82f6' },
    { name: 'Transferencia',  value: summary.transferSales, color: '#f59e0b' },
  ].filter(d => d.value > 0);

  if (pieData.length === 0) return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-4xl mb-3">💳</p>
      <p className="text-slate-400 font-medium">Sin ventas en este período</p>
    </div>
  );

  const total = pieData.reduce((a, d) => a + d.value, 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <ChartCard title="Distribución por método de pago" loading={false}>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
              {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Legend formatter={(v) => <span className="text-slate-300 text-xs">{v}</span>} />
            <Tooltip formatter={(v: number) => bs(v)} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-5 space-y-4">
        <h3 className="text-white font-semibold text-sm">Detalle</h3>
        {pieData.map(d => (
          <div key={d.name} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="text-slate-300 text-sm">{d.name}</span>
            </div>
            <div className="text-right">
              <p className="text-white font-semibold text-sm">{bs(d.value)}</p>
              <p className="text-slate-500 text-xs">{((d.value / total) * 100).toFixed(1)}%</p>
            </div>
          </div>
        ))}
        <div className="border-t border-slate-700/50 pt-3 flex justify-between">
          <span className="text-slate-400 text-sm font-medium">Total</span>
          <span className="text-white font-bold">{bs(total)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
type TabId = 'ventas' | 'productos' | 'turnos' | 'pagos';
const TABS: { id: TabId; label: string }[] = [
  { id: 'ventas',    label: 'Ventas' },
  { id: 'productos', label: 'Productos' },
  { id: 'turnos',    label: 'Turnos' },
  { id: 'pagos',     label: 'Métodos de pago' },
];

export default function ReportsPage() {
  const { token, hasPermission } = useAuth();
  const isAdmin = hasPermission('orders:view_all');

  const [from,      setFrom]      = useState(today());
  const [to,        setTo]        = useState(today());
  const [branchId,  setBranchId]  = useState<string>('all');
  const [branches,  setBranches]  = useState<Branch[]>([]);
  const [summary,   setSummary]   = useState<Summary | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('ventas');

  // Construye query string para los sub-tabs
  const params = new URLSearchParams({ from, to });
  if (branchId !== 'all') params.set('branchId', branchId);
  const paramsStr = params.toString();

  // Carga sucursales para el filtro admin
  useEffect(() => {
    if (!token || !isAdmin) return;
    apiFetch(token, '/branches').then(r => r.json()).then(setBranches);
  }, [token, isAdmin]);

  const loadSummary = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await apiFetch(token, `/reports/summary?${paramsStr}`);
    if (res.ok) setSummary(await res.json());
    setLoading(false);
  }, [token, paramsStr]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const applyPreset = (p: typeof PRESETS[0]) => {
    setFrom(p.from()); setTo(p.to());
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-slate-900">
      {/* Header */}
      <div className="shrink-0 border-b border-slate-700/50 px-6 py-5">
        <h1 className="text-xl font-bold text-white">Reportes</h1>
        <p className="text-slate-400 text-sm mt-0.5">Análisis de ventas, productos y turnos</p>
      </div>

      {/* Filtros */}
      <div className="shrink-0 border-b border-slate-700/50 px-6 py-4 flex flex-wrap items-center gap-3">
        {/* Presets */}
        <div className="flex gap-1 bg-slate-800 border border-slate-700/50 rounded-xl p-1">
          {PRESETS.map(p => {
            const active = p.from() === from && p.to() === to;
            return (
              <button key={p.label} onClick={() => applyPreset(p)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Rango manual */}
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-slate-500 text-sm">—</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* Selector de sucursal (solo admin) */}
        {isAdmin && (
          <select value={branchId} onChange={e => setBranchId(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">Todas las sucursales</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Tarjetas resumen */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            [1,2,3,4].map(i => <div key={i} className="h-24 rounded-2xl bg-slate-800 border border-slate-700/50 animate-pulse" />)
          ) : summary ? (
            <>
              <StatCard label="Ventas totales"  value={bs(summary.totalSales)}           sub={`${summary.totalOrders} órdenes`}  color="blue" />
              <StatCard label="Ticket promedio" value={bs(summary.avgTicket)}            sub="por orden"                         color="green" />
              <StatCard label="Efectivo"        value={bs(summary.cashSales)}            sub="método de pago"                    color="amber" />
              <StatCard label="QR / Digital"    value={bs(summary.cardSales + summary.transferSales)} sub="tarjeta + transferencia" color="purple" />
            </>
          ) : null}
        </div>

        {/* Pestañas */}
        <div className="flex gap-1 border-b border-slate-700/50 pb-0">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 text-sm font-medium transition rounded-t-lg ${
                activeTab === t.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Contenido pestaña */}
        {activeTab === 'ventas'    && <TabVentas    token={token!} params={paramsStr} loading={loading} />}
        {activeTab === 'productos' && <TabProductos token={token!} params={paramsStr} loading={loading} />}
        {activeTab === 'turnos'    && <TabTurnos    token={token!} params={paramsStr} loading={loading} />}
        {activeTab === 'pagos'     && <TabPagos     summary={summary} loading={loading} />}
      </div>
    </div>
  );
}
