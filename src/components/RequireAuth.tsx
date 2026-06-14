import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useSession } from '../auth/session-context';
import { isAdmin } from '../auth/token';

// Gate a route on having a session. `adminOnly` additionally hides the route
// when the (advisory) token roles lack Admin — the server still enforces RBAC,
// this only avoids showing a guaranteed-403 surface.
export function RequireAuth({
  children,
  adminOnly = false,
}: {
  children: ReactNode;
  adminOnly?: boolean;
}) {
  const { token, roles } = useSession();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (adminOnly && !isAdmin(roles)) {
    return (
      <div className="content">
        <div className="banner banner-error" role="alert">
          Not authorized (403): this page requires the Admin role.
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
