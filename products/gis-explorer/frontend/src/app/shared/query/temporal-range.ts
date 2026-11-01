/** Calendar filters use the day written in the RDF value, preserving its timezone.
 * Instant filters (visual range / older dashboards) compare instants; unzoned RDF
 * timestamps use UTC consistently, independently of the browser's timezone. */
export function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function instantMillis(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value) || !isCalendarDay(value.slice(0, 10))) return NaN;
  const parts = value.match(/^(\d{4}-\d{2}-\d{2})(T[^Z+-]+)?(Z|[+-]\d{2}:\d{2})?$/)!;
  return Date.parse(`${parts[1]}${parts[2] ?? 'T00:00:00'}${parts[3] ?? 'Z'}`);
}

export function validTemporalRange(from: string, to: string): boolean {
  if (isCalendarDay(from) && isCalendarDay(to)) return from <= to;
  return Number.isFinite(instantMillis(from)) && Number.isFinite(instantMillis(to)) && instantMillis(from) <= instantMillis(to);
}

export function temporalRangeContains(value: string, from: string, to: string): boolean {
  if (!validTemporalRange(from, to)) return false;
  if (isCalendarDay(from) && isCalendarDay(to)) {
    const day = value.slice(0, 10);
    return isCalendarDay(day) && day >= from && day <= to;
  }
  const instant = instantMillis(value);
  return instant >= instantMillis(from) && instant <= instantMillis(to);
}
