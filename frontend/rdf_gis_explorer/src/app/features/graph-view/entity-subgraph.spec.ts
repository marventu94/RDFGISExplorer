import { restrictResultToUris } from '@shared/stats/lots';
import {
  DEFAULT_SUBGRAPH_BUDGET,
  buildEntitySubgraph,
  makeBranchId,
  parseBranchId,
  type EntitySubgraph,
} from './entity-subgraph';
import {
  EX,
  P,
  bnodeFixture,
  cycleFixture,
  disconnectedCoRowFixture,
  multiRowFixture,
  parallelRelationsFixture,
  realEstateFixture,
  result,
  tieBreakFixture,
  trimmedPathFixture,
  wideStarFixture,
  node as makeNode,
} from './testing/entity-subgraph-fixtures';

const uris = (subgraph: EntitySubgraph): string[] => subgraph.nodes.map((n) => n.uri);
const reasonOf = (subgraph: EntitySubgraph, uri: string) =>
  subgraph.nodes.find((n) => n.uri === uri)?.reason;
const warningCodes = (subgraph: EntitySubgraph) => subgraph.warnings.map((w) => w.code);

describe('buildEntitySubgraph', () => {
  describe('resolución de la raíz', () => {
    it('devuelve un subgrafo vacío y advierte cuando la raíz no está en ningún resultado', () => {
      const subgraph = buildEntitySubgraph({
        visibleResult: multiRowFixture(),
        rootUri: `${EX}ausente`,
      });

      expect(subgraph.nodes).toEqual([]);
      expect(subgraph.edges).toEqual([]);
      expect(subgraph.branches).toEqual([]);
      expect(subgraph.sourceScope).toBe('none');
      expect(warningCodes(subgraph)).toEqual(['root-missing']);
      expect(subgraph.metrics.nodeCount).toBe(0);
    });

    it('cae al resultado completo cuando la raíz quedó fuera del lote visible', () => {
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

      expect(subgraph.sourceScope).toBe('full');
      expect(warningCodes(subgraph)).toContain('root-from-full-result');
      expect(uris(subgraph)).toContain(fixture.estate);
    });

    it('vuelve a la raíz cuando el nodo activo pedido no existe', () => {
      const subgraph = buildEntitySubgraph({
        visibleResult: multiRowFixture(),
        rootUri: `${EX}root`,
        activeUri: `${EX}fantasma`,
      });

      expect(subgraph.activeUri).toBe(`${EX}root`);
      expect(warningCodes(subgraph)).toContain('active-missing');
    });
  });

  describe('entidad presente en una y varias filas', () => {
    it('ordena las entidades de co-fila por multiplicidad, luego por fila y por URI', () => {
      const subgraph = buildEntitySubgraph({
        visibleResult: multiRowFixture(),
        rootUri: `${EX}root`,
      });

      expect(uris(subgraph)).toEqual([`${EX}root`, `${EX}a`, `${EX}b`, `${EX}c`]);
      expect(subgraph.metrics.rowCount).toBe(3);
      expect(subgraph.metrics.coRowEntityCount).toBe(3);
      expect(subgraph.nodes.find((n) => n.uri === `${EX}a`)?.rowCount).toBe(2);
      expect(subgraph.nodes.find((n) => n.uri === `${EX}b`)?.rowCount).toBe(1);
      expect(subgraph.nodes.find((n) => n.uri === `${EX}root`)?.rowCount).toBe(3);
    });

    it('una sola fila produce sólo las entidades de esa fila', () => {
      const fixture = realEstateFixture();
      const subgraph = buildEntitySubgraph({
        visibleResult: fixture.result,
        rootUri: fixture.root,
      });

      expect(subgraph.metrics.rowCount).toBe(1);
      expect(subgraph.metrics.coRowEntityCount).toBe(5);
    });

    it('desempata por URI de forma estable ante multiplicidad y grado idénticos', () => {
      const fixture = tieBreakFixture();
      const first = buildEntitySubgraph({ visibleResult: fixture, rootUri: `${EX}root` });
      const second = buildEntitySubgraph({ visibleResult: fixture, rootUri: `${EX}root` });

      expect(uris(first)).toEqual([`${EX}root`, `${EX}tie/a`, `${EX}tie/b`, `${EX}tie/c`]);
      expect(uris(second)).toEqual(uris(first));
    });
  });

  describe('caminos con nodos intermedios', () => {
    it('incorpora los intermedios que la query no proyecta', () => {
      const subgraph = buildEntitySubgraph({
        visibleResult: trimmedPathFixture(),
        rootUri: `${EX}trim/root`,
      });

      expect(uris(subgraph).sort()).toEqual([
        `${EX}trim/far`,
        `${EX}trim/mid1`,
        `${EX}trim/mid2`,
        `${EX}trim/root`,
      ]);
      expect(reasonOf(subgraph, `${EX}trim/far`)).toBe('co-row');
      expect(reasonOf(subgraph, `${EX}trim/mid1`)).toBe('path');
      expect(reasonOf(subgraph, `${EX}trim/mid2`)).toBe('path');
      expect(subgraph.metrics.intermediateCount).toBe(2);
      expect(subgraph.nodes.find((n) => n.uri === `${EX}trim/far`)?.depth).toBe(3);
    });

    it('no corta el cálculo ante ciclos y deja el ciclo a un salto', () => {
      const subgraph = buildEntitySubgraph({
        visibleResult: cycleFixture(4),
        rootUri: `${EX}cycle/0`,
      });

      expect(uris(subgraph).sort()).toEqual([`${EX}cycle/0`, `${EX}cycle/1`, `${EX}cycle/3`]);
      expect(subgraph.edges).toHaveLength(2);
      expect(subgraph.metrics.maxDepth).toBe(1);
    });

    it('marca como desconectada la entidad de co-fila sin camino en el resultado', () => {
      const subgraph = buildEntitySubgraph({
        visibleResult: disconnectedCoRowFixture(),
        rootUri: `${EX}root`,
      });

      expect(uris(subgraph)).toContain(`${EX}orphan`);
      expect(subgraph.nodes.find((n) => n.uri === `${EX}orphan`)?.depth).toBeNull();
      expect(warningCodes(subgraph)).toContain('disconnected-co-row');
      expect(subgraph.warnings.find((w) => w.code === 'disconnected-co-row')?.refs).toEqual([
        `${EX}orphan`,
      ]);
    });
  });

  describe('blank nodes', () => {
    it('reconoce el bnode crudo de la fila (b0) como el nodo del grafo (_:b0)', () => {
      const subgraph = buildEntitySubgraph({
        visibleResult: bnodeFixture(),
        rootUri: `${EX}entity`,
      });

      expect(uris(subgraph)).toEqual([`${EX}entity`, '_:b0', `${EX}value`]);
      expect(reasonOf(subgraph, '_:b0')).toBe('co-row');
      expect(subgraph.nodes.find((n) => n.uri === '_:b0')?.rowCount).toBe(1);
      expect(subgraph.nodes.find((n) => n.uri === `${EX}value`)?.depth).toBe(2);
    });
  });

  describe('relaciones paralelas', () => {
    it('agrupa las ramas por URI de predicado, nunca por etiqueta', () => {
      const subgraph = buildEntitySubgraph({
        visibleResult: parallelRelationsFixture(),
        rootUri: `${EX}a`,
      });

      const rootBranches = subgraph.branches.filter((b) => b.nodeUri === `${EX}a`);
      expect(rootBranches.map((b) => b.predicate)).toEqual([P.knows, P.tag, P.worksWith]);
      // `knows` y `tag` comparten etiqueta: agrupar por label las fusionaría.
      expect(rootBranches.filter((b) => b.predicateLabel === 'conoce')).toHaveLength(2);
      expect(subgraph.metrics.tripleCount).toBe(4);
      // El self-loop cuenta como tripleta y vive en la rama de su predicado.
      expect(rootBranches.find((b) => b.predicate === P.knows)?.tripleCount).toBe(2);
    });
  });

  describe('hub compartido', () => {
    it('no incorpora otros inmuebles al seleccionar uno (C1)', () => {
      const fixture = realEstateFixture();
      const subgraph = buildEntitySubgraph({
        visibleResult: fixture.result,
        rootUri: fixture.root,
      });

      expect(uris(subgraph)).toEqual([
        fixture.root,
        fixture.address,
        fixture.estate,
        fixture.commercialFunction,
        fixture.geometry,
        fixture.partido,
      ]);
      expect(uris(subgraph)).not.toContain(fixture.otherListing);
      expect(uris(subgraph)).not.toContain(fixture.otherEstate);
    });

    it('conserva dirección, geometría y el recurso compartido como frontera', () => {
      const fixture = realEstateFixture();
      const subgraph = buildEntitySubgraph({
        visibleResult: fixture.result,
        rootUri: fixture.root,
      });

      expect(uris(subgraph)).toContain(fixture.address);
      expect(uris(subgraph)).toContain(fixture.geometry);
      // Precio y fecha son atributos de la raíz: viajan con el nodo.
      const root = subgraph.nodes.find((n) => n.uri === fixture.root)!;
      expect(Object.keys(root.node.attributes)).toEqual(['precio', 'fecha']);

      const partido = subgraph.nodes.find((n) => n.uri === fixture.partido)!;
      expect(partido.isHub).toBe(true);
      expect(partido.isBoundary).toBe(true);
      expect(partido.degree).toBe(10);
      expect(subgraph.hubs.map((h) => h.uri)).toEqual([
        fixture.commercialFunction,
        fixture.partido,
      ]);
      expect(subgraph.hubs.find((h) => h.uri === fixture.partido)?.hiddenNeighbours).toBe(9);
      expect(warningCodes(subgraph)).toContain('hub-not-traversed');
    });

    it('la raíz nunca se trata como hub aunque supere el umbral', () => {
      const subgraph = buildEntitySubgraph({
        visibleResult: wideStarFixture(12),
        rootUri: `${EX}star/hub`,
      });

      expect(subgraph.nodes.find((n) => n.uri === `${EX}star/hub`)?.isHub).toBe(false);
      // Como raíz, sus 13 vecinos directos son el contexto legítimo.
      expect(subgraph.metrics.nodeCount).toBe(14);
    });

    it('mide el grado sobre el resultado completo: un hub sigue siendo hub en un lote chico', () => {
      const fixture = realEstateFixture();
      const lot = restrictResultToUris(
        fixture.result,
        new Set([
          fixture.root,
          fixture.estate,
          fixture.address,
          fixture.geometry,
          fixture.partido,
          fixture.commercialFunction,
        ]),
      );

      const withoutFull = buildEntitySubgraph({ visibleResult: lot, rootUri: fixture.root });
      expect(withoutFull.nodes.find((n) => n.uri === fixture.partido)?.isHub).toBe(false);

      const withFull = buildEntitySubgraph({
        visibleResult: lot,
        fullResult: fixture.result,
        rootUri: fixture.root,
      });
      expect(withFull.nodes.find((n) => n.uri === fixture.partido)?.isHub).toBe(true);
      expect(withFull.sourceScope).toBe('visible');
    });

    it('no usa un hub como atajo entre entidades', () => {
      const fixture = realEstateFixture();
      const subgraph = buildEntitySubgraph({
        visibleResult: fixture.result,
        rootUri: fixture.root,
      });

      // La rama entrante del partido existe y tiene 9 vecinos pendientes,
      // pero ninguno entró solo al subgrafo.
      const branch = subgraph.branches.find(
        (b) => b.nodeUri === fixture.partido && b.predicate === P.locality,
      )!;
      expect(branch.direction).toBe('incoming');
      expect(branch.fromHub).toBe(true);
      expect(branch.pendingUris).toHaveLength(9);
      expect(branch.includedUris).toEqual([fixture.address]);
      expect(branch.expanded).toBe(false);
    });
  });

  describe('expansión explícita', () => {
    it('incorpora sólo los vecinos de la rama pedida', () => {
      const fixture = realEstateFixture();
      const branchId = makeBranchId(fixture.partido, 'incoming', P.locality);
      const subgraph = buildEntitySubgraph({
        visibleResult: fixture.result,
        rootUri: fixture.root,
        expandedBranchIds: [branchId],
      });

      expect(subgraph.metrics.nodeCount).toBe(15); // 6 + 9 direcciones
      expect(uris(subgraph)).toContain(`${EX}address/5`);
      expect(reasonOf(subgraph, `${EX}address/5`)).toBe('expanded');
      // Las direcciones ajenas no arrastran sus inmuebles.
      expect(uris(subgraph)).not.toContain(fixture.otherEstate);
      expect(subgraph.branches.find((b) => b.id === branchId)?.expanded).toBe(true);
    });

    it('resuelve expansiones encadenadas sobre nodos recién admitidos', () => {
      const fixture = realEstateFixture();
      const subgraph = buildEntitySubgraph({
        visibleResult: fixture.result,
        rootUri: fixture.root,
        expandedBranchIds: [
          makeBranchId(fixture.partido, 'incoming', P.locality),
          makeBranchId(`${EX}address/5`, 'incoming', P.address),
        ],
      });

      expect(uris(subgraph)).toContain(`${EX}estate/5`);
      expect(reasonOf(subgraph, `${EX}estate/5`)).toBe('expanded');
    });

    it('advierte cuando una rama expandida ya no existe', () => {
      const subgraph = buildEntitySubgraph({
        visibleResult: multiRowFixture(),
        rootUri: `${EX}root`,
        expandedBranchIds: [makeBranchId(`${EX}fantasma`, 'outgoing', P.knows)],
      });

      expect(warningCodes(subgraph)).toContain('stale-branch');
    });
  });

  describe('presupuesto', () => {
    it('lista lo omitido y advierte en vez de recortar en silencio', () => {
      const fixture = realEstateFixture();
      const subgraph = buildEntitySubgraph({
        visibleResult: fixture.result,
        rootUri: fixture.root,
        expandedBranchIds: [makeBranchId(fixture.partido, 'incoming', P.locality)],
        budget: { maxNodes: 8 },
      });

      expect(subgraph.metrics.nodeCount).toBe(8);
      expect(subgraph.omitted.nodeBudgetExceeded).toBe(true);
      expect(subgraph.omitted.nodes.length).toBeGreaterThan(0);
      expect(warningCodes(subgraph)).toContain('node-budget-exhausted');
      // Raíz y camino mínimo sobreviven al recorte.
      expect(uris(subgraph)).toContain(fixture.root);
      expect(uris(subgraph)).toContain(fixture.estate);
    });

    it('respeta el tope de aristas y reporta las que no dibujó', () => {
      const fixture = realEstateFixture();
      const subgraph = buildEntitySubgraph({
        visibleResult: fixture.result,
        rootUri: fixture.root,
        budget: { maxEdges: 3 },
      });

      expect(subgraph.edges).toHaveLength(3);
      expect(subgraph.omitted.edgeBudgetExceeded).toBe(true);
      expect(warningCodes(subgraph)).toContain('edge-budget-exhausted');
    });

    it('no recorre caminos más largos que maxPathLength', () => {
      const subgraph = buildEntitySubgraph({
        visibleResult: trimmedPathFixture(),
        rootUri: `${EX}trim/root`,
        budget: { maxPathLength: 2 },
      });

      expect(warningCodes(subgraph)).toContain('disconnected-co-row');
      expect(subgraph.metrics.intermediateCount).toBe(0);
      // `mid1` entra igual como contexto a un salto.
      expect(reasonOf(subgraph, `${EX}trim/mid1`)).toBe('context');
    });
  });

  describe('lotes, filtros y pinning', () => {
    it('prioriza los nodos fijados por encima del contexto', () => {
      const fixture = realEstateFixture();
      const subgraph = buildEntitySubgraph({
        visibleResult: fixture.result,
        rootUri: fixture.root,
        pinnedUris: [fixture.otherEstate],
      });

      expect(reasonOf(subgraph, fixture.otherEstate)).toBe('pinned');
      expect(subgraph.nodes.find((n) => n.uri === fixture.otherEstate)?.isPinned).toBe(true);
      // El pin entra inmediatamente después de la raíz y el nodo activo.
      expect(uris(subgraph)[1]).toBe(fixture.otherEstate);
    });

    it('opera sobre el resultado filtrado sin tocarlo', () => {
      const fixture = realEstateFixture();
      const snapshot = JSON.stringify(fixture.result);
      const lot = restrictResultToUris(
        fixture.result,
        new Set([fixture.root, fixture.estate, fixture.address, fixture.partido]),
      );

      const subgraph = buildEntitySubgraph({ visibleResult: lot, rootUri: fixture.root });

      expect(uris(subgraph)).not.toContain(fixture.geometry);
      expect(JSON.stringify(fixture.result)).toBe(snapshot);
      expect(subgraph.nodes[0].node).toBe(lot.nodes.find((n) => n.uri === fixture.root));
    });
  });

  describe('determinismo', () => {
    it('produce exactamente el mismo subgrafo para el mismo input', () => {
      const fixture = realEstateFixture();
      const input = {
        visibleResult: fixture.result,
        fullResult: fixture.result,
        rootUri: fixture.root,
        activeUri: fixture.estate,
        pinnedUris: [fixture.geometry],
        expandedBranchIds: [makeBranchId(fixture.partido, 'incoming', P.locality)],
      };

      const a = buildEntitySubgraph(input);
      const b = buildEntitySubgraph({ ...input });

      expect(uris(a)).toEqual(uris(b));
      expect(a.edges.map((e) => e.id)).toEqual(b.edges.map((e) => e.id));
      expect(a.branches.map((br) => br.id)).toEqual(b.branches.map((br) => br.id));
      expect(a.metrics).toEqual(b.metrics);
      expect(a.warnings).toEqual(b.warnings);
    });

    it('el orden de los URIs fijados no altera el resultado final', () => {
      const fixture = realEstateFixture();
      const a = buildEntitySubgraph({
        visibleResult: fixture.result,
        rootUri: fixture.root,
        pinnedUris: [fixture.otherEstate, `${EX}estate/2`],
      });
      const b = buildEntitySubgraph({
        visibleResult: fixture.result,
        rootUri: fixture.root,
        pinnedUris: [`${EX}estate/2`, fixture.otherEstate],
      });

      expect(uris(a).slice().sort()).toEqual(uris(b).slice().sort());
    });
  });

  describe('métricas y frontera', () => {
    it('cuenta tripletas, frontera y estructura disponible', () => {
      const fixture = realEstateFixture();
      const subgraph = buildEntitySubgraph({
        visibleResult: fixture.result,
        rootUri: fixture.root,
      });

      expect(subgraph.metrics.nodeCount).toBe(6);
      expect(subgraph.metrics.edgeCount).toBe(5);
      expect(subgraph.metrics.tripleCount).toBe(5);
      expect(subgraph.metrics.frontierNodeCount).toBe(18); // 9 direcciones + 9 inmuebles
      expect(subgraph.metrics.availableNodeCount).toBe(24);
      expect(subgraph.metrics.hubCount).toBe(2);
      expect(subgraph.metrics.maxDepth).toBe(3);
      expect(subgraph.budget).toEqual(DEFAULT_SUBGRAPH_BUDGET);
    });

    it('un resultado sin aristas deja la raíz sola y sin ramas', () => {
      const isolated = result([makeNode(`${EX}solo`)], [], [{ s: { type: 'uri', value: `${EX}solo` } }]);
      const subgraph = buildEntitySubgraph({ visibleResult: isolated, rootUri: `${EX}solo` });

      expect(subgraph.metrics.nodeCount).toBe(1);
      expect(subgraph.branches).toEqual([]);
      expect(subgraph.metrics.maxDepth).toBe(0);
      expect(subgraph.metrics.availableNodeCount).toBe(1);
    });
  });
});

describe('ids de rama', () => {
  it('sobreviven a URIs con separadores', () => {
    const nodeUri = 'http://example.org/a:b/c?d=1';
    const predicate = 'http://example.org/p:q';
    const id = makeBranchId(nodeUri, 'incoming', predicate);

    expect(parseBranchId(id)).toEqual({ nodeUri, predicate, direction: 'incoming' });
  });

  it('devuelve null ante un id ajeno', () => {
    expect(parseBranchId('no-es-una-rama')).toBeNull();
    expect(parseBranchId('branch:sideways:a:b')).toBeNull();
  });
});
