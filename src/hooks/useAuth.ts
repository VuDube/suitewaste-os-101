import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/useAuthStore';
import { api } from '@/lib/api-client';
import type { User } from '@shared/types';
export function useAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAuthStore(s => s.token);
  const user = useAuthStore(s => s.user);
  const setUser = useAuthStore(s => s.setUser);
  const logout = useAuthStore(s => s.logout);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const localToken = localStorage.getItem('token');
      if (!localToken) throw new Error('No token found');
      return api<User>('/api/auth/me', {
        headers: { Authorization: `Bearer ${localToken}` },
      });
    },
    enabled: !isAuthenticated && !!localStorage.getItem('token'),
    retry: false,
  });
  useEffect(() => {
    if (data) {
      setUser(data);
    }
  }, [data, setUser]);
  useEffect(() => {
    if (isError) {
      logout();
      if (location.pathname !== '/login') {
        navigate('/login');
      }
    }
  }, [isError, logout, navigate, location.pathname]);
  return { user, token, isAuthenticated, isLoading, error };
}