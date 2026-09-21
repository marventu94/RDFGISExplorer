// Contrato compartido: la fuente de verdad vive en packages/contracts.
export type { Dashboard, DashboardKind } from '@rdfgis/contracts';
import { getLanguage } from '@rdfgis/platform-bridge';

export function relativeDate(dateStr: string): string {
  const language = getLanguage();
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  const formatter = new Intl.RelativeTimeFormat(language === 'es' ? 'es-AR' : 'en-US', {
    numeric: 'auto',
    style: 'short',
  });
  if (diffSecs < 60) return formatter.format(0, 'second');
  if (diffMins < 60) return formatter.format(-diffMins, 'minute');
  if (diffHours < 24) return formatter.format(-diffHours, 'hour');
  if (diffDays < 7) return formatter.format(-diffDays, 'day');
  if (diffWeeks < 4) return formatter.format(-diffWeeks, 'week');
  if (diffMonths < 12) return formatter.format(-diffMonths, 'month');
  return formatter.format(-Math.floor(diffDays / 365), 'year');
}
