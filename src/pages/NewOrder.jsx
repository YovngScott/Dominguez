import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Icon from "../components/Icon";
import Combobox from "../components/Combobox";
import { useFormDraft, clearFormDraft } from "../hooks/useFormDraft";
import {
  findOrCreateAseguradora,
  findOrCreateMarca,
  findOrCreateModelo,
  getAseguradoraGeneralId,
} from "../lib/catalogo";
import { obtenerFirmaClienteUrl } from "../lib/firmaCliente";

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
  const { ordenId } = useParams();
  const editando = !!ordenId;
  const casoId = params.get("caso") || null;
  const [error, setError] = useState("");
  const [estado, setEstado] = useState("");
  const [cargando, setCargando] = useState(editando);
  const [original, setOriginal] = useState(null);
  const [aseguradoras, setAseguradoras] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const enviandoRef = useRef(false);

  const [form, setForm] = useState({
    fecha: hoy(),
    hora: "",
    cliente: "",
    direccion: "",
    tel: "",
    cel: "",
    email: "",
    cia_seguro: "",
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

  // Autoguardado silencioso (solo al crear un recibo nuevo en blanco)
  useFormDraft({ key: "neworder", form, setForm, enabled: !editando && !casoId });

  // Catálogos para los desplegables (aseguradoras y marcas)
  useEffect(() => {
    async function loadCatalogos() {
      const [{ data: asegs }, { data: ms }] = await Promise.all([
        supabase.from("aseguradoras").select("nombre").eq("activo", true).order("orden"),
        supabase.from("marcas").select("id, nombre").order("nombre"),
      ]);
      setAseguradoras((asegs || []).map((a) => ({ id: a.nombre, label: a.nombre })));
      setMarcas((ms || []).map((m) => ({ id: m.nombre, label: m.nombre, _id: m.id })));
    }
    loadCatalogos();
  }, []);

  // Carga modelos cuando la marca escrita coincide con una del catálogo
  useEffect(() => {
    async function loadModelos() {
      const match = marcas.find(
        (m) => m.label.toLowerCase() === (form.marca || "").trim().toLowerCase()
      );
      if (!match) {
        setModelos([]);
        return;
      }
      const { data } = await supabase
        .from("modelos")
        .select("nombre")
        .eq("marca_id", match._id)
        .order("nombre");
      setModelos((data || []).map((m) => ({ id: m.nombre, label: m.nombre })));
    }
    loadModelos();
  }, [form.marca, marcas]);

  // Modo edición: carga la orden existente
  useEffect(() => {
    if (!ordenId) return;
    async function load() {
      const { data } = await supabase.from("ordenes_reparacion").select("*").eq("id", ordenId).single();
      if (data) {
        setOriginal(data);
        setForm({
          fecha: data.fecha || hoy(),
          hora: data.hora || "",
          cliente: data.cliente || "",
          direccion: data.direccion || "",
          tel: data.tel || "",
          cel: data.cel || "",
          email: data.email || "",
          cia_seguro: data.cia_seguro || "",
          marca: data.marca || "",
          modelo: data.modelo || "",
          anio: data.anio || "",
          color: data.color || "",
          placa: data.placa || "",
          km: data.km || "",
          chasis: data.chasis || "",
          tipo_combustible: data.tipo_combustible || "",
          costo: data.costo || "",
          observaciones: data.observaciones || "",
          trabajos: data.trabajos || "",
        });
      }
      setCargando(false);
    }
    load();
  }, [ordenId]);

  // Prellenar desde un caso
  useEffect(() => {
    if (!casoId || editando) return;
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
    // Seguro contra doble clic/doble toque: bloquea de inmediato, antes de
    // cualquier await, para que no se disparen dos envíos en paralelo
    // (eso creaba un recibo y un caso duplicados).
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setError("");
    if (!form.cliente.trim()) {
      enviandoRef.current = false;
      return setError("El nombre del cliente es obligatorio.");
    }
    setEstado("Guardando…");
    try {
      let orden;

      if (editando) {
        setEstado("Guardando cambios…");
        const { data: actualizada, error: updErr } = await supabase
          .from("ordenes_reparacion")
          .update({ ...form })
          .eq("id", ordenId)
          .select()
          .single();
        if (updErr) throw updErr;
        orden = actualizada;
      } else {
        const { data: userData } = await supabase.auth.getUser();

        // Determina a qué caso queda enlazado este recibo: el que venía por
        // la URL (recibo creado desde dentro de un caso), uno ya existente
        // que coincida por chasis, o uno nuevo creado con los datos del recibo.
        let casoFinal = casoId;

        if (!casoFinal && form.chasis.trim()) {
          const { data: match } = await supabase
            .from("casos")
            .select("id, estado")
            .ilike("chasis", form.chasis.trim())
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (match) casoFinal = match.id;
        }

        if (casoFinal) {
          // El vehículo ya está físicamente en el taller: se mueve a esa categoría.
          await supabase
            .from("casos")
            .update({ estado: "vehiculo_en_taller" })
            .eq("id", casoFinal)
            .neq("estado", "entregado");
        } else {
          setEstado("Creando caso…");
          const { data: cliente, error: clienteErr } = await supabase
            .from("clientes")
            .insert({
              nombre_completo: form.cliente,
              telefono: [form.tel, form.cel].filter(Boolean).join(" / ") || null,
              email: form.email || null,
              direccion: form.direccion || null,
            })
            .select()
            .single();
          if (clienteErr) throw clienteErr;

          const marcaId = await findOrCreateMarca(form.marca);
          const modeloId = await findOrCreateModelo(marcaId, form.modelo);
          const aseguradoraId =
            (await findOrCreateAseguradora(form.cia_seguro)) || (await getAseguradoraGeneralId());

          const { data: nuevoCaso, error: casoErr } = await supabase
            .from("casos")
            .insert({
              cliente_id: cliente.id,
              aseguradora_id: aseguradoraId,
              estado: "vehiculo_en_taller", // el recibo solo se hace cuando el vehículo ya está aquí
              marca_id: marcaId,
              modelo_id: modeloId,
              anio: /^\d+$/.test(form.anio) ? Number(form.anio) : null,
              color: form.color || null,
              chasis: form.chasis || null,
              placa: form.placa || null,
              created_by: userData?.user?.id,
            })
            .select()
            .single();
          if (casoErr) throw casoErr;
          casoFinal = nuevoCaso.id;
        }

        setEstado("Asignando número…");
        const { data: numero, error: nErr } = await supabase.rpc("siguiente_numero_orden");
        if (nErr) throw nErr;

        setEstado("Guardando…");
        const { data: nueva, error: insErr } = await supabase
          .from("ordenes_reparacion")
          .insert({ numero, caso_id: casoFinal, ...form, created_by: userData?.user?.id })
          .select()
          .single();
        if (insErr) throw insErr;
        orden = nueva;
      }

      setEstado("Generando PDF…");
      const { generarPdfOrden } = await import("../lib/ordenPdf");
      const firmaClienteUrl = await obtenerFirmaClienteUrl(orden.caso_id);
      const blob = await generarPdfOrden({
        ...form,
        numero: orden.numero,
        fecha: ddmmaaaa(form.fecha),
        firma_cliente_url: firmaClienteUrl,
      });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank"); // abre el PDF para imprimir

      clearFormDraft("neworder");
      navigate(`/ordenes/${orden.id}`);
    } catch (err) {
      setError(err.message || "No se pudo guardar el recibo.");
      setEstado("");
      enviandoRef.current = false;
    }
  }

  if (cargando) {
    return <p className="p-10 text-center text-[var(--ink-soft)]">Cargando…</p>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link
        to={editando ? `/ordenes/${ordenId}` : casoId ? `/casos/${casoId}` : "/ordenes"}
        className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)]"
      >
        ← Volver
      </Link>

      <div className="relative overflow-hidden rounded-2xl bg-[var(--ink)] text-white p-6 sm:p-8 mt-3 mb-6">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-[var(--brand-red)] opacity-25 blur-3xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <span className="inline-block text-[11px] font-semibold uppercase tracking-wide bg-white/10 px-2.5 py-1 rounded-full">
              {editando ? `Editando · Recibo No. ${original?.numero}` : "Recibo de entrada"}
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold mt-2">Recibo de reparación</h1>
            <p className="text-white/60 mt-1 text-sm max-w-md">
              {editando
                ? "Corrige los datos del recibo y vuelve a generar el PDF para imprimir."
                : "Genera un recibo en una sola hoja con los datos del vehículo y el texto de responsabilidad. Solo faltan las dos firmas."}
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
            <F label="Email" v={form.email} on={(x) => up("email", x)} />
          </div>
        </Card>

        <Card title="Vehículo y seguro">
          <div className="grid sm:grid-cols-3 gap-4">
            <label className="block">
              <span className="field-label">Marca</span>
              <Combobox
                items={marcas}
                value={form.marca}
                onChange={(v) => setForm((f) => ({ ...f, marca: v, modelo: "" }))}
                placeholder="Toyota, Honda…"
                allowCreate
              />
            </label>
            <label className="block">
              <span className="field-label">Modelo</span>
              <Combobox
                items={modelos}
                value={form.modelo}
                onChange={(v) => up("modelo", v)}
                placeholder="Corolla, Civic…"
                allowCreate
              />
            </label>
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
            <label className="block">
              <span className="field-label">Cía. de seguro</span>
              <Combobox
                items={aseguradoras}
                value={form.cia_seguro}
                onChange={(v) => up("cia_seguro", v)}
                placeholder="Seleccionar…"
                allowCreate
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
            {estado || (editando ? "Guardar e imprimir recibo" : "Generar e imprimir recibo")}
          </button>
          <Link
            to={editando ? `/ordenes/${ordenId}` : casoId ? `/casos/${casoId}` : "/ordenes"}
            className="btn-ghost"
          >
            Cancelar
          </Link>
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
