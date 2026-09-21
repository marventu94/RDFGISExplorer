import { makeBranchId, type EntitySubgraph } from './entity-subgraph';
import {
  INITIAL_EXPLORATION_STATE,
  MAX_HISTORY,
  applyCoordinatedFocus,
  collapseBranch,
  createExplorationState,
  enterEntityMode,
  exitToResult,
  expandBranch,
  expandableBranches,
  explorationBreadcrumb,
  explorationSubgraph,
  goBack,
  goToRoot,
  isExplorationActive,
  notifySelection,
  pinNode,
  promoteActiveToRoot,
  resetExploration,
  setActiveNode,
  setExplorationBudget,
  togglePin,
  unpinNode,
  type EntityModeTrigger,
  type ExplorationContext,
  type ExplorationState,
} from './entity-exploration';
import {
  EX,
  P,
  realEstateFixture,
  sharedTargetFixture,
  wideStarFixture,
} from './testing/entity-subgraph-fixtures';

const uris = (subgraph: EntitySubgraph | null): string[] =>
  (subgraph?.nodes ?? []).map((n) => n.uri);

function realEstateContext(): {
  context: ExplorationContext;
  fixture: ReturnType<typeof realEstateFixture>;
  entered: ExplorationState;
} {
  const fixture = realEstateFixture();
  const context: ExplorationContext = { visibleResult: fixture.result };
  const entered = enterEntityMode(createExplorationState(), {
    rootUri: fixture.root,
    trigger: 'table-selection',
  });
  return { context, fixture, entered };
}

