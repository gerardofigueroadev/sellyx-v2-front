// Voucher térmico (80mm) del reporte semanal PedidosYa. Mismo estilo que
// ShiftPrintReceipt pero compacto: solo productos, cantidad de pedidos y total.

export interface PedidosYaReceiptData {
  from: string; // YYYY-MM-DD
  to: string;
  count: number;
  total: number;
  products: { name: string; qty: number; total: number }[];
}

function fmtDay(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}
function pad(left: string, right: string, width = 30) {
  const gap = width - left.length - right.length;
  return left + ' '.repeat(Math.max(1, gap)) + right;
}

const cell = { padding: '0 3px', lineHeight: '1.05', border: '1px solid #000' } as const;

export default function PedidosYaPrintReceipt({ data, orgName, currency = 'Bs.' }: {
  data: PedidosYaReceiptData; orgName: string; currency?: string;
}) {
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
      <div style={{ textAlign: 'center', marginBottom: '3px' }}>
        <div style={{ fontSize: '15px' }}>{orgName}</div>
        <div style={{ marginTop: '2px', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '2px 0', fontSize: '12px' }}>
          PEDIDOSYA SEMANAL
        </div>
        <div style={{ fontSize: '12px', marginTop: '2px' }}>{fmtDay(data.from)} al {fmtDay(data.to)}</div>
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '2px 0' }} />

      {data.products.length === 0 ? (
        <div style={{ textAlign: 'center', fontSize: '12px' }}>Sin pedidos en la semana</div>
      ) : (
        <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', tableLayout: 'fixed', border: '1px solid #000' }}>
          <thead>
            <tr>
              <th style={{ ...cell, textAlign: 'left' }}>Producto</th>
              <th style={{ ...cell, textAlign: 'right', width: '34px' }}>Cant</th>
              <th style={{ ...cell, textAlign: 'right', width: '80px' }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {data.products.map((p, i) => (
              <tr key={i}>
                <td style={{ ...cell, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{p.qty}</td>
                <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>{cur}{p.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ borderTop: '1px dashed #000', margin: '2px 0' }} />

      <div style={{ fontSize: '12px' }}>
        <div>{pad('Total pedidos:', `${data.count}`)}</div>
        <div style={{ fontSize: '15px', marginTop: '1px' }}>{pad('TOTAL:', `${cur} ${data.total.toFixed(2)}`)}</div>
      </div>

      <div style={{ borderTop: '1px dashed #000', marginTop: '3px', paddingTop: '2px', textAlign: 'center', fontSize: '11px' }}>
        <div>Impreso: {new Date().toLocaleString('es-ES')}</div>
      </div>
    </div>
  );
}
