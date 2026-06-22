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

          {/* Navegación de escritorio */}
          <nav className="hidden lg:flex items-center gap-1">
            <Link to="/cotizaciones/nueva" className="btn-primary text-sm py-2 px-3 mr-1">
              + Cotización
            </Link>
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                    isActive
                      ? "text-[var(--brand-red)] bg-[var(--brand-red-50)]"
                      : "text-[var(--ink-soft)] hover:text-[var(--brand-red)]"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
            <button
              onClick={signOut}
              className="text-sm font-medium text-[var(--ink-soft)] hover:text-[var(--brand-red)] px-3 py-2 rounded-lg"
            >
              Cerrar sesión
            </button>
          </nav>

          {/* Botón hamburguesa (móvil / tablet) */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="lg:hidden w-11 h-11 -mr-1 rounded-xl flex items-center justify-center text-[var(--ink)] hover:bg-[var(--paper)] active:scale-95 transition"
            aria-label="Abrir menú"
            aria-expanded={menuOpen}
          >
            <Icon name={menuOpen ? "close" : "menu"} className="w-6 h-6" strokeWidth={2} />
          </button>
        </div>

        {/* Panel desplegable (móvil / tablet) */}
        <div
          className={`lg:hidden overflow-hidden transition-all duration-300 ease-out ${
            menuOpen ? "max-h-[640px] opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <nav className="px-4 pb-4 pt-1 flex flex-col gap-1.5">
            <Link
              to="/cotizaciones/nueva"
              onClick={() => setMenuOpen(false)}
              className="btn-primary justify-center py-3 mb-1"
            >
              + Nueva cotización
            </Link>
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
            <div className="h-px bg-[var(--line)] my-1.5" />
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
        </div>
      </header>

      {/* Fondo para cerrar tocando fuera del menú */}
      {menuOpen && (
        <button
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setMenuOpen(false)}
          className="lg:hidden fixed inset-0 z-10 bg-black/20 cursor-default"
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
