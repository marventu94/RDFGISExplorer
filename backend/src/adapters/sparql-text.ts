/**
 * Helpers para interpolar valores del usuario en texto SPARQL.
 *
 * Los usan tanto los adapters (que construyen las queries) como la capa HTTP
 * (que valida la entrada antes de delegar), asi que viven aca y no dentro de un
 * modulo puntual.
 */

/** IRI con esquema y sin caracteres que corten un `<...>` o un literal. */
const URI_PATTERN = /^[a-z][a-z0-9+.-]*:[^\s<>"]*$/i;

export function isValidUri(value: string): boolean {
  return URI_PATTERN.test(value);
}

/**
 * Escapa un valor para interpolarlo dentro de un string literal SPARQL ("...").
 * Cubre backslash, comilla doble y saltos de linea; sin esto, un keyword
 * terminado en `\` o con `"` permite cortar el literal e inyectar SPARQL.
 */
export function escapeSparqlLiteral(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}
