import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Icon from "../components/Icon";
import Combobox from "../components/Combobox";

const rd = (valor) => `RD$ ${Number(valor || 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const iso = (fecha) => fecha.toISOString().slice(0, 10);
const fechaLarga = (valor) => new Date(`${valor}T12:00:00`).toLocaleDateString("es-DO", { day: "2-digit", month: "short", year: "numeric" });

function rangoQuincena(fecha = new Date()) {
  const anio = fecha.getFullYear();
  const mes = fecha.getMonth();
  if (fecha.getDate() <= 15) return { desde: iso(new Date(anio, mes, 1)), hasta: iso(new Date(anio, mes, 16)) };
  return { desde: iso(new Date(anio, mes, 16)), hasta: iso(new Date(anio, mes + 1, 1)) };
}

export default function Nevera() {
  const inicial = rangoQuincena();
  const [empleados, setEmpleados] = useState([]);
  const [productos, setProductos] = useState([]);
  const [consumos, setConsumos] = useState([]);
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [form, setForm] = useState({ empleadoId: "", productoId: "", cantidad: "1", fecha: iso(new Date()) });
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [modal, setModal] = useState(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [e, p, c] = await Promise.all([
        supabase.from("nevera_empleados").select("*").order("nombre_completo"),
        supabase.from("nevera_productos").select("*").order("nombre"),
        supabase
          .from("nevera_consumos")
          .select("*, empleado:nevera_empleados(nombre_completo), producto:nevera_productos(nombre)")
          .gte("fecha", desde)
          .lt("fecha", hasta)
          .order("fecha", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);
      if (e.error || p.error || c.error) throw e.error || p.error || c.error;
      setEmpleados(e.data || []); setProductos(p.data || []); setConsumos(c.data || []); setError("");
    } catch (err) {
      setError(err.message?.includes("nevera") ? "Falta ejecutar sql/51_nevera_descuentos.sql en Supabase." : err.message || "No se pudo cargar la nevera.");
    } finally { setCargando(false); }
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { if (!ok) return undefined; const t = setTimeout(() => setOk(""), 4000); return () => clearTimeout(t); }, [ok]);

  const activos = useMemo(() => ({ empleados: empleados.filter((e) => e.activo), productos: productos.filter((p) => p.activo) }), [empleados, productos]);
  const pendientes = useMemo(() => consumos.filter((c) => !c.descontado_at), [consumos]);
  const totalPendiente = useMemo(() => pendientes.reduce((s, c) => s + Number(c.total || 0), 0), [pendientes]);
  const porEmpleado = useMemo(() => {
    const mapa = new Map();
    consumos.forEach((c) => {
      const llave = c.empleado_id;
      const item = mapa.get(llave) || { nombre: c.empleado_nombre, total: 0, pendiente: 0, items: 0 };
      item.total += Number(c.total || 0); item.items += 1; if (!c.descontado_at) item.pendiente += Number(c.total || 0);
      mapa.set(llave, item);
    });
    return [...mapa.values()].sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
  }, [consumos]);

  async function registrar(e) {
    e.preventDefault();
    const empleado = empleados.find((x) => x.id === form.empleadoId);
    const producto = productos.find((x) => x.id === form.productoId);
    const cantidad = Number(form.cantidad);
    if (!empleado || !producto || !cantidad || cantidad <= 0) return setError("Selecciona empleado, producto y una cantidad válida.");
    setGuardando(true); setError("");
    const { error: err } = await supabase.from("nevera_consumos").insert({
      empleado_id: empleado.id, producto_id: producto.id, empleado_nombre: empleado.nombre_completo,
      producto_nombre: producto.nombre, fecha: form.fecha, cantidad, precio_unitario: producto.precio,
    });
    setGuardando(false);
    if (err) return setError(err.message || "No se pudo registrar el consumo.");
    setForm((f) => ({ ...f, productoId: "", cantidad: "1" })); setOk(`${producto.nombre} registrado a ${empleado.nombre_completo}.`); cargar();
  }

  async function cerrarQuincena() {
    if (!pendientes.length || !confirm(`¿Marcar ${rd(totalPendiente)} como descontado en esta quincena? No volverá a salir como pendiente.`)) return;
    setGuardando(true);
    const { error: err } = await supabase.from("nevera_consumos").update({ descontado_at: new Date().toISOString() }).gte("fecha", desde).lt("fecha", hasta).is("descontado_at", null);
    setGuardando(false);
    if (err) return setError(err.message || "No se pudo cerrar la quincena.");
    setOk("Quincena marcada como descontada."); cargar();
  }

  async function borrarConsumo(consumo) {
    if (!confirm(`¿Eliminar ${consumo.producto_nombre} de ${consumo.empleado_nombre}?`)) return;
    const { error: err } = await supabase.from("nevera_consumos").delete().eq("id", consumo.id);
    if (err) setError(err.message || "No se pudo eliminar."); else { setOk("Consumo eliminado."); cargar(); }
  }

  return <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div><div className="flex items-center gap-2"><span className="w-11 h-11 rounded-2xl bg-[var(--brand-red-50)] text-[var(--brand-red)] flex items-center justify-center"><Icon name="coins" className="w-6 h-6" /></span><h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">Nevera</h1></div><p className="text-sm text-[var(--ink-soft)] mt-2">Registra lo que toma cada empleado y prepara el descuento de la quincena.</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={() => setModal("empleado")} className="btn-ghost text-sm py-2 px-3"><Icon name="user" className="w-4 h-4" /> Nuevo empleado</button><button onClick={() => setModal("producto")} className="btn-ghost text-sm py-2 px-3"><Icon name="plus" className="w-4 h-4" /> Nuevo producto</button></div>
    </div>

    <div className="grid sm:grid-cols-3 gap-3 mb-6">
      <Metrica valor={consumos.length} texto="consumo(s) en el período" />
      <Metrica valor={rd(totalPendiente)} texto="pendiente de descontar" rojo />
      <Metrica valor={rd(consumos.reduce((s, c) => s + Number(c.total || 0), 0))} texto="total registrado" />
    </div>

    <div className="grid lg:grid-cols-[1fr,1.25fr] gap-5">
      <section className="card p-5 h-fit"><h2 className="font-extrabold text-[var(--ink)]">Registrar consumo</h2><p className="text-sm text-[var(--ink-soft)] mt-1">El precio queda guardado aunque luego cambie el catálogo.</p>
        <form onSubmit={registrar} className="space-y-4 mt-5">
          <label className="block"><span className="field-label">Empleado *</span><Combobox items={activos.empleados.map((e) => ({ id: e.id, label: e.nombre_completo }))} value={form.empleadoId} onChange={(id) => setForm((f) => ({ ...f, empleadoId: id }))} placeholder="Buscar empleado…" /></label>
          <label className="block"><span className="field-label">Producto *</span><Combobox items={activos.productos.map((p) => ({ id: p.id, label: `${p.nombre} · ${rd(p.precio)}` }))} value={form.productoId} onChange={(id) => setForm((f) => ({ ...f, productoId: id }))} placeholder="Buscar producto…" /></label>
          <div className="grid grid-cols-2 gap-3"><label><span className="field-label">Cantidad *</span><input className="input" type="number" min="1" step="1" value={form.cantidad} onChange={(e) => setForm((f) => ({ ...f, cantidad: e.target.value }))} /></label><label><span className="field-label">Fecha *</span><input className="input" type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} /></label></div>
          <button disabled={guardando} className="btn-primary w-full justify-center disabled:opacity-50"><Icon name="plus" className="w-5 h-5" /> {guardando ? "Guardando…" : "Registrar para descuento"}</button>
        </form>
      </section>

      <section className="card overflow-hidden"><div className="p-5 border-b border-[var(--line)] flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-extrabold text-[var(--ink)]">Descuento quincenal</h2><p className="text-sm text-[var(--ink-soft)]">Del {fechaLarga(desde)} al {fechaLarga(new Date(new Date(`${hasta}T12:00:00`).getTime() - 86400000).toISOString().slice(0, 10))}</p></div><button onClick={cerrarQuincena} disabled={!pendientes.length || guardando} className="btn-primary text-sm py-2 px-3 disabled:opacity-50"><Icon name="check" className="w-4 h-4" /> Marcar descontado</button></div>
        <div className="p-4 border-b border-[var(--line)] print:hidden flex flex-wrap gap-2"><label><span className="field-label">Desde</span><input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label><label><span className="field-label">Hasta (no incluido)</span><input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label><button onClick={() => { const r = rangoQuincena(); setDesde(r.desde); setHasta(r.hasta); }} className="btn-ghost self-end text-sm py-2 px-3">Esta quincena</button><button onClick={() => window.print()} className="btn-ghost self-end text-sm py-2 px-3"><Icon name="printer" className="w-4 h-4" /> Imprimir / PDF</button></div>
        {!porEmpleado.length ? <p className="p-10 text-center text-[var(--ink-soft)]">No hay consumos en este período.</p> : <div className="divide-y divide-[var(--line)]">{porEmpleado.map((e) => <div key={e.nombre} className="p-4 flex items-center justify-between gap-3"><div className="min-w-0"><p className="font-bold text-[var(--ink)] truncate">{e.nombre}</p><p className="text-xs text-[var(--ink-soft)]">{e.items} registro(s){e.pendiente ? ` · Pendiente: ${rd(e.pendiente)}` : " · Descontado"}</p></div><p className="font-extrabold text-lg text-[var(--brand-red)] shrink-0">{rd(e.total)}</p></div>)}</div>}
      </section>
    </div>

    <section className="card overflow-hidden mt-5"><div className="p-5 flex items-center justify-between gap-3 border-b border-[var(--line)]"><div><h2 className="font-extrabold text-[var(--ink)]">Detalle del período</h2><p className="text-sm text-[var(--ink-soft)]">Puedes eliminar un registro equivocado antes de cerrar la quincena.</p></div></div>
      {cargando ? <p className="p-8 text-[var(--ink-soft)]">Cargando…</p> : !consumos.length ? <p className="p-8 text-center text-[var(--ink-soft)]">Aún no hay consumos registrados.</p> : <div className="divide-y divide-[var(--line)]">{consumos.map((c) => <div key={c.id} className="px-4 sm:px-5 py-3 flex items-center gap-3"><span className="w-10 h-10 rounded-xl bg-[var(--surface-2)] text-[var(--brand-red)] flex items-center justify-center shrink-0"><Icon name="coins" className="w-5 h-5" /></span><div className="min-w-0 flex-1"><p className="font-semibold text-[var(--ink)] truncate">{c.empleado_nombre} · {c.producto_nombre}</p><p className="text-xs text-[var(--ink-soft)]">{fechaLarga(c.fecha)} · {c.cantidad} × {rd(c.precio_unitario)} {c.descontado_at ? "· Descontado" : "· Pendiente"}</p></div><p className="font-bold text-[var(--ink)] shrink-0">{rd(c.total)}</p>{!c.descontado_at && <button title="Eliminar" onClick={() => borrarConsumo(c)} className="p-2 text-[var(--ink-soft)] hover:text-[var(--brand-red)]"><Icon name="trash" className="w-4 h-4" /></button>}</div>)}</div>}
    </section>
    {error && <p className="text-sm text-[var(--brand-red)] mt-4">{error}</p>}{ok && <p className="text-sm text-emerald-600 font-semibold mt-4">✓ {ok}</p>}
    {modal && <ModalNuevo tipo={modal} onCerrar={() => setModal(null)} onGuardado={() => { setModal(null); cargar(); }} />}
  </div>;
}

function Metrica({ valor, texto, rojo = false }) { return <div className="card p-4"><p className={`text-2xl font-extrabold ${rojo ? "text-[var(--brand-red)]" : "text-[var(--ink)]"}`}>{valor}</p><p className="text-sm text-[var(--ink-soft)] mt-1">{texto}</p></div>; }

function ModalNuevo({ tipo, onCerrar, onGuardado }) {
  const [nombre, setNombre] = useState(""); const [precio, setPrecio] = useState(""); const [guardando, setGuardando] = useState(false); const [error, setError] = useState("");
  async function guardar(e) { e.preventDefault(); if (!nombre.trim() || (tipo === "producto" && (Number(precio) < 0 || precio === ""))) return setError("Completa los datos requeridos."); setGuardando(true); const payload = tipo === "producto" ? { nombre: nombre.trim().toUpperCase(), precio: Number(precio) } : { nombre_completo: nombre.trim().toUpperCase() }; const { error: err } = await supabase.from(tipo === "producto" ? "nevera_productos" : "nevera_empleados").insert(payload); setGuardando(false); if (err) return setError(err.code === "23505" ? "Ese registro ya existe." : err.message || "No se pudo guardar."); onGuardado(); }
  return <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-end sm:items-center justify-center" onClick={onCerrar}><form onSubmit={guardar} onClick={(e) => e.stopPropagation()} className="card w-full max-w-md p-6"><div className="flex justify-between gap-4"><div><h2 className="text-xl font-extrabold text-[var(--ink)]">{tipo === "producto" ? "Nuevo producto" : "Nuevo empleado"}</h2><p className="text-sm text-[var(--ink-soft)] mt-1">{tipo === "producto" ? "El precio será el que se use en los nuevos consumos." : "Aparecerá al registrar consumos."}</p></div><button type="button" onClick={onCerrar} className="text-[var(--ink-soft)]"><Icon name="close" /></button></div><label className="block mt-5"><span className="field-label">{tipo === "producto" ? "Producto" : "Nombre completo"} *</span><input autoFocus className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>{tipo === "producto" && <label className="block mt-4"><span className="field-label">Precio (RD$) *</span><input className="input" type="number" min="0" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} /></label>}{error && <p className="text-sm text-[var(--brand-red)] mt-3">{error}</p>}<div className="flex gap-3 mt-6"><button type="button" className="btn-ghost flex-1" onClick={onCerrar}>Cancelar</button><button disabled={guardando} className="btn-primary flex-1">{guardando ? "Guardando…" : "Guardar"}</button></div></form></div>;
}
