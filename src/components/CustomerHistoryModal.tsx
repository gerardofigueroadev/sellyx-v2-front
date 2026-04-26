import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import BASE_URL from '../config';

const API = `${BASE_URL}/api`;

interface CustomerOrder {
  id: number;
  orderNumber: string;
  ticketNumber: number;
  total: string;
  status: string;
  paymentMethod: string;
  orderType: string;
  createdAt: string;
}

interface CustomerDetail {
  id: number;
  name: string;
  phone: string;
  email?: string;
  orders: CustomerOrder[];
}

interface Props {
  customerId: number;
  onClose: () => void;
  onUpdated: (customer: { id: number; name: string; phone: string }) => void;
}

const STATUS_LABEL: Record<string, string> = {
  pending:   'Pendiente',
  completed: 'Completada',
  cancelled: 'Cancelada',
  voided:    'Anulada',
};

const PM_LABEL: Record<string, string> = {
  cash:     '💵 Efectivo',
  card:     '💳 Tarjeta',
  transfer: '📱 QR / Trans.',
};

export default function CustomerHistoryModal({ customerId, onClose, onUpdated }: Props) {
  const { token, currency } = useAuth();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [editing,    setEditing]    = useState(false);
  const [nameInput,  setNameInput]  = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [saving,     setSaving]     = useState(false);
  const [from,     setFrom]     = useState('');
  const [to,       setTo]       = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/customers/${customerId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then((c: CustomerDetail) => { setCustomer(c); setNameInput(c.name ?? ''); setEmailInput(c.email ?? ''); })
      .finally(() => setLoading(false));
  }, [customerId, token]);

  const handleSave = async () => {
    if (!token || !customer || !nameInput.trim()) return;
    setSaving(true);
    const body: Record<string, string> = { name: nameInput.trim() };
    if (emailInput.trim()) body.email = emailInput.trim();
    const res = await fetch(`${API}/customers/${customer.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const updated = await res.json();
      setCustomer(p => p ? { ...p, name: updated.name, email: updated.email } : p);
      onUpdated({ id: updated.id, name: updated.name, phone: updated.phone });
      setEditing(false);
    }
    setSaving(false);
  };

  const filtered = (customer?.orders ?? [])
    .filter(o => {
      const d = new Date(o.createdAt);
      if (from && d < new Date(from)) return false;
      if (to   && d > new Date(to + 'T23:59:59')) return false;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const displayName = customer
    ? (customer.name && customer.name !== customer.phone ? customer.name : '')
    : '';

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#1e293b', border: '1px solid rgba(71,85,105,0.5)', borderRadius: 16, width: '100%', maxWidth: 500, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(71,85,105,0.4)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  autoFocus
                  placeholder="Nombre completo"
                  onKeyDown={e => e.key === 'Escape' && setEditing(false)}
                  style={{ background: 'rgba(51,65,85,0.6)', border: '1px solid rgba(59,130,246,0.5)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: 13, outline: 'none' }}
                />
                <input
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  placeholder="Correo electrónico (opcional)"
                  type="email"
                  onKeyDown={e => e.key === 'Escape' && setEditing(false)}
                  style={{ background: 'rgba(51,65,85,0.6)', border: '1px solid rgba(71,85,105,0.5)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: 13, outline: 'none' }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleSave}
                    disabled={saving || !nameInput.trim()}
                    style={{ flex: 1, background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, padding: '7px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving || !nameInput.trim() ? 0.5 : 1 }}
                  >
                    {saving ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button onClick={() => setEditing(false)} style={{ background: 'rgba(51,65,85,0.5)', border: '1px solid rgba(71,85,105,0.4)', color: '#94a3b8', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  {displayName && <p style={{ color: 'white', fontWeight: 700, fontSize: 16, margin: 0 }}>{displayName}</p>}
                  <p style={{ color: '#94a3b8', fontSize: 13, margin: displayName ? '2px 0 0' : 0 }}>📱 {customer?.phone ?? '...'}</p>
                  {customer?.email && <p style={{ color: '#64748b', fontSize: 12, margin: '2px 0 0' }}>✉️ {customer.email}</p>}
                </div>
                <button
                  onClick={() => setEditing(true)}
                  style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#93c5fd', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}
                >
                  ✏️ Editar
                </button>
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer', lineHeight: 1, flexShrink: 0, padding: 0 }}>×</button>
        </div>

        {/* Date filter */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid rgba(71,85,105,0.3)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: '#64748b', fontSize: 12, flexShrink: 0 }}>Desde</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            style={{ flex: 1, minWidth: 0, background: 'rgba(51,65,85,0.6)', border: '1px solid rgba(71,85,105,0.5)', borderRadius: 8, padding: '4px 8px', color: '#cbd5e1', fontSize: 12, outline: 'none' }} />
          <span style={{ color: '#475569', fontSize: 12, flexShrink: 0 }}>Hasta</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            style={{ flex: 1, minWidth: 0, background: 'rgba(51,65,85,0.6)', border: '1px solid rgba(71,85,105,0.5)', borderRadius: 8, padding: '4px 8px', color: '#cbd5e1', fontSize: 12, outline: 'none' }} />
          {(from || to) && (
            <button onClick={() => { setFrom(''); setTo(''); }} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 18, lineHeight: 1, flexShrink: 0, padding: 0 }}>×</button>
          )}
        </div>

        {/* Orders list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {loading ? (
            <p style={{ color: '#64748b', textAlign: 'center', padding: 32, fontSize: 14, margin: 0 }}>Cargando...</p>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
              <p style={{ fontSize: 36, margin: '0 0 8px' }}>🧾</p>
              <p style={{ fontSize: 14, margin: 0 }}>Sin pedidos{from || to ? ' en este rango' : ''}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {filtered.map(o => (
                <div
                  key={o.id}
                  style={{ background: 'rgba(51,65,85,0.3)', border: '1px solid rgba(71,85,105,0.3)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <span style={{ color: 'white', fontWeight: 700, fontSize: 14 }}>#{o.ticketNumber}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 6, background: o.status === 'completed' ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.2)', color: o.status === 'completed' ? '#86efac' : '#94a3b8' }}>
                        {STATUS_LABEL[o.status] ?? o.status}
                      </span>
                    </div>
                    <p style={{ color: '#64748b', fontSize: 12, margin: '3px 0 0' }}>
                      {new Date(o.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {' '}{new Date(o.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      {' · '}{PM_LABEL[o.paymentMethod] ?? o.paymentMethod}
                    </p>
                  </div>
                  <span style={{ color: '#60a5fa', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
                    {currency} {parseFloat(o.total).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer summary */}
        {!loading && filtered.length > 0 && (
          <div style={{ padding: '10px 20px', borderTop: '1px solid rgba(71,85,105,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#64748b', fontSize: 12 }}>{filtered.length} pedido{filtered.length !== 1 ? 's' : ''}</span>
            <span style={{ color: '#60a5fa', fontWeight: 700, fontSize: 14 }}>
              {currency} {filtered.reduce((s, o) => s + parseFloat(o.total), 0).toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
