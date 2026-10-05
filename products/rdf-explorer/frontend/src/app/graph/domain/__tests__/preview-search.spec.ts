import { describe, expect, it, vi } from 'vitest';
import { PropertyGraph } from '../graph';
import { Literal } from '../literal';
import { addClassNode, addDiscoveryPath } from '../discovery';
import type { QueryRetriever } from '../query';
import type { SparqlBinding } from '../variable';

function fixture() {
  const execQuery = vi.fn(async (_query: string): Promise<{ results: { bindings: Array<Record<string, SparqlBinding>> } }> => ({ results: { bindings: [] } }));
  const retriever: QueryRetriever = { execQuery, labelCache: new Map() };
  const graph = new PropertyGraph({ retriever });
  const city = addClassNode(graph, 'urn:City');
  const label = addDiscoveryPath(graph, city, [{ predicate: 'urn:label', direction: 'out', kind: 'literal' }]) as Literal;
  return { graph, city, label, execQuery };
}
describe('generic endpoint result search', () => {
  it('filters literal results on the server without adding persistent filters', async () => {
    const { city, label, execQuery } = fixture();
    const original = city.createQuery()!.toSparql();
    label.loadPreview({ varFilter: 'Berisso', limit: 10 });
    const query = execQuery.mock.calls[0][0];
    expect(query).toContain('CONTAINS(LCASE(STR(?cityLabel)), LCASE("Berisso"))');
    expect(query).toContain('LIMIT 10');
    expect(label.variable.filters).toEqual([]);
    expect(city.createQuery()!.toSparql()).toBe(original);
    label.loadPreview({ varFilter: '', limit: 10 });
    expect(execQuery.mock.calls[1][0]).not.toContain('CONTAINS');
    await Promise.resolve();
  });
  it('escapes arbitrary search text and treats regex metacharacters as text', async () => {
    const { label, execQuery } = fixture();
    const value = 'Berisso.*"\\\n\r\t\' $&';
    label.loadPreview({ varFilter: value });
    const query = execQuery.mock.calls[0][0];
    expect(query).toContain(String.raw`LCASE("Berisso.*\"\\\n\r\t\' $&")`);
    expect(query).not.toContain('Berisso.*"');
    expect(query).not.toContain('FILTER regex');
    await Promise.resolve();
  });
  it('searches resource and predicate labels with URI fallback', async () => {
    const { graph, city, execQuery } = fixture();
    city.loadPreview({ varFilter: 'berisso' });
    expect(execQuery.mock.calls[0][0]).toContain('STR(?city)');
    expect(execQuery.mock.calls[0][0]).toContain('STR(?cityLabel)');
    expect(execQuery.mock.calls[0][0]).toContain(' || ');
    const variableProperty = city.newProp();
    graph.addEdge(variableProperty, graph.addNode());
    variableProperty.loadPreview({ varFilter: 'city' });
    const query = execQuery.mock.calls[1][0];
    expect(query).toContain(`STR(${variableProperty.variable})`);
    expect(query).toContain('CONTAINS');
    await Promise.resolve();
  });
  it('ignores an obsolete response after its search is cancelled', async () => {
    const { label, execQuery } = fixture();
    const controller = new AbortController();
    execQuery.mockResolvedValueOnce({ results: { bindings: [{ [label.variable.getName()]: { type: 'literal', value: 'obsolete' } }] } });
    const callback = vi.fn();
    label.loadPreview({ varFilter: 'old', canceller: controller.signal, callback });
    controller.abort();
    await Promise.resolve();
    await Promise.resolve();
    expect(label.variable.results).toEqual([]);
    expect(callback).not.toHaveBeenCalled();
  });
});
