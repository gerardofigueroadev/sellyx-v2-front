import { useEffect, useMemo, useState } from 'react';
import API_URL from '../config';

const API = `${API_URL}/api`;

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Branch { id: number; name: string }
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

// ── Parseo de la URL: /order/:token?phone=... ─────────────────────────────────
function parseUrl() {
  const parts = window.location.pathname.split('/').filter(Boolean); // ['order', '<token>']
  const token = parts[1] ?? '';
  const qs = new URLSearchParams(window.location.search);
  const phone = normalizePhone(qs.get('phone') ?? '');
  const rawType = qs.get('type');
  // Tipo preseleccionado desde el chat (solo takeaway/delivery son válidos aquí).
  const presetType: OrderType | null = rawType === 'delivery' || rawType === 'takeaway' ? rawType : null;
  return { token, phone, presetType };
}

const money = (n: number, cur: string) => `${cur ? cur + ' ' : ''}${n.toFixed(2)}`;

export default function OrderPublicPage() {
  const { token, phone: phoneFromLink, presetType } = useMemo(parseUrl, []);

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
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  // QR: estado del popup de confirmación de pago ('idle' | 'paying' | 'paid').
  const [qrPay, setQrPay] = useState<'idle' | 'paying' | 'paid'>('idle');
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
        // Si solo hay una sucursal, saltar el paso de selección.
        if (data.branches.length === 1) {
          setBranch(data.branches[0]);
        }
      } catch {
        setLoadErr('Este enlace no es válido o ya no está disponible.');
      }
    })();
  }, [token]);

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

  // Crea el pedido. Devuelve true si se creó. `goConfirm` controla si navega
  // a la pantalla de confirmación (efectivo) o no (QR maneja su propio flujo).
  const submit = async (goConfirm = true): Promise<boolean> => {
    if (!branch || cartItems.length === 0 || phone.trim().length < 5) return false;
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const res = await fetch(`${API}/public/order/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: branch.id,
          phone: phone.trim(),
          items: cartItems.map((p) => ({ productId: p.id, quantity: qty[p.id] })),
          orderType,
          paymentMethod: payment,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'No se pudo crear el pedido');
      setConfirmation({ orderNumber: data.orderNumber, ticketNumber: data.ticketNumber, total: data.total });
      if (goConfirm) setStep('confirm');
      return true;
    } catch (e) {
      setSubmitErr((e as Error).message);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  // QR "Sí pagué": crea el pedido, muestra "Pagado", espera 2s y abre WhatsApp.
  const confirmQrPaid = async () => {
    setQrPay('paying');
    const ok = await submit(false); // crea el pedido sin navegar a 'confirm'
    if (!ok) { setQrPay('idle'); return; }
    setQrPay('paid');
    setTimeout(() => {
      const waPhone = ctx?.whatsappPhone;
      window.location.href = waPhone ? `https://wa.me/${waPhone}` : 'https://wa.me/';
    }, 2000);
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
          <div className="space-y-2">
            {ctx.branches.map((b) => (
              <button key={b.id} onClick={() => setBranch(b)}
                className="w-full text-left px-4 py-3 rounded-xl bg-slate-700/60 hover:bg-slate-700 text-white transition border border-slate-600">
                {b.name}
              </button>
            ))}
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
                        <p className="text-white text-sm truncate">{p.emoji ? `${p.emoji} ` : ''}{p.name}</p>
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
                    <p className="text-white text-sm min-w-0 truncate">{p.emoji ? `${p.emoji} ` : ''}{p.name}</p>
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

            {/* Teléfono */}
            <h3 className="text-white text-sm font-medium mb-2 mt-3">Tu teléfono</h3>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ej: 59178590523"
              className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />

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
              onClick={() => (payment === 'qr' ? setStep('qr_pending') : submit())}
              disabled={submitting || phone.trim().length < 5}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-5 py-2 rounded-xl text-sm font-medium flex items-center gap-2">
              {submitting && <Spinner small />}
              {payment === 'qr' ? 'Continuar al pago' : 'Confirmar pedido'}
            </button>
          </StickyBar>
        </>
      )}

      {step === 'qr_pending' && (
        <Card>
          {qrPay === 'idle' && (
            <button onClick={() => setStep('checkout')} className="text-slate-400 text-xs mb-3">← Volver</button>
          )}
          <div className="text-center py-4">
            <div className="text-5xl mb-3">📱</div>
            <h2 className="text-white font-bold text-lg">Pago con QR</h2>
            <p className="text-slate-400 text-sm mt-3">Escanea el QR y paga el total:</p>
            <p className="text-white font-bold text-xl mt-1">{money(total, cur)}</p>
            {/* TODO(pasarela): aquí irá el QR real de la pasarela. Por ahora el
                cliente confirma manualmente que pagó. */}
            <div className="mt-4 mx-auto w-40 h-40 bg-white rounded-xl flex items-center justify-center text-slate-400 text-xs">
              QR de pago<br/>(en construcción)
            </div>

            <button
              onClick={confirmQrPaid}
              disabled={qrPay !== 'idle' || phone.trim().length < 5}
              className="mt-6 w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-2.5 rounded-xl text-sm font-medium">
              Sí, ya pagué
            </button>
          </div>
        </Card>
      )}

      {/* Popup de confirmación de pago QR */}
      {(qrPay === 'paying' || qrPay === 'paid') && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-xs w-full text-center">
            {qrPay === 'paying' ? (
              <>
                <Spinner />
                <p className="text-white text-sm mt-3">Confirmando tu pago...</p>
              </>
            ) : (
              <>
                <div className="text-5xl mb-2">✅</div>
                <h3 className="text-white font-bold text-lg">¡Pagado!</h3>
                <p className="text-slate-400 text-sm mt-1">Tu pedido fue registrado.</p>
                <p className="text-slate-500 text-xs mt-3">Abriendo WhatsApp...</p>
              </>
            )}
          </div>
        </div>
      )}

      {step === 'confirm' && confirmation && (
        <Card>
          <div className="text-center py-4">
            <div className="text-5xl mb-3">✅</div>
            <h2 className="text-white font-bold text-lg">¡Pedido enviado!</h2>
            <p className="text-slate-400 text-sm mt-1">Tu pedido fue recibido por {ctx.orgName}.</p>
            <div className="mt-4 bg-slate-700/40 rounded-xl p-4 inline-block">
              <p className="text-slate-400 text-xs">N° de pedido</p>
              <p className="text-white font-mono font-bold">{confirmation.orderNumber}</p>
              <p className="text-emerald-400 text-2xl font-bold mt-2">#{confirmation.ticketNumber}</p>
              <p className="text-white text-sm mt-2">Total: {money(confirmation.total, cur)}</p>
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
