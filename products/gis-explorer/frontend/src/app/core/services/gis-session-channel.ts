// Canal compartido con el RDF Explorer. El contrato vive en
// @rdfgis/platform-bridge: la clave de `window` y la forma del estado tienen que
// ser las mismas en los dos remotes, y ninguna herramienta detectaria que se
// desincronicen. El GIS es quien escribe.
export type { GisSessionState } from '@rdfgis/platform-bridge';
export {
  GIS_SESSION_CHANNEL_KEY,
  clearGisSessionState,
  publishGisSessionState,
  readGisSessionState,
} from '@rdfgis/platform-bridge';
