import type { SearchClass } from './services/app-config.service';

export type { SearchClass, Prefix, DescribeConfig, SettingsDefaults } from './services/app-config.service';

export type EndpointType = 'virtuoso' | 'fuseki' | 'other';

export interface AppSettings {
  lang: string;
  labelUri: string;
  searchClass: SearchClass;
  resultLimit: number;
  wikibaseAdapter: boolean;
  endpointType: EndpointType;
  endpointLabel: string;
  classColorOverrides: Record<string, string>;
  theme: 'light' | 'dark';
}
