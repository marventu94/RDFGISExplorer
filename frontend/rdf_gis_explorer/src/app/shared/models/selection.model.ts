import { NormalizedNode } from './node.model';

export interface Selection {
  node: NormalizedNode | null;
  source: 'table' | 'graph' | 'map' | 'timeline' | 'external';
  /**
   * Entidades que comparten fila con el nodo seleccionado (la propia incluida),
   * calculadas por `SelectionService` con el índice de filas del resultado.
   *
   * Cada vista dibuja una entidad distinta de la misma fila (el mapa la que
   * tiene coordenada, la timeline la que tiene fecha, la tabla la fila entera),
   * así que sin esto una selección solo se veía en las vistas que dibujaban
   * exactamente ese nodo.
   */
  relatedUris?: ReadonlySet<string>;
}
