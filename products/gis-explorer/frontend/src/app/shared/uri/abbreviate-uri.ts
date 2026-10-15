/** Prefer the most specific configured namespace; otherwise show the local name. */
export function abbreviateUri(uri: string, prefixes: Record<string, string>): string {
  if (!uri) return '';
  const match = Object.entries(prefixes)
    .filter(([, namespace]) => namespace && uri.startsWith(namespace) && uri.length > namespace.length)
    .sort((a, b) => b[1].length - a[1].length)[0];
  if (match) return `${match[0]}:${uri.slice(match[1].length)}`;
  const trimmed = uri.replace(/[/#]+$/, '');
  const local = trimmed.slice(Math.max(trimmed.lastIndexOf('#'), trimmed.lastIndexOf('/'), trimmed.lastIndexOf(':')) + 1);
  return local || uri;
}
