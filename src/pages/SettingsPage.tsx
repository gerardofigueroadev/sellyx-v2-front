import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

import API_URL from '../config';
const API = `${API_URL}/api`;
const apiFetch = (token: string, path: string, opts?: RequestInit) =>
  fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface Permission { id: number; name: string; description: string; }
interface Role { id: number; name: string; description: string; permissions: Permission[]; }
interface Branch { id: number; name: string; address: string; phone: string; isActive: boolean; }
interface Organization { id: number; name: string; code: string; taxId: string; email: string; phone: string; address: string; }
interface UserRecord {
  id: number; username: string; name: string; isActive: boolean;
  role: { id: number; name: string };
  branch: { id: number; name: string } | null;
  organization: { id: number; name: string };
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, [onDone]);
  const isError = message.startsWith('⚠️') || message.startsWith('Error');
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-white shadow-lg text-sm font-medium ${isError ? 'bg-red-600' : 'bg-green-600'}`}>
      {isError ? '⚠️' : '✓'} {message.replace('⚠️ ', '')}
    </div>
  );
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-slate-700/50">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3"><div className="h-4 rounded bg-slate-700 animate-pulse w-3/4" /></td>
      ))}
    </tr>
  );
}

function RoleBadge({ name }: { name: string }) {
  const s = name === 'admin' ? 'bg-purple-600/20 text-purple-400' : 'bg-blue-600/20 text-blue-400';
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${s}`}>{name}</span>;
}

function PermBadge({ name }: { name: string }) {
  return <span className="inline-block rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-300">{name}</span>;
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{initials}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
  );
}

