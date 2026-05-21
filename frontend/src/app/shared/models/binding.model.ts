import { Coordinate } from './coordinate.model';

export type BindingValue =
  | { type: 'uri'; value: string }
  | { type: 'literal'; value: string; datatype?: string; lang?: string }
  | { type: 'bnode'; value: string }
  | { type: 'coordinate'; value: Coordinate; raw: string }
  | { type: 'date'; value: string; raw: string };

export interface ResultBinding {
  [variableName: string]: BindingValue;
}
