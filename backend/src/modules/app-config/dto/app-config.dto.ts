export interface SearchClassBindingDto {
  type: 'uri' | 'literal';
  value: string;
  'xml:lang'?: string;
}

export interface SearchClassDto {
  uri: SearchClassBindingDto;
  label: SearchClassBindingDto;
}

export interface DescribeConfigDto {
  exclude: string[];
  objects: string[];
  datatype: string[];
  text: string[];
  image: string[];
  external: string[];
}

export interface SettingsDefaultsDto {
  lang: string;
  resultLimit: number;
  labelUri: string;
  searchClass: SearchClassDto;
  wikibaseAdapter: boolean;
  endpointType: 'virtuoso' | 'fuseki' | 'other';
  endpointLabel: string;
  theme: 'light' | 'dark';
}

export interface AppConfigDto {
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
  describe: DescribeConfigDto;
  classColors: Record<string, string>;
  defaults: SettingsDefaultsDto;
}
