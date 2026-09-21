import { RDFResource, type GraphContext } from './rdf-resource';
import type { Property } from './property';

export class Literal extends RDFResource {
  private readonly gctx: GraphContext;

  constructor(
    ctx: GraphContext,
    public parent: Property,
  ) {
    super(ctx);
    this.gctx = ctx;
    parent.literal = this;
  }

  isLiteral(): boolean {
    return true;
  }

  isNode(): boolean {
    return false;
  }

  isProperty(): boolean {
    return false;
  }

  /** @deprecated Cytoscape (Stage 3) handles layout. */
  getColor(): string {
    if (this.isVariable()) return '#2ca02c';
    else return '#1f77b4';
  }

  /** @deprecated Cytoscape (Stage 3) handles layout. */
  getOffsetY(): number {
    return this.parent.getOffsetY() + this.getHeight() + 10;
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
  getPath(): string {
    const x = 10 - this.parent.getWidth() / 2;
    const y = this.parent.getOffsetY() + this.parent.getHeight();
    const x2 = x + 17;
    const y2 = y + 20;
    return 'M' + x + ',' + y + 'V' + y2 + 'H' + x2;
  }

  delete(): void {
    this.gctx.log('Deleting literal');
    this.parent.delete();
  }

  loadPreview(config: Record<string, unknown>): void {
    this.gctx.loadLiteralPreview(this, config);
  }
}
