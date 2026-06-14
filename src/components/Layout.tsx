import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useSession } from '../auth/session-context';
import { isAdmin } from '../auth/token';

export function Layout() {
  const { payload, roles, signOut } = useSession();
  const navigate = useNavigate();
  const admin = isAdmin(roles);

  async function onSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'nav-link active' : 'nav-link';

  return (
    <div className="app-shell">
      <header className="topnav">
        <div className="brand">Wyrtloom</div>
        <nav className="nav-links">
          <NavLink to="/board" className={linkClass}>
            Board
          </NavLink>
          <NavLink to="/plugins" className={linkClass}>
            Plugins
          </NavLink>
          {admin && (
            <>
              <NavLink to="/config" className={linkClass}>
                Config
              </NavLink>
              <NavLink to="/logs" className={linkClass}>
                Logs
              </NavLink>
              <NavLink to="/audit" className={linkClass}>
                Audit
              </NavLink>
            </>
          )}
        </nav>
        <div className="nav-user">
          {payload && (
            <span className="muted" title={roles.join(', ')}>
              {payload.user_id} ({roles.join(', ') || 'no roles'})
            </span>
          )}
          <button type="button" className="ghost" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
