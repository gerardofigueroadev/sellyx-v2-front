import { useEffect, useRef, useState } from 'react';
import { ApiProduct, ApiCategory, CartItem } from '../types';
import ProductCard from './ProductCard';

interface Props {
  categories: ApiCategory[];
  products: ApiProduct[];
  onAdd: (product: ApiProduct) => void;
  cartItems: CartItem[];
  getGradient: (color: string) => string;
}

const HEADER_H = 36;   // altura fija del header de cada categoría (px)
const GAP       = 6;   // gap entre elementos (px)
const COLS      = 3;   // columnas de productos por sección

export default function ProductSections({ categories, products, onAdd, cartItems, getGradient }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerH, setContainerH] = useState(0);

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (containerRef.current) setContainerH(containerRef.current.clientHeight);
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Para cada categoría calcula cuántas filas necesita con COLS columnas
  const sections = categories.map(cat => {
    const prods = products.filter(p => p.category?.id === cat.id);
    const rows  = Math.max(1, Math.ceil(prods.length / COLS));
    return { cat, prods, rows };
  });

  const totalRows    = sections.reduce((s, sec) => s + sec.rows, 0);
  const totalHeaders = sections.length * (HEADER_H + GAP);
  const totalGaps    = (totalRows - 1) * GAP;
  const rowH         = containerH > 0
    ? Math.floor((containerH - totalHeaders - totalGaps - GAP * 2) / totalRows)
    : 0;

  return (
    <div
      ref={containerRef}
      style={{
        flex: '1 1 0%',
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: GAP,
        padding: '8px 10px',
      }}
    >
      {sections.map(({ cat, prods, rows }) => (
        <div key={cat.id} style={{ flexShrink: 0 }}>

          {/* Header de categoría */}
          <div
            className={`${getGradient(cat.color)} flex items-center gap-2 px-3 rounded-lg mb-1.5`}
            style={{ height: HEADER_H, flexShrink: 0 }}
          >
            <span style={{ fontSize: 18 }}>{cat.emoji || '🍽️'}</span>
            <span className="text-white font-bold text-sm">{cat.name}</span>
            <span className="text-white/50 text-xs ml-auto">
              {prods.filter(p => p.isAvailable).length}/{prods.length}
            </span>
          </div>

          {/* Grid de productos — filas × columnas */}
          {rowH > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${COLS}, 1fr)`,
                gridTemplateRows: `repeat(${rows}, ${rowH}px)`,
                gap: GAP,
              }}
            >
              {prods.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAdd={onAdd}
                  quantity={cartItems.find(i => i.id === product.id)?.quantity ?? 0}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
