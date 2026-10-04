/** Read-only structural discovery, scoped to the endpoint's active dataset. */
export type DiscoveryKind = 'class' | 'property' | 'resource';
export interface DiscoveryTerm {
  uri: string;
  label: string;
  kind: DiscoveryKind;
  evidence: Array<'observed' | 'declared'>;
}
export interface DiscoveryCatalog {
  items: DiscoveryTerm[];
  truncated: boolean;
  nextOffset?: number;
}
export interface DiscoveryStep {
  predicate: string;
  direction: 'out' | 'in';
  targetClass?: string;
  kind: 'resource' | 'literal';
  datatype?: string;
}
export interface DiscoveryFocus {
  classUri?: string;
  propertyUri?: string;
  uri?: string;
  /** Self-contained SELECT generated from the current connected query component. */
  query?: string;
  variable?: string;
  /** Re-evaluated as a joined pattern; never carry blank-node IDs between queries. */
  steps?: DiscoveryStep[];
}
export interface DiscoveryExample {
  kind: 'uri' | 'bnode' | 'literal';
  value: string;
  datatype?: string;
  lang?: string;
}
export interface DiscoveryConnection extends DiscoveryStep {
  label: string;
  targetLabel?: string;
  entityCount: number;
  examples: DiscoveryExample[];
}
export interface DiscoveryConnections {
  connections: DiscoveryConnection[];
  /** Distinct focus entities in the inspected sample, never result rows. */
  sampledEntities: number;
  sampleLimit: number;
  sampled: boolean;
  truncated: boolean;
  failedDirections: Array<'out' | 'in'>;
}
export interface DiscoveryPaths {
  paths: DiscoveryStep[][];
  explored: number;
  incomplete: boolean;
}
