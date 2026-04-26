import { useState, useEffect, useRef } from 'react';
import { CartItem } from '../types';
import { useAuth } from '../context/AuthContext';
import BASE_URL from '../config';
import CustomerHistoryModal from './CustomerHistoryModal';

const CART_API = `${BASE_URL}/api`;

export type PaymentMethod = 'cash' | 'card' | 'transfer';
export type OrderType = 'dine_in' | 'takeaway';

const PAYMENT_OPTIONS: { key: PaymentMethod; emoji: string; label: string; checkoutLabel: string }[] = [
  { key: 'cash',     emoji: '💵', label: 'Efectivo',           checkoutLabel: '💵 Cobrar en efectivo' },
  { key: 'card',     emoji: '💳', label: 'Tarjeta',            checkoutLabel: '💳 Cobrar con tarjeta' },
  { key: 'transfer', emoji: '📱', label: 'QR / Transferencia', checkoutLabel: '📱 Cobrar con QR' },
];

interface FoundCustomer {
  id: number;
  name: string;
  phone: string;
}

interface CartProps {
  items: CartItem[];
  onRemove: (id: number) => void;
  onClear: () => void;
  onCheckout: (paymentMethod: PaymentMethod, orderType: OrderType, customerId: number | null, customerPhone: string | null) => void;
  onNoteChange?: (id: number, note: string) => void;
  allowItemNotes?: boolean;
  showCustomerLookup?: boolean;
}

export default function Cart({ items, onRemove, onClear, onCheckout, onNoteChange, allowItemNotes, showCustomerLookup }: CartProps) {
  const { currency, enabledPaymentMethods, token } = useAuth();
  const [notesOpen, setNotesOpen] = useState<Record<number, boolean>>({});
  const [orderType, setOrderType] = useState<OrderType>('dine_in');

  // Customer lookup state
  const [phone,         setPhone]         = useState('');
  const [foundCustomer, setFoundCustomer] = useState<FoundCustomer | null>(null);
  const [searching,     setSearching]     = useState(false);
  const [historyOpen,   setHistoryOpen]   = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visibleOptions = PAYMENT_OPTIONS.filter(o => enabledPaymentMethods.includes(o.key));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() =>
    visibleOptions[0]?.key ?? 'cash'
  );

  const activeMethod = visibleOptions.find(o => o.key === paymentMethod)
    ? paymentMethod
    : (visibleOptions[0]?.key ?? 'cash');

  const total      = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const gridCols   = visibleOptions.length === 1 ? '' : visibleOptions.length === 2 ? 'grid-cols-2' : 'grid-cols-3';

  // Clear customer state when cart is emptied (after successful checkout)
  useEffect(() => {
    if (items.length === 0) {
      setPhone('');
      setFoundCustomer(null);
    }
  }, [items.length]);

  // Debounced phone search
  useEffect(() => {
    if (!showCustomerLookup || !token) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (phone.length < 7) {
      setFoundCustomer(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${CART_API}/customers?phone=${encodeURIComponent(phone)}`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          setFoundCustomer(Array.isArray(data) && data.length > 0 ? data[0] : null);
        }
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [phone, token, showCustomerLookup]);

  const clearCustomer = () => { setPhone(''); setFoundCustomer(null); };

  const customerDisplayName = foundCustomer
    ? (foundCustomer.name && foundCustomer.name !== foundCustomer.phone ? foundCustomer.name : foundCustomer.phone)
    : '';

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

      {/* Customer lookup row */}
      {showCustomerLookup && (
        <div style={{ padding: '8px 12px 10px', borderBottom: '1px solid rgba(71,85,105,0.3)' }}>
          {foundCustomer ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <button
                onClick={() => setHistoryOpen(true)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', textAlign: 'left', minWidth: 0 }}
              >
                <span style={{ fontSize: 14, flexShrink: 0 }}>👤</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: '#93c5fd', fontSize: 12, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {customerDisplayName}
                  </p>
                  {foundCustomer.name && foundCustomer.name !== foundCustomer.phone && (
                    <p style={{ color: '#475569', fontSize: 11, margin: 0 }}>{foundCustomer.phone}</p>
                  )}
                </div>
                <span style={{ color: '#475569', fontSize: 11, flexShrink: 0 }}>Ver →</span>
              </button>
              <button onClick={clearCustomer} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 18, cursor: 'pointer', lineHeight: 1, flexShrink: 0, padding: 0 }}>×</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
                  placeholder="📱 Teléfono del cliente"
                  style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(51,65,85,0.5)', border: '1px solid rgba(71,85,105,0.5)', borderRadius: 8, padding: '6px 10px', color: 'white', fontSize: 13, outline: 'none' }}
                />
                {searching && (
                  <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: 12 }}>···</span>
                )}
                {!searching && phone.length >= 7 && (
                  <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#475569', fontSize: 11 }}>nuevo</span>
                )}
              </div>
              {phone.length > 0 && (
                <button onClick={clearCustomer} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 18, cursor: 'pointer', lineHeight: 1, flexShrink: 0, padding: 0 }}>×</button>
              )}
            </div>
          )}
        </div>
      )}

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
                  <p className="text-blue-400 text-xs">{currency} {Number(item.price).toFixed(2)} × {item.quantity}</p>
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
        <div className="flex items-center justify-between">
          <span className="text-slate-400 text-sm">Total</span>
          <span className="text-white font-bold text-lg">{currency} {total.toFixed(2)}</span>
        </div>

        {/* Tipo de orden */}
        <div className="grid grid-cols-2 gap-2">
          {([['dine_in', '🍽️', 'Mesa'], ['takeaway', '🥡', 'Para llevar']] as const).map(([key, emoji, label]) => (
            <button
              key={key}
              onClick={() => setOrderType(key)}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-medium transition ${
                orderType === key
                  ? 'bg-amber-600/20 border-amber-500 text-amber-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
            >
              <span className="text-base">{emoji}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Método de pago */}
        {visibleOptions.length > 1 && (
          <div>
            <p className="text-slate-500 text-xs mb-2">Método de pago</p>
            <div className={`grid gap-2 ${gridCols}`}>
              {visibleOptions.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setPaymentMethod(opt.key)}
                  className={`flex items-center justify-center gap-1.5 xl:flex-col xl:gap-1 py-2 xl:py-2.5 px-2 rounded-xl border text-xs font-medium transition ${
                    activeMethod === opt.key
                      ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <span className="text-base xl:text-lg">{opt.emoji}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cobrar */}
        <button
          disabled={items.length === 0}
          onClick={() => onCheckout(activeMethod, orderType, foundCustomer?.id ?? null, phone || null)}
          className="w-full bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition shadow-lg hover:shadow-green-500/20"
        >
          {visibleOptions.find(o => o.key === activeMethod)?.checkoutLabel ?? '💵 Cobrar'}
        </button>
      </div>

      {/* Customer history modal */}
      {historyOpen && foundCustomer && (
        <CustomerHistoryModal
          customerId={foundCustomer.id}
          onClose={() => setHistoryOpen(false)}
          onUpdated={updated => setFoundCustomer(prev => prev ? { ...prev, name: updated.name } : prev)}
        />
      )}
    </div>
  );
}
