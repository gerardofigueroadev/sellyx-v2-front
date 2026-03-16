import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

// ─── Plans Modal ──────────────────────────────────────────────────────────────
const PLANS = [
  {
    name: 'Trial',
    price: 'Gratis',
    period: '14 días',
    color: 'from-slate-600 to-slate-500',
    badge: null,
    features: ['1 sucursal', '1 usuario', 'Módulo POS básico', 'Soporte por email'],
  },
  {
    name: 'Básico',
    price: 'Bs. 29',
    period: '/mes',
    color: 'from-blue-600 to-blue-500',
    badge: null,
    features: ['2 sucursales', '5 usuarios', 'Reportes', 'Gestión de productos', 'Soporte prioritario'],
  },
  {
    name: 'Pro',
    price: 'Bs. 79',
    period: '/mes',
    color: 'from-violet-600 to-purple-500',
    badge: 'Popular',
    features: ['5 sucursales', '20 usuarios', 'Todo en Básico', 'KDS cocina', 'Historial ilimitado', 'API acceso'],
  },
  {
    name: 'Enterprise',
    price: 'Bs. 199',
    period: '/año',
    color: 'from-amber-500 to-orange-500',
    badge: 'Mejor valor',
    features: ['Sucursales ilimitadas', 'Usuarios ilimitados', 'Todo en Pro', 'Onboarding personalizado', 'SLA garantizado'],
  },
];

function PlansModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-700/50">
          <div>
            <h2 className="text-white font-black text-2xl">Planes Sellyx</h2>
            <p className="text-slate-400 text-sm mt-0.5">Elige el plan que mejor se adapta a tu negocio</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-2xl leading-none transition">✕</button>
        </div>

        {/* Plans grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-8">
          {PLANS.map(plan => (
            <div key={plan.name} className="relative bg-slate-800 border border-slate-700/50 rounded-2xl p-5 flex flex-col">
              {plan.badge && (
                <span className={`absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r ${plan.color} text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap`}>
                  {plan.badge}
                </span>
              )}
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center mb-3`}>
                <span className="text-white text-lg font-black">{plan.name[0]}</span>
              </div>
              <p className="text-white font-bold text-base">{plan.name}</p>
              <div className="mt-2 mb-4">
                <span className="text-white font-black text-2xl">{plan.price}</span>
                <span className="text-slate-400 text-xs ml-1">{plan.period}</span>
              </div>
              <ul className="space-y-2 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-xs text-slate-300">
                    <span className="text-green-400 mt-0.5 shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="px-8 pb-6 text-center">
          <p className="text-slate-500 text-xs">Para contratar un plan, contacta a nuestro equipo de ventas.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Login Page ───────────────────────────────────────────────────────────────
export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [orgCode, setOrgCode]    = useState('');
  const [showPass, setShowPass]  = useState(false);
  const [error, setError]        = useState('');
  const [loading, setLoading]    = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(username, password, orgCode || undefined);
    if (!result.ok) setError(result.error ?? 'Error al iniciar sesión');
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {showPlans && <PlansModal onClose={() => setShowPlans(false)} />}

      {/* Left panel — branding */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden flex-col justify-between p-12"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' }}>

        {/* Decorative circles */}
        <div className="absolute top-0 left-0 w-[600px] h-[600px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)', transform: 'translate(-30%, -30%)' }} />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)', transform: 'translate(30%, 30%)' }} />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <span className="text-white font-black text-lg">S</span>
            </div>
            <span className="text-white font-black text-2xl tracking-tight">Sellyx</span>
          </div>

          <h2 className="text-white font-black text-4xl leading-tight mb-4">
            Tu negocio,<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400">
              bajo control.
            </span>
          </h2>
          <p className="text-slate-400 text-base leading-relaxed max-w-sm">
            Sistema de punto de venta diseñado para restaurantes y negocios en Bolivia. Rápido, simple y poderoso.
          </p>
        </div>

        {/* Features */}
        <div className="relative z-10 space-y-3">
          {[
            { icon: '⚡', text: 'Ventas en segundos' },
            { icon: '📊', text: 'Reportes en tiempo real' },
            { icon: '🏪', text: 'Multi-sucursal' },
          ].map(f => (
            <div key={f.text} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-sm">
                {f.icon}
              </div>
              <span className="text-slate-300 text-sm">{f.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-3 mb-10">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
            <span className="text-white font-black">S</span>
          </div>
          <span className="text-white font-black text-xl tracking-tight">Sellyx</span>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-white font-black text-3xl mb-1">Bienvenido</h1>
            <p className="text-slate-400 text-sm">Ingresa tus credenciales para continuar</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Código de empresa */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Código de empresa <span className="normal-case text-slate-600 font-normal">(vacío si eres superadmin)</span>
              </label>
              <input
                type="text"
                value={orgCode}
                onChange={e => setOrgCode(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                placeholder="ej: pizzanapoli"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                autoFocus
              />
            </div>

            {/* Usuario */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Usuario</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Tu nombre de usuario"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                required
              />
            </div>

            {/* Contraseña */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Contraseña</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 pr-11 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  required
                />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs transition">
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm flex items-center gap-2">
                <span>⚠️</span> {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all duration-200 shadow-lg hover:shadow-blue-500/25 mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Verificando...
                </span>
              ) : 'Ingresar →'}
            </button>
          </form>

          {/* Ver planes — sutil, no intrusivo */}
          <div className="mt-8 pt-6 border-t border-slate-800 text-center">
            <button onClick={() => setShowPlans(true)}
              className="text-slate-500 hover:text-slate-300 text-xs transition group">
              ¿Aún no tienes cuenta?{' '}
              <span className="text-blue-500 group-hover:text-blue-400 font-medium underline underline-offset-2">
                Ver planes y precios
              </span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-slate-700 text-xs mt-12">© 2026 Sellyx · Todos los derechos reservados</p>
      </div>
    </div>
  );
}
