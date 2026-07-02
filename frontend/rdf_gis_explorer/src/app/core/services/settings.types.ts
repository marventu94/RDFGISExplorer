export type EndpointType = 'virtuoso' | 'fuseki' | 'other';

export interface SearchClass {
  uri: { type: 'uri'; value: string };
  label: { type: 'literal'; value: string; 'xml:lang'?: string };
}

export interface AppSettings {
  lang: string;
  labelUri: string;
  searchClass: SearchClass;
  resultLimit: number;
  wikibaseAdapter: boolean;
  endpointType: EndpointType;
  endpointLabel: string;
  classColorOverrides: Record<string, string>;
}
