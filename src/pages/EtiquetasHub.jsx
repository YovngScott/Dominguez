import { Link } from "react-router-dom";
import Icon from "../components/Icon";

// Punto de entrada de "Etiquetas": elegir qué tipo de etiqueta crear.
export default function EtiquetasHub() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">Etiquetas</h1>
        <Link to="/piezas/etiquetas/historial" className="btn-ghost text-sm py-2 px-3 gap-1.5">
          <Icon name="clock" className="w-4 h-4" /> Generadas
        </Link>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Etiqueta de piezas */}
        <Link
          to="/piezas/etiquetas"
          className="card p-6 flex flex-col gap-3 hover:-translate-y-0.5 hover:shadow-lg hover:border-[var(--brand-red)] transition-all"
        >
          <span className="w-12 h-12 rounded-2xl bg-[var(--brand-red-50)] text-[var(--brand-red)] flex items-center justify-center">
            <Icon name="tag" className="w-6 h-6" />
          </span>
          <h2 className="font-bold text-[var(--ink)] text-lg">Etiqueta de piezas</h2>
          <p className="text-sm text-[var(--ink-soft)]">
            Para marcar las cajas de piezas. Lleva el vehículo, el checklist de piezas y un
            código QR para ubicarlas.
          </p>
          <span className="text-[var(--brand-red)] font-semibold text-sm mt-auto">Crear →</span>
        </Link>

        {/* Etiqueta de vehículo */}
        <Link
          to="/etiquetas/vehiculo"
          className="card p-6 flex flex-col gap-3 hover:-translate-y-0.5 hover:shadow-lg hover:border-[var(--brand-red)] transition-all"
        >
          <span className="w-12 h-12 rounded-2xl bg-[var(--brand-red-50)] text-[var(--brand-red)] flex items-center justify-center">
            <Icon name="car" className="w-6 h-6" />
          </span>
          <h2 className="font-bold text-[var(--ink)] text-lg">Etiqueta de vehículo</h2>
          <p className="text-sm text-[var(--ink-soft)]">
            Para pegar en el carro. Lleva la marca y modelo y los trabajos a realizar en grande
            (ej. “Cambio y Pintura de flear derecho”).
          </p>
          <span className="text-[var(--brand-red)] font-semibold text-sm mt-auto">Crear →</span>
        </Link>
      </div>
    </div>
  );
}
