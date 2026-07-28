import { useEffect, useMemo, useState } from "react";
import Logo from "../components/Logo";
import Icon from "../components/Icon";
import ConfirmDialog from "../components/ConfirmDialog";
import { supabase } from "../lib/supabaseClient";
import {
  listarSuministros,
  listarCasosKiosk,
  crearPedido,
  cantidadTexto,
  num,
} from "../lib/suministros";

const CLAVE_SOLICITANTE = "suministros_solicitante";

// Pantalla de la TABLET del taller para pedir insumos al almacén.
// Está aislada a propósito: sin menú, sin acceso a casos, clientes ni finanzas.
// Se arma un pedido con varios artículos y se envía todo junto.
export default function KioskSuministros() {
  const [suministros, setSuministros] = useState([]);
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [carrito, setCarrito] = useState([]); // [{ suministro, cantidad }]
  const [casos, setCasos] = useState([]); // vehículos en proceso (para saber a qué trabajo va)
  const [revisando, setRevisando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [confirmacion, setConfirmacion] = useState(null); // { articulos, unidades }
  const [solicitante, setSolicitante] = useState(
    () => localStorage.getItem(CLAVE_SOLICITANTE) || ""
  );
  const [pidiendoNombre, setPidiendoNombre] = useState(false);
  const [confirmarSalir, setConfirmarSalir] = useState(false);

  async function cargar() {
    try {
      setSuministros(await listarSuministros());
      setError("");
    } catch {
      setError("No se pudieron cargar los suministros. Revisa la conexión.");
    } finally {
      setLoading(false);
    }
    // Los vehículos en proceso son opcionales: si falla, se pide sin vehículo.
    listarCasosKiosk()
      .then(setCasos)
      .catch(() => setCasos([]));
  }

  useEffect(() => {
    cargar();
    // Refresca el stock cada minuto para que la tablet no quede desactualizada.
    const t = setInterval(cargar, 60000);
    return () => clearInterval(t);
  }, []);

  // El mensaje de "solicitud enviada" se cierra solo.
  useEffect(() => {
    if (!confirmacion) return;
    const t = setTimeout(() => setConfirmacion(null), 4000);
    return () => clearTimeout(t);
  }, [confirmacion]);

  function guardarSolicitante(nombre) {
    const limpio = nombre.trim();
    setSolicitante(limpio);
    localStorage.setItem(CLAVE_SOLICITANTE, limpio);
    setPidiendoNombre(false);
  }

  const categorias = useMemo(() => {
    const set = new Set(suministros.map((s) => s.categoria).filter(Boolean));
    return [...set].sort();
  }, [suministros]);

  const term = q.trim().toLowerCase();
  const lista = suministros.filter((s) => {
    if (categoria && s.categoria !== categoria) return false;
    if (!term) return true;
    return [s.nombre, s.categoria].filter(Boolean).some((x) => x.toLowerCase().includes(term));
  });

  const enCarrito = useMemo(() => {
    const m = new Map();
    carrito.forEach((it) => m.set(it.suministro.id, it.cantidad));
    return m;
  }, [carrito]);

  const totalUnidades = carrito.reduce((acc, it) => acc + it.cantidad, 0);

  // Agrega al pedido (o suma si ya estaba).
  function agregar(suministro, cantidad) {
    setCarrito((prev) => {
      const i = prev.findIndex((it) => it.suministro.id === suministro.id);
      if (i === -1) return [...prev, { suministro, cantidad }];
      const copia = [...prev];
      copia[i] = { ...copia[i], cantidad: copia[i].cantidad + cantidad };
      return copia;
    });
  }

  function cambiarCantidad(suministroId, cantidad) {
    setCarrito((prev) =>
      cantidad <= 0
        ? prev.filter((it) => it.suministro.id !== suministroId)
        : prev.map((it) => (it.suministro.id === suministroId ? { ...it, cantidad } : it))
    );
  }

  async function enviarPedido(nota, casoId) {
    if (!solicitante) {
      setRevisando(false);
      setPidiendoNombre(true);
      return;
    }
    setEnviando(true);
    setError("");
    try {
      await crearPedido({ items: carrito, solicitante, nota, casoId });
      setConfirmacion({ articulos: carrito.length, unidades: totalUnidades });
      setCarrito([]);
      setRevisando(false);
    } catch (err) {
      setError(err.message || "No se pudo enviar la solicitud. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--paper)] flex flex-col">
      {/* Encabezado propio de la tablet. NO es fijo: se desliza con la página
          para dejar toda la pantalla libre al ver los insumos. */}
      <header className="bg-[var(--ink)] text-white">
        <div className="h-1 bg-[var(--brand-red)]" />
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Logo size={38} />
            <div className="min-w-0">
              <p className="font-extrabold leading-tight">Pedir suministros</p>
              <p className="text-white/50 text-xs truncate">Almacén del taller</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setPidiendoNombre(true)}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2.5 text-sm font-semibold"
            >
              <Icon name="user" className="w-5 h-5" />
              <span className="max-w-[9rem] truncate">{solicitante || "¿Quién pide?"}</span>
            </button>
            <button
              onClick={() => setConfirmarSalir(true)}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center"
            >
              <Icon name="logout" className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Buscador grande, cómodo para el dedo */}
        <div className="px-4 sm:px-6 pb-4">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ink-soft)]">
              <Icon name="search" className="w-5 h-5" />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar insumo… (lija, redutol, cinta)"
              className="w-full rounded-2xl border-0 bg-white text-[var(--ink)] pl-12 pr-11 py-3 shadow-lg focus:outline-none focus:ring-4 focus:ring-[var(--brand-red)]/30"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--ink-soft)] text-xl"
                aria-label="Limpiar búsqueda"
              >
                ✕
              </button>
            )}
          </div>

          {categorias.length > 0 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              <ChipCategoria activa={!categoria} onClick={() => setCategoria("")}>
                Todos
              </ChipCategoria>
              {categorias.map((c) => (
                <ChipCategoria key={c} activa={categoria === c} onClick={() => setCategoria(c)}>
                  {c}
                </ChipCategoria>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 px-4 sm:px-6 py-5 pb-28">
        {error && (
          <div className="mb-4 rounded-xl bg-[var(--brand-red-50)] text-[var(--brand-red)] px-4 py-3 font-semibold">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-center text-[var(--ink-soft)] py-16 text-lg">Cargando suministros…</p>
        ) : lista.length === 0 ? (
          <div className="card p-12 text-center text-[var(--ink-soft)]">
            <Icon name="package" className="w-14 h-14 mx-auto mb-3 opacity-40" />
            <p className="text-lg">
              {term || categoria ? "No hay insumos que coincidan." : "Aún no hay suministros cargados."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
            {lista.map((s) => (
              <TarjetaSuministro
                key={s.id}
                suministro={s}
                yaEnPedido={enCarrito.get(s.id) || 0}
                onAgregar={(cant) => agregar(s, cant)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Barra del pedido en curso */}
      {carrito.length > 0 && !revisando && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-3 bg-gradient-to-t from-black/25 to-transparent">
          <button
            onClick={() => setRevisando(true)}
            className="w-full max-w-2xl mx-auto flex items-center justify-between gap-3 bg-[var(--brand-red)] text-white rounded-2xl shadow-2xl px-5 py-4 active:scale-[0.99] transition"
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-extrabold shrink-0">
                {carrito.length}
              </span>
              <span className="text-left min-w-0">
                <span className="block font-bold leading-tight">
                  {carrito.length} artículo{carrito.length === 1 ? "" : "s"} en el pedido
                </span>
                <span className="block text-white/80 text-sm">{totalUnidades} unidad(es) en total</span>
              </span>
            </span>
            <span className="font-bold whitespace-nowrap">Revisar →</span>
          </button>
        </div>
      )}

      {/* Confirmación flotante */}
      {confirmacion && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4 pointer-events-none">
          <div className="bg-emerald-600 text-white rounded-2xl shadow-2xl px-6 py-4 flex items-center gap-3 animate-[pop_.15s_ease-out] max-w-lg">
            <span className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <Icon name="check" className="w-6 h-6" strokeWidth={2.5} />
            </span>
            <div className="min-w-0">
              <p className="font-bold">Solicitud enviada al almacén exitosamente</p>
              <p className="text-white/80 text-sm">
                {confirmacion.articulos} artículo(s) · {confirmacion.unidades} unidad(es)
              </p>
            </div>
          </div>
        </div>
      )}

      {revisando && (
        <ModalPedido
          carrito={carrito}
          casos={casos}
          enviando={enviando}
          onCambiarCantidad={cambiarCantidad}
          onEnviar={enviarPedido}
          onCerrar={() => setRevisando(false)}
        />
      )}

      {pidiendoNombre && (
        <ModalNombre
          inicial={solicitante}
          onGuardar={guardarSolicitante}
          onCerrar={() => setPidiendoNombre(false)}
        />
      )}

      {confirmarSalir && (
        <ConfirmDialog
          titulo="¿Cerrar sesión?"
          mensaje={
            carrito.length
              ? `Tienes ${carrito.length} artículo(s) sin enviar y se perderán. Habrá que iniciar sesión de nuevo para volver a pedir.`
              : "Habrá que iniciar sesión de nuevo para volver a pedir suministros."
          }
          confirmLabel="Sí, cerrar sesión"
          icon="logout"
          onCancel={() => setConfirmarSalir(false)}
          onConfirm={() => supabase.auth.signOut()}
        />
      )}
    </div>
  );
}

function ChipCategoria({ activa, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full whitespace-nowrap font-semibold text-sm transition-colors ${
        activa ? "bg-[var(--brand-red)] text-white" : "bg-white/10 text-white/80 hover:bg-white/20"
      }`}
    >
      {children}
    </button>
  );
}

function TarjetaSuministro({ suministro, yaEnPedido, onAgregar }) {
  const [cantidad, setCantidad] = useState(1);
  const stock = num(suministro.stock);
  const sinStock = stock <= 0;
  const bajo = !sinStock && stock <= num(suministro.stock_minimo);

  function agregar() {
    onAgregar(cantidad);
    setCantidad(1);
  }

  return (
    <div className="card overflow-hidden flex flex-col relative">
      {yaEnPedido > 0 && (
        <span className="absolute top-2 left-2 z-10 text-xs font-bold px-2 py-1 rounded-full bg-[var(--brand-red)] text-white shadow">
          {cantidadTexto(yaEnPedido)} en el pedido
        </span>
      )}

      <div className="aspect-[4/3] bg-[var(--surface-2)] relative">
        {suministro.imagen_url ? (
          <img
            src={suministro.imagen_url}
            alt={suministro.nombre}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--ink-soft)]">
            <Icon name="package" className="w-10 h-10 opacity-40" />
          </div>
        )}
        <span
          className={`absolute bottom-2 right-2 text-[11px] font-bold px-2 py-0.5 rounded-full ${
            sinStock
              ? "bg-[var(--brand-red)] text-white"
              : bajo
              ? "bg-amber-100 text-amber-700"
              : "bg-white/90 text-[var(--ink)]"
          }`}
        >
          {sinStock ? "Agotado" : `${cantidadTexto(stock)} ${suministro.unidad}`}
        </span>
      </div>

      <div className="p-2.5 flex flex-col flex-1">
        <p className="font-bold text-sm text-[var(--ink)] leading-tight line-clamp-2">
          {suministro.nombre}
        </p>
        {suministro.categoria && (
          <p className="text-[11px] text-[var(--ink-soft)] mt-0.5 truncate">{suministro.categoria}</p>
        )}

        <div className="mt-auto pt-2">
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <button
              onClick={() => setCantidad((c) => Math.max(1, c - 1))}
              disabled={cantidad <= 1}
              className="w-9 h-9 rounded-lg bg-[var(--surface-2)] text-[var(--ink)] text-xl font-bold disabled:opacity-40 active:scale-95 transition shrink-0"
              aria-label="Menos"
            >
              −
            </button>
            <input
              type="number"
              min="1"
              value={cantidad}
              onChange={(e) => setCantidad(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full text-center text-lg font-extrabold bg-transparent text-[var(--ink)] focus:outline-none min-w-0"
              aria-label="Cantidad"
            />
            <button
              onClick={() => setCantidad((c) => c + 1)}
              className="w-9 h-9 rounded-lg bg-[var(--surface-2)] text-[var(--ink)] text-xl font-bold active:scale-95 transition shrink-0"
              aria-label="Más"
            >
              +
            </button>
          </div>
          <button
            onClick={agregar}
            disabled={sinStock}
            className="btn-primary w-full py-2 text-sm disabled:opacity-50"
          >
            {sinStock ? "Agotado" : "Agregar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Revisión del pedido antes de enviarlo: se pueden ajustar cantidades,
// quitar artículos y dejar una nota para el almacén.
function ModalPedido({ carrito, casos, enviando, onCambiarCantidad, onEnviar, onCerrar }) {
  const [nota, setNota] = useState("");
  const [casoId, setCasoId] = useState("");
  const totalUnidades = carrito.reduce((acc, it) => acc + it.cantidad, 0);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[var(--surface)] w-full max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col">
        <div className="p-5 border-b border-[var(--line)] flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-[var(--ink)]">Tu pedido</h2>
            <p className="text-sm text-[var(--ink-soft)]">
              {carrito.length} artículo(s) · {totalUnidades} unidad(es)
            </p>
          </div>
          <button onClick={onCerrar} className="text-[var(--ink-soft)] text-2xl px-2 leading-none">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {carrito.map(({ suministro, cantidad }) => (
            <div key={suministro.id} className="flex items-center gap-3">
              {suministro.imagen_url ? (
                <img
                  src={suministro.imagen_url}
                  alt=""
                  className="w-14 h-14 rounded-xl object-cover border border-[var(--line)] shrink-0"
                />
              ) : (
                <span className="w-14 h-14 rounded-xl bg-[var(--surface-2)] flex items-center justify-center text-[var(--ink-soft)] shrink-0">
                  <Icon name="package" className="w-6 h-6" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[var(--ink)] leading-tight line-clamp-2">
                  {suministro.nombre}
                </p>
                <p className="text-xs text-[var(--ink-soft)]">
                  En almacén: {cantidadTexto(suministro.stock)} {suministro.unidad}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onCambiarCantidad(suministro.id, cantidad - 1)}
                  className="w-9 h-9 rounded-lg bg-[var(--surface-2)] text-[var(--ink)] text-xl font-bold active:scale-95"
                  aria-label="Menos"
                >
                  −
                </button>
                <span className="w-10 text-center text-lg font-extrabold text-[var(--ink)]">
                  {cantidadTexto(cantidad)}
                </span>
                <button
                  onClick={() => onCambiarCantidad(suministro.id, cantidad + 1)}
                  className="w-9 h-9 rounded-lg bg-[var(--surface-2)] text-[var(--ink)] text-xl font-bold active:scale-95"
                  aria-label="Más"
                >
                  +
                </button>
              </div>
            </div>
          ))}

          {casos.length > 0 && (
            <label className="block pt-2">
              <span className="field-label">¿Para qué vehículo? (opcional)</span>
              <select
                value={casoId}
                onChange={(e) => setCasoId(e.target.value)}
                className="input text-base py-3"
              >
                <option value="">Sin vehículo específico</option>
                {casos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {[c.marca, c.modelo, c.anio].filter(Boolean).join(" ")}
                    {c.placa ? ` · ${c.placa}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="field-label">Nota para el almacén (opcional)</span>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              className="input"
              placeholder="Ej. Es para la bahía 3"
            />
          </label>
        </div>

        <div className="p-5 border-t border-[var(--line)] flex gap-3">
          <button onClick={onCerrar} className="btn-ghost flex-1 py-3">
            Seguir pidiendo
          </button>
          <button
            onClick={() => onEnviar(nota, casoId)}
            disabled={enviando || !carrito.length}
            className="btn-primary flex-1 py-3 disabled:opacity-50"
          >
            {enviando ? "Enviando…" : "Enviar pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalNombre({ inicial, onGuardar, onCerrar }) {
  const [valor, setValor] = useState(inicial || "");
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md p-6">
        <h2 className="text-xl font-extrabold text-[var(--ink)]">¿Quién está pidiendo?</h2>
        <p className="text-sm text-[var(--ink-soft)] mt-1 mb-4">
          Así el almacén sabe a quién entregarle los insumos.
        </p>
        <input
          autoFocus
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && valor.trim() && onGuardar(valor)}
          placeholder="Tu nombre"
          className="input text-lg py-4"
        />
        <div className="flex gap-3 mt-5">
          {inicial && (
            <button onClick={onCerrar} className="btn-ghost flex-1 py-3">
              Cancelar
            </button>
          )}
          <button
            onClick={() => onGuardar(valor)}
            disabled={!valor.trim()}
            className="btn-primary flex-1 py-3 disabled:opacity-50"
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}
