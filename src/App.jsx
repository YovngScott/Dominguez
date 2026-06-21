import { Routes, Route, Navigate, Link } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Logo from "./components/Logo";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CaseList from "./pages/CaseList";
import CaseDetail from "./pages/CaseDetail";
import NewCase from "./pages/NewCase";
import EditCase from "./pages/EditCase";
import CaseReport from "./pages/CaseReport";
import QuoteList from "./pages/QuoteList";
import NewQuote from "./pages/NewQuote";
import QuoteView from "./pages/QuoteView";
import OrdersList from "./pages/OrdersList";
import NewOrder from "./pages/NewOrder";
import OrderView from "./pages/OrderView";
import PiezasList from "./pages/PiezasList";
import PiezasCaso from "./pages/PiezasCaso";
import ClientList from "./pages/ClientList";
import CitasList from "./pages/CitasList";
import Reportes from "./pages/Reportes";

function PrivateLayout({ children }) {
  const { session, loading, signOut } = useAuth();

  if (loading) {
    return <div className="p-10 text-center text-gray-500">Cargando…</div>;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-[var(--line)] sticky top-0 z-20 shadow-sm">
        <div className="h-1 bg-[var(--brand-red)]" />
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link to="/">
            <Logo size={42} />
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              to="/cotizaciones/nueva"
              className="hidden sm:inline-flex btn-primary text-sm py-2 px-3"
            >
              + Cotización
            </Link>
            <Link
              to="/cotizaciones"
              className="text-sm font-medium text-[var(--ink-soft)] hover:text-[var(--brand-red)] px-3 py-2 rounded-lg"
            >
              Cotizaciones
            </Link>
            <Link
              to="/piezas"
              className="text-sm font-medium text-[var(--ink-soft)] hover:text-[var(--brand-red)] px-3 py-2 rounded-lg"
            >
              Piezas
            </Link>
            <Link
              to="/ordenes"
              className="text-sm font-medium text-[var(--ink-soft)] hover:text-[var(--brand-red)] px-3 py-2 rounded-lg"
            >
              Recibos
            </Link>
            <Link
              to="/clientes"
              className="text-sm font-medium text-[var(--ink-soft)] hover:text-[var(--brand-red)] px-3 py-2 rounded-lg"
            >
              Clientes
            </Link>
            <Link
              to="/citas"
              className="text-sm font-medium text-[var(--ink-soft)] hover:text-[var(--brand-red)] px-3 py-2 rounded-lg"
            >
              Citas
            </Link>
            <Link
              to="/reportes"
              className="text-sm font-medium text-[var(--ink-soft)] hover:text-[var(--brand-red)] px-3 py-2 rounded-lg"
            >
              Reportes
            </Link>
            <button
              onClick={signOut}
              className="text-sm font-medium text-[var(--ink-soft)] hover:text-[var(--brand-red)] px-3 py-2 rounded-lg"
            >
              Cerrar sesión
            </button>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

// Igual que PrivateLayout pero sin encabezado (para la vista de reporte/impresión).
function PrivateBare({ children }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="p-10 text-center text-gray-500">Cargando…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <PrivateLayout>
            <Dashboard />
          </PrivateLayout>
        }
      />
      <Route
        path="/aseguradoras/:aseguradoraId"
        element={
          <PrivateLayout>
            <CaseList />
          </PrivateLayout>
        }
      />
      <Route
        path="/casos/nuevo"
        element={
          <PrivateLayout>
            <NewCase />
          </PrivateLayout>
        }
      />
      <Route
        path="/casos/:casoId"
        element={
          <PrivateLayout>
            <CaseDetail />
          </PrivateLayout>
        }
      />
      <Route
        path="/casos/:casoId/editar"
        element={
          <PrivateLayout>
            <EditCase />
          </PrivateLayout>
        }
      />
      {/* Reporte imprimible: sin encabezado para una impresión limpia */}
      <Route
        path="/casos/:casoId/reporte"
        element={
          <PrivateBare>
            <CaseReport />
          </PrivateBare>
        }
      />
      <Route
        path="/cotizaciones"
        element={
          <PrivateLayout>
            <QuoteList />
          </PrivateLayout>
        }
      />
      <Route
        path="/cotizaciones/nueva"
        element={
          <PrivateLayout>
            <NewQuote />
          </PrivateLayout>
        }
      />
      <Route
        path="/cotizaciones/:cotId"
        element={
          <PrivateLayout>
            <QuoteView />
          </PrivateLayout>
        }
      />
      <Route
        path="/cotizaciones/:cotId/editar"
        element={
          <PrivateLayout>
            <NewQuote />
          </PrivateLayout>
        }
      />
      <Route
        path="/ordenes"
        element={
          <PrivateLayout>
            <OrdersList />
          </PrivateLayout>
        }
      />
      <Route
        path="/ordenes/nueva"
        element={
          <PrivateLayout>
            <NewOrder />
          </PrivateLayout>
        }
      />
      <Route
        path="/ordenes/:ordenId"
        element={
          <PrivateLayout>
            <OrderView />
          </PrivateLayout>
        }
      />
      <Route
        path="/ordenes/:ordenId/editar"
        element={
          <PrivateLayout>
            <NewOrder />
          </PrivateLayout>
        }
      />
      <Route
        path="/piezas"
        element={
          <PrivateLayout>
            <PiezasList />
          </PrivateLayout>
        }
      />
      <Route
        path="/piezas/:casoId"
        element={
          <PrivateLayout>
            <PiezasCaso />
          </PrivateLayout>
        }
      />
      <Route
        path="/clientes"
        element={
          <PrivateLayout>
            <ClientList />
          </PrivateLayout>
        }
      />
      <Route
        path="/citas"
        element={
          <PrivateLayout>
            <CitasList />
          </PrivateLayout>
        }
      />
      <Route
        path="/reportes"
        element={
          <PrivateLayout>
            <Reportes />
          </PrivateLayout>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
