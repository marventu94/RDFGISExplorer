import type { Prefix } from './services/app-config.service';

export function toCurie(uri: string, prefixes: readonly Prefix[]): [string, Prefix | null] {
  for (const p of prefixes) {
    if (uri.includes(p.uri)) {
      return [uri.replace(p.uri, p.prefix + ':'), p];
    }
  }
  return ['<' + uri + '>', null];
}

export function labelOf(
  uri: string,
  prefixes: readonly Prefix[],
  cache: ReadonlyMap<string, string>,
): string {
  const cached = cache.get(uri);
  if (cached !== undefined) {
    return cached;
  }
  return toCurie(uri, prefixes)[0];
}
