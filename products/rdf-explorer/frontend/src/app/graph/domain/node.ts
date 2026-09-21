import { RDFResource, type GraphContext } from './rdf-resource';
import { Property } from './property';

export class Node extends RDFResource {
  properties: Property[] = [];
  private readonly gctx: GraphContext;

  constructor(ctx: GraphContext, _nodeId?: number) {
    super(ctx);
    this.gctx = ctx;
    this.id = _nodeId ?? ctx.ids.nodeCounter++;
    ctx.log('New node id ' + this.id);
    ctx.addNodeToList(this);
  }

  isNode(): boolean {
    return true;
  }

  isProperty(): boolean {
    return false;
  }

  isLiteral(): boolean {
    return false;
  }

  /** @deprecated Cytoscape (Stage 3) handles layout. */
  getWidth(): number {
    return 220;
  }

  /** @deprecated Cytoscape (Stage 3) handles layout. */
  getBaseHeight(): number {
    return 30;
  }

  /** @deprecated Cytoscape (Stage 3) handles layout. */
  getHeight(): number {
    const childHeight = 20;
    const padding = 10;
    let h = 30 + this.properties.length * (childHeight + padding);
    this.properties.filter(p => p.literal).forEach(() => { h += (childHeight + padding); });
    return h;
  }

  /** @deprecated Cytoscape (Stage 3) handles layout. */
  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  override addUri(uri: string): boolean {
    if (this.uris.indexOf(uri) < 0) {
      this.gctx.registerUriNode(uri, this);
    }
    return super.addUri(uri);
  }

  /** @deprecated Cytoscape (Stage 3) handles layout. */
  getColor(): string {
    if (this.isVariable()) return '#2ca02c';
    else return '#1f77b4';
  }

  newProp(): Property {
    return new Property(this.gctx, this);
  }

  getPropByUri(uri: string): Property | null {
    for (const p of this.properties) {
      if (p.getUri() === uri) return p;
    }
    return null;
  }

  literalRelations(): Property[] {
    return this.properties.filter(p => p.isLiteral());
  }

  delete(): void {
    this.gctx.log('Deleting node id ' + this.id);
    this.gctx.removeNodeFromGraph(this);
  }

  loadPreview(config: Record<string, unknown>): void {
    this.gctx.loadNodePreview(this, config);
  }
}
