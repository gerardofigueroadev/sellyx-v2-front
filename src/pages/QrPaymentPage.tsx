export default function QrPaymentPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-slate-800 p-8 text-center">
      <div className="max-w-sm w-full">
        <div className="w-24 h-24 rounded-2xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center mx-auto mb-6">
          <span className="text-5xl">📲</span>
        </div>
        <h1 className="text-white font-black text-2xl mb-2">Cobro con QR</h1>
        <p className="text-slate-400 text-sm mb-6">
          Próximamente podrás generar códigos QR para cobros directos con billeteras digitales y apps bancarias.
        </p>
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-5 text-left space-y-3 mb-6">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Lo que viene</p>
          {[
            ['🔲', 'Generación de QR por monto'],
            ['📱', 'Integración con billeteras locales'],
            ['✅', 'Confirmación automática de pago'],
            ['🧾', 'Registro en el turno activo'],
          ].map(([icon, text]) => (
            <div key={text as string} className="flex items-center gap-3">
              <span className="text-lg">{icon}</span>
              <span className="text-slate-400 text-sm">{text}</span>
            </div>
          ))}
        </div>
        <span className="inline-block bg-violet-500/15 border border-violet-500/30 text-violet-400 text-xs font-bold px-4 py-2 rounded-full">
          🚧 En construcción
        </span>
      </div>
    </div>
  );
}
