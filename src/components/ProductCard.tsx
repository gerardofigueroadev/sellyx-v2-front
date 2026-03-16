import { useState } from 'react';
import { ApiProduct } from '../types';
import { useAuth } from '../context/AuthContext';

interface ProductCardProps {
  product: ApiProduct;
  onAdd: (product: ApiProduct) => void;
  quantity?: number;
  categoryColor?: string;
  categoryName?: string;
}

const COLOR_MAP: Record<string, string> = {
  orange: '#f97316', blue: '#3b82f6', purple: '#a855f7',
  green:  '#22c55e', red:  '#ef4444', yellow: '#eab308',
  pink:   '#ec4899', cyan: '#06b6d4',
};

const BG_MAP: Record<string, string> = {
  orange: 'rgba(249,115,22,0.07)',  blue:   'rgba(59,130,246,0.07)',
  purple: 'rgba(168,85,247,0.07)',  green:  'rgba(34,197,94,0.07)',
  red:    'rgba(239,68,68,0.07)',   yellow: 'rgba(234,179,8,0.07)',
  pink:   'rgba(236,72,153,0.07)', cyan:   'rgba(6,182,212,0.07)',
};

export default function ProductCard({ product, onAdd, quantity = 0, categoryColor }: ProductCardProps) {
  const { currency } = useAuth();
  const [flash, setFlash] = useState(false);
  const accent = categoryColor ? (COLOR_MAP[categoryColor] ?? '#3b82f6') : undefined;
  const bgTint  = categoryColor ? (BG_MAP[categoryColor]  ?? 'transparent') : 'transparent';

  const handleAdd = () => {
    if (!product.isAvailable) return;
    onAdd(product);
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
  };

  return (
    <button
      onClick={handleAdd}
      disabled={!product.isAvailable}
      style={{
        width: '100%',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px 10px 14px',
        borderRadius: 11,
        border: `1.5px solid ${flash ? 'rgba(96,165,250,0.55)' : accent ? `${accent}40` : 'rgba(71,85,105,0.4)'}`,
        background: flash ? 'rgba(37,99,235,0.12)' : bgTint,
        cursor: product.isAvailable ? 'pointer' : 'not-allowed',
        opacity: product.isAvailable ? 1 : 0.45,
        transition: 'border-color 0.1s, background 0.1s',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Barra lateral de categoría */}
      {accent && (
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 5,
          borderRadius: '11px 0 0 11px',
          background: accent,
          opacity: product.isAvailable ? 1 : 0.3,
        }} />
      )}

      {/* Emoji */}
      <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0, width: 28, textAlign: 'center' }}>
        {product.emoji || '🍽️'}
      </span>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Nombre — con salto de línea */}
        <p style={{
          fontSize: 13, fontWeight: 600, lineHeight: 1.35,
          color: product.isAvailable ? 'white' : '#64748b',
          wordBreak: 'break-word',
          margin: 0,
        }}>
          {product.name}
        </p>
        {/* Precio */}
        <p style={{
          fontSize: 13, fontWeight: 700, marginTop: 4,
          color: product.isAvailable ? '#60a5fa' : '#475569',
          margin: '4px 0 0',
        }}>
          {currency} {Number(product.price).toFixed(2)}
        </p>
      </div>

      {/* + / cantidad */}
      <div style={{
        flexShrink: 0, width: 30, height: 30, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: quantity > 0 ? (accent ?? '#2563eb') : flash ? '#3b82f6' : 'rgba(51,65,85,0.8)',
        color: quantity > 0 || flash ? 'white' : '#94a3b8',
        fontSize: 13, fontWeight: 800,
        transition: 'background 0.1s',
        boxShadow: quantity > 0 ? `0 0 8px ${accent ?? '#2563eb'}66` : 'none',
      }}>
        {quantity > 0 ? quantity : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}>
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
        )}
      </div>

      {flash && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: accent ?? '#3b82f6' }} />}
    </button>
  );
}
