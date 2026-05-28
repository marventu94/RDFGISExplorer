import { Coordinate } from './coordinate.model';
import { BindingValue } from './binding.model';
import { TemporalEvent } from './temporal-event.model';

export interface NormalizedNode {
  uri: string;
  label: string;
  type?: string;
  attributes: Record<string, BindingValue>;
  coordinate?: Coordinate;
  temporalEvents?: TemporalEvent[];
}
