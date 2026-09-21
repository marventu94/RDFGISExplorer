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
 * Etapa 6: tests del generador de texto. Son asserts explícitos (no snapshots
 * automáticos) para que el "golden" quede legible en el propio spec y no se
 * regenere por accidente.
 */

const A = `${EX}a`;
const B = `${EX}b`;

/**
 * Fixture mínimo y autocontenido del golden: dos nodos unidos por **dos**
 * predicados distintos (super-arista de multiplicidad 2) y una raíz con
 * atributos sin predicado.
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

/** Líneas de una sección, sin su encabezado, hasta la línea en blanco. */
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
    it('produce exactamente el texto esperado para la vista explorada', () => {
      const text = renderEntitySummaryText(goldenSubgraph(), {
        scope: 'view',
        lot: { currentLot: 1, lotCount: 2, totalRows: 10, visibleRows: 5 },
      });

      expect(text).toBe(GOLDEN_VIEW_TEXT);
    });

    it('es determinista: dos corridas del mismo input dan el mismo texto', () => {
      const options = { scope: 'view' as const, lot: { currentLot: 1, lotCount: 1 } };
      const first = renderEntitySummaryText(goldenSubgraph(), options);
      const second = renderEntitySummaryText(goldenSubgraph(), options);

      expect(second).toBe(first);
    });

    it('respeta el separador de línea configurado', () => {
      const text = renderEntitySummaryText(goldenSubgraph(), { scope: 'view', eol: '\r\n' });

      expect(text).toContain('\r\n');
      expect(text.split('\r\n')[0]).toBe('Entidad raíz: A');
    });

    it('expone las mismas líneas que el texto', () => {
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

    it('marca la estructura incompleta cuando se agotó el presupuesto', () => {
      const text = renderEntitySummaryText(goldenSubgraph(), {
        scope: 'structure',
        structureComplete: false,
      });

      expect(text).toContain('Alcance: estructura disponible (incompleta: se agotó el presupuesto');
    });

    it('anuncia cuando la estructura se calculó sobre el resultado completo', () => {
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

    it('describe el lote único y el resultado truncado', () => {
      const text = renderEntitySummaryText(goldenSubgraph(), {
        scope: 'view',
        lot: { currentLot: 1, lotCount: 1, totalRows: 12, truncated: true },
      });

      expect(text).toContain('Lote: único (12 filas filtradas)');
      expect(text).toContain('Resultado: truncado por el backend');
    });

    it('omite la línea de lote cuando no se informa contexto de lotes', () => {
      const text = renderEntitySummaryText(goldenSubgraph(), { scope: 'view' });

      expect(text).not.toContain('Lote:');
    });

    it('informa el nodo activo sólo cuando difiere de la raíz', () => {
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

  describe('métricas exactas', () => {
    it('declara los mismos números que el subgrafo', () => {
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

    it('la multiplicidad de las super-aristas suma exactamente las tripletas', () => {
      const subgraph = goldenSubgraph();
      const document = buildEntitySummary(subgraph, { scope: 'view' });
      const superEdges = aggregateParallelEdges(subgraph.edges.map((edge) => edge.edge));
      const total = superEdges.reduce((sum, superEdge) => sum + superEdge.multiplicity, 0);

      expect(total).toBe(document.metrics.triples);
      expect(document.metrics.drawnEdges).toBe(superEdges.length);
      expect(document.metrics.superEdges).toBe(1);
      expect(document.text).toContain('2 tripletas · 2 predicado(s)');
    });

    it('cuenta una línea de tripleta por relación RDF incluida', () => {
      const fixture = realEstateFixture();
      const subgraph = buildEntitySubgraph({
        visibleResult: fixture.result,
        rootUri: fixture.root,
      });
      const document = buildEntitySummary(subgraph, { scope: 'view' });

      expect(section(document.text, 'Relaciones')).toHaveLength(subgraph.edges.length);
    });

    it('informa la multiplicidad cuando la misma tripleta aparece repetida', () => {
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

    it('cuenta las ramas sin expandir disponibles', () => {
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

  describe('identificadores inequívocos', () => {
    it('usa URIs completas entre <> en las tripletas', () => {
      const relations = section(
        renderEntitySummaryText(goldenSubgraph(), { scope: 'view' }),
        'Relaciones',
      );

      expect(relations[0].startsWith(`- <${A}> <${P.knows}> <${B}>`)).toBe(true);
    });

    it('mantiene los blank nodes opacos y sin <>', () => {
      const subgraph = buildEntitySubgraph({
        visibleResult: bnodeFixture(),
        rootUri: `${EX}entity`,
      });
      const text = renderEntitySummaryText(subgraph, { scope: 'view' });

      expect(text).toContain(`- <${EX}entity> <${P.statement}> _:b0`);
      expect(text).not.toContain('<_:b0>');
    });

    it('expone los helpers de formato de término', () => {
      expect(isBlankNode('_:b0')).toBe(true);
      expect(isBlankNode(`${EX}x`)).toBe(false);
      expect(formatTerm('_:b0')).toBe('_:b0');
      expect(formatTerm(`${EX}x`)).toBe(`<${EX}x>`);
    });

    it('las etiquetas acompañan pero no reemplazan al identificador', () => {
      const nodes = section(
        renderEntitySummaryText(goldenSubgraph(), { scope: 'view' }),
        'Nodos',
      );

      expect(nodes[0]).toContain('A — ');
      expect(nodes[0]).toContain(`<${A}>`);
    });

    it('no duplica el identificador cuando la etiqueta es la propia URI', () => {
      const subgraph = buildEntitySubgraph({
        visibleResult: disconnectedCoRowFixture(),
        rootUri: `${EX}root`,
      });

      expect(renderEntitySummaryText(subgraph, { scope: 'view' })).toContain(
        `- [raíz] <${EX}root> (`,
      );
    });
  });

  describe('atributos sin predicado', () => {
    it('lista los atributos de la raíz fuera de las tripletas', () => {
      const document = buildEntitySummary(goldenSubgraph(), { scope: 'view' });

      expect(document.text).toContain('  - precio: "100000"');
      expect(section(document.text, 'Relaciones').join('\n')).not.toContain('precio');
      expect(document.text).toContain('no se cuentan como tripletas');
    });

    it('no inventa tripletas: las relaciones sólo salen de las aristas del resultado', () => {
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

    it('con attributes: "none" no lista atributos ni la nota', () => {
      const text = renderEntitySummaryText(goldenSubgraph(), {
        scope: 'view',
        attributes: 'none',
      });

      expect(text).not.toContain('  - precio:');
      expect(text).not.toContain('no se cuentan como tripletas');
    });

    it('con attributes: "all" lista también los atributos de los otros nodos', () => {
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

    it('formatea cada tipo de valor de binding de forma inequívoca', () => {
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

    it('escapa comillas y saltos de línea de los literales', () => {
      expect(formatBindingValue({ type: 'literal', value: 'di "hola"\nchau' })).toBe(
        '"di \\"hola\\"\\nchau"',
      );
    });
  });

  describe('recursos compartidos, omisiones y advertencias', () => {
    it('lista los hubs con sus vecinos no incorporados', () => {
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

    it('lista los nodos omitidos por presupuesto y recorta con un aviso', () => {
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

    it('reproduce las advertencias del subgrafo', () => {
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

  describe('raíz sin estructura', () => {
    it('devuelve un documento vacío, con la advertencia y sin secciones', () => {
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

    it('informa la raíz aunque no haya estructura', () => {
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
