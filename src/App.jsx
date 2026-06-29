import { Routes, Route, Navigate, Link, NavLink, useLocation } from "react-router-dom";
import { useState, useEffect, lazy, Suspense } from "react";
import { useAuth } from "./hooks/useAuth";
import Logo from "./components/Logo";
import Icon from "./components/Icon";
import Login from "./pages/Login";

// Cada página se carga bajo demanda (code-splitting): el navegador solo
// descarga el código de la pantalla que se está abriendo, no el de toda la
// app de una vez. Reduce mucho la carga inicial.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const CaseList = lazy(() => import("./pages/CaseList"));
const CaseDetail = lazy(() => import("./pages/CaseDetail"));
const NewCase = lazy(() => import("./pages/NewCase"));
const EditCase = lazy(() => import("./pages/EditCase"));
const CaseReport = lazy(() => import("./pages/CaseReport"));
const QuoteList = lazy(() => import("./pages/QuoteList"));
const NewQuote = lazy(() => import("./pages/NewQuote"));
const QuoteView = lazy(() => import("./pages/QuoteView"));
const OrdersList = lazy(() => import("./pages/OrdersList"));
const NewOrder = lazy(() => import("./pages/NewOrder"));
const OrderView = lazy(() => import("./pages/OrderView"));
const PiezasList = lazy(() => import("./pages/PiezasList"));
const PiezasCaso = lazy(() => import("./pages/PiezasCaso"));
const EtiquetasPiezas = lazy(() => import("./pages/EtiquetasPiezas"));
const EtiquetasHistorial = lazy(() => import("./pages/EtiquetasHistorial"));
const ClientList = lazy(() => import("./pages/ClientList"));
const CitasList = lazy(() => import("./pages/CitasList"));
const Reportes = lazy(() => import("./pages/Reportes"));

const NAV = [
  { to: "/cotizaciones", label: "Cotizaciones", icon: "receipt" },
  { to: "/piezas", label: "Piezas", icon: "layers" },
  { to: "/ordenes", label: "Recibos", icon: "clipboard" },
  { to: "/clientes", label: "Clientes", icon: "user" },
  { to: "/citas", label: "Citas", icon: "clock" },
  { to: "/reportes", label: "Reportes", icon: "file" },
];

function PrivateLayout({ children }) {
  const { session, loading, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Cierra el menú móvil al navegar a otra página
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  if (loading) {
    return <div className="p-10 text-center text-gray-500">Cargando…</div>;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-[var(--line)] sticky top-0 z-30 shadow-sm">
        <div className="h-1 bg-[var(--brand-red)]" />
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link to="/" onClick={() => setMenuOpen(false)}>
            <Logo size={42} />
          </Link>

          {/* Acción rápida + botón de menú (todas las pantallas) */}
          <div className="flex items-center gap-2">
            <Link
              to="/cotizaciones/nueva"
              onClick={() => setMenuOpen(false)}
              className="btn-primary text-sm py-2 px-3 whitespace-nowrap"
            >
              + Cotización
            </Link>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="w-11 h-11 -mr-1 rounded-xl flex items-center justify-center text-[var(--ink)] hover:bg-[var(--paper)] active:scale-95 transition"
              aria-label="Menú"
              aria-expanded={menuOpen}
            >
              <Icon name={menuOpen ? "close" : "menu"} className="w-6 h-6" strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Menú desplegable (escritorio y móvil) */}
        {menuOpen && (
          <nav className="absolute right-4 sm:right-6 top-full mt-1 z-40 w-[min(20rem,calc(100vw-2rem))] bg-white rounded-2xl shadow-xl border border-[var(--line)] p-2 flex flex-col gap-1 max-h-[80vh] overflow-y-auto">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-3 rounded-xl font-semibold transition-colors ${
                    isActive
                      ? "bg-[var(--brand-red)] text-white shadow-sm"
                      : "text-[var(--ink)] hover:bg-[var(--paper)]"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        isActive ? "bg-white/20 text-white" : "bg-[var(--brand-red-50)] text-[var(--brand-red)]"
                      }`}
                    >
                      <Icon name={n.icon} className="w-5 h-5" />
                    </span>
                    {n.label}
                  </>
                )}
              </NavLink>
            ))}
            <div className="h-px bg-[var(--line)] my-1" />
            <button
              onClick={() => {
                setMenuOpen(false);
                signOut();
              }}
              className="flex items-center gap-3 px-3 py-3 rounded-xl font-semibold text-[var(--brand-red)] hover:bg-[var(--brand-red-50)]"
            >
              <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-[var(--brand-red-50)]">
                <Icon name="logout" className="w-5 h-5" />
              </span>
              Cerrar sesión
            </button>
          </nav>
        )}
      </header>

      {/* Fondo para cerrar tocando fuera del menú */}
      {menuOpen && (
        <button
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-20 bg-black/20 cursor-default"
        />
      )}

      <main className="flex-1">
        <Suspense fallback={Cargando}>{children}</Suspense>
      </main>
    </div>
  );
}

// Igual que PrivateLayout pero sin encabezado (para la vista de reporte/impresión).
function PrivateBare({ children }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="p-10 text-center text-gray-500">Cargando…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <Suspense fallback={Cargando}>{children}</Suspense>;
}

const Cargando = <div className="p-10 text-center text-gray-500">Cargando…</div>;

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
        path="/piezas/etiquetas"
        element={
          <PrivateLayout>
            <EtiquetasPiezas />
          </PrivateLayout>
        }
      />
      <Route
        path="/piezas/etiquetas/historial"
        element={
          <PrivateLayout>
            <EtiquetasHistorial />
          </PrivateLayout>
        }
      />
      <Route
        path="/piezas/etiquetas/:etiquetaId"
        element={
          <PrivateLayout>
            <EtiquetasPiezas />
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
