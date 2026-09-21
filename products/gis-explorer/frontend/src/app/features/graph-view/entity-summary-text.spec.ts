import { describe, expect, it } from 'vitest';
import { restrictResultToUris } from '@shared/stats/lots';
import { buildEntitySubgraph, makeBranchId, type EntitySubgraph } from './entity-subgraph';
import { aggregateParallelEdges } from './graph-abstraction';
import {
  buildEntitySummary,
  formatBindingValue,
  formatTerm,
  isBlankNode,
  renderEntitySummaryText,
  summaryScopeLabel,
} from './entity-summary-text';
import {
  EX,
  P,
  bnodeFixture,
  disconnectedCoRowFixture,
  literal,
  node as makeNode,
  edge as makeEdge,
  realEstateFixture,
  result,
  uri as makeUri,
  wideStarFixture,
} from './testing/entity-subgraph-fixtures';

/**
 * Stage 6: text-generator tests use explicit assertions instead of snapshots so
 * the golden remains readable in the spec and cannot regenerate accidentally.
 */

const A = `${EX}a`;
const B = `${EX}b`;

/**
 * Minimal self-contained golden fixture: two nodes joined by two distinct
 * predicates (a multiplicity-2 superedge) and a root with predicate-less attributes.
 */
function goldenSubgraph(): EntitySubgraph {
  const nodes = [
    makeNode(A, {
      label: 'A',
      queryVariable: 'a',
      attributes: { precio: literal('100000'), fecha: literal('2024-01-01') },
    }),
    makeNode(B, { label: 'B' }),
  ];
  const edges = [
    makeEdge(A, B, P.knows, 'conoce'),
    makeEdge(A, B, P.worksWith, 'trabaja con'),
  ];
  const bindings = [{ s: makeUri(A), o: makeUri(B) }];
  return buildEntitySubgraph({
    visibleResult: result(nodes, edges, bindings, ['s', 'o']),
    rootUri: A,
  });
}

const GOLDEN_VIEW_TEXT = [
  'Entidad raíz: A',
  `URI: ${A}`,
  'Alcance: vista explorada',
  'Origen: lote visible del resultado',
  'Lote: 1 de 2 (5 filas en el lote de 10 filas filtradas)',
  '',
  'Resumen',
  '- Nodos visibles: 2',
  '- Nodos disponibles: 2',
  '- Aristas visibles: 1',
  '- Tripletas representadas: 2',
  '- Nodos intermedios: 0',
  '- Nodos frontera: 0',
  '- Recursos compartidos: 0',
  '- Super-aristas: 1',
  '- Filas que mencionan la raíz: 1',
  '- Ramas sin expandir: 0',
  '- Nodos omitidos por presupuesto: 0',
  '- Relaciones omitidas por presupuesto: 0',
  '',
  'Nodos (2)',
  `- [raíz] A — <${A}> (var a; prof 0; grado 1; filas 1)`,
  '  - fecha: "2024-01-01"',
  '  - precio: "100000"',
  `- [co-fila] B — <${B}> (prof 1; grado 1; filas 1)`,
  '',
  'Nota: los atributos listados bajo cada nodo provienen de variables de la ' +
    'consulta y no tienen predicado disponible en el resultado: no se cuentan ' +
    'como tripletas.',
  '',
  'Relaciones (2 tripleta(s) en 1 arista(s) dibujada(s))',
  `- <${A}> <${P.knows}> <${B}>  # conoce`,
  `- <${A}> <${P.worksWith}> <${B}>  # trabaja con`,
  '',
  'Super-aristas (1)',
  `- <${A}> -> <${B}>: 2 tripletas · 2 predicado(s): <${P.knows}>, <${P.worksWith}>`,
].join('\n');

/** Section lines excluding its heading, through the blank line. */
function section(text: string, heading: string): string[] {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line === heading || line.startsWith(`${heading} (`));
  if (start === -1) return [];
  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === '') break;
    body.push(lines[i]);
  }
  return body;
}

