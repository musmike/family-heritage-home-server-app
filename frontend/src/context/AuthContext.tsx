import { createContext, useState, type ReactNode, use, useEffect, useMemo } from 'react';
import api from '../api/axiosInstance';

export interface AuthUser {
  username: string;
  roles: string[];
  personId?: number | null;
  personGivenName?: string | null;
  personSurname?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => void;
}
export const AuthContext = createContext<AuthContextType | null>(null);
export const useAuth = () => {
    const context = use(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const response = await api.get<AuthUser>('/users/me');
      setUser(response.data);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchUser();

    const handleAuthError = () => {
      setUser(null);
    };
    window.addEventListener('auth-error', handleAuthError);
    return () => {
      window.removeEventListener('auth-error', handleAuthError);
    };
  }, []);


  const login = async () => {
    setIsLoading(true);
    await fetchUser();
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
        console.error("Logout failed", error);
    } finally {
      setUser(null);
    }
  };

  const value = useMemo(() => ({ user, isLoading, login, logout }), [user, isLoading]);

  return <AuthContext value={value}>{children}</AuthContext>;
}