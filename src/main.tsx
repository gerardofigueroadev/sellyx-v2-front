import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import OrderPublicPage from './public/OrderPublicPage';
import JobApplicationPage from './public/JobApplicationPage';
import { initAnalytics } from './lib/analytics';
import './App.css';

// Las mini-webs públicas (/order/:token de pedidos y /jobs/:code de
// contratación) son árboles React AISLADOS: sin AuthProvider ni nada de Tauri.
// Se deciden por la URL antes de montar el POS para no arrastrar sus contextos.
const path = window.location.pathname;
const isPublicOrder = path.startsWith('/order/');
const isPublicJobs = path.startsWith('/jobs/');
const isPublic = isPublicOrder || isPublicJobs;

// Métricas/logs solo en el POS (web + escritorio), no en los formularios
// públicos. No-op si no hay VITE_POSTHOG_KEY configurada.
if (!isPublic) initAnalytics();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isPublicOrder ? <OrderPublicPage /> : isPublicJobs ? <JobApplicationPage /> : <App />}
  </React.StrictMode>
);
