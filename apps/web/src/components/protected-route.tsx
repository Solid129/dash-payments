import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '@/features/auth/auth-context';

export function ProtectedRoute() {
  const { profile, isReady } = useAuth();
  const location = useLocation();

  if (!isReady) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { profile, isReady } = useAuth();

  if (isReady && profile) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