describe('buildEntitySummary', () => {
  describe('texto estable', () => {
    it('produces exactly the expected text for the explored view', () => {
      const text = renderEntitySummaryText(goldenSubgraph(), {
        scope: 'view',
        lot: { currentLot: 1, lotCount: 2, totalRows: 10, visibleRows: 5 },
      });

      expect(text).toBe(GOLDEN_VIEW_TEXT);
    });

    it('is deterministic for repeated runs of the same input', () => {
      const options = { scope: 'view' as const, lot: { currentLot: 1, lotCount: 1 } };
      const first = renderEntitySummaryText(goldenSubgraph(), options);
      const second = renderEntitySummaryText(goldenSubgraph(), options);

      expect(second).toBe(first);
    });

    it('honors the configured line separator', () => {
      const text = renderEntitySummaryText(goldenSubgraph(), { scope: 'view', eol: '\r\n' });

      expect(text).toContain('\r\n');
      expect(text.split('\r\n')[0]).toBe('Entidad raíz: A');
    });

    it('exposes the same lines as the text', () => {
      const document = buildEntitySummary(goldenSubgraph(), { scope: 'view' });

      expect(document.lines.join('\n')).toBe(document.text);
    });
  });

  describe('encabezado y alcance', () => {
    it('distingue vista explorada de estructura disponible', () => {
      const subgraph = goldenSubgraph();

      expect(renderEntitySummaryText(subgraph, { scope: 'view' })).toContain(
        'Alcance: vista explorada',
      );
      expect(renderEntitySummaryText(subgraph, { scope: 'structure' })).toContain(
        'Alcance: estructura disponible',
      );
      expect(summaryScopeLabel('structure')).toBe('estructura disponible');
    });

    it('marks structure as incomplete when the budget is exhausted', () => {
      const text = renderEntitySummaryText(goldenSubgraph(), {
        scope: 'structure',
        structureComplete: false,
      });

      expect(text).toContain('Alcance: estructura disponible (incompleta: se agotó el presupuesto');
    });

    it('reports when structure was computed over the complete result', () => {
      const fixture = realEstateFixture();
      const visible = restrictResultToUris(
        fixture.result,
        new Set([fixture.otherListing, fixture.otherEstate]),
      );
      const subgraph = buildEntitySubgraph({
        visibleResult: visible,
        fullResult: fixture.result,
        rootUri: fixture.root,
      });

      const text = renderEntitySummaryText(subgraph, { scope: 'view' });

      expect(text).toContain('Origen: resultado completo (la raíz no está en el lote visible)');
    });

    it('describes the single batch and truncated result', () => {
      const text = renderEntitySummaryText(goldenSubgraph(), {
        scope: 'view',
        lot: { currentLot: 1, lotCount: 1, totalRows: 12, truncated: true },
      });

      expect(text).toContain('Lote: único (12 filas filtradas)');
      expect(text).toContain('Resultado: truncado por el backend');
    });

    it('omits the batch line when no batch context is provided', () => {
      const text = renderEntitySummaryText(goldenSubgraph(), { scope: 'view' });

      expect(text).not.toContain('Lote:');
    });

    it('reports the active node only when it differs from the root', () => {
      const fixture = realEstateFixture();
      const withActive = buildEntitySubgraph({
        visibleResult: fixture.result,
        rootUri: fixture.root,
        activeUri: fixture.estate,
      });

      expect(renderEntitySummaryText(withActive, { scope: 'view' })).toContain(
        `Nodo activo: Inmueble 0 — ${fixture.estate}`,
      );
      expect(renderEntitySummaryText(goldenSubgraph(), { scope: 'view' })).not.toContain(
        'Nodo activo:',
      );
    });
  });

  describe('exact metrics', () => {
    it('declares the same numbers as the subgraph', () => {
      const fixture = realEstateFixture();
      const subgraph = buildEntitySubgraph({
        visibleResult: fixture.result,
        rootUri: fixture.root,
      });
      const document = buildEntitySummary(subgraph, { scope: 'view' });

      expect(document.metrics.nodes).toBe(subgraph.nodes.length);
      expect(document.metrics.triples).toBe(subgraph.edges.length);
      expect(document.metrics.availableNodes).toBe(subgraph.metrics.availableNodeCount);
      expect(document.metrics.intermediates).toBe(subgraph.metrics.intermediateCount);
      expect(document.metrics.frontierNodes).toBe(subgraph.metrics.frontierNodeCount);
      expect(document.metrics.hubs).toBe(subgraph.hubs.length);
      expect(document.metrics.rows).toBe(subgraph.metrics.rowCount);
      expect(document.text).toContain(`- Nodos visibles: ${subgraph.nodes.length}`);
      expect(document.text).toContain(`- Tripletas representadas: ${subgraph.edges.length}`);
    });

    it('makes superedge multiplicity add up to the exact triple count', () => {
      const subgraph = goldenSubgraph();
      const document = buildEntitySummary(subgraph, { scope: 'view' });
      const superEdges = aggregateParallelEdges(subgraph.edges.map((edge) => edge.edge));
      const total = superEdges.reduce((sum, superEdge) => sum + superEdge.multiplicity, 0);

      expect(total).toBe(document.metrics.triples);
      expect(document.metrics.drawnEdges).toBe(superEdges.length);
      expect(document.metrics.superEdges).toBe(1);
      expect(document.text).toContain('2 tripletas · 2 predicado(s)');
    });

    it('counts one triple line per included RDF relationship', () => {
      const fixture = realEstateFixture();
      const subgraph = buildEntitySubgraph({
        visibleResult: fixture.result,
        rootUri: fixture.root,
      });
      const document = buildEntitySummary(subgraph, { scope: 'view' });

      expect(section(document.text, 'Relaciones')).toHaveLength(subgraph.edges.length);
    });

    it('reports multiplicity when the same triple is repeated', () => {
      const nodes = [makeNode(A, { label: 'A' }), makeNode(B, { label: 'B' })];
      const edges = [
        { id: 'e1', source: A, target: B, predicate: P.knows },
        { id: 'e2', source: A, target: B, predicate: P.knows },
      ];
      const subgraph = buildEntitySubgraph({
        visibleResult: result(nodes, edges, [{ s: makeUri(A), o: makeUri(B) }], ['s', 'o']),
        rootUri: A,
      });

      const relations = section(renderEntitySummaryText(subgraph, { scope: 'view' }), 'Relaciones');

      expect(relations).toEqual([`- <${A}> <${P.knows}> <${B}>  # ×2`]);
    });

    it('counts available unexpanded branches', () => {
      const subgraph = buildEntitySubgraph({
        visibleResult: wideStarFixture(12),
        rootUri: `${EX}star/root`,
        budget: { maxNodes: 4 },
      });
      const document = buildEntitySummary(subgraph, { scope: 'view' });

      expect(document.metrics.pendingBranches).toBeGreaterThan(0);
      expect(document.text).toContain(`- Ramas sin expandir: ${document.metrics.pendingBranches}`);
      expect(section(document.text, 'Ramas sin expandir').length).toBe(
        document.metrics.pendingBranches,
      );
      expect(document.text).toContain(`salida <${EX}star/hub> <${P.tag}> · disponibles`);
    });
  });

  describe('unambiguous identifiers', () => {
    it('uses full URIs inside angle brackets in triples', () => {
      const relations = section(
        renderEntitySummaryText(goldenSubgraph(), { scope: 'view' }),
        'Relaciones',
      );

      expect(relations[0].startsWith(`- <${A}> <${P.knows}> <${B}>`)).toBe(true);
    });

    it('keeps blank nodes opaque and outside angle brackets', () => {
      const subgraph = buildEntitySubgraph({
        visibleResult: bnodeFixture(),
        rootUri: `${EX}entity`,
      });
      const text = renderEntitySummaryText(subgraph, { scope: 'view' });

      expect(text).toContain(`- <${EX}entity> <${P.statement}> _:b0`);
      expect(text).not.toContain('<_:b0>');
    });

    it('exposes term-formatting helpers', () => {
      expect(isBlankNode('_:b0')).toBe(true);
      expect(isBlankNode(`${EX}x`)).toBe(false);
      expect(formatTerm('_:b0')).toBe('_:b0');
      expect(formatTerm(`${EX}x`)).toBe(`<${EX}x>`);
    });

    it('uses labels alongside identifiers without replacing them', () => {
      const nodes = section(
        renderEntitySummaryText(goldenSubgraph(), { scope: 'view' }),
        'Nodos',
      );

      expect(nodes[0]).toContain('A — ');
      expect(nodes[0]).toContain(`<${A}>`);
    });

    it('does not duplicate the identifier when the label is the URI itself', () => {
      const subgraph = buildEntitySubgraph({
        visibleResult: disconnectedCoRowFixture(),
        rootUri: `${EX}root`,
      });

      expect(renderEntitySummaryText(subgraph, { scope: 'view' })).toContain(
        `- [raíz] <${EX}root> (`,
      );
    });
  });

  describe('attributes without predicates', () => {
    it('lists root attributes outside triples', () => {
      const document = buildEntitySummary(goldenSubgraph(), { scope: 'view' });

      expect(document.text).toContain('  - precio: "100000"');
      expect(section(document.text, 'Relaciones').join('\n')).not.toContain('precio');
      expect(document.text).toContain('no se cuentan como tripletas');
    });

    it('does not invent triples and derives relationships only from result edges', () => {
      const subgraph = goldenSubgraph();
      const relations = section(
        renderEntitySummaryText(subgraph, { scope: 'view' }),
        'Relaciones',
      );

      expect(relations).toHaveLength(subgraph.edges.length);
      for (const line of relations) {
        expect(line).toMatch(/^- (<[^>]+>|_:[^\s]+) <[^>]+> (<[^>]+>|_:[^\s]+)/);
      }
    });

    it('lists neither attributes nor the note with attributes set to none', () => {
      const text = renderEntitySummaryText(goldenSubgraph(), {
        scope: 'view',
        attributes: 'none',
      });

      expect(text).not.toContain('  - precio:');
      expect(text).not.toContain('no se cuentan como tripletas');
    });

    it('also lists other-node attributes with attributes set to all', () => {
      const nodes = [
        makeNode(A, { label: 'A', attributes: { precio: literal('100000') } }),
        makeNode(B, { label: 'B', attributes: { color: literal('rojo') } }),
      ];
      const subgraph = buildEntitySubgraph({
        visibleResult: result(
          nodes,
          [makeEdge(A, B, P.knows)],
          [{ s: makeUri(A), o: makeUri(B) }],
          ['s', 'o'],
        ),
        rootUri: A,
      });

      expect(renderEntitySummaryText(subgraph, { scope: 'view' })).not.toContain(
        '  - color: "rojo"',
      );
      expect(renderEntitySummaryText(subgraph, { scope: 'view', attributes: 'all' })).toContain(
        '  - color: "rojo"',
      );
    });

    it('formats every binding-value type unambiguously', () => {
      expect(formatBindingValue({ type: 'uri', value: `${EX}x` })).toBe(`<${EX}x>`);
      expect(formatBindingValue({ type: 'bnode', value: 'b0' })).toBe('_:b0');
      expect(formatBindingValue({ type: 'literal', value: 'hola', lang: 'es' })).toBe('"hola"@es');
      expect(
        formatBindingValue({ type: 'literal', value: '3', datatype: `${EX}int` }),
      ).toBe(`"3"^^<${EX}int>`);
      expect(
        formatBindingValue({ type: 'date', value: '2024-01-01T00:00:00Z', raw: '2024-01-01' }),
      ).toBe('"2024-01-01T00:00:00Z"');
      expect(
        formatBindingValue({
          type: 'coordinate',
          value: { lat: -34.9, lng: -57.9 },
          raw: 'POINT(-57.9 -34.9)',
        }),
      ).toBe('"POINT(-57.9 -34.9)"');
    });

    it('escapes quotes and line breaks in literals', () => {
      expect(formatBindingValue({ type: 'literal', value: 'di "hola"\nchau' })).toBe(
        '"di \\"hola\\"\\nchau"',
      );
    });
  });

  describe('recursos compartidos, omisiones y advertencias', () => {
    it('lists hubs with their omitted neighbors', () => {
      const fixture = realEstateFixture();
      const subgraph = buildEntitySubgraph({
        visibleResult: fixture.result,
        rootUri: fixture.root,
      });
      const text = renderEntitySummaryText(subgraph, { scope: 'view' });
      const hubs = section(text, 'Recursos compartidos');

      expect(hubs.length).toBe(subgraph.hubs.length);
      expect(hubs.join('\n')).toContain('vecinos no incorporados');
      expect(hubs.join('\n')).toContain(fixture.commercialFunction);
    });

    it('lists budget-omitted nodes and truncates with a warning', () => {
      const subgraph = buildEntitySubgraph({
        visibleResult: wideStarFixture(12),
        rootUri: `${EX}star/root`,
        expandedBranchIds: [makeBranchId(`${EX}star/hub`, 'outgoing', P.tag)],
        budget: { maxNodes: 5 },
      });
      const text = renderEntitySummaryText(subgraph, {
        scope: 'view',
        maxListedOmissions: 2,
      });
      const omitted = section(text, 'Nodos omitidos por presupuesto');

      expect(subgraph.omitted.nodes.length).toBeGreaterThan(2);
      expect(omitted).toHaveLength(3);
      expect(omitted[2]).toBe(`- … y ${subgraph.omitted.nodes.length - 2} más`);
    });

    it('reproduces subgraph warnings', () => {
      const subgraph = buildEntitySubgraph({
        visibleResult: disconnectedCoRowFixture(),
        rootUri: `${EX}root`,
      });
      const warnings = section(
        renderEntitySummaryText(subgraph, { scope: 'view' }),
        'Advertencias',
      );

      expect(warnings.length).toBe(subgraph.warnings.length);
      expect(warnings.join('\n')).toContain('sin un camino de relaciones');
    });
  });

  describe('root without structure', () => {
    it('returns an empty document with the warning and no sections', () => {
      const subgraph = buildEntitySubgraph({
        visibleResult: disconnectedCoRowFixture(),
        rootUri: `${EX}ausente`,
      });
      const document = buildEntitySummary(subgraph, { scope: 'view' });

      expect(document.empty).toBe(true);
      expect(document.metrics.nodes).toBe(0);
      expect(document.metrics.triples).toBe(0);
      expect(document.text).toContain('Sin estructura disponible para esta entidad');
      expect(document.text).toContain('no existe en el resultado');
      expect(document.text).not.toContain('Relaciones (');
    });

    it('reports the root even when there is no structure', () => {
      const subgraph = buildEntitySubgraph({
        visibleResult: disconnectedCoRowFixture(),
        rootUri: `${EX}ausente`,
      });
      const document = buildEntitySummary(subgraph, { scope: 'structure' });

      expect(document.rootUri).toBe(`${EX}ausente`);
      expect(document.text).toContain(`URI: ${EX}ausente`);
      expect(document.text).toContain('Alcance: estructura disponible');
    });
  });
});
