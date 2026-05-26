export type EndpointType = 'virtuoso' | 'fuseki' | 'other';

export interface EndpointConfig {
  url: string;
  type: EndpointType;
  label: string;
}

export interface Prefix {
  prefix: string;
  uri: string;
}

export interface SearchClass {
  uri: { type: 'uri'; value: string };
  label: { type: 'literal'; value: string; 'xml:lang'?: string };
}

export interface DescribeConfig {
  exclude: string[];
  objects: string[];
  datatype: string[];
  text: string[];
  image: string[];
  external: string[];
}

export interface AppSettings {
  lang: string;
  labelUri: string;
  endpoint: EndpointConfig;
  searchClass: SearchClass;
  resultLimit: number;
}
