import { useEffect, useMemo, useState } from "react";
import Logo from "../components/Logo";
import Icon from "../components/Icon";
import {
  listarSuministros,
  crearPedido,
  cantidadTexto,
  num,
} from "../lib/suministros";

const CLAVE_SOLICITANTE = "suministros_solicitante";

// Pantalla de la TABLET del taller para pedir insumos al almacén.
// Está aislada a propósito: sin menú, sin acceso a casos, clientes ni finanzas.
// Solo lista los suministros y permite enviar una requisición.
export default function KioskSuministros() {
  const [suministros, setSuministros] = useState([]);
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(null); // id del suministro que se está pidiendo
  const [confirmacion, setConfirmacion] = useState(null); // { nombre, cantidad }
  const [solicitante, setSolicitante] = useState(
    () => localStorage.getItem(CLAVE_SOLICITANTE) || ""
  );
  const [pidiendoNombre, setPidiendoNombre] = useState(false);

  async function cargar() {
    try {
      setSuministros(await listarSuministros());
      setError("");
    } catch {
      setError("No se pudieron cargar los suministros. Revisa la conexión.");
    } finally {
      setLoading(false);
    }
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
    const t = setTimeout(() => setConfirmacion(null), 3500);
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

  async function pedir(suministro, cantidad) {
    if (!solicitante) {
      setPidiendoNombre(true);
      return;
    }
    setEnviando(suministro.id);
    setError("");
    try {
      await crearPedido({ suministro, cantidad, solicitante });
      setConfirmacion({ nombre: suministro.nombre, cantidad });
    } catch (err) {
      setError(err.message || "No se pudo enviar la solicitud. Intenta de nuevo.");
    } finally {
      setEnviando(null);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--paper)] flex flex-col">
      {/* Encabezado propio de la tablet (sin menú ni accesos administrativos) */}
      <header className="bg-[var(--ink)] text-white sticky top-0 z-20">
        <div className="h-1 bg-[var(--brand-red)]" />
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Logo size={44} />
            <div className="min-w-0">
              <p className="font-extrabold text-lg leading-tight">Pedir suministros</p>
              <p className="text-white/50 text-sm truncate">Almacén del taller</p>
            </div>
          </div>
          <button
            onClick={() => setPidiendoNombre(true)}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-xl px-4 py-3 text-sm font-semibold shrink-0"
          >
            <Icon name="user" className="w-5 h-5" />
            <span className="max-w-[9rem] truncate">{solicitante || "¿Quién pide?"}</span>
          </button>
        </div>

        {/* Buscador grande, cómodo para el dedo */}
        <div className="px-4 sm:px-6 pb-4">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ink-soft)]">
              <Icon name="search" className="w-6 h-6" />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar insumo… (lija, redutol, cinta)"
              className="w-full text-lg rounded-2xl border-0 bg-white text-[var(--ink)] pl-14 pr-12 py-4 shadow-lg focus:outline-none focus:ring-4 focus:ring-[var(--brand-red)]/30"
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

      <main className="flex-1 px-4 sm:px-6 py-6">
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
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {lista.map((s) => (
              <TarjetaSuministro
                key={s.id}
                suministro={s}
                enviando={enviando === s.id}
                onPedir={(cant) => pedir(s, cant)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Confirmación flotante */}
      {confirmacion && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4 pointer-events-none">
          <div className="bg-emerald-600 text-white rounded-2xl shadow-2xl px-6 py-4 flex items-center gap-3 animate-[pop_.15s_ease-out] max-w-lg">
            <span className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <Icon name="check" className="w-6 h-6" strokeWidth={2.5} />
            </span>
            <div className="min-w-0">
              <p className="font-bold">Solicitud enviada al almacén exitosamente</p>
              <p className="text-white/80 text-sm truncate">
                {cantidadTexto(confirmacion.cantidad)} × {confirmacion.nombre}
              </p>
            </div>
          </div>
        </div>
      )}

      {pidiendoNombre && (
        <ModalNombre inicial={solicitante} onGuardar={guardarSolicitante} onCerrar={() => setPidiendoNombre(false)} />
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

function TarjetaSuministro({ suministro, enviando, onPedir }) {
  const [cantidad, setCantidad] = useState(1);
  const stock = num(suministro.stock);
  const sinStock = stock <= 0;
  const bajo = !sinStock && stock <= num(suministro.stock_minimo);

  return (
    <div className="card overflow-hidden flex flex-col">
      <div className="aspect-square bg-[var(--surface-2)] relative">
        {suministro.imagen_url ? (
          <img
            src={suministro.imagen_url}
            alt={suministro.nombre}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--ink-soft)]">
            <Icon name="package" className="w-14 h-14 opacity-40" />
          </div>
        )}
        <span
          className={`absolute top-2 right-2 text-xs font-bold px-2.5 py-1 rounded-full ${
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

      <div className="p-3 flex flex-col flex-1">
        <p className="font-bold text-[var(--ink)] leading-tight line-clamp-2">{suministro.nombre}</p>
        {suministro.categoria && (
          <p className="text-xs text-[var(--ink-soft)] mt-0.5">{suministro.categoria}</p>
        )}

        <div className="mt-auto pt-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <button
              onClick={() => setCantidad((c) => Math.max(1, c - 1))}
              disabled={cantidad <= 1}
              className="w-12 h-12 rounded-xl bg-[var(--surface-2)] text-[var(--ink)] text-2xl font-bold disabled:opacity-40 active:scale-95 transition"
              aria-label="Menos"
            >
              −
            </button>
            <input
              type="number"
              min="1"
              value={cantidad}
              onChange={(e) => setCantidad(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full text-center text-2xl font-extrabold bg-transparent text-[var(--ink)] focus:outline-none"
              aria-label="Cantidad"
            />
            <button
              onClick={() => setCantidad((c) => c + 1)}
              className="w-12 h-12 rounded-xl bg-[var(--surface-2)] text-[var(--ink)] text-2xl font-bold active:scale-95 transition"
              aria-label="Más"
            >
              +
            </button>
          </div>
          <button
            onClick={() => onPedir(cantidad)}
            disabled={enviando || sinStock}
            className="btn-primary w-full py-3 text-base disabled:opacity-50"
          >
            {enviando ? "Enviando…" : sinStock ? "Agotado" : "Pedir"}
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
