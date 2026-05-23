/**
 * AuthContext — provides the current user's sign-in state to the whole app.
 *
 * Usage:
 *   import { useAuth } from '../context/AuthContext';
 *   const { loading, authenticated, name, email, avatarUrl } = useAuth();
 *
 * Shape:
 *   loading       boolean  — true while the initial /api/me/ call is in flight
 *   authenticated boolean
 *   email         string | null
 *   name          string | null
 *   avatarUrl     string | null
 */

import { createContext, useContext, useEffect, useState } from 'react';
import { getMe } from '../api/authApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState({
    loading: true,
    authenticated: false,
    email: null,
    name: null,
    avatarUrl: null,
  });

  useEffect(() => {
    getMe().then((data) => {
      setAuth({
        loading: false,
        authenticated: data.authenticated ?? false,
        email: data.email ?? null,
        name: data.name ?? null,
        // Backend sends snake_case; normalise to camelCase here.
        avatarUrl: data.avatar_url ?? null,
      });
    });
  }, []);

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
