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
function pad(left: string, right: string, width = 32) {
  const gap = width - left.length - right.length;
  return left + ' '.repeat(Math.max(1, gap)) + right;
}

export default function ShiftPrintReceipt({ data, orgName }: { data: ShiftReportData; orgName: string }) {
  const s = data.shift;
  return (
    <div id="thermal-print-area" style={{
      fontFamily: "'Courier New', Courier, monospace",
      fontSize: '12px',
      width: '302px',
      padding: '8px',
      backgroundColor: '#fff',
      color: '#000',
      lineHeight: '1.4',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '6px' }}>
        <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{orgName}</div>
        <div style={{ fontSize: '11px' }}>{s.branch.name}</div>
        <div style={{ marginTop: '4px', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '3px 0', fontSize: '11px' }}>
          CIERRE DE TURNO
        </div>
      </div>

      {/* Info turno */}
      <div style={{ fontSize: '11px', marginBottom: '4px' }}>
        <div>{pad('Cajero:', s.user?.name ?? 'Sistema')}</div>
        <div>{pad('Apertura:', `${fmt(s.openedAt)} ${fmtTime(s.openedAt)}`)}</div>
        {s.closedAt && <div>{pad('Cierre:', `${fmt(s.closedAt)} ${fmtTime(s.closedAt)}`)}</div>}
        <div>{pad('Duración:', dur(s.openedAt, s.closedAt))}</div>
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

      {/* Productos */}
      <div style={{ fontWeight: 'bold', textAlign: 'center', marginBottom: '3px' }}>DETALLE DE VENTAS</div>
      <div style={{ fontSize: '11px' }}>
        <div style={{ fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '2px', marginBottom: '2px' }}>
          {pad('Producto', 'Cant  Subtotal')}
        </div>
        {data.products.length === 0 && (
          <div style={{ textAlign: 'center', color: '#666' }}>Sin ventas en este turno</div>
        )}
        {data.products.map((p, i) => (
          <div key={i}>
            <div style={{ fontWeight: 'bold' }}>{p.name}</div>
            <div>{pad(`  Bs.${p.unitPrice.toFixed(2)} c/u`, `${p.totalQty}x  Bs.${p.totalSubtotal.toFixed(2)}`)}</div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

      {/* Métodos de pago */}
      <div style={{ fontSize: '11px' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>MÉTODOS DE PAGO</div>
        {data.cashSales     > 0 && <div>{pad('  Efectivo:', `Bs. ${data.cashSales.toFixed(2)}`)}</div>}
        {data.cardSales     > 0 && <div>{pad('  Tarjeta:', `Bs. ${data.cardSales.toFixed(2)}`)}</div>}
        {data.transferSales > 0 && <div>{pad('  Transferencia:', `Bs. ${data.transferSales.toFixed(2)}`)}</div>}
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

      {/* Total */}
      <div style={{ fontSize: '12px' }}>
        <div>{pad('Total pedidos:', `${data.totalOrders}`)}</div>
        <div style={{ fontWeight: 'bold', fontSize: '14px', marginTop: '2px' }}>
          {pad('TOTAL VENTAS:', `Bs. ${data.totalSales.toFixed(2)}`)}
        </div>
      </div>

      {/* Arqueo */}
      {s.type === 'pos' && (
        <>
          <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
          <div style={{ fontSize: '11px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>ARQUEO DE CAJA</div>
            <div>{pad('  Efectivo inicial:', `Bs. ${Number(s.openingAmount).toFixed(2)}`)}</div>
            <div>{pad('  Ventas efectivo:', `Bs. ${data.cashSales.toFixed(2)}`)}</div>
            <div>{pad('  Esperado en caja:', `Bs. ${data.expectedCash.toFixed(2)}`)}</div>
            {data.closingAmount !== null && <div>{pad('  Contado:', `Bs. ${data.closingAmount.toFixed(2)}`)}</div>}
            {data.difference !== null && (
              <div style={{ fontWeight: 'bold' }}>
                {pad('  Diferencia:', `${data.difference >= 0 ? '+' : ''}Bs. ${data.difference.toFixed(2)}`)}
              </div>
            )}
          </div>
        </>
      )}

      {/* Footer */}
      <div style={{ borderTop: '1px dashed #000', marginTop: '6px', paddingTop: '4px', textAlign: 'center', fontSize: '10px' }}>
        <div>Impreso: {new Date().toLocaleString('es-ES')}</div>
        <div style={{ marginTop: '2px' }}>— Gracias —</div>
      </div>
    </div>
  );
}
