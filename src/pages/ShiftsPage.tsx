import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import ShiftPrintReceipt, { ShiftReportData } from '../components/ShiftPrintReceipt';

const API = 'http://localhost:3000/api';
const apiFetch = (token: string, path: string, opts?: RequestInit) =>
  fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });

// ─── Types ────────────────────────────────────────────────────────────────────
interface Shift {
  id: number;
  type: 'pos' | 'system';
  status: 'open' | 'closed';
  openingAmount: number;
  closingAmount: number | null;
  notes: string | null;
  openedAt: string;
  closedAt: string | null;
  branch: { id: number; name: string };
  user: { id: number; name: string } | null;
}

interface ShiftSummary {
  shift: Shift;
  totalOrders: number;
  totalSales: number;
  cashSales: number;
  digitalSales: number;
  expectedCash: number;
  closingAmount: number | null;
  difference: number | null;
}

type ShiftReport = ShiftReportData;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatTime(d: string) {
  return new Date(d).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function duration(from: string, to: string | null) {
  const end = to ? new Date(to) : new Date();
  const m = Math.floor((end.getTime() - new Date(from).getTime()) / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function PrintButton({ shiftId, token, orgName }: { shiftId: number; token: string; orgName: string }) {
  const [loading,    setLoading]    = useState(false);
  const [reportData, setReportData] = useState<ShiftReport | null>(null);

  // useEffect garantiza que el div ya está en el DOM antes de imprimir
  useEffect(() => {
    if (!reportData) return;
    window.print();
    const cleanup = () => setReportData(null);
    window.addEventListener('afterprint', cleanup, { once: true });
    return () => window.removeEventListener('afterprint', cleanup);
  }, [reportData]);

  const handlePrint = async () => {
    setLoading(true);
    try {
      const res  = await apiFetch(token, `/shifts/${shiftId}/report`);
      const data: ShiftReport = await res.json();
      setReportData(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {reportData && <ShiftPrintReceipt data={reportData} orgName={orgName} />}
      <button
        onClick={handlePrint}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-xl text-sm font-medium transition disabled:opacity-50">
        {loading ? (
          <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <span>🖨️</span>
        )}
        Imprimir cierre
      </button>
    </>
  );
}

// ─── Summary Modal ────────────────────────────────────────────────────────────
function SummaryModal({ shiftId, token, orgName, onClose }: { shiftId: number; token: string; orgName: string; onClose: () => void }) {
  const [data, setData] = useState<ShiftSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(token, `/shifts/${shiftId}/summary`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [shiftId, token]);

  const s = data;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-white font-bold text-lg">Resumen del turno</h2>
            {s && <p className="text-slate-400 text-xs mt-0.5">{s.shift.branch.name} · {s.shift.user?.name ?? 'Sistema'}</p>}
          </div>
          <div className="flex items-center gap-2">
            <PrintButton shiftId={shiftId} token={token} orgName={orgName} />
            <button onClick={onClose} className="text-slate-500 hover:text-white text-xl">✕</button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : s ? (
          <div className="px-6 py-5 space-y-3">
            {/* Horario */}
            <div className="bg-slate-700/40 rounded-xl px-4 py-3 flex items-center justify-between text-sm">
              <div>
                <p className="text-slate-400 text-xs mb-0.5">Apertura</p>
                <p className="text-white font-medium">{formatTime(s.shift.openedAt)}</p>
              </div>
              <div className="text-slate-500 text-xs px-3">⟶ {duration(s.shift.openedAt, s.shift.closedAt)}</div>
              <div className="text-right">
                <p className="text-slate-400 text-xs mb-0.5">Cierre</p>
                <p className="text-white font-medium">{s.shift.closedAt ? formatTime(s.shift.closedAt) : '—'}</p>
              </div>
            </div>

            {/* Ventas */}
            <div className="space-y-2">
              <Row label="Total pedidos" value={`${s.totalOrders} órdenes`} />
              <Row label="Ventas totales" value={`Bs. ${s.totalSales.toFixed(2)}`} highlight />
              <Row label="Ventas efectivo" value={`Bs. ${s.cashSales.toFixed(2)}`} />
              <Row label="Ventas QR / digital" value={`Bs. ${s.digitalSales.toFixed(2)}`} />
            </div>

            {/* Caja */}
            {s.shift.type === 'pos' && (
              <div className="border-t border-slate-700/50 pt-3 space-y-2">
                <Row label="Efectivo inicial" value={`Bs. ${Number(s.shift.openingAmount).toFixed(2)}`} />
                <Row label="Efectivo esperado" value={`Bs. ${s.expectedCash.toFixed(2)}`} />
                {s.closingAmount !== null && (
                  <Row label="Efectivo contado" value={`Bs. ${s.closingAmount.toFixed(2)}`} />
                )}
                {s.difference !== null && (
                  <div className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold ${
                    s.difference === 0 ? 'bg-green-500/10 text-green-400' :
                    s.difference > 0  ? 'bg-blue-500/10 text-blue-400' :
                                        'bg-red-500/10 text-red-400'
                  }`}>
                    <span>Diferencia</span>
                    <span>{s.difference > 0 ? '+' : ''}Bs. {s.difference.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {s.shift.notes && (
              <p className="text-slate-500 text-xs italic border-t border-slate-700/50 pt-3">"{s.shift.notes}"</p>
            )}
          </div>
        ) : (
          <p className="text-slate-500 text-sm text-center py-8">No se pudo cargar el resumen</p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className={highlight ? 'text-white font-bold' : 'text-slate-300'}>{value}</span>
    </div>
  );
}

// ─── Shift Card ───────────────────────────────────────────────────────────────
function ShiftCard({ shift, onViewSummary }: { shift: Shift; onViewSummary: (id: number) => void }) {
  const isOpen   = shift.status === 'open';
  const isSystem = shift.type === 'system';

  return (
    <div className={`bg-slate-800 border rounded-xl p-4 flex flex-col gap-3 ${
      isOpen ? 'border-green-500/30' : 'border-slate-700/50'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0 ${
            isSystem ? 'bg-purple-500/15' : 'bg-blue-500/15'
          }`}>
            {isSystem ? '🤖' : '🖥️'}
          </div>
          <div>
            <p className="text-white text-sm font-semibold">
              {isSystem ? 'Turno Sistema' : (shift.user?.name ?? 'Sin cajero')}
            </p>
            <p className="text-slate-500 text-xs">{shift.branch.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isOpen && (
            <span className="flex items-center gap-1 bg-green-500/15 text-green-400 text-xs font-semibold px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
              Abierto
            </span>
          )}
          {!isOpen && (
            <span className="bg-slate-700/60 text-slate-400 text-xs font-medium px-2 py-0.5 rounded-full">
              Cerrado
            </span>
          )}
        </div>
      </div>

      {/* Tiempo */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-slate-700/40 rounded-lg px-3 py-2">
          <p className="text-slate-500 mb-0.5">Apertura</p>
          <p className="text-slate-300 font-medium">{formatDate(shift.openedAt)}</p>
          <p className="text-slate-400">{formatTime(shift.openedAt)}</p>
        </div>
        <div className="bg-slate-700/40 rounded-lg px-3 py-2">
          <p className="text-slate-500 mb-0.5">{isOpen ? 'Duración' : 'Cierre'}</p>
          {isOpen ? (
            <p className="text-green-400 font-medium">{duration(shift.openedAt, null)}</p>
          ) : (
            <>
              <p className="text-slate-300 font-medium">{shift.closedAt ? formatDate(shift.closedAt) : '—'}</p>
              <p className="text-slate-400">{shift.closedAt ? formatTime(shift.closedAt) : ''}</p>
            </>
          )}
        </div>
      </div>

      {/* Montos */}
      {!isSystem && (
        <div className="flex items-center justify-between text-xs border-t border-slate-700/40 pt-2">
          <span className="text-slate-500">Apertura caja</span>
          <span className="text-slate-300 font-medium">Bs. {Number(shift.openingAmount).toFixed(2)}</span>
          {shift.closingAmount !== null && (
            <>
              <span className="text-slate-600">→</span>
              <span className="text-slate-300 font-medium">Bs. {Number(shift.closingAmount).toFixed(2)}</span>
            </>
          )}
        </div>
      )}

      <button
        onClick={() => onViewSummary(shift.id)}
        className="w-full text-xs font-medium text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-700 py-2 rounded-lg transition">
        Ver resumen
      </button>
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
export default function ShiftsPage() {
  const { token, hasPermission, user } = useAuth();
  const orgName = (user as any)?.organization?.name ?? 'Mi Negocio';
  const isAdmin = hasPermission('orders:view_all');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [period, setPeriod] = useState<Period>('day');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [branchFilter, setBranchFilter] = useState<number | 'all'>('all');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await apiFetch(token, '/shifts');
    if (res.ok) setShifts(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Branches únicas para filtro admin
  const branches = isAdmin
    ? Array.from(new Map(shifts.map(s => [s.branch.id, s.branch])).values())
    : [];

  // Turnos abiertos siempre visibles (sin importar periodo), cerrados filtrados por periodo
  const periodShifts = shifts.filter(s =>
    s.status === 'open' || inPeriod(s.openedAt, period)
  );

  const filtered = periodShifts.filter(s => {
    if (filter === 'open'   && s.status !== 'open')   return false;
    if (filter === 'closed' && s.status !== 'closed') return false;
    if (isAdmin && branchFilter !== 'all' && s.branch.id !== branchFilter) return false;
    return true;
  });

  const openCount   = periodShifts.filter(s => s.status === 'open').length;
  const closedCount = periodShifts.filter(s => s.status === 'closed').length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-slate-900">
      {selectedId !== null && token && (
        <SummaryModal shiftId={selectedId} token={token} orgName={orgName} onClose={() => setSelectedId(null)} />
      )}

      {/* Header */}
      <div className="shrink-0 border-b border-slate-700/50 px-6 py-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Turnos</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {loading ? 'Cargando...' : `${openCount} abierto(s) · ${closedCount} cerrado(s)`}
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
          <button onClick={load}
            className="text-sm text-slate-400 hover:text-white hover:bg-slate-700 px-3 py-2 rounded-xl transition">
            ↻
          </button>
        </div>
      </div>

      {/* Filtros estado */}
      <div className="shrink-0 border-b border-slate-700/50 px-6 py-3 flex gap-2">
        {([['all', 'Todos', periodShifts.length], ['open', 'Abiertos', openCount], ['closed', 'Cerrados', closedCount]] as const).map(([key, label, count]) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition ${
              filter === key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}>
            {label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
              filter === key ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'
            }`}>{count}</span>
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1,2,3].map(i => <div key={i} className="h-52 rounded-xl bg-slate-800 border border-slate-700/50 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-5xl mb-3">🕐</p>
            <p className="text-slate-400 font-medium">No hay turnos</p>
            <p className="text-slate-600 text-sm mt-1">Los turnos aparecerán cuando el cajero abra la caja</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(shift => (
              <ShiftCard key={shift.id} shift={shift} onViewSummary={setSelectedId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
