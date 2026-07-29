import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import API_URL from '../config';

const API = `${API_URL}/api`;
const apiFetch = (token: string, path: string, opts?: RequestInit) =>
  fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });

// ─── Tipos ────────────────────────────────────────────────────────────────────
type QrStatus = 'pending' | 'paid' | 'disabled' | 'error';

interface QrPayment {
  id: number;
  alias: string;
  monto: number | string;
  moneda: string;
  glosa: string | null;
  status: QrStatus;
  orderId: number | null;
  branchId: number | null;
  paidAt: string | null;
  payerName: string | null;
  payerDocument: string | null;
  expiresAt: string | null;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<QrStatus, string> = {
  pending: 'Pendiente', paid: 'Pagado', disabled: 'Anulado', error: 'Error',
};
const STATUS_STYLE: Record<QrStatus, string> = {
  paid:     'bg-green-500/15 text-green-400 border-green-500/20',
  pending:  'bg-amber-500/15 text-amber-400 border-amber-500/20',
  disabled: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  error:    'bg-red-500/15 text-red-400 border-red-500/20',
};

const money = (n: number | string, cur: string) => `${Number(n).toFixed(2)}${cur ? ' ' + cur : ''}`;

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function QrDetailModal({
  qr, currency, branchName, onClose,
}: {
  qr: QrPayment; currency: string; branchName: string; onClose: () => void;
}) {
  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-3 text-sm py-1.5 border-b border-slate-700/40 last:border-0">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className="text-slate-200 text-right">{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-700 shrink-0">
          <div>
            <h2 className="text-white font-black text-xl">{money(qr.monto, qr.moneda || currency)}</h2>
            <p className="text-slate-500 text-xs mt-0.5">{formatDateTime(qr.createdAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_STYLE[qr.status]}`}>
              {STATUS_LABEL[qr.status]}
            </span>
            <button onClick={onClose} className="text-slate-500 hover:text-white text-xl ml-1">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Row label="Estado" value={STATUS_LABEL[qr.status]} />
          <Row label="Monto" value={money(qr.monto, qr.moneda || currency)} />
          <Row label="Sucursal" value={branchName} />
          <Row label="Concepto" value={qr.glosa || '—'} />
          {qr.status === 'paid' && (
            <>
              <Row label="Pagado el" value={qr.paidAt ? formatDateTime(qr.paidAt) : '—'} />
              <Row label="Pagador" value={qr.payerName || '—'} />
              <Row label="Documento" value={qr.payerDocument || '—'} />
            </>
          )}
          {qr.orderId && <Row label="Pedido asociado" value={`#${qr.orderId}`} />}
          <Row label="Referencia" value={<span className="font-mono text-xs">{qr.alias}</span>} />
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 20;

export default function QrPaymentPage() {
  const { token, currency, branches, activeBranchId } = useAuth();
  const [rows, setRows] = useState<QrPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | QrStatus>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<QrPayment | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const branchName = (id: number | null) =>
    id == null ? 'Sin sucursal' : (branches.find((b) => b.id === id)?.name ?? `Sucursal ${id}`);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (filter !== 'all') params.set('status', filter);
    // Filtro por la sucursal activa seleccionada en el Sidebar.
    if (activeBranchId != null) params.set('branchId', String(activeBranchId));
    const res = await apiFetch(token, `/qr?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      setRows(json.data ?? []);
      setTotal(json.total ?? 0);
    }
    setLoading(false);
  }, [token, filter, page, activeBranchId]);

  useEffect(() => { load(); }, [load]);

  // Al cambiar filtro o sucursal, volver a la página 1.
  useEffect(() => { setPage(1); }, [filter, activeBranchId]);

  const FILTERS: { key: 'all' | QrStatus; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'paid', label: 'Pagados' },
    { key: 'pending', label: 'Pendientes' },
    { key: 'disabled', label: 'Anulados' },
  ];

  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(totalPages, p + 1));

  const activeBranchLabel =
    activeBranchId != null ? branchName(activeBranchId) : 'todas las sucursales';

  return (
    <div className="flex-1 flex flex-col bg-slate-900 min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-700/50 shrink-0">
        <h1 className="text-white font-black text-2xl">Cobros con QR</h1>
        <p className="text-slate-500 text-sm">
          Pagos QR de <span className="text-slate-300">{activeBranchLabel}</span> · más recientes arriba
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${filter === f.key ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <p className="text-slate-500 text-sm text-center py-10">Cargando pagos…</p>
        ) : rows.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-10">
            {total === 0 ? 'Aún no hay cobros con QR para este filtro.' : 'No hay pagos en esta página.'}
          </p>
        ) : (
          <div className="space-y-2 max-w-3xl">
            {rows.map((qr) => (
              <button key={qr.id} onClick={() => setSelected(qr)}
                className="w-full text-left bg-slate-800 hover:bg-slate-700/70 border border-slate-700/50 rounded-xl px-4 py-3 flex items-center justify-between gap-3 transition">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white text-sm font-bold">{money(qr.monto, qr.moneda || currency)}</p>
                    {qr.payerName && (
                      <span className="text-slate-400 text-xs truncate">· {qr.payerName}</span>
                    )}
                  </div>
                  <p className="text-slate-500 text-xs truncate">
                    {formatDateTime(qr.createdAt)} · {branchName(qr.branchId)}
                  </p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${STATUS_STYLE[qr.status]}`}>
                  {STATUS_LABEL[qr.status]}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Paginación */}
      {total > 0 && (
        <div className="shrink-0 border-t border-slate-700/50 px-6 py-3 flex items-center justify-between">
          <span className="text-slate-500 text-xs">
            {total} cobro(s) · página {page} de {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={goPrev} disabled={loading || page <= 1}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-800 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition">
              ← Anterior
            </button>
            <button onClick={goNext} disabled={loading || page >= totalPages}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-800 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition">
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {selected && (
        <QrDetailModal
          qr={selected}
          currency={currency}
          branchName={branchName(selected.branchId)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
