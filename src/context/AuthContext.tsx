import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const API_URL = 'http://localhost:3000/api';

export interface Branch {
  id: number;
  name: string;
}

export interface SubscriptionInfo {
  id: number;
  status: 'trial' | 'active' | 'expired' | 'cancelled';
  planName: string;
  planDescription: string;
  price: number;
  durationDays: number;
  startDate: string;
  endDate: string;
  daysRemaining: number;
  maxBranches: number;
  maxUsers: number;
  maxProducts: number;
}

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: string;
  permissions: string[];
  organization: { id: number; name: string } | null;
  branch: { id: number; name: string } | null;
  subscription: SubscriptionInfo | null;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: AuthUser | null;
  token: string | null;
  login: (username: string, password: string, orgCode?: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  refreshSubscription: () => Promise<void>;
  // Branch selection (admin with multiple branches)
  branches: Branch[];
  activeBranchId: number | null;
  setActiveBranchId: (id: number) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [user, setUser]   = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<number | null>(() => {
    const stored = localStorage.getItem('user');
    if (!stored) return null;
    const u = JSON.parse(stored) as AuthUser;
    return u.branch?.id ?? null;
  });

  const isAuthenticated = !!token && !!user;

  // Fetch branches for admin users
  useEffect(() => {
    if (!token || !user) return;
    const isAdmin = user.permissions?.includes('orders:view_all');
    if (!isAdmin) return;
    fetch(`${API_URL}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then((list: Branch[]) => {
        setBranches(list);
        if (list.length > 0 && activeBranchId === null) {
          setActiveBranchId(list[0].id);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.id]);

  const login = async (username: string, password: string, orgCode?: string) => {
    try {
      const body: any = { username, password };
      if (orgCode?.trim()) body.orgCode = orgCode.trim();
      const res  = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        return { ok: false, error: data.message || 'Credenciales inválidas' };
      }

      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setToken(data.access_token);
      setUser(data.user);
      // Reset branch selection to the user's assigned branch on login
      setActiveBranchId(data.user?.branch?.id ?? null);
      setBranches([]);
      return { ok: true };
    } catch {
      return { ok: false, error: 'No se pudo conectar con el servidor' };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setBranches([]);
    setActiveBranchId(null);
  };

  const hasPermission = (permission: string) => {
    return user?.permissions?.includes(permission) ?? false;
  };

  /** Re-fetch subscription from server and update stored user */
  const refreshSubscription = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/subscriptions/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const subscription: SubscriptionInfo = await res.json();
      setUser(prev => {
        if (!prev) return prev;
        const updated = { ...prev, subscription };
        localStorage.setItem('user', JSON.stringify(updated));
        return updated;
      });
    } catch { /* ignore */ }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, token, login, logout, hasPermission, refreshSubscription, branches, activeBranchId, setActiveBranchId }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
