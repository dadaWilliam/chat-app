import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { checkAuth, login as loginApi, logout as logoutApi, AuthState, initialAuthState, User } from './auth';

interface AuthContextType {
  auth: AuthState;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(initialAuthState);
  const [loading, setLoading] = useState(true);

  // Initialize auth state on page load
  useEffect(() => {
    async function initAuth() {
      try {
        const authState = await checkAuth();
        setAuth(authState);
      } catch (error) {
        console.error('Error checking authentication:', error);
      } finally {
        setLoading(false);
      }
    }

    initAuth();
  }, []);

  // Login function
  async function login(username: string, password: string): Promise<boolean> {
    try {
      setLoading(true);
      const authState = await loginApi(username, password);
      
      if (authState.isAuthenticated) {
        setAuth(authState);
        toast.success(`Welcome, ${authState.user?.name}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }

  // Logout function
  async function logout(): Promise<void> {
    try {
      setLoading(true);
      await logoutApi();
      setAuth(initialAuthState);
      toast.success('Logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthContext.Provider value={{ auth, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 