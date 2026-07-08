import type { Filter, FilterType, FilterData } from './filter';
import { Filter as FilterImpl } from './filter';
import type { RDFResource } from './rdf-resource';

export interface SparqlBinding {
  type: string;
  value: string;
  'xml:lang'?: string;
  datatype?: string;
}

export interface VariableContext {
  usedAliases: Set<string>;
  log(msg: string): void;
}

export type VariableParent = RDFResource | null;

export class Variable {
  readonly id: string;
  alias = '';
  filters: Filter[] = [];
  options = { show: true, count: false };
  results: SparqlBinding[] = [];
  query?: string;
  readonly parent: VariableParent;

  constructor(
    context: VariableContext,
    parent: VariableParent,
    ids: { varResCounter: number; varPropCounter: number; varUnboundCounter: number },
  ) {
    this.parent = parent;
    if (parent) {
      const maybeNode = parent as unknown as { isNode?: () => boolean };
      if (maybeNode.isNode && maybeNode.isNode()) {
        this.id = 'var' + ids.varResCounter++;
      } else {
        this.id = 'prop' + ids.varPropCounter++;
      }
    } else {
      this.id = String(ids.varUnboundCounter++);
    }
    context.log('New variable ' + this.id);
  }

  isBinded(): boolean {
    return this.parent != null;
  }

  toString(): string {
    return '?' + (this.alias ? this.alias : this.id);
  }

  get(): string {
    return this.toString();
  }

  setAlias(alias: string, context: VariableContext): boolean {
    alias = alias.replace(/ /g, '_');
    if (context.usedAliases.has(alias)) return false;
    if (this.alias) {
      context.usedAliases.delete(this.alias);
    }
    if (alias) {
      context.usedAliases.add(alias);
      this.alias = alias;
    } else {
      this.alias = '';
    }
    return true;
  }

  getName(): string {
    return this.alias ? this.alias : String(this.id);
  }

  addFilter(type: FilterType, data: FilterData, context: VariableContext): Filter {
    context.log('New filter (' + type + ') for variable ' + String(this) + ' (' + this.id + ')');
    const filter = new FilterImpl(this, type, data);
    this.filters.push(filter);
    return filter;
  }

  removeFilter(filter: Filter): boolean {
    const index = this.filters.indexOf(filter);
    if (index >= 0) {
      this.filters.splice(index, 1);
      return true;
    }
    return false;
  }
}
