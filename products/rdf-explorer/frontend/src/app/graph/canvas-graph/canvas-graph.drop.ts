import type { DropPayload } from '../domain';

export function parseDropPayload(dt: DataTransfer): DropPayload | null {
  const uri = dt.getData('uri');
  const prop = dt.getData('prop');
  const special = dt.getData('special');
  const alias = dt.getData('alias');
  const type = dt.getData('type');

  if (special === 'example' && type) return { kind: 'example', exampleType: type as 'cats' | 'w3c' | 'mosquito' | 'cancer' };
  if (special === 'connection') {
    const token = dt.getData('connection');
    return token ? { kind: 'connection', token } : null;
  }
  if (special === 'class' && uri) return { kind: 'class', uri };
  if (special === 'search' && uri) return { kind: 'search', uri, alias };
  if (special === 'literal' && prop) return { kind: 'literal', prop };
  if (uri && prop) return { kind: 'uri+prop', uri, prop };
  if (prop) return { kind: 'prop', prop };
  if (uri) return { kind: 'uri', uri };
  return null;
}
