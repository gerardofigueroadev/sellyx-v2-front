import { useEffect, useRef, useState } from 'react';
import { ApiProduct, CartItem } from '../types';
import ProductCard from './ProductCard';

interface ProductColumnProps {
  title: string;
  icon: string;
  gradient: string;
  products: ApiProduct[];
  onAdd: (product: ApiProduct) => void;
  cartItems?: CartItem[];
}

export default function ProductColumn({ title, icon, gradient, products, onAdd, cartItems = [] }: ProductColumnProps) {
  const rootRef   = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [bodyH, setBodyH] = useState<number>(0);

  useEffect(() => {
    const recalc = () => {
      if (!rootRef.current || !headerRef.current) return;
      setBodyH(rootRef.current.clientHeight - headerRef.current.offsetHeight);
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(rootRef.current!);
    return () => ro.disconnect();
  }, []);

  const available = products.filter(p => p.isAvailable).length;

  return (
    <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0%', minWidth: 170, overflow: 'hidden' }}>

      {/* Cabecera */}
      <div ref={headerRef}>
        <div className={`${gradient} rounded-xl px-3 py-2.5 mb-2 flex items-center gap-2 shadow`}>
          <span className="text-2xl">{icon}</span>
          <div>
            <h2 className="text-white font-bold text-sm leading-tight">{title}</h2>
            <p className="text-white/60 text-xs">{available}/{products.length}</p>
          </div>
        </div>
      </div>

      {/* Productos: cada uno recibe 1fr del alto disponible */}
      {bodyH > 0 && products.length > 0 && (
        <div style={{
          height: bodyH,
          display: 'grid',
          gridTemplateRows: `repeat(${products.length}, 1fr)`,
          gap: 5,
          overflow: 'hidden',
        }}>
          {products.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              onAdd={onAdd}
              quantity={cartItems.find(i => i.id === product.id)?.quantity ?? 0}
            />
          ))}
        </div>
      )}

      {products.length === 0 && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
          <span style={{ fontSize: 32 }}>📭</span>
          <p style={{ fontSize: 12, marginTop: 4 }}>Sin productos</p>
        </div>
      )}
    </div>
  );
}
