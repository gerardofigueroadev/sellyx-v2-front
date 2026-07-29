import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import API_URL from '../config';

const API = `${API_URL}/api`;

type Phase = 'loading' | 'showing' | 'paid' | 'error';

interface QrGenResp {
  alias: string;
  imagenQr: string; // PNG base64 (sin prefijo)
  monto: number;
  moneda: string;
}

/**
 * Modal de cobro con QR (BISA). Genera el QR, lo muestra y hace polling del
 * estado hasta que BISA confirme el pago. Al pagar dispara onPaid() para que
 * el POS complete la venta normalmente.
 *
 * NOTA: el backend genera el QR por 0.01 Bs (monto de prueba quemado) mientras
 * validamos la integración con pagos reales sin costo.
 */
export default function QrChargeModal({
  amount, glosa, onPaid, onClose,
}: {
  amount: number;
  glosa?: string;
  onPaid: () => void;
  onClose: () => void;
}) {
  const { token, currency, activeBranchId } = useAuth();
  const [phase, setPhase] = useState<Phase>('loading');
  const [qr, setQr] = useState<QrGenResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aliasRef = useRef<string | null>(null);
  // Guard: garantiza que el QR se genere UNA sola vez. Sin esto, React
  // StrictMode (o un re-render) monta el efecto dos veces y se crean dos QR
  // en BISA (uno queda huérfano/pending). El ref persiste entre montajes.
  const generatedRef = useRef(false);

  // 1) Generar el QR al montar (una sola vez, ver generatedRef).
  //    NO usamos un flag `cancelled` en el cleanup: con StrictMode el efecto se
  //    monta→desmonta→remonta y el cleanup marcaría cancelado el ÚNICO fetch en
  //    curso, dejando el modal colgado en "loading". El guard generatedRef ya
  //    evita el doble fetch, así que dejamos que el resultado se aplique siempre.
  useEffect(() => {
    if (generatedRef.current) return;
    generatedRef.current = true;

    (async () => {
      try {
        const res = await fetch(`${API}/qr`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          // branchId: sucursal activa, para ver el cobro por sucursal en el admin.
          body: JSON.stringify({ amount, glosa, branchId: activeBranchId ?? undefined }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'No se pudo generar el QR');
        setQr(data);
        aliasRef.current = data.alias;
        setPhase('showing');
      } catch (e) {
        setErr((e as Error).message);
        setPhase('error');
        // Si falló, permitir reintentar (el botón remonta el modal).
        generatedRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Polling del estado mientras se muestra el QR.
  useEffect(() => {
    if (phase !== 'showing' || !aliasRef.current) return;
    const check = async () => {
      try {
        const res = await fetch(`${API}/qr/${aliasRef.current}/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'paid') {
          if (pollRef.current) clearInterval(pollRef.current);
          setPhase('paid');
          // Pequeña pausa para que el cajero vea el "Pagado" antes de cerrar.
          setTimeout(() => onPaid(), 1200);
        }
      } catch { /* reintenta en el próximo tick */ }
    };
    pollRef.current = setInterval(check, 3500);
    check();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [phase, token, onPaid]);

  // Cancelar con confirmación: hay una ventana de ~3.5s entre que el cliente
  // paga y el polling lo detecta; si el cajero cancela ahí, se perdería una
  // venta ya cobrada. Pedimos confirmación explícita para evitarlo.
  const handleCancel = () => {
    const ok = window.confirm(
      '¿El cliente NO pagó todavía?\n\n' +
      'Si ya escaneó y pagó, NO canceles: espera unos segundos a que se confirme. ' +
      'Cancelar un cobro ya pagado no registrará la venta.',
    );
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xs bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-lg">📱</span>
            <h2 className="text-white font-bold text-sm">Cobro con QR</h2>
          </div>
          {phase === 'showing' && (
            <button onClick={handleCancel} className="text-slate-500 hover:text-white text-lg">✕</button>
          )}
          {(phase === 'loading' || phase === 'error') && (
            <button onClick={onClose} className="text-slate-500 hover:text-white text-lg">✕</button>
          )}
        </div>

        <div className="p-5 text-center">
          {phase === 'loading' && (
            <div className="py-10">
              <span className="inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-400 text-sm mt-3">Generando QR…</p>
            </div>
          )}

          {phase === 'error' && (
            <div className="py-8">
              <div className="text-4xl mb-2">⚠️</div>
              <p className="text-red-400 text-sm">{err}</p>
              <button onClick={onClose} className="mt-4 bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-xl">
                Cerrar
              </button>
            </div>
          )}

          {phase === 'showing' && qr && (
            <>
              <p className="text-slate-400 text-xs mb-2">Escanea con tu app bancaria y paga</p>
              <div className="bg-white rounded-xl p-2 inline-block">
                <img src={`data:image/png;base64,${qr.imagenQr}`} alt="QR de pago"
                  className="w-52 h-52 object-contain" />
              </div>
              <p className="text-white font-bold text-lg mt-3">{currency} {qr.monto.toFixed(2)}</p>
              <div className="flex items-center justify-center gap-2 mt-3 text-slate-400 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                Esperando el pago…
              </div>
              <button onClick={handleCancel} className="mt-4 text-slate-500 hover:text-slate-300 text-xs">
                Cancelar
              </button>
            </>
          )}

          {phase === 'paid' && (
            <div className="py-8">
              <div className="text-5xl mb-2">✅</div>
              <h3 className="text-white font-bold text-lg">¡Pagado!</h3>
              <p className="text-slate-400 text-sm mt-1">Registrando la venta…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
