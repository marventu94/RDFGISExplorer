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

/**
 * Límites de queries y visualización, unificados en variables de entorno del
 * backend y expuestos a los frontends. Los defaults están en el backend
 * (AppConfigService); los frontends deben tener defaults equivalentes hasta
 * que la config llega (carga async).
 */
export interface LimitsConfig {
  /** Cap de nodos de la vista de grafo del GIS (GIS_GRAPH_MAX_NODES). */
  graphMaxNodes: number;
  /** Tamaño de lote por defecto de las vistas coordinadas (GIS_LOT_DEFAULT_SIZE). */
  lotDefaultSize: number;
  /** Opciones del selector de tamaño de lote (GIS_LOT_SIZE_OPTIONS, CSV en la env). */
  lotSizeOptions: number[];
  /** Opciones de paginación de la tabla (GIS_TABLE_PAGE_SIZE_OPTIONS, CSV en la env). */
  tablePageSizeOptions: number[];
  /** Tope de filas del export completo a CSV (EXPORT_MAX_ROWS). */
  exportMaxRows: number;
  /** Piso del reintento adaptativo de página del export (EXPORT_MIN_PAGE_SIZE). */
  exportMinPageSize: number;
  /** Tope de valores en el top categórico del summary (SUMMARY_TOP_CATEGORICAL_LIMIT). */
  summaryTopCategorical: number;
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
  limits: LimitsConfig;
}
