import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Combobox from "../components/Combobox";
import ItemModal from "../components/ItemModal";
import { compressImage } from "../lib/imageCompress";
import { uuid } from "../lib/uuid";
import { agregarPiezaCatalogo, findOrCreateMarca, findOrCreateModelo } from "../lib/catalogo";
import Icon from "../components/Icon";
import {
  calcularItem,
  calcularTotales,
  nombrePieza,
  rd,
  TIPOS_VEHICULO,
} from "../lib/cotizacion";

const ANIO_ACTUAL = new Date().getFullYear();
const ANIOS = Array.from({ length: ANIO_ACTUAL + 1 - 1980 + 1 }, (_, i) => {
  const y = String(ANIO_ACTUAL + 1 - i);
  return { id: y, label: y };
});

export default function NewQuote() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { cotId } = useParams();
  const editando = !!cotId;
  const [aseguradoras, setAseguradoras] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [piezasCatalogo, setPiezasCatalogo] = useState([]);
  const [error, setError] = useState("");
  const [estado, setEstado] = useState(""); // texto de progreso
  const [cargando, setCargando] = useState(editando);
  const [original, setOriginal] = useState(null); // cotización original (modo edición)
  const [evidenciasExistentes, setEvidenciasExistentes] = useState([]); // [{id, url}]

  const [modal, setModal] = useState(null); // { tipo, index|null }
  const [evidencias, setEvidencias] = useState([]); // { file, preview }

  const [form, setForm] = useState({
    cliente_nombre: "",
    cliente_email: "",
    telefonos: [""],
    marca: "",
    modelo: "",
    anio: "",
    color: "",
    placa: "",
    chasis: params.get("chasis") || "",
    tipo_vehiculo: "",
    aseguradora_id: params.get("aseguradora") || "",
    numero_reclamo: "",
    numero_poliza: "",
    items_piezas: [],
    items_mano_obra: [],
  });

  useEffect(() => {
    async function load() {
      const [{ data: asegs }, { data: ms }, { data: piezas }] = await Promise.all([
        supabase.from("aseguradoras").select("*").eq("activo", true).order("orden"),
        supabase.from("marcas").select("id, nombre").order("nombre"),
        supabase.from("piezas_catalogo").select("nombre").order("nombre"),
      ]);
      setAseguradoras(asegs || []);
      setMarcas((ms || []).map((m) => ({ id: m.nombre, label: m.nombre, _id: m.id })));
      setPiezasCatalogo((piezas || []).map((p) => ({ id: p.nombre, label: p.nombre })));
    }
    load();
  }, []);

  // Modo edición: carga la cotización existente
  useEffect(() => {
    if (!cotId) return;
    async function load() {
      const { data } = await supabase.from("cotizaciones").select("*").eq("id", cotId).single();
      if (data) {
        setOriginal(data);
        setForm({
          cliente_nombre: data.cliente_nombre || "",
          cliente_email: data.cliente_email || "",
          telefonos: data.telefonos?.length ? data.telefonos : [""],
          marca: data.marca || "",
          modelo: data.modelo || "",
          anio: data.anio ? String(data.anio) : "",
          color: data.color || "",
          placa: data.placa || "",
          chasis: data.chasis || "",
          tipo_vehiculo: data.tipo_vehiculo || "",
          aseguradora_id: data.aseguradora_id || "",
          numero_reclamo: data.numero_reclamo || "",
          numero_poliza: data.numero_poliza || "",
          items_piezas: data.items_piezas || [],
          items_mano_obra: data.items_mano_obra || [],
        });

        const { data: evs } = await supabase
          .from("cotizacion_evidencias")
          .select("id, storage_path")
          .eq("cotizacion_id", cotId);
        const conUrl = await Promise.all(
          (evs || []).map(async (e) => {
            const { data: s } = await supabase.storage.from("cotizaciones").createSignedUrl(e.storage_path, 3600);
            return { id: e.id, url: s?.signedUrl };
          })
        );
        setEvidenciasExistentes(conUrl.filter((e) => e.url));
      }
      setCargando(false);
    }
    load();
  }, [cotId]);

  // Carga modelos cuando la marca escrita coincide con una del catálogo
  useEffect(() => {
    async function loadModelos() {
      const match = marcas.find((m) => m.label.toLowerCase() === form.marca.trim().toLowerCase());
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

  function up(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  // ---- Teléfonos ----
  function setTelefono(i, val) {
    setForm((f) => {
      const t = [...f.telefonos];
      t[i] = val;
      return { ...f, telefonos: t };
    });
  }
  function addTelefono() {
    setForm((f) => ({ ...f, telefonos: [...f.telefonos, ""] }));
  }
  function quitarTelefono(i) {
    setForm((f) => ({ ...f, telefonos: f.telefonos.filter((_, idx) => idx !== i) }));
  }

  // ---- Ítems ----
  function guardarItem(item) {
    const key = modal.tipo === "pieza" ? "items_piezas" : "items_mano_obra";
    setForm((f) => {
      const arr = [...f[key]];
      if (modal.index != null) arr[modal.index] = item;
      else arr.push(item);
      return { ...f, [key]: arr };
    });

    // Si la pieza no está en el catálogo, se guarda para autocompletar luego
    const nombrePiezaItem = modal.tipo === "pieza" ? item.nombre : item.pieza;
    const limpio = (nombrePiezaItem || "").trim();
    if (limpio && !piezasCatalogo.some((p) => p.label.toLowerCase() === limpio.toLowerCase())) {
      agregarPiezaCatalogo(limpio);
      setPiezasCatalogo((prev) => [...prev, { id: limpio, label: limpio }]);
    }

    setModal(null);
  }
  function borrarItem(tipo, index) {
    const key = tipo === "pieza" ? "items_piezas" : "items_mano_obra";
    setForm((f) => ({ ...f, [key]: f[key].filter((_, i) => i !== index) }));
  }

  // ---- Evidencias ----
  function agregarEvidencias(fileList) {
    const nuevas = Array.from(fileList || [])
      .filter((f) => f.type.startsWith("image/"))
      .map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setEvidencias((prev) => [...prev, ...nuevas].slice(0, 50));
  }

  async function quitarEvidenciaExistente(ev) {
    if (!confirm("¿Quitar esta evidencia?")) return;
    await supabase.from("cotizacion_evidencias").delete().eq("id", ev.id);
    setEvidenciasExistentes((prev) => prev.filter((e) => e.id !== ev.id));
  }

  const totales = calcularTotales(form.items_piezas, form.items_mano_obra);

  async function generar() {
    setError("");
    if (!form.cliente_nombre.trim()) return setError("El nombre del cliente es obligatorio.");
    if (!form.aseguradora_id) return setError("Selecciona la aseguradora.");

    try {
      const aseg = aseguradoras.find((a) => a.id === form.aseguradora_id);
      const { data: userData } = await supabase.auth.getUser();
      let cot;

      if (editando) {
        setEstado("Guardando cambios…");
        const { data: actualizada, error: updErr } = await supabase
          .from("cotizaciones")
          .update({
            cliente_nombre: form.cliente_nombre,
            cliente_email: form.cliente_email || null,
            telefonos: form.telefonos.filter(Boolean),
            marca: form.marca || null,
            modelo: form.modelo || null,
            anio: form.anio ? Number(form.anio) : null,
            color: form.color || null,
            placa: form.placa || null,
            chasis: form.chasis || null,
            tipo_vehiculo: form.tipo_vehiculo || null,
            aseguradora_id: form.aseguradora_id,
            aseguradora_nombre: aseg?.nombre || null,
            numero_reclamo: form.numero_reclamo || null,
            numero_poliza: form.numero_poliza || null,
            items_piezas: form.items_piezas,
            items_mano_obra: form.items_mano_obra,
            subtotal: totales.subtotal,
            itbis: totales.itbis,
            total: totales.total,
          })
          .eq("id", cotId)
          .select()
          .single();
        if (updErr) throw updErr;
        cot = actualizada;
      } else {
        setEstado("Asignando número…");
        const { data: numero, error: numErr } = await supabase.rpc("siguiente_numero_cotizacion");
        if (numErr) throw numErr;

        // Busca un caso con el mismo chasis para enlazar
        let casoId = null;
        if (form.chasis.trim()) {
          const { data: casos } = await supabase
            .from("casos")
            .select("id")
            .ilike("chasis", form.chasis.trim())
            .order("created_at", { ascending: false })
            .limit(1);
          casoId = casos?.[0]?.id || null;
        }

        // Si no existe un caso para este vehículo, se crea uno automáticamente
        // (en espera de piezas) con los datos de la cotización.
        if (!casoId) {
          setEstado("Creando caso…");
          const { data: cliente } = await supabase
            .from("clientes")
            .insert({
              nombre_completo: form.cliente_nombre,
              email: form.cliente_email || null,
              telefono: form.telefonos.filter(Boolean)[0] || null,
            })
            .select()
            .single();

          const marcaId = await findOrCreateMarca(form.marca);
          const modeloId = await findOrCreateModelo(marcaId, form.modelo);

          const { data: nuevoCaso, error: casoErr } = await supabase
            .from("casos")
            .insert({
              cliente_id: cliente.id,
              aseguradora_id: form.aseguradora_id,
              estado: "en_espera_piezas",
              marca_id: marcaId,
              modelo_id: modeloId,
              anio: form.anio ? Number(form.anio) : null,
              color: form.color || null,
              chasis: form.chasis || null,
              placa: form.placa || null,
              numero_reclamo: form.numero_reclamo || null,
              numero_poliza: form.numero_poliza || null,
              created_by: userData?.user?.id,
            })
            .select()
            .single();
          if (casoErr) throw casoErr;
          casoId = nuevoCaso.id;
        }

        setEstado("Guardando cotización…");
        const { data: nueva, error: insErr } = await supabase
          .from("cotizaciones")
          .insert({
            numero,
            estado: "generada",
            caso_id: casoId,
            cliente_nombre: form.cliente_nombre,
            cliente_email: form.cliente_email || null,
            telefonos: form.telefonos.filter(Boolean),
            marca: form.marca || null,
            modelo: form.modelo || null,
            anio: form.anio ? Number(form.anio) : null,
            color: form.color || null,
            placa: form.placa || null,
            chasis: form.chasis || null,
            tipo_vehiculo: form.tipo_vehiculo || null,
            aseguradora_id: form.aseguradora_id,
            aseguradora_nombre: aseg?.nombre || null,
            numero_reclamo: form.numero_reclamo || null,
            numero_poliza: form.numero_poliza || null,
            items_piezas: form.items_piezas,
            items_mano_obra: form.items_mano_obra,
            subtotal: totales.subtotal,
            itbis: totales.itbis,
            total: totales.total,
            created_by: userData?.user?.id,
          })
          .select()
          .single();
        if (insErr) throw insErr;
        cot = nueva;
      }

      // Sube evidencias nuevas (se guardan con la cotización; no van en el PDF)
      if (evidencias.length) {
        setEstado("Subiendo evidencias…");
        for (const ev of evidencias) {
          const comp = await compressImage(ev.file);
          const path = `${cot.id}/evidencias/${uuid()}.jpg`;
          const { error: upErr } = await supabase.storage
            .from("cotizaciones")
            .upload(path, comp, { contentType: "image/jpeg" });
          if (!upErr) {
            await supabase.from("cotizacion_evidencias").insert({
              cotizacion_id: cot.id,
              storage_path: path,
            });
          }
        }
      }

      setEstado("Generando PDF…");
      const { generarPdfCotizacion } = await import("../lib/cotizacionPdf");
      const blob = await generarPdfCotizacion({
        ...form,
        numero: cot.numero,
        aseguradora_nombre: aseg?.nombre,
        aseguradora_direccion: aseg?.direccion,
        aseguradora_telefono: aseg?.telefono,
      });
      const pdfPath = `${cot.id}/cotizacion.pdf`;
      await supabase.storage
        .from("cotizaciones")
        .upload(pdfPath, blob, { contentType: "application/pdf", upsert: true });
      await supabase.from("cotizaciones").update({ pdf_path: pdfPath }).eq("id", cot.id);

      navigate(`/cotizaciones/${cot.id}`);
    } catch (err) {
      setError(err.message || "No se pudo guardar la cotización.");
      setEstado("");
    }
  }

  if (cargando) {
    return <p className="p-10 text-center text-[var(--ink-soft)]">Cargando…</p>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <Link
        to={editando ? `/cotizaciones/${cotId}` : "/cotizaciones"}
        className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)]"
      >
        ← {editando ? "Volver a la cotización" : "Cotizaciones"}
      </Link>

      {/* Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-[var(--ink)] text-white p-6 sm:p-8 mt-3 mb-6">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-[var(--brand-red)] opacity-25 blur-3xl" />
        <div className="absolute right-24 -bottom-20 w-56 h-56 rounded-full bg-[var(--brand-red)] opacity-10 blur-3xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <span className="inline-block text-[11px] font-semibold uppercase tracking-wide bg-white/10 px-2.5 py-1 rounded-full">
              {editando ? `Editando · ${original?.numero}` : "Borrador"}
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold mt-2">
              {editando ? "Editar cotización" : "Nueva cotización"}
            </h1>
            <p className="text-white/60 mt-1 text-sm max-w-md">
              {editando
                ? "Corrige los datos, agrega o elimina piezas/servicios y vuelve a generar el PDF."
                : "Valora piezas y mano de obra. Al generar se crea el PDF y, si el chasis coincide con un caso, queda enlazada automáticamente."}
            </p>
          </div>
          <span className="hidden sm:block text-white/90">
            <Icon name="receipt" className="w-16 h-16" strokeWidth={1.4} />
          </span>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_330px] gap-6 items-start">
        {/* ===== Columna del formulario ===== */}
        <div className="space-y-5 min-w-0">
          {/* Cliente */}
          <Section icon="user" title="Datos del cliente" desc="Quién es el dueño del vehículo">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Nombre del cliente" required>
                <input value={form.cliente_nombre} onChange={(e) => up("cliente_nombre", e.target.value)} className="input" />
              </Field>
              <Field label="Correo electrónico">
                <input type="email" value={form.cliente_email} onChange={(e) => up("cliente_email", e.target.value)} className="input" placeholder="correo@ejemplo.com" />
              </Field>
            </div>
            <div className="mt-4">
              <span className="field-label">Teléfono(s)</span>
              <div className="space-y-2">
                {form.telefonos.map((tel, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={tel} onChange={(e) => setTelefono(i, e.target.value)} className="input" placeholder="(809) 555-5555" />
                    {form.telefonos.length > 1 && (
                      <button type="button" onClick={() => quitarTelefono(i)} className="btn-ghost px-3">✕</button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" onClick={addTelefono} className="text-sm text-[var(--brand-red)] font-semibold mt-2">
                + Agregar teléfono
              </button>
            </div>
          </Section>

          {/* Vehículo */}
          <Section icon="car" title="Datos del vehículo" desc="Marca, modelo y datos de identificación">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Marca">
                <Combobox items={marcas} value={form.marca} onChange={(id) => setForm((f) => ({ ...f, marca: id, modelo: "" }))} placeholder="Toyota, Honda…" allowCreate />
              </Field>
              <Field label="Modelo">
                <Combobox items={modelos} value={form.modelo} onChange={(id) => up("modelo", id)} placeholder="Corolla, Civic…" allowCreate />
              </Field>
              <Field label="Año">
                <Combobox items={ANIOS} value={form.anio} onChange={(id) => up("anio", id)} placeholder="2020" allowCreate />
              </Field>
              <Field label="Color">
                <input value={form.color} onChange={(e) => up("color", e.target.value)} className="input" placeholder="Negro, Blanco…" />
              </Field>
              <Field label="Placa">
                <input value={form.placa} onChange={(e) => up("placa", e.target.value)} className="input" placeholder="A123456" />
              </Field>
              <Field label="Chasis">
                <input value={form.chasis} onChange={(e) => up("chasis", e.target.value)} className="input" />
              </Field>
              <Field label="Tipo de vehículo">
                <Combobox
                  items={TIPOS_VEHICULO.map((t) => ({ id: t, label: t }))}
                  value={form.tipo_vehiculo}
                  onChange={(v) => up("tipo_vehiculo", v)}
                  placeholder="Seleccionar…"
                />
              </Field>
            </div>
          </Section>

          {/* Seguro */}
          <Section icon="shield" title="Datos del seguro" desc="Aseguradora y números de referencia">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Aseguradora" required>
                <Combobox
                  items={aseguradoras.map((a) => ({ id: a.id, label: a.nombre }))}
                  value={form.aseguradora_id}
                  onChange={(v) => up("aseguradora_id", v)}
                  placeholder="Seleccionar…"
                />
              </Field>
              <Field label="Número de reclamo">
                <input value={form.numero_reclamo} onChange={(e) => up("numero_reclamo", e.target.value)} className="input" />
              </Field>
              <Field label="Número de póliza">
                <input value={form.numero_poliza} onChange={(e) => up("numero_poliza", e.target.value)} className="input" />
              </Field>
            </div>
          </Section>

          {/* Piezas */}
          <ItemsCard
            icon="layers"
            titulo="Valoración de piezas"
            boton="+ Agregar pieza"
            onAdd={() => setModal({ tipo: "pieza", index: null })}
            items={form.items_piezas}
            columnas={["Pieza", "Cant.", "Precio", "ITBIS", "Total"]}
            fila={(it) => {
              const c = calcularItem(it);
              return [nombrePieza(it), it.cantidad, rd(it.precio), rd(c.itbisMonto), rd(c.total)];
            }}
            onEdit={(i) => setModal({ tipo: "pieza", index: i })}
            onDelete={(i) => borrarItem("pieza", i)}
          />

          {/* Mano de obra */}
          <ItemsCard
            icon="wrench"
            titulo="Valoración de mano de obra"
            boton="+ Agregar servicio"
            onAdd={() => setModal({ tipo: "servicio", index: null })}
            items={form.items_mano_obra}
            columnas={["Descripción", "Cant.", "Precio", "ITBIS", "Total"]}
            fila={(it) => {
              const c = calcularItem(it);
              const desc = it.pieza ? `${it.nombre} · ${nombrePieza({ ...it, nombre: it.pieza })}` : it.nombre;
              return [desc, it.cantidad, rd(it.precio), rd(c.itbisMonto), rd(c.total)];
            }}
            onEdit={(i) => setModal({ tipo: "servicio", index: i })}
            onDelete={(i) => borrarItem("servicio", i)}
          />

          {/* Evidencias */}
          <Section icon="image" title="Evidencias del choque" desc="Fotos de los daños del vehículo">
            <div className="flex flex-wrap gap-3">
              {evidenciasExistentes.map((ev) => (
                <div key={ev.id} className="relative group">
                  <img src={ev.url} alt="" className="w-24 h-24 object-cover rounded-xl" />
                  <button
                    onClick={() => quitarEvidenciaExistente(ev)}
                    className="absolute -top-2 -right-2 bg-black/70 text-white w-6 h-6 rounded-full text-sm opacity-0 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {evidencias.map((ev, i) => (
                <div key={i} className="relative group">
                  <img src={ev.preview} alt="" className="w-24 h-24 object-cover rounded-xl" />
                  <button
                    onClick={() => setEvidencias((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute -top-2 -right-2 bg-black/70 text-white w-6 h-6 rounded-full text-sm opacity-0 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <label className="w-24 h-24 border-2 border-dashed border-[var(--line)] rounded-xl flex flex-col items-center justify-center text-2xl text-[var(--ink-soft)] cursor-pointer hover:border-[var(--brand-red)] hover:text-[var(--brand-red)] transition-colors">
                +
                <span className="text-[10px] font-medium mt-0.5">Subir</span>
                <input type="file" accept="image/*" multiple hidden onChange={(e) => agregarEvidencias(e.target.files)} />
              </label>
            </div>
          </Section>
        </div>

        {/* ===== Resumen fijo ===== */}
        <aside className="lg:sticky lg:top-24">
          <div className="card overflow-hidden">
            <div className="bg-[var(--ink)] text-white px-5 py-3.5 flex items-center justify-between">
              <span className="font-bold">Resumen</span>
              <span className="text-white"><Icon name="coins" className="w-6 h-6" /></span>
            </div>
            <div className="p-5">
              <ResumenLinea label={`Piezas (${form.items_piezas.length})`} valor={rd(sumaNeta(form.items_piezas))} />
              <ResumenLinea label={`Mano de obra (${form.items_mano_obra.length})`} valor={rd(sumaNeta(form.items_mano_obra))} />
              <div className="border-t border-[var(--line)] my-3" />
              <ResumenLinea label="Subtotal" valor={rd(totales.subtotal)} />
              <ResumenLinea label="ITBIS (18%)" valor={rd(totales.itbis)} />
              <div className="bg-[var(--paper)] rounded-xl px-4 py-3 mt-3 flex items-center justify-between">
                <span className="font-bold text-[var(--ink)]">TOTAL</span>
                <span className="text-xl font-extrabold text-[var(--brand-red)]">{rd(totales.total)}</span>
              </div>

              {error && <p className="text-sm text-[var(--brand-red)] mt-4">{error}</p>}

              <button onClick={generar} disabled={!!estado} className="btn-primary w-full mt-4">
                {estado || (editando ? "Guardar cambios (PDF)" : "Generar cotización (PDF)")}
              </button>
              <Link
                to={editando ? `/cotizaciones/${cotId}` : "/cotizaciones"}
                className="block text-center text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)] mt-3"
              >
                Cancelar
              </Link>

              {!editando && (
                <p className="text-[11px] text-[var(--ink-soft)] mt-4 leading-relaxed">
                  Si el chasis coincide con un caso registrado, el PDF aparecerá en el
                  apartado <strong>Cotizaciones</strong> de ese caso.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>

      {modal && (
        <ItemModal
          tipo={modal.tipo}
          initial={modal.index != null ? (modal.tipo === "pieza" ? form.items_piezas : form.items_mano_obra)[modal.index] : null}
          onConfirm={guardarItem}
          onCancel={() => setModal(null)}
          sugerenciasPiezas={piezasCatalogo}
        />
      )}
    </div>
  );
}

// Suma neta (sin ITBIS) de un grupo de ítems, para el desglose del resumen.
function sumaNeta(items) {
  return (items || []).reduce((acc, it) => acc + calcularItem(it).neto, 0);
}

function ItemsCard({ icon, titulo, boton, onAdd, items, columnas, fila, onEdit, onDelete }) {
  const totalGrupo = (items || []).reduce((acc, it) => acc + calcularItem(it).total, 0);
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--line)]">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-[var(--brand-red-50)] text-[var(--brand-red)] flex items-center justify-center"><Icon name={icon} className="w-5 h-5" /></span>
          <div>
            <h2 className="font-bold text-[var(--ink)] leading-tight">{titulo}</h2>
            <p className="text-xs text-[var(--ink-soft)]">{items.length} item(s) · {rd(totalGrupo)}</p>
          </div>
        </div>
        <button onClick={onAdd} className="btn-primary text-sm py-2 px-3 whitespace-nowrap">{boton}</button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-[var(--ink-soft)] px-6 py-8 text-center">
          No hay items todavía. Usa “{boton.replace("+ ", "")}”.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-soft)] bg-[var(--paper)] text-xs uppercase tracking-wide">
                <th className="py-2.5 pl-6 pr-2 font-semibold">#</th>
                {columnas.map((c) => (
                  <th key={c} className={`py-2.5 pr-2 font-semibold ${alinear(c)}`}>{c}</th>
                ))}
                <th className="py-2.5 pr-6"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-t border-[var(--line)] hover:bg-[var(--paper)]/60">
                  <td className="py-3 pl-6 pr-2 text-[var(--ink-soft)]">{i + 1}</td>
                  {fila(it).map((celda, j) => (
                    <td
                      key={j}
                      className={`py-3 pr-2 ${alinear(columnas[j])} ${
                        columnas[j] === "Total" ? "font-bold text-[var(--ink)]" : "text-[var(--ink)]"
                      } ${j === 0 ? "font-medium" : ""}`}
                    >
                      {celda}
                    </td>
                  ))}
                  <td className="py-3 pr-6 whitespace-nowrap text-right">
                    <button onClick={() => onEdit(i)} className="px-1 hover:opacity-70" title="Editar"><Icon name="pencil" className="w-4 h-4 inline" /></button>
                    <button onClick={() => onDelete(i)} className="px-1 hover:opacity-70" title="Eliminar"><Icon name="trash" className="w-4 h-4 inline" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function alinear(col) {
  return ["Precio", "ITBIS", "Total", "Cant."].includes(col) ? "text-right" : "text-left";
}

function Section({ icon, title, desc, children }) {
  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-5">
        <span className="w-10 h-10 rounded-xl bg-[var(--brand-red-50)] text-[var(--brand-red)] flex items-center justify-center"><Icon name={icon} className="w-5 h-5" /></span>
        <div>
          <h2 className="font-bold text-[var(--ink)] leading-tight">{title}</h2>
          {desc && <p className="text-xs text-[var(--ink-soft)]">{desc}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="field-label">
        {label} {required && <span className="text-[var(--brand-red)]">*</span>}
      </span>
      {children}
    </label>
  );
}

function ResumenLinea({ label, valor }) {
  return (
    <div className="flex justify-between items-baseline py-1">
      <span className="text-sm text-[var(--ink-soft)]">{label}</span>
      <span className="text-sm font-semibold text-[var(--ink)]">{valor}</span>
    </div>
  );
}
