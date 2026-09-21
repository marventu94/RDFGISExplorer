// Lectura del canal compartido que publica el GIS con lo que tiene abierto.
// El contrato vive en @rdfgis/platform-bridge, compartido con el remote GIS
// (que es quien escribe). Aca solo se lee.
export type { GisSessionState } from '@rdfgis/platform-bridge';
export { readGisSessionState } from '@rdfgis/platform-bridge';
