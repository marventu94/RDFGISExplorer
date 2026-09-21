import { Parser, Generator } from 'sparqljs';

/**
 * Wrapping de la query del usuario para paginación determinista del lado del
 * endpoint (export completo del resultado):
 *
 *   PREFIX ...
 *   SELECT * WHERE { { <query del usuario> } } ORDER BY ?v1 ... ?vN
 *   OFFSET <o> LIMIT <l>
 *
 * - Los PREFIX/BASE quedan al nivel externo (dentro de la subquery llaveada son
 *   inválidos en varios endpoints); el cuerpo se regenera con sparqljs, así que
 *   LIMIT/GROUP BY/ORDER BY internos se conservan.
 * - El ORDER BY externo usa TODAS las variables proyectadas: orden total, dos
 *   filas solo empatan si son idénticas — condición para paginar con
 *   OFFSET/LIMIT sin duplicar ni perder filas.
 * - Si la query del usuario ya trae ORDER BY propio se respeta (no se agrega
 *   otro): la determinismo queda a cargo del orden del usuario.
 *
 * Es el mismo criterio que el wrapping del summary en el backend
 * (`query.service.ts extractInnerQuery`), duplicado acá porque el export
 * pagina desde el cliente y no hay paquete compartido de runtime.
 */

export interface WrappedUserQuery {
  /** Bloque PREFIX/BASE al nivel externo (puede ser vacío). */
  prologue: string;
  /** Cuerpo de la query regenerado sin prólogo, para la subquery. */
  inner: string;
  /** Variables proyectadas (para el ORDER BY total). */
  variables: string[];
  /** La query del usuario ya define su propio ORDER BY. */
  hasOrderBy: boolean;
}

interface SparqlAst {
  type?: string;
  queryType?: string;
  base?: string;
  prefixes?: Record<string, string>;
  variables?: unknown[];
  order?: unknown[];
  where?: unknown[];
}

/** Parsea, valida SELECT y desarma la query del usuario en prólogo + cuerpo. */
export function wrapUserQuery(userQuery: string): WrappedUserQuery {
  const ast = new Parser().parse(userQuery) as unknown as SparqlAst;
  if (ast.type !== 'query' || ast.queryType !== 'SELECT') {
    throw new Error('Solo se pueden exportar queries SELECT');
  }

  const lines: string[] = [];
  if (ast.base) lines.push(`BASE <${ast.base}>`);
  for (const [name, iri] of Object.entries(ast.prefixes ?? {})) {
    lines.push(`PREFIX ${name}: <${iri}>`);
  }

  const inner = new Generator().stringify({
    ...ast,
    base: undefined,
    prefixes: {},
  } as never);

  return {
    prologue: lines.join('\n'),
    inner,
    variables: projectedVariables(ast),
    hasOrderBy: Array.isArray(ast.order) && ast.order.length > 0,
  };
}

/** Query envuelta para una página (OFFSET/LIMIT embebidos en el texto). */
export function buildPagedQuery(
  wrapped: WrappedUserQuery,
  offset: number,
  limit: number,
): string {
  const orderBy =
    wrapped.hasOrderBy || wrapped.variables.length === 0
      ? ''
      : `\nORDER BY ${wrapped.variables.map((v) => `?${v}`).join(' ')}`;
  const prologue = wrapped.prologue ? `${wrapped.prologue}\n` : '';
  return (
    `${prologue}SELECT * WHERE { {\n${wrapped.inner}\n} }${orderBy}\n` +
    `OFFSET ${offset}\nLIMIT ${limit}`
  );
}

function isVariableTerm(v: unknown): v is { termType: 'Variable'; value: string } {
  return (
    !!v &&
    typeof v === 'object' &&
    (v as { termType?: string }).termType === 'Variable' &&
    typeof (v as { value?: unknown }).value === 'string'
  );
}

/**
 * Variables proyectadas por la query: las explícitas del SELECT (incluidos
 * alias de expresiones, p.ej. `(COUNT(?x) AS ?c)`), o —con `SELECT *`— las
 * variables del patrón top-level, sin descender a subqueries (sus variables
 * internas no son visibles afuera y romperían el ORDER BY).
 */
export function projectedVariables(ast: SparqlAst): string[] {
  const vars = ast.variables;
  const isWildcard =
    !Array.isArray(vars) ||
    vars.some(
      (v) =>
        !isVariableTerm(v) &&
        !(v as { variable?: unknown })?.variable,
    );

  if (!isWildcard) {
    const out: string[] = [];
    for (const v of vars) {
      if (isVariableTerm(v)) {
        out.push(v.value);
      } else {
        const aliased = (v as { variable?: unknown }).variable;
        if (isVariableTerm(aliased)) out.push(aliased.value);
      }
    }
    return out;
  }

  const out: string[] = [];
  collectTopLevelVars(ast.where, out, new Set());
  return out;
}

function collectTopLevelVars(node: unknown, out: string[], seen: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectTopLevelVars(item, out, seen);
    return;
  }
  const obj = node as Record<string, unknown>;
  // Subquery: sus variables internas no se proyectan al nivel externo.
  if (obj['type'] === 'query') return;
  if (obj['termType'] === 'Variable' && typeof obj['value'] === 'string') {
    const name = obj['value'];
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
    return;
  }
  for (const key of Object.keys(obj)) {
    if (key === 'prefixes' || key === 'base') continue;
    collectTopLevelVars(obj[key], out, seen);
  }
}
