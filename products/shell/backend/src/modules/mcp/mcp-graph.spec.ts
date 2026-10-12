import type { DiscoveryConnections, QueryResult, ResultBinding } from '@rdfgis/contracts';
import {
  BLANK_NODE,
  bindingText,
  compactConnections,
  previewDashboard,
  resourceQueries,
  shapeResource,
  sparqlIri,
  variableTypes,
} from './mcp-graph';

const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const SAME_AS = 'http://www.w3.org/2002/07/owl#sameAs';
const THING = 'http://www.w3.org/2002/07/owl#Thing';
const uri = (value: string) => ({ type: 'uri' as const, value });
const lit = (value: string, extra: { datatype?: string; lang?: string } = {}) => ({
  type: 'literal' as const,
  value,
  ...extra,
});
const bnode = (value: string) => ({ type: 'bnode' as const, value });

function result(bindings: ResultBinding[], overrides: Partial<QueryResult> = {}): QueryResult {
  const variables = [...new Set(bindings.flatMap((row) => Object.keys(row)))];
  return {
    variables,
    bindings,
    nodes: [],
    edges: [],
    meta: { durationMs: 5, truncated: false, limitApplied: 1000, backend: 'graphdb' },
    ...overrides,
  };
}

describe('sparqlIri', () => {
  it('accepts absolute IRIs and rejects anything that could break out of <...>', () => {
    expect(sparqlIri('http://example.org/a#b')).toBe('<http://example.org/a#b>');
    for (const bad of ['not a uri', 'http://x/a> } DROP ALL', 'relative/path', 'http://x/"a"']) {
      expect(() => sparqlIri(bad)).toThrow('URI inválida');
    }
  });
});

describe('bindingText', () => {
  it('returns the original literal for parsed coordinates and dates', () => {
    expect(
      bindingText({ type: 'coordinate', value: { lat: -32.9, lng: -60.7 }, raw: 'POINT(-60.7 -32.9)' }),
    ).toBe('POINT(-60.7 -32.9)');
    expect(bindingText({ type: 'date', value: '2023-01-05T00:00:00Z', raw: '2023-01-05T00:00:00' })).toBe(
      '2023-01-05T00:00:00',
    );
    expect(bindingText(lit('Casa', { lang: 'es' }))).toBe('Casa@es');
    expect(bindingText(bnode('b0'))).toBe('_:b0');
  });
});

describe('resourceQueries', () => {
  it('limits before looking up labels and sanitizes the language', () => {
    const queries = resourceQueries('urn:x:listing', {
      labelUri: RDFS_LABEL,
      lang: 'es") } DROP ALL #',
      limit: 10,
    });
    expect(queries.outgoing).toContain(
      '<urn:x:listing> ?p ?o . FILTER(!isBlank(?o)) } ORDER BY ?p LIMIT 11 }',
    );
    expect(queries.incoming).toContain('?s ?p <urn:x:listing> } ORDER BY ?p LIMIT 11 }');
    expect(queries.blankNodes).toContain('<urn:x:listing> ?p ?b . FILTER(isBlank(?b)) ?b ?bp ?bo');
    expect(queries.head).toContain('<urn:x:listing> a ?v');
    expect(queries.outgoing).toContain('LANGMATCHES(LANG(?l), "en")');
    expect(queries.outgoing).not.toContain('DROP');
  });
});

describe('shapeResource', () => {
  const options = { labelUri: RDFS_LABEL, limit: 3 };

  it('groups blank nodes with their properties and skips reflexive owl:sameAs', () => {
    const out = shapeResource('urn:l1', options, {
      outgoing: result([
        { p: uri(RDF_TYPE), o: uri('urn:Listing') },
        { p: uri(RDFS_LABEL), o: lit('Casa en Rosario') },
        { p: uri(SAME_AS), o: uri('urn:l1') },
      ]),
      blankNodes: result([
        {
          p: uri('urn:hasValue'),
          b: bnode('n1'),
          bp: uri('urn:amount'),
          bo: lit('93000', { datatype: 'xsd:float' }),
        },
        { p: uri('urn:hasValue'), b: bnode('n1'), bp: uri('urn:currency'), bo: lit('ARS') },
        { p: uri('urn:hasValue'), b: bnode('n1'), bp: uri(SAME_AS), bo: bnode('n1') },
      ]),
      incoming: result([
        { s: uri('urn:account'), p: uri('urn:creatorOf'), label: lit('Inmobiliaria') },
        { s: uri('urn:l1'), p: uri(SAME_AS) },
      ]),
    });
    expect(out).toMatchObject({ label: 'Casa en Rosario', types: ['urn:Listing'], failed: ['head'] });
    expect(out.outgoing).toHaveLength(3);
    expect(out.outgoing[2]).toEqual({
      predicate: 'urn:hasValue',
      value: BLANK_NODE,
      properties: [
        { predicate: 'urn:amount', value: '93000', datatype: 'xsd:float' },
        { predicate: 'urn:currency', value: 'ARS' },
      ],
    });
    expect(out.incoming).toEqual([
      { predicate: 'urn:creatorOf', subject: 'urn:account', label: 'Inmobiliaria' },
    ]);
    expect(out.outgoingTruncated).toBe(false);
  });

  it('flags truncation from the extra row and reports failed sections', () => {
    const rows = Array.from({ length: 4 }, (_, i) => ({ s: uri(`urn:s${i}`), p: uri('urn:city') }));
    const out = shapeResource('urn:rosario', options, { incoming: result(rows) });
    expect(out.incoming).toHaveLength(3);
    expect(out.incomingTruncated).toBe(true);
    expect(out.failed).toEqual(['head', 'outgoing', 'blankNodes']);
  });

  it('takes the label and types from the head query, independent of the triple limit', () => {
    const out = shapeResource('urn:l1', options, {
      head: result([
        { kind: lit('label'), v: lit('Rosario', { lang: 'es' }) },
        { kind: lit('type'), v: uri('urn:City') },
      ]),
      outgoing: result([]),
    });
    expect(out).toMatchObject({ label: 'Rosario', types: ['urn:City'] });
  });
});

