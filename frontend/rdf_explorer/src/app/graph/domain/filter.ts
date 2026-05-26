import type { Variable } from './variable';
import type { DomainEndpointAdapter } from './endpoint/adapter';

export type FilterType = 'text' | 'lang' | 'regex' | 'leq' | 'geq' | 'isuri' | 'isliteral';

export interface FilterData {
  keyword?: string;
  language?: string;
  regex?: string;
  number?: number;
}

export interface FilterMetadata {
  name: string;
  inputs: number;
  data: Record<string, { type: string }>;
}

export class Filter {
  constructor(
    public variable: Variable,
    public type: FilterType,
    public data: FilterData,
  ) {}

  serialize(adapter: DomainEndpointAdapter): string {
    const v = this.variable.toString();
    switch (this.type) {
      case 'lang':
        return `FILTER (lang(${v}) = "${this.data.language ?? ''}")\n`;
      case 'text':
        return adapter.textFilterTriple(v, this.data.keyword ?? '') + '\n';
      case 'regex':
        return `FILTER regex(${v}, "${this.data.regex ?? ''}", "i")\n`;
      case 'leq':
        return `FILTER (${v} < ${this.data.number ?? 0})\n`;
      case 'geq':
        return `FILTER (${v} > ${this.data.number ?? 0})\n`;
      case 'isuri':
        return `FILTER isIRI(${v})\n`;
      case 'isliteral':
        return `FILTER isLiteral(${v})\n`;
    }
  }
}
