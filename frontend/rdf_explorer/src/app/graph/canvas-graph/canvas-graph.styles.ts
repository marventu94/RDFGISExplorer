import cytoscape from 'cytoscape';

export const CHILD_HEIGHT = 28;
export const CHILD_PADDING = 8;
export const NODE_WIDTH = 220;
export const PROP_WIDTH = 200;

// Height of a node that has no properties — just enough room for the title.
export const NODE_EMPTY_HEIGHT = 44;

// Vertical space reserved above the children for the title when the node
// has properties. Used both in styles (padding-top) and in the child-Y math.
export const NODE_TITLE_HEIGHT = 36;

// Back-compat aliases — kept so the layout math in canvas-graph.component.ts
// keeps building without churn.
export const NODE_BASE_HEIGHT = NODE_EMPTY_HEIGHT;
export const NODE_HEIGHT = NODE_EMPTY_HEIGHT;

export const CYTOSCAPE_STYLES: cytoscape.StylesheetCSS[] = [
  // Shared visual base for every "node"-kind element (leaf or compound).
  {
    selector: 'node[kind = "node"]',
    css: {
      'shape': 'round-rectangle',
      'background-color': '#f8f8f8',
      'background-opacity': 1,
      'border-width': 2,
      'border-color': 'data(color)',
      'label': 'data(label)',
      'text-halign': 'center',
      'font-size': '13px',
      'font-weight': 'bold',
      'color': '#333',
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
      'background-color': '#f3f3f3',
      'background-opacity': 1,
      'border-width': 1,
      'border-color': 'data(color)',
      'label': 'data(label)',
      'text-valign': 'center',
      'text-halign': 'center',
      'font-size': '11px',
      'color': '#333',
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
      'background-color': '#f0f0f0',
      'background-opacity': 1,
      'border-width': 1,
      'border-color': '#9467bd',
      'label': 'data(label)',
      'text-valign': 'center',
      'text-halign': 'center',
      'font-size': '11px',
      'color': '#333',
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
    selector: 'edge',
    css: {
      'width': 3,
      'line-color': '#333',
      'target-arrow-color': '#333',
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
