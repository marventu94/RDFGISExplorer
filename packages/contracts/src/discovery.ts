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
  /** Preview over bounded statement samples; absence is not proof of absence. */
  sampled?: boolean;
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
export type DiscoveryDirection = 'out' | 'in';
export interface DiscoveryConnectionsRequest extends DiscoveryFocus {
  /** Omit to inspect both directions (legacy and path callers). */
  direction?: DiscoveryDirection;
}
export interface DiscoveryFocus {
  classUri?: string;
  propertyUri?: string;
  uri?: string;
  /** Self-contained structural SELECT from the connected component, without value filters. */
  query?: string;
  variable?: string;
  /** Re-evaluated as a joined pattern; never carry blank-node IDs between queries. */
  steps?: DiscoveryStep[];
}
export interface DiscoveryExample {
  label?: string;
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
  failedDirections: DiscoveryDirection[];
  /** Client-side progress while the remaining direction is requested. */
  pendingDirections?: DiscoveryDirection[];
  /** Relation scans are capped before enrichment/aggregation, so coverage is incomplete. */
  relationsSampled?: boolean;
  relationLimit?: number;
  /** Remaining upstream cooldown after a partial failure. */
  retryAfterSeconds?: number;
}
export interface DiscoveryPaths {
  paths: DiscoveryStep[][];
  explored: number;
  incomplete: boolean;
}
