import { canvasStyles } from './canvas-graph.styles';

describe('canvasStyles', () => {
  const cssForNode = (dark: boolean): Record<string, unknown> =>
    canvasStyles(dark).find((rule) => rule.selector === 'node[kind = "node"]')
      ?.css as unknown as Record<string, unknown>;

  const cssForFilter = (dark: boolean): Record<string, unknown> =>
    canvasStyles(dark).find((rule) => rule.selector === 'node[kind = "filter"]')
      ?.css as unknown as Record<string, unknown>;

  it('separates canvas, node and row layers in light mode', () => {
    const css = cssForNode(false);
    expect(css['background-color']).toBe('#f3f1ee');
    expect(css['color']).toBe('#333');
    const property = canvasStyles(false).find((rule) => rule.selector === 'node[kind = "property"]')
      ?.css as unknown as Record<string, unknown>;
    expect(property['background-color']).toBe('#ffffff');
  });

  it('darkens low-contrast domain borders in light mode only', () => {
    const border = (dark: boolean, color: string): unknown => {
      const value = cssForNode(dark)['border-color'];
      return typeof value === 'function' ? value({ data: () => color }) : value;
    };
    expect(border(false, '#ff7f0e')).toBe('#b85a00');
    expect(border(false, '#2ca02c')).toBe('#238823');
    expect(border(false, '#1f77b4')).toBe('#1f77b4');
    expect(border(true, '#ff7f0e')).toBe('data(color)');
  });

  it('returns high-contrast canvas colors in dark mode', () => {
    const css = cssForNode(true);
    expect(css['background-color']).toBe('#35322e');
    expect(css['color']).toBe('#e8e2dc');
  });

  it('gives filter rows a readable accent in both themes', () => {
    expect(cssForFilter(false)['background-color']).toBe('#fff4dc');
    expect(cssForFilter(false)['border-color']).toBe('#9a6a1c');
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
