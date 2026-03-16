import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const API = 'http://localhost:3000/api';
const apiFetch = (token: string, path: string, opts?: RequestInit) =>
  fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });

// ─── Types ────────────────────────────────────────────────────────────────────
interface Plan {
  id: number;
  name: string;
  description: string;
  price: number;
  durationDays: number;
  maxBranches: number;
  maxUsers: number;
  maxProducts: number;
  isActive: boolean;
}

type SubStatus = 'trial' | 'active' | 'expired' | 'cancelled';

interface Subscription {
  id: number;
  status: SubStatus;
  startDate: string;
  endDate: string;
  notes: string | null;
  createdAt: string;
  organization: { id: number; name: string };
  plan: Plan;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<SubStatus, string> = {
  trial:     'bg-blue-500/15 text-blue-400 border-blue-500/20',
  active:    'bg-green-500/15 text-green-400 border-green-500/20',
  expired:   'bg-red-500/15 text-red-400 border-red-500/20',
  cancelled: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
};
const STATUS_LABEL: Record<SubStatus, string> = {
  trial: 'Trial', active: 'Activa', expired: 'Expirada', cancelled: 'Cancelada',
};

function daysRemaining(endDate: string): number {
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86_400_000));
}
function fmt(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}
function limitLabel(v: number) { return v === -1 ? '∞' : String(v); }

