import type { QueryResult, ResultBinding, BindingValue } from '@shared/models';
import type { Coordinate } from '@shared/models';

export type VariableRole = 'uri' | 'literal' | 'coordinate' | 'date' | 'numeric' | 'ignore';

export function applyMappingOverrides(
  raw: QueryResult,
  overrides: Record<string, VariableRole>,
): QueryResult {
  const newBindings: ResultBinding[] = raw.bindings.map((row) => {
    const out: ResultBinding = {};
    for (const v of raw.variables) {
      const original = row[v];
      const role = overrides[v];
      out[v] = role ? coerceTo(role, original) : original;
    }
    return out;
  });

  const { nodes, edges } = rebuildGraph(newBindings, raw.variables);

  return { ...raw, bindings: newBindings, nodes, edges };
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

function rebuildGraph(
  bindings: ResultBinding[],
  variables: string[],
): { nodes: QueryResult['nodes']; edges: QueryResult['edges'] } {
  const nodeMap = new Map<string, QueryResult['nodes'][0]>();
  const edges: QueryResult['edges'] = [];

  for (const row of bindings) {
    const uriVars = variables.filter((v) => row[v]?.type === 'uri');
    const nonUriVars = variables.filter((v) => row[v] && row[v]!.type !== 'uri' && v !== uriVars[0]);

    if (uriVars.length === 0) continue;

    const primary = uriVars[0];
    const nodeUri = (row[primary] as { value: string }).value;

    if (!nodeMap.has(nodeUri)) {
      const label =
        row[`${primary}Label`]?.type === 'literal'
          ? (row[`${primary}Label`] as { value: string }).value
          : nodeUri.split('/').pop() ?? nodeUri;

      const coord = findCoordinate(row, variables);
      const temporalEvents = findTemporalEvents(row, variables);

      const attributes: Record<string, BindingValue> = {};
      for (const v of nonUriVars) {
        if (row[v]) attributes[v] = row[v];
      }

      nodeMap.set(nodeUri, {
        uri: nodeUri,
        label,
        attributes,
        coordinate: coord ?? undefined,
        temporalEvents,
      });
    }

    for (let i = 1; i < uriVars.length; i++) {
      const targetUri = (row[uriVars[i]] as { value: string }).value;
      if (targetUri && targetUri !== nodeUri) {
        edges.push({
          id: `${nodeUri}_${uriVars[i]}_${targetUri}`,
          source: nodeUri,
          target: targetUri,
          predicate: uriVars[i],
        });
      }
    }
  }

  return { nodes: Array.from(nodeMap.values()), edges };
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
