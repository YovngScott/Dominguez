import { useEffect, useRef, useState } from "react";

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

  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;

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
