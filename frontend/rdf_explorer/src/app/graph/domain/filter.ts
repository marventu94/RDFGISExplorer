import type { Variable } from './variable';
import type { DomainEndpointAdapter } from './endpoint/adapter';

export type FilterType = 'text' | 'lang' | 'regex' | 'leq' | 'geq' | 'isuri' | 'isliteral' | 'datefrom' | 'dateto';

export type DateGranularity = 'year' | 'month' | 'day';

export interface FilterData {
  keyword?: string;
  language?: string;
  regex?: string;
  number?: number;
  date?: string;
  granularity?: DateGranularity;
}

export interface FilterFieldMeta {
  type: string;
  options?: Array<{ value: string; label: string }>;
}

export interface FilterMetadata {
  name: string;
  inputs: number;
  data: Record<string, FilterFieldMeta>;
}

const GRANULARITY_OPTIONS: Array<{ value: DateGranularity; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

export function granularityOptions(): Array<{ value: string; label: string }> {
  return GRANULARITY_OPTIONS;
}

function dateToSparqlLiteral(dateStr: string, granularity: DateGranularity): string {
  switch (granularity) {
    case 'year':
      return `"${dateStr}-01-01T00:00:00"^^xsd:dateTime`;
    case 'month':
      return `"${dateStr}-01T00:00:00"^^xsd:dateTime`;
    case 'day':
      return `"${dateStr}T00:00:00"^^xsd:dateTime`;
  }
}

function dateToSparqlEndLiteral(dateStr: string, granularity: DateGranularity): string {
  switch (granularity) {
    case 'year':
      return `"${dateStr}-12-31T23:59:59"^^xsd:dateTime`;
    case 'month': {
      const [y, m] = dateStr.split('-');
      const lastDay = new Date(+y, +m, 0).getDate();
      return `"${dateStr}-${String(lastDay).padStart(2, '0')}T23:59:59"^^xsd:dateTime`;
    }
    case 'day':
      return `"${dateStr}T23:59:59"^^xsd:dateTime`;
  }
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
      case 'datefrom': {
        const d = this.data.date ?? '';
        const g = this.data.granularity ?? 'day';
        return `FILTER (${v} >= ${dateToSparqlLiteral(d, g)})\n`;
      }
      case 'dateto': {
        const d = this.data.date ?? '';
        const g = this.data.granularity ?? 'day';
        return `FILTER (${v} <= ${dateToSparqlEndLiteral(d, g)})\n`;
      }
    }
  }
}
