// Canal compartido con el RDF GIS Explorer. El contrato vive en
// @rdfgis/platform-bridge: la clave de `window` y la forma del estado tienen que
// ser las mismas en el host y en los dos remotes, y ninguna herramienta
// detectaría que se desincronicen. El GIS escribe; el shell solo lee.
export type { GisSessionState } from '@rdfgis/platform-bridge';
export { GIS_SESSION_CHANNEL_KEY, readGisSessionState } from '@rdfgis/platform-bridge';