// ─── Renew Modal ──────────────────────────────────────────────────────────────
function RenewModal({
  sub, plans, token, onClose, onDone,
}: { sub: Subscription; plans: Plan[]; token: string; onClose: () => void; onDone: () => void }) {
  const [days, setDays] = useState(sub.plan.durationDays);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setLoading(true);
    setErr('');
    const res = await apiFetch(token, `/subscriptions/${sub.id}/renew`, {
      method: 'PATCH',
      body: JSON.stringify({ days, notes: notes || undefined }),
    });
    if (res.ok) { onDone(); }
    else { const d = await res.json(); setErr(d.message ?? 'Error'); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-bold text-lg">Renovar suscripción</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl">✕</button>
        </div>
        <p className="text-slate-400 text-sm">{sub.organization.name} · {sub.plan.name}</p>

        <div>
          <label className="text-slate-400 text-xs mb-1 block">Días a agregar</label>
          <input
            type="number" min={1} value={days} onChange={e => setDays(Number(e.target.value))}
            className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-slate-500 text-xs mt-1">Plan actual: {sub.plan.durationDays} días</p>
        </div>

        <div>
          <label className="text-slate-400 text-xs mb-1 block">Notas (opcional)</label>
          <input
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Ej: Renovación mensual"
            className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {err && <p className="text-red-400 text-sm">{err}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 py-2.5 rounded-xl text-sm font-medium transition">
            Cancelar
          </button>
          <button onClick={submit} disabled={loading}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-50">
            {loading ? 'Guardando...' : 'Renovar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create Subscription Modal ────────────────────────────────────────────────
function CreateModal({
  plans, token, onClose, onDone,
}: { plans: Plan[]; token: string; onClose: () => void; onDone: () => void }) {
  const [orgId, setOrgId] = useState('');
  const [planId, setPlanId] = useState(plans[0]?.id ?? 0);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!orgId || !planId) { setErr('Completa todos los campos'); return; }
    setLoading(true); setErr('');
    const res = await apiFetch(token, '/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ orgId: Number(orgId), planId, startDate, notes: notes || undefined }),
    });
    if (res.ok) { onDone(); }
    else { const d = await res.json(); setErr(d.message ?? 'Error'); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-bold text-lg">Nueva suscripción</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl">✕</button>
        </div>

        <div>
          <label className="text-slate-400 text-xs mb-1 block">ID de organización</label>
          <input value={orgId} onChange={e => setOrgId(e.target.value)} placeholder="Ej: 1"
            className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="text-slate-400 text-xs mb-1 block">Plan</label>
          <select value={planId} onChange={e => setPlanId(Number(e.target.value))}
            className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            {plans.map(p => (
              <option key={p.id} value={p.id}>{p.name} — {p.durationDays}d · Bs. {p.price}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-slate-400 text-xs mb-1 block">Fecha de inicio</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="text-slate-400 text-xs mb-1 block">Notas (opcional)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {err && <p className="text-red-400 text-sm">{err}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 py-2.5 rounded-xl text-sm font-medium transition">Cancelar</button>
          <button onClick={submit} disabled={loading}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-50">
            {loading ? 'Creando...' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Plan Card ────────────────────────────────────────────────────────────────
function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div className="bg-slate-800 border border-slate-700/50 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-white font-bold">{plan.name}</p>
        <p className="text-blue-400 font-bold text-sm">Bs. {Number(plan.price).toFixed(2)}<span className="text-slate-500 font-normal text-xs">/{plan.durationDays}d</span></p>
      </div>
      <p className="text-slate-400 text-xs">{plan.description}</p>
      <div className="flex gap-3 text-xs text-slate-500 pt-1">
        <span>Sucursales: <strong className="text-slate-300">{limitLabel(plan.maxBranches)}</strong></span>
        <span>Usuarios: <strong className="text-slate-300">{limitLabel(plan.maxUsers)}</strong></span>
        <span>Productos: <strong className="text-slate-300">{limitLabel(plan.maxProducts)}</strong></span>
      </div>
    </div>
  );
}

// ─── Subscription Row ─────────────────────────────────────────────────────────
function SubRow({ sub, onRenew, onCancel }: { sub: Subscription; onRenew: () => void; onCancel: () => void }) {
  const days = daysRemaining(sub.endDate);
  const isActive = sub.status === 'active' || sub.status === 'trial';

  return (
    <div className="px-5 py-4 border-b border-slate-700/30 grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 items-center hover:bg-slate-800/40 transition-colors">
      <div>
        <p className="text-white font-semibold text-sm">{sub.organization.name}</p>
        <p className="text-slate-500 text-xs">ID #{sub.organization.id}</p>
      </div>
      <div className="w-24">
        <p className="text-slate-300 text-sm font-medium">{sub.plan.name}</p>
        <p className="text-slate-500 text-xs">Bs. {Number(sub.plan.price).toFixed(2)}</p>
      </div>
      <div className="w-32 text-center">
        <p className="text-slate-300 text-sm">{fmt(sub.startDate)}</p>
        <p className="text-slate-500 text-xs">→ {fmt(sub.endDate)}</p>
      </div>
      <div className="w-20 text-center">
        {isActive ? (
          <p className={`text-sm font-bold ${days <= 3 ? 'text-red-400' : days <= 7 ? 'text-amber-400' : 'text-green-400'}`}>
            {days}d
          </p>
        ) : (
          <p className="text-slate-600 text-sm">—</p>
        )}
      </div>
      <div className="w-24 flex justify-center">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_STYLE[sub.status]}`}>
          {STATUS_LABEL[sub.status]}
        </span>
      </div>
      <div className="flex gap-2 shrink-0">
        <button onClick={onRenew}
          className="text-xs px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/20 rounded-lg transition font-medium">
          Renovar
        </button>
        {sub.status !== 'cancelled' && (
          <button onClick={onCancel}
            className="text-xs px-3 py-1.5 bg-slate-700 hover:bg-red-600/20 text-slate-400 hover:text-red-400 border border-slate-600 hover:border-red-500/30 rounded-lg transition">
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SubscriptionsPage() {
  const { token, user } = useAuth();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [renewTarget, setRenewTarget] = useState<Subscription | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const [subsRes, plansRes] = await Promise.all([
      apiFetch(token, '/subscriptions'),
      apiFetch(token, '/plans'),
    ]);
    if (subsRes.ok)  setSubscriptions(await subsRes.json());
    if (plansRes.ok) setPlans(await plansRes.json());
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleCancel = async (id: number) => {
    if (!token || !confirm('¿Cancelar esta suscripción?')) return;
    const res = await apiFetch(token, `/subscriptions/${id}/cancel`, { method: 'PATCH' });
    if (res.ok) load();
  };

  const stats = {
    active:  subscriptions.filter(s => s.status === 'active').length,
    trial:   subscriptions.filter(s => s.status === 'trial').length,
    expired: subscriptions.filter(s => s.status === 'expired').length,
  };

  if (user?.role !== 'superadmin') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-slate-500">Solo superadmin puede ver esta página</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-slate-900">
      {renewTarget && token && (
        <RenewModal sub={renewTarget} plans={plans} token={token}
          onClose={() => setRenewTarget(null)} onDone={() => { setRenewTarget(null); load(); }} />
      )}
      {showCreate && token && (
        <CreateModal plans={plans} token={token}
          onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); load(); }} />
      )}

      {/* Header */}
      <div className="shrink-0 border-b border-slate-700/50 px-6 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Suscripciones</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {loading ? 'Cargando...' : `${stats.active} activas · ${stats.trial} en trial · ${stats.expired} expiradas`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load}
            className="text-sm text-slate-400 hover:text-white hover:bg-slate-700 px-3 py-2 rounded-xl transition">
            ↻
          </button>
          <button onClick={() => setShowCreate(true)}
            className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-medium transition">
            + Nueva suscripción
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Plans summary */}
        <div className="px-6 py-4 border-b border-slate-700/30">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-3">Planes disponibles</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {plans.map(plan => <PlanCard key={plan.id} plan={plan} />)}
          </div>
        </div>

        {/* Subscriptions table */}
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700/50 px-5 py-3
          grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <span>Organización</span>
          <span className="w-24">Plan</span>
          <span className="w-32 text-center">Período</span>
          <span className="w-20 text-center">Días rest.</span>
          <span className="w-24 text-center">Estado</span>
          <span className="shrink-0">Acciones</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-5xl mb-3">💳</p>
            <p className="text-slate-400 font-medium">No hay suscripciones</p>
          </div>
        ) : (
          subscriptions.map(sub => (
            <SubRow key={sub.id} sub={sub}
              onRenew={() => setRenewTarget(sub)}
              onCancel={() => handleCancel(sub.id)} />
          ))
        )}
      </div>
    </div>
  );
}
