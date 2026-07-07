import {
  Component,
  ElementRef,
  inject,
  Injector,
  OnInit,
  OnDestroy,
  HostListener,
  DestroyRef,
  effect,
  runInInjectionContext,
} from '@angular/core';
import cytoscape from 'cytoscape';
import edgehandles from 'cytoscape-edgehandles';
import contextMenus from 'cytoscape-context-menus';

import { PropertyGraphService } from '../property-graph.service';
import { GraphInteractionService } from './interaction.service';
import { CYTOSCAPE_STYLES, CHILD_HEIGHT, CHILD_PADDING, NODE_TITLE_HEIGHT } from './canvas-graph.styles';
import { parseDropPayload } from './canvas-graph.drop';
import { buildContextMenuConfig } from './canvas-graph.context-menus';
import type { Node, Property, Edge, RDFResource } from '../domain';

cytoscape.use(edgehandles);
cytoscape.use(contextMenus);

/**
 * `<canvas-graph>` is the cytoscape.js-based visual canvas for the property graph.
 *
 * Visual structure:
 * - Each domain `Node` becomes a cytoscape compound (parent) node.
 * - Each `Property` becomes a child node inside its parent Node.
 * - Each `Literal` becomes a child node inside its parent Node, positioned
 *   below its parent Property. Literals are rendered as separate child nodes
 *   (not inline), matching the legacy SVG layout.
 * - Each domain `Edge` becomes a cytoscape edge from the Property's node
 *   to the target Node's compound node.
 *
 * This component owns ALL graph interactions (drag, drop, shift-click,
 * context menus, keyboard shortcuts). It does NOT import any tool panel
 * components. Tool routing is via `GraphInteractionService.requestedTool`.
 */
