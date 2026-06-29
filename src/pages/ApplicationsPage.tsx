import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

import API_URL from '../config';
const API = `${API_URL}/api`;
const apiFetch = (token: string, path: string, opts?: RequestInit) =>
  fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });

// ─── Types ────────────────────────────────────────────────────────────────────
type Category = 'apto' | 'descartado';
type Status = 'new' | 'reviewed' | 'discarded';
type Sex = 'male' | 'female';
type Shift = 'morning' | 'night';
type NightTransport = 'own' | 'someone';

interface Application {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  idCard: string;
  sex: Sex;
  age: number;
  fullTimeAvailability: boolean;
  shift: Shift;
  nightTransport: NightTransport | null;
  workedInSimilar: boolean;
  previousWorkplace: string | null;
  previousDuration: string | null;
  livesAt: string;
  salaryExpectation: string;
  availableFrom: string | null;
  weekendAvailability: boolean;
  category: Category;
  discardReason: string | null;
  isDuplicate: boolean;
  status: Status;
  createdAt: string;
}

// ─── Filtro por periodo de fecha (igual que Pedidos) ──────────────────────────
type Period = 'all' | 'day' | 'week' | 'month' | 'year';

const PERIOD_LABELS: { key: Period; label: string }[] = [
  { key: 'all',   label: 'Todas' },
  { key: 'day',   label: 'Hoy' },
  { key: 'week',  label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'year',  label: 'Año' },
];

/** Convierte un periodo en rango [from, to] (YYYY-MM-DD), o null si 'all'. */
function periodToRange(period: Period): { from: string; to: string } | null {
  if (period === 'all') return null;
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (period === 'day') return { from: fmt(now), to: fmt(now) };
  if (period === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: fmt(first), to: fmt(last) };
  }
  if (period === 'year') {
    return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
  }
  // week: lunes a domingo de la semana actual
  const day = now.getDay() || 7; // domingo=0 → 7
  const monday = new Date(now); monday.setDate(now.getDate() - day + 1);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  return { from: fmt(monday), to: fmt(sunday) };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const CATEGORY_LABEL: Record<Category, string> = { apto: 'Apto', descartado: 'Descartado' };
