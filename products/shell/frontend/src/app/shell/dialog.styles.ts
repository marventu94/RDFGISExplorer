/**
 * Estilo común de los diálogos del shell. Replica el de los diálogos de GIS
 * ("Guardar tablero") y del RDF Explorer ("Guardar workspace"): los tres son
 * bundles distintos, así que se comparte el diseño y no el componente.
 */
export const DIALOG_STYLES = `
  .dialog-container {
    box-sizing: border-box;
    min-width: 320px;
    max-width: 520px;
    padding: 1.5rem;
    border: 1px solid var(--color-border, #dee2e6);
    border-radius: 8px;
    background: var(--color-bg-elevated, #fff);
    color: var(--color-text, #212529);
    box-shadow: var(--shadow-lg, 0 4px 12px rgb(0 0 0 / 18%));
  }
  h3 {
    margin: 0 0 1rem;
    font-size: 1.125rem;
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  p {
    margin: 0 0 1rem;
    line-height: 1.45;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 1rem;
  }
  .field > span {
    color: var(--color-text-muted, #6c757d);
    font-size: 0.875rem;
  }
  .field input {
    box-sizing: border-box;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border-strong, #ced4da);
    border-radius: 4px;
    background: var(--color-bg, #fff);
    color: var(--color-text, #212529);
    font: inherit;
    font-size: 0.9375rem;
  }
  .field input:focus-visible {
    border-color: var(--color-accent, #0d6efd);
    outline: 2px solid var(--color-accent, #0d6efd);
    outline-offset: 1px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .actions button {
    padding: 0.5rem 1rem;
    border: 1px solid var(--color-border, #dee2e6);
    border-radius: 4px;
    background: var(--color-bg, #fff);
    color: var(--color-text, #212529);
    cursor: pointer;
    font: inherit;
    font-size: 0.875rem;
  }
  .actions button:hover:not(:disabled) {
    background: var(--color-bg-hover, #f1f3f5);
  }
  .actions button:focus-visible {
    outline: 2px solid var(--color-accent, #0d6efd);
    outline-offset: 2px;
  }
  .actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .actions .btn-primary {
    border-color: var(--color-accent, #0d6efd);
    background: var(--color-accent, #0d6efd);
    color: var(--color-text-on-accent, #fff);
  }
  .actions .btn-primary:hover:not(:disabled) {
    border-color: var(--color-accent-hover, #0b5ed7);
    background: var(--color-accent-hover, #0b5ed7);
  }
  .actions .btn-danger {
    border-color: var(--color-danger, #dc3545);
    background: var(--color-danger, #dc3545);
    color: var(--color-text-on-accent, #fff);
  }
  .actions .btn-danger:hover:not(:disabled) {
    border-color: var(--color-danger, #dc3545);
    background: var(--color-danger, #dc3545);
    filter: brightness(0.92);
  }
`;
