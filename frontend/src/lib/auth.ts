import { toast } from "sonner";

export interface User {
  id: string;
  name: string;
}

export interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
}

export const initialAuthState: AuthState = {
  token: null,
  user: null,
  isAuthenticated: false
};

export async function login(username: string, password: string): Promise<AuthState> {
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    
    // Store token in localStorage
    localStorage.setItem('token', data.token);
    
    return {
      token: data.token,
      user: data.user,
      isAuthenticated: true
    };
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Login failed');
    return initialAuthState;
  }
}

export async function logout(): Promise<void> {
  try {
    const token = localStorage.getItem('token');
    if (!token) return;

    await fetch('/api/logout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    // Clear token from localStorage
    localStorage.removeItem('token');
  } catch (error) {
    console.error('Logout error:', error);
  }
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export async function checkAuth(): Promise<AuthState> {
  const token = getAuthToken();
  
  if (!token) {
    return initialAuthState;
  }

  try {
    // Optional: Verify token validity with server
    // For this example, we'll just decode the token locally
    // In a real app, you might want to validate with the server
    
    const tokenData = parseJwt(token);
    
    // Check if token is expired
    if (tokenData.exp && tokenData.exp * 1000 < Date.now()) {
      localStorage.removeItem('token');
      return initialAuthState;
    }
    
    return {
      token,
      user: {
        id: tokenData.id,
        name: tokenData.name
      },
      isAuthenticated: true
    };
  } catch (error) {
    localStorage.removeItem('token');
    return initialAuthState;
  }
}

// Helper function to decode JWT token
function parseJwt(token: string) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    return {};
  }
} 