// ─── Tab Empresa ──────────────────────────────────────────────────────────────
function TabEmpresa({ token }: { token: string }) {
  const { user } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [form, setForm] = useState({ name: '', taxId: '', email: '', phone: '', address: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!user?.organization?.id) return;
    apiFetch(token, `/organizations/${user.organization.id}`)
      .then(r => r.json()).then((data: Organization) => {
        setOrg(data);
        setForm({ name: data.name ?? '', taxId: data.taxId ?? '', email: data.email ?? '', phone: data.phone ?? '', address: data.address ?? '' });
      }).finally(() => setLoading(false));
  }, [token, user]);

  const handleSave = async () => {
    if (!org) return;
    setSaving(true);
    try {
      const res = await apiFetch(token, `/organizations/${org.id}`, { method: 'PATCH', body: JSON.stringify(form) });
      if (!res.ok) throw new Error('Error al guardar');
      setToast('Datos de empresa guardados');
    } catch { setToast('⚠️ Error al guardar'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="max-w-xl">
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
      <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center text-2xl">🏢</div>
          <div>
            <h3 className="text-white font-bold">{org?.name}</h3>
            <p className="text-slate-500 text-xs">
              Datos de la organización
              {org?.code && <span className="ml-2 font-mono text-blue-400/80">· código: {org.code}</span>}
            </p>
          </div>
        </div>

        <Field label="Nombre de la empresa *">
          <Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Ej: Restaurante El Buen Sabor" />
        </Field>
        <Field label="RUC / NIT / Tax ID">
          <Input value={form.taxId} onChange={v => setForm(f => ({ ...f, taxId: v }))} placeholder="Ej: 20123456789" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <Input value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="contacto@empresa.com" />
          </Field>
          <Field label="Teléfono">
            <Input value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="+591 7xx xxxx" />
          </Field>
        </div>
        <Field label="Dirección">
          <Input value={form.address} onChange={v => setForm(f => ({ ...f, address: v }))} placeholder="Av. Principal 123" />
        </Field>

        <div className="pt-2">
          <button onClick={handleSave} disabled={saving}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition disabled:cursor-not-allowed flex items-center gap-2">
            {saving && <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full inline-block" />}
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab Sucursales ───────────────────────────────────────────────────────────
interface BranchForm { name: string; address: string; phone: string; isActive: boolean; }
const emptyBranch: BranchForm = { name: '', address: '', phone: '', isActive: true };

function TabSucursales({ token }: { token: string }) {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState<BranchForm>(emptyBranch);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch(token, '/branches');
    if (res.ok) setBranches(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyBranch); setFormError(''); setShowModal(true); };
  const openEdit = (b: Branch) => { setEditing(b); setForm({ name: b.name, address: b.address ?? '', phone: b.phone ?? '', isActive: b.isActive }); setFormError(''); setShowModal(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('El nombre es obligatorio'); return; }
    setSaving(true); setFormError('');
    const body = editing
      ? { ...form, name: form.name.trim() }
      : { ...form, name: form.name.trim(), organizationId: user?.organization?.id };
    const res = await apiFetch(token, editing ? `/branches/${editing.id}` : '/branches', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json(); setFormError(d.message ?? 'Error al guardar'); setSaving(false); return; }
    await load(); setShowModal(false); setToast(editing ? 'Sucursal actualizada' : 'Sucursal creada');
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const res = await apiFetch(token, `/branches/${deleteId}`, { method: 'DELETE' });
    if (res.ok) { setBranches(p => p.filter(b => b.id !== deleteId)); setToast('Sucursal eliminada'); }
    else setToast('⚠️ No se pudo eliminar');
    setDeleteId(null);
  };

  return (
    <div>
      {toast && <Toast message={toast} onDone={() => setToast('')} />}

      <div className="flex items-center justify-between mb-4">
        <p className="text-slate-400 text-sm">{branches.length} sucursal(es)</p>
        <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition">
          <span>+</span> Nueva sucursal
        </button>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[1,2].map(i => <div key={i} className="h-32 rounded-xl bg-slate-800 animate-pulse border border-slate-700/50" />)}
        </div>
      ) : branches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-4xl mb-3">🏪</p>
          <p className="text-slate-400 font-medium">No hay sucursales registradas</p>
          <button onClick={openCreate} className="mt-4 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-xl text-sm font-medium transition">Crear primera sucursal</button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {branches.map(b => (
            <div key={b.id} className={`bg-slate-800 border rounded-xl p-4 flex flex-col gap-3 ${b.isActive ? 'border-slate-700/50' : 'border-slate-700/20 opacity-60'}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🏪</span>
                  <div>
                    <p className="text-white font-semibold text-sm">{b.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.isActive ? 'bg-green-500/15 text-green-400' : 'bg-slate-700 text-slate-500'}`}>
                      {b.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>
                </div>
              </div>
              {b.address && <p className="text-slate-500 text-xs">📍 {b.address}</p>}
              {b.phone && <p className="text-slate-500 text-xs">📞 {b.phone}</p>}
              <div className="flex gap-2 pt-1 border-t border-slate-700/40">
                <button onClick={() => openEdit(b)} className="flex-1 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-400 hover:text-blue-400 hover:border-blue-500/40 hover:bg-blue-500/5 transition">✏️ Editar</button>
                <button onClick={() => setDeleteId(b.id)} className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal crear/editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h2 className="text-white font-bold">{editing ? 'Editar sucursal' : 'Nueva sucursal'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <Field label="Nombre *">
                <Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Ej: Sucursal Centro" />
              </Field>
              <Field label="Dirección">
                <Input value={form.address} onChange={v => setForm(f => ({ ...f, address: v }))} placeholder="Av. Principal 123" />
              </Field>
              <Field label="Teléfono">
                <Input value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="+591 7xx xxxx" />
              </Field>
              <div className="flex items-center justify-between bg-slate-700/40 rounded-xl px-4 py-3">
                <div>
                  <p className="text-white text-sm font-medium">Activa</p>
                  <p className="text-slate-500 text-xs">Visible y operativa</p>
                </div>
                <button type="button" onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                  className={`w-12 h-6 rounded-full transition-colors relative ${form.isActive ? 'bg-blue-600' : 'bg-slate-600'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.isActive ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {formError && <div className="bg-red-500/15 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">⚠️ {formError}</div>}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-700">
              <button onClick={() => setShowModal(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-medium transition">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white py-2.5 rounded-xl text-sm font-medium transition disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {saving && <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full inline-block" />}
                {saving ? 'Guardando...' : editing ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar eliminar */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
            <p className="text-4xl mb-3">🗑️</p>
            <h3 className="text-white font-bold text-lg mb-2">¿Eliminar sucursal?</h3>
            <p className="text-slate-500 text-sm mb-6">Los usuarios asignados quedarán sin sucursal.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-medium transition">Cancelar</button>
              <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2.5 rounded-xl text-sm font-medium transition">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Reset Password Modal ─────────────────────────────────────────────────────
function ResetPasswordModal({ user, token, onClose, onDone }: {
  user: UserRecord; token: string; onClose: () => void; onDone: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const handleSave = async () => {
    if (!password.trim()) { setError('Ingresa la nueva contraseña'); return; }
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return; }
    if (password.length < 6) { setError('Mínimo 6 caracteres'); return; }
    setSaving(true); setError('');
    const res = await apiFetch(token, `/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ password }) });
    if (!res.ok) { setError('Error al restablecer contraseña'); setSaving(false); return; }
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <div>
            <h3 className="text-white font-bold">Restablecer contraseña</h3>
            <p className="text-slate-400 text-sm mt-0.5">{user.name} · @{user.username}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Nueva contraseña *</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres" autoFocus
              className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Confirmar contraseña *</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="Repite la contraseña"
              className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {error && <p className="text-red-400 text-sm">⚠️ {error}</p>}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-700">
          <button onClick={onClose} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-medium transition">Cancelar</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2">
            {saving && <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full inline-block" />}
            {saving ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create User Modal ────────────────────────────────────────────────────────
function CreateUserModal({ token, roles, branches, onClose, onCreated }: {
  token: string; roles: Role[]; branches: Branch[]; onClose: () => void; onCreated: () => void;
}) {
  const [form, setForm] = useState({ name: '', username: '', password: '', roleId: roles[0]?.id ?? 0, branchId: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!form.name.trim() || !form.username.trim() || !form.password.trim()) {
      setError('Nombre, usuario y contraseña son obligatorios'); return;
    }
    if (form.password.length < 6) { setError('La contraseña debe tener mínimo 6 caracteres'); return; }
    setSaving(true); setError('');
    const body: any = { name: form.name.trim(), username: form.username.trim(), password: form.password, roleId: form.roleId };
    if (form.branchId) body.branchId = form.branchId;
    const res = await apiFetch(token, '/users', { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) {
      const d = await res.json();
      setError(Array.isArray(d.message) ? d.message[0] : d.message ?? 'Error al crear');
      setSaving(false); return;
    }
    onCreated();
    onClose();
  };

  const inputCls = "w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <h3 className="text-white font-bold">Nuevo usuario</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Nombre *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Juan Pérez" autoFocus className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Usuario *</label>
              <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="juanperez" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Contraseña *</label>
            <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Mínimo 6 caracteres" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Rol *</label>
              <select value={form.roleId} onChange={e => setForm(f => ({ ...f, roleId: +e.target.value }))}
                className={inputCls}>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Sucursal</label>
              <select value={form.branchId} onChange={e => setForm(f => ({ ...f, branchId: +e.target.value }))}
                className={inputCls}>
                <option value={0}>Sin sucursal</option>
                {branches.filter(b => b.isActive).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">⚠️ {error}</p>}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-700">
          <button onClick={onClose} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-medium transition">Cancelar</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2">
            {saving && <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full inline-block" />}
            {saving ? 'Creando...' : '+ Crear usuario'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab Usuarios ─────────────────────────────────────────────────────────────
function TabUsuarios({ token, roles, rolesLoading }: { token: string; roles: Role[]; rolesLoading: boolean }) {
  const { user: currentUser } = useAuth();
  const [users, setUsers]       = useState<UserRecord[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading]   = useState(true);
  const [toast, setToast]       = useState('');
  const [updatingId, setUpdatingId]   = useState<number | null>(null);
  const [showCreate, setShowCreate]   = useState(false);
  const [resettingUser, setResettingUser] = useState<UserRecord | null>(null);
  const [deletingId, setDeletingId]   = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [uRes, bRes] = await Promise.all([
      apiFetch(token, '/users'),
      apiFetch(token, '/branches'),
    ]);
    if (uRes.ok) setUsers(await uRes.json());
    if (bRes.ok) setBranches(await bRes.json());
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const patchUser = async (userId: number, body: object) => {
    setUpdatingId(userId);
    try {
      const res = await apiFetch(token, `/users/${userId}`, { method: 'PATCH', body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updated } : u));
      setToast('Usuario actualizado');
    } catch { setToast('⚠️ Error al actualizar'); }
    finally { setUpdatingId(null); }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const res = await apiFetch(token, `/users/${deletingId}`, { method: 'DELETE' });
    if (res.ok) { setUsers(p => p.filter(u => u.id !== deletingId)); setToast('Usuario eliminado'); }
    else setToast('⚠️ No se pudo eliminar');
    setDeletingId(null);
  };

  const selectCls = "appearance-none rounded-lg border border-slate-600 bg-slate-900 py-1.5 pl-3 pr-8 text-xs text-white focus:border-blue-500 focus:outline-none disabled:opacity-50 cursor-pointer hover:border-slate-500 transition-colors";

  return (
    <div>
      {toast && <Toast message={toast} onDone={() => setToast('')} />}

      {showCreate && !rolesLoading && (
        <CreateUserModal token={token} roles={roles} branches={branches}
          onClose={() => setShowCreate(false)}
          onCreated={() => { load(); setToast('Usuario creado'); }} />
      )}

      {resettingUser && (
        <ResetPasswordModal user={resettingUser} token={token}
          onClose={() => setResettingUser(null)}
          onDone={() => { setResettingUser(null); setToast('Contraseña restablecida'); }} />
      )}

      {deletingId !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
            <p className="text-4xl mb-3">🗑️</p>
            <h3 className="text-white font-bold text-lg mb-2">¿Eliminar usuario?</h3>
            <p className="text-slate-500 text-sm mb-6">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingId(null)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-medium transition">Cancelar</button>
              <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2.5 rounded-xl text-sm font-medium transition">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <p className="text-slate-400 text-sm">{!loading && `${users.length} usuario(s)`}</p>
        <div className="flex gap-2">
          <button onClick={load} className="text-xs text-slate-400 hover:text-white hover:bg-slate-700 px-3 py-1.5 rounded-lg transition">↻</button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-xl text-sm font-medium transition">
            + Nuevo usuario
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-700/50">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900/50">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Nombre</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Usuario</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Rol</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Sucursal</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Estado</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No hay usuarios</td></tr>
            ) : (
              users.map(user => {
                const isSelf  = user.id === currentUser?.id;
                const isAdmin = user.role?.name === 'admin';
                return (
                <tr key={user.id} className="bg-slate-800 hover:bg-slate-700/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={user.name} />
                      <div>
                        <span className="text-sm font-medium text-white">{user.name}</span>
                        {isSelf && <span className="ml-2 text-xs text-blue-400 font-medium">(tú)</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">@{user.username}</td>
                  <td className="px-4 py-3">
                    {rolesLoading ? <div className="h-8 w-28 rounded bg-slate-700 animate-pulse" /> : isSelf ? (
                      <div className="flex items-center gap-2">
                        <RoleBadge name={user.role?.name ?? ''} />
                        <span className="text-xs text-slate-600" title="No puedes cambiar tu propio rol">🔒</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <select value={user.role?.id ?? ''} disabled={updatingId === user.id}
                          onChange={e => patchUser(user.id, { roleId: Number(e.target.value) })}
                          className={selectCls}>
                          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                        {updatingId === user.id && <span className="animate-spin w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full inline-block" />}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      <span className="text-xs text-slate-500 italic flex items-center gap-1">🏢 Toda la empresa</span>
                    ) : (
                      <select value={user.branch?.id ?? ''} disabled={updatingId === user.id}
                        onChange={e => patchUser(user.id, { branchId: e.target.value ? Number(e.target.value) : null })}
                        className={selectCls}>
                        <option value="">Sin sucursal</option>
                        {branches.filter(b => b.isActive).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${user.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {user.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setResettingUser(user)}
                        title="Restablecer contraseña"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition text-sm">
                        🔑
                      </button>
                      {!isSelf && (
                        <button
                          onClick={() => setDeletingId(user.id)}
                          title="Eliminar usuario"
                          className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition text-sm">
                          🗑️
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );})
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab Roles ────────────────────────────────────────────────────────────────
type RoleModalMode = 'edit' | 'create';

function RoleModal({
  role, allPermissions, token, onClose, onSaved, mode,
}: {
  role?: Role; allPermissions: Permission[]; token: string;
  onClose: () => void; onSaved: (r: Role) => void; mode: RoleModalMode;
}) {
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState(new Set(role?.permissions.map(p => p.id) ?? []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggle = (id: number) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleSave = async () => {
    if (!name.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true); setError('');
    const body = { name: name.trim(), description: description.trim(), permissionIds: Array.from(selected) };
    const res = mode === 'create'
      ? await apiFetch(token, '/roles', { method: 'POST', body: JSON.stringify(body) })
      : await apiFetch(token, `/roles/${role!.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    if (!res.ok) {
      const d = await res.json();
      setError(Array.isArray(d.message) ? d.message[0] : d.message ?? 'Error al guardar');
      setSaving(false); return;
    }
    onSaved(await res.json());
  };

  const isSystemRole = role?.name === 'admin' || role?.name === 'superadmin';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-800 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4 shrink-0">
          <div>
            <h3 className="text-lg font-bold text-white">{mode === 'create' ? 'Nuevo rol' : 'Editar rol'}</h3>
            {mode === 'edit' && <p className="text-sm text-slate-400 capitalize">{role?.name}</p>}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Name & description — editable only for custom roles */}
          {!isSystemRole && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Nombre del rol *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Supervisor"
                  className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Descripción</label>
                <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción del rol..."
                  className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </>
          )}

          {/* Permissions */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Permisos</label>
            {isSystemRole ? (
              <p className="text-xs text-slate-500 italic">El rol admin tiene acceso total y no puede ser modificado.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {allPermissions.map(perm => (
                  <label key={perm.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-700 p-3 hover:border-blue-500/50 hover:bg-slate-700/50 transition-colors">
                    <input type="checkbox" checked={selected.has(perm.id)} onChange={() => toggle(perm.id)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-700 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium text-white">{perm.name}</p>
                      {perm.description && <p className="text-xs text-slate-400 mt-0.5">{perm.description}</p>}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-700 px-6 py-4 shrink-0">
          {error ? <p className="text-sm text-red-400">{error}</p> : <p className="text-xs text-slate-500">{selected.size} permiso(s)</p>}
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition">Cancelar</button>
            {!isSystemRole && (
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition">
                {saving && <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full inline-block" />}
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabRoles({
  token, roles, loading, error, allPermissions, permsLoading, onRoleUpdated, onRoleCreated, onRoleDeleted,
}: {
  token: string; roles: Role[]; loading: boolean; error: string | null;
  allPermissions: Permission[]; permsLoading: boolean;
  onRoleUpdated: (r: Role) => void; onRoleCreated: (r: Role) => void; onRoleDeleted: (id: number) => void;
}) {
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [toast, setToast] = useState('');

  const handleDelete = async (id: number) => {
    const res = await apiFetch(token, `/roles/${id}`, { method: 'DELETE' });
    if (res.ok) { onRoleDeleted(id); setToast('Rol eliminado'); }
    else { const d = await res.json(); setToast(`⚠️ ${d.message ?? 'Error al eliminar'}`); }
    setDeletingId(null);
  };

  return (
    <div>
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
      {editingRole && !permsLoading && (
        <RoleModal mode="edit" role={editingRole} allPermissions={allPermissions} token={token}
          onClose={() => setEditingRole(null)}
          onSaved={r => { onRoleUpdated(r); setEditingRole(null); setToast('Rol actualizado'); }} />
      )}
      {showCreate && !permsLoading && (
        <RoleModal mode="create" allPermissions={allPermissions} token={token}
          onClose={() => setShowCreate(false)}
          onSaved={r => { onRoleCreated(r); setShowCreate(false); setToast('Rol creado'); }} />
      )}
      {deletingId !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
            <p className="text-4xl mb-3">🗑️</p>
            <h3 className="text-white font-bold text-lg mb-2">¿Eliminar rol?</h3>
            <p className="text-slate-500 text-sm mb-6">Los usuarios con este rol quedarán sin rol asignado.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingId(null)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-medium transition">Cancelar</button>
              <button onClick={() => handleDelete(deletingId)} className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2.5 rounded-xl text-sm font-medium transition">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <p className="text-slate-400 text-sm">{!loading && `${roles.length} rol(es)`}</p>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition">
          + Nuevo rol
        </button>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1,2].map(i => <div key={i} className="h-40 rounded-xl bg-slate-800 border border-slate-700/50 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {roles.map(role => {
            const isSystem = role.name === 'admin' || role.name === 'superadmin';
            return (
              <div key={role.id} className="flex flex-col rounded-xl border border-slate-700/50 bg-slate-800 p-5">
                <div className="mb-1 flex items-center gap-2">
                  <RoleBadge name={role.name} />
                  <span className="text-base font-semibold capitalize text-white">{role.name}</span>
                </div>
                {role.description && <p className="mb-3 text-sm text-slate-400">{role.description}</p>}
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {role.permissions.length === 0
                    ? <span className="text-xs text-slate-500 italic">Sin permisos</span>
                    : role.permissions.map(p => <PermBadge key={p.id} name={p.name} />)}
                </div>
                <div className="mt-auto flex gap-2">
                  {isSystem ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/50 px-3 py-1.5 text-xs text-slate-500 italic">
                      🔒 Acceso completo — no editable
                    </span>
                  ) : (
                    <>
                      <button onClick={() => setEditingRole(role)}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-blue-500 hover:bg-blue-600/10 hover:text-blue-400 transition-colors">
                        ✏️ Editar
                      </button>
                      <button onClick={() => setDeletingId(role.id)}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition">
                        🗑️
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tab Permisos ─────────────────────────────────────────────────────────────
function TabPermisos({ allPermissions, loading, roles, rolesLoading }: { allPermissions: Permission[]; loading: boolean; roles: Role[]; rolesLoading: boolean }) {
  const getRoles = (permId: number) => roles.filter(r => r.permissions.some(p => p.id === permId));
  return (
    <div>
      <p className="text-slate-400 text-sm mb-4">{!loading && `${allPermissions.length} permiso(s)`}</p>
      <div className="overflow-hidden rounded-xl border border-slate-700/50">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900/50">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Permiso</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Descripción</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Roles</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {loading ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={3} />) :
              allPermissions.map(perm => (
                <tr key={perm.id} className="bg-slate-800 hover:bg-slate-700/50 transition-colors">
                  <td className="px-4 py-3"><PermBadge name={perm.name} /></td>
                  <td className="px-4 py-3 text-sm text-slate-300">{perm.description ?? <span className="text-slate-500 italic">—</span>}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {rolesLoading ? <div className="h-5 w-16 rounded bg-slate-700 animate-pulse" /> :
                        getRoles(perm.id).length === 0 ? <span className="text-xs text-slate-500 italic">Ninguno</span> :
                        getRoles(perm.id).map(r => <RoleBadge key={r.id} name={r.name} />)}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab Flags ────────────────────────────────────────────────────────────────
interface OrgSettings { autoPrintOnShiftClose?: boolean; autoPrintTicketOnOrder?: boolean; allowItemNotes?: boolean; showKitchenStrip?: boolean; allowVoids?: boolean; kitchenWarningMins?: number; kitchenDangerMins?: number; currency?: string; enabledPaymentMethods?: string[]; [key: string]: any; }

function FlagToggle({ label, description, value, onChange, saving }: {
  label: string; description: string; value: boolean;
  onChange: (v: boolean) => void; saving: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-slate-700/40 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium">{label}</p>
        <p className="text-slate-400 text-xs mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        disabled={saving}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
          value ? 'bg-blue-600' : 'bg-slate-600'
        }`}
      >
        <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transform transition-transform duration-200 ${
          value ? 'translate-x-5' : 'translate-x-0.5'
        }`} />
      </button>
    </div>
  );
}

const CURRENCY_PRESETS = ['Bs.', '$', 'S/.', 'COP', 'MXN', 'Q', '€', '£'];

const PAYMENT_OPTIONS: { key: string; emoji: string; label: string }[] = [
  { key: 'cash',     emoji: '💵', label: 'Efectivo' },
  { key: 'card',     emoji: '💳', label: 'Tarjeta' },
  { key: 'transfer', emoji: '📱', label: 'QR / Transferencia' },
];

function TabFlags({ token }: { token: string }) {
  const { refreshOrgSettings } = useAuth();
  const [settings, setSettings] = useState<OrgSettings>({});
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState('');
  const [currencyInput, setCurrencyInput] = useState('Bs.');

  useEffect(() => {
    apiFetch(token, '/organizations/my/settings')
      .then(r => r.json())
      .then((s: OrgSettings) => { setSettings(s); setCurrencyInput(s.currency ?? 'Bs.'); })
      .finally(() => setLoading(false));
  }, [token]);

  const saveSettings = async (patch: Partial<OrgSettings>, label = 'Configuración guardada') => {
    setSaving(true);
    const prev = settings;
    setSettings(s => ({ ...s, ...patch }));
    const res = await apiFetch(token, '/organizations/my/settings', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    if (res.ok) { setToast(label); await refreshOrgSettings(); }
    else { setSettings(prev); setToast('⚠️ Error al guardar'); }
    setSaving(false);
  };

  const toggle = (key: keyof OrgSettings, value: boolean) => saveSettings({ [key]: value });

  const saveCurrency = () => {
    const c = currencyInput.trim();
    if (!c) return;
    saveSettings({ currency: c }, `Moneda cambiada a "${c}"`);
  };

  const togglePaymentMethod = (key: string) => {
    const current: string[] = settings.enabledPaymentMethods ?? ['cash', 'card', 'transfer'];
    const isEnabled = current.includes(key);
    if (isEnabled && current.length === 1) { setToast('⚠️ Debes tener al menos un método activo'); return; }
    const updated = isEnabled ? current.filter(k => k !== key) : [...current, key];
    saveSettings({ enabledPaymentMethods: updated });
  };

  if (loading) return (
    <div className="space-y-4">
      {[1, 2].map(i => <div key={i} className="h-16 rounded-xl bg-slate-800 border border-slate-700/50 animate-pulse" />)}
    </div>
  );

  const saveTimings = (warning: number, danger: number) => {
    if (warning < 1 || danger < 1 || warning >= danger) return;
    saveSettings({ kitchenWarningMins: warning, kitchenDangerMins: danger }, 'Tiempos guardados');
  };

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
      <p className="text-slate-400 text-sm">Activa o desactiva comportamientos automáticos del sistema.</p>

      {/* Moneda + Métodos de pago — side by side en pantallas medianas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Moneda */}
        <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💱</span>
            <div>
              <p className="text-white font-semibold text-sm">Símbolo de moneda</p>
              <p className="text-slate-500 text-xs mt-0.5">Se muestra en precios, totales, tickets y reportes</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {CURRENCY_PRESETS.map(p => (
              <button key={p} onClick={() => setCurrencyInput(p)}
                className={`px-3 py-1.5 rounded-xl text-sm font-mono font-semibold border transition ${
                  currencyInput === p
                    ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                    : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                }`}>
                {p}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={currencyInput}
              onChange={e => setCurrencyInput(e.target.value)}
              placeholder="Ej: Bs., $, S/."
              maxLength={6}
              className="flex-1 bg-slate-700/60 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <button
              onClick={saveCurrency}
              disabled={saving || !currencyInput.trim() || currencyInput.trim() === (settings.currency ?? 'Bs.')}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition disabled:cursor-not-allowed"
            >
              Guardar
            </button>
          </div>
        </div>

        {/* Métodos de pago */}
        <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💳</span>
            <div>
              <p className="text-white font-semibold text-sm">Métodos de pago habilitados</p>
              <p className="text-slate-500 text-xs mt-0.5">Solo los métodos activos aparecen al cobrar en el POS</p>
            </div>
          </div>
          <div className="space-y-2">
            {PAYMENT_OPTIONS.map(({ key, emoji, label }) => {
              const enabled = (settings.enabledPaymentMethods ?? ['cash', 'card', 'transfer']).includes(key);
              const isLast  = (settings.enabledPaymentMethods ?? ['cash', 'card', 'transfer']).length === 1 && enabled;
              return (
                <div key={key} className="flex items-center justify-between py-2 border-t border-slate-700/40 first:border-t-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{emoji}</span>
                    <span className="text-white text-sm">{label}</span>
                    {isLast && <span className="text-amber-400 text-xs">(último activo)</span>}
                  </div>
                  <button
                    onClick={() => togglePaymentMethod(key)}
                    disabled={saving || isLast}
                    className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${enabled ? 'bg-blue-600' : 'bg-slate-600'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      <div className="bg-slate-800 border border-slate-700/50 rounded-2xl px-5">
        <FlagToggle
          label="Permitir indicaciones por producto"
          description="Muestra un botón 📝 en cada ítem del carrito para agregar notas como 'sin queso', 'sin cebolla'. Se imprime en el ticket de cocina."
          value={!!settings.allowItemNotes}
          onChange={v => toggle('allowItemNotes', v)}
          saving={saving}
        />
        <FlagToggle
          label="Imprimir ticket doble al completar una venta"
          description="Al registrar una orden, imprime automáticamente dos tickets: uno para el cliente y otro para cocina."
          value={!!settings.autoPrintTicketOnOrder}
          onChange={v => toggle('autoPrintTicketOnOrder', v)}
          saving={saving}
        />
        <FlagToggle
          label="Imprimir cierre de caja automáticamente"
          description="Al cerrar un turno POS, se abre el diálogo de impresión del reporte de cierre de forma automática."
          value={!!settings.autoPrintOnShiftClose}
          onChange={v => toggle('autoPrintOnShiftClose', v)}
          saving={saving}
        />
        <FlagToggle
          label="Mostrar cola de cocina en el POS"
          description="Muestra la franja de pedidos pendientes en la parte inferior del punto de venta para que el cajero pueda marcarlos como listos."
          value={!!settings.showKitchenStrip}
          onChange={v => toggle('showKitchenStrip', v)}
          saving={saving}
        />
        <FlagToggle
          label="Permitir anulaciones de ventas"
          description="Habilita que usuarios con permiso orders:void puedan anular ventas completadas. La anulación requiere motivo obligatorio y queda registrada con auditoría."
          value={!!settings.allowVoids}
          onChange={v => toggle('allowVoids', v)}
          saving={saving}
        />
      </div>

      {/* Tiempos de alerta en cola de cocina */}
      <KitchenTimingCard
        warningMins={settings.kitchenWarningMins ?? 5}
        dangerMins={settings.kitchenDangerMins ?? 15}
        saving={saving}
        onSave={saveTimings}
      />
    </div>
  );
}

function KitchenTimingCard({ warningMins, dangerMins, saving, onSave }: {
  warningMins: number; dangerMins: number; saving: boolean;
  onSave: (warning: number, danger: number) => void;
}) {
  const [warning, setWarning] = useState(warningMins);
  const [danger,  setDanger]  = useState(dangerMins);

  // Sync cuando llegan los valores reales del servidor
  useEffect(() => { setWarning(warningMins); }, [warningMins]);
  useEffect(() => { setDanger(dangerMins); },  [dangerMins]);

  const warningErr = warning < 1 ? 'Mínimo 1 minuto' : warning >= danger ? 'Debe ser menor que el tiempo rojo' : '';
  const dangerErr  = danger  < 1 ? 'Mínimo 1 minuto' : danger <= warning ? 'Debe ser mayor que el tiempo amarillo' : '';
  const canSave = !warningErr && !dangerErr && (warning !== warningMins || danger !== dangerMins);

  return (
    <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">🍳</span>
        <div>
          <p className="text-white font-semibold text-sm">Tiempos de alerta en cola de cocina</p>
          <p className="text-slate-500 text-xs mt-0.5">Cuántos minutos tarda un pedido en cambiar de color en la franja de cocina</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {/* Verde */}
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
          <span className="text-green-400 text-lg">🟢</span>
          <p className="text-green-400 text-xs font-semibold mt-1">Tranquilo</p>
          <p className="text-slate-400 text-xs mt-0.5">0 — {warning - 1} min</p>
        </div>
        {/* Amarillo */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
          <span className="text-amber-400 text-lg">🟡</span>
          <p className="text-amber-400 text-xs font-semibold mt-1">Apurando</p>
          <p className="text-slate-400 text-xs mt-0.5">{warning} — {danger - 1} min</p>
        </div>
        {/* Rojo */}
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
          <span className="text-red-400 text-lg">🔴</span>
          <p className="text-red-400 text-xs font-semibold mt-1">Urgente</p>
          <p className="text-slate-400 text-xs mt-0.5">{danger}+ min</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-amber-400 mb-1.5">🟡 Cambia a amarillo después de</label>
          <div className="flex items-center gap-2">
            <input
              type="number" min={1} max={danger - 1} value={warning}
              onChange={e => setWarning(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full bg-slate-700/60 border border-slate-600 focus:border-amber-500/60 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
            />
            <span className="text-slate-400 text-sm shrink-0">min</span>
          </div>
          {warningErr && <p className="text-red-400 text-xs mt-1">{warningErr}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-red-400 mb-1.5">🔴 Cambia a rojo después de</label>
          <div className="flex items-center gap-2">
            <input
              type="number" min={warning + 1} value={danger}
              onChange={e => setDanger(Math.max(warning + 1, parseInt(e.target.value) || warning + 1))}
              className="w-full bg-slate-700/60 border border-slate-600 focus:border-red-500/60 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
            />
            <span className="text-slate-400 text-sm shrink-0">min</span>
          </div>
          {dangerErr && <p className="text-red-400 text-xs mt-1">{dangerErr}</p>}
        </div>
      </div>

      <button
        onClick={() => onSave(warning, danger)}
        disabled={!canSave || saving}
        className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-5 py-2 rounded-xl text-sm font-medium transition disabled:cursor-not-allowed flex items-center gap-2"
      >
        {saving && <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full inline-block" />}
        Guardar tiempos
      </button>
    </div>
  );
}

// ─── Tab WhatsApp ─────────────────────────────────────────────────────────────
interface WaConfig { id?: number; phoneNumberId: string; accessToken: string; verifyToken: string; isActive: boolean; }
interface WaKeyword { id: number; keyword: string; response: string; isActive: boolean; }

function TabWhatsapp({ token }: { token: string }) {
  const [config, setConfig] = useState<WaConfig>({ phoneNumberId: '', accessToken: '', verifyToken: '', isActive: true });
  const [keywords, setKeywords] = useState<WaKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [newKw, setNewKw] = useState({ keyword: '', response: '' });
  const [addingKw, setAddingKw] = useState(false);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [cfgRes, kwRes] = await Promise.all([
        apiFetch(token, '/whatsapp/config'),
        apiFetch(token, '/whatsapp/keywords'),
      ]);
      if (cfgRes.ok) { const d = await cfgRes.json(); if (d) setConfig(d); }
      if (kwRes.ok) setKeywords(await kwRes.json());
      setLoading(false);
    })();
  }, [token]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(token, '/whatsapp/config', { method: 'POST', body: JSON.stringify(config) });
      if (!res.ok) throw new Error();
      setToast('Configuración guardada');
    } catch { setToast('⚠️ Error al guardar'); }
    finally { setSaving(false); }
  };

  const addKeyword = async () => {
    if (!newKw.keyword.trim() || !newKw.response.trim()) return;
    setAddingKw(true);
    try {
      const res = await apiFetch(token, '/whatsapp/keywords', { method: 'POST', body: JSON.stringify(newKw) });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setKeywords(p => [...p, created]);
      setNewKw({ keyword: '', response: '' });
      setToast('Palabra clave agregada');
    } catch { setToast('⚠️ Error al agregar'); }
    finally { setAddingKw(false); }
  };

  const deleteKeyword = async (id: number) => {
    const res = await apiFetch(token, `/whatsapp/keywords/${id}`, { method: 'DELETE' });
    if (res.ok) setKeywords(p => p.filter(k => k.id !== id));
    else setToast('⚠️ Error al eliminar');
  };

  const toggleKeyword = async (kw: WaKeyword) => {
    const res = await apiFetch(token, `/whatsapp/keywords/${kw.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !kw.isActive }) });
    if (res.ok) setKeywords(p => p.map(k => k.id === kw.id ? { ...k, isActive: !k.isActive } : k));
  };

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="max-w-2xl space-y-5">
      {toast && <Toast message={toast} onDone={() => setToast('')} />}

      {/* Credenciales */}
      <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-600/20 rounded-xl flex items-center justify-center text-xl">💬</div>
          <div>
            <h3 className="text-white font-bold text-sm">Credenciales WhatsApp</h3>
            <p className="text-slate-500 text-xs">Datos de tu app en Meta for Developers</p>
          </div>
        </div>

        <Field label="Phone Number ID">
          <Input value={config.phoneNumberId} onChange={v => setConfig(c => ({ ...c, phoneNumberId: v }))} placeholder="Ej: 888894154297212" />
        </Field>
        <Field label="Access Token (token permanente)">
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={config.accessToken}
              onChange={e => setConfig(c => ({ ...c, accessToken: e.target.value }))}
              placeholder="EAALbVo..."
              className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500 pr-10"
            />
            <button onClick={() => setShowToken(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs">
              {showToken ? 'Ocultar' : 'Ver'}
            </button>
          </div>
        </Field>
        <Field label="Verify Token (el que inventaste en Meta)">
          <Input value={config.verifyToken} onChange={v => setConfig(c => ({ ...c, verifyToken: v }))} placeholder="Ej: mi_token_secreto_2024" />
        </Field>

        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={config.isActive} onChange={e => setConfig(c => ({ ...c, isActive: e.target.checked }))}
              className="w-4 h-4 rounded accent-green-500" />
            <span className="text-slate-300 text-sm">Bot activo</span>
          </label>
          <button onClick={saveConfig} disabled={saving}
            className="bg-green-600 hover:bg-green-500 disabled:bg-green-900 text-white px-5 py-2 rounded-xl text-sm font-medium transition flex items-center gap-2">
            {saving && <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full inline-block" />}
            {saving ? 'Guardando...' : 'Guardar credenciales'}
          </button>
        </div>

        <div className="bg-slate-700/40 rounded-xl p-3 text-xs text-slate-400 space-y-0.5">
          <p className="font-medium text-slate-300">URL del webhook para Meta:</p>
          <p className="font-mono text-green-400 break-all">https://sellyx-v2-back.onrender.com/api/webhooks/whatsapp</p>
        </div>
      </div>

      {/* Palabras clave */}
      <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-5 space-y-4">
        <h3 className="text-white font-bold text-sm">Respuestas automáticas</h3>

        {keywords.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-4">No hay palabras clave configuradas</p>
        )}

        {keywords.map(kw => (
          <div key={kw.id} className={`flex items-start gap-3 p-3 rounded-xl border ${kw.isActive ? 'border-slate-600 bg-slate-700/30' : 'border-slate-700/30 bg-slate-800/30 opacity-60'}`}>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium">"{kw.keyword}"</p>
              <p className="text-slate-400 text-xs mt-0.5 line-clamp-2">{kw.response}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => toggleKeyword(kw)} className={`text-xs px-2 py-1 rounded-lg transition ${kw.isActive ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30' : 'bg-slate-600/20 text-slate-400 hover:bg-slate-600/30'}`}>
                {kw.isActive ? 'Activa' : 'Inactiva'}
              </button>
              <button onClick={() => deleteKeyword(kw.id)} className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded-lg hover:bg-red-600/10 transition">
                Eliminar
              </button>
            </div>
          </div>
        ))}

        {/* Agregar nueva */}
        <div className="border border-dashed border-slate-600 rounded-xl p-3 space-y-2">
          <p className="text-slate-400 text-xs font-medium">Nueva palabra clave</p>
          <div className="grid grid-cols-2 gap-2">
            <input value={newKw.keyword} onChange={e => setNewKw(p => ({ ...p, keyword: e.target.value }))}
              placeholder='Ej: menu, horario, precio...'
              className="bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
            <input value={newKw.response} onChange={e => setNewKw(p => ({ ...p, response: e.target.value }))}
              placeholder='Respuesta automática...'
              className="bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-green-500" />
          </div>
          <button onClick={addKeyword} disabled={addingKw || !newKw.keyword.trim() || !newKw.response.trim()}
            className="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg text-xs font-medium transition">
            + Agregar respuesta
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
type TabId = 'empresa' | 'sucursales' | 'usuarios' | 'roles' | 'permisos' | 'flags' | 'whatsapp';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'empresa',    label: 'Empresa',    icon: '🏢' },
  { id: 'sucursales', label: 'Sucursales', icon: '🏪' },
  { id: 'usuarios',   label: 'Usuarios',   icon: '👤' },
  { id: 'roles',      label: 'Roles',      icon: '🔑' },
  { id: 'permisos',   label: 'Permisos',   icon: '🛡️' },
  { id: 'flags',      label: 'Comportamiento', icon: '⚙️' },
  { id: 'whatsapp',   label: 'WhatsApp',       icon: '💬' },
];

export default function SettingsPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('empresa');
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [permsLoading, setPermsLoading] = useState(true);

  const loadRoles = useCallback(async () => {
    if (!token) return;
    setRolesLoading(true); setRolesError(null);
    const res = await apiFetch(token, '/roles');
    if (res.ok) setRoles(await res.json());
    else setRolesError('No se pudieron cargar los roles');
    setRolesLoading(false);
  }, [token]);

  const loadPermissions = useCallback(async () => {
    if (!token) return;
    setPermsLoading(true);
    const res = await apiFetch(token, '/permissions');
    if (res.ok) setAllPermissions(await res.json());
    else {
      const map = new Map<number, Permission>();
      roles.forEach(r => r.permissions.forEach(p => map.set(p.id, p)));
      setAllPermissions(Array.from(map.values()));
    }
    setPermsLoading(false);
  }, [token, roles]);

  useEffect(() => { loadRoles(); }, [loadRoles]);
  useEffect(() => { if (!rolesLoading) loadPermissions(); }, [rolesLoading, loadPermissions]);

  if (!token) return <div className="flex h-full items-center justify-center"><p className="text-slate-400">No autenticado</p></div>;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-slate-900">
      <div className="border-b border-slate-700/50 px-6 py-5">
        <h1 className="text-xl font-bold text-white">Configuración</h1>
        <p className="mt-0.5 text-sm text-slate-400">Administra tu empresa, sucursales y usuarios</p>
      </div>

      <div className="border-b border-slate-700/50 px-6">
        <nav className="flex gap-1 py-3 overflow-x-auto">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}>
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {activeTab === 'empresa'    && <TabEmpresa token={token} />}
        {activeTab === 'sucursales' && <TabSucursales token={token} />}
        {activeTab === 'usuarios'   && <TabUsuarios token={token} roles={roles} rolesLoading={rolesLoading} />}
        {activeTab === 'roles'      && <TabRoles token={token} roles={roles} loading={rolesLoading} error={rolesError} allPermissions={allPermissions} permsLoading={permsLoading}
          onRoleUpdated={r => setRoles(p => p.map(x => x.id === r.id ? r : x))}
          onRoleCreated={r => setRoles(p => [...p, r])}
          onRoleDeleted={id => setRoles(p => p.filter(x => x.id !== id))} />}
        {activeTab === 'permisos'   && <TabPermisos allPermissions={allPermissions} loading={permsLoading} roles={roles} rolesLoading={rolesLoading} />}
        {activeTab === 'flags'      && <TabFlags token={token} />}
        {activeTab === 'whatsapp'   && <TabWhatsapp token={token} />}
      </div>
    </div>
  );
}
