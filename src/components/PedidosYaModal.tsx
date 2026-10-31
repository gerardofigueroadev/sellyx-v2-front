import { useState } from 'react';
import { CartItem } from '../types';

/**
 * Confirma un pedido de PedidosYa antes de registrarlo. No es un cobro: el
 * pedido va a su propio registro (sin caja ni turno) para el reporte semanal.
 * El N° de pedido es opcional y sirve para cruzarlo con la liquidación de la app.
 */
export default function PedidosYaModal({
  items, currency, onConfirm, onClose,
}: {
  items: CartItem[];
  currency: string;
  onConfirm: (externalCode: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const total = items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);

  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    try { await onConfirm(code); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-lg">🛵</span>
            <h2 className="text-white font-bold text-sm">Pedido PedidosYa</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-lg">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-slate-900/60 rounded-xl p-3 space-y-1.5 max-h-56 overflow-y-auto">
            {items.map(i => (
              <div key={i.id} className="flex justify-between gap-3 text-sm">
                <span className="text-slate-200 truncate">{i.quantity}× {i.name}</span>
                <span className="text-slate-400 shrink-0">{currency} {(Number(i.price) * i.quantity).toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-slate-700/60 pt-2 mt-2">
              <span className="text-slate-400 text-sm">Total</span>
              <span className="text-white font-bold">{currency} {total.toFixed(2)}</span>
            </div>
          </div>

          <div>
            <label className="text-slate-400 text-xs">N° de pedido PedidosYa (opcional)</label>
            <input
              autoFocus
              value={code}
              onChange={e => setCode(e.target.value.slice(0, 64))}
              onKeyDown={e => { if (e.key === 'Enter') confirm(); }}
              placeholder="Ej: 123456789"
              className="mt-1 w-full bg-slate-700/60 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <p className="text-slate-500 text-xs">
            No se cobra ni entra en la caja. Queda en el reporte semanal de PedidosYa.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={onClose}
              className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-semibold py-2.5 rounded-xl transition">
              Volver
            </button>
            <button onClick={confirm} disabled={saving}
              className="bg-rose-600 hover:bg-rose-500 disabled:bg-slate-700 text-white text-sm font-bold py-2.5 rounded-xl transition">
              {saving ? 'Registrando…' : 'Registrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
