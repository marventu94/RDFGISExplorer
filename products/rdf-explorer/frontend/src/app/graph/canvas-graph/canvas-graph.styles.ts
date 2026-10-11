import cytoscape from 'cytoscape';

export const CHILD_HEIGHT = 28;
export const CHILD_PADDING = 8;
export const FILTER_HEIGHT = 22;
export const NODE_WIDTH = 220;
export const PROP_WIDTH = 200;
export const FILTER_WIDTH = 184;

// Height of a node that has no properties — just enough room for the title.
export const NODE_EMPTY_HEIGHT = 44;

// Vertical space reserved above the children for the title when the node
// has properties. Used both in styles (padding-top) and in the child-Y math.
export const NODE_TITLE_HEIGHT = 36;

// Back-compat aliases — kept so the layout math in canvas-graph.component.ts
// keeps building without churn.
export const NODE_BASE_HEIGHT = NODE_EMPTY_HEIGHT;
export const NODE_HEIGHT = NODE_EMPTY_HEIGHT;

interface CanvasPalette {
  nodeBg: string;
  propertyBg: string;
  literalBg: string;
  text: string;
  edge: string;
  filterBg: string;
  filterBorder: string;
  filterText: string;
  /** Element border: its domain color, optionally remapped for contrast. */
  border: string | ((ele: cytoscape.NodeSingular) => string);
}

/**
 * Light mode mirrors the dark layering: grey containers on the white canvas with
 * white rows inside. Domain hues that fall under 3:1 on white are darkened in the
 * same hue so the variable/constant/property coding keeps its meaning.
 */
const LIGHT_BORDER_COLORS: Readonly<Record<string, string>> = {
  '#2ca02c': '#238823',
  '#ff7f0e': '#b85a00',
};

const LIGHT_PALETTE: CanvasPalette = {
  nodeBg: '#f3f1ee',
  propertyBg: '#ffffff',
  literalBg: '#ffffff',
  text: '#333',
  edge: '#333',
  filterBg: '#fff4dc',
  filterBorder: '#9a6a1c',
  filterText: '#684712',
  border: (ele) => {
    const color = String(ele.data('color'));
    return LIGHT_BORDER_COLORS[color] ?? color;
  },
};

const DARK_PALETTE: CanvasPalette = {
  nodeBg: '#35322e',
  propertyBg: '#292724',
  literalBg: '#242321',
  text: '#e8e2dc',
  edge: '#e8e2dc',
  filterBg: '#463a28',
  filterBorder: '#d5a24f',
  filterText: '#f1d49b',
  border: 'data(color)',
};

