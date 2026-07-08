// Contrato compartido: la fuente de verdad vive en packages/contracts.
// Se mantienen los alias *Dto para no tocar a los importadores del backend.
export type {
  SearchClassBinding as SearchClassBindingDto,
  SearchClass as SearchClassDto,
  DescribeConfig as DescribeConfigDto,
  SettingsDefaults as SettingsDefaultsDto,
  AppConfig as AppConfigDto,
} from '@rdfgis/contracts';
