'use client';
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { getEnvironment, type Environment } from './env';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  userId: string;
  email: string;
  name?: string;
  role: string;
  tenantId: string;
  permissions: string[];
}

export interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  authenticated: boolean;
}

export interface AuthActions {
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signup: (email: string, password: string, name?: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
}

// ─── Authentication Provider Interface ────────────────────────────────────────
// Future Identity Platform implements this same interface

export interface AuthProvider {
  login(email: string, password: string): Promise<{ ok: boolean; user?: AuthUser; error?: string }>;
  signup(email: string, password: string, name?: string): Promise<{ ok: boolean; user?: AuthUser; error?: string }>;
  logout(): Promise<void>;
  getSession(): AuthUser | null;
}

// ─── Development Provider ─────────────────────────────────────────────────────

const SESSION_KEY = 'askabd_session';

class DevelopmentAuthProvider implements AuthProvider {
  async login(email: string, _password: string): Promise<{ ok: boolean; user?: AuthUser; error?: string }> {
    if (!email) return { ok: false, error: 'Email is required' };
    const user: AuthUser = {
      userId: 'dev-user-000',
      email,
      name: email.split('@')[0] || 'Developer',
      role: 'super_admin',
      tenantId: 'public',
      permissions: ['*'],
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...user, loggedInAt: new Date().toISOString() }));
    return { ok: true, user };
  }

  async signup(email: string, _password: string, name?: string): Promise<{ ok: boolean; user?: AuthUser; error?: string }> {
    if (!email) return { ok: false, error: 'Email is required' };
    const user: AuthUser = {
      userId: `dev-${Date.now()}`,
      email,
      name: name || email.split('@')[0] || 'New User',
      role: 'customer',
      tenantId: 'public',
      permissions: ['Product.Read', 'Category.Read', 'Comparison.Read', 'Comparison.Create', 'Search.Execute'],
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...user, loggedInAt: new Date().toISOString() }));
    return { ok: true, user };
  }

  async logout(): Promise<void> {
    localStorage.removeItem(SESSION_KEY);
  }

  getSession(): AuthUser | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return { userId: data.userId, email: data.email, name: data.name, role: data.role, tenantId: data.tenantId, permissions: data.permissions ?? [] };
    } catch { return null; }
  }
}

// ─── Provider Factory ─────────────────────────────────────────────────────────

function createAuthProvider(_env: Environment): AuthProvider {
  // Future: if (env === 'production' || env === 'staging') return new IdentityAuthProvider();
  return new DevelopmentAuthProvider();
}

// ─── React Context ────────────────────────────────────────────────────────────

const AuthContext = createContext<(AuthState & AuthActions) | null>(null);

export function AuthContextProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const provider = createAuthProvider(getEnvironment());

  useEffect(() => {
    const session = provider.getSession();
    setUser(session);
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const result = await provider.login(email, password);
    if (result.ok && result.user) setUser(result.user);
    return { ok: result.ok, error: result.error };
  };

  const signup = async (email: string, password: string, name?: string) => {
    const result = await provider.signup(email, password, name);
    if (result.ok && result.user) setUser(result.user);
    return { ok: result.ok, error: result.error };
  };

  const logout = () => {
    provider.logout();
    setUser(null);
  };

  const hasPermission = (perm: string): boolean => {
    if (!user) return false;
    if (user.permissions.includes('*')) return true;
    if (user.permissions.includes(perm)) return true;
    const [resource] = perm.split('.');
    if (resource && user.permissions.includes(`${resource}.*`)) return true;
    return false;
  };

  const hasRole = (role: string): boolean => user?.role === role;

  return (
    <AuthContext.Provider value={{ user, loading, authenticated: !!user, login, signup, logout, hasPermission, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState & AuthActions {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthContextProvider');
  return ctx;
}
