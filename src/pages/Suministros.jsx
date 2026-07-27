import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { compressImage } from "../lib/imageCompress";
import { uuid } from "../lib/uuid";
import Icon from "../components/Icon";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  ESTADOS_PEDIDO,
  listarSuministros,
  despacharGrupo,
  cancelarGrupo,
  cantidadTexto,
  num,
} from "../lib/suministros";

const TABS = [
  { id: "pendientes", label: "Pedidos pendientes", icon: "clock" },
  { id: "historial", label: "Historial", icon: "file" },
  { id: "inventario", label: "Inventario", icon: "package" },
];

function fechaHora(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-DO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Panel del personal de almacén: recibe las requisiciones que llegan de la
// tablet, las despacha (descontando el stock) y administra el inventario.
export default function Suministros() {
  const [tab, setTab] = useState("pendientes");
  const [pedidos, setPedidos] = useState([]);
  const [suministros, setSuministros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [procesando, setProcesando] = useState(null); // id del pedido en curso
  const [modalProducto, setModalProducto] = useState(null); // null | "nuevo" | producto
  const [confirmar, setConfirmar] = useState(null);
  const [hayNuevos, setHayNuevos] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [{ data: peds, error: e1 }, sums] = await Promise.all([
        supabase
          .from("suministros_pedidos")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(300),
        listarSuministros({ soloActivos: false }),
      ]);
      if (e1) throw e1;
      setPedidos(peds || []);
      setSuministros(sums);
      setError("");
    } catch (err) {
      setError(
        err.message?.includes("suministros")
          ? "No se pudo cargar. ¿Ejecutaste la migración sql/40_suministros.sql en Supabase?"
          : err.message || "No se pudieron cargar los datos."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Tiempo real: avisa apenas la tablet manda una requisición.
  useEffect(() => {
    const canal = supabase
      .channel("suministros_pedidos_nuevos")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "suministros_pedidos" },
        (payload) => {
          setPedidos((prev) =>
            prev.some((p) => p.id === payload.new.id) ? prev : [payload.new, ...prev]
          );
          setHayNuevos(true);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "suministros_pedidos" },
        (payload) => {
          setPedidos((prev) => prev.map((p) => (p.id === payload.new.id ? payload.new : p)));
        }
      )
      .subscribe();

    // Respaldo por si el tiempo real no está disponible: refresca cada 45 s.
    const t = setInterval(cargar, 45000);
    return () => {
      supabase.removeChannel(canal);
      clearInterval(t);
    };
  }, [cargar]);

  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(() => setOk(""), 4000);
    return () => clearTimeout(t);
  }, [ok]);

  const historial = useMemo(() => pedidos.filter((p) => p.estado !== "pendiente"), [pedidos]);
  const stockPorId = useMemo(() => {
    const m = {};
    suministros.forEach((s) => (m[s.id] = s));
    return m;
  }, [suministros]);

  // Los renglones que se enviaron juntos comparten grupo_id: se muestran como
  // un solo pedido con todos sus artículos.
  const pendientes = useMemo(() => {
    const grupos = new Map();
    pedidos
      .filter((p) => p.estado === "pendiente")
      .forEach((p) => {
        const g = grupos.get(p.grupo_id) || {
          grupo_id: p.grupo_id,
          solicitante: p.solicitante,
          nota: p.nota,
          created_at: p.created_at,
          items: [],
        };
        g.items.push(p);
        grupos.set(p.grupo_id, g);
      });
    return [...grupos.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [pedidos]);

  // Resumen de existencias, siempre a la vista (sin tener que abrir la tablet).
  const resumen = useMemo(() => {
    const activos = suministros.filter((s) => s.activo);
    return {
      insumos: activos.length,
      unidades: activos.reduce((acc, s) => acc + num(s.stock), 0),
      agotados: activos.filter((s) => num(s.stock) <= 0).length,
      bajos: activos.filter((s) => num(s.stock) > 0 && num(s.stock) <= num(s.stock_minimo)).length,
    };
  }, [suministros]);

  // Despacha el pedido completo: el servidor descuenta el stock de todos sus
  // artículos en una sola transacción (todo o nada).
  async function entregar(grupo) {
    setProcesando(grupo.grupo_id);
    setError("");
    try {
      await despacharGrupo(grupo.grupo_id);
      await cargar(); // trae el stock ya descontado
      const n = grupo.items.length;
      setOk(`Pedido entregado: ${n} artículo${n === 1 ? "" : "s"} descontado${n === 1 ? "" : "s"} del almacén.`);
    } catch (err) {
      setError(err.message || "No se pudo despachar el pedido.");
      cargar(); // resincroniza por si otro usuario lo despachó primero
    } finally {
      setProcesando(null);
    }
  }

  async function cancelar(grupo) {
    setProcesando(grupo.grupo_id);
    try {
      await cancelarGrupo(grupo.grupo_id);
      setPedidos((prev) =>
        prev.map((p) => (p.grupo_id === grupo.grupo_id ? { ...p, estado: "cancelado" } : p))
      );
    } catch (err) {
      setError(err.message || "No se pudo cancelar el pedido.");
    } finally {
      setProcesando(null);
      setConfirmar(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <Icon name="package" className="w-6 h-6 text-[var(--brand-red)]" />
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">Almacén</h1>
        </div>
        {tab === "inventario" && (
          <button onClick={() => setModalProducto("nuevo")} className="btn-primary gap-1.5">
            <Icon name="plus" className="w-4 h-4" /> Nuevo insumo
          </button>
        )}
      </div>

      {/* Existencias de un vistazo, sin tener que abrir la tablet */}
      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Metrica valor={resumen.insumos} etiqueta="Insumos distintos" color="var(--ink)" />
          <Metrica
            valor={cantidadTexto(resumen.unidades)}
            etiqueta="Unidades en almacén"
            color="#0284c7"
          />
          <Metrica
            valor={resumen.bajos}
            etiqueta="Quedan pocos"
            color="#d97706"
            onClick={() => setTab("inventario")}
          />
          <Metrica
            valor={resumen.agotados}
            etiqueta="Agotados"
            color="var(--brand-red)"
            onClick={() => setTab("inventario")}
          />
        </div>
      )}

      {/* Aviso de pedidos pendientes */}
      {pendientes.length > 0 && (
        <button
          onClick={() => {
            setTab("pendientes");
            setHayNuevos(false);
          }}
          className={`w-full text-left card p-4 mb-5 border-l-4 flex items-center gap-3 hover:shadow-md transition-shadow ${
            hayNuevos ? "animate-[pop_.2s_ease-out]" : ""
          }`}
          style={{ borderLeftColor: "var(--brand-red)" }}
        >
          <span className="w-11 h-11 rounded-xl bg-[var(--brand-red-50)] text-[var(--brand-red)] flex items-center justify-center shrink-0">
            <Icon name="clock" className="w-6 h-6" />
          </span>
          <div className="min-w-0">
            <p className="font-bold text-[var(--ink)]">
              {pendientes.length} pedido{pendientes.length === 1 ? "" : "s"} pendiente
              {pendientes.length === 1 ? "" : "s"} de entregar
              {hayNuevos && (
                <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--brand-red)] text-white align-middle">
                  NUEVO
                </span>
              )}
            </p>
            <p className="text-sm text-[var(--ink-soft)] truncate">
              Último: {pendientes[0].items.length} artículo(s)
              {pendientes[0].solicitante ? ` · ${pendientes[0].solicitante}` : ""}
            </p>
          </div>
        </button>
      )}

      {/* Pestañas */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              if (t.id === "pendientes") setHayNuevos(false);
            }}
            className={`text-sm px-3.5 py-2 rounded-lg whitespace-nowrap font-semibold transition-colors inline-flex items-center gap-1.5 ${
              tab === t.id
                ? "bg-[var(--brand-red)] text-white"
                : "bg-white border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--ink)]"
            }`}
          >
            <Icon name={t.icon} className="w-4 h-4" />
            {t.label}
            {t.id === "pendientes" && pendientes.length > 0 && (
              <span
                className={`text-xs px-1.5 rounded-full ${
                  tab === t.id ? "bg-white/25" : "bg-[var(--brand-red)] text-white"
                }`}
              >
                {pendientes.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {ok && (
        <p className="mb-4 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-3 text-sm font-medium">
          ✓ {ok}
        </p>
      )}
      {error && <p className="text-sm text-[var(--brand-red)] mb-4">{error}</p>}

      {loading ? (
        <p className="text-[var(--ink-soft)]">Cargando…</p>
      ) : tab === "pendientes" ? (
        <ListaPendientes
          pedidos={pendientes}
          stockPorId={stockPorId}
          procesando={procesando}
          onEntregar={entregar}
          onCancelar={(grupo) =>
            setConfirmar({
              titulo: "¿Cancelar este pedido?",
              mensaje: `Se descartará la solicitud de ${grupo.items.length} artículo(s)${
                grupo.solicitante ? ` de ${grupo.solicitante}` : ""
              }. No se descuenta stock.`,
              confirmLabel: "Sí, cancelar",
              onConfirm: () => cancelar(grupo),
            })
          }
        />
      ) : tab === "historial" ? (
        <Historial pedidos={historial} />
      ) : (
        <Inventario suministros={suministros} onEditar={(s) => setModalProducto(s)} />
      )}

      {modalProducto && (
        <ModalProducto
          producto={modalProducto === "nuevo" ? null : modalProducto}
          onCerrar={() => setModalProducto(null)}
          onGuardado={() => {
            setModalProducto(null);
            cargar();
          }}
        />
      )}

      {confirmar && (
        <ConfirmDialog
          titulo={confirmar.titulo}
          mensaje={confirmar.mensaje}
          confirmLabel={confirmar.confirmLabel}
          onCancel={() => setConfirmar(null)}
          onConfirm={confirmar.onConfirm}
        />
      )}
    </div>
  );
}

function Metrica({ valor, etiqueta, color, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`card p-4 text-left ${onClick ? "hover:border-[var(--brand-red)] transition-colors" : ""}`}
    >
      <p className="text-2xl font-extrabold" style={{ color }}>
        {valor}
      </p>
      <p className="text-xs text-[var(--ink-soft)] mt-0.5">{etiqueta}</p>
    </Tag>
  );
}

