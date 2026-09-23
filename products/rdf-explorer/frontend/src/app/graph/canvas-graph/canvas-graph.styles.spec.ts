import { canvasStyles } from './canvas-graph.styles';

describe('canvasStyles', () => {
  const cssForNode = (dark: boolean): Record<string, unknown> =>
    canvasStyles(dark).find((rule) => rule.selector === 'node[kind = "node"]')
      ?.css as unknown as Record<string, unknown>;

  const cssForFilter = (dark: boolean): Record<string, unknown> =>
    canvasStyles(dark).find((rule) => rule.selector === 'node[kind = "filter"]')
      ?.css as unknown as Record<string, unknown>;

  it('keeps the light Cytoscape palette in light mode', () => {
    const css = cssForNode(false);
    expect(css['background-color']).toBe('#f8f8f8');
    expect(css['color']).toBe('#333');
  });

  it('returns high-contrast canvas colors in dark mode', () => {
    const css = cssForNode(true);
    expect(css['background-color']).toBe('#35322e');
    expect(css['color']).toBe('#e8e2dc');
  });

  it('gives filter rows a readable accent in both themes', () => {
    expect(cssForFilter(false)['background-color']).toBe('#fff4dc');
    expect(cssForFilter(false)['color']).toBe('#684712');
    expect(cssForFilter(true)['background-color']).toBe('#463a28');
    expect(cssForFilter(true)['color']).toBe('#f1d49b');
  });

  it('centres the filter label in the same box without a visual offset', () => {
    for (const dark of [false, true]) {
      const css = cssForFilter(dark);

      expect(css['text-halign']).toBe('center');
      expect(css['text-valign']).toBe('center');
      expect(css['text-margin-x']).toBe(0);
      expect(css['text-margin-y']).toBe(0);
      expect(css['label']).toBe('data(label)');
      expect(css['text-wrap']).toBe('ellipsis');
    }
  });
});
