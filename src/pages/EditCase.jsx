import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import CaseForm from "../components/CaseForm";
import { findOrCreateMarca, findOrCreateModelo } from "../lib/catalogo";

export default function EditCase() {
  const { casoId } = useParams();
  const navigate = useNavigate();
  const [initial, setInitial] = useState(null);
  const [clienteId, setClienteId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("casos")
        .select("*, cliente:clientes(*), marca:marcas(nombre), modelo:modelos(nombre)")
        .eq("id", casoId)
        .single();

      if (data) {
        setClienteId(data.cliente_id);
        setInitial({
          nombre_completo: data.cliente?.nombre_completo || "",
          telefonos: data.cliente?.telefono ? data.cliente.telefono.split(" / ") : [""],
          email: data.cliente?.email || "",
          aseguradora_id: data.aseguradora_id || "",
          estado: data.estado || "en_espera_piezas",
          marca: data.marca?.nombre || "",
          modelo: data.modelo?.nombre || "",
          anio: data.anio ? String(data.anio) : "",
          color: data.color || "",
          chasis: data.chasis || "",
          placa: data.placa || "",
          numero_reclamo: data.numero_reclamo || "",
          numero_poliza: data.numero_poliza || "",
          suplidor: data.suplidor || "",
          notas: data.notas || "",
        });
      }
      setLoading(false);
    }
    load();
  }, [casoId]);

  async function guardar(form) {
    const { error: clienteErr } = await supabase
      .from("clientes")
      .update({
        nombre_completo: form.nombre_completo,
        telefono: (form.telefonos || []).filter(Boolean).join(" / ") || null,
        email: form.email || null,
      })
      .eq("id", clienteId);
    if (clienteErr) throw clienteErr;

    const marcaId = await findOrCreateMarca(form.marca);
    const modeloId = await findOrCreateModelo(marcaId, form.modelo);

    const { error: casoErr } = await supabase
      .from("casos")
      .update({
        aseguradora_id: form.aseguradora_id,
        estado: form.estado,
        marca_id: marcaId,
        modelo_id: modeloId,
        anio: form.anio ? Number(form.anio) : null,
        color: form.color || null,
        chasis: form.chasis || null,
        placa: form.placa || null,
        numero_reclamo: form.numero_reclamo || null,
        numero_poliza: form.numero_poliza || null,
        suplidor: form.suplidor || null,
        notas: form.notas || null,
      })
      .eq("id", casoId);
    if (casoErr) throw casoErr;

    navigate(`/casos/${casoId}`);
  }

  if (loading) return <p className="p-10 text-center text-[var(--ink-soft)]">Cargando…</p>;
  if (!initial) return <p className="p-10 text-center text-[var(--ink-soft)]">Caso no encontrado.</p>;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link
        to={`/casos/${casoId}`}
        className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)]"
      >
        ← Volver al caso
      </Link>
      <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)] mt-2 mb-6">
        Editar caso
      </h1>
      <CaseForm
        initial={initial}
        onSubmit={guardar}
        submitLabel="Guardar cambios"
        cancelTo={`/casos/${casoId}`}
      />
    </div>
  );
}
