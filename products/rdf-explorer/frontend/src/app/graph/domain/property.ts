import { RDFResource, type GraphContext } from './rdf-resource';
import { Literal } from './literal';
import type { Node } from './node';
import type { Variable } from './variable';

export class Property extends RDFResource {
  parentNode: Node;
  index: number;
  literal: Literal | null = null;
  private readonly gctx: GraphContext;

  constructor(ctx: GraphContext, parentNode: Node) {
    super(ctx);
    this.gctx = ctx;
    this.id = ctx.ids.propCounter++;
    this.parentNode = parentNode;
    this.index = parentNode.properties.length;
    parentNode.properties.push(this);
    ctx.log('New property id ' + this.id + ' for node id ' + parentNode.id);
  }

  isNode(): boolean {
    return false;
  }

  isProperty(): boolean {
    return true;
  }

  isLiteral(): boolean {
    return !!this.literal;
  }

  /** @deprecated Cytoscape (Stage 3) handles layout. */
  getWidth(): number {
    return 200;
  }

  /** @deprecated Cytoscape (Stage 3) handles layout. */
  getHeight(): number {
    return 20;
  }

  /** @deprecated Cytoscape (Stage 3) handles layout. */
  getX(): number {
    return -(this.getWidth() / 2);
  }

  /** @deprecated Cytoscape (Stage 3) handles layout. */
  getY(): number {
    return this.getOffsetY();
  }

  /** @deprecated Cytoscape (Stage 3) handles layout. */
  getOffsetY(): number {
    const childHeight = 20;
    const padding = 10;
    let h = this.parentNode.getBaseHeight() / 2 + this.index * (childHeight + padding);
    for (let i = 0; i < this.index; i++) {
      if (this.parentNode.properties[i].literal) h += (childHeight + padding);
    }
    return h;
  }

  /** @deprecated Cytoscape (Stage 3) handles layout. */
  getColor(): string {
    if (this.isLiteral()) return '#9467bd';
    if (this.isVariable()) return '#d62728';
    else return '#ff7f0e';
  }

  mkLiteral(): Literal | null {
    for (const edge of this.gctx.edges) {
      if (edge.source === this) return null;
    }
    this.gctx.log('Property id ' + this.id + ' is now literal');
    return new Literal(this.gctx, this);
  }

  getLiteral(): Variable | null {
    return this.literal?.variable ?? null;
  }

  delete(): void {
    this.gctx.log('Deleting property id ' + this.id);
    this.gctx.removeProperty(this);
  }

  loadPreview(config: Record<string, unknown>): void {
    this.gctx.loadPropertyPreview(this, config);
  }
}
