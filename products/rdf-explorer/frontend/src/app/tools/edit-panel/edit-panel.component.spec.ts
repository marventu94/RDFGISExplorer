import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditPanelComponent } from './edit-panel.component';
import { PropertyGraphService } from '../../graph/property-graph.service';
import { RequestService } from '../../core/request.service';
import { AppConfigService } from '../../core/services/app-config.service';
import { discoveryFocus } from '../../graph/domain/discovery';
import { Filter } from '../../graph/domain/filter';
import type { Node } from '../../graph/domain';

const first = 'http://www.wikidata.org/entity/Q397598';
const second = 'http://www.wikidata.org/entity/Q139454930';
describe('editing a single resource constraint', () => {
  let component: EditPanelComponent;
  let graph: PropertyGraphService;
  let selected: Node;
  let related: Node;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      { provide: RequestService, useValue: { labelCache: signal(new Map()), getLabel: vi.fn(), execQuery: vi.fn(), prefetchLabels: vi.fn() } },
      { provide: AppConfigService, useValue: { config: signal(null), defaultPrefixes: signal({}) } },
    ] });
    graph = TestBed.inject(PropertyGraphService);
    selected = graph.addNode(); related = graph.addNode();
    const property = selected.newProp(); property.addUri('urn:relation'); property.mkConst();
    graph.addEdge(property, related);
    vi.spyOn(selected, 'loadPreview').mockImplementation(() => {});
    vi.spyOn(related, 'loadPreview').mockImplementation(() => {});
    graph.setSelected(selected);
    component = TestBed.runInInjectionContext(() => new EditPanelComponent());
    TestBed.tick();
  });
  afterEach(() => { component.ngOnDestroy(); vi.useRealTimers(); });
  it('debounces result searches and resets pagination when the text changes', () => {
    vi.useFakeTimers();
    const preview = vi.mocked(selected.loadPreview);
    preview.mockClear();
    component.resultOffset = 20;
    component.resultFilterValue = 'Be'; component.onFilterValueChange();
    vi.advanceTimersByTime(200);
    component.resultFilterValue = 'Berisso'; component.onFilterValueChange();
    vi.advanceTimersByTime(399);
    expect(preview).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(preview).toHaveBeenCalledOnce();
    expect(preview.mock.calls[0][0]).toMatchObject({ varFilter: 'Berisso', offset: 0, appendResults: false });
    expect(component.resultOffset).toBe(0);
  });
  it('keeps the latest search loading when an obsolete callback arrives', () => {
    vi.useFakeTimers();
    const preview = vi.mocked(selected.loadPreview);
    const old = preview.mock.calls[0][0];
    component.resultFilterValue = 'Berisso'; component.onFilterValueChange();
    vi.advanceTimersByTime(400);
    expect((old['canceller'] as AbortSignal).aborted).toBe(true);
    (old['callback'] as () => void)();
    expect(component.resultFilterLoading()).toBe(true);
    const latest = preview.mock.calls.at(-1)![0];
    (latest['callback'] as () => void)();
    expect(component.resultFilterLoading()).toBe(false);
  });
  it('replaces the previous result and keeps the query and Explorer on the same resource', () => {
    component.addValue(first);
    component.mkVariable();
    component.addValue(second);
    expect(selected.uris).toEqual([]);
    expect(selected.variable.filters.find(f => f.type === 'resourceEquals')?.data.value).toBe(second);
    expect(selected.getUri()).toBeNull();
    expect(selected.isVariable()).toBe(true);
    expect(component.isVariable).toBe(false);
    expect(discoveryFocus(selected)).toEqual({ uri: second });
    const query = related.createQuery()!.toSparqlFullProjection();
    expect(query).toContain(`<${second}>`);
    expect(query).not.toContain(first);
    expect(query).not.toContain('VALUES');
  });
  it('replaces all legacy alternatives when entering a value manually', () => {
    selected.addUri(first); selected.addUri(second); selected.mkConst();
    component.newValue = 'urn:new-resource';
    component.addValue();
    expect(selected.uris).toEqual([]);
    expect(selected.variable.filters.find(f => f.type === 'resourceEquals')?.data.value).toBe('urn:new-resource');
    expect(selected.isVariable()).toBe(true);
    expect(component.newValue).toBe('');
  });
  it('keeps one value when selecting it again and leaves existing values intact on empty input', () => {
    component.addValue(first); component.addValue(first);
    expect(selected.variable.filters.filter(f => f.type === 'resourceEquals').map(f => f.data.value)).toEqual([first]);
    component.addValue('');
    expect(selected.variable.filters.filter(f => f.type === 'resourceEquals').map(f => f.data.value)).toEqual([first]);
  });
  it('clears only the fixed value when switching back to Variable', () => {
    selected.variable.filters.push(new Filter(selected.variable, 'regex', { regex: 'Plata' }));
    component.addValue(first);
    component.mkVariable();
    expect(selected.variable.filters.map(f => f.type)).toEqual(['regex']);
    expect(component.isVariable).toBe(true);
  });

  it('keeps a literal variable with its language and existing filters when fixing or editing text', () => {
    const label = selected.newProp(); label.addUri('http://www.w3.org/2000/01/rdf-schema#label'); label.mkConst();
    const literal = label.mkLiteral()!;
    literal.variable.filters.push(new Filter(literal.variable, 'regex', { regex: 'Plata' }));
    vi.spyOn(literal, 'loadPreview').mockImplementation(() => {});
    graph.setSelected(literal); TestBed.tick();
    component.onAliasChange('ciudadLabel');
    component.addValue('La Plata', { type: 'literal', value: 'La Plata', 'xml:lang': 'es' });
    expect(literal.isVariable()).toBe(true);
    expect(literal.variable.toString()).toBe('?ciudadLabel');
    expect(component.isConst).toBe(true);
    expect(component.existingFilters.map(f => f.filter.type)).toEqual(['regex']);
    expect(component.constraintValues()).toEqual([expect.objectContaining({ value: 'La Plata', language: 'es' })]);
    const query = selected.createQuery()!.toSparqlFullProjection()!;
    expect(query).toContain('STR(?ciudadLabel) = "La Plata"');
    expect(query).toContain('LANG(?ciudadLabel) = "es"');
    component.editValue('La Plata'); component.newValue = 'Berisso'; component.addValue();
    expect(component.constraintValues()).toEqual([expect.objectContaining({ value: 'Berisso', language: 'es' })]);
    component.rmValue('Berisso');
    expect(component.isVariable).toBe(true);
    expect(literal.variable.filters.map(f => f.type)).toEqual(['regex']);
  });

  it('keeps Constraint active when reselecting a fixed resource and shows its value outside Filters', async () => {
    component.addValue(first);
    graph.setSelected(related); TestBed.tick();
    graph.setSelected(selected); TestBed.tick();
    expect(component.isConst).toBe(true);
    const fixture = TestBed.createComponent(EditPanelComponent);
    fixture.detectChanges(); await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.mode-switch button')[1].getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('.value-text')?.getAttribute('title')).toBe(first);
    expect(el.querySelectorAll('.filter-editor:not(.new-filter)')).toHaveLength(0);
  });

  it('renders saved month-precision date filters with visible month values', async () => {
    selected.variable.filters.push(
      new Filter(selected.variable, 'datefrom', { date: '2023-09', granularity: 'month' }),
      new Filter(selected.variable, 'dateto', { date: '2023-12', granularity: 'month' }),
    );
    const fixture = TestBed.createComponent(EditPanelComponent);
    fixture.componentInstance.updateExistingFilters();
    fixture.detectChanges();
    await fixture.whenStable();
    const fields = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('.filter-editor:not(.new-filter) input[type="month"]')];
    expect(fields.map(field => field.value)).toEqual(['2023-09', '2023-12']);
    expect(selected.variable.filters.map(filter => filter.data.date)).toEqual(['2023-09', '2023-12']);
  });
});
