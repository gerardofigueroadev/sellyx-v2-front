import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const API = 'http://localhost:3000/api';
const apiFetch = (token: string, path: string, opts?: RequestInit) =>
  fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });

// ─── Types ────────────────────────────────────────────────────────────────────
interface OrgUser {
  id: number;
  name: string;
  username: string;
  role: { id: number; name: string } | null;
  branch: { id: number; name: string } | null;
}

interface Branch {
  id: number;
  name: string;
}

interface Role {
  id: number;
  name: string;
}

interface Organization {
  id: number;
  name: string;
  code: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
}

type SubStatus = 'trial' | 'active' | 'expired' | 'cancelled';

interface Subscription {
  id: number;
  status: SubStatus;
  startDate: string;
  endDate: string;
  organization: { id: number; name: string };
  plan: { id: number; name: string; price: number; durationDays: number };
}

interface Plan {
  id: number;
  name: string;
  price: number;
  durationDays: number;
}

interface OrgWithSub extends Organization {
  subscription: Subscription | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<SubStatus | 'none', string> = {
  trial:     'bg-blue-500/15 text-blue-400 border-blue-500/20',
  active:    'bg-green-500/15 text-green-400 border-green-500/20',
  expired:   'bg-red-500/15 text-red-400 border-red-500/20',
  cancelled: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  none:      'bg-slate-700/40 text-slate-500 border-slate-700/40',
};
const STATUS_LABEL: Record<SubStatus | 'none', string> = {
  trial: 'Trial', active: 'Activa', expired: 'Expirada', cancelled: 'Cancelada', none: 'Sin plan',
};

function daysRemaining(endDate: string): number {
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86_400_000));
}
function fmt(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Org Detail Modal ─────────────────────────────────────────────────────────
function OrgModal({
  org, token, onClose, onSaved, plans,
}: { org: OrgWithSub; token: string; onClose: () => void; onSaved: () => void; plans: Plan[] }) {
  const [tab, setTab] = useState<'subscription' | 'users'>('subscription');

  const sub = org.subscription;
  const status: SubStatus | 'none' = sub?.status ?? 'none';
  const days = sub ? daysRemaining(sub.endDate) : 0;
  const isActive = sub && (sub.status === 'active' || sub.status === 'trial');

  // Subscription form state
  const [planId, setPlanId]       = useState(sub?.plan.id ?? plans[0]?.id ?? 0);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [renewDays, setRenewDays] = useState(sub?.plan.durationDays ?? 30);
  const [notes, setNotes]         = useState('');
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState('');

  // Users tab state
  const [users, setUsers]         = useState<OrgUser[]>([]);
  const [branches, setBranches]   = useState<Branch[]>([]);
  const [roles, setRoles]         = useState<Role[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showNewUser, setShowNewUser]   = useState(false);
  const [newUser, setNewUser] = useState({ name: '', username: '', password: '', roleId: 0, branchId: 0 });
  const [userErr, setUserErr] = useState('');
  const [userSaving, setUserSaving] = useState(false);

  useEffect(() => {
    if (tab !== 'users') return;
    setUsersLoading(true);
    Promise.all([
      apiFetch(token, `/users?orgId=${org.id}`),
      apiFetch(token, `/branches?orgId=${org.id}`),
      apiFetch(token, '/roles'),
    ]).then(async ([uRes, bRes, rRes]) => {
      if (uRes.ok) setUsers(await uRes.json());
      if (bRes.ok) setBranches(await bRes.json());
      if (rRes.ok) {
        const r = await rRes.json();
        setRoles(r);
        if (r.length > 0 && !newUser.roleId) setNewUser(u => ({ ...u, roleId: r[0].id }));
      }
    }).finally(() => setUsersLoading(false));
  }, [tab]);

  const doCreateUser = async () => {
    if (!newUser.name.trim() || !newUser.username.trim() || !newUser.password.trim()) {
      setUserErr('Nombre, usuario y contraseña son obligatorios'); return;
    }
    setUserSaving(true); setUserErr('');
    try {
      const body: any = {
        name: newUser.name.trim(),
        username: newUser.username.trim(),
        password: newUser.password.trim(),
        roleId: newUser.roleId,
        organizationId: org.id,
      };
      if (newUser.branchId) body.branchId = newUser.branchId;
      const res = await apiFetch(token, '/users', { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); throw new Error(Array.isArray(d.message) ? d.message.join(', ') : d.message ?? 'Error'); }
      setShowNewUser(false);
      setNewUser({ name: '', username: '', password: '', roleId: roles[0]?.id ?? 0, branchId: 0 });
      const uRes = await apiFetch(token, `/users?orgId=${org.id}`);
      if (uRes.ok) setUsers(await uRes.json());
    } catch (e: any) { setUserErr(e.message); } finally { setUserSaving(false); }
  };

  const doDeleteUser = async (userId: number) => {
    if (!confirm('¿Eliminar este usuario?')) return;
    await apiFetch(token, `/users/${userId}`, { method: 'DELETE' });
    setUsers(u => u.filter(x => x.id !== userId));
  };

  const doCreate = async () => {
    setSaving(true); setErr('');
    try {
      const res = await apiFetch(token, '/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ orgId: org.id, planId, startDate, notes: notes || undefined }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message ?? 'Error'); }
      onSaved(); onClose();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  const doRenew = async () => {
    if (!sub) return;
    setSaving(true); setErr('');
    try {
      const res = await apiFetch(token, `/subscriptions/${sub.id}/renew`, {
        method: 'PATCH',
        body: JSON.stringify({ days: renewDays, notes: notes || undefined }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message ?? 'Error'); }
      onSaved(); onClose();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  const doCancel = async () => {
    if (!sub || !confirm('¿Cancelar la suscripción?')) return;
    setSaving(true); setErr('');
    try {
      const res = await apiFetch(token, `/subscriptions/${sub.id}/cancel`, { method: 'PATCH' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message ?? 'Error'); }
      onSaved(); onClose();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  const doDelete = async () => {
    if (!sub || !confirm('¿Eliminar la suscripción? Esto no se puede deshacer.')) return;
    setSaving(true); setErr('');
    try {
      const res = await apiFetch(token, `/subscriptions/${sub.id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message ?? 'Error'); }
      onSaved(); onClose();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-700 shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">{org.name}</h2>
            <p className="text-slate-500 text-xs mt-0.5">
              ID #{org.id} · Creada {fmt(org.createdAt)}
              {org.code && <span className="ml-1 font-mono text-blue-400"> · código: {org.code}</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl ml-4">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700 shrink-0 px-6">
          {(['subscription', 'users'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`py-2.5 px-1 mr-5 text-sm font-medium border-b-2 transition -mb-px ${
                tab === t ? 'border-blue-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}>
              {t === 'subscription' ? '💳 Suscripción' : '👥 Usuarios'}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* ══ SUBSCRIPTION TAB ══ */}
          {tab === 'subscription' && (<>
            {/* Org info */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                { label: 'Email',     value: org.email },
                { label: 'Teléfono', value: org.phone },
                { label: 'NIT/CI',   value: org.taxId },
                { label: 'Dirección', value: org.address },
              ].map(({ label, value }) => value ? (
                <div key={label} className="bg-slate-700/40 rounded-xl px-3 py-2">
                  <p className="text-slate-500 text-xs mb-0.5">{label}</p>
                  <p className="text-slate-300 text-sm truncate">{value}</p>
                </div>
              ) : null)}
            </div>

            {/* Current subscription status */}
            <div className={`rounded-xl border px-4 py-3 ${STATUS_STYLE[status]}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider opacity-70">Suscripción actual</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[status]}`}>
                  {STATUS_LABEL[status]}
                </span>
              </div>
              {sub ? (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="opacity-70">Plan</span>
                    <span className="font-semibold">{sub.plan.name} · Bs. {Number(sub.plan.price).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-70">Período</span>
                    <span>{fmt(sub.startDate)} → {fmt(sub.endDate)}</span>
                  </div>
                  {isActive && (
                    <div className="flex justify-between font-semibold">
                      <span className="opacity-70">Días restantes</span>
                      <span className={days <= 3 ? 'text-red-400' : days <= 7 ? 'text-amber-400' : ''}>{days} días</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm opacity-70">Sin suscripción asignada.</p>
              )}
            </div>

            {/* Create form (no sub) */}
            {!sub && (
              <div className="space-y-3">
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Asignar suscripción</p>
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">Plan</label>
                  <select value={planId} onChange={e => setPlanId(+e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {plans.map(p => <option key={p.id} value={p.id}>{p.name} — {p.durationDays}d · Bs. {p.price}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">Fecha de inicio</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">Notas (opcional)</label>
                  <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej: Primer mes de prueba"
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                {err && <p className="text-red-400 text-sm">⚠️ {err}</p>}
                <button onClick={doCreate} disabled={saving}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-bold transition">
                  {saving ? 'Creando...' : '✓ Crear suscripción'}
                </button>
              </div>
            )}

            {/* Renew form (has sub) */}
            {sub && (
              <div className="space-y-3">
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Renovar suscripción</p>
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">Días a agregar</label>
                  <input type="number" min={1} value={renewDays} onChange={e => setRenewDays(+e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <p className="text-slate-500 text-xs mt-1">Plan actual: {sub.plan.durationDays} días</p>
                </div>
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">Notas (opcional)</label>
                  <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej: Renovación mensual"
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                {err && <p className="text-red-400 text-sm">⚠️ {err}</p>}
                <button onClick={doRenew} disabled={saving}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-bold transition">
                  {saving ? 'Guardando...' : '↻ Renovar'}
                </button>

                {/* Danger zone */}
                <div className="border border-red-500/20 rounded-xl p-3 space-y-2">
                  <p className="text-red-400 text-xs font-semibold">Zona de peligro</p>
                  <div className="flex gap-2">
                    {sub.status !== 'cancelled' && (
                      <button onClick={doCancel} disabled={saving}
                        className="flex-1 bg-slate-700 hover:bg-amber-600/20 text-slate-400 hover:text-amber-400 border border-slate-600 hover:border-amber-500/30 py-2 rounded-lg text-xs font-medium transition">
                        Cancelar suscripción
                      </button>
                    )}
                    <button onClick={doDelete} disabled={saving}
                      className="flex-1 bg-slate-700 hover:bg-red-600/20 text-slate-400 hover:text-red-400 border border-slate-600 hover:border-red-500/30 py-2 rounded-lg text-xs font-medium transition">
                      Eliminar registro
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>)}

          {/* ══ USERS TAB ══ */}
          {tab === 'users' && (<>
            <div className="flex items-center justify-between">
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
                {usersLoading ? 'Cargando...' : `${users.length} usuario${users.length !== 1 ? 's' : ''}`}
              </p>
              <button onClick={() => { setShowNewUser(v => !v); setUserErr(''); }}
                className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg font-medium transition">
                {showNewUser ? 'Cancelar' : '+ Nuevo usuario'}
              </button>
            </div>

            {/* New user form */}
            {showNewUser && (
              <div className="bg-slate-700/40 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 text-xs mb-1 block">Nombre *</label>
                    <input value={newUser.name} onChange={e => setNewUser(u => ({ ...u, name: e.target.value }))}
                      placeholder="Juan Pérez"
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-slate-400 text-xs mb-1 block">Usuario *</label>
                    <input value={newUser.username} onChange={e => setNewUser(u => ({ ...u, username: e.target.value }))}
                      placeholder="juanperez"
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="text-slate-400 text-xs mb-1 block">Contraseña *</label>
                  <input type="password" value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 text-xs mb-1 block">Rol *</label>
                    <select value={newUser.roleId} onChange={e => setNewUser(u => ({ ...u, roleId: +e.target.value }))}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400 text-xs mb-1 block">Sucursal</label>
                    <select value={newUser.branchId} onChange={e => setNewUser(u => ({ ...u, branchId: +e.target.value }))}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value={0}>Sin sucursal</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                </div>
                {userErr && <p className="text-red-400 text-xs">⚠️ {userErr}</p>}
                <button onClick={doCreateUser} disabled={userSaving}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-bold transition">
                  {userSaving ? 'Creando...' : '✓ Crear usuario'}
                </button>
              </div>
            )}

            {/* User list */}
            {usersLoading ? (
              <div className="space-y-2">
                {[1,2].map(i => <div key={i} className="h-14 rounded-xl bg-slate-700/40 animate-pulse" />)}
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-3xl mb-2">👤</p>
                <p className="text-slate-500 text-sm">Sin usuarios registrados</p>
              </div>
            ) : (
              <div className="space-y-2">
                {users.map(u => (
                  <div key={u.id} className="flex items-center justify-between bg-slate-700/40 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-blue-600/30 flex items-center justify-center text-blue-300 text-sm font-bold shrink-0">
                        {u.name[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate">{u.name}</p>
                        <p className="text-slate-500 text-xs">
                          @{u.username} · <span className="capitalize">{u.role?.name ?? '—'}</span>
                          {u.branch && <span> · {u.branch.name}</span>}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => doDeleteUser(u.id)}
                      className="text-slate-600 hover:text-red-400 transition ml-2 shrink-0 text-sm">✕</button>
                  </div>
                ))}
              </div>
            )}
          </>)}
        </div>

        <div className="px-6 py-4 border-t border-slate-700 shrink-0">
          <button onClick={onClose}
            className="w-full bg-slate-700 hover:bg-slate-600 text-slate-300 py-2.5 rounded-xl text-sm transition">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Org Card ─────────────────────────────────────────────────────────────────
function OrgCard({ org, onClick }: { org: OrgWithSub; onClick: () => void }) {
  const sub    = org.subscription;
  const status: SubStatus | 'none' = sub?.status ?? 'none';
  const days   = sub ? daysRemaining(sub.endDate) : 0;
  const isActive = sub && (sub.status === 'active' || sub.status === 'trial');

  const urgency = !isActive ? 'border-slate-700/50'
    : days <= 3  ? 'border-red-500/40'
    : days <= 7  ? 'border-amber-500/30'
    :               'border-slate-700/50';

  return (
    <div
      onClick={onClick}
      className={`bg-slate-800 border rounded-xl p-4 cursor-pointer hover:bg-slate-750 hover:border-blue-500/30 transition-all group ${urgency}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center text-lg shrink-0">
            🏢
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm truncate group-hover:text-blue-300 transition-colors">
              {org.name}
            </p>
            <p className="text-slate-500 text-xs">
              ID #{org.id}
              {org.code && <span className="ml-1.5 font-mono text-blue-500/70">· {org.code}</span>}
            </p>
          </div>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${STATUS_STYLE[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      {/* Subscription info */}
      {sub ? (
        <div className="bg-slate-700/30 rounded-lg px-3 py-2 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-500">Plan</span>
            <span className="text-slate-300 font-medium">{sub.plan.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Vence</span>
            <span className="text-slate-300">{fmt(sub.endDate)}</span>
          </div>
          {isActive && (
            <div className="flex justify-between">
              <span className="text-slate-500">Días rest.</span>
              <span className={`font-bold ${days <= 3 ? 'text-red-400' : days <= 7 ? 'text-amber-400' : 'text-green-400'}`}>
                {days}d
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-700/20 rounded-lg px-3 py-2 text-xs text-slate-600 text-center">
          Sin suscripción asignada
        </div>
      )}

      {/* Contact */}
      {org.email && (
        <p className="text-slate-600 text-xs mt-2 truncate">{org.email}</p>
      )}
    </div>
  );
}

// ─── Create Org Modal ─────────────────────────────────────────────────────────
function CreateOrgModal({ token, onClose, onCreated }: {
  token: string; onClose: () => void; onCreated: () => void;
}) {
  const [form, setForm] = useState({ name: '', code: '', taxId: '', email: '', phone: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const autoCode = form.name.toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]/g, '').slice(0, 20);

  const handleSave = async () => {
    if (!form.name.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true); setError('');
    try {
      const body: any = { name: form.name.trim() };
      const codeVal = form.code.trim() || autoCode;
      if (codeVal) body.code = codeVal;
      if (form.taxId.trim())    body.taxId   = form.taxId.trim();
      if (form.email.trim())    body.email   = form.email.trim();
      if (form.phone.trim())    body.phone   = form.phone.trim();
      if (form.address.trim())  body.address = form.address.trim();
      const res = await apiFetch(token, '/organizations', {
        method: 'POST', body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message ?? 'Error al crear'); }
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏢</span>
            <h2 className="text-white font-bold">Nueva organización</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-slate-400 text-xs mb-1.5">Nombre del negocio *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Restaurante El Buen Sabor" className={inputCls} />
          </div>
          <div>
            <label className="block text-slate-400 text-xs mb-1.5">
              Código de acceso{' '}
              <span className="text-slate-600 normal-case font-normal">(los empleados lo usan al iniciar sesión)</span>
            </label>
            <input
              value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) }))}
              placeholder={autoCode || 'ej: pizzanapoli'}
              className={`${inputCls} font-mono`}
            />
            {autoCode && !form.code && (
              <p className="text-slate-600 text-xs mt-1">Se usará: <span className="font-mono text-blue-500/70">{autoCode}</span></p>
            )}
          </div>
          <div>
            <label className="block text-slate-400 text-xs mb-1.5">NIT / CI</label>
            <input value={form.taxId} onChange={e => setForm(f => ({ ...f, taxId: e.target.value }))}
              placeholder="Número de identificación tributaria" className={inputCls} />
          </div>
          <div>
            <label className="block text-slate-400 text-xs mb-1.5">Email</label>
            <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="contacto@negocio.com" className={inputCls} />
          </div>
          <div>
            <label className="block text-slate-400 text-xs mb-1.5">Teléfono</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+591 70000000" className={inputCls} />
          </div>
          <div>
            <label className="block text-slate-400 text-xs mb-1.5">Dirección</label>
            <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              placeholder="Calle, ciudad..." className={inputCls} />
          </div>
          {error && (
            <div className="bg-red-500/15 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">⚠️ {error}</div>
          )}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-700">
          <button onClick={onClose} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-medium transition">Cancelar</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2">
            {saving ? <><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full inline-block" />Creando...</> : '+ Crear organización'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
type FilterKey = 'all' | SubStatus | 'none';

export default function OrganizationsAdminPage() {
  const { token } = useAuth();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OrgWithSub | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const [orgsRes, subsRes, plansRes] = await Promise.all([
      apiFetch(token, '/organizations'),
      apiFetch(token, '/subscriptions'),
      apiFetch(token, '/plans'),
    ]);
    if (orgsRes.ok)   setOrgs(await orgsRes.json());
    if (subsRes.ok)   setSubs(await subsRes.json());
    if (plansRes.ok)  setPlans(await plansRes.json());
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Join orgs with their latest subscription
  const orgsWithSub: OrgWithSub[] = orgs.map(org => {
    const orgSubs = subs
      .filter(s => s.organization.id === org.id)
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    return { ...org, subscription: orgSubs[0] ?? null };
  });

  const filtered = orgsWithSub.filter(org => {
    const matchSearch = !search || org.name.toLowerCase().includes(search.toLowerCase());
    const status: SubStatus | 'none' = org.subscription?.status ?? 'none';
    const matchFilter = filter === 'all' || status === filter;
    return matchSearch && matchFilter;
  });

  const counts: Record<FilterKey, number> = {
    all:       orgsWithSub.length,
    active:    orgsWithSub.filter(o => o.subscription?.status === 'active').length,
    trial:     orgsWithSub.filter(o => o.subscription?.status === 'trial').length,
    expired:   orgsWithSub.filter(o => o.subscription?.status === 'expired').length,
    cancelled: orgsWithSub.filter(o => o.subscription?.status === 'cancelled').length,
    none:      orgsWithSub.filter(o => !o.subscription).length,
  };

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all',       label: 'Todas' },
    { key: 'active',    label: 'Activas' },
    { key: 'trial',     label: 'Trial' },
    { key: 'expired',   label: 'Expiradas' },
    { key: 'none',      label: 'Sin plan' },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-slate-900">
      {showCreate && token && (
        <CreateOrgModal token={token} onClose={() => setShowCreate(false)} onCreated={load} />
      )}
      {selected && token && (
        <OrgModal
          org={selected} token={token} plans={plans}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); load(); }}
        />
      )}

      {/* Header */}
      <div className="shrink-0 border-b border-slate-700/50 px-6 py-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Organizaciones</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {loading ? 'Cargando...' : `${counts.all} empresa${counts.all !== 1 ? 's' : ''} registrada${counts.all !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar empresa..."
            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
          />
          <button onClick={load}
            className="text-sm text-slate-400 hover:text-white hover:bg-slate-700 px-3 py-2 rounded-xl transition">
            ↻
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition">
            <span className="text-lg leading-none">+</span> Nueva organización
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="shrink-0 border-b border-slate-700/50 px-6 py-3 flex gap-2">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition ${
              filter === f.key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}>
            {f.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
              filter === f.key ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'
            }`}>{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1,2,3].map(i => <div key={i} className="h-40 rounded-xl bg-slate-800 border border-slate-700/50 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-5xl mb-3">🏢</p>
            <p className="text-slate-400 font-medium">No hay organizaciones</p>
            <p className="text-slate-600 text-sm mt-1">
              {filter !== 'all' ? 'Prueba con otro filtro' : 'Las organizaciones aparecerán aquí'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(org => (
              <OrgCard key={org.id} org={org} onClick={() => setSelected(org)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
