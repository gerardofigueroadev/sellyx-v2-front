import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';

type ToastType = 'error' | 'warning' | 'success' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastOptions {
  duration?: number;
}

interface ToastApi {
  error:   (message: string, opts?: ToastOptions) => void;
  warning: (message: string, opts?: ToastOptions) => void;
  success: (message: string, opts?: ToastOptions) => void;
  info:    (message: string, opts?: ToastOptions) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const STYLES: Record<ToastType, string> = {
  error:   'bg-red-600/95 border-red-400 text-white',
  warning: 'bg-amber-500/95 border-amber-300 text-white',
  success: 'bg-green-600/95 border-green-400 text-white',
  info:    'bg-blue-600/95 border-blue-400 text-white',
};

const ICONS: Record<ToastType, string> = {
  error:   '⚠️',
  warning: '⚠️',
  success: '✓',
  info:    'ℹ️',
};

const DEFAULT_DURATION: Record<ToastType, number> = {
  error:   5000,
  warning: 4000,
  success: 3000,
  info:    3000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const push = useCallback((type: ToastType, message: string, opts?: ToastOptions) => {
    const id = ++idRef.current;
    const duration = opts?.duration ?? DEFAULT_DURATION[type];
    setToasts(prev => [...prev, { id, type, message }]);
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
  }, [dismiss]);

  const api: ToastApi = {
    error:   (m, o) => push('error', m, o),
    warning: (m, o) => push('warning', m, o),
    success: (m, o) => push('success', m, o),
    info:    (m, o) => push('info', m, o),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Stack de toasts — z-index muy alto para superponerse a cualquier modal */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none max-w-md w-full px-4">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2 border px-4 py-2.5 rounded-xl shadow-2xl text-sm font-medium backdrop-blur-sm ${STYLES[t.type]}`}
            style={{ animation: 'toastIn 0.18s ease-out' }}
          >
            <span className="shrink-0 text-base leading-tight">{ICONS[t.type]}</span>
            <span className="flex-1 break-words leading-snug">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 opacity-70 hover:opacity-100 text-lg leading-none -mr-1"
              aria-label="Cerrar"
            >×</button>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
