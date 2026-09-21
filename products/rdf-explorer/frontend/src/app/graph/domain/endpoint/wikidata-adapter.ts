import type { DomainEndpointAdapter } from './adapter';
import type { Node } from '../node';
import type { Property } from '../property';
import type { Literal } from '../literal';
import type { Query } from '../query';
import type { GraphContext } from '../rdf-resource';
import { RDFResource } from '../rdf-resource';

const WIKIBASE_DIRECT_CLAIM = 'http://wikiba.se/ontology#directClaim';

class TempResource extends RDFResource {
  constructor() {
    super(null);
  }
}

export class WikidataAdapter implements DomainEndpointAdapter {
  textFilterTriple(variable: string, keyword: string): string {
    return variable + ' bif:contains "\'' + keyword + '\'" .';
  }

  labelService(language: string): string {
    return `SERVICE wikibase:label { bd:serviceParam wikibase:language "${language}". }`;
  }

  loadNodePreview(
    ctx: GraphContext,
    node: Node,
    query: Query,
    config: Record<string, unknown>,
  ): void {
    const cfg = config;
    if (cfg['varFilter']) {
      const label = query.addLabel(node);
      if (label) {
        label.variable.addFilter('regex', { regex: cfg['varFilter'] as string }, ctx);
      }
    } else {
      query.addOptLabel(node);
    }
    query.triples.forEach(t => {
      if (t[0].isVariable() && t[1].isVariable()) {
        const dc = new TempResource();
        const p = new TempResource();
        dc.mkConst();
        dc.addUri(WIKIBASE_DIRECT_CLAIM);
        p.variable.alias = t[1].variable.getName() + 'tmp';
        query.triples.push([p, dc, t[1]]);
      }
    });
    if (node.hide) {
      node.hide = false;
      query.retrieve(cfg);
      node.hide = true;
    } else {
      query.retrieve(cfg);
    }
  }

  loadPropertyPreview(
    ctx: GraphContext,
    prop: Property,
    query: Query,
    config: Record<string, unknown>,
  ): void {
    const cfg = config;
    const dc = new TempResource();
    const p = new TempResource();
    dc.mkConst();
    dc.addUri(WIKIBASE_DIRECT_CLAIM);
    p.variable.alias = prop.variable.getName();
    const t1 = [p, dc, prop] as [RDFResource, RDFResource, RDFResource];
    const t2 = query.createTripleLabel(p);

    if (cfg['varFilter']) {
      t2[2].variable.addFilter('regex', { regex: cfg['varFilter'] as string }, ctx);
      query.triples.push(t1);
      query.triples.push(t2);
    } else {
      query.triples.push(t1);
      query.optionals.push([t2]);
    }

    query.select.push(t2[2]);
    p.variable.alias = prop.variable.getName() + 'tmp';
    query.retrieve(cfg);
  }

  loadLiteralPreview(
    ctx: GraphContext,
    lit: Literal,
    query: Query,
    config: Record<string, unknown>,
  ): void {
    const cfg = config as Record<string, unknown>;
    let tmpF = null;
    if (cfg['varFilter']) {
      tmpF = lit.variable.addFilter('regex', { regex: cfg['varFilter'] as string }, ctx);
    }
    query.retrieve(cfg);
    if (tmpF) {
      lit.variable.removeFilter(tmpF);
    }
  }
}
