// Ticket doble: cliente (arriba) + cocina (abajo), separados por línea de corte

export interface OrderTicketData {
  ticketNumber: number;
  orderNumber: string;
  paymentMethod: string;
  orderType?: 'dine_in' | 'takeaway';
  items: { name: string; quantity: number; unitPrice: number; subtotal: number; notes?: string }[];
  total: number;
  notes?: string;
  branchName: string;
  orgName: string;
  cashierName?: string;
  createdAt: string;
  currency?: string;
}

const PAY_LABEL: Record<string, string> = {
  cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia',
};

function pad(left: string, right: string, width = 30) {
  const gap = width - left.length - right.length;
  return left + ' '.repeat(Math.max(1, gap)) + right;
}

function ClientTicket({ d, cur }: { d: OrderTicketData; cur: string }) {
  return (
    <div style={{ fontFamily: "'Courier New', Courier, monospace", fontSize: '12px', width: '272px', lineHeight: '1.4', color: '#000' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '6px' }}>
        <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{d.orgName}</div>
        <div style={{ fontSize: '11px' }}>{d.branchName}</div>
        <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '2px 0', marginTop: '4px', fontSize: '11px' }}>
          TICKET DE VENTA
        </div>
      </div>

      {/* Info */}
      <div style={{ fontSize: '11px', marginBottom: '4px' }}>
        <div>{pad('Ticket #:', String(d.ticketNumber))}</div>
        <div>{pad('Fecha:', new Date(d.createdAt).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))}</div>
        {d.cashierName && <div>{pad('Cajero:', d.cashierName)}</div>}
        <div>{pad('Pago:', PAY_LABEL[d.paymentMethod] ?? d.paymentMethod)}</div>
        {d.orderType && (
          <div style={{ fontWeight: 'bold' }}>{pad('Tipo:', d.orderType === 'takeaway' ? '🥡 Para llevar' : '🍽️ Para mesa')}</div>
        )}
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

      {/* Items */}
      <div style={{ fontSize: '11px' }}>
        <div style={{ fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '2px', marginBottom: '3px' }}>
          {pad('Producto', 'Cant   Total')}
        </div>
        {d.items.map((item, i) => (
          <div key={i} style={{ marginBottom: '2px' }}>
            <div style={{ fontWeight: 'bold' }}>{item.name}</div>
            <div>{pad(`  ${cur}${item.unitPrice.toFixed(2)} c/u`, `${item.quantity}x  ${cur}${item.subtotal.toFixed(2)}`)}</div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

      {/* Total */}
      <div style={{ fontWeight: 'bold', fontSize: '14px', textAlign: 'center' }}>
        {pad('TOTAL:', `${cur} ${d.total.toFixed(2)}`)}
      </div>

      {d.notes && (
        <div style={{ fontSize: '10px', marginTop: '4px', fontStyle: 'italic' }}>Nota: {d.notes}</div>
      )}

      <div style={{ textAlign: 'center', fontSize: '10px', marginTop: '6px', borderTop: '1px dashed #000', paddingTop: '4px' }}>
        ¡Gracias por su preferencia!
      </div>
    </div>
  );
}

function KitchenTicket({ d }: { d: OrderTicketData }) {
  return (
    <div style={{ fontFamily: "'Courier New', Courier, monospace", fontSize: '13px', width: '272px', lineHeight: '1.6', color: '#000' }}>
      <div style={{ textAlign: 'center', marginBottom: '4px' }}>
        <div style={{ fontWeight: 'bold', fontSize: '16px' }}>*** COCINA ***</div>
        <div style={{ fontWeight: 'bold', fontSize: '22px' }}>#{d.ticketNumber}</div>
        {d.orderType && (
          <div style={{ fontWeight: 'bold', fontSize: '15px', border: '2px solid #000', display: 'inline-block', padding: '1px 8px', marginTop: '2px' }}>
            {d.orderType === 'takeaway' ? '🥡 PARA LLEVAR' : '🍽️ PARA MESA'}
          </div>
        )}
        <div style={{ fontSize: '11px', marginTop: '2px' }}>
          {new Date(d.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      <div style={{ borderTop: '2px solid #000', margin: '4px 0' }} />

      {/* Items — grande y claro */}
      <div>
        {d.items.map((item, i) => (
          <div key={i} style={{ marginBottom: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px' }}>
              <span>{item.name}</span>
              <span style={{ marginLeft: '8px' }}>x{item.quantity}</span>
            </div>
            {item.notes && (
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#000', paddingLeft: '4px', borderLeft: '3px solid #000', marginTop: '2px' }}>
                ⚠ {item.notes}
              </div>
            )}
          </div>
        ))}
      </div>

      {d.notes && (
        <>
          <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
          <div style={{ fontSize: '12px', fontWeight: 'bold' }}>NOTA: {d.notes}</div>
        </>
      )}

      <div style={{ borderTop: '2px solid #000', marginTop: '6px' }} />
    </div>
  );
}

// Componente principal: cliente arriba, línea de corte, cocina abajo
export default function OrderTicket({ data }: { data: OrderTicketData }) {
  const cur = data.currency ?? 'Bs.';
  return (
    <div id="thermal-print-area">
      {/* Ticket cliente */}
      <ClientTicket d={data} cur={cur} />

      {/* Línea de corte */}
      <div style={{
        textAlign: 'center', fontSize: '10px', color: '#666',
        margin: '8px 0', borderTop: '1px dashed #999', borderBottom: '1px dashed #999',
        padding: '2px 0', letterSpacing: '2px',
      }}>
        ✂ - - - - - - - - - - - - - - - ✂
      </div>

      {/* Ticket cocina */}
      <KitchenTicket d={data} />
    </div>
  );
}
