import type { QueryResult } from '@shared/models';
import type { NormalizedNode } from '@shared/models';

/**
 * Conteos de cobertura de un QueryResult para los indicadores de las vistas:
 * el mapa solo muestra nodos con `coordinate`, la timeline solo nodos con
 * `temporalEvents`.
 *
 * Los conteos "primary" consideran solo las **entidades principales**: nodos
 * que llevan datos propios (atributos, coordenada o eventos temporales). Los
 * nodos estructurales del modelo (features, direcciones postales, geometrías)
 * nunca tienen coordenada ni fecha, así que contarlos como "sin coordenada"
 * es ruido: la alerta solo tiene sentido sobre entidades principales.
 */
export interface CoverageStats {
  total: number;
  withCoordinate: number;
  withoutCoordinate: number;
  withTemporalEvents: number;
  withoutTemporalEvents: number;
  primary: number;
  primaryWithCoordinate: number;
  primaryWithoutCoordinate: number;
  primaryWithTemporalEvents: number;
  primaryWithoutTemporalEvents: number;
}

function isPrimary(node: NormalizedNode): boolean {
  return (
    !!node.coordinate ||
    (node.temporalEvents?.length ?? 0) > 0 ||
    Object.keys(node.attributes ?? {}).length > 0
  );
}

export function computeCoverageStats(result: QueryResult | null | undefined): CoverageStats {
  const nodes = result?.nodes ?? [];

  let withCoordinate = 0;
  let withTemporalEvents = 0;
  let primary = 0;
  let primaryWithCoordinate = 0;
  let primaryWithTemporalEvents = 0;
  for (const node of nodes) {
    const hasCoordinate = !!node.coordinate;
    const hasTemporal = (node.temporalEvents?.length ?? 0) > 0;
    if (hasCoordinate) withCoordinate++;
    if (hasTemporal) withTemporalEvents++;
    if (isPrimary(node)) {
      primary++;
      if (hasCoordinate) primaryWithCoordinate++;
      if (hasTemporal) primaryWithTemporalEvents++;
    }
  }

  return {
    total: nodes.length,
    withCoordinate,
    withoutCoordinate: nodes.length - withCoordinate,
    withTemporalEvents,
    withoutTemporalEvents: nodes.length - withTemporalEvents,
    primary,
    primaryWithCoordinate,
    primaryWithoutCoordinate: primary - primaryWithCoordinate,
    primaryWithTemporalEvents,
    primaryWithoutTemporalEvents: primary - primaryWithTemporalEvents,
  };
}
