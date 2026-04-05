import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

import API_URL from '../config';
const API = `${API_URL}/api`;

interface Branch { id: number; name: string; }
interface Category {
  id: number;
  name: string;
  description: string;
  emoji: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
  branch: Branch | null;
  products?: { id: number }[];
}

interface FormData {
  name: string;
  description: string;
  emoji: string;
  color: string;
  isActive: boolean;
}

const emptyForm: FormData = {
  name: '',
  description: '',
  emoji: '🍽️',
  color: 'blue',
  isActive: true,
};

const EMOJIS = [
  '🍔','🍕','🌭','🌮','🥗','🍗','🥤','☕','🍵','🧋','🍟','🧁','🍰','🍩','🍪',
  '🥘','🍜','🍛','🥩','🥙','🌯','🧆','🥚','🥞','🧇','🍺','🧃','💧','🍦','🎂',
];

const COLORS: { value: string; label: string; bg: string; text: string; border: string }[] = [
  { value: 'orange',  label: 'Naranja', bg: 'bg-orange-500/20',  text: 'text-orange-400',  border: 'border-orange-500/40' },
  { value: 'blue',    label: 'Azul',    bg: 'bg-blue-500/20',    text: 'text-blue-400',    border: 'border-blue-500/40' },
  { value: 'purple',  label: 'Morado',  bg: 'bg-purple-500/20',  text: 'text-purple-400',  border: 'border-purple-500/40' },
  { value: 'green',   label: 'Verde',   bg: 'bg-green-500/20',   text: 'text-green-400',   border: 'border-green-500/40' },
  { value: 'red',     label: 'Rojo',    bg: 'bg-red-500/20',     text: 'text-red-400',     border: 'border-red-500/40' },
  { value: 'yellow',  label: 'Amarillo',bg: 'bg-yellow-500/20',  text: 'text-yellow-400',  border: 'border-yellow-500/40' },
  { value: 'pink',    label: 'Rosa',    bg: 'bg-pink-500/20',    text: 'text-pink-400',    border: 'border-pink-500/40' },
  { value: 'cyan',    label: 'Cyan',    bg: 'bg-cyan-500/20',    text: 'text-cyan-400',    border: 'border-cyan-500/40' },
];

function getColor(color: string) {
  return COLORS.find(c => c.value === color) ?? COLORS[1];
}