function buildStyles(p: CanvasPalette): cytoscape.StylesheetCSS[] {
  return [
    // Shared visual base for every "node"-kind element (leaf or compound).
    {
      selector: 'node[kind = "node"]',
      css: {
        'shape': 'round-rectangle',
        'background-color': p.nodeBg,
        'background-opacity': 1,
        'border-width': 2,
        'border-color': p.border,
        'label': 'data(label)',
        'text-halign': 'center',
        'font-size': '13px',
        'font-weight': 'bold',
        'color': p.text,
        'text-wrap': 'ellipsis',
        'text-max-width': `${NODE_WIDTH - 20}px`,
        'compound-sizing-wrt-labels': 'include',
      } as cytoscape.Css.Node,
    },
    // Empty node (no properties): compact box with the title centered inside.
    {
      selector: 'node[kind = "node"]:childless',
      css: {
        'width': NODE_WIDTH,
        'height': NODE_EMPTY_HEIGHT,
        'text-valign': 'center',
        'padding': '0px',
      } as cytoscape.Css.Node,
    },
    // Compound node (has at least one property): auto-sizes to fit its
    // children. The title sits inside the top area reserved by the title-spacer
    // child (cytoscape does not support directional padding, so we use a
    // transparent spacer node instead of padding-top).
    {
      selector: 'node[kind = "node"]:parent',
      css: {
        'text-valign': 'top',
        'text-margin-y': NODE_TITLE_HEIGHT / 2,
        'padding': `${CHILD_PADDING}px`,
        'min-width': `${NODE_WIDTH}px`,
      } as cytoscape.Css.Node,
    },
    // Invisible spacer that reserves vertical space for the node title inside
    // compound nodes. Cytoscape only supports uniform padding, so this child
    // node pushes the compound's bounding box up to cover the title area.
    {
      selector: 'node[kind = "title-spacer"]',
      css: {
        'background-opacity': 0,
        'border-width': 0,
        'label': '',
        'width': NODE_WIDTH - 2 * CHILD_PADDING,
        'height': NODE_TITLE_HEIGHT,
        'padding': '0px',
        'events': 'no',
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node[kind = "node"]:selected',
      css: {
        'overlay-color': '#51cbee',
        'overlay-opacity': 0.3,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node[kind = "node"]:active',
      css: {
        'overlay-color': '#51cbee',
        'overlay-opacity': 0.2,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node[kind = "property"]',
      css: {
        'shape': 'round-rectangle',
        'background-color': p.propertyBg,
        'background-opacity': 1,
        'border-width': 1,
        'border-color': p.border,
        'label': 'data(label)',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '11px',
        'color': p.text,
        'width': PROP_WIDTH,
        'height': CHILD_HEIGHT,
        'padding': '4px 8px',
        'text-wrap': 'ellipsis',
        'text-max-width': `${PROP_WIDTH - 20}px`,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node[kind = "property"]:selected',
      css: {
        'overlay-color': '#51cbee',
        'overlay-opacity': 0.3,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node[kind = "property"]:active',
      css: {
        'overlay-color': '#51cbee',
        'overlay-opacity': 0.2,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node[kind = "literal"]',
      css: {
        'shape': 'round-rectangle',
        'background-color': p.literalBg,
        'background-opacity': 1,
        'border-width': 1,
        'border-color': p.border,
        'label': 'data(label)',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '11px',
        'color': p.text,
        'width': PROP_WIDTH,
        'height': CHILD_HEIGHT,
        'padding': '4px 8px',
        'text-wrap': 'ellipsis',
        'text-max-width': `${PROP_WIDTH - 20}px`,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node[kind = "literal"]:selected',
      css: {
        'overlay-color': '#51cbee',
        'overlay-opacity': 0.3,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node[kind = "literal"]:active',
      css: {
        'overlay-color': '#51cbee',
        'overlay-opacity': 0.2,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node[kind = "filter"]',
      css: {
        'shape': 'round-rectangle',
        'background-color': p.filterBg,
        'background-opacity': 1,
        'border-width': 1,
        'border-color': p.filterBorder,
        'label': 'data(label)',
        'text-valign': 'center',
        // In Cytoscape, `left` places the whole label to the left of the node;
        // it is not CSS-like text alignment inside the node. Keep the label and
        // capsule on the same centre and let text-max-width ellipsize long rows.
        'text-halign': 'center',
        'text-margin-x': 0,
        'text-margin-y': 0,
        'font-size': '10px',
        'font-weight': 'normal',
        'color': p.filterText,
        'width': FILTER_WIDTH,
        'height': FILTER_HEIGHT,
        'padding': '2px 6px',
        'text-wrap': 'ellipsis',
        'text-max-width': `${FILTER_WIDTH - 18}px`,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node[kind = "filter"]:selected',
      css: {
        'overlay-color': p.filterBorder,
        'overlay-opacity': 0.22,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'edge',
      css: {
        // Draw the entire connection above compound children so its property origin stays visible.
        'z-compound-depth': 'top',
        'z-index-compare': 'manual',
        'z-index': 10,
        'width': 3,
        'line-color': p.edge,
        'target-arrow-color': p.edge,
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
      } as cytoscape.Css.Edge,
    },
    {
      selector: 'edge:selected',
      css: {
        'overlay-color': '#51cbee',
        'overlay-opacity': 0.3,
        'width': 4,
      } as cytoscape.Css.Edge,
    },
    {
      selector: ':parent',
      css: {
        'border-opacity': 1,
      } as cytoscape.Css.Node,
    },
  ];
}

const LIGHT_STYLES = buildStyles(LIGHT_PALETTE);
const DARK_STYLES = buildStyles(DARK_PALETTE);

/** Cytoscape resolves colors onto canvas, so CSS variables cannot be used directly. */
export function canvasStyles(dark: boolean): cytoscape.StylesheetCSS[] {
  return dark ? DARK_STYLES : LIGHT_STYLES;
}
