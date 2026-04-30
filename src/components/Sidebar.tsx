import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../hooks/useSync';
import type { Branch } from '../context/AuthContext';

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
}

const allMenuItems: { id: string; icon: string; label: string; permission: string; offlineSupported?: boolean }[] = [
  { id: 'home',          icon: '🏠', label: 'Inicio',        permission: 'sales:view',      offlineSupported: true  },
  { id: 'orders',        icon: '📋', label: 'Pedidos',        permission: 'sales:view',      offlineSupported: false },
  // { id: 'qrpayment',    icon: '📲', label: 'Cobro con QR',   permission: 'sales:view',      offlineSupported: false }, // TODO: reactivar cuando funcione
  { id: 'shifts',        icon: '🕐', label: 'Turnos',         permission: 'shifts:manage',   offlineSupported: false },
  { id: 'products',      icon: '📦', label: 'Productos',      permission: 'products:view',   offlineSupported: false },
  { id: 'categories',    icon: '🗂️', label: 'Categorías',    permission: 'products:manage', offlineSupported: false },
  { id: 'customers',     icon: '👥', label: 'Clientes',       permission: 'customers:view',  offlineSupported: false },
  { id: 'reports',       icon: '📊', label: 'Reportes',       permission: 'reports:view',    offlineSupported: false },
  { id: 'settings',      icon: '⚙️', label: 'Configuración', permission: 'org:manage',      offlineSupported: true  },
];

