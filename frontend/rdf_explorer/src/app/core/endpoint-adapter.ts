import type { EndpointType } from './settings.types';

export interface EndpointAdapter {
  textSearchTriple(label: string, keyword: string, limit: number): string;
}

export class VirtuosoAdapter implements EndpointAdapter {
  textSearchTriple(label: string, keyword: string, _limit: number): string {
    return `      ?${label} bif:contains "'${keyword}'" .`;
  }
}

export class FusekiAdapter implements EndpointAdapter {
  textSearchTriple(label: string, keyword: string, limit: number): string {
    return `      ?uri text:query (rdfs:label "${keyword}" ${limit}) .`;
  }
}

export class GenericAdapter implements EndpointAdapter {
  textSearchTriple(label: string, keyword: string, _limit: number): string {
    return `      FILTER regex(?${label}, "${keyword}", "i")`;
  }
}

export function createEndpointAdapter(type: EndpointType): EndpointAdapter {
  switch (type) {
    case 'virtuoso':
      return new VirtuosoAdapter();
    case 'fuseki':
      return new FusekiAdapter();
    default:
      return new GenericAdapter();
  }
}
