import { describe, expect, it } from 'vitest';
import { buildEntityContext, resolveEntityContext, resolveEntityFocus } from './entity-context';
import { c1Fixture } from './testing/c1-fixture';

describe('C1 entity coordination', () => {
  it('resolves map, date and unprojected blank node to the directed root regardless of SELECT order', () => {
    const result = c1Fixture();
    const index = buildEntityContext(result);
    for (const id of ['geometry-a', 'date-a', '_:site-a', 'estate-a']) {
      const context = resolveEntityContext(index, id);
      expect(context.primaryUri).toBe('listing-a');
      expect(context.relatedUris.has('geometry-a')).toBe(true);
      expect(context.relatedUris.has('listing-b')).toBe(false);
    }
  });

  it('never expands a shared city or source into arbitrary houses', () => {
    const index = buildEntityContext(c1Fixture());
    expect([...resolveEntityFocus(index, ['city'])]).toEqual(['city']);
    expect([...resolveEntityFocus(index, ['origin'])]).toEqual(['origin']);
  });

  it('resolves a shared resource when an exact row supplies its context', () => {
    const result = c1Fixture();
    expect(resolveEntityContext(buildEntityContext(result), 'city', result.bindings[1]).primaryUri).toBe('listing-b');
  });

  it('honors an explicit primary variable for an ambiguous query', () => {
    const result = c1Fixture();
    const index = buildEntityContext(result, 'estate');
    expect(resolveEntityContext(index, 'geometry-a').primaryUri).toBe('estate-a');
  });

  it('retains every occurrence rather than truncating an object at 50 rows', () => {
    const result = c1Fixture();
    for (let i = 0; i < 60; i++) {
      const id = `address-extra-${i}`;
      result.nodes.push({ uri: id, label: id, attributes: {} });
      result.edges.push({ id, source: 'estate-a', target: id, predicate: 'urn:address' });
      result.bindings.push({ ...result.bindings[0], address: { type: 'uri', value: id } });
    }
    expect(resolveEntityContext(buildEntityContext(result), 'geometry-a').relatedUris.has('address-extra-59')).toBe(true);
  });

  it('keeps a flat Wikidata entity selectable without structural edges', () => {
    const result = c1Fixture();
    result.edges = [];
    result.bindings = [{ item: { type: 'uri', value: 'listing-a' } }];
    expect(resolveEntityContext(buildEntityContext(result), 'listing-a').primaryUri).toBe('listing-a');
  });
});
