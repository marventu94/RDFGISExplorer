import type { QueryResult, ResultBinding, BindingValue } from '@shared/models';
import type { Coordinate } from '@shared/models';

export type VariableRole = 'uri' | 'literal' | 'coordinate' | 'date' | 'numeric' | 'ignore';

export function applyMappingOverrides(
  raw: QueryResult,
  overrides: Record<string, VariableRole>,
): QueryResult {
  if (Object.keys(overrides).length === 0) return raw;

  const variables = raw.variables.filter((variable) => overrides[variable] !== 'ignore');
  const newBindings: ResultBinding[] = raw.bindings.map((row) => {
    const out: ResultBinding = {};
    for (const v of variables) {
      const original = row[v];
      const role = overrides[v];
      out[v] = role ? coerceTo(role, original) : original;
    }
    return out;
  });

  const nodes = rebuildVisualFields(raw, newBindings, variables, overrides);

  return { ...raw, variables, bindings: newBindings, nodes };
}

export function coerceTo(role: VariableRole, value: BindingValue): BindingValue {
  if (!value) return value;

  switch (role) {
    case 'uri':
      return { type: 'uri', value: extractStringValue(value) };
    case 'literal':
      return { type: 'literal', value: extractStringValue(value) };
    case 'date': {
      const dateStr = parseDateValue(value);
      if (dateStr) {
        return { type: 'date', value: dateStr, raw: extractStringValue(value) };
      }
      return value;
    }
    case 'coordinate': {
      const coord = parseCoordinateValue(value);
      if (coord) {
        return { type: 'coordinate', value: coord, raw: extractStringValue(value) };
      }
      return value;
    }
    case 'numeric':
      return { type: 'literal' as const, value: extractStringValue(value), datatype: 'http://www.w3.org/2001/XMLSchema#decimal' };
    case 'ignore':
      return value;
    default:
      return value;
  }
}

function extractStringValue(v: BindingValue): string {
  if ('value' in v && typeof v.value === 'string') return v.value;
  if ('value' in v && typeof v.value === 'object' && v.value !== null) {
    return JSON.stringify(v.value);
  }
  return String((v as { value: unknown }).value ?? '');
}

function parseDateValue(value: BindingValue): string | null {
  const raw = extractStringValue(value);
  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parseCoordinateValue(value: BindingValue): Coordinate | null {
  const raw = extractStringValue(value);

  const wktMatch = raw.match(/Point\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i);
  if (wktMatch) {
    return { lat: parseFloat(wktMatch[2]), lng: parseFloat(wktMatch[1]) };
  }

  const latLngMatch = raw.match(/(-?[\d.]+)\s*[,;]\s*(-?[\d.]+)/);
  if (latLngMatch) {
    return { lat: parseFloat(latLngMatch[1]), lng: parseFloat(latLngMatch[2]) };
  }

  return null;
}

function rebuildVisualFields(
  raw: QueryResult,
  bindings: ResultBinding[],
  variables: string[],
  overrides: Record<string, VariableRole>,
): QueryResult['nodes'] {
  const ignored = new Set(
    Object.entries(overrides)
      .filter(([, role]) => role === 'ignore')
      .map(([variable]) => variable),
  );
  const remapsVisualFields = Object.entries(overrides).some(([variable, role]) => {
    const originalTypes = raw.bindings.map((row) => row[variable]?.type).filter(Boolean);
    const introducesVisualRole = role === 'coordinate' || role === 'date';
    const removesCoordinate = originalTypes.includes('coordinate') && role !== 'coordinate';
    const removesDate = originalTypes.includes('date') && role !== 'date';
    return introducesVisualRole || removesCoordinate || removesDate;
  });

  const nodeMap = new Map(
    raw.nodes.map((node) => [
      node.uri,
      {
        ...node,
        attributes: omitAttributes(node.attributes, ignored),
        ...(node.directAttributes
          ? { directAttributes: omitAttributes(node.directAttributes, ignored) }
          : {}),
        ...(remapsVisualFields ? { coordinate: undefined, temporalEvents: [] } : {}),
      },
    ]),
  );

  if (!remapsVisualFields) return Array.from(nodeMap.values());

  for (const row of bindings) {
    const uriVars = variables.filter((v) => row[v]?.type === 'uri');
    if (uriVars.length === 0) continue;
    const nodeUri = (row[uriVars[0]] as { value: string }).value;
    const node = nodeMap.get(nodeUri);
    if (!node) continue;
    const coordinate = findCoordinate(row, variables);
    const temporalEvents = findTemporalEvents(row, variables);
    nodeMap.set(nodeUri, {
      ...node,
      coordinate: coordinate ?? node.coordinate,
      temporalEvents: [...(node.temporalEvents ?? []), ...temporalEvents],
    });
  }

  return Array.from(nodeMap.values());
}

function omitAttributes(
  attributes: Record<string, BindingValue>,
  ignored: ReadonlySet<string>,
): Record<string, BindingValue> {
  return Object.fromEntries(Object.entries(attributes).filter(([name]) => !ignored.has(name)));
}

function findCoordinate(
  row: ResultBinding,
  variables: string[],
): Coordinate | null {
  for (const v of variables) {
    if (row[v]?.type === 'coordinate') {
      return (row[v] as { value: Coordinate }).value;
    }
  }
  return null;
}

function findTemporalEvents(
  row: ResultBinding,
  variables: string[],
): { field: string; isoDate: string; numericValue?: number }[] {
  const events: { field: string; isoDate: string; numericValue?: number }[] = [];
  for (const v of variables) {
    const val = row[v];
    if (val?.type === 'date') {
      const numField = variables.find(
        (nv) => nv !== v && row[nv]?.type === 'literal' && !isNaN(Number((row[nv] as { value: string }).value)),
      );
      events.push({
        field: v,
        isoDate: (val as { value: string }).value,
        numericValue: numField ? Number((row[numField] as { value: string }).value) : undefined,
      });
    }
  }
  return events;
}
