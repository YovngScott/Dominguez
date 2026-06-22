import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Icon from "../components/Icon";

export default function ClientList() {
  const [clientes, setClientes] = useState([]);
  const [conteos, setConteos] = useState({}); // cliente_id -> # casos
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(null); // cliente en edición
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const [{ data: cls }, { data: casos }] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, nombre_completo, documento_identidad, telefono, email, direccion, created_at")
        .order("nombre_completo"),
      supabase.from("casos").select("cliente_id"),
    ]);
    const counts = {};
    (casos || []).forEach((c) => {
      counts[c.cliente_id] = (counts[c.cliente_id] || 0) + 1;
    });
    setClientes(cls || []);
    setConteos(counts);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function guardar(cliente) {
    setError("");
    const { error: e } = await supabase
      .from("clientes")
      .update({
        nombre_completo: cliente.nombre_completo,
        documento_identidad: cliente.documento_identidad || null,
        telefono: cliente.telefono || null,
        email: cliente.email || null,
        direccion: cliente.direccion || null,
      })
      .eq("id", cliente.id);
    if (e) {
      setError(e.message || "No se pudo guardar el cliente.");
      return;
    }
    setEditando(null);
    load();
  }

  async function eliminar(cliente) {
    setError("");
    if ((conteos[cliente.id] || 0) > 0) {
      setError(
        `No se puede eliminar "${cliente.nombre_completo}": tiene ${conteos[cliente.id]} caso(s) registrados.`
      );
      return;
    }
    if (!confirm(`¿Eliminar a "${cliente.nombre_completo}"? Esta acción no se puede deshacer.`)) return;
    const { error: e } = await supabase.from("clientes").delete().eq("id", cliente.id);
    if (e) {
      setError("No se pudo eliminar (puede tener casos o citas enlazadas).");
      return;
    }
    load();
  }

  const term = q.trim().toLowerCase();
  const lista = term
    ? clientes.filter((c) =>
        [c.nombre_completo, c.telefono, c.documento_identidad, c.email]
          .filter(Boolean)
          .some((x) => String(x).toLowerCase().includes(term))
      )
    : clientes;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">Clientes</h1>
          <p className="text-sm text-[var(--ink-soft)]">{clientes.length} cliente(s) registrados.</p>
        </div>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre, teléfono, documento o correo…"
        className="input w-full mb-3"
      />

      {error && <p className="text-sm text-[var(--brand-red)] mb-3">{error}</p>}

      {loading ? (
        <p className="text-[var(--ink-soft)]">Cargando…</p>
      ) : lista.length === 0 ? (
        <div className="card p-10 text-center text-[var(--ink-soft)]">
          {term ? "Sin coincidencias." : "Aún no hay clientes registrados."}
        </div>
      ) : (
        <div className="card divide-y divide-[var(--line)] overflow-hidden">
          {lista.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-5 py-4 gap-3">
              <div className="min-w-0">
                <p className="font-bold text-[var(--ink)] truncate">{c.nombre_completo}</p>
                <p className="text-sm text-[var(--ink-soft)] truncate">
                  {[c.telefono, c.email, c.documento_identidad].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs font-medium text-[var(--ink-soft)] bg-[var(--paper)] px-2.5 py-1 rounded-full">
                  {conteos[c.id] || 0} caso(s)
                </span>
                <button
                  onClick={() => setEditando(c)}
                  className="btn-ghost text-sm py-1.5 px-2.5 gap-1"
                  title="Editar"
                >
                  <Icon name="pencil" className="w-4 h-4" />
                </button>
                <button
                  onClick={() => eliminar(c)}
                  className="btn-ghost text-sm py-1.5 px-2.5 gap-1 !text-[var(--brand-red)] hover:!border-[var(--brand-red)]"
                  title="Eliminar"
                >
                  <Icon name="trash" className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editando && (
        <EditarClienteModal
          cliente={editando}
          onCancel={() => setEditando(null)}
          onSave={guardar}
        />
      )}
    </div>
  );
}

function EditarClienteModal({ cliente, onCancel, onSave }) {
  const [form, setForm] = useState({ ...cliente });
  const up = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-[var(--ink)] mb-4">Editar cliente</h2>
        <div className="space-y-3">
          <Campo label="Nombre completo" v={form.nombre_completo} on={(x) => up("nombre_completo", x)} />
          <Campo label="Documento de identidad" v={form.documento_identidad} on={(x) => up("documento_identidad", x)} />
          <Campo label="Teléfono" v={form.telefono} on={(x) => up("telefono", x)} />
          <Campo label="Correo electrónico" v={form.email} on={(x) => up("email", x)} />
          <Campo label="Dirección" v={form.direccion} on={(x) => up("direccion", x)} />
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={() => onSave(form)}
            disabled={!form.nombre_completo?.trim()}
            className="btn-primary disabled:opacity-50"
          >
            Guardar
          </button>
          <button onClick={onCancel} className="btn-ghost">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, v, on }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input value={v || ""} onChange={(e) => on(e.target.value)} className="input" />
    </label>
  );
}
