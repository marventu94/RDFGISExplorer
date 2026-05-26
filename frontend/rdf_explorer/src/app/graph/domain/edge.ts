import type { Property } from './property';
import type { Node } from './node';
import type { RDFResource } from './rdf-resource';

export class Edge {
  constructor(
    public source: Property,
    public target: Node,
  ) {}

  contains(resource: RDFResource): boolean {
    return (
      this.source.parentNode === resource ||
      this.target === resource ||
      this.source === resource
    );
  }
}
