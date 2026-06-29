import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { nombrePieza } from "../lib/cotizacion";
import Icon from "../components/Icon";

const clave = (s) => (s || "").trim().toLowerCase();

export default function PiezasList() {
  const [casos, setCasos] = useState([]); // [{ caso_id, info, total, recibidas }]
  const [q, setQ] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: cots } = await supabase
        .from("cotizaciones")
        .select(
          "caso_id, cliente_nombre, marca, modelo, placa, chasis, numero_reclamo, aseguradora_nombre, items_piezas, created_at"
        )
        .not("caso_id", "is", null)
        .order("created_at", { ascending: false });

      // Agrupa por caso: info más reciente + conjunto de claves de piezas.
      const porCaso = new Map();
      (cots || []).forEach((c) => {
        if (!porCaso.has(c.caso_id)) {
          porCaso.set(c.caso_id, { caso_id: c.caso_id, info: c, claves: new Set() });
        }
        const reg = porCaso.get(c.caso_id);
        (c.items_piezas || []).forEach((it) => {
          const k = clave(nombrePieza(it));
          if (k) reg.claves.add(k);
        });
      });

      // Solo casos que tienen al menos una pieza.
      const conPiezas = [...porCaso.values()].filter((r) => r.claves.size > 0);

      const { data: rec } = await supabase.from("piezas_recibidas").select("caso_id, pieza_clave");
      const recPorCaso = new Map();
      (rec || []).forEach((r) => {
        if (!recPorCaso.has(r.caso_id)) recPorCaso.set(r.caso_id, new Set());
        recPorCaso.get(r.caso_id).add(r.pieza_clave);
      });

      const lista = conPiezas.map((r) => {
        const recSet = recPorCaso.get(r.caso_id) || new Set();
        // Cuenta solo las recibidas que aún existen en la cotización.
        let recibidas = 0;
        r.claves.forEach((k) => {
          if (recSet.has(k)) recibidas += 1;
        });
        return { caso_id: r.caso_id, info: r.info, total: r.claves.size, recibidas };
      });

      // Pendientes primero.
      lista.sort((a, b) => b.total - b.recibidas - (a.total - a.recibidas));
      setCasos(lista);
      setLoading(false);
    }
    load();
  }, []);

  const term = q.trim().toLowerCase();
  let lista = casos;
  if (soloPendientes) lista = lista.filter((c) => c.total - c.recibidas > 0);
  if (term) {
    lista = lista.filter((c) =>
      [c.info.cliente_nombre, c.info.placa, c.info.chasis, c.info.numero_reclamo, c.info.marca, c.info.modelo]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(term))
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">Piezas pendientes</h1>
        <label className="flex items-center gap-2 text-sm text-[var(--ink-soft)] cursor-pointer">
          <input
            type="checkbox"
            checked={soloPendientes}
            onChange={(e) => setSoloPendientes(e.target.checked)}
          />
          Solo con piezas pendientes
        </label>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por cliente, placa, chasis o reclamo…"
        className="input w-full mb-5"
      />

      {loading ? (
        <p className="text-[var(--ink-soft)]">Cargando…</p>
      ) : lista.length === 0 ? (
        <div className="card p-10 text-center text-[var(--ink-soft)]">
          {term || soloPendientes
            ? "No hay casos con piezas pendientes."
            : "Aún no hay piezas. Genera una cotización con piezas y aparecerá aquí."}
        </div>
      ) : (
        <div className="card divide-y divide-[var(--line)] overflow-hidden">
          {lista.map((c) => {
            const pendientes = c.total - c.recibidas;
            const completo = pendientes === 0;
            return (
              <Link
                key={c.caso_id}
                to={`/piezas/${c.caso_id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-[var(--paper)] gap-3"
              >
                <div className="min-w-0">
                  <p className="font-bold text-[var(--ink)] truncate">
                    {[c.info.marca, c.info.modelo].filter(Boolean).join(" ") || "Vehículo"}
                    {c.info.placa ? ` · ${c.info.placa}` : ""}
                  </p>
                  <p className="text-sm text-[var(--ink-soft)] truncate">
                    {c.info.cliente_nombre}
                    {c.info.numero_reclamo ? ` · Reclamo ${c.info.numero_reclamo}` : ""}
                  </p>
                </div>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap inline-flex items-center gap-1.5 ${
                    completo ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                  }`}
                >
                  {completo ? (
                    <>
                      <Icon name="check" className="w-3.5 h-3.5" /> Completo
                    </>
                  ) : (
                    `${pendientes} pendiente(s) de ${c.total}`
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
