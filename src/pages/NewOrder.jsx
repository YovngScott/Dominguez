import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Icon from "../components/Icon";
import Combobox from "../components/Combobox";

const TIPOS_COMBUSTIBLE = ["Gasolina", "Diesel", "Gas"];

function hoy() {
  return new Date().toISOString().slice(0, 10);
}
function ddmmaaaa(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function NewOrder() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const casoId = params.get("caso") || null;
  const [error, setError] = useState("");
  const [estado, setEstado] = useState("");

  const [form, setForm] = useState({
    fecha: hoy(),
    hora: "",
    cliente: "",
    direccion: "",
    tel: "",
    cel: "",
    fax: "",
    email: "",
    cia_seguro: "",
    poliza: "",
    ficha: "",
    marca: "",
    modelo: "",
    anio: "",
    color: "",
    placa: "",
    km: "",
    chasis: "",
    tipo_combustible: "",
    costo: "",
    observaciones: "",
    trabajos: "",
  });

  // Prellenar desde un caso
  useEffect(() => {
    if (!casoId) return;
    async function load() {
      const { data } = await supabase
        .from("casos")
        .select(
          `*, cliente:clientes(*), aseguradora:aseguradoras(nombre),
           marca:marcas(nombre), modelo:modelos(nombre)`
        )
        .eq("id", casoId)
        .single();
      if (!data) return;
      setForm((f) => ({
        ...f,
        cliente: data.cliente?.nombre_completo || "",
        direccion: data.cliente?.direccion || "",
        tel: data.cliente?.telefono || "",
        email: data.cliente?.email || "",
        cia_seguro: data.aseguradora?.nombre || "",
        poliza: data.numero_poliza || "",
        ficha: data.numero_reclamo || "",
        marca: data.marca?.nombre || "",
        modelo: data.modelo?.nombre || "",
        anio: data.anio ? String(data.anio) : "",
        color: data.color || "",
        placa: data.placa || "",
        chasis: data.chasis || "",
      }));
    }
    load();
  }, [casoId]);

  function up(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function generar() {
    setError("");
    if (!form.cliente.trim()) return setError("El nombre del cliente es obligatorio.");
    try {
      setEstado("Asignando número…");
      const { data: numero, error: nErr } = await supabase.rpc("siguiente_numero_orden");
      if (nErr) throw nErr;

      const { data: userData } = await supabase.auth.getUser();
      setEstado("Guardando…");
      const { data: orden, error: insErr } = await supabase
        .from("ordenes_reparacion")
        .insert({ numero, caso_id: casoId, ...form, created_by: userData?.user?.id })
        .select()
        .single();
      if (insErr) throw insErr;

      setEstado("Generando PDF…");
      const { generarPdfOrden } = await import("../lib/ordenPdf");
      const blob = await generarPdfOrden({ ...form, numero, fecha: ddmmaaaa(form.fecha) });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank"); // abre el PDF para imprimir

      navigate(`/ordenes/${orden.id}`);
    } catch (err) {
      setError(err.message || "No se pudo generar la orden.");
      setEstado("");
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link
        to={casoId ? `/casos/${casoId}` : "/ordenes"}
        className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)]"
      >
        ← Volver
      </Link>

      <div className="relative overflow-hidden rounded-2xl bg-[var(--ink)] text-white p-6 sm:p-8 mt-3 mb-6">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-[var(--brand-red)] opacity-25 blur-3xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <span className="inline-block text-[11px] font-semibold uppercase tracking-wide bg-white/10 px-2.5 py-1 rounded-full">
              Recibo de entrada
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold mt-2">Orden de reparación</h1>
            <p className="text-white/60 mt-1 text-sm max-w-md">
              Genera un recibo en una sola hoja con los datos del vehículo y el texto de
              responsabilidad. Solo faltan las dos firmas.
            </p>
          </div>
          <span className="hidden sm:block text-white/90">
            <Icon name="clipboard" className="w-16 h-16" strokeWidth={1.4} />
          </span>
        </div>
      </div>

      <div className="space-y-5">
        <Card title="Datos del cliente">
          <div className="grid sm:grid-cols-2 gap-4">
            <F label="Cliente" req v={form.cliente} on={(x) => up("cliente", x)} />
            <F label="Dirección" v={form.direccion} on={(x) => up("direccion", x)} />
            <F label="Teléfono" v={form.tel} on={(x) => up("tel", x)} />
            <F label="Celular" v={form.cel} on={(x) => up("cel", x)} />
            <F label="Fax" v={form.fax} on={(x) => up("fax", x)} />
            <F label="Email" v={form.email} on={(x) => up("email", x)} />
          </div>
        </Card>

        <Card title="Seguro">
          <div className="grid sm:grid-cols-3 gap-4">
            <F label="Cía. de seguro" v={form.cia_seguro} on={(x) => up("cia_seguro", x)} />
            <F label="Póliza No." v={form.poliza} on={(x) => up("poliza", x)} />
            <F label="No. de ficha" v={form.ficha} on={(x) => up("ficha", x)} />
          </div>
        </Card>

        <Card title="Vehículo">
          <div className="grid sm:grid-cols-3 gap-4">
            <F label="Marca" v={form.marca} on={(x) => up("marca", x)} />
            <F label="Modelo" v={form.modelo} on={(x) => up("modelo", x)} />
            <F label="Año" v={form.anio} on={(x) => up("anio", x)} />
            <F label="Color" v={form.color} on={(x) => up("color", x)} />
            <F label="Placa" v={form.placa} on={(x) => up("placa", x)} />
            <F label="Km/M" v={form.km} on={(x) => up("km", x)} />
            <F label="Chasis" v={form.chasis} on={(x) => up("chasis", x)} />
            <label className="block">
              <span className="field-label">Tipo de combustible</span>
              <Combobox
                items={TIPOS_COMBUSTIBLE.map((t) => ({ id: t, label: t }))}
                value={form.tipo_combustible}
                onChange={(v) => up("tipo_combustible", v)}
                placeholder="Seleccionar…"
              />
            </label>
          </div>
        </Card>

        <Card title="Recepción">
          <div className="grid sm:grid-cols-3 gap-4">
            <F label="Fecha" type="date" v={form.fecha} on={(x) => up("fecha", x)} />
            <F label="Hora" v={form.hora} on={(x) => up("hora", x)} />
            <F label="Costo de reparación (RD$)" v={form.costo} on={(x) => up("costo", x)} />
          </div>
          <div className="mt-4">
            <span className="field-label">Observaciones</span>
            <textarea value={form.observaciones} onChange={(e) => up("observaciones", e.target.value)} rows={2} className="input" />
          </div>
          <div className="mt-4">
            <span className="field-label">Trabajos a realizar</span>
            <textarea value={form.trabajos} onChange={(e) => up("trabajos", e.target.value)} rows={3} className="input" />
          </div>
        </Card>

        {error && <p className="text-sm text-[var(--brand-red)]">{error}</p>}

        <div className="flex gap-3">
          <button onClick={generar} disabled={!!estado} className="btn-primary">
            {estado || "Generar e imprimir recibo"}
          </button>
          <Link to={casoId ? `/casos/${casoId}` : "/ordenes"} className="btn-ghost">Cancelar</Link>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="card p-6">
      <h2 className="font-bold text-[var(--ink)] mb-4">{title}</h2>
      {children}
    </div>
  );
}

function F({ label, v, on, req, type = "text" }) {
  return (
    <label className="block">
      <span className="field-label">
        {label} {req && <span className="text-[var(--brand-red)]">*</span>}
      </span>
      <input type={type} value={v} onChange={(e) => on(e.target.value)} className="input" />
    </label>
  );
}
