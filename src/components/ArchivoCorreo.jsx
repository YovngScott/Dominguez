import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { supabase } from "../lib/supabaseClient";

const date = value => value ? new Date(value).toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric" }) : "—";
const secondsDate = value => date(value ? Number(value) * 1000 : null);
const normalize = value => value.toUpperCase().replace(/[\s-]/g, "");

export default function ArchivoCorreo({ api, tab }) {
  const [input, setInput] = useState("");
  const [chassis, setChassis] = useState("");
  const [insurer, setInsurer] = useState("");
  const [insurers, setInsurers] = useState([]);
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState(false);
  const [manual, setManual] = useState(null);
  const [ids, setIds] = useState("");
  const [error, setError] = useState("");
  const request = useRef(0);
  const orders = tab === "ordenes";

  useEffect(() => {
    let active = true;
    supabase.from("aseguradoras").select("nombre").order("nombre").then(({ data }) => {
      if (active) setInsurers(data || []);
    });
    return () => { active = false; };
  }, []);

  const refresh = useCallback(async () => {
    const stamp = ++request.current;
    setBusy(true); setError("");
    try {
      const action = orders ? "index_orders" : chassis ? "index_search" : "index_status";
      const next = await api(action, { method: "POST", payload: { chasis: chassis, aseguradora: insurer, page } });
      if (request.current === stamp) setData(next);
    } catch (err) {
      if (request.current === stamp) {
        setData(null);
        setError(/schema cache|correo_cobertura|correo_indice/i.test(err.message) ? "La base de datos aún no tiene activado el índice de correos." : err.message);
      }
    } finally {
      if (request.current === stamp) setBusy(false);
    }
  }, [api, orders, chassis, insurer, page]);

  useEffect(() => {
    setData(null);
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => { clearInterval(timer); };
  }, [refresh]);

  async function action(name, payload) {
    setWorking(true); setError("");
    try { await api(name, { method: "POST", payload }); setManual(null); await refresh(); }
    catch (err) { setError(err.message); }
    finally { setWorking(false); }
  }
  function search(event) {
    event.preventDefault();
    const id = normalize(input.trim());
    if (!/^[A-Z0-9]{8,20}$/.test(id) || !/\d/.test(id)) return setError("Escribe el chasis completo, de 8 a 20 caracteres.");
    setPage(0); setChassis(id);
    if (chassis === id && page === 0) refresh();
  }

  return <section className="mt-5">
    <div className="card p-5">
      <h2 className="text-lg font-extrabold">{orders ? "Órdenes por revisar" : "Buscar por chasis"}</h2>
      <form onSubmit={search} className="mt-4 flex flex-wrap items-end gap-3">
        {!orders && <label className="min-w-48 flex-1 text-xs font-bold">Chasis del vehículo
          <input className="input mt-1 font-mono uppercase" placeholder="Ej. 5XYPGA3XHG270421" value={input} onChange={e => setInput(e.target.value)} />
        </label>}
        <label className="text-xs font-bold">Aseguradora del remitente
          <select className="input mt-1" value={insurer} onChange={e => { setPage(0); setInsurer(e.target.value); }}>
            <option value="">Todas las aseguradoras</option>
            {insurers.map(i => <option key={i.nombre}>{i.nombre}</option>)}
          </select>
        </label>
        {!orders && <button className="btn-primary" disabled={busy || !input.trim()}><Icon name="search" className="h-4 w-4" />Buscar</button>}
      </form>
      {data && <details className="mt-4 text-sm" open={!data.ready || undefined}>
        <summary className="cursor-pointer font-semibold">Historial por cuenta · {data.ready ? "Recorrido de 93 días terminado" : "Carga inicial de 93 días"}</summary>
        <ul className="mt-2 space-y-2">{data.coverage.map(c => <li key={c.id} className="rounded-lg bg-[var(--paper)] p-3">
          <b>{c.email}</b><div>{c.desde ? `Desde ${secondsDate(c.desde)} · Último recorrido hasta ${secondsDate(c.actualizado)}` : "Esperando el primer recorrido"}</div>
          <div>{c.correos} correos leídos · {c.pdf} PDF leídos · {c.pendientes} pendientes · {c.incidencias} con lectura incompleta</div>
          {Number(c.incidencias_historicas_abiertas) > 0 && <div className="text-amber-700">{c.incidencias_historicas_abiertas} incidencias del historial por comprobar en Órdenes por revisar.</div>}
          {(c.error_historico || c.error_reciente) && <div className="text-red-600">{c.error_historico || c.error_reciente}</div>}
        </li>)}</ul>
        {!data.coverage.length && <p className="mt-2">Conecta una cuenta del taller para empezar.</p>}
      </details>}
      <button type="button" className="btn-ghost mt-3 text-xs" disabled={working || busy} onClick={() => action("index_tick", {})}>{working ? "Procesando…" : "Procesar siguiente lote"}</button>
    </div>
    {error && <p role="alert" className="card mt-3 p-4 text-red-600">{error}</p>}
    {busy && <p className="mt-3 text-sm" role="status">Consultando el historial…</p>}
    {data && !orders && chassis && !data.ready && <p className="card mt-3 p-4">La búsqueda se habilitará cuando termine el recorrido inicial de todas las cuentas y se procesen los correos y PDF de esos 93 días.</p>}
    {data && (orders || (chassis && data.ready)) && <>
      <p className="my-4 text-sm font-bold">{orders ? "Órdenes y lecturas que requieren atención" : "Coincidencias para " + chassis}</p>
      {data.coverage.some(c => Number(c.incidencias) || Number(c.pendientes) || c.error_reciente || c.error_historico) && <p className="mb-3 text-sm text-amber-700">Hay lecturas pendientes o incompletas. Puedes ver el detalle por cuenta.</p>}
      {(data.rows || []).map(row => {
        const email = data.coverage.find(c => c.id === row.cuenta)?.email || "";
        const link = "https://mail.google.com/mail/u/?authuser=" + encodeURIComponent(email) + "#all/" + encodeURIComponent(row.hilo || row.gmail_id);
        const evidence = row.evidencia.filter(e => orders || e.chasis === chassis);
        return <article key={row.id} className="card mb-3 p-4">
          <p className="text-xs text-[var(--ink-soft)]">{date(row.fecha)} · {row.aseguradora || row.remitente || email}</p>
          <h3 className="mt-1 font-bold">{row.asunto || "Correo sin asunto"}</h3>
          {row.archivo && <p className="mt-1 break-all text-sm">PDF · {row.archivo}</p>}
          {evidence.map(e => <p key={e.chasis + e.fuente + e.pagina} className="mt-1 text-sm"><b>{e.chasis}</b> · {e.fuente}{e.pagina ? " · pág. " + e.pagina : ""}</p>)}
          {row.detalle && <p className="mt-2 text-sm text-amber-700">{row.detalle}</p>}
          <div className="mt-3 flex flex-wrap gap-2"><a href={link} target="_blank" rel="noreferrer" className="btn-ghost">Abrir en Gmail</a>
            {orders && row.estado === "incidencia" && <button disabled={working} className="btn-ghost" onClick={() => action("index_retry", { id: row.id })}>Reintentar lectura</button>}
            {orders && <button disabled={working} className="btn-primary" onClick={() => {
              if (row.estado === "incidencia") { setManual(row.id); setIds(""); }
              else action("index_review", { id: row.id });
            }}>{row.estado === "incidencia" ? "Revisar manualmente" : "Marcar revisado"}</button>}
          </div>
          {manual === row.id && <form className="mt-3 grid gap-2" onSubmit={e => {
            e.preventDefault(); action("index_review", { id: row.id, identificadores: ids, verificado: true });
          }}>
            <label className="text-sm">Chasis encontrados en el original, separados por comas
              <input className="input mt-1" value={ids} onChange={e => setIds(e.target.value)} placeholder="Deja vacío si el original no contiene chasis" /></label>
            <button disabled={working} className="btn-ghost justify-self-start">Confirmar que revisé el original</button>
          </form>}
        </article>;
      })}
      {!data.rows?.length && <p className="card p-5">{orders ? "Sin órdenes por revisar en esta página." : "Sin coincidencias en los documentos leídos con estos filtros."}</p>}
      {(page > 0 || data.more) && <div className="mt-3 flex items-center gap-3"><button className="btn-ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</button><span>Página {page + 1}</span><button className="btn-ghost" disabled={!data.more} onClick={() => setPage(p => p + 1)}>Siguiente</button></div>}
    </>}
  </section>;
}
