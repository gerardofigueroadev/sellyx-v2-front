import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

import API_URL from '../config';
const API = `${API_URL}/api`;

interface Category { id: number; name: string; emoji: string; color: string; }

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
const COLOR_HEX: Record<string, string> = {
  orange: '#f97316', blue: '#3b82f6', purple: '#a855f7',
  green:  '#22c55e', red:  '#ef4444', yellow: '#eab308',
  pink:   '#ec4899', cyan: '#06b6d4',
};
const getGradient = (color: string) => GRADIENTS[color] ?? GRADIENTS.blue;
const getAccent = (color?: string) => COLOR_HEX[color ?? 'blue'] ?? COLOR_HEX.blue;
interface Branch { id: number; name: string; }

interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  emoji: string;
  isAvailable: boolean;
  stock: number;
  sortOrder?: number;
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

// ─── Product Row (compact card en columna) ────────────────────────────────────
function ProductRow({ product, accent, isAdmin, currency, isFirst, isLast, onMoveUp, onMoveDown, onToggle, onEdit, onDelete }: {
  product: Product;
  accent?: string;
  isAdmin: boolean;
  currency: string;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: '5px 9px 5px 11px',
        borderRadius: 9,
        border: `1.5px solid ${accent ? `${accent}40` : 'rgba(71,85,105,0.4)'}`,
        background: accent ? `${accent}0d` : 'transparent',
        opacity: product.isAvailable ? 1 : 0.5,
        overflow: 'hidden',
      }}
      className="group"
    >
      {/* Barra lateral de categoría */}
      {accent && (
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
          borderRadius: '9px 0 0 9px',
          background: accent,
        }} />
      )}

      {/* Emoji */}
      <span style={{ fontSize: 17, lineHeight: 1, flexShrink: 0, width: 20, textAlign: 'center' }}>
        {product.emoji || '🍽️'}
      </span>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2, color: 'white', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {product.name}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span style={{ fontSize: 12, fontWeight: 700, color: '#60a5fa' }}>
            {currency} {Number(product.price).toFixed(2)}
          </span>
          {isAdmin && (
            <span className="text-[9px] px-1 py-0.5 rounded font-medium bg-slate-700/70 text-slate-400 truncate">
              {product.branch ? `📍${product.branch.name}` : '🌐'}
            </span>
          )}
        </div>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-0.5 shrink-0 opacity-60 group-hover:opacity-100 transition">
        {/* Flechas de orden */}
        <div className="flex flex-col">
          <button onClick={onMoveUp} disabled={isFirst} title="Subir"
            className="px-1 leading-none text-slate-500 hover:text-white hover:bg-slate-700/50 rounded disabled:opacity-20 disabled:cursor-not-allowed transition text-[10px]">▲</button>
          <button onClick={onMoveDown} disabled={isLast} title="Bajar"
            className="px-1 leading-none text-slate-500 hover:text-white hover:bg-slate-700/50 rounded disabled:opacity-20 disabled:cursor-not-allowed transition text-[10px]">▼</button>
        </div>
        <button onClick={onToggle} title={product.isAvailable ? 'Deshabilitar' : 'Habilitar'}
          className={`p-1 rounded text-xs transition ${product.isAvailable ? 'hover:bg-green-500/15' : 'hover:bg-slate-700'}`}>
          {product.isAvailable ? '✅' : '⏸️'}
        </button>
        <button onClick={onEdit} title="Editar"
          className="p-1 rounded text-slate-400 hover:text-blue-400 hover:bg-blue-500/15 transition text-xs">✏️</button>
        <button onClick={onDelete} title="Eliminar"
          className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/15 transition text-xs">🗑️</button>
      </div>
    </div>
  );
}

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
  const toast = useToast();

  const handleCopy = async () => {
    if (!sourceId || !targetId || sourceId === targetId) {
      toast.warning('Selecciona sucursales distintas'); return;
    }
    setCopying(true);
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
      toast.error(e.message);
    } finally {
      setCopying(false);
    }
  };

  const sourceName = branches.find(b => b.id === +sourceId)?.name ?? '—';
  const targetName = branches.find(b => b.id === +targetId)?.name ?? '—';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
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
          <div className="p-6 space-y-5 overflow-y-auto flex-1">
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
  const { token, branches, activeBranchId, currency } = useAuth();
  const isAdmin = branches.length > 1;

  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showCopyModal, setShowCopyModal] = useState(false);

  // Selected branch for filtering (admin can switch, others fixed to their branch)
  const [filterBranchId, setFilterBranchId] = useState<number | null>(activeBranchId);
  const [filterCategoryId, setFilterCategoryId] = useState<number | null>(null);

  // Sync with activeBranchId; admin without a fixed branch defaults to the first available branch
  useEffect(() => {
    setFilterBranchId(activeBranchId ?? (isAdmin && branches.length > 0 ? branches[0].id : null));
  }, [activeBranchId, isAdmin, branches]);

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
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, filterBranchId, toast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, categoryId: categories[0]?.id?.toString() ?? '' });
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ name: p.name, description: p.description ?? '', price: p.price.toString(), emoji: p.emoji ?? '🍽️', isAvailable: p.isAvailable, categoryId: p.category?.id?.toString() ?? '' });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.warning('El nombre es obligatorio'); return; }
    if (!form.price || isNaN(Number(form.price)) || Number(form.price) <= 0) { toast.warning('El precio debe ser mayor a 0'); return; }
    if (!form.categoryId) { toast.warning('Selecciona una categoría'); return; }

    setSaving(true);
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
      toast.success(editing ? 'Producto actualizado' : 'Producto creado');
    } catch (e: any) {
      toast.error(e.message);
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
      toast.success(!p.isAvailable ? 'Producto habilitado' : 'Producto deshabilitado');
    } catch { toast.error('Error al actualizar'); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await fetch(`${API}/products/${deleteId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setProducts(prev => prev.filter(p => p.id !== deleteId));
      setDeleteId(null);
      toast.success('Producto eliminado');
    } catch { toast.error('Error al eliminar'); }
  };

  /** Mueve un producto arriba/abajo dentro de su categoría. */
  const moveProduct = async (productId: number, direction: 'up' | 'down') => {
    const target = products.find(p => p.id === productId);
    if (!target) return;
    // Productos en la misma categoría, ordenados por sortOrder actual
    const inCategory = products
      .filter(p => p.category?.id === target.category?.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
    const idx = inCategory.findIndex(p => p.id === productId);
    const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (otherIdx < 0 || otherIdx >= inCategory.length) return;

    // Swap en el array local
    const newOrder = [...inCategory];
    [newOrder[idx], newOrder[otherIdx]] = [newOrder[otherIdx], newOrder[idx]];
    // Reasignar sortOrder secuencial (1, 2, 3, ...) a toda la categoría
    const items = newOrder.map((p, i) => ({ id: p.id, sortOrder: i + 1 }));
    const sortMap = new Map(items.map(it => [it.id, it.sortOrder]));

    // Optimistic update
    setProducts(prev => prev.map(p => sortMap.has(p.id) ? { ...p, sortOrder: sortMap.get(p.id)! } : p));

    try {
      const res = await fetch(`${API}/products/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error('Error al reordenar');
      fetchAll(); // revertir desde el server
    }
  };

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) &&
    (filterCategoryId === null || p.category?.id === filterCategoryId)
  );

  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-slate-800">
      <div className="text-center">
        <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-slate-400">Cargando productos...</p>
      </div>
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
      <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-700/50 shrink-0 flex-wrap">

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

        {/* Category pills */}
        {categories.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0">
            <button
              onClick={() => setFilterCategoryId(null)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                filterCategoryId === null
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:text-white'
              }`}
            >
              Todas
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setFilterCategoryId(filterCategoryId === cat.id ? null : cat.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition whitespace-nowrap ${
                  filterCategoryId === cat.id
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:text-white'
                }`}
              >
                <span>{cat.emoji || '🍽️'}</span>
                {cat.name}
              </button>
            ))}
          </div>
        )}
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
          (() => {
            const visibleCats = filterCategoryId === null
              ? categories.filter(c => filtered.some(p => p.category?.id === c.id))
              : categories.filter(c => c.id === filterCategoryId);
            const uncategorized = filtered.filter(p => !p.category);

            return (
              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${visibleCats.length + (uncategorized.length > 0 ? 1 : 0)}, minmax(180px, 1fr))`,
                gap: 12,
                alignItems: 'start',
              }}>
                {visibleCats.map(cat => {
                  const catProducts = filtered
                    .filter(p => p.category?.id === cat.id)
                    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
                  return (
                    <div key={cat.id} className="flex flex-col gap-1.5">
                      {/* Header de categoría */}
                      <div className={`${getGradient(cat.color)} flex items-center gap-2 px-3 py-2 rounded-xl shadow-sm`}>
                        <span style={{ fontSize: 16 }}>{cat.emoji || '🍽️'}</span>
                        <span className="text-white font-bold text-xs flex-1 truncate">{cat.name}</span>
                        <span className="text-white/70 text-[10px] font-bold">{catProducts.length}</span>
                      </div>
                      {catProducts.map((p, i) => (
                        <ProductRow key={p.id} product={p} accent={getAccent(cat.color)} isAdmin={isAdmin} currency={currency}
                          isFirst={i === 0} isLast={i === catProducts.length - 1}
                          onMoveUp={() => moveProduct(p.id, 'up')} onMoveDown={() => moveProduct(p.id, 'down')}
                          onToggle={() => toggleAvailable(p)} onEdit={() => openEdit(p)} onDelete={() => setDeleteId(p.id)} />
                      ))}
                    </div>
                  );
                })}
                {uncategorized.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <div className="bg-slate-700 flex items-center gap-2 px-3 py-2 rounded-xl shadow-sm">
                      <span style={{ fontSize: 16 }}>❓</span>
                      <span className="text-white font-bold text-xs flex-1 truncate">Sin categoría</span>
                      <span className="text-white/70 text-[10px] font-bold">{uncategorized.length}</span>
                    </div>
                    {uncategorized.map(p => (
                      <ProductRow key={p.id} product={p} isAdmin={isAdmin} currency={currency}
                        isFirst isLast
                        onMoveUp={() => {}} onMoveDown={() => {}}
                        onToggle={() => toggleAvailable(p)} onEdit={() => openEdit(p)} onDelete={() => setDeleteId(p.id)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })()
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
                <label className="block text-slate-400 text-sm mb-1.5">Precio ({currency}) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">{currency}</span>
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

    </div>
  );
}