describe('variableTypes', () => {
  it('reports the normalized types seen per variable', () => {
    expect(
      variableTypes(
        result([
          { s: uri('urn:a'), wkt: { type: 'coordinate', value: { lat: 1, lng: 2 }, raw: 'POINT(2 1)' } },
          { s: bnode('b1'), wkt: lit('POINT(None None)') },
        ]),
      ),
    ).toEqual({ s: 'bnode|uri', wkt: 'coordinate|literal' });
  });
});

describe('compactConnections', () => {
  it('drops inferred top-class duplicates and names blank-node examples', () => {
    const base = { direction: 'out' as const, kind: 'resource' as const, label: 'x', entityCount: 10 };
    const input: DiscoveryConnections = {
      connections: [
        { ...base, predicate: 'urn:includes', targetClass: THING, examples: [] },
        { ...base, predicate: 'urn:includes', targetClass: 'urn:Site', examples: [] },
        { ...base, predicate: 'urn:hasValue', targetClass: THING, examples: [{ kind: 'bnode', value: '' }] },
      ],
      sampledEntities: 10,
      sampleLimit: 200,
      sampled: true,
      truncated: false,
      failedDirections: [],
    };
    const out = compactConnections(input);
    expect(out.connections.map((c) => `${c.predicate} ${c.targetClass}`)).toEqual([
      'urn:includes urn:Site',
      `urn:hasValue ${THING}`,
    ]);
    expect(out.connections[1].examples[0].value).toBe(BLANK_NODE);
  });
});

describe('previewDashboard', () => {
  const point = (raw: string) => ({ type: 'coordinate' as const, value: { lat: 1, lng: 2 }, raw });
  const date = (value: string) => ({ type: 'date' as const, value, raw: value });

  it('describes what each view will show for a GIS-ready query', () => {
    const preview = previewDashboard(
      result(
        [
          { s: uri('urn:a'), wkt: point('POINT(2 1)'), d: date('2023-01-05') },
          { s: uri('urn:b'), wkt: point('POINT(3 1)'), d: date('2022-05-03') },
        ],
        {
          nodes: [
            { uri: 'urn:a', label: 'a', attributes: {}, coordinate: { lat: 1, lng: 2 }, temporalEvents: [] },
            {
              uri: 'urn:b',
              label: 'b',
              attributes: {},
              coordinate: { lat: 1, lng: 3 },
              temporalEvents: [{ field: 'd', isoDate: '2022-05-03' }],
            },
          ],
          edges: [{ id: 'e', source: 'urn:a', target: 'urn:b', predicate: 'urn:p' }],
        },
      ),
      { hasLimit: false },
    );
    expect(preview).toMatchObject({
      rows: { retrieved: 2, total: 2, distinct: 2, truncatedByBackend: false },
      map: { variables: ['wkt'], entitiesWithCoordinate: 2 },
      timeline: { variables: ['d'], entitiesWithDate: 1, from: '2022-05-03', to: '2023-01-05' },
      graph: { nodes: 2, edges: 1 },
      warnings: [],
    });
  });

  it('warns about empty views, unparsed WKT, duplicates, truncation and LIMIT', () => {
    const row = {
      s: uri('urn:a'),
      wkt: lit('POLYGON((0 0, 1 1, 1 0, 0 0))', {
        datatype: 'http://www.opengis.net/ont/geosparql#wktLiteral',
      }),
    };
    const preview = previewDashboard(
      result([row, row], { meta: { durationMs: 1, truncated: true, limitApplied: 2, backend: 'graphdb' } }),
      {
        hasLimit: true,
        summary: {
          totalRows: 3589,
          numeric: [],
          temporal: [],
          categorical: [],
          failed: { total: false, numeric: [], temporal: [], categorical: [] },
          meta: { durationMs: 1, backend: 'graphdb' },
        },
      },
    );
    expect(preview.rows).toEqual({ retrieved: 2, total: 3589, distinct: 1, truncatedByBackend: true });
    const text = preview.warnings.join('\n');
    expect(text).toContain('?wkt pero no se pudo leer como POINT');
    expect(text).toContain('línea de tiempo quedaría vacía');
    expect(text).toContain('no tiene aristas');
    expect(text).toContain('1 de 2 filas recuperadas están repetidas');
    expect(text).toContain('2 de 3589 filas');
    expect(text).toContain('LIMIT');
  });
});
