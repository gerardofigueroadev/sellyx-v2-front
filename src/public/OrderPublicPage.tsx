import { useEffect, useMemo, useRef, useState } from 'react';
import API_URL from '../config';

const API = `${API_URL}/api`;

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Branch { id: number; name: string; whatsappPhone?: string; isOpen?: boolean }
interface Ctx { orgName: string; currency: string; whatsappPhone: string; branches: Branch[] }
interface Product { id: number; name: string; price: number; emoji: string | null; category: string | null }
type OrderType = 'takeaway' | 'delivery';
type PaymentMethod = 'cash' | 'qr';
type Step = 'branch' | 'menu' | 'checkout' | 'qr_pending' | 'confirm';

interface Confirmation { orderNumber: string; ticketNumber: number; total: number }

// Quita el código de país de Bolivia (591) y deja solo dígitos.
// El bot manda "59178590523"; mostramos y guardamos "78590523".
function normalizePhone(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.startsWith('591') ? digits.slice(3) : digits;
}

// ── Parseo de la URL: /order/:token?phone=...&branch=...&type=... ──────────────
function parseUrl() {
  const parts = window.location.pathname.split('/').filter(Boolean); // ['order', '<token>']
  const token = parts[1] ?? '';
  const qs = new URLSearchParams(window.location.search);
  const phone = normalizePhone(qs.get('phone') ?? '');
  const rawType = qs.get('type');
  // Tipo preseleccionado desde el chat (solo takeaway/delivery son válidos aquí).
  const presetType: OrderType | null = rawType === 'delivery' || rawType === 'takeaway' ? rawType : null;
  // Sucursal preseleccionada por el link (?branch=3). Si el bot ya sabe la
  // sucursal, salta el paso de elegirla. El backend valida que sea de la org.
  const rawBranch = qs.get('branch');
  const presetBranchId = rawBranch && /^\d+$/.test(rawBranch) ? Number(rawBranch) : null;
  return { token, phone, presetType, presetBranchId };
}

const money = (n: number, cur: string) => `${n.toFixed(2)}${cur ? ' ' + cur : ''}`;

