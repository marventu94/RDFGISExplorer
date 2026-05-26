import type { DomainEndpointAdapter } from './adapter';

export class GenericAdapter implements DomainEndpointAdapter {
  textFilterTriple(variable: string, keyword: string): string {
    return `FILTER regex(${variable}, "${keyword}", "i")`;
  }
}
