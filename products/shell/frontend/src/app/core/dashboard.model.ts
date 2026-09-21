// Contrato compartido: la fuente de verdad vive en packages/contracts.
export type { Dashboard, DashboardKind } from '@rdfgis/contracts';

export function relativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSecs < 60) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays < 7) return `Hace ${diffDays} días`;
  if (diffWeeks < 4) return `Hace ${diffWeeks} sem`;
  if (diffMonths < 12) return `Hace ${diffMonths} meses`;
  return `Hace ${Math.floor(diffDays / 365)} años`;
}
