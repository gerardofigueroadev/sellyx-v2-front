import { useState, useEffect } from 'react';
import { onSyncStatusChange, SyncStatus } from '../lib/syncService';
import { getPendingCount } from '../lib/db';

export function useSync() {
  const [isOnline, setIsOnline]       = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing]         = useState(false);

  useEffect(() => {
    // Carga inicial del conteo de pendientes
    const isTauri = '__TAURI__' in window;
    if (isTauri) {
      getPendingCount().then(setPendingCount).catch(() => {});
    }

    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsub = onSyncStatusChange((status: SyncStatus, pending: number) => {
      setSyncing(status === 'syncing');
      setPendingCount(pending);
      setIsOnline(status !== 'offline');
    });

    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsub();
    };
  }, []);

  return { isOnline, pendingCount, syncing };
}
