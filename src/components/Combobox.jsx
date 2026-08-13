import { useEffect, useMemo, useRef, useState } from "react";

// Compara sin tildes ni mayúsculas: "guardalodo" encuentra "GUARDALODO".
const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Qué tan bien calza el texto escrito con la sugerencia (menor = mejor):
//   0 → es exactamente lo escrito
//   1 → empieza con lo escrito        ("GUARDALODO" al buscar "guar")
//   2 → alguna palabra empieza así    ("FLEAR GUARDALODO")
//   3 → solo lo contiene en el medio  ("BASE PANTALLA LH" al buscar "antall")
function relevancia(label, q) {
  const l = norm(label);
  if (l === q) return 0;
  if (l.startsWith(q)) return 1;
  if (l.split(/[\s\-/(),.]+/).some((palabra) => palabra.startsWith(q))) return 2;
  return 3;
}

/**
 * Campo de autocompletado: muestra sugerencias mientras se escribe.
 *
 * Props:
 *  - items: [{ id, label }]
 *  - value: id seleccionado (o texto libre cuando allowCreate = true)
 *  - onChange: (id, label) => void
 *  - allowCreate: permite escribir un valor libre (ej. el año)
 */
export default function Combobox({
  items = [],
  value = "",
  onChange,
  placeholder = "",
  disabled = false,
  allowCreate = false,
  emptyText = "Sin coincidencias",
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef(null);

  // Sincroniza el texto mostrado con el valor seleccionado (cuando no se está editando)
  useEffect(() => {
    if (open) return;
    const found = items.find((i) => String(i.id) === String(value));
    setQuery(found ? found.label : allowCreate ? value || "" : "");
  }, [value, items, open, allowCreate]);

  // Cierra el desplegable al hacer clic fuera
  useEffect(() => {
    function onDoc(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Las sugerencias salen ordenadas por relevancia: primero las que empiezan
  // con lo escrito y de último las que solo lo contienen en el medio. Sin esto,
  // al buscar "guar" aparecían antes piezas donde "guar" está al final.
  const q = norm(query.trim());
  const filtered = useMemo(() => {
    if (!q) return items;
    return items
      .map((i) => ({ item: i, r: relevancia(i.label, q), pos: norm(i.label).indexOf(q) }))
      .filter((x) => x.pos !== -1)
      .sort(
        (a, b) =>
          a.r - b.r || // mejor coincidencia primero
          a.pos - b.pos || // luego, lo escrito más al principio
          a.item.label.localeCompare(b.item.label, "es") // y al final, alfabético
      )
      .map((x) => x.item);
  }, [items, q]);

  function selectItem(item) {
    onChange?.(item.id, item.label);
    setQuery(item.label);
    setOpen(false);
  }

  function handleInput(e) {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
    setHighlight(0);
    if (allowCreate) onChange?.(val, val);
    else if (val === "") onChange?.("", "");
  }

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlight]) selectItem(filtered[highlight]);
      else if (allowCreate && query.trim()) {
        onChange?.(query.trim(), query.trim());
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={boxRef}>
      <input
        className="input"
        style={{ paddingRight: "2.25rem" }}
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        onChange={handleInput}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      <span
        className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-soft)] text-xs transition-transform ${
          open ? "rotate-180" : ""
        }`}
      >
        ▾
      </span>
      {open && !disabled && (
        <ul className="absolute z-30 mt-1 w-full bg-white rounded-xl shadow-lg border border-[var(--line)] max-h-60 overflow-y-auto">
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-400">{emptyText}</li>
          )}
          {filtered.map((item, idx) => (
            <li key={item.id}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => selectItem(item)}
                className={`w-full text-left px-3 py-2.5 text-sm ${
                  idx === highlight
                    ? "bg-[var(--brand-red-50)] text-[var(--brand-red)]"
                    : "hover:bg-slate-50"
                }`}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