describe('local exploration state', () => {
  describe('entrada y salida del modo entidad', () => {
    it.each<EntityModeTrigger>([
      'table-selection',
      'map-selection',
      'timeline-selection',
      'graph-selection',
      'user-action',
    ])('enters from an explicit selection (%s)', (trigger) => {
      const state = enterEntityMode(createExplorationState(), {
        rootUri: `${EX}listing/0`,
        trigger,
      });

      expect(state.mode).toBe('entity');
      expect(state.rootUri).toBe(`${EX}listing/0`);
      expect(state.activeUri).toBe(`${EX}listing/0`);
      expect(state.lastRejection).toBeNull();
      expect(isExplorationActive(state)).toBe(true);
    });

    it('coordinated focus does not start exploration', () => {
      const state = enterEntityMode(createExplorationState(), {
        rootUri: `${EX}listing/0`,
        trigger: 'coordinated-focus',
      });

      expect(state.mode).toBe('result');
      expect(state.rootUri).toBeNull();
      expect(state.lastRejection?.code).toBe('focus-not-explicit');
    });

    it('coordinated focus does not alter ongoing exploration either', () => {
      const { entered } = realEstateContext();
      const after = applyCoordinatedFocus(entered, [`${EX}listing/3`, `${EX}listing/4`]);

      expect(after).toBe(entered);
    });

    it('returning to the result clears root, expansions, and history', () => {
      const { context, fixture, entered } = realEstateContext();
      const withPin = pinNode(context, entered, fixture.estate);
      const back = exitToResult(withPin);

      expect(back.mode).toBe('result');
      expect(back.rootUri).toBeNull();
      expect(back.pinnedUris).toEqual([]);
      expect(back.history).toEqual([]);
      expect(explorationSubgraph(context, back)).toBeNull();
    });

    it('rejects entity operations outside entity mode without changing state', () => {
      const context: ExplorationContext = { visibleResult: realEstateFixture().result };
      const state = createExplorationState();

      for (const next of [
        setActiveNode(context, state, `${EX}listing/0`),
        expandBranch(context, state, 'branch:outgoing:x:y'),
        collapseBranch(context, state, 'branch:outgoing:x:y'),
        pinNode(context, state, `${EX}listing/0`),
        unpinNode(state, `${EX}listing/0`),
        promoteActiveToRoot(state),
        goToRoot(state),
        goBack(state),
        resetExploration(state),
      ]) {
        expect(next.lastRejection?.code).toBe('not-in-entity-mode');
        expect(next.mode).toBe('result');
        expect({ ...next, lastRejection: null }).toEqual(INITIAL_EXPLORATION_STATE);
      }
    });
  });

  describe('one-hop expansion', () => {
    it('expanding a hub adds its branch only and does not rebuild the hairball', () => {
      const { context, fixture, entered } = realEstateContext();
      const branchId = makeBranchId(fixture.partido, 'incoming', P.locality);

      const before = explorationSubgraph(context, entered)!;
      expect(before.metrics.nodeCount).toBe(6);

      const expanded = expandBranch(context, entered, branchId);
      const after = explorationSubgraph(context, expanded)!;

      expect(expanded.lastRejection).toBeNull();
      expect(expanded.expandedBranchIds).toEqual([branchId]);
      expect(after.metrics.nodeCount).toBe(15);
      expect(uris(after)).toContain(`${EX}address/7`);
      // One hop: unrelated addresses do not pull in their properties.
      expect(uris(after)).not.toContain(fixture.otherEstate);
      expect(uris(after)).not.toContain(fixture.otherListing);
    });

    it('rejects an entire expansion when it exceeds the budget', () => {
      const context: ExplorationContext = { visibleResult: wideStarFixture(12) };
      const state = enterEntityMode(createExplorationState({ maxNodes: 10 }), {
        rootUri: `${EX}star/root`,
        trigger: 'graph-selection',
      });
      const branchId = makeBranchId(`${EX}star/hub`, 'outgoing', P.tag);

      const rejected = expandBranch(context, state, branchId);

      expect(rejected.expandedBranchIds).toEqual([]);
      expect(rejected.lastRejection?.code).toBe('budget-exceeded');
      expect(rejected.lastRejection?.required).toBe(12);
      expect(rejected.lastRejection?.available).toBe(8);
      expect(rejected.lastRejection?.message).toContain('10');
      expect(explorationSubgraph(context, rejected)!.metrics.nodeCount).toBe(2);
    });

    it('accepts the same expansion with sufficient budget', () => {
      const context: ExplorationContext = { visibleResult: wideStarFixture(12) };
      const state = enterEntityMode(createExplorationState(), {
        rootUri: `${EX}star/root`,
        trigger: 'graph-selection',
      });
      const branchId = makeBranchId(`${EX}star/hub`, 'outgoing', P.tag);

      const expanded = expandBranch(context, state, branchId);

      expect(expanded.lastRejection).toBeNull();
      expect(explorationSubgraph(context, expanded)!.metrics.nodeCount).toBe(14);
    });

    it('rejects nonexistent branches and does not repeat an expanded one', () => {
      const { context, fixture, entered } = realEstateContext();

      expect(expandBranch(context, entered, 'branch:outgoing:x:y').lastRejection?.code).toBe(
        'unknown-branch',
      );

      // Expanding an already visible branch records intent rather than a no-op…
      const alreadyVisible = makeBranchId(fixture.root, 'outgoing', P.about);
      const intent = expandBranch(context, entered, alreadyVisible);
      expect(intent.lastRejection).toBeNull();
      expect(intent.expandedBranchIds).toEqual([alreadyVisible]);
      // …but repeating it is a no-op.
      expect(expandBranch(context, intent, alreadyVisible).lastRejection?.code).toBe('no-op');
    });

    it('offers expandable branches ordered by distance from the root', () => {
      const { context, fixture, entered } = realEstateContext();
      const branches = expandableBranches(explorationSubgraph(context, entered)!);

      expect(branches.every((b) => b.pendingUris.length > 0)).toBe(true);
      expect(branches.map((b) => b.nodeUri)).toEqual([
        fixture.commercialFunction,
        fixture.partido,
      ]);
    });
  });

  describe('collapse', () => {
    it('does not remove a node required by another visible branch', () => {
      const context: ExplorationContext = { visibleResult: sharedTargetFixture() };
      const target = `${EX}shared/target`;
      const fromX = makeBranchId(`${EX}shared/x`, 'outgoing', P.tag);
      const fromY = makeBranchId(`${EX}shared/y`, 'outgoing', P.tag);

      let state = enterEntityMode(createExplorationState(), {
        rootUri: `${EX}shared/root`,
        trigger: 'graph-selection',
      });
      state = expandBranch(context, state, fromX);
      state = expandBranch(context, state, fromY);
      expect(uris(explorationSubgraph(context, state))).toContain(target);

      state = collapseBranch(context, state, fromX);

      expect(state.expandedBranchIds).toEqual([fromY]);
      expect(state.collapsedBranchIds).toEqual([fromX]);
      expect(uris(explorationSubgraph(context, state))).toContain(target);

      state = collapseBranch(context, state, fromY);
      expect(uris(explorationSubgraph(context, state))).not.toContain(target);
    });

    it('retains the active node when collapsing its branch because selection has absolute priority', () => {
      const { context, fixture, entered } = realEstateContext();
      const branchId = makeBranchId(fixture.partido, 'incoming', P.locality);

      let state = expandBranch(context, entered, branchId);
      state = setActiveNode(context, state, `${EX}address/4`);

      state = collapseBranch(context, state, branchId);

      expect(state.activeUri).toBe(`${EX}address/4`);
      const after = explorationSubgraph(context, state)!;
      expect(uris(after)).toContain(`${EX}address/4`);
      expect(after.nodes.find((n) => n.uri === `${EX}address/4`)?.reason).toBe('active');
      // The rest of the branch was removed.
      expect(uris(after)).not.toContain(`${EX}address/2`);
    });

    it('explains that collapsing a branch that was not expanded is a no-op', () => {
      const { context, fixture, entered } = realEstateContext();
      const branchId = makeBranchId(fixture.partido, 'incoming', P.locality);

      const next = collapseBranch(context, entered, branchId);

      expect(next.lastRejection?.code).toBe('no-op');
      expect(next.expandedBranchIds).toEqual([]);
    });
  });

  describe('active node, pins, and root', () => {
    it('activates a subgraph node and rejects an unrelated node', () => {
      const { context, fixture, entered } = realEstateContext();

      const active = setActiveNode(context, entered, fixture.address);
      expect(active.activeUri).toBe(fixture.address);
      expect(explorationSubgraph(context, active)!.activeUri).toBe(fixture.address);

      const rejected = setActiveNode(context, active, fixture.otherEstate);
      expect(rejected.lastRejection?.code).toBe('unknown-node');
      expect(rejected.activeUri).toBe(fixture.address);
    });

    it('a later selection changes the active node but never the root', () => {
      const { context, fixture, entered } = realEstateContext();

      const after = notifySelection(context, entered, fixture.geometry);
      expect(after.rootUri).toBe(fixture.root);
      expect(after.activeUri).toBe(fixture.geometry);

      // An entity outside the explored structure changes nothing; the UI
      // decides whether to offer it for exploration as a new root.
      const foreign = notifySelection(context, after, fixture.otherListing);
      expect(foreign.rootUri).toBe(fixture.root);
      expect(foreign.activeUri).toBe(fixture.geometry);
      expect(foreign.lastRejection?.code).toBe('unknown-node');
    });

    it('pins and unpins nodes and keeps pins through collapse', () => {
      const { context, fixture, entered } = realEstateContext();
      const branchId = makeBranchId(fixture.partido, 'incoming', P.locality);

      let state = expandBranch(context, entered, branchId);
      state = pinNode(context, state, `${EX}address/4`);
      state = collapseBranch(context, state, branchId);

      expect(state.pinnedUris).toEqual([`${EX}address/4`]);
      expect(uris(explorationSubgraph(context, state))).toContain(`${EX}address/4`);

      state = unpinNode(state, `${EX}address/4`);
      expect(uris(explorationSubgraph(context, state))).not.toContain(`${EX}address/4`);
    });

    it('togglePin toggles and accepts only structure nodes', () => {
      const { context, fixture, entered } = realEstateContext();

      const pinned = togglePin(context, entered, fixture.estate);
      expect(pinned.pinnedUris).toEqual([fixture.estate]);
      expect(togglePin(context, pinned, fixture.estate).pinnedUris).toEqual([]);
      expect(togglePin(context, entered, fixture.otherEstate).lastRejection?.code).toBe(
        'unknown-node',
      );
    });

    it('uses the active node as the new root while retaining pins', () => {
      const { context, fixture, entered } = realEstateContext();

      let state = pinNode(context, entered, fixture.geometry);
      state = setActiveNode(context, state, fixture.estate);
      state = promoteActiveToRoot(state);

      expect(state.rootUri).toBe(fixture.estate);
      expect(state.pinnedUris).toEqual([fixture.geometry]);
      expect(explorationSubgraph(context, state)!.rootUri).toBe(fixture.estate);
      expect(promoteActiveToRoot(state).lastRejection?.code).toBe('no-op');
    });

    it('returns to the root without changing expansions', () => {
      const { context, fixture, entered } = realEstateContext();
      const branchId = makeBranchId(fixture.partido, 'incoming', P.locality);

      let state = expandBranch(context, entered, branchId);
      state = setActiveNode(context, state, `${EX}address/2`);
      state = goToRoot(state);

      expect(state.activeUri).toBe(fixture.root);
      expect(state.expandedBranchIds).toEqual([branchId]);
      expect(goToRoot(state).lastRejection?.code).toBe('no-op');
    });
  });

  describe('historial', () => {
    it('undoes step by step without losing the root', () => {
      const { context, fixture, entered } = realEstateContext();
      const branchId = makeBranchId(fixture.partido, 'incoming', P.locality);

      let state = expandBranch(context, entered, branchId);
      state = setActiveNode(context, state, `${EX}address/3`);
      state = promoteActiveToRoot(state);
      expect(state.rootUri).toBe(`${EX}address/3`);

      state = goBack(state);
      expect(state.rootUri).toBe(fixture.root);
      expect(state.activeUri).toBe(`${EX}address/3`);

      state = goBack(state);
      expect(state.activeUri).toBe(fixture.root);
      expect(state.expandedBranchIds).toEqual([branchId]);

      state = goBack(state);
      expect(state.expandedBranchIds).toEqual([]);
      expect(state.rootUri).toBe(fixture.root);

      expect(goBack(state).lastRejection?.code).toBe('no-history');
    });

    it('trims history to the configured cap', () => {
      const { context, fixture, entered } = realEstateContext();
      let state = entered;
      for (let i = 0; i < MAX_HISTORY + 10; i++) {
        state = i % 2 === 0 ? pinNode(context, state, fixture.estate) : unpinNode(state, fixture.estate);
      }

      expect(state.history).toHaveLength(MAX_HISTORY);
      expect(state.rootUri).toBe(fixture.root);
    });

    it('lists visited roots in breadcrumb order', () => {
      const { context, fixture, entered } = realEstateContext();

      let state = setActiveNode(context, entered, fixture.estate);
      state = promoteActiveToRoot(state);
      state = setActiveNode(context, state, fixture.address);
      state = promoteActiveToRoot(state);

      expect(explorationBreadcrumb(state)).toEqual([
        fixture.root,
        fixture.estate,
        fixture.address,
      ]);
    });

    it('resets exploration reversibly', () => {
      const { context, fixture, entered } = realEstateContext();
      const branchId = makeBranchId(fixture.partido, 'incoming', P.locality);

      let state = expandBranch(context, entered, branchId);
      state = pinNode(context, state, `${EX}address/1`);
      state = resetExploration(state);

      expect(state.rootUri).toBe(fixture.root);
      expect(state.expandedBranchIds).toEqual([]);
      expect(state.pinnedUris).toEqual([]);
      expect(explorationSubgraph(context, state)!.metrics.nodeCount).toBe(6);
      expect(resetExploration(state).lastRejection?.code).toBe('no-op');

      const undone = goBack(state);
      expect(undone.expandedBranchIds).toEqual([branchId]);
      expect(undone.pinnedUris).toEqual([`${EX}address/1`]);
    });
  });

  describe('pureza', () => {
    it('no operation mutates the received state or result', () => {
      const { context, fixture, entered } = realEstateContext();
      const stateSnapshot = JSON.stringify(entered);
      const resultSnapshot = JSON.stringify(fixture.result);
      const branchId = makeBranchId(fixture.partido, 'incoming', P.locality);

      expandBranch(context, entered, branchId);
      setActiveNode(context, entered, fixture.estate);
      pinNode(context, entered, fixture.estate);
      promoteActiveToRoot(setActiveNode(context, entered, fixture.estate));
      resetExploration(entered);

      expect(JSON.stringify(entered)).toBe(stateSnapshot);
      expect(JSON.stringify(fixture.result)).toBe(resultSnapshot);
    });

    it('the same operation sequence produces the same state and subgraph', () => {
      const run = (): { state: ExplorationState; nodes: string[] } => {
        const fixture = realEstateFixture();
        const context: ExplorationContext = { visibleResult: fixture.result };
        let state = enterEntityMode(createExplorationState(), {
          rootUri: fixture.root,
          trigger: 'map-selection',
        });
        state = expandBranch(context, state, makeBranchId(fixture.partido, 'incoming', P.locality));
        state = pinNode(context, state, `${EX}address/8`);
        state = setActiveNode(context, state, `${EX}address/2`);
        return { state, nodes: uris(explorationSubgraph(context, state)) };
      };

      const first = run();
      const second = run();

      expect(second.state).toEqual(first.state);
      expect(second.nodes).toEqual(first.nodes);
    });

    it('adjusts the budget without counting it as a navigation step', () => {
      const { context, entered } = realEstateContext();
      const state = setExplorationBudget(entered, { maxNodes: 12 });

      expect(state.budget.maxNodes).toBe(12);
      expect(state.budget.hubDegreeThreshold).toBe(entered.budget.hubDegreeThreshold);
      expect(state.history).toEqual([]);
      expect(explorationSubgraph(context, state)!.budget.maxNodes).toBe(12);
    });

    it('keeps filters, batch, and query outside exploration state', () => {
      const { entered } = realEstateContext();

      expect(Object.keys(entered).sort()).toEqual([
        'activeUri',
        'budget',
        'collapsedBranchIds',
        'expandedBranchIds',
        'history',
        'lastRejection',
        'mode',
        'pinnedUris',
        'rootUri',
      ]);
    });
  });
});