// ─── User popover ─────────────────────────────────────────────────────────────
function UserPopover({ onClose }: { onClose: () => void }) {
  const { user, logout } = useAuth();
  const sub = user?.subscription;
  const isSuperAdmin = user?.role === 'superadmin';
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const isExpired = sub && (sub.status === 'expired' || sub.status === 'cancelled');
  const isWarning = sub && !isExpired && sub.daysRemaining <= 7;

  const subColor = isExpired
    ? 'bg-red-500/15 border-red-500/30 text-red-400'
    : isWarning
    ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
    : 'bg-green-500/15 border-green-500/30 text-green-400';

  const dot = isExpired
    ? 'bg-red-400'
    : isWarning
    ? 'bg-amber-400 animate-pulse'
    : 'bg-green-400 animate-pulse';

  return (
    <div ref={ref}
      className="absolute bottom-full left-2 right-2 mb-2 bg-slate-800 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden z-50">

      {/* User info */}
      <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold shrink-0">
          {user?.name?.[0]?.toUpperCase() ?? 'U'}
        </div>
        <div className="min-w-0">
          <p className="text-white text-sm font-semibold truncate">{user?.name}</p>
          <p className="text-slate-400 text-xs capitalize">{user?.role}</p>
        </div>
      </div>

      {/* Subscription */}
      {sub && !isSuperAdmin && (
        <div className={`mx-3 my-2.5 px-3 py-2 rounded-xl border ${subColor}`}>
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
            <span className="text-xs font-semibold">{sub.planName}</span>
          </div>
          {isExpired ? (
            <p className="text-xs font-bold mt-0.5">Suscripción expirada</p>
          ) : (
            <p className="text-xs opacity-80 mt-0.5">
              Vence en <strong>{sub.daysRemaining}</strong> día{sub.daysRemaining !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {/* Logout */}
      <div className="px-2 pb-2">
        <button
          onClick={() => { logout(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition text-sm font-medium"
        >
          <span className="text-base">🚪</span>
          Cerrar Sesión
        </button>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const { user, hasPermission, branches, activeBranchId, setActiveBranchId } = useAuth();
  const { isOnline } = useSync();
  const forceOffline = typeof window !== 'undefined' && localStorage.getItem('pos_force_offline') === 'true';
  const isEffectivelyOffline = !isOnline || forceOffline;
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem('sidebar_collapsed');
    if (stored !== null) return stored === 'true';
    return true;
  });
  const [popoverOpen, setPopoverOpen] = useState(false);

  const toggle = () => {
    setCollapsed(c => {
      const next = !c;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  const isSuperAdmin = user?.role === 'superadmin';

  const menuItems = isSuperAdmin
    ? [
        { id: 'organizations', icon: '🏢', label: 'Organizaciones' },
        { id: 'subscriptions', icon: '💳', label: 'Suscripciones' },
      ]
    : allMenuItems.filter(item => hasPermission(item.permission));

  // Subscription dot for avatar button
  const sub = user?.subscription;
  const subDotColor = !sub || isSuperAdmin ? null
    : (sub.status === 'expired' || sub.status === 'cancelled') ? 'bg-red-400'
    : sub.daysRemaining <= 7 ? 'bg-amber-400 animate-pulse'
    : 'bg-green-400 animate-pulse';

  return (
    <aside className={`${collapsed ? 'w-14' : 'w-52 xl:w-60'} bg-slate-900 border-r border-slate-700/50 flex flex-col transition-all duration-300 shrink-0`}>

      {/* Header */}
      <div className={`flex items-center p-3 border-b border-slate-700/50 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shrink-0">
              <span className="text-white font-black text-sm">S</span>
            </div>
            <span className="text-white font-black text-lg tracking-tight">Sellyx</span>
          </div>
        )}
        <button
          onClick={toggle}
          className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-700 transition"
        >
          {collapsed ? '→' : '←'}
        </button>
      </div>

      {/* Org / Branch info */}
      {!collapsed && user?.organization && (
        <div className="px-3 py-2.5 border-b border-slate-700/50 bg-slate-800/50">
          <p className="text-blue-400 text-xs font-semibold uppercase tracking-wider truncate">
            {user.organization.name}
          </p>
          {branches.length > 1 ? (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-slate-500 text-xs shrink-0">📍</span>
              <select
                value={activeBranchId ?? ''}
                onChange={e => setActiveBranchId(+e.target.value)}
                className="flex-1 min-w-0 bg-slate-700 border border-slate-600/50 text-slate-300 text-xs rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                {branches.map((b: Branch) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          ) : (user.branch || branches.length === 1) && (
            <p className="text-slate-500 text-xs truncate mt-0.5">
              📍 {branches.length === 1 ? branches[0].name : user.branch?.name}
            </p>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {menuItems.map(item => {
          const offlineSupported = (item as any).offlineSupported !== false; // superadmin items: true por default
          const isDisabled = isEffectivelyOffline && !offlineSupported;
          const tooltipMsg = isDisabled
            ? `${item.label} — no disponible sin conexión`
            : (collapsed ? item.label : undefined);
          return (
            <button
              key={item.id}
              onClick={() => !isDisabled && onNavigate(item.id)}
              disabled={isDisabled}
              className={`w-full flex items-center py-2.5 rounded-xl transition-all duration-150 text-left group
                ${collapsed ? 'justify-center px-0' : 'gap-3 px-3'}
                ${isDisabled
                  ? 'opacity-40 cursor-not-allowed text-slate-500'
                  : activePage === item.id
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
                }`}
              title={tooltipMsg}
            >
              <span className="text-xl shrink-0 relative">
                {item.icon}
                {isDisabled && (
                  <span className="absolute -top-1 -right-1 text-[8px] leading-none">🔒</span>
                )}
              </span>
              {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* User avatar button — opens popover */}
      <div className="relative p-2 border-t border-slate-700/50">
        <button
          onClick={() => setPopoverOpen(o => !o)}
          className={`w-full flex items-center py-2 rounded-xl hover:bg-slate-700/60 transition text-left ${collapsed ? 'justify-center px-0' : 'gap-2.5 px-2'}`}
        >
          <div className="relative shrink-0">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
              {user?.name?.[0]?.toUpperCase() ?? 'U'}
            </div>
            {subDotColor && (
              <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${subDotColor}`} />
            )}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-white text-xs font-semibold truncate">{user?.name}</p>
              <p className="text-slate-500 text-[11px] capitalize truncate">{user?.role}</p>
            </div>
          )}
        </button>

        {popoverOpen && <UserPopover onClose={() => setPopoverOpen(false)} />}
      </div>
    </aside>
  );
}
