// Contrato de GET /api/config.

export type EndpointType = 'virtuoso' | 'fuseki' | 'other';

export interface SearchClassBinding {
  type: 'uri' | 'literal';
  value: string;
  'xml:lang'?: string;
}

export interface SearchClass {
  uri: SearchClassBinding;
  label: SearchClassBinding;
}

export interface DescribeConfig {
  exclude: string[];
  objects: string[];
  datatype: string[];
  text: string[];
  image: string[];
  external: string[];
}

export interface SettingsDefaults {
  lang: string;
  resultLimit: number;
  labelUri: string;
  searchClass: SearchClass;
  endpointType: EndpointType;
}

export interface AppConfig {
  backend: string;
  endpointUrl: string;
  hasBasicAuth: boolean;
  userAgent: string;
  timeoutMs: number;
  defaultLimit: number;
  maxLimit: number;
  capabilities: string[];
  supportsWikibaseLabel: boolean;
  defaultPrefixes: Record<string, string>;
  search: {
    mode: 'wikidata-api' | 'sparql';
    endpoint?: string;
    labelProperty: string;
  };
  labelUri: string;
  describe: DescribeConfig;
  classColors: Record<string, string>;
  defaults: SettingsDefaults;
}