export default function CategoriesPage() {
  const { token, branches, activeBranchId } = useAuth();
  const isAdmin = branches.length > 1;

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterBranchId, setFilterBranchId] = useState<number | null>(activeBranchId);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => { setFilterBranchId(activeBranchId); }, [activeBranchId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const fetchCategories = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = filterBranchId ? `?branchId=${filterBranchId}&manage=true` : '?manage=true';
      const res = await fetch(`${API}/categories${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Error al cargar categorías');
      setCategories(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, filterBranchId]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setShowEmojiPicker(false);
    setShowModal(true);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setForm({
      name: cat.name,
      description: cat.description ?? '',
      emoji: cat.emoji ?? '🍽️',
      color: cat.color ?? 'blue',
      isActive: cat.isActive,
    });
    setFormError('');
    setShowEmojiPicker(false);
    setShowModal(true);
  };

  const activeCount = categories.filter(c => c.isActive).length;

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('El nombre es obligatorio'); return; }
    setSaving(true);
    setFormError('');
    const body: any = {
      name: form.name.trim(),
      description: form.description.trim(),
      emoji: form.emoji,
      color: form.color,
      isActive: form.isActive,
    };
    // Assign to current branch on create, or when editing a global category
    if (filterBranchId && (!editing || editing.branch === null)) body.branchId = filterBranchId;

    try {
      const url = editing ? `${API}/categories/${editing.id}` : `${API}/categories`;
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message ?? 'Error al guardar');
      }
      await fetchCategories();
      setShowModal(false);
      showToast(editing ? 'Categoría actualizada' : 'Categoría creada');
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (cat: Category) => {
    if (!cat.isActive && activeCount >= 3) {
      showToast('⚠️ Límite alcanzado: solo 3 categorías activas');
      return;
    }
    try {
      const res = await fetch(`${API}/categories/${cat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: !cat.isActive }),
      });
      if (!res.ok) {
        const d = await res.json();
        showToast(`⚠️ ${d.message ?? 'Error al actualizar'}`);
        return;
      }
      setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, isActive: !c.isActive } : c));
      showToast(!cat.isActive ? 'Categoría activada' : 'Categoría desactivada');
    } catch { showToast('Error al actualizar'); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`${API}/categories/${deleteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message ?? 'No se pudo eliminar');
      }
      setCategories(prev => prev.filter(c => c.id !== deleteId));
      setDeleteId(null);
      showToast('Categoría eliminada');
    } catch (e: any) {
      setDeleteId(null);
      showToast(e.message);
    }
  };

  const moveCategory = async (index: number, direction: 'up' | 'down') => {
    const otherIndex = direction === 'up' ? index - 1 : index + 1;
    if (otherIndex < 0 || otherIndex >= categories.length) return;

    const newList = [...categories];
    [newList[index], newList[otherIndex]] = [newList[otherIndex], newList[index]];
    const items = newList.map((c, i) => ({ id: c.id, sortOrder: i + 1 }));
    setCategories(newList.map((c, i) => ({ ...c, sortOrder: i + 1 })));

    try {
      await fetch(`${API}/categories/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items }),
      });
    } catch { showToast('⚠️ Error al reordenar'); fetchCategories(); }
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-slate-800">
      <div className="text-center">
        <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-slate-400">Cargando categorías...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex-1 flex items-center justify-center bg-slate-800">
      <p className="text-red-400">⚠️ {error}</p>
    </div>
  );

  const deleteCat = categories.find(c => c.id === deleteId);
  const productCount = (cat: Category) => cat.products?.length ?? 0;

  return (
    <div className="flex-1 flex flex-col bg-slate-800 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 shrink-0">
        <div>
          <h1 className="text-white text-xl font-bold">Categorías</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-slate-500 text-sm">{categories.length} registradas</p>
            <span className="text-slate-700">·</span>
            <span className={`text-sm font-medium ${activeCount >= 3 ? 'text-yellow-400' : 'text-green-400'}`}>
              {activeCount}/3 activas
            </span>
            {activeCount >= 3 && <span className="text-yellow-500 text-xs">(límite alcanzado)</span>}
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition"
        >
          <span className="text-lg">+</span> Nueva categoría
        </button>
      </div>

      {/* Branch filter */}
      {isAdmin && (
        <div className="px-6 py-3 border-b border-slate-700/50 shrink-0">
          <select
            value={filterBranchId ?? ''}
            onChange={e => setFilterBranchId(e.target.value ? +e.target.value : null)}
            className="bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            {branches.map(b => (
              <option key={b.id} value={b.id}>📍 {b.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-5xl mb-3">🗂️</p>
            <p className="text-slate-400 text-lg font-medium">No hay categorías</p>
            <p className="text-slate-600 text-sm mt-1 mb-5">Las categorías agrupan tus productos en el menú de ventas</p>
            <button
              onClick={openCreate}
              className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition"
            >
              Crear primera categoría
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat, idx) => {
              const col = getColor(cat.color);
              return (
                <div
                  key={cat.id}
                  className={`bg-slate-900/60 border rounded-2xl overflow-hidden transition
                    ${cat.isActive ? 'border-slate-700/50 hover:border-slate-600' : 'border-slate-700/20 opacity-60'}`}
                >
                  {/* Color banner */}
                  <div className={`${col.bg} border-b ${col.border} px-5 py-4 flex items-center justify-between`}>
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{cat.emoji || '🍽️'}</span>
                      <div>
                        <h3 className={`font-bold text-base ${col.text}`}>{cat.name}</h3>
                        <span className={`text-xs ${col.text} opacity-70`}>
                          {productCount(cat)} producto{productCount(cat) !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500 font-mono font-bold">#{idx + 1}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${col.bg} ${col.text} ${col.border}`}>
                          {cat.isActive ? 'Activa' : 'Inactiva'}
                        </span>
                      </div>
                      {isAdmin && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800/60 text-slate-400 font-medium">
                          {cat.branch ? `📍 ${cat.branch.name}` : '🌐 Global'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Body */}
                  <div className="px-5 py-4">
                    {cat.description ? (
                      <p className="text-slate-400 text-sm leading-relaxed line-clamp-2">{cat.description}</p>
                    ) : (
                      <p className="text-slate-600 text-sm italic">Sin descripción</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 px-5 py-3 border-t border-slate-700/40">
                    {/* Reorder */}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        onClick={() => moveCategory(idx, 'up')}
                        disabled={idx === 0}
                        title="Mover arriba"
                        className="p-1 rounded text-slate-600 hover:text-white hover:bg-slate-700 transition disabled:opacity-20 disabled:cursor-not-allowed text-xs leading-none"
                      >▲</button>
                      <button
                        onClick={() => moveCategory(idx, 'down')}
                        disabled={idx === categories.length - 1}
                        title="Mover abajo"
                        className="p-1 rounded text-slate-600 hover:text-white hover:bg-slate-700 transition disabled:opacity-20 disabled:cursor-not-allowed text-xs leading-none"
                      >▼</button>
                    </div>

                    <button
                      onClick={() => toggleActive(cat)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition border
                        ${cat.isActive
                          ? 'border-slate-600 text-slate-400 hover:text-yellow-400 hover:border-yellow-500/40 hover:bg-yellow-500/5'
                          : 'border-green-600/40 text-green-400 hover:bg-green-500/10'}`}
                    >
                      {cat.isActive ? '⏸ Desactivar' : '▶ Activar'}
                    </button>
                    <button
                      onClick={() => openEdit(cat)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium border border-slate-600 text-slate-400 hover:text-blue-400 hover:border-blue-500/40 hover:bg-blue-500/5 transition"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={() => setDeleteId(cat.id)}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modal crear / editar ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h2 className="text-white font-bold text-lg">
                {editing ? 'Editar categoría' : 'Nueva categoría'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white text-xl transition">✕</button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1">

              {/* Emoji + nombre en fila */}
              <div className="flex gap-3 items-start">
                <div className="relative shrink-0">
                  <label className="block text-slate-400 text-xs mb-1.5">Ícono</label>
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="w-14 h-14 bg-slate-700 rounded-xl text-2xl flex items-center justify-center hover:bg-slate-600 transition border border-slate-600"
                  >
                    {form.emoji}
                  </button>
                  {showEmojiPicker && (
                    <div className="absolute top-20 left-0 bg-slate-700 border border-slate-600 rounded-xl p-3 z-10 grid grid-cols-6 gap-1 w-56 shadow-xl">
                      {EMOJIS.map(e => (
                        <button
                          key={e}
                          onClick={() => { setForm(f => ({ ...f, emoji: e })); setShowEmojiPicker(false); }}
                          className="text-xl hover:bg-slate-600 rounded-lg p-1 transition"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex-1">
                  <label className="block text-slate-400 text-xs mb-1.5">Nombre *</label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Ej: Comida, Bebidas, Postres..."
                    className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                </div>
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-slate-400 text-xs mb-1.5">Descripción</label>
                <input
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Ej: Platos principales del menú"
                  className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Color */}
              <div>
                <label className="block text-slate-400 text-xs mb-2">Color de categoría</label>
                <div className="grid grid-cols-4 gap-2">
                  {COLORS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, color: c.value }))}
                      className={`flex flex-col items-center gap-1.5 py-2 px-1 rounded-xl border transition
                        ${form.color === c.value
                          ? `${c.bg} ${c.border} ${c.text}`
                          : 'border-slate-700 text-slate-500 hover:border-slate-600 hover:bg-slate-700/40'}`}
                    >
                      <span className={`w-5 h-5 rounded-full ${c.bg} border ${c.border}`} />
                      <span className="text-xs font-medium">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div>
                <label className="block text-slate-400 text-xs mb-2">Vista previa</label>
                <div className={`${getColor(form.color).bg} border ${getColor(form.color).border} rounded-xl px-4 py-3 flex items-center gap-3`}>
                  <span className="text-2xl">{form.emoji}</span>
                  <div>
                    <p className={`font-bold text-sm ${getColor(form.color).text}`}>{form.name || 'Nombre de categoría'}</p>
                    {form.description && <p className={`text-xs opacity-70 ${getColor(form.color).text}`}>{form.description}</p>}
                  </div>
                </div>
              </div>

              {/* Activa toggle */}
              {(() => {
                const cantActivate = form.isActive === false && !editing && activeCount >= 3;
                const cantActivateEdit = form.isActive === false && !!editing && !editing.isActive && activeCount >= 3;
                const blocked = cantActivate || cantActivateEdit;
                return (
                  <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${blocked ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-slate-700/40'}`}>
                    <div>
                      <p className="text-white text-sm font-medium">Activa</p>
                      <p className={`text-xs ${blocked ? 'text-yellow-400' : 'text-slate-500'}`}>
                        {blocked ? '⚠️ Límite de 3 categorías activas alcanzado' : `Visible en el menú de ventas (${activeCount}/3 activas)`}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={blocked}
                      onClick={() => !blocked && setForm(f => ({ ...f, isActive: !f.isActive }))}
                      className={`w-12 h-6 rounded-full transition-colors relative ${form.isActive ? 'bg-blue-600' : 'bg-slate-600'} ${blocked ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.isActive ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                  </div>
                );
              })()}

              {/* Note when editing a global category with a branch selected */}
              {editing && editing.branch === null && filterBranchId && (
                <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3 text-amber-400 text-xs">
                  ℹ️ Esta categoría es global. Al guardar quedará asignada únicamente a <strong>{branches.find(b => b.id === filterBranchId)?.name}</strong>.
                </div>
              )}

              {formError && (
                <div className="bg-red-500/15 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                  ⚠️ {formError}
                </div>
              )}
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-slate-700">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-medium transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white py-2.5 rounded-xl text-sm font-medium transition disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? (
                  <><span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full inline-block" /> Guardando...</>
                ) : (editing ? 'Guardar cambios' : 'Crear categoría')}
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
            <h3 className="text-white font-bold text-lg text-center mb-1">¿Eliminar categoría?</h3>
            {deleteCat && (
              <p className="text-slate-400 text-sm text-center mb-1">
                <span className="text-white font-medium">"{deleteCat.name}"</span>
              </p>
            )}
            {deleteCat && productCount(deleteCat) > 0 && (
              <p className="text-yellow-400 text-xs text-center mb-4">
                ⚠️ Tiene {productCount(deleteCat)} producto(s) asociado(s)
              </p>
            )}
            <p className="text-slate-500 text-xs text-center mb-6">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-medium transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2.5 rounded-xl text-sm font-medium transition"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50">
          ✓ {toast}
        </div>
      )}
    </div>
  );
}
