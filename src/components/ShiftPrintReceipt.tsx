// Shared thermal receipt component (80mm / EPSON M352A)

export interface ShiftReportProduct {
  productId: number;
  name: string;
  totalQty: number;
  unitPrice: number;
  totalSubtotal: number;
}

export interface ShiftReportData {
  shift: {
    id: number;
    type: 'pos' | 'system';
    status: 'open' | 'closed';
    openingAmount: number;
    closingAmount: number | null;
    openedAt: string;
    closedAt: string | null;
    branch: { id: number; name: string };
    user: { id: number; name: string } | null;
  };
  totalOrders: number;
  totalSales: number;
  cashSales: number;
  cardSales: number;
  transferSales: number;
  expectedCash: number;
  closingAmount: number | null;
  difference: number | null;
  products: ShiftReportProduct[];
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function dur(from: string, to: string | null) {
  const end = to ? new Date(to) : new Date();
  const m = Math.floor((end.getTime() - new Date(from).getTime()) / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function pad(left: string, right: string, width = 30) {
  const gap = width - left.length - right.length;
  return left + ' '.repeat(Math.max(1, gap)) + right;
}

export default function ShiftPrintReceipt({ data, orgName, currency = 'Bs.' }: { data: ShiftReportData; orgName: string; currency?: string }) {
  const s = data.shift;
  const cur = currency;
  return (
    <div id="thermal-print-area" style={{
      fontFamily: "'Courier New', Courier, monospace",
      fontSize: '13px',
      fontWeight: 'bold',
      width: '272px',
      padding: '8px',
      backgroundColor: '#fff',
      color: '#000',
      lineHeight: '1.15',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '3px' }}>
        <div style={{ fontSize: '15px' }}>{orgName}</div>
        <div style={{ fontSize: '12px' }}>{s.branch.name}</div>
        <div style={{ marginTop: '2px', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '2px 0', fontSize: '12px' }}>
          CIERRE DE TURNO
        </div>
      </div>

      {/* Info turno */}
      <div style={{ fontSize: '12px', marginBottom: '2px' }}>
        <div>{pad('Cajero:', s.user?.name ?? 'Sistema')}</div>
        <div>{pad('Apertura:', `${fmt(s.openedAt)} ${fmtTime(s.openedAt)}`)}</div>
        {s.closedAt && <div>{pad('Cierre:', `${fmt(s.closedAt)} ${fmtTime(s.closedAt)}`)}</div>}
        <div>{pad('Duración:', dur(s.openedAt, s.closedAt))}</div>
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '2px 0' }} />

      {/* Productos */}
      {data.products.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#666', fontSize: '12px' }}>Sin ventas en este turno</div>
      ) : (
        <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', tableLayout: 'fixed', border: '1px solid #000' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left',  padding: '1px 3px', fontWeight: 'bold', border: '1px solid #000' }}>Producto</th>
              <th style={{ textAlign: 'right', padding: '1px 3px', fontWeight: 'bold', width: '34px', border: '1px solid #000' }}>Cant</th>
              <th style={{ textAlign: 'right', padding: '1px 3px', fontWeight: 'bold', width: '80px', border: '1px solid #000' }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {data.products.map((p, i) => (
              <tr key={i}>
                <td style={{ padding: '0 3px', lineHeight: '1.05', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', border: '1px solid #000' }}>{p.name}</td>
                <td style={{ padding: '0 3px', textAlign: 'right', lineHeight: '1.05', border: '1px solid #000' }}>{p.totalQty}</td>
                <td style={{ padding: '0 3px', textAlign: 'right', whiteSpace: 'nowrap', lineHeight: '1.05', border: '1px solid #000' }}>{cur}{p.totalSubtotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ borderTop: '1px dashed #000', margin: '2px 0' }} />

      {/* Métodos de pago */}
      <div style={{ fontSize: '12px' }}>
        <div style={{ marginBottom: '1px' }}>MÉTODOS DE PAGO</div>
        {data.cashSales     > 0 && <div>{pad('  Efectivo:', `${cur} ${data.cashSales.toFixed(2)}`)}</div>}
        {data.cardSales     > 0 && <div>{pad('  Tarjeta:', `${cur} ${data.cardSales.toFixed(2)}`)}</div>}
        {data.transferSales > 0 && <div>{pad('  Transferencia:', `${cur} ${data.transferSales.toFixed(2)}`)}</div>}
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '2px 0' }} />

      {/* Total */}
      <div style={{ fontSize: '12px' }}>
        <div>{pad('Total pedidos:', `${data.totalOrders}`)}</div>
        <div style={{ fontSize: '15px', marginTop: '1px' }}>
          {pad('TOTAL VENTAS:', `${cur} ${data.totalSales.toFixed(2)}`)}
        </div>
      </div>

      {/* Arqueo */}
      {s.type === 'pos' && (
        <>
          <div style={{ borderTop: '1px dashed #000', margin: '2px 0' }} />
          <div style={{ fontSize: '12px' }}>
            <div style={{ marginBottom: '1px' }}>ARQUEO DE CAJA</div>
            <div>{pad('  Efectivo inicial:', `${cur} ${Number(s.openingAmount).toFixed(2)}`)}</div>
            <div>{pad('  Ventas efectivo:', `${cur} ${data.cashSales.toFixed(2)}`)}</div>
            <div>{pad('  Esperado en caja:', `${cur} ${data.expectedCash.toFixed(2)}`)}</div>
            {data.closingAmount !== null && <div>{pad('  Contado:', `${cur} ${data.closingAmount.toFixed(2)}`)}</div>}
            {data.difference !== null && (
              <div style={{ fontWeight: 'bold' }}>
                {pad('  Diferencia:', `${data.difference >= 0 ? '+' : ''}${cur} ${data.difference.toFixed(2)}`)}
              </div>
            )}
          </div>
        </>
      )}

      {/* Footer */}
      <div style={{ borderTop: '1px dashed #000', marginTop: '3px', paddingTop: '2px', textAlign: 'center', fontSize: '11px' }}>
        <div>Impreso: {new Date().toLocaleString('es-ES')}</div>
      </div>
    </div>
  );
}