function ListaPendientes({ pedidos, stockPorId, procesando, onEntregar, onCancelar }) {
  if (!pedidos.length) {
    return (
      <div className="card p-12 text-center text-[var(--ink-soft)]">
        <Icon name="check" className="w-12 h-12 mx-auto mb-3 text-emerald-500" />
        <p className="font-semibold text-[var(--ink)]">Todo despachado</p>
        <p className="text-sm mt-1">No hay pedidos pendientes del taller.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pedidos.map((grupo) => {
        // Un pedido puede traer varios artículos: se revisa el stock de todos.
        const faltantes = grupo.items.filter((it) => {
          const s = stockPorId[it.suministro_id];
          return s && num(s.stock) < num(it.cantidad);
        });
        const enCurso = procesando === grupo.grupo_id;

        return (
          <div key={grupo.grupo_id} className="card p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
              <div className="min-w-0">
                <p className="font-bold text-[var(--ink)]">
                  {grupo.items.length} artículo{grupo.items.length === 1 ? "" : "s"}
                  {grupo.solicitante ? ` · ${grupo.solicitante}` : ""}
                </p>
                <p className="text-sm text-[var(--ink-soft)]">{fechaHora(grupo.created_at)}</p>
                {grupo.nota && <p className="text-sm text-[var(--ink)] mt-1">{grupo.nota}</p>}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => onCancelar(grupo)}
                  disabled={enCurso}
                  className="btn-ghost text-sm py-2 px-3 !text-[var(--brand-red)] hover:!border-[var(--brand-red)] disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => onEntregar(grupo)}
                  disabled={enCurso || faltantes.length > 0}
                  className="btn-primary text-sm py-2 px-3 gap-1.5 disabled:opacity-50"
                  title={
                    faltantes.length
                      ? "No hay stock suficiente de algún artículo"
                      : "Descuenta el stock y marca entregado"
                  }
                >
                  <Icon name="truck" className="w-4 h-4" />
                  {enCurso ? "Entregando…" : "Marcar como entregado"}
                </button>
              </div>
            </div>

            {faltantes.length > 0 && (
              <p className="text-xs text-[var(--brand-red)] font-semibold mb-2">
                Sin stock suficiente de: {faltantes.map((f) => f.suministro_nombre).join(", ")}
              </p>
            )}

            <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)] pt-1">
              {grupo.items.map((it) => {
                const s = stockPorId[it.suministro_id];
                const stock = num(s?.stock);
                const insuficiente = s && stock < num(it.cantidad);
                return (
                  <li key={it.id} className="flex items-center gap-3 py-2">
                    {s?.imagen_url ? (
                      <img
                        src={s.imagen_url}
                        alt=""
                        className="w-11 h-11 rounded-lg object-cover border border-[var(--line)] shrink-0"
                      />
                    ) : (
                      <span className="w-11 h-11 rounded-lg bg-[var(--surface-2)] flex items-center justify-center text-[var(--ink-soft)] shrink-0">
                        <Icon name="package" className="w-5 h-5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[var(--ink)] truncate">
                        <span className="text-[var(--brand-red)]">{cantidadTexto(it.cantidad)}</span>{" "}
                        {s?.unidad ? `${s.unidad} · ` : "× "}
                        {it.suministro_nombre}
                      </p>
                      <p className={`text-xs ${insuficiente ? "text-[var(--brand-red)] font-semibold" : "text-[var(--ink-soft)]"}`}>
                        En almacén: {cantidadTexto(stock)}
                        {s?.unidad ? ` ${s.unidad}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Historial({ pedidos }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const lista = term
    ? pedidos.filter((p) =>
        [p.suministro_nombre, p.solicitante].filter(Boolean).some((x) => x.toLowerCase().includes(term))
      )
    : pedidos;

  return (
    <>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por insumo o quién lo pidió…"
        className="input w-full mb-4"
      />
      {lista.length === 0 ? (
        <div className="card p-10 text-center text-[var(--ink-soft)]">
          {term ? "Sin coincidencias." : "Aún no hay pedidos despachados."}
        </div>
      ) : (
        <div className="card divide-y divide-[var(--line)] overflow-hidden">
          {lista.map((p) => {
            const est = ESTADOS_PEDIDO[p.estado] || ESTADOS_PEDIDO.pendiente;
            return (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5">
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--ink)] truncate">
                    {cantidadTexto(p.cantidad)} × {p.suministro_nombre}
                  </p>
                  <p className="text-xs text-[var(--ink-soft)] truncate">
                    {p.solicitante ? `${p.solicitante} · ` : ""}
                    Pedido: {fechaHora(p.created_at)}
                    {p.entregado_at ? ` · Entregado: ${fechaHora(p.entregado_at)}` : ""}
                  </p>
                </div>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 ${est.chip}`}
                >
                  {est.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function Inventario({ suministros, onEditar }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const lista = term
    ? suministros.filter((s) =>
        [s.nombre, s.categoria].filter(Boolean).some((x) => x.toLowerCase().includes(term))
      )
    : suministros;

  if (!suministros.length) {
    return (
      <div className="card p-12 text-center text-[var(--ink-soft)]">
        <Icon name="package" className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="font-semibold text-[var(--ink)]">Aún no hay insumos</p>
        <p className="text-sm mt-1">Agrega el primero con “Nuevo insumo”.</p>
      </div>
    );
  }

  return (
    <>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar insumo…"
        className="input w-full mb-4"
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {lista.map((s) => {
          const stock = num(s.stock);
          const sinStock = stock <= 0;
          const bajo = !sinStock && stock <= num(s.stock_minimo);
          return (
            <button
              key={s.id}
              onClick={() => onEditar(s)}
              className={`card p-4 flex items-center gap-3 text-left hover:border-[var(--brand-red)] hover:shadow-md transition-all ${
                s.activo ? "" : "opacity-60"
              }`}
            >
              {s.imagen_url ? (
                <img
                  src={s.imagen_url}
                  alt=""
                  className="w-16 h-16 rounded-xl object-cover border border-[var(--line)] shrink-0"
                />
              ) : (
                <span className="w-16 h-16 rounded-xl bg-[var(--surface-2)] flex items-center justify-center text-[var(--ink-soft)] shrink-0">
                  <Icon name="package" className="w-7 h-7" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[var(--ink)] truncate">{s.nombre}</p>
                <p className="text-xs text-[var(--ink-soft)] truncate">
                  {s.categoria || "Sin categoría"}
                  {s.activo ? "" : " · Oculto en la tablet"}
                </p>
                <span
                  className={`inline-block mt-1.5 text-xs font-bold px-2 py-0.5 rounded-full ${
                    sinStock
                      ? "bg-[var(--brand-red-50)] text-[var(--brand-red)]"
                      : bajo
                      ? "bg-amber-50 text-amber-600"
                      : "bg-emerald-50 text-emerald-600"
                  }`}
                >
                  {cantidadTexto(stock)} {s.unidad}
                  {bajo && !sinStock ? " · queda poco" : ""}
                </span>
              </div>
              <Icon name="pencil" className="w-4 h-4 text-[var(--ink-soft)] shrink-0" />
            </button>
          );
        })}
      </div>
    </>
  );
}

const VACIO = {
  nombre: "",
  categoria: "",
  unidad: "unidad",
  stock: "0",
  stock_minimo: "0",
  imagen_url: "",
  imagen_path: "",
  activo: true,
};

function ModalProducto({ producto, onCerrar, onGuardado }) {
  const [form, setForm] = useState(() =>
    producto
      ? {
          ...producto,
          categoria: producto.categoria || "",
          stock: String(num(producto.stock)),
          stock_minimo: String(num(producto.stock_minimo)),
          imagen_url: producto.imagen_url || "",
          imagen_path: producto.imagen_path || "",
        }
      : VACIO
  );
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const up = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function subirImagen(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Selecciona una imagen válida.");
    setSubiendo(true);
    setError("");
    try {
      const comp = await compressImage(file, { maxWidth: 800, quality: 0.8 });
      const ext = comp.type === "image/webp" ? "webp" : "jpg";
      const path = `${uuid()}.${ext}`;
      const { error: e } = await supabase.storage
        .from("suministros")
        .upload(path, comp, { contentType: comp.type });
      if (e) throw e;
      const { data } = supabase.storage.from("suministros").getPublicUrl(path);
      // Si había una imagen anterior se borra para no dejar basura en el bucket.
      if (form.imagen_path) {
        await supabase.storage.from("suministros").remove([form.imagen_path]).catch(() => {});
      }
      setForm((f) => ({ ...f, imagen_url: data.publicUrl, imagen_path: path }));
    } catch (err) {
      setError(err.message || "No se pudo subir la imagen.");
    } finally {
      setSubiendo(false);
    }
  }

  async function guardar() {
    if (!form.nombre.trim()) return setError("El nombre del producto es obligatorio.");
    setGuardando(true);
    setError("");
    const payload = {
      nombre: form.nombre.trim(),
      categoria: form.categoria.trim() || null,
      unidad: form.unidad.trim() || "unidad",
      stock: num(form.stock),
      stock_minimo: num(form.stock_minimo),
      imagen_url: form.imagen_url || null,
      imagen_path: form.imagen_path || null,
      activo: form.activo,
    };
    const { error: e } = producto
      ? await supabase.from("suministros").update(payload).eq("id", producto.id)
      : await supabase.from("suministros").insert(payload);
    setGuardando(false);
    if (e) {
      setError(e.message || "No se pudo guardar el insumo.");
      return;
    }
    onGuardado();
  }

  async function eliminar() {
    setGuardando(true);
    // Si el insumo ya tiene pedidos, la base de datos no deja borrarlo (para no
    // perder el historial): en ese caso se desactiva y desaparece de la tablet.
    const { error: e } = await supabase.from("suministros").delete().eq("id", producto.id);
    if (e) {
      await supabase.from("suministros").update({ activo: false }).eq("id", producto.id);
    } else if (form.imagen_path) {
      await supabase.storage.from("suministros").remove([form.imagen_path]).catch(() => {});
    }
    setGuardando(false);
    onGuardado();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onCerrar}>
      <div
        className="card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--ink)]">
            {producto ? "Editar insumo" : "Nuevo insumo"}
          </h2>
          <button onClick={onCerrar} className="text-[var(--ink-soft)] text-xl px-2 leading-none">
            ✕
          </button>
        </div>

        {/* Imagen */}
        <div className="flex items-center gap-4 mb-4">
          {form.imagen_url ? (
            <img
              src={form.imagen_url}
              alt=""
              className="w-24 h-24 rounded-xl object-cover border border-[var(--line)]"
            />
          ) : (
            <span className="w-24 h-24 rounded-xl bg-[var(--surface-2)] flex items-center justify-center text-[var(--ink-soft)]">
              <Icon name="package" className="w-9 h-9" />
            </span>
          )}
          <div className="flex-1">
            <label className="btn-ghost text-sm py-2 px-3 gap-1.5 cursor-pointer inline-flex">
              <Icon name="camera" className="w-4 h-4" />
              {subiendo ? "Subiendo…" : form.imagen_url ? "Cambiar imagen" : "Subir imagen"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={subiendo}
                onChange={(e) => {
                  subirImagen(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {form.imagen_url && (
              <button
                onClick={() => setForm((f) => ({ ...f, imagen_url: "", imagen_path: "" }))}
                className="block text-xs text-[var(--brand-red)] mt-2"
              >
                Quitar imagen
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="field-label">Nombre del producto *</span>
            <input
              autoFocus
              value={form.nombre}
              onChange={(e) => up("nombre", e.target.value)}
              className="input"
              placeholder="Lija 400, Redutol, Cinta de enmascarar…"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="field-label">Categoría</span>
              <input
                value={form.categoria}
                onChange={(e) => up("categoria", e.target.value)}
                className="input"
                placeholder="Lijas, Pinturas, Químicos…"
              />
            </label>
            <label className="block">
              <span className="field-label">Unidad de medida</span>
              <input
                value={form.unidad}
                onChange={(e) => up("unidad", e.target.value)}
                className="input"
                placeholder="unidad, galón, rollo…"
              />
            </label>
            <label className="block">
              <span className="field-label">Cantidad en stock *</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.stock}
                onChange={(e) => up("stock", e.target.value)}
                className="input"
              />
            </label>
            <label className="block">
              <span className="field-label">Avisar cuando queden</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.stock_minimo}
                onChange={(e) => up("stock_minimo", e.target.value)}
                className="input"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => up("activo", e.target.checked)}
              className="w-5 h-5 accent-[var(--brand-red)]"
            />
            <span className="text-sm text-[var(--ink-soft)]">Visible en la tablet del taller</span>
          </label>
        </div>

        {error && <p className="text-sm text-[var(--brand-red)] mt-3">{error}</p>}

        <div className="flex gap-3 mt-6">
          {producto && (
            <button
              onClick={() => setConfirmarBorrado(true)}
              disabled={guardando}
              className="btn-ghost !text-[var(--brand-red)] hover:!border-[var(--brand-red)]"
            >
              <Icon name="trash" className="w-4 h-4" />
            </button>
          )}
          <button onClick={onCerrar} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button onClick={guardar} disabled={guardando || subiendo} className="btn-primary flex-1 disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>

        {confirmarBorrado && (
          <ConfirmDialog
            titulo="¿Eliminar este insumo?"
            mensaje={`Se quitará "${form.nombre}" del almacén. Si ya tiene pedidos en el historial, se ocultará de la tablet en vez de borrarse.`}
            confirmLabel="Sí, eliminar"
            onCancel={() => setConfirmarBorrado(false)}
            onConfirm={eliminar}
          />
        )}
      </div>
    </div>
  );
}
