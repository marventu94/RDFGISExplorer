export const ENTITY_TYPE_COLORS: Record<string, string> = {
  'http://www.wikidata.org/entity/Q515': '#2196F3',
  'http://www.wikidata.org/entity/Q5': '#9C27B0',
  'http://www.wikidata.org/entity/Q4022': '#03A9F4',
  'http://www.wikidata.org/entity/Q33506': '#FF9800',
  'http://www.wikidata.org/entity/Q3918': '#4CAF50',
  'http://www.wikidata.org/entity/Q207313': '#E91E63',
  default: '#607D8B',
};

export function colorForType(type: string | undefined): string {
  if (!type) return ENTITY_TYPE_COLORS['default'];
  return ENTITY_TYPE_COLORS[type] ?? ENTITY_TYPE_COLORS['default'];
}
