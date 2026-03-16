// Tipos legacy (mockup) - se mantienen por compatibilidad
export interface Product {
  id: number;
  name: string;
  price: number;
  image: string;
  category: 'comida' | 'refresco' | 'adicional';
  available: boolean;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

// Tipos API
export interface ApiCategory {
  id: number;
  name: string;
  emoji: string;
  color: string;
  description: string;
  isActive: boolean;
}

export interface ApiProduct {
  id: number;
  name: string;
  description: string;
  price: number;
  emoji: string;
  isAvailable: boolean;
  stock: number;
  category: ApiCategory;
}

export interface CartItem extends ApiProduct {
  quantity: number;
  note?: string;
}
