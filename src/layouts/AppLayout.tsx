import { useState, ReactElement } from 'react';
import Sidebar from '../components/Sidebar';
import HomePage from '../pages/HomePage';
import SettingsPage from '../pages/SettingsPage';
import OrdersPage from '../pages/OrdersPage';
import ShiftsPage from '../pages/ShiftsPage';
import ProductsPage from '../pages/ProductsPage';
import CategoriesPage from '../pages/CategoriesPage';
import SubscriptionsPage from '../pages/SubscriptionsPage';
import OrganizationsAdminPage from '../pages/OrganizationsAdminPage';
import ReportsPage from '../pages/ReportsPage';
import QrPaymentPage from '../pages/QrPaymentPage';
import CustomersPage from '../pages/CustomersPage';
import { useAuth } from '../context/AuthContext';

const pages: Record<string, ReactElement> = {
  home:          <HomePage />,
  orders:        <OrdersPage />,
  shifts:        <ShiftsPage />,
  products:      <ProductsPage />,
  categories:    <CategoriesPage />,
  reports:       <ReportsPage />,
  customers:     <CustomersPage />,
  qrpayment:     <QrPaymentPage />,
  settings:      <SettingsPage />,
  subscriptions:  <SubscriptionsPage />,
  organizations:  <OrganizationsAdminPage />,
};

function ExpiredScreen() {
  const { user, logout, refreshSubscription } = useAuth();
  const sub = user?.subscription;

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-slate-900 p-8 text-center">
      <div className="max-w-md w-full">
        <div className="w-20 h-20 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto mb-6">
          <span className="text-4xl">🔒</span>
        </div>
        <h1 className="text-white font-black text-2xl mb-2">Suscripción expirada</h1>
        <p className="text-slate-400 text-sm mb-1">
          Tu plan <strong className="text-white">{sub?.planName ?? 'actual'}</strong> venció el{' '}
          <strong className="text-red-400">
            {sub?.endDate ? new Date(sub.endDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
          </strong>.
        </p>
        <p className="text-slate-500 text-sm mb-8">
          Contacta a soporte para renovar tu suscripción y continuar usando Sellyx.
        </p>

        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 text-left mb-6 space-y-2">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">Contacto de soporte</p>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">📧</span>
            <span className="text-slate-300">soporte@consuelito.com</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">📱</span>
            <span className="text-slate-300">+591 70000000</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={refreshSubscription}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-semibold transition"
          >
            Verificar renovación
          </button>
          <button
            onClick={logout}
            className="px-5 bg-slate-700 hover:bg-slate-600 text-slate-300 py-3 rounded-xl font-medium transition"
          >
            Salir
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AppLayout() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'superadmin';
  const [activePage, setActivePage] = useState(isSuperAdmin ? 'organizations' : 'home');

  const sub            = user?.subscription;
  const isExpired      = !isSuperAdmin && sub && (sub.status === 'expired' || sub.status === 'cancelled');

  return (
    <div className="flex h-screen bg-slate-800 overflow-hidden">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {isExpired
          ? <ExpiredScreen />
          : (pages[activePage] ?? pages.home)
        }
      </div>
    </div>
  );
}
