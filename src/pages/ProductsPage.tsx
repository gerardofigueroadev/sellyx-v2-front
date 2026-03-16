import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const API = 'http://localhost:3000/api';

interface Category { id: number; name: string; emoji: string; color: string; }
interface Branch { id: number; name: string; }

interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  emoji: string;
  isAvailable: boolean;
  stock: number;
  category: Category;
  branch: Branch | null;
}

interface FormData {
  name: string;
  description: string;
  price: string;
  emoji: string;
  isAvailable: boolean;
  categoryId: string;
}

const emptyForm: FormData = { name: '', description: '', price: '', emoji: '🍽️', isAvailable: true, categoryId: '' };

const EMOJIS = ['🍔','🍕','🌭','🌮','🥪','🍗','🍖','🥩','🍜','🍝','🍛','🥗','🥙','🌯','🥤','🧃','☕','🍵','🧋','💧','🍺','🥛','🍟','🧀','🥚','🍳','🥞','🧇','🍰','🎂','🍩','🍪','🍫','🍦','🧁','🍮','🫙','🥫','🧂'];

// ─── Copy modal ───────────────────────────────────────────────────────────────
function CopyModal({ token, branches, currentBranchId, onClose, onDone }: {
  token: string; branches: Branch[]; currentBranchId: number | null;
  onClose: () => void; onDone: () => void;
}) {
  const [sourceId, setSourceId] = useState<string>(String(currentBranchId ?? branches[0]?.id ?? ''));
  const [targetId, setTargetId] = useState<string>(
    String(branches.find(b => b.id !== (currentBranchId ?? branches[0]?.id))?.id ?? '')
  );
  const [copying, setCopying] = useState(false);
  const [result, setResult] = useState<{ copied: number; skipped: number } | null>(null);
  const [error, setError] = useState('');

  const handleCopy = async () => {
    if (!sourceId || !targetId || sourceId === targetId) {
      setError('Selecciona sucursales distintas'); return;
    }
    setCopying(true); setError('');
    try {
      const res = await fetch(`${API}/products/copy-to-branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sourceBranchId: +sourceId, targetBranchId: +targetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Error al copiar');
      setResult(data);
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCopying(false);
    }
  };

  const sourceName = branches.find(b => b.id === +sourceId)?.name ?? '—';
  const targetName = branches.find(b => b.id === +targetId)?.name ?? '—';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-xl">📋</span>
            <h2 className="text-white font-bold">Copiar productos</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl transition">✕</button>
        </div>

        {result ? (
          /* ── Result screen ── */
          <div className="p-6 text-center">
            <div className="w-16 h-16 bg-green-500/15 border border-green-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✅</span>
            </div>
            <p className="text-white font-bold text-lg mb-1">¡Listo!</p>
            <p className="text-slate-400 text-sm mb-4">
              Se copiaron los productos de <strong className="text-white">{sourceName}</strong> a <strong className="text-white">{targetName}</strong>.
            </p>
            <div className="flex gap-3 mb-6">
              <div className="flex-1 bg-slate-700/50 rounded-xl py-3">
                <p className="text-green-400 font-black text-2xl">{result.copied}</p>
                <p className="text-slate-400 text-xs mt-0.5">copiados</p>
              </div>
              {result.skipped > 0 && (
                <div className="flex-1 bg-slate-700/50 rounded-xl py-3">
                  <p className="text-amber-400 font-black text-2xl">{result.skipped}</p>
                  <p className="text-slate-400 text-xs mt-0.5">ya existían</p>
                </div>
              )}
            </div>
            <button onClick={onClose} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl font-semibold transition">
              Cerrar
            </button>
          </div>
        ) : (
          /* ── Form screen ── */
          <div className="p-6 space-y-5">
            <p className="text-slate-400 text-sm">
              Copia todos los productos de una sucursal a otra. Los productos que ya existen en el destino se omiten.
            </p>

            {/* Source */}
            <div>
              <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Desde</label>
              <select
                value={sourceId}
                onChange={e => setSourceId(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            {/* Arrow */}
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <div className="h-px w-12 bg-slate-600" />
                <span className="text-xl">⬇️</span>
                <div className="h-px w-12 bg-slate-600" />
              </div>
            </div>

            {/* Target */}
            <div>
              <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Hacia</label>
              <select
                value={targetId}
                onChange={e => setTargetId(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl">⚠️ {error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-medium transition">
                Cancelar
              </button>
              <button
                onClick={handleCopy}
                disabled={copying || !sourceId || !targetId}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
              >
                {copying ? <><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full inline-block" />Copiando...</> : '📋 Copiar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ProductsPage() {
  const { token, branches, activeBranchId } = useAuth();
  const isAdmin = branches.length > 1;

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const [showCopyModal, setShowCopyModal] = useState(false);

  // Selected branch for filtering (admin can switch, others fixed to their branch)
  const [filterBranchId, setFilterBranchId] = useState<number | null>(activeBranchId);

  // Sync with activeBranchId; admin without a fixed branch defaults to the first available branch
  useEffect(() => {
    setFilterBranchId(activeBranchId ?? (isAdmin && branches.length > 0 ? branches[0].id : null));
  }, [activeBranchId, isAdmin, branches]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const fetchAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = filterBranchId ? `?branchId=${filterBranchId}` : '';
      const [pRes, cRes] = await Promise.all([
        fetch(`${API}/products${qs}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/categories`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (!pRes.ok || !cRes.ok) throw new Error('Error al cargar datos');
      setProducts(await pRes.json());
      setCategories(await cRes.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, filterBranchId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, categoryId: categories[0]?.id?.toString() ?? '' });
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ name: p.name, description: p.description ?? '', price: p.price.toString(), emoji: p.emoji ?? '🍽️', isAvailable: p.isAvailable, categoryId: p.category?.id?.toString() ?? '' });
    setFormError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('El nombre es obligatorio'); return; }
    if (!form.price || isNaN(Number(form.price)) || Number(form.price) <= 0) { setFormError('El precio debe ser mayor a 0'); return; }
    if (!form.categoryId) { setFormError('Selecciona una categoría'); return; }

    setSaving(true); setFormError('');
    const body: any = {
      name: form.name.trim(), description: form.description.trim(),
      price: parseFloat(form.price), emoji: form.emoji,
      isAvailable: form.isAvailable, categoryId: parseInt(form.categoryId),
    };
    // Assign to current branch on create or when editing a global product
    if (filterBranchId && (!editing || editing.branch === null)) body.branchId = filterBranchId;

    try {
      const url = editing ? `${API}/products/${editing.id}` : `${API}/products`;
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message ?? 'Error al guardar'); }
      await fetchAll();
      setShowModal(false);
      showToast(editing ? 'Producto actualizado' : 'Producto creado');
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailable = async (p: Product) => {
    try {
      await fetch(`${API}/products/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isAvailable: !p.isAvailable }),
      });
      setProducts(prev => prev.map(x => x.id === p.id ? { ...x, isAvailable: !x.isAvailable } : x));
      showToast(!p.isAvailable ? 'Producto habilitado' : 'Producto deshabilitado');
    } catch { showToast('Error al actualizar'); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await fetch(`${API}/products/${deleteId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setProducts(prev => prev.filter(p => p.id !== deleteId));
      setDeleteId(null);
      showToast('Producto eliminado');
    } catch { showToast('Error al eliminar'); }
  };

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-slate-800">
      <div className="text-center">
        <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-slate-400">Cargando productos...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex-1 flex items-center justify-center bg-slate-800">
      <p className="text-red-400">⚠️ {error}</p>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col bg-slate-800 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 shrink-0 gap-4">
        <div>
          <h1 className="text-white text-xl font-bold">Productos</h1>
          <p className="text-slate-500 text-sm">{products.length} productos{filterBranchId ? ` en ${branches.find(b => b.id === filterBranchId)?.name ?? 'sucursal'}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Copy button — only when admin with multiple branches */}
          {isAdmin && (
            <button
              onClick={() => setShowCopyModal(true)}
              className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white px-4 py-2 rounded-xl text-sm font-medium transition"
            >
              <span>📋</span> Copiar a sucursal
            </button>
          )}
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition"
          >
            <span className="text-lg">+</span> Nuevo producto
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-700/50 shrink-0">

        {/* Branch dropdown — only admin with multiple branches */}
        {isAdmin && (
          <select
            value={filterBranchId ?? ''}
            onChange={e => setFilterBranchId(e.target.value ? +e.target.value : null)}
            className="bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 shrink-0"
          >
            <option value="">🌐 Global</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>📍 {b.name}</option>
            ))}
          </select>
        )}

        {/* Search */}
        <div className="relative shrink-0">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="bg-slate-700/50 border border-slate-600 rounded-xl pl-9 pr-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-5xl mb-3">📦</p>
            <p className="text-slate-400 text-lg font-medium">No hay productos</p>
            <p className="text-slate-600 text-sm mt-1">
              {isAdmin ? 'Crea uno con "Nuevo producto" o usa "Copiar a sucursal"' : 'Crea el primero con el botón "Nuevo producto"'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(p => (
              <div
                key={p.id}
                className={`bg-slate-900/60 border rounded-2xl p-4 flex flex-col gap-3 transition group
                  ${p.isAvailable ? 'border-slate-700/50 hover:border-slate-600' : 'border-slate-700/20 opacity-60'}`}
              >
                {/* Top row */}
                <div className="flex items-start justify-between">
                  <div className="w-14 h-14 bg-slate-700/50 rounded-xl flex items-center justify-center text-3xl shrink-0">
                    {p.emoji || '🍽️'}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => toggleAvailable(p)} title={p.isAvailable ? 'Deshabilitar' : 'Habilitar'}
                      className={`p-1.5 rounded-lg text-sm transition ${p.isAvailable ? 'text-green-400 hover:bg-green-500/10' : 'text-slate-500 hover:bg-slate-700'}`}>
                      {p.isAvailable ? '✅' : '⏸️'}
                    </button>
                    <button onClick={() => openEdit(p)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition text-sm">✏️</button>
                    <button onClick={() => setDeleteId(p.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition text-sm">🗑️</button>
                  </div>
                </div>

                {/* Info */}
                <div>
                  <h3 className="text-white font-semibold text-sm leading-tight">{p.name}</h3>
                  {p.description && (
                    <p className="text-slate-500 text-xs mt-1 line-clamp-2 leading-relaxed">{p.description}</p>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-700/50">
                  <span className="text-blue-400 font-bold text-base">Bs. {Number(p.price).toFixed(2)}</span>
                  <div className="flex items-center gap-1.5">
                    {/* Branch badge — only shown when admin with multiple branches */}
                    {isAdmin && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-700 text-slate-400">
                        {p.branch ? `📍 ${p.branch.name}` : '🌐 Global'}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.isAvailable ? 'bg-green-500/15 text-green-400' : 'bg-slate-700 text-slate-500'}`}>
                      {p.isAvailable ? 'Disponible' : 'No disponible'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Copy modal ── */}
      {showCopyModal && token && (
        <CopyModal
          token={token}
          branches={branches}
          currentBranchId={filterBranchId}
          onClose={() => setShowCopyModal(false)}
          onDone={fetchAll}
        />
      )}

      {/* ── Modal crear / editar ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h2 className="text-white font-bold text-lg">{editing ? 'Editar producto' : 'Nuevo producto'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white text-xl transition">✕</button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">

              {/* Emoji picker */}
              <div>
                <label className="block text-slate-400 text-sm mb-2">Ícono</label>
                <div className="relative">
                  <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="w-16 h-16 bg-slate-700 rounded-xl text-3xl flex items-center justify-center hover:bg-slate-600 transition border border-slate-600">
                    {form.emoji}
                  </button>
                  {showEmojiPicker && (
                    <div className="absolute top-20 left-0 bg-slate-700 border border-slate-600 rounded-xl p-3 z-10 grid grid-cols-8 gap-1 w-72 shadow-xl">
                      {EMOJIS.map(e => (
                        <button key={e} onClick={() => { setForm(f => ({ ...f, emoji: e })); setShowEmojiPicker(false); }}
                          className="text-xl hover:bg-slate-600 rounded-lg p-1 transition">{e}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-slate-400 text-sm mb-1.5">Nombre *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Hamburguesa Clásica"
                  className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="block text-slate-400 text-sm mb-1.5">Precio (Bs.) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">Bs.</span>
                  <input type="number" min="0" step="0.50" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    placeholder="0.00"
                    className="w-full bg-slate-700/60 border border-slate-600 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 text-sm mb-1.5">Categoría *</label>
                <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
                  className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Seleccionar categoría...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 text-sm mb-1.5">Ingredientes / Descripción</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Ej: Pan brioche, carne 200g, lechuga, tomate, queso cheddar, salsa especial..." rows={3}
                  className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>

              <div className="flex items-center justify-between bg-slate-700/40 rounded-xl px-4 py-3">
                <div>
                  <p className="text-white text-sm font-medium">Disponible</p>
                  <p className="text-slate-500 text-xs">El producto aparece en el menú de ventas</p>
                </div>
                <button type="button" onClick={() => setForm(f => ({ ...f, isAvailable: !f.isAvailable }))}
                  className={`w-12 h-6 rounded-full transition-colors relative ${form.isAvailable ? 'bg-blue-600' : 'bg-slate-600'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.isAvailable ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Note when editing a global product with a branch selected */}
              {editing && editing.branch === null && filterBranchId && (
                <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3 text-amber-400 text-xs">
                  ℹ️ Este producto es global. Al guardar quedará asignado únicamente a <strong>{branches.find(b => b.id === filterBranchId)?.name}</strong>.
                </div>
              )}

              {formError && (
                <div className="bg-red-500/15 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">⚠️ {formError}</div>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-700">
              <button onClick={() => setShowModal(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-medium transition">Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white py-2.5 rounded-xl text-sm font-medium transition disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {saving ? <><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full inline-block" />Guardando...</> : (editing ? 'Guardar cambios' : 'Crear producto')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal confirmar eliminar ── */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <p className="text-4xl text-center mb-3">🗑️</p>
            <h3 className="text-white font-bold text-lg text-center mb-2">¿Eliminar producto?</h3>
            <p className="text-slate-400 text-sm text-center mb-6">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-medium transition">Cancelar</button>
              <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2.5 rounded-xl text-sm font-medium transition">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50 animate-pulse">
          ✓ {toast}
        </div>
      )}
    </div>
  );
}
