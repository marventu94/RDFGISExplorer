import { canvasStyles } from './canvas-graph.styles';

describe('canvasStyles', () => {
  const cssForNode = (dark: boolean): Record<string, unknown> =>
    canvasStyles(dark).find((rule) => rule.selector === 'node[kind = "node"]')
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
});
