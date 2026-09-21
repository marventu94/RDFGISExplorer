import type { Node } from '../node';
import type { Property } from '../property';
import type { Literal } from '../literal';
import type { Query } from '../query';
import type { GraphContext } from '../rdf-resource';

export interface DomainEndpointAdapter {
  textFilterTriple(variable: string, keyword: string): string;

  labelService?(language: string): string | null;

  loadNodePreview?(
    ctx: GraphContext,
    node: Node,
    query: Query,
    config: Record<string, unknown>,
  ): void;

  loadPropertyPreview?(
    ctx: GraphContext,
    prop: Property,
    query: Query,
    config: Record<string, unknown>,
  ): void;

  loadLiteralPreview?(
    ctx: GraphContext,
    lit: Literal,
    query: Query,
    config: Record<string, unknown>,
  ): void;
}
