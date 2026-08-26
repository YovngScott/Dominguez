import { Routes, Route, Navigate, Link, NavLink, useLocation } from "react-router-dom";
import { useState, useEffect, lazy, Suspense } from "react";
import { useAuth } from "./hooks/useAuth";
import { useRol } from "./hooks/useRol";
import Logo from "./components/Logo";
import Icon from "./components/Icon";
import WhatsappConnectModal from "./components/WhatsappConnectModal";
import Login from "./pages/Login";
import { aplicarTema, temaOscuroGuardado } from "./lib/theme";
import { supabase } from "./lib/supabaseClient";

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
const Tramos = lazy(() => import("./pages/Tramos"));
const Entregados = lazy(() => import("./pages/Entregados"));
const Landing = lazy(() => import("./pages/Landing"));
const ClientList = lazy(() => import("./pages/ClientList"));
const ContactosList = lazy(() => import("./pages/ContactosList"));
const CitasList = lazy(() => import("./pages/CitasList"));
const Reportes = lazy(() => import("./pages/Reportes"));
const Suministros = lazy(() => import("./pages/Suministros"));
const Nevera = lazy(() => import("./pages/Nevera"));
const KioskSuministros = lazy(() => import("./pages/KioskSuministros"));
const TallerDashboard = lazy(() => import("./pages/TallerDashboard"));
const TrabajadorDetail = lazy(() => import("./pages/TrabajadorDetail"));
const TrabajadoresList = lazy(() => import("./pages/TrabajadoresList"));
const ReporteTrabajadores = lazy(() => import("./pages/ReporteTrabajadores"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const Llaves = lazy(() => import("./pages/Llaves"));
const Mensajes = lazy(() => import("./pages/Mensajes"));

// El menú muestra áreas de trabajo. Las pantallas específicas viven dentro de
// cada área para evitar una lista larga de funciones sin jerarquía.
const NAV_GROUPS = [
  {
    id: "mensajes", label: "Mensajes", icon: "mail", soloAdmin: true, muestraContador: true,
    items: [
      { to: "/mensajes", label: "Centro de mensajes", icon: "mail" },
      { action: "whatsapp", label: "Conectar WhatsApp", icon: "whatsapp" },
    ],
  },
  {
    id: "operacion", label: "Operación", icon: "clipboard",
    items: [
      { to: "/cotizaciones", label: "Cotizaciones", icon: "receipt" },
      { to: "/ordenes", label: "Recibos", icon: "clipboard" },
      { to: "/llaves", label: "Llaves", icon: "key" },
      { to: "/citas", label: "Citas", icon: "clock" },
      { to: "/entregados", label: "Vehículos entregados", icon: "check" },
    ],
  },
  {
    id: "inventario", label: "Inventario y taller", icon: "package",
    items: [
      { to: "/piezas", label: "Piezas", icon: "layers" },
      { to: "/etiquetas", label: "Etiquetas", icon: "tag" },
      { to: "/tramos", label: "Tramos", icon: "grid" },
      { to: "/suministros", label: "Almacén", icon: "package" },
      { to: "/nevera", label: "Nevera", icon: "coins" },
    ],
  },
  {
    id: "contactos", label: "Contactos", icon: "user",
    items: [
      { to: "/clientes", label: "Clientes", icon: "user" },
      { to: "/contactos", label: "Aseguradoras y suplidores", icon: "mail" },
    ],
  },
  {
    id: "reportes", label: "Reportes", icon: "file",
    items: [
      { to: "/reportes", label: "Reportes generales", icon: "file" },
      { to: "/taller/reporte", label: "Reporte de taller", icon: "wrench" },
    ],
  },
  {
    id: "administracion", label: "Administración", icon: "cog", soloAdmin: true,
    items: [{ to: "/usuarios", label: "Usuarios", icon: "user" }],
  },
];

function groupForPath(pathname) {
  return NAV_GROUPS.find((group) => group.items.some((item) => item.to && (pathname === item.to || pathname.startsWith(`${item.to}/`))))?.id || "";
}

function PrivateLayout({ children }) {
  const { session, loading, signOut } = useAuth();
  const { cargandoRol, esSuministros, esTaller, esAdministrativo, inactivo } = useRol();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [seccionAbierta, setSeccionAbierta] = useState(() => groupForPath(location.pathname));
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [oscuro, setOscuro] = useState(temaOscuroGuardado);
  const [mensajesNuevos, setMensajesNuevos] = useState(0);

  function toggleTema() {
    setOscuro((v) => {
      const nuevo = !v;
      aplicarTema(nuevo);
      return nuevo;
    });
  }
  // En el formulario de cotización (crear/editar) se oculta el botón "+ Cotización".
  const enFormCotizacion =
    location.pathname === "/cotizaciones/nueva" || /^\/cotizaciones\/[^/]+\/editar$/.test(location.pathname);

  // Cierra el menú móvil al navegar a otra página
  useEffect(() => {
    setMenuOpen(false);
    const activa = groupForPath(location.pathname);
    if (activa) setSeccionAbierta(activa);
  }, [location.pathname]);

  useEffect(() => {
    if (inactivo) signOut();
  }, [inactivo, signOut]);

  useEffect(() => {
    if (!session || !esAdministrativo) {
      setMensajesNuevos(0);
      return undefined;
    }
    let activo = true;
    const cargarContador = async () => {
      const { count } = await supabase
        .from("mensajes_dashboard")
        .select("id", { count: "exact", head: true })
        .eq("estado", "nuevo");
      if (activo) setMensajesNuevos(count || 0);
    };
    cargarContador();
    const channel = supabase
      .channel("contador-mensajes-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "mensajes_dashboard" }, cargarContador)
      .subscribe();
    return () => {
      activo = false;
      supabase.removeChannel(channel);
    };
  }, [session, esAdministrativo]);

  if (loading || cargandoRol) {
    return <div className="p-10 text-center text-gray-500">Cargando…</div>;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  // La tablet del almacén solo puede estar en su pantalla de pedidos: nunca ve
  // el panel administrativo (la base de datos también se lo bloquea vía RLS).
  if (inactivo) return <Navigate to="/login" replace />;
  if (esSuministros) {
    return <Navigate to="/suministros/pedir" replace />;
  }
  const rutaTallerPermitida = location.pathname === "/" || location.pathname.startsWith("/taller/") || /^\/casos\/[^/]+$/.test(location.pathname);
  if (esTaller && !rutaTallerPermitida) return <Navigate to="/" replace />;
  const navegacion = esTaller ? [] : NAV_GROUPS.filter((group) => !group.soloAdmin || esAdministrativo);

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
            {esAdministrativo && !enFormCotizacion && (
              <Link
                to="/cotizaciones/nueva"
                onClick={() => setMenuOpen(false)}
                className="btn-primary text-sm py-2 px-3 whitespace-nowrap"
              >
                + Cotización
              </Link>
            )}
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
            {navegacion.map((group) => {
              const abierta = seccionAbierta === group.id;
              const activa = groupForPath(location.pathname) === group.id;
              return (
                <div key={group.id} className={`rounded-xl ${abierta ? "bg-[var(--paper)]" : ""}`}>
                  <button
                    type="button"
                    onClick={() => setSeccionAbierta((actual) => actual === group.id ? "" : group.id)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-semibold transition-colors ${activa ? "text-[var(--brand-red)]" : "text-[var(--ink)] hover:bg-[var(--paper)]"}`}
                    aria-expanded={abierta}
                  >
                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${activa ? "bg-[var(--brand-red)] text-white" : "bg-[var(--brand-red-50)] text-[var(--brand-red)]"}`}>
                      <Icon name={group.icon} className="w-5 h-5" />
                    </span>
                    <span className="flex-1 text-left">{group.label}</span>
                    {group.muestraContador && mensajesNuevos > 0 && (
                      <span className="min-w-6 rounded-full bg-[var(--brand-red)] px-2 py-0.5 text-center text-xs font-bold text-white">
                        {mensajesNuevos > 99 ? "99+" : mensajesNuevos}
                      </span>
                    )}
                    <Icon name="chevronDown" className={`w-4 h-4 transition-transform ${abierta ? "rotate-180" : ""}`} />
                  </button>
                  {abierta && (
                    <div className="px-2 pb-2 pl-7 space-y-1">
                      {group.items.map((item) => item.action === "whatsapp" ? (
                        <button
                          key={item.action}
                          type="button"
                          onClick={() => { setMenuOpen(false); setWaModalOpen(true); }}
                          className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-[var(--ink)] hover:bg-white"
                        >
                          <Icon name={item.icon} className="w-4 h-4 shrink-0 text-[var(--brand-red)]" />
                          {item.label}
                        </button>
                      ) : (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${isActive ? "bg-[var(--brand-red)] text-white shadow-sm" : "text-[var(--ink)] hover:bg-white"}`}
                        >
                          <Icon name={item.icon} className="w-4 h-4 shrink-0" />
                          <span className="flex-1">{item.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="h-px bg-[var(--line)] my-1" />
            <button
              type="button"
              role="switch"
              aria-checked={oscuro}
              onClick={toggleTema}
              className="flex items-center gap-3 px-3 py-3 rounded-xl font-semibold text-[var(--ink)] hover:bg-[var(--paper)]"
            >
              <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-[var(--brand-red-50)] text-[var(--brand-red)]">
                <Icon name="moon" className="w-5 h-5" />
              </span>
              <span className="flex-1 text-left">Modo oscuro</span>
              {/* Interruptor estilo iOS */}
              <span
                className="relative inline-flex h-7 w-[3.25rem] items-center rounded-full px-0.5 transition-colors duration-300 ease-out shrink-0"
                style={{ backgroundColor: oscuro ? "#34c759" : "#d1d5db" }}
              >
                <span
                  className="h-6 w-6 rounded-full transition-transform duration-300 ease-out"
                  style={{
                    backgroundColor: "#fff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
                    transform: oscuro ? "translateX(1.5rem)" : "translateX(0)",
                  }}
                />
              </span>
            </button>
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
              Cambiar usuario
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

      {waModalOpen && <WhatsappConnectModal onClose={() => setWaModalOpen(false)} />}
    </div>
  );
}

// Igual que PrivateLayout pero sin encabezado (para la vista de reporte/impresión).
function PrivateBare({ children }) {
  const { session, loading } = useAuth();
  const { cargandoRol, esSuministros, inactivo } = useRol();
  const location = useLocation();
  if (loading) return <div className="p-10 text-center text-gray-500">Cargando…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (cargandoRol) return <div className="p-10 text-center text-gray-500">Cargando...</div>;
  if (inactivo) return <Navigate to="/login" replace />;
  if (esSuministros && !location.pathname.startsWith("/suministros/pedir") && !location.pathname.startsWith("/kiosk/suministros")) return <Navigate to="/suministros/pedir" replace />;
  return <Suspense fallback={Cargando}>{children}</Suspense>;
}

const Cargando = <div className="p-10 text-center text-gray-500">Cargando…</div>;

function InicioPorRol() {
  const { cargandoRol, esTaller } = useRol();
  if (cargandoRol) return Cargando;
  return esTaller ? <TallerDashboard /> : <Dashboard />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Página pública para clientes (sin login) */}
      <Route path="/agendar" element={<Suspense fallback={Cargando}>{<Landing />}</Suspense>} />
      {/* Tablet del taller: pantalla aislada para pedir suministros al almacén.
          Sin menú ni acceso a casos, clientes, finanzas ni métricas. */}
      <Route
        path="/kiosk/suministros"
        element={
          <PrivateBare>
            <KioskSuministros />
          </PrivateBare>
        }
      />
      <Route
        path="/suministros/pedir"
        element={
          <PrivateBare>
            <KioskSuministros />
          </PrivateBare>
        }
      />
      <Route
        path="/"
        element={
          <PrivateLayout>
            <InicioPorRol />
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
        path="/mensajes"
        element={
          <PrivateLayout>
            <Mensajes />
          </PrivateLayout>
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
        path="/tramos"
        element={
          <PrivateLayout>
            <Tramos />
          </PrivateLayout>
        }
      />
      <Route
        path="/entregados"
        element={
          <PrivateLayout>
            <Entregados />
          </PrivateLayout>
        }
      />
      <Route
        path="/suministros"
        element={
          <PrivateLayout>
            <Suministros />
          </PrivateLayout>
        }
      />
      <Route
        path="/llaves"
        element={
          <PrivateLayout>
            <Llaves />
          </PrivateLayout>
        }
      />
      <Route
        path="/nevera"
        element={
          <PrivateLayout>
            <Nevera />
          </PrivateLayout>
        }
      />
      <Route
        path="/etiquetas"
        element={
          <PrivateLayout>
            <EtiquetasHistorial />
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
        path="/contactos"
        element={
          <PrivateLayout>
            <ContactosList />
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
      <Route
        path="/usuarios"
        element={
          <PrivateLayout>
            <Usuarios />
          </PrivateLayout>
        }
      />
      <Route
        path="/taller/trabajadores/:trabajadorId"
        element={
          <PrivateLayout>
            <TrabajadorDetail />
          </PrivateLayout>
        }
      />
      <Route
        path="/taller/trabajadores"
        element={
          <PrivateLayout>
            <TrabajadoresList />
          </PrivateLayout>
        }
      />
      <Route
        path="/taller/reporte"
        element={
          <PrivateLayout>
            <ReporteTrabajadores />
          </PrivateLayout>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