export default function OrderPublicPage() {
  const { token, phone: phoneFromLink, presetType, presetBranchId } = useMemo(parseUrl, []);

  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('branch');

  const [branch, setBranch] = useState<Branch | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [qty, setQty] = useState<Record<number, number>>({}); // productId -> cantidad

  const [orderType, setOrderType] = useState<OrderType>(presetType ?? 'takeaway');
  // Si delivery vino del chat, el pago arranca en QR (delivery solo paga QR).
  const [payment, setPayment] = useState<PaymentMethod>(presetType === 'delivery' ? 'qr' : 'cash');
  const [phone, setPhone] = useState(phoneFromLink);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  // QR real (BISA): imagen + alias para el polling, y estado del flujo.
  // 'idle'    → aún no se pidió el QR
  // 'loading' → generando el QR con BISA
  // 'showing' → QR visible, esperando el pago (polling)
  // 'paying'  → detectado el pago, confirmando (el backend crea el pedido)
  // 'paid'    → pedido confirmado
  // 'error'   → no se pudo generar el QR
  const [qrPay, setQrPay] = useState<'idle' | 'loading' | 'showing' | 'paying' | 'paid' | 'error'>('idle');
  const [qrImg, setQrImg] = useState<string | null>(null);
  const [qrAlias, setQrAlias] = useState<string | null>(null);
  const [qrErr, setQrErr] = useState<string | null>(null);
  // Guard anti-duplicado: evita generar dos QR (StrictMode / re-render).
  const qrGenRef = useRef(false);
  // Wizard del menú por categorías.
  const [catIndex, setCatIndex] = useState(0);
  const [showCart, setShowCart] = useState(false);

  const cur = ctx?.currency ?? '';

  // Cargar contexto (org + sucursales)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/public/order/${token}`);
        if (!res.ok) throw new Error('no encontrado');
        const data: Ctx = await res.json();
        setCtx(data);
        // Preselección de sucursal: por ?branch= del link, o auto si hay una sola.
        // Solo saltamos el paso de elegir si la sucursal está ABIERTA (turno POS
        // activo). Si está cerrada, dejamos el paso 'branch' para mostrar su estado.
        const preset = presetBranchId != null
          ? data.branches.find((b) => b.id === presetBranchId)
          : (data.branches.length === 1 ? data.branches[0] : undefined);
        if (preset && preset.isOpen !== false) {
          setBranch(preset);
        }
      } catch {
        setLoadErr('Este enlace no es válido o ya no está disponible.');
      }
    })();
  }, [token, presetBranchId]);

  // Cuando ya hay branch seleccionada (auto o manual), cargar productos y avanzar.
  useEffect(() => {
    if (!branch) return;
    setLoadingProducts(true);
    (async () => {
      try {
        const res = await fetch(`${API}/public/order/${token}/products?branchId=${branch.id}`);
        const data: Product[] = res.ok ? await res.json() : [];
        setProducts(data);
        setStep('menu');
      } finally {
        setLoadingProducts(false);
      }
    })();
  }, [branch, token]);

  // Si delivery, forzar QR (delivery solo se paga con QR).
  useEffect(() => {
    if (orderType === 'delivery') setPayment('qr');
  }, [orderType]);

  const cartItems = products.filter((p) => (qty[p.id] ?? 0) > 0);
  const total = cartItems.reduce((s, p) => s + p.price * (qty[p.id] ?? 0), 0);
  const totalUnits = cartItems.reduce((s, p) => s + (qty[p.id] ?? 0), 0);

  // Categorías en su orden de aparición (el backend ya ordena por sortOrder).
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const p of products) {
      const c = p.category || 'Otros';
      if (!seen.includes(c)) seen.push(c);
    }
    return seen;
  }, [products]);
  const currentCat = categories[catIndex];
  const catProducts = products.filter((p) => (p.category || 'Otros') === currentCat);
  const isLastCat = catIndex >= categories.length - 1;

  const inc = (id: number) => setQty((q) => ({ ...q, [id]: (q[id] ?? 0) + 1 }));
  const dec = (id: number) => setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) - 1) }));

  // Validación de los datos del cliente antes de enviar/pagar.
  const dataError = (): string | null => {
    if (phone.trim().length < 5) return 'Ingresa un teléfono válido.';
    if (name.trim().length < 2) return 'Ingresa tu nombre.';
    if (orderType === 'delivery' && address.trim().length < 5) return 'Ingresa la dirección de entrega.';
    return null;
  };

  // Payload común de datos del pedido (para crear orden efectivo o generar QR).
  const orderPayload = () => ({
    branchId: branch?.id,
    phone: phone.trim(),
    name: name.trim() || undefined,
    address: orderType === 'delivery' ? address.trim() || undefined : undefined,
    notes: notes.trim() || undefined,
    items: cartItems.map((p) => ({ productId: p.id, quantity: qty[p.id] })),
    orderType,
  });

  // Crea el pedido EN EFECTIVO (el flujo QR NO usa esto: el backend crea la orden
  // en el callback de pago). Devuelve true si se creó.
  const submitCash = async (): Promise<boolean> => {
    const err = dataError();
    if (!branch || cartItems.length === 0 || err) { setSubmitErr(err); return false; }
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const res = await fetch(`${API}/public/order/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...orderPayload(), paymentMethod: 'cash' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'No se pudo crear el pedido');
      setConfirmation({ orderNumber: data.orderNumber, ticketNumber: data.ticketNumber, total: data.total });
      setStep('confirm');
      return true;
    } catch (e) {
      setSubmitErr((e as Error).message);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  // Al detectar el pago del QR: el pedido YA lo creó el backend en el callback.
  // Aquí solo recuperamos los datos de confirmación y mostramos la pantalla final
  // con descarga de comprobante. Reintentamos un par de veces porque el callback
  // puede tardar un instante en crear la orden tras marcar el pago.
  const onQrPaid = async () => {
    setQrPay('paying');
    const info = await fetchQrOrder(qrAlias);
    if (info) setConfirmation(info);
    setQrPay('paid');
    setStep('confirm');
  };

  // Recupera la orden creada a partir del QR pagado (con reintentos cortos).
  const fetchQrOrder = async (alias: string | null): Promise<Confirmation | null> => {
    if (!alias) return null;
    for (let i = 0; i < 5; i++) {
      try {
        const res = await fetch(`${API}/public/order/${token}/qr/${alias}/order`);
        if (res.ok) {
          const d = await res.json();
          if (d?.orderNumber) {
            return { orderNumber: d.orderNumber, ticketNumber: d.ticketNumber, total: d.total };
          }
        }
      } catch {
        // reintentar
      }
      await new Promise((r) => setTimeout(r, 1200));
    }
    return null;
  };

  // Genera el QR de pago con BISA al entrar al paso qr_pending. Enviamos TODOS
  // los datos del pedido para que el backend pueda CREAR la orden cuando el pago
  // entre (aunque el cliente cierre esta pestaña).
  const generateQr = async () => {
    setQrPay('loading');
    setQrErr(null);
    setQrImg(null);
    setQrAlias(null);
    try {
      const res = await fetch(`${API}/public/order/${token}/qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'No se pudo generar el QR');
      setQrImg(data.imagenQr);
      setQrAlias(data.alias);
      setQrPay('showing');
    } catch (e) {
      setQrErr((e as Error).message);
      setQrPay('error');
      // Permitir reintentar (el botón "Reintentar" vuelve a llamar generateQr).
      qrGenRef.current = false;
    }
  };

  // Al entrar al paso qr_pending, generar el QR una sola vez. El guard evita
  // que StrictMode (doble montaje) o un re-render generen dos QR en BISA.
  useEffect(() => {
    if (step === 'qr_pending' && qrPay === 'idle' && !qrGenRef.current) {
      qrGenRef.current = true;
      generateQr();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Polling del estado del QR mientras está visible; al pagar, dispara onQrPaid.
  useEffect(() => {
    if (qrPay !== 'showing' || !qrAlias) return;
    let stop = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`${API}/public/order/${token}/qr/${qrAlias}/status`);
        if (!res.ok) return;
        const data = await res.json();
        if (stop) return;
        if (data.status === 'paid') {
          clearInterval(id);
          onQrPaid();
        } else if (data.status === 'disabled') {
          clearInterval(id);
          setQrErr('Este QR fue anulado. Genera uno nuevo.');
          setQrPay('error');
        }
      } catch {
        // Ignorar fallos puntuales de red; el intervalo reintenta.
      }
    }, 3500);
    return () => { stop = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrPay, qrAlias, token]);

  // URL del comprobante PNG (descarga / compartir).
  const receiptUrl = confirmation
    ? `${API}/public/order/${token}/receipt/${encodeURIComponent(confirmation.orderNumber)}`
    : '';

  // WhatsApp de la sucursal elegida (fallback al de la org/bot).
  const shareWhatsappPhone = branch?.whatsappPhone || ctx?.whatsappPhone || '';

  // Descarga el comprobante como archivo.
  const downloadReceipt = async () => {
    if (!receiptUrl) return;
    try {
      const res = await fetch(receiptUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comprobante-${confirmation?.ticketNumber ?? 'pedido'}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: abrir en una pestaña para guardar manualmente.
      window.open(receiptUrl, '_blank');
    }
  };

  // Comparte el comprobante por el WhatsApp de la sucursal. Adjuntar imágenes por
  // wa.me no es posible; enviamos un texto con el N° de pedido para que el cliente
  // lo confirme con la sucursal (y ya descargó/descarga la imagen aparte).
  const shareOnWhatsapp = () => {
    const msg = encodeURIComponent(
      `Hola! Mi pedido *#${confirmation?.ticketNumber}* (${confirmation?.orderNumber}). Adjunto mi comprobante.`,
    );
    const url = shareWhatsappPhone
      ? `https://wa.me/${shareWhatsappPhone}?text=${msg}`
      : `https://wa.me/?text=${msg}`;
    window.open(url, '_blank');
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loadErr) return <Shell><Centered>{loadErr}</Centered></Shell>;
  if (!ctx) return <Shell><Centered><Spinner /></Centered></Shell>;

  return (
    <Shell>
      {/* Header */}
      <div className="text-center mb-4">
        <h1 className="text-xl font-bold text-white">{ctx.orgName}</h1>
        {branch && step !== 'branch' && <p className="text-emerald-400 text-sm">{branch.name}</p>}
      </div>

      {step === 'branch' && (
        <Card>
          <h2 className="text-white font-semibold mb-3">Elige la sucursal</h2>
          {ctx.branches.every((b) => b.isOpen === false) && (
            <p className="text-amber-400 text-sm mb-3 bg-amber-500/10 rounded-xl px-3 py-2">
              🕘 Por ahora no hay sucursales abiertas para recibir pedidos. Intenta más tarde.
            </p>
          )}
          <div className="space-y-2">
            {ctx.branches.map((b) => {
              const closed = b.isOpen === false;
              return (
                <button key={b.id} onClick={() => !closed && setBranch(b)} disabled={closed}
                  className={`w-full text-left px-4 py-3 rounded-xl border flex items-center justify-between transition ${
                    closed
                      ? 'bg-slate-800/40 border-slate-700 text-slate-500 cursor-not-allowed'
                      : 'bg-slate-700/60 hover:bg-slate-700 text-white border-slate-600'
                  }`}>
                  <span>{b.name}</span>
                  {closed && <span className="text-[11px] font-medium text-slate-500">Cerrado</span>}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {step === 'menu' && (
        <>
          <Card>
            {loadingProducts ? <Spinner /> : products.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">No hay productos disponibles.</p>
            ) : (
              <>
                {/* Progreso de secciones */}
                <div className="flex items-center gap-1.5 mb-3">
                  {categories.map((c, i) => (
                    <div key={c} className={`h-1.5 flex-1 rounded-full ${i <= catIndex ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                  ))}
                </div>
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-white font-semibold">{currentCat}</h2>
                  <span className="text-slate-500 text-xs">{catIndex + 1} de {categories.length}</span>
                </div>

                <div className="space-y-2">
                  {catProducts.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 py-2 border-b border-slate-700/40 last:border-0">
                      <div className="min-w-0">
                        <p className="text-white text-sm truncate">{p.name}</p>
                        <p className="text-slate-400 text-xs">{money(p.price, cur)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => dec(p.id)} disabled={!qty[p.id]}
                          className="w-8 h-8 rounded-lg bg-slate-700 text-white text-lg disabled:opacity-30">−</button>
                        <span className="w-6 text-center text-white text-sm">{qty[p.id] ?? 0}</span>
                        <button onClick={() => inc(p.id)}
                          className="w-8 h-8 rounded-lg bg-emerald-600 text-white text-lg">+</button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Navegación entre secciones */}
                <div className="flex gap-2 mt-5">
                  {catIndex > 0 && (
                    <button onClick={() => setCatIndex((i) => i - 1)}
                      className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-xl text-sm font-medium">
                      ← Atrás
                    </button>
                  )}
                  {!isLastCat ? (
                    <button onClick={() => setCatIndex((i) => i + 1)}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl text-sm font-medium">
                      Siguiente →
                    </button>
                  ) : (
                    <button onClick={() => setStep('checkout')} disabled={totalUnits === 0}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-2.5 rounded-xl text-sm font-medium">
                      Continuar al pago
                    </button>
                  )}
                </div>
              </>
            )}
          </Card>

          {/* Barra fija: total acumulado + ver carrito */}
          <StickyBar>
            <button onClick={() => totalUnits > 0 && setShowCart(true)}
              className="text-white text-sm text-left disabled:opacity-60" disabled={totalUnits === 0}>
              <span className="text-slate-400">{totalUnits} item(s) · </span>
              <span className="font-bold">{money(total, cur)}</span>
              {totalUnits > 0 && <span className="text-emerald-400 text-xs ml-2 underline">ver</span>}
            </button>
            {isLastCat ? (
              <button onClick={() => setStep('checkout')} disabled={totalUnits === 0}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-5 py-2 rounded-xl text-sm font-medium">
                Pagar
              </button>
            ) : (
              <button onClick={() => setCatIndex((i) => i + 1)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl text-sm font-medium">
                Siguiente
              </button>
            )}
          </StickyBar>
        </>
      )}

      {/* Modal: ver/editar carrito acumulado */}
      {showCart && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50" onClick={() => setShowCart(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl p-5 max-w-md w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold">Tu pedido</h3>
              <button onClick={() => setShowCart(false)} className="text-slate-400 text-sm">Cerrar</button>
            </div>
            {cartItems.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">Aún no agregaste nada.</p>
            ) : (
              <div className="space-y-2">
                {cartItems.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2">
                    <p className="text-white text-sm min-w-0 truncate">{p.name}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => dec(p.id)} className="w-7 h-7 rounded-lg bg-slate-700 text-white">−</button>
                      <span className="w-5 text-center text-white text-sm">{qty[p.id]}</span>
                      <button onClick={() => inc(p.id)} className="w-7 h-7 rounded-lg bg-emerald-600 text-white">+</button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between text-white font-bold text-sm pt-2 border-t border-slate-600/50">
                  <span>Total</span><span>{money(total, cur)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {step === 'checkout' && (
        <>
          <Card>
            <button onClick={() => setStep('menu')} className="text-slate-400 text-xs mb-3">← Volver al menú</button>
            <h2 className="text-white font-semibold mb-3">¿Cómo lo quieres?</h2>

            {/* Tipo de entrega. Si vino preseleccionado del chat, se muestra fijo. */}
            <div className="grid grid-cols-2 gap-2 mb-1">
              {([['takeaway', '🥡', 'Recoger en local'], ['delivery', '🛵', 'Delivery']] as const).map(([key, emoji, label]) => {
                const selected = orderType === key;
                const locked = presetType != null;
                if (locked && !selected) return null; // si está bloqueado, solo mostramos el elegido
                return (
                  <button key={key} onClick={() => !locked && setOrderType(key)} disabled={locked}
                    className={`p-3 rounded-xl border text-center transition ${selected ? 'border-emerald-500 bg-emerald-600/15 text-white' : 'border-slate-600 bg-slate-700/40 text-slate-300'} ${locked ? 'col-span-2 cursor-default' : ''}`}>
                    <div className="text-xl">{emoji}</div>
                    <div className="text-xs mt-1">{label}</div>
                  </button>
                );
              })}
            </div>
            {presetType != null && <p className="text-slate-500 text-xs mb-4">Elegiste esto en el chat 👌</p>}
            {presetType == null && <div className="mb-4" />}

            {/* Medio de pago (condicional) */}
            <h3 className="text-white text-sm font-medium mb-2">Medio de pago</h3>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button onClick={() => orderType === 'takeaway' && setPayment('cash')}
                disabled={orderType === 'delivery'}
                className={`p-3 rounded-xl border text-center transition ${payment === 'cash' ? 'border-emerald-500 bg-emerald-600/15 text-white' : 'border-slate-600 bg-slate-700/40 text-slate-300'} ${orderType === 'delivery' ? 'opacity-30 cursor-not-allowed' : ''}`}>
                💵<div className="text-xs mt-1">Efectivo</div>
              </button>
              <button onClick={() => setPayment('qr')}
                className={`p-3 rounded-xl border text-center transition ${payment === 'qr' ? 'border-emerald-500 bg-emerald-600/15 text-white' : 'border-slate-600 bg-slate-700/40 text-slate-300'}`}>
                📱<div className="text-xs mt-1">QR</div>
              </button>
            </div>
            {orderType === 'delivery' && <p className="text-slate-500 text-xs mb-3">El delivery solo admite pago con QR.</p>}

            {/* Nombre */}
            <h3 className="text-white text-sm font-medium mb-2 mt-3">Tu nombre</h3>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Juan Pérez"
              className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />

            {/* Teléfono */}
            <h3 className="text-white text-sm font-medium mb-2 mt-3">Tu teléfono</h3>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ej: 59178590523"
              className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />

            {/* Dirección (solo delivery) */}
            {orderType === 'delivery' && (
              <>
                <h3 className="text-white text-sm font-medium mb-2 mt-3">Dirección de entrega</h3>
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2}
                  placeholder="Calle, número, zona y una referencia"
                  className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
              </>
            )}

            {/* Notas */}
            <h3 className="text-white text-sm font-medium mb-2 mt-3">Notas <span className="text-slate-500 font-normal">(opcional)</span></h3>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Ej: sin cebolla, incluir cubiertos…"
              className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />

            {/* Resumen */}
            <div className="mt-4 bg-slate-700/30 rounded-xl p-3 space-y-1">
              {cartItems.map((p) => (
                <div key={p.id} className="flex justify-between text-xs text-slate-300">
                  <span>{qty[p.id]}× {p.name}</span>
                  <span>{money(p.price * qty[p.id], cur)}</span>
                </div>
              ))}
              <div className="flex justify-between text-white font-bold text-sm pt-1 border-t border-slate-600/50">
                <span>Total</span><span>{money(total, cur)}</span>
              </div>
            </div>

            {submitErr && <p className="text-red-400 text-xs mt-3">{submitErr}</p>}
          </Card>
          <StickyBar>
            <div className="text-white text-sm font-bold">{money(total, cur)}</div>
            <button
              onClick={() => {
                const err = dataError();
                if (err) { setSubmitErr(err); return; }
                setSubmitErr(null);
                payment === 'qr' ? setStep('qr_pending') : submitCash();
              }}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-5 py-2 rounded-xl text-sm font-medium flex items-center gap-2">
              {submitting && <Spinner small />}
              {payment === 'qr' ? 'Continuar al pago' : 'Confirmar pedido'}
            </button>
          </StickyBar>
        </>
      )}

      {step === 'qr_pending' && (
        <Card>
          {(qrPay === 'showing' || qrPay === 'error') && (
            <button
              onClick={() => { setStep('checkout'); setQrPay('idle'); qrGenRef.current = false; }}
              className="text-slate-400 text-xs mb-3">← Volver</button>
          )}
          <div className="text-center py-4">
            <div className="text-5xl mb-3">📱</div>
            <h2 className="text-white font-bold text-lg">Pago con QR</h2>
            <p className="text-slate-400 text-sm mt-3">Escanea el QR con la app de tu banco:</p>
            <p className="text-white font-bold text-xl mt-1">{money(total, cur)}</p>

            {/* Área del QR según estado */}
            <div className="mt-4 mx-auto w-56 h-56 bg-white rounded-xl flex items-center justify-center overflow-hidden">
              {qrPay === 'loading' && <Spinner />}
              {qrPay === 'error' && (
                <span className="text-red-500 text-xs px-3 text-center">{qrErr ?? 'Error al generar el QR'}</span>
              )}
              {(qrPay === 'showing' || qrPay === 'paying' || qrPay === 'paid') && qrImg && (
                <img src={`data:image/png;base64,${qrImg}`} alt="QR de pago" className="w-full h-full object-contain p-2" />
              )}
            </div>

            {qrPay === 'showing' && (
              <>
                <p className="text-slate-500 text-xs mt-4 flex items-center justify-center gap-2">
                  <Spinner small /> Esperando el pago...
                </p>
                <p className="text-slate-600 text-[11px] mt-2 px-4">
                  Tu pedido se registra automáticamente al confirmarse el pago, aunque cierres esta ventana.
                </p>
              </>
            )}
            {qrPay === 'error' && (
              <button
                onClick={generateQr}
                className="mt-5 w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl text-sm font-medium">
                Reintentar
              </button>
            )}
          </div>
        </Card>
      )}

      {/* Popup mientras se confirma el pago QR (el backend crea el pedido) */}
      {qrPay === 'paying' && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-xs w-full text-center">
            <Spinner />
            <p className="text-white text-sm mt-3">Confirmando tu pago...</p>
          </div>
        </div>
      )}

      {step === 'confirm' && confirmation && (
        <Card>
          <div className="text-center py-4">
            <div className="text-5xl mb-3">✅</div>
            <h2 className="text-white font-bold text-lg">
              {payment === 'qr' ? '¡Pago recibido!' : '¡Pedido enviado!'}
            </h2>
            <p className="text-slate-400 text-sm mt-1">Tu pedido fue recibido por {ctx.orgName}.</p>
            <div className="mt-4 bg-slate-700/40 rounded-xl p-4 inline-block">
              <p className="text-slate-400 text-xs">N° de pedido</p>
              <p className="text-white font-mono font-bold">{confirmation.orderNumber}</p>
              <p className="text-emerald-400 text-2xl font-bold mt-2">#{confirmation.ticketNumber}</p>
              <p className="text-white text-sm mt-2">Total: {money(confirmation.total, cur)}</p>
            </div>

            {/* Comprobante: previsualización + descarga + compartir por WhatsApp */}
            <div className="mt-5">
              <img src={receiptUrl} alt="Comprobante"
                className="mx-auto max-w-[220px] w-full rounded-lg border border-slate-700 bg-white" />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2">
              <button onClick={downloadReceipt}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl text-sm font-medium">
                ⬇️ Descargar comprobante
              </button>
              <button onClick={shareOnWhatsapp}
                className="w-full bg-[#25D366] hover:brightness-95 text-white py-2.5 rounded-xl text-sm font-medium">
                Compartir por WhatsApp
              </button>
            </div>

            <p className="text-slate-500 text-xs mt-4">Ya puedes cerrar esta ventana.</p>
          </div>
        </Card>
      )}
    </Shell>
  );
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-900 text-white px-4 py-6">
      <div className="max-w-md mx-auto pb-24">{children}</div>
    </div>
  );
}
function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-5 mb-4">{children}</div>;
}
function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center min-h-[60vh] text-slate-400 text-sm text-center px-6">{children}</div>;
}
function StickyBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700 px-4 py-3">
      <div className="max-w-md mx-auto flex items-center justify-between">{children}</div>
    </div>
  );
}
function Spinner({ small }: { small?: boolean }) {
  const size = small ? 'w-3 h-3 border-2' : 'w-8 h-8 border-4';
  return <span className={`inline-block ${size} border-emerald-500 border-t-transparent rounded-full animate-spin`} />;
}
