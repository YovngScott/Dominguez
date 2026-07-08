import Icon from "./Icon";

// Diálogo de confirmación con estilo (reemplaza al confirm() del navegador).
export default function ConfirmDialog({
  titulo = "¿Confirmar?",
  mensaje,
  confirmLabel = "Eliminar",
  cancelLabel = "Cancelar",
  icon = "trash",
  onConfirm,
  onCancel,
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="card w-full max-w-sm p-6 text-center animate-[pop_.12s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-4 bg-[var(--brand-red-50)] text-[var(--brand-red)]">
          <Icon name={icon} className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-bold text-[var(--ink)]">{titulo}</h3>
        {mensaje && <p className="text-sm text-[var(--ink-soft)] mt-2">{mensaje}</p>}
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="btn-ghost flex-1">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} className="btn-primary flex-1">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
