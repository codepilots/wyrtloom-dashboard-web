import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SessionProvider } from './auth/SessionContext';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { Login } from './views/Login';
import { Board } from './views/Board';
import { Plugins } from './views/Plugins';
import { Config } from './views/Config';
import { Logs } from './views/Logs';
import { Audit } from './views/Audit';

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route path="/board" element={<Board />} />
            <Route path="/plugins" element={<Plugins />} />
            <Route
              path="/config"
              element={
                <RequireAuth adminOnly>
                  <Config />
                </RequireAuth>
              }
            />
            <Route
              path="/logs"
              element={
                <RequireAuth adminOnly>
                  <Logs />
                </RequireAuth>
              }
            />
            <Route
              path="/audit"
              element={
                <RequireAuth adminOnly>
                  <Audit />
                </RequireAuth>
              }
            />
          </Route>
          <Route path="/" element={<Navigate to="/board" replace />} />
          <Route path="*" element={<Navigate to="/board" replace />} />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}
