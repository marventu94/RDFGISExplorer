import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { DiscoveryConnection, DiscoveryConnections, DiscoveryFocus } from '@rdfgis/contracts';
import { DiscoveryPanelComponent } from './discovery-panel.component';
import { DiscoveryApiService } from './discovery-api.service';
import { DiscoveryStateService } from './discovery-state.service';
import { RequestService } from '../../core/request.service';
import { PropertyGraph } from '../../graph/domain';
import { parseDropPayload } from '../../graph/canvas-graph/canvas-graph.drop';

const connection: DiscoveryConnection = {
  predicate: 'urn:addressFeature', label: 'Dirección', direction: 'out', kind: 'resource',
  targetClass: 'urn:Address', targetLabel: 'Domicilio', entityCount: 2,
  examples: [{ kind: 'literal', value: 'Berisso' }],
};
describe('unified explorer panel', () => {
  let component: DiscoveryPanelComponent;
  let focus: ReturnType<typeof signal<DiscoveryFocus | null>>;
  let origin: ReturnType<typeof signal<DiscoveryFocus | null>>;
  let responses: Subject<DiscoveryConnections>[];
  let prepareDrag: ReturnType<typeof vi.fn>;
  let clearDrag: ReturnType<typeof vi.fn>;
  let source: ReturnType<PropertyGraph['addNode']>;
  beforeEach(() => {
    focus = signal<DiscoveryFocus | null>({ classUri: 'urn:House' });
    origin = signal<DiscoveryFocus | null>({ classUri: 'urn:House' });
    responses = [];
    source = new PropertyGraph().addNode();
    prepareDrag = vi.fn(() => '42'); clearDrag = vi.fn();
    TestBed.configureTestingModule({ providers: [
      { provide: DiscoveryStateService, useValue: { focus, origin, source: signal(source),
        graph: { prepareConnectionDrag: prepareDrag, clearConnectionDrag: clearDrag },
        asStep: (step: DiscoveryConnection) => ({ predicate: step.predicate, direction: step.direction, kind: step.kind, targetClass: step.targetClass }),
      } },
      { provide: DiscoveryApiService, useValue: { connections: vi.fn(() => {
        const response = new Subject<DiscoveryConnections>(); responses.push(response); return response;
      }) } },
      { provide: RequestService, useValue: { setLabel: vi.fn(), getLabel: vi.fn() } },
    ] });
    component = TestBed.runInInjectionContext(() => new DiscoveryPanelComponent());
    TestBed.tick();
  });
  afterEach(() => { component.ngOnDestroy(); vi.useRealTimers(); });
  it('filters by readable labels, target types and values without another server request', () => {
    responses[0].next({ connections: [connection], sampledEntities: 2, sampleLimit: 200, sampled: false, truncated: false, failedDirections: [] });
    for (const text of ['dirección', 'domicilio', 'berisso', 'addressfeature']) {
      component.filter.set(text);
      expect(component.connections()).toEqual([connection]);
    }
    component.filter.set('otro'); expect(component.connections()).toEqual([]);
    expect(responses).toHaveLength(1);
    expect(component.busy()).toBe(false);
  });
  it('lists outgoing relationships first, preserving the order within each direction after filtering', () => {
    const incoming = { ...connection, predicate: 'urn:incoming', direction: 'in' as const };
    const outgoing = { ...connection, predicate: 'urn:outgoing' };
    responses[0].next({ connections: [incoming, connection, { ...incoming, predicate: 'urn:incoming2' }, outgoing],
      sampledEntities: 2, sampleLimit: 200, sampled: false, truncated: false, failedDirections: [] });
    expect(component.connections().map(item => item.predicate)).toEqual([
      'urn:addressFeature', 'urn:outgoing', 'urn:incoming', 'urn:incoming2',
    ]);
    component.filter.set('Domicilio');
    expect(component.connections().map(item => item.direction)).toEqual(['out', 'out', 'in', 'in']);
  });
  it('cancels obsolete loads when switching from a variable to a concrete resource', () => {
    component.filter.set('domicilio');
    origin.set({ uri: 'urn:listing' }); focus.set({ uri: 'urn:listing' }); TestBed.tick();
    expect(component.concrete()).toBe(true);
    expect(component.filter()).toBe('');
    expect(responses[0].observed).toBe(false);
    responses[0].next({ connections: [connection], sampledEntities: 2, sampleLimit: 200, sampled: false, truncated: false, failedDirections: [] });
    expect(component.data()).toBeNull();
    responses[1].error(new Error('timeout'));
    expect(component.error()).toBe(true);
    expect(component.busy()).toBe(false);
    expect(responses).toHaveLength(2);
  });
  it('blocks retries during cooldown, then recovers without extending the pause', () => {
    vi.useFakeTimers();
    responses[0].error({ status: 502, error: { error: 'UPSTREAM_ERROR', retryAfterSeconds: 2 } });
    expect(component.busy()).toBe(false);
    expect(component.errorMessage()).toBe('El servidor RDF no pudo completar la exploración.');
    component.retry(); expect(responses).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    expect(component.retryIn()).toBe(0);
    component.retry(); component.retry(); expect(responses).toHaveLength(2);
    responses[1].next({ connections: [connection], sampledEntities: 2, sampleLimit: 200, sampled: false, truncated: false, failedDirections: [] });
    expect(component.error()).toBe(false);
    expect(component.busy()).toBe(false);
    expect(component.connections()).toEqual([connection]);
  });
  it('keeps successful directions while retrying a partial response and clears cooldown on a new focus', () => {
    vi.useFakeTimers();
    responses[0].next({ connections: [connection], sampledEntities: 2, sampleLimit: 200, sampled: false, truncated: false, failedDirections: ['in'], retryAfterSeconds: 1 });
    vi.advanceTimersByTime(1000); component.retry();
    expect(component.connections()).toEqual([connection]);
    responses[1].error({ error: { error: 'DISCOVERY_COOLDOWN', retryAfterSeconds: 30 } });
    focus.set({ uri: 'urn:other' }); TestBed.tick();
    expect(component.retryIn()).toBe(0);
    expect(component.data()).toBeNull();
    expect(responses).toHaveLength(3);
  });
  it('releases loading when a request never responds and cancels abandoned timers', () => {
    vi.useFakeTimers();
    // Restart the subscription after enabling fake timers.
    focus.set({ uri: 'urn:slow' }); TestBed.tick();
    vi.advanceTimersByTime(60000);
    expect(component.busy()).toBe(false);
    expect(component.errorMessage()).toContain('tardó demasiado');
    expect(responses[1].observed).toBe(false);
    component.retry();
    responses[2].error({ error: { error: 'DISCOVERY_COOLDOWN', retryAfterSeconds: 30 } });
    component.ngOnDestroy();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('shows outgoing cards while incoming is pending and retries only the failed direction', () => {
    const partial = { connections: [connection], sampledEntities: 2, sampleLimit: 200, sampled: false, truncated: false, failedDirections: [], pendingDirections: ['in'] as ['in'] };
    responses[0].next(partial);
    expect(component.busy()).toBe(true);
    expect(component.connections()).toEqual([connection]);
    responses[0].next({ ...partial, pendingDirections: [], failedDirections: ['in'] });
    expect(component.busy()).toBe(false);
    component.retry();
    expect(TestBed.inject(DiscoveryApiService).connections).toHaveBeenLastCalledWith(focus(), ['in'], expect.objectContaining({connections:[connection]}));
  });
  it('drags a scoped connection with its direction, class and source', () => {
    const data: Record<string, string> = {};
    const transfer = { setData: (key: string, value: string) => { data[key] = value; }, getData: (key: string) => data[key] ?? '' } as unknown as DataTransfer;
    const event = { dataTransfer: transfer, stopPropagation: vi.fn(), preventDefault: vi.fn() } as unknown as DragEvent;
    component.dragConnection(event, { ...connection, direction: 'in' });
    expect(prepareDrag).toHaveBeenCalledWith(source, expect.objectContaining({ direction: 'in', targetClass: 'urn:Address' }), undefined);
    expect(parseDropPayload(transfer)).toEqual({ kind: 'connection', token: '42' });
    expect(transfer.effectAllowed).toBe('copy');
    expect(event.stopPropagation).toHaveBeenCalled();
    component.dragEnd(); expect(clearDrag).toHaveBeenCalled();
  });
  it('shows and filters resolved Wikidata value labels and preserves them when dragging', () => {
    const example = { kind: 'uri' as const, value: 'http://www.wikidata.org/entity/Q5879', label: 'Johann Wolfgang von Goethe' };
    const labeled = { ...connection, examples: [example] };
    component.data.set({ connections: [labeled], sampledEntities: 1, sampleLimit: 200, sampled: false, truncated: false, failedDirections: [] });
    expect(component.exampleLabel(example)).toBe(example.label);
    component.filter.set('goethe'); expect(component.connections()).toEqual([labeled]);
    const event = { dataTransfer: { setData: vi.fn() }, stopPropagation: vi.fn() } as unknown as DragEvent;
    component.dragConnection(event, labeled, example);
    expect(TestBed.inject(RequestService).setLabel).toHaveBeenCalledWith(example.value, example.label);
    expect(prepareDrag).toHaveBeenCalledWith(source, expect.anything(), example);
  });
  it.each([
    ['author', 'Q482980'], ['teacher', 'Q37226'], ['novelist', 'Q49757'],
  ])('keeps the concrete %s property card free until a value is explicitly dragged', (label, id) => {
    origin.set({ uri: 'http://www.wikidata.org/entity/Q909' });
    const example = { kind: 'uri' as const, value: `http://www.wikidata.org/entity/${id}`, label };
    const event = { dataTransfer: { setData: vi.fn() }, stopPropagation: vi.fn() } as unknown as DragEvent;
    component.dragConnection(event, { ...connection, predicate: 'http://www.wikidata.org/prop/direct/P106', examples: [example] });
    expect(prepareDrag).toHaveBeenCalledWith(source, expect.objectContaining({ predicate: 'http://www.wikidata.org/prop/direct/P106' }), undefined);
  });
  it('keeps variable-set cards unconstrained by preview examples', () => {
    const event = { dataTransfer: { setData: vi.fn() }, stopPropagation: vi.fn() } as unknown as DragEvent;
    component.dragConnection(event, connection);
    expect(prepareDrag).toHaveBeenCalledWith(source, expect.anything(), undefined);
  });
  it('does not turn opaque blank-node examples into constants', () => {
    const event = { dataTransfer: {}, preventDefault: vi.fn() } as unknown as DragEvent;
    component.dragConnection(event, connection, { kind: 'bnode', value: 'b0' });
    expect(event.preventDefault).toHaveBeenCalled();
    expect(prepareDrag).not.toHaveBeenCalled();
  });
});