const CATEGORY_STYLE: Record<Category, string> = {
  apto:       'bg-green-500/15 text-green-400 border-green-500/20',
  descartado: 'bg-red-500/15 text-red-400 border-red-500/20',
};
const STATUS_LABEL: Record<Status, string> = { new: 'Nuevo', reviewed: 'Revisado', discarded: 'Descartado' };
const SEX_LABEL: Record<Sex, string> = { male: 'Masculino', female: 'Femenino' };
const SHIFT_LABEL: Record<Shift, string> = { morning: 'Mañana', night: 'Noche' };
const NIGHT_TRANSPORT_LABEL: Record<NightTransport, string> = {
  own: 'Transporte propio', someone: 'Alguien lo transporta',
};
const yesNo = (b: boolean) => (b ? 'Sí' : 'No');

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function ApplicationDetailModal({
  app, token, onClose, onUpdated,
}: {
  app: Application; token: string; onClose: () => void; onUpdated: (a: Application) => void;
}) {
  const [loading, setLoading] = useState(false);

  const setStatus = async (status: Status) => {
    setLoading(true);
    const res = await apiFetch(token, `/job-applications/${app.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    if (res.ok) onUpdated({ ...app, status });
    setLoading(false);
  };

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-3 text-sm py-1.5 border-b border-slate-700/40 last:border-0">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className="text-slate-200 text-right">{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-700 shrink-0">
          <div>
            <h2 className="text-white font-black text-xl">{app.firstName} {app.lastName}</h2>
            <p className="text-slate-500 text-xs mt-0.5">Postuló el {formatDate(app.createdAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            {app.isDuplicate && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-amber-500/15 text-amber-400 border-amber-500/20">
                Duplicado
              </span>
            )}
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${CATEGORY_STYLE[app.category]}`}>
              {CATEGORY_LABEL[app.category]}
            </span>
            <button onClick={onClose} className="text-slate-500 hover:text-white text-xl ml-1">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {app.category === 'descartado' && app.discardReason && (
            <div className="mb-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <p className="text-red-400 text-xs font-semibold uppercase tracking-wide mb-0.5">Motivo del descarte</p>
              <p className="text-slate-200 text-sm">{app.discardReason}</p>
            </div>
          )}
          {app.isDuplicate && (
            <div className="mb-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5">
              <p className="text-amber-400 text-sm">⚠️ Este carnet (CI) ya había postulado antes.</p>
            </div>
          )}
          <Row label="Teléfono" value={app.phone} />
          <Row label="Carnet (CI)" value={app.idCard} />
          <Row label="Sexo" value={SEX_LABEL[app.sex]} />
          <Row label="Edad" value={`${app.age} años`} />
          <Row label="Disponibilidad de tiempo" value={yesNo(app.fullTimeAvailability)} />
          <Row label="Turno preferido" value={SHIFT_LABEL[app.shift]} />
          {app.shift === 'night' && (
            <Row label="Transporte (turno noche)" value={app.nightTransport ? NIGHT_TRANSPORT_LABEL[app.nightTransport] : '—'} />
          )}
          <Row label="Fines de semana / feriados" value={yesNo(app.weekendAvailability)} />
          <Row label="Trabajó en hamburguesería/pollería" value={yesNo(app.workedInSimilar)} />
          <Row label="Dónde trabajó antes" value={app.previousWorkplace || '—'} />
          <Row label="Tiempo en anterior trabajo" value={app.previousDuration || '—'} />
          <Row label="Puede empezar desde" value={app.availableFrom || '—'} />
          <Row label="Pretensión salarial (por día)" value={`${app.salaryExpectation} Bs.`} />
          <Row label="Por dónde vive" value={app.livesAt} />
        </div>

        {/* Footer: estado de revisión */}
        <div className="px-6 py-4 border-t border-slate-700 shrink-0">
          <p className="text-slate-400 text-xs mb-2">Estado de revisión: <span className="text-slate-200 font-medium">{STATUS_LABEL[app.status]}</span></p>
          <div className="flex gap-2">
            <button disabled={loading || app.status === 'reviewed'} onClick={() => setStatus('reviewed')}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-2 rounded-xl text-sm font-medium">
              Marcar revisado
            </button>
            <button disabled={loading || app.status === 'discarded'} onClick={() => setStatus('discarded')}
              className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-200 py-2 rounded-xl text-sm font-medium">
              Descartar
            </button>
            {app.status !== 'new' && (
              <button disabled={loading} onClick={() => setStatus('new')}
                className="px-3 bg-slate-700 hover:bg-slate-600 text-slate-300 py-2 rounded-xl text-sm">
                ↺
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ApplicationsPage() {
  const { token } = useAuth();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | Category>('all');
  const [period, setPeriod] = useState<Period>('all');
  const [selected, setSelected] = useState<Application | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ limit: '100' });
    if (filter !== 'all') params.set('category', filter);
    const range = periodToRange(period);
    if (range) { params.set('from', range.from); params.set('to', range.to); }
    const res = await apiFetch(token, `/job-applications?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      setApps(json.data ?? []);
    }
    setLoading(false);
  }, [token, filter, period]);

  useEffect(() => { load(); }, [load]);

  const handleUpdated = (updated: Application) => {
    setApps(prev => prev.map(a => (a.id === updated.id ? updated : a)));
    setSelected(updated);
  };

  const FILTERS: { key: 'all' | Category; label: string }[] = [
    { key: 'all', label: 'Todas' },
    { key: 'apto', label: 'Aptos' },
    { key: 'descartado', label: 'Descartados' },
  ];

  return (
    <div className="flex-1 flex flex-col bg-slate-900 min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-700/50 shrink-0">
        <h1 className="text-white font-black text-2xl">Postulaciones</h1>
        <p className="text-slate-500 text-sm">Candidatos del formulario de contratación</p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${filter === f.key ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
              {f.label}
            </button>
          ))}
          <span className="text-slate-600 mx-1">|</span>
          {PERIOD_LABELS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${period === p.key ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <p className="text-slate-500 text-sm text-center py-10">Cargando postulaciones…</p>
        ) : apps.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-10">No hay postulaciones todavía.</p>
        ) : (
          <div className="space-y-2 max-w-3xl">
            {apps.map(app => (
              <button key={app.id} onClick={() => setSelected(app)}
                className="w-full text-left bg-slate-800 hover:bg-slate-700/70 border border-slate-700/50 rounded-xl px-4 py-3 flex items-center justify-between gap-3 transition">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white text-sm font-semibold truncate">{app.firstName} {app.lastName}</p>
                    {app.isDuplicate && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-amber-500/15 text-amber-400 border-amber-500/20 shrink-0">
                        Duplicado
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400 text-xs truncate">
                    {app.age} años · {SEX_LABEL[app.sex]} · {app.phone}
                  </p>
                  {app.category === 'descartado' && app.discardReason && (
                    <p className="text-red-400/80 text-xs truncate mt-0.5">✕ {app.discardReason}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {app.status !== 'new' && (
                    <span className="text-slate-500 text-xs">{STATUS_LABEL[app.status]}</span>
                  )}
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${CATEGORY_STYLE[app.category]}`}>
                    {CATEGORY_LABEL[app.category]}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && token && (
        <ApplicationDetailModal
          app={selected}
          token={token}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}
