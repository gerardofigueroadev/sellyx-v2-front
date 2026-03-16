import { useState } from 'react';
import { CartItem } from '../types';

export type PaymentMethod = 'cash' | 'transfer';

interface CartProps {
  items: CartItem[];
  onRemove: (id: number) => void;
  onClear: () => void;
  onCheckout: (paymentMethod: PaymentMethod) => void;
  onNoteChange?: (id: number, note: string) => void;
  allowItemNotes?: boolean;
}

export default function Cart({ items, onRemove, onClear, onCheckout, onNoteChange, allowItemNotes }: CartProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [notesOpen, setNotesOpen] = useState<Record<number, boolean>>({});

  const total      = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="w-full lg:w-64 xl:w-80 2xl:w-96 bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-700/50 flex flex-col shrink-0 max-h-[40vh] lg:max-h-none overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🧾</span>
          <h3 className="text-white font-bold">Orden</h3>
          {totalItems > 0 && (
            <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {totalItems}
            </span>
          )}
        </div>
        {items.length > 0 && (
          <button onClick={onClear} className="text-slate-500 hover:text-red-400 text-xs transition">
            Vaciar
          </button>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {items.length === 0 ? (
          <div className="text-center py-12 text-slate-500 px-4">
            <p className="text-4xl mb-3">🍽️</p>
            <p className="text-sm font-medium text-slate-400">Agrega productos</p>
            <p className="text-xs mt-1 text-slate-600">para hacer una orden</p>
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className="bg-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-2xl shrink-0">{item.emoji || '🍽️'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{item.name}</p>
                  <p className="text-blue-400 text-xs">Bs. {Number(item.price).toFixed(2)} × {item.quantity}</p>
                </div>
                {allowItemNotes && (
                  <button
                    onClick={() => setNotesOpen(p => ({ ...p, [item.id]: !p[item.id] }))}
                    title="Agregar indicación"
                    className={`shrink-0 text-xs px-2 py-0.5 rounded-lg border transition ${
                      notesOpen[item.id] || item.note
                        ? 'border-amber-500/50 text-amber-400 bg-amber-500/10'
                        : 'border-slate-600 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    📝
                  </button>
                )}
                <button
                  onClick={() => onRemove(item.id)}
                  className="text-slate-500 hover:text-red-400 transition text-lg leading-none shrink-0"
                >
                  ×
                </button>
              </div>
              {allowItemNotes && notesOpen[item.id] && (
                <input
                  autoFocus
                  value={item.note ?? ''}
                  onChange={e => onNoteChange?.(item.id, e.target.value)}
                  placeholder="Ej: sin queso, sin cebolla..."
                  className="w-full bg-slate-700/60 border border-amber-500/30 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              )}
              {allowItemNotes && !notesOpen[item.id] && item.note && (
                <p className="text-amber-400 text-xs pl-1">📝 {item.note}</p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-700/50 space-y-3">
        {/* Total */}
        <div className="flex items-center justify-between">
          <span className="text-slate-400 text-sm">Total</span>
          <span className="text-white font-bold text-lg">Bs. {total.toFixed(2)}</span>
        </div>

        {/* Método de pago */}
        <div>
          <p className="text-slate-500 text-xs mb-2">Método de pago</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPaymentMethod('cash')}
              className={`flex items-center justify-center gap-1.5 xl:flex-col xl:gap-1 py-2 xl:py-2.5 px-2 rounded-xl border text-xs font-medium transition ${
                paymentMethod === 'cash'
                  ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
            >
              <span className="text-base xl:text-lg">💵</span>
              <span>Efectivo</span>
            </button>

            <div className="relative">
              <button
                disabled
                className="w-full flex items-center justify-center gap-1.5 xl:flex-col xl:gap-1 py-2 xl:py-2.5 px-2 rounded-xl border border-slate-700/50 bg-slate-800/40 text-slate-600 text-xs font-medium cursor-not-allowed"
              >
                <span className="text-base xl:text-lg opacity-50">📱</span>
                <span>QR / Tigo</span>
              </button>
              <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                PRONTO
              </span>
            </div>
          </div>
        </div>

        {/* Cobrar */}
        <button
          disabled={items.length === 0}
          onClick={() => onCheckout(paymentMethod)}
          className="w-full bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition shadow-lg hover:shadow-green-500/20"
        >
          {paymentMethod === 'cash' ? '💵 Cobrar en efectivo' : '📱 Cobrar con QR'}
        </button>
      </div>
    </div>
  );
}
