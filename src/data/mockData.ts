import { Product } from '../types';

export const mockProducts: Product[] = [
  // Comida
  { id: 1, name: 'Hamburguesa Clásica', price: 8.99, image: '🍔', category: 'comida', available: true },
  { id: 2, name: 'Pizza Margherita', price: 12.99, image: '🍕', category: 'comida', available: true },
  { id: 3, name: 'Hot Dog', price: 5.99, image: '🌭', category: 'comida', available: true },
  { id: 4, name: 'Tacos x3', price: 9.50, image: '🌮', category: 'comida', available: false },
  { id: 5, name: 'Sandwich Pollo', price: 7.99, image: '🥪', category: 'comida', available: true },
  { id: 6, name: 'Nuggets x10', price: 6.50, image: '🍗', category: 'comida', available: true },
  // Refrescos
  { id: 7, name: 'Coca-Cola', price: 2.50, image: '🥤', category: 'refresco', available: true },
  { id: 8, name: 'Pepsi', price: 2.50, image: '🥤', category: 'refresco', available: true },
  { id: 9, name: 'Limonada', price: 3.00, image: '🍋', category: 'refresco', available: true },
  { id: 10, name: 'Agua Natural', price: 1.50, image: '💧', category: 'refresco', available: true },
  { id: 11, name: 'Jugo de Naranja', price: 3.50, image: '🍊', category: 'refresco', available: true },
  { id: 12, name: 'Té Helado', price: 2.75, image: '🧋', category: 'refresco', available: false },
  // Adicionales
  { id: 13, name: 'Papas Fritas', price: 3.99, image: '🍟', category: 'adicional', available: true },
  { id: 14, name: 'Ensalada', price: 4.50, image: '🥗', category: 'adicional', available: true },
  { id: 15, name: 'Extra Queso', price: 1.00, image: '🧀', category: 'adicional', available: true },
  { id: 16, name: 'Salsa BBQ', price: 0.75, image: '🫙', category: 'adicional', available: true },
  { id: 17, name: 'Aros de Cebolla', price: 3.25, image: '🧅', category: 'adicional', available: true },
  { id: 18, name: 'Postre del día', price: 5.00, image: '🍰', category: 'adicional', available: false },
];
