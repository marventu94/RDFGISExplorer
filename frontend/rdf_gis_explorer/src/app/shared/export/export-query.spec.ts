import { buildPagedQuery, projectedVariables, wrapUserQuery } from './export-query';
import { Parser } from 'sparqljs';

const USER_QUERY =
  'PREFIX wd: <http://www.wikidata.org/entity/>\n' +
  'SELECT ?item ?price WHERE { ?item wd:P31 wd:Q5 . ?item ?p ?price } LIMIT 50';

describe('wrapUserQuery', () => {
  it('extracts prologue, regenerates inner without PREFIX and lists projected variables', () => {
    const wrapped = wrapUserQuery(USER_QUERY);
    expect(wrapped.prologue).toBe('PREFIX wd: <http://www.wikidata.org/entity/>');
    expect(wrapped.inner).not.toContain('PREFIX');
    expect(wrapped.inner).toContain('LIMIT 50');
    expect(wrapped.variables).toEqual(['item', 'price']);
    expect(wrapped.hasOrderBy).toBe(false);
  });

  it('detects a user ORDER BY', () => {
    const wrapped = wrapUserQuery('SELECT ?x WHERE { ?s ?p ?x } ORDER BY ?x');
    expect(wrapped.hasOrderBy).toBe(true);
  });

  it('throws for non-SELECT queries', () => {
    expect(() => wrapUserQuery('ASK { ?s ?p ?o }')).toThrow();
    expect(() => wrapUserQuery('CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }')).toThrow();
  });
});

describe('projectedVariables', () => {
  it('includes aliases of expressions', () => {
    const ast = new Parser().parse(
      'SELECT ?x (COUNT(?y) AS ?c) WHERE { ?x ?p ?y } GROUP BY ?x',
    ) as never;
    expect(projectedVariables(ast)).toEqual(['x', 'c']);
  });

  it('collects top-level variables for SELECT * without descending into subqueries', () => {
    const ast = new Parser().parse(
      'SELECT * WHERE { ?a ?p ?b . { SELECT ?c WHERE { ?c ?q ?inner } } }',
    ) as never;
    const vars = projectedVariables(ast);
    expect(vars).toContain('a');
    expect(vars).toContain('b');
    // ?c y ?inner son internas de la subquery: no son visibles afuera.
    expect(vars).not.toContain('c');
    expect(vars).not.toContain('inner');
  });
});

describe('buildPagedQuery', () => {
  it('wraps with ORDER BY over all variables and embeds OFFSET/LIMIT', () => {
    const wrapped = wrapUserQuery(USER_QUERY);
    const page = buildPagedQuery(wrapped, 4000, 2000);

    expect(page).toMatch(/^PREFIX wd: <http:\/\/www\.wikidata\.org\/entity\/>\nSELECT \* WHERE \{ \{/);
    // La subquery no contiene PREFIX (inválido en varios endpoints).
    const subqueryStart = page.indexOf('WHERE { {');
    expect(page.slice(subqueryStart)).not.toContain('PREFIX');
    expect(page).toContain('ORDER BY ?item ?price');
    expect(page).toContain('OFFSET 4000');
    expect(page).toContain('LIMIT 2000');
  });

  it('respects a user ORDER BY (no outer ORDER BY added)', () => {
    const wrapped = wrapUserQuery(
      'SELECT ?x WHERE { ?s ?p ?x } ORDER BY DESC(?x)',
    );
    const page = buildPagedQuery(wrapped, 0, 100);
    // El ORDER BY del usuario queda dentro de la subquery (el Generator lo
    // emite como `ORDER BY DESC (?x)`)...
    expect(page).toContain('ORDER BY DESC');
    // ...y no se agrega otro afuera.
    expect(page.indexOf('ORDER BY')).toBe(page.lastIndexOf('ORDER BY'));
  });

  it('produces parseable SPARQL', () => {
    const wrapped = wrapUserQuery(USER_QUERY);
    const page = buildPagedQuery(wrapped, 2000, 1000);
    expect(() => new Parser().parse(page)).not.toThrow();
  });
});
