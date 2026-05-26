import { NormalizedNode } from './node.model';

export interface Selection {
  node: NormalizedNode | null;
  source: 'table' | 'graph' | 'map' | 'timeline' | 'curation' | 'external';
}
