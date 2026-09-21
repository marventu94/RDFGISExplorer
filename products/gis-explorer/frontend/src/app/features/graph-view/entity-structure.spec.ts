import { describe, expect, it } from 'vitest';
import { parseBranchId } from './entity-subgraph';
import { DEFAULT_STRUCTURE_BUDGET, buildAvailableStructure } from './entity-structure';
import {
  EX,
  P,
  cycleFixture,
  realEstateFixture,
  sharedTargetFixture,
  wideStarFixture,
} from './testing/entity-subgraph-fixtures';

/**
 * Stage 6: closes the root's available structure. The scope must be complete
 * but bounded: everything reachable without traversing shared resources.
 */

const urisOf = (structure: ReturnType<typeof buildAvailableStructure>): string[] =>
  structure.subgraph.nodes.map((node) => node.uri);

describe('buildAvailableStructure', () => {
  it('expands branches left unexpanded by the view', () => {
    const structure = buildAvailableStructure({
      visibleResult: sharedTargetFixture(),
      rootUri: `${EX}shared/root`,
    });

    expect(urisOf(structure)).toContain(`${EX}shared/target`);
    expect(structure.complete).toBe(true);
    expect(structure.iterations).toBeGreaterThan(0);
    expect(structure.expandedBranchIds.length).toBeGreaterThan(0);
  });

  it('does not traverse shared resources into sibling structures', () => {
    const fixture = realEstateFixture();

    const structure = buildAvailableStructure({
      visibleResult: fixture.result,
      rootUri: fixture.root,
    });
    const uris = urisOf(structure);

    expect(uris).toEqual(
      expect.arrayContaining([
        fixture.root,
        fixture.estate,
        fixture.address,
        fixture.geometry,
        fixture.partido,
        fixture.commercialFunction,
      ]),
    );
    expect(uris).not.toContain(fixture.otherListing);
    expect(uris).not.toContain(fixture.otherEstate);
    expect(uris).toHaveLength(6);
  });

  it('reports hub branches without expanding them', () => {
    const fixture = realEstateFixture();

    const structure = buildAvailableStructure({
      visibleResult: fixture.result,
      rootUri: fixture.root,
    });

    expect(structure.hubBranchIds.length).toBeGreaterThan(0);
    for (const branchId of structure.hubBranchIds) {
      expect(structure.expandedBranchIds).not.toContain(branchId);
    }
    const hubOwners = structure.hubBranchIds.map((id) => parseBranchId(id)?.nodeUri);
    expect(hubOwners).toContain(fixture.partido);
    expect(hubOwners).toContain(fixture.commercialFunction);
    // Closure remains complete without traversing hub branches.
    expect(structure.complete).toBe(true);
  });

  it('keeps the hub as a frontier even when budget remains', () => {
    const structure = buildAvailableStructure({
      visibleResult: wideStarFixture(12),
      rootUri: `${EX}star/root`,
    });

    expect(urisOf(structure)).toEqual([`${EX}star/root`, `${EX}star/hub`]);
    expect(structure.hubBranchIds).toHaveLength(1);
    expect(parseBranchId(structure.hubBranchIds[0])).toEqual({
      nodeUri: `${EX}star/hub`,
      direction: 'outgoing',
      predicate: P.tag,
    });
  });

  it('marks structure as incomplete when the budget is insufficient', () => {
    const structure = buildAvailableStructure({
      visibleResult: wideStarFixture(12),
      rootUri: `${EX}star/root`,
      // Without a hub threshold, the star is traversed and exceeds five nodes.
      budget: { maxNodes: 5, hubDegreeThreshold: 100 },
    });

    expect(structure.complete).toBe(false);
    expect(structure.subgraph.omitted.nodeBudgetExceeded).toBe(true);
    expect(structure.subgraph.omitted.nodes.length).toBeGreaterThan(0);
    expect(structure.subgraph.nodes).toHaveLength(5);
  });

  it('terminates on cyclic graphs and includes the entire cycle', () => {
    const structure = buildAvailableStructure({
      visibleResult: cycleFixture(4),
      rootUri: `${EX}cycle/0`,
    });

    expect(urisOf(structure).sort()).toEqual([
      `${EX}cycle/0`,
      `${EX}cycle/1`,
      `${EX}cycle/2`,
      `${EX}cycle/3`,
    ]);
    expect(structure.complete).toBe(true);
  });

  it('honors the iteration cap and does not mark partial work complete', () => {
    const structure = buildAvailableStructure({
      visibleResult: sharedTargetFixture(),
      rootUri: `${EX}shared/root`,
      maxIterations: 0,
    });

    expect(structure.iterations).toBe(0);
    expect(structure.expandedBranchIds).toEqual([]);
    expect(structure.complete).toBe(false);
    expect(urisOf(structure)).not.toContain(`${EX}shared/target`);
  });

  it('es determinista: mismo input, mismo cierre y mismo orden', () => {
    const fixture = realEstateFixture();
    const input = { visibleResult: fixture.result, rootUri: fixture.root };

    const first = buildAvailableStructure(input);
    const second = buildAvailableStructure(input);

    expect(urisOf(second)).toEqual(urisOf(first));
    expect(second.expandedBranchIds).toEqual(first.expandedBranchIds);
    expect(second.subgraph.edges.map((edge) => edge.id)).toEqual(
      first.subgraph.edges.map((edge) => edge.id),
    );
  });

  it('retains the active node and pinned nodes', () => {
    const fixture = realEstateFixture();

    const structure = buildAvailableStructure({
      visibleResult: fixture.result,
      rootUri: fixture.root,
      activeUri: fixture.estate,
      pinnedUris: [fixture.geometry],
    });

    expect(structure.subgraph.activeUri).toBe(fixture.estate);
    expect(structure.subgraph.nodes.find((node) => node.uri === fixture.geometry)?.isPinned).toBe(
      true,
    );
  });

  it('uses its own budget, larger than the view budget', () => {
    expect(DEFAULT_STRUCTURE_BUDGET.maxNodes).toBeGreaterThan(60);
    expect(DEFAULT_STRUCTURE_BUDGET.maxEdges).toBeGreaterThan(120);

    const structure = buildAvailableStructure({
      visibleResult: sharedTargetFixture(),
      rootUri: `${EX}shared/root`,
    });

    expect(structure.subgraph.budget.maxNodes).toBe(DEFAULT_STRUCTURE_BUDGET.maxNodes);
  });
});