@Component({
  selector: 'canvas-graph',
  standalone: true,
  templateUrl: './canvas-graph.component.html',
  styleUrl: './canvas-graph.component.scss',
})
export class CanvasGraphComponent implements OnInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly graph = inject(PropertyGraphService);
  private readonly interaction = inject(GraphInteractionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  private cy!: cytoscape.Core;
  private ehApi: ReturnType<typeof cytoscape.prototype.edgehandles> | null = null;
  private cmApi: ReturnType<typeof cytoscape.prototype.contextMenus> | null = null;
  private cyFocused = false;
  private lastKeyDown = -1;
  private lastContextMenuPosition: cytoscape.Position = { x: 0, y: 0 };
  drawMode = false;

  ngOnInit(): void {
    const container = this.host.nativeElement.querySelector('.cy-container') as HTMLElement;
    this.cy = cytoscape({
      container,
      elements: this.computeElements(),
      style: CYTOSCAPE_STYLES,
      layout: { name: 'preset' },
      wheelSensitivity: 1.0,
      autoungrabify: false,
      autounselectify: false,
    });

    this.cy.on('viewport', () => {
      this.graph.viewport.set({
        zoom: this.cy.zoom(),
        pan: { ...this.cy.pan() },
      });
    });

    this.installPlugins();
    this.installInteractions();
    this.subscribeToGraphChanges();
  }

  ngOnDestroy(): void {
    this.ehApi?.destroy?.();
    this.cmApi?.destroy?.();
    this.cy?.destroy();
  }

  /* ------------------------------------------------------------------ */
  /*  Element conversion (domain → cytoscape)                            */
  /* ------------------------------------------------------------------ */

  private computeElements(): cytoscape.ElementDefinition[] {
    const nodes = this.graph.nodes();
    const edges = this.graph.edges();
    const elements: cytoscape.ElementDefinition[] = [];

    for (const node of nodes) {
      const block = CHILD_HEIGHT + CHILD_PADDING;
      const totalChildren = node.properties.reduce(
        (n, p) => n + 1 + (p.literal ? 1 : 0),
        0,
      );
      // Layout the children block so the compound (title + children + padding)
      // is roughly centered on (node.x, node.y). When there are no children the
      // initial childY is unused — the :childless style handles that case.
      const childrenBlockHeight =
        totalChildren > 0
          ? totalChildren * CHILD_HEIGHT + (totalChildren - 1) * CHILD_PADDING
          : 0;
      const compoundHeight = NODE_TITLE_HEIGHT + childrenBlockHeight + CHILD_PADDING;
      let childY = -compoundHeight / 2 + NODE_TITLE_HEIGHT + CHILD_HEIGHT / 2;

      elements.push({
        group: 'nodes',
        data: {
          id: `n${node.id}`,
          kind: 'node',
          color: node.isVariable() ? '#2ca02c' : '#1f77b4',
          label: this.nodeLabel(node),
          domain: node,
        },
        position: { x: node.x, y: node.y },
        classes: 'cy-node',
      });

      if (totalChildren > 0) {
        elements.push({
          group: 'nodes',
          data: { id: `t${node.id}`, parent: `n${node.id}`, kind: 'title-spacer' },
          position: { x: 0, y: -compoundHeight / 2 + NODE_TITLE_HEIGHT / 2 },
          classes: 'cy-spacer',
        });
      }

      for (const prop of node.properties) {
        const propColor = prop.isLiteral()
          ? '#9467bd'
          : prop.isVariable()
            ? '#d62728'
            : '#ff7f0e';

        elements.push({
          group: 'nodes',
          data: {
            id: `p${prop.id}`,
            parent: `n${node.id}`,
            kind: 'property',
            color: propColor,
            label: this.resourceLabel(prop),
            domain: prop,
          },
          position: { x: 0, y: childY },
          classes: 'cy-prop',
        });
        childY += block;

        if (prop.literal) {
          elements.push({
            group: 'nodes',
            data: {
              id: `l${prop.id}`,
              parent: `n${node.id}`,
              kind: 'literal',
              color: '#9467bd',
              label: this.resourceLabel(prop.literal),
              domain: prop.literal,
            },
            position: { x: 0, y: childY },
            classes: 'cy-lit',
          });
          childY += block;
        }
      }
    }

    for (const edge of edges) {
      elements.push({
        group: 'edges',
        data: {
          id: `e${edge.source.id}-${edge.target.id}`,
          source: `p${edge.source.id}`,
          target: `n${edge.target.id}`,
          kind: 'edge',
          domain: edge,
        },
        classes: 'cy-edge',
      });
    }

    return elements;
  }

  private nodeLabel(node: Node): string {
    return node.getRepr() ?? 'No values set!';
  }

  private resourceLabel(r: RDFResource): string {
    return (r as any).getRepr?.() ?? 'No values set!';
  }

  /* ------------------------------------------------------------------ */
  /*  Reactivity — diff-based cytoscape update                           */
  /* ------------------------------------------------------------------ */

  private subscribeToGraphChanges(): void {
    const fx = runInInjectionContext(this.injector, () =>
      effect(() => {
        this.graph.revision();
        this.syncCytoscape();
      })
    );
    this.destroyRef.onDestroy(() => fx.destroy());
  }

  private syncCytoscape(): void {
    const desired = this.computeElements();
    const desiredIds = new Set<string>(desired.map(e => e.data.id as string));

    this.cy.batch(() => {
      const existing = this.cy.elements();
      const toRemove = existing.filter(el => !desiredIds.has(el.id()));

      toRemove.edges().remove();

      const removeNodes = toRemove.nodes();
      const children = removeNodes.filter(n => n.isChild());
      const parents = removeNodes.filter(n => !n.isChild());
      children.remove();
      parents.remove();

      for (const elDef of desired) {
        const id = elDef.data.id as string;
        const el = this.cy.getElementById(id);

        if (el.nonempty() && el.length === 1) {
          el.data(elDef.data as cytoscape.ElementDataDefinition);
          // Child positions in computeElements are relative to parent center.
          // After init, el.position() uses absolute coords — so we must convert.
          // We must also re-apply on every sync because adding/removing siblings
          // changes compoundHeight and therefore every child's relative offset.
          // Parent nodes (kind="node") are NOT repositioned here — dragfree keeps
          // domain.x/y in sync with Cytoscape so there is nothing to correct.
          if (el.isNode() && el.isChild()) {
            const parentId = (elDef.data as any).parent as string | undefined;
            if (parentId) {
              const parentEl = this.cy.getElementById(parentId);
              const parentDomain = parentEl.nonempty()
                ? (parentEl.data('domain') as Node | undefined)
                : undefined;
              if (parentDomain && (elDef as any).position) {
                const rel: cytoscape.Position = (elDef as any).position;
                el.position({ x: parentDomain.x + rel.x, y: parentDomain.y + rel.y });
              }
            }
          }
        } else {
          const isEdge = !!(elDef.data as any).source;
          if (isEdge) {
            this.cy.add({
              group: 'edges',
              data: elDef.data as cytoscape.EdgeDataDefinition,
              classes: elDef.classes,
            });
          } else {
            const nodeData = elDef.data as cytoscape.NodeDataDefinition;
            let pos: cytoscape.Position = (elDef as any).position ?? { x: 0, y: 0 };
            const parentId = nodeData.parent as string | undefined;
            if (parentId) {
              // computeElements gives children relative positions {x:0, y:childY}.
              // cy.add() requires absolute graph coords, so add the parent's
              // domain-stored center (updated on every drag via dragfree).
              const parentEl = this.cy.getElementById(parentId);
              const parentDomain = parentEl.nonempty()
                ? (parentEl.data('domain') as Node | undefined)
                : undefined;
              if (parentDomain) {
                pos = { x: parentDomain.x + pos.x, y: parentDomain.y + pos.y };
              }
            }
            this.cy.add({
              group: 'nodes',
              data: nodeData,
              position: pos,
              classes: elDef.classes,
            });
          }
        }
      }
    });

    this.cy.nodes('[kind = "property"], [kind = "literal"], [kind = "title-spacer"]').ungrabify();
    this.applySavedViewport();
    this.syncSelectionHighlight();
  }

  private applySavedViewport(): void {
    const vp = this.graph.viewport();
    if (!vp) return;
    const cyZoom = this.cy.zoom();
    const cyPan = this.cy.pan();
    if (Math.abs(cyZoom - vp.zoom) > 0.01 ||
        Math.abs(cyPan.x - vp.pan.x) > 1 ||
        Math.abs(cyPan.y - vp.pan.y) > 1) {
      this.cy.viewport({ zoom: vp.zoom, pan: vp.pan });
    }
  }

  private syncSelectionHighlight(): void {
    const selected = this.graph.selected();
    this.cy.elements().unselect();
    if (!selected) return;

    let cyId: string | null = null;
    if ((selected as any).isNode?.()) {
      cyId = `n${(selected as Node).id}`;
    } else if ((selected as any).isProperty?.() && !(selected as any).isLiteral?.()) {
      cyId = `p${(selected as Property).id}`;
    } else if ((selected as any).isLiteral?.()) {
      const lit = selected as unknown as { parent: { id: string | number } };
      cyId = `l${lit.parent.id}`;
    }

    if (cyId) {
      const el = this.cy.getElementById(cyId);
      if (el.nonempty()) el.select();
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Plugins                                                            */
  /* ------------------------------------------------------------------ */

  private installPlugins(): void {
    // cytoscape-edgehandles v4: no hover handle — draw mode makes the whole
    // node body the handle. Options handleNodes/handlePosition/complete are v3
    // only and are ignored in v4; edge creation is now an event (ehcomplete).
    this.ehApi = (this.cy as any).edgehandles({
      canConnect: (sourceNode: cytoscape.NodeSingular, targetNode: cytoscape.NodeSingular) =>
        sourceNode.data('kind') === 'node'
        && targetNode.data('kind') === 'node'
        && !sourceNode.same(targetNode),
      snap: false,
      hoverDelay: 150,
      noEdgeEventsInDraw: true,
      disableBrowserGestures: true,
    });

    this.cy.on('ehcomplete', (_evt: unknown, sourceNode: cytoscape.NodeSingular, targetNode: cytoscape.NodeSingular) => {
      const srcDomain = sourceNode.data('domain') as Node | undefined;
      const tgtDomain = targetNode.data('domain') as Node | undefined;
      if (srcDomain && tgtDomain) {
        this.graph.addEdge(srcDomain, tgtDomain);
      }
    });

    this.cmApi = (this.cy as any).contextMenus({
      menuItems: buildContextMenuConfig({
        onCreateNode: () => this.handleNewVariable(),
        onDescribe: (r: unknown) => this.requestTool('describe', r as RDFResource),
        onEdit: (r: unknown) => this.requestTool('edit', r as RDFResource),
        onCopyUri: (r: unknown) => this.copyUri(r as RDFResource),
        onRemove: (r: unknown) => this.removeResource(r as RDFResource),
        onNewPropertyFromNode: (r: unknown) => this.handleNewPropertyFromNode(r as Node),
        onNewLiteral: (r: unknown) => this.handleNewLiteral(r as Node),
      }).menuItems as any,
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Interaction handlers                                               */
  /* ------------------------------------------------------------------ */

  private installInteractions(): void {
    this.cy.on('mouseover', () => { this.cyFocused = true; });
    this.cy.on('mouseout', () => { this.cyFocused = false; });

    this.cy.on('tap', (evt) => {
      if (evt.target === this.cy && (evt.originalEvent as MouseEvent)?.shiftKey) {
        this.handleShiftClickCanvas(evt.position);
        return;
      }

      const target = evt.target;
      if (target !== this.cy) {
        const domain = target.data('domain') as RDFResource | undefined;
        if (domain) {
          this.graph.setSelected(domain);
          if (domain.isVariable()) {
            this.requestTool('edit', domain);
          }
        }
      }
    });

    this.cy.on('dragfree', 'node[kind = "node"]', (evt) => {
      const domain = evt.target.data('domain') as Node;
      if (domain) {
        const pos = evt.target.position();
        domain.x = pos.x;
        domain.y = pos.y;
      }
    });

    const container = this.host.nativeElement.querySelector('.cy-container') as HTMLElement;
    container.addEventListener('dragover', (ev: DragEvent) => {
      ev.preventDefault();
    });
    container.addEventListener('drop', (ev: DragEvent) => {
      this.handleDrop(ev);
    });

    this.cy.on('cxttap', (evt) => {
      if (evt.target === this.cy) {
        this.lastContextMenuPosition = evt.position;
      }
      const target = evt.target;
      if (target !== this.cy) {
        const domain = target.data('domain') as RDFResource | undefined;
        if (domain) {
          this.graph.setSelected(domain);
        }
      }
    });
  }

  /* --- Context menu handlers --- */

  private handleNewVariable(): void {
    const pos = this.lastContextGraphPosition();
    const node = this.graph.addNode();
    node.x = pos.x;
    node.y = pos.y;
    node.mkVariable();
    this.graph.setSelected(node);
  }

  private handleNewPropertyFromEmpty(): void {
    const sel = this.graph.selected();
    if (!sel || !(sel as any).isNode?.()) return;
    const pos = this.lastContextGraphPosition();
    const newNode = this.graph.addNode();
    newNode.x = pos.x;
    newNode.y = pos.y;
    this.graph.addEdge(sel as Node, newNode);
  }

  private handleNewPropertyFromNode(node: Node): void {
    const newNode = this.graph.addNode();
    newNode.x = node.x + 360;
    newNode.y = node.y + 70;
    this.graph.addEdge(node, newNode);
  }

  private handleNewLiteral(node: Node): void {
    const prop = node.newProp();
    prop.mkLiteral();
    this.graph.setSelected(prop);
  }

  private handleShiftClickCanvas(position: cytoscape.Position): void {
    const node = this.graph.addNode();
    node.x = position.x;
    node.y = position.y;
    node.mkVariable();
    this.graph.setSelected(node);
  }

  private handleDrop(ev: DragEvent): void {
    ev.preventDefault();
    const payload = parseDropPayload(ev.dataTransfer!);
    if (!payload) return;

    const pan = this.cy.pan();
    const zoom = this.cy.zoom();
    const container = this.host.nativeElement.querySelector('.cy-container') as HTMLElement;
    const rect = container.getBoundingClientRect();
    let at = {
      x: (ev.clientX - rect.left - pan.x) / zoom,
      y: (ev.clientY - rect.top - pan.y) / zoom,
    };

    // If dropped on a compound node, select it and place the target node to its right
    const nodeUnder = this.cy.nodes('[kind="node"]').filter(n => {
      const bb = n.boundingBox({});
      return at.x >= bb.x1 && at.x <= bb.x2 && at.y >= bb.y1 && at.y <= bb.y2;
    }).first();

    if (nodeUnder.nonempty()) {
      const domain = nodeUnder.data('domain') as RDFResource | undefined;
      if (domain) this.graph.setSelected(domain);
      const bb = nodeUnder.boundingBox({});
      at = { x: bb.x2 + 200, y: (bb.y1 + bb.y2) / 2 };
    }

    this.graph.applyDrop(payload, at);
  }

  private lastContextGraphPosition(): { x: number; y: number } {
    return { ...this.lastContextMenuPosition };
  }

  private requestTool(tool: 'describe' | 'edit', target: RDFResource): void {
    this.interaction.requestedTool.set({ tool, target });
  }

  private async copyUri(resource: RDFResource): Promise<void> {
    const uri = (resource as any).getUri?.() ?? null;
    if (uri) {
      try {
        await navigator.clipboard.writeText(uri);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = uri;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
    }
  }

  private removeResource(resource: RDFResource): void {
    if ((resource as any).isNode?.()) {
      this.graph.removeNode(resource as Node);
    } else if ((resource as any).isProperty?.() && !(resource as any).isLiteral?.()) {
      (resource as Property).delete();
      this.graph.refresh();
    } else if ((resource as any).isLiteral?.()) {
      (resource as any).delete?.();
      this.graph.refresh();
    } else {
      this.graph.removeEdge(resource as unknown as Edge);
    }
  }

  /* --- Keyboard --- */

  setDrawMode(enabled: boolean): void {
    if (!this.ehApi) return;
    if (enabled) {
      (this.ehApi as any).enableDrawMode();
    } else {
      (this.ehApi as any).disableDrawMode();
    }
    this.drawMode = enabled;
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(evt: KeyboardEvent): void {
    if (!this.cyFocused) return;
    if (this.lastKeyDown === evt.keyCode) return;
    this.lastKeyDown = evt.keyCode;

    if (evt.key === 'Control') {
      this.setDrawMode(true);
      return;
    }

    if (evt.key === 'Delete' || evt.key === 'Backspace') {
      evt.preventDefault();
      this.handleDeleteKey();
    }
  }

  @HostListener('document:keyup', ['$event'])
  onKeyUp(evt: KeyboardEvent): void {
    this.lastKeyDown = -1;
    if (evt.key === 'Control') {
      this.setDrawMode(false);
    }
  }

  private handleDeleteKey(): void {
    const selected = this.graph.selected();
    if (!selected) return;

    if ((selected as any).isNode?.()) {
      this.graph.removeNode(selected as Node);
    } else if ((selected as any).isProperty?.() && !(selected as any).isLiteral?.()) {
      (selected as Property).delete();
      this.graph.refresh();
    } else if ((selected as any).isLiteral?.()) {
      (selected as any).delete?.();
      this.graph.refresh();
    } else {
      this.graph.removeEdge(selected as unknown as Edge);
    }
  }
}
