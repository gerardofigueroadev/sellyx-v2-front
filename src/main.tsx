import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import OrderPublicPage from './public/OrderPublicPage';
import './App.css';

// La mini-web pública de pedidos por WhatsApp (/order/:token) es un árbol
// React AISLADO: sin AuthProvider ni nada de Tauri. Se decide por la URL
// antes de montar el POS para no arrastrar sus contextos.
const isPublicOrder = window.location.pathname.startsWith('/order/');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isPublicOrder ? <OrderPublicPage /> : <App />}
  </React.StrictMode>
);
