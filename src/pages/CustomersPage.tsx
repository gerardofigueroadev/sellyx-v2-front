import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import CustomerHistoryModal from '../components/CustomerHistoryModal';

import API_URL from '../config';
const API = `${API_URL}/api`;
const apiFetch = (token: string, path: string, opts?: RequestInit) =>
  fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });

interface Customer {
  id: number;
  name: string;
  phone: string;
  email?: string;
  createdAt: string;
}

export default function CustomersPage() {
  const { token } = useAuth();
  interface EditingCustomer { id: number; name: string; email: string; }

  const [customers,   setCustomers]   = useState<Customer[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [selected,    setSelected]    = useState<number | null>(null);
  const [editing,     setEditing]     = useState<EditingCustomer | null>(null);
  const [saving,      setSaving]      = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await apiFetch(token, '/customers');
    if (res.ok) setCustomers(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
  });

  const displayName = (c: Customer) =>
    c.name && c.name !== c.phone ? c.name : '—';

  const handleSaveEdit = async () => {
    if (!token || !editing || !editing.name.trim()) return;
    setSaving(true);
    const body: Record<string, string> = { name: editing.name.trim() };
    if (editing.email.trim()) body.email = editing.email.trim();
    const res = await apiFetch(token, `/customers/${editing.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const updated = await res.json();
      setCustomers(prev => prev.map(c => c.id === updated.id ? { ...c, name: updated.name, email: updated.email } : c));
      setEditing(null);
    }
    setSaving(false);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-slate-800">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-700/50 bg-slate-900 flex items-center justify-between gap-4 flex-wrap shrink-0">
        <div>
          <h1 className="text-white font-black text-xl">Clientes</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {loading ? '...' : `${customers.length} cliente${customers.length !== 1 ? 's' : ''} registrado${customers.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o teléfono..."
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-lg leading-none"
            >×</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-slate-900 border border-slate-700/50 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500">
            <p className="text-5xl mb-4">👥</p>
            <p className="text-lg font-semibold text-slate-400">
              {search ? 'Sin resultados' : 'Aún no hay clientes'}
            </p>
            <p className="text-sm mt-1">
              {search ? 'Prueba con otro nombre o teléfono' : 'Los clientes aparecen al vincularlos desde el POS'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 text-xs uppercase tracking-wider">
                    <th className="pb-3 font-semibold">Cliente</th>
                    <th className="pb-3 font-semibold">Teléfono</th>
                    <th className="pb-3 font-semibold">Email</th>
                    <th className="pb-3 font-semibold">Registrado</th>
                    <th className="pb-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40">
                  {filtered.map(c => (
                    <tr key={c.id} className="group hover:bg-slate-700/20 transition">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                            <span className="text-blue-400 font-bold text-xs">
                              {(c.name && c.name !== c.phone ? c.name : c.phone)?.[0]?.toUpperCase() ?? '?'}
                            </span>
                          </div>
                          <span className="text-white font-medium">{displayName(c)}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-slate-300 font-mono">{c.phone || '—'}</td>
                      <td className="py-3 pr-4 text-slate-400">{c.email || '—'}</td>
                      <td className="py-3 pr-4 text-slate-500">
                        {new Date(c.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition">
                          <button
                            onClick={() => setEditing({ id: c.id, name: c.name && c.name !== c.phone ? c.name : '', email: c.email ?? '' })}
                            className="text-xs text-slate-400 hover:text-white font-medium bg-slate-700/60 border border-slate-600 px-3 py-1.5 rounded-lg"
                          >
                            ✏️ Editar
                          </button>
                          <button
                            onClick={() => setSelected(c.id)}
                            className="text-xs text-blue-400 hover:text-blue-300 font-medium bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-lg"
                          >
                            Ver pedidos →
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {filtered.map(c => (
                <div key={c.id} className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                    <span className="text-blue-400 font-bold text-sm">
                      {(c.name && c.name !== c.phone ? c.name : c.phone)?.[0]?.toUpperCase() ?? '?'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{displayName(c)}</p>
                    <p className="text-slate-400 text-xs font-mono">{c.phone || '—'}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setEditing({ id: c.id, name: c.name && c.name !== c.phone ? c.name : '', email: c.email ?? '' })}
                      className="text-xs text-slate-400 bg-slate-700/60 border border-slate-600 px-2.5 py-1.5 rounded-lg"
                    >✏️</button>
                    <button
                      onClick={() => setSelected(c.id)}
                      className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1.5 rounded-lg"
                    >›</button>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-slate-600 text-xs mt-4 text-center">
              {filtered.length} de {customers.length} cliente{customers.length !== 1 ? 's' : ''}
              {search && ` · filtrado por "${search}"`}
            </p>
          </>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setEditing(null)}>
          <div className="bg-slate-800 border border-slate-700/50 rounded-2xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold text-base">Editar cliente</h2>
              <button onClick={() => setEditing(null)} className="text-slate-500 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-slate-400 text-xs font-medium mb-1 block">Nombre completo</label>
                <input
                  autoFocus
                  value={editing.name}
                  onChange={e => setEditing(p => p ? { ...p, name: e.target.value } : p)}
                  placeholder="Ej: Juan García"
                  className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs font-medium mb-1 block">Correo electrónico</label>
                <input
                  type="email"
                  value={editing.email}
                  onChange={e => setEditing(p => p ? { ...p, email: e.target.value } : p)}
                  placeholder="Ej: juan@correo.com"
                  className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={handleSaveEdit}
                disabled={saving || !editing.name.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl text-sm transition"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button onClick={() => setEditing(null)} className="px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-sm transition">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer history modal */}
      {selected !== null && (
        <CustomerHistoryModal
          customerId={selected}
          onClose={() => setSelected(null)}
          onUpdated={updated => {
            setCustomers(prev => prev.map(c => c.id === updated.id ? { ...c, name: updated.name } : c));
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
