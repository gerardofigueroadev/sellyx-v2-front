import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import OrderPublicPage from './public/OrderPublicPage';
import JobApplicationPage from './public/JobApplicationPage';
import './App.css';

// Las mini-webs públicas (/order/:token de pedidos y /jobs/:code de
// contratación) son árboles React AISLADOS: sin AuthProvider ni nada de Tauri.
// Se deciden por la URL antes de montar el POS para no arrastrar sus contextos.
const path = window.location.pathname;
const isPublicOrder = path.startsWith('/order/');
const isPublicJobs = path.startsWith('/jobs/');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isPublicOrder ? <OrderPublicPage /> : isPublicJobs ? <JobApplicationPage /> : <App />}
  </React.StrictMode>
);
