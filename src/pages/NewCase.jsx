import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import CaseForm from "../components/CaseForm";
import { findOrCreateMarca, findOrCreateModelo } from "../lib/catalogo";

export default function NewCase() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const aseguradoraInicial = searchParams.get("aseguradora") || "";

  async function crear(form) {
    const { data: cliente, error: clienteErr } = await supabase
      .from("clientes")
      .insert({
        nombre_completo: form.nombre_completo,
        telefono: (form.telefonos || []).filter(Boolean).join(" / ") || null,
        email: form.email || null,
      })
      .select()
      .single();
    if (clienteErr) throw clienteErr;

    // Marca/modelo: si no existen en el catálogo, se crean (se guarda lo escrito)
    const marcaId = await findOrCreateMarca(form.marca);
    const modeloId = await findOrCreateModelo(marcaId, form.modelo);

    const { data: caso, error: casoErr } = await supabase
      .from("casos")
      .insert({
        cliente_id: cliente.id,
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
      .select()
      .single();
    if (casoErr) throw casoErr;

    navigate(`/casos/${caso.id}`);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link to="/" className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)]">
        ← Aseguradoras
      </Link>
      <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)] mt-2 mb-6">
        Nuevo caso
      </h1>
      <CaseForm
        initial={{ aseguradora_id: aseguradoraInicial }}
        onSubmit={crear}
        submitLabel="Guardar caso"
        cancelTo="/"
      />
    </div>
  );
}
