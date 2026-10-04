import { NormalizedNode } from './node.model';
import type { ResultBinding, TemporalEvent } from '@rdfgis/contracts';

export interface Selection {
  node: NormalizedNode | null;
  /** Stable object identity; node remains the exact resource clicked. */
  primaryUri?: string;
  /** Exact source row, when the interaction originated in the table. */
  row?: ResultBinding;
  event?: TemporalEvent;
  source: 'table' | 'graph' | 'map' | 'timeline' | 'external';
  /** Resources representing the same object, including unprojected structure.
   * Shared resources do not expand to an arbitrary owner without row context.
   */
  relatedUris?: ReadonlySet<string>;
}
