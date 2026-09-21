/**
 * Reacomoda las POSICIONES de los workspaces del RDF Explorer guardados en
 * SQLite. Herramienta de datos: no cambia nada de la app.
 *
 * Por qué: los tableros demo del OVS no se armaron desde la herramienta, se
 * generaron con una grilla fija (dX 340 / dY 65-130) que ignora el alto real
 * de cada nodo. Un nodo con 4 propiedades mide 188px de alto, así que a 130px
 * de distancia se pisa con el de abajo — de ahí que aparezcan uno encima de
 * otro y que sea imposible manotear el que está tapado. Además guardaban
 * `viewport: {zoom: 1, pan: {0,0}}` con nodos en Y negativo, así que la mitad
 * del grafo arrancaba fuera de la pantalla.
 *
 * Qué hace: recalcula x/y con un layout por capas que usa la geometría real
 * de los nodos (título + propiedades + padding, igual que la hoja de estilos
 * de Cytoscape), deja el grafo entero en coordenadas positivas y guarda un
 * viewport que lo encuadra. No toca nodos, aristas, filtros ni la query: el
 * resultado es el mismo grafo, ordenado como lo dejaría un usuario.
 *
 * Uso (desde products/shell/backend/):
 *   DASHBOARDS_SQLITE_PATH=./data/ovs-escenarios.sqlite \
 *     node_modules/.bin/ts-node --transpile-only scripts/relayout-explorer-workspaces.ts --dry-run
 *   ... sin --dry-run escribe (hace backup del .sqlite antes)
 *   ... --id exp-e01   reacomoda un solo tablero
 */

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Geometría de un nodo del canvas.
// Espejo de products/rdf-explorer/frontend/src/app/graph/canvas-graph/canvas-graph.styles.ts
// (CHILD_HEIGHT, CHILD_PADDING, NODE_WIDTH, PROP_WIDTH, NODE_EMPTY_HEIGHT,
// NODE_TITLE_HEIGHT). Si esos estilos cambian, actualizar acá.
// ---------------------------------------------------------------------------

const CHILD_HEIGHT = 28;
const CHILD_PADDING = 8;
const NODE_WIDTH = 220;
const PROP_WIDTH = 200;
const NODE_EMPTY_HEIGHT = 44;
const NODE_TITLE_HEIGHT = 36;

/** Alto del nodo dibujado: título + hijos + padding del compuesto. */
function nodeHeight(childCount: number): number {
  if (childCount <= 0) return NODE_EMPTY_HEIGHT;
  const children = childCount * CHILD_HEIGHT + (childCount - 1) * CHILD_PADDING;
  return NODE_TITLE_HEIGHT + children + 2 * CHILD_PADDING;
}

/** Ancho del nodo dibujado. */
function nodeWidth(childCount: number): number {
  if (childCount <= 0) return NODE_WIDTH;
  return Math.max(PROP_WIDTH, NODE_WIDTH) + 2 * CHILD_PADDING;
}

// ---------------------------------------------------------------------------
// Layout por capas
// ---------------------------------------------------------------------------

const GAP_X = 100;
const GAP_Y = 40;
const MARGIN = 60;
/** Separación entre sub-columnas de una misma capa. */
const GAP_SUBCOLUMN = 48;
/**
 * Alto máximo de una columna antes de partirla en sub-columnas. Una capa con
 * muchos nodos (o con uno muy alto) apilada entera deja el grafo tan largo que
 * hay que verlo al 30% de zoom; partirla es lo que hace cualquiera a mano.
 */
const MAX_COLUMN_HEIGHT = 900;

/** Canvas de referencia para el viewport guardado (pane del grafo). */
const CANVAS_W = 1000;
const CANVAS_H = 640;

interface LayoutNode {
  id: string;
  childCount: number;
  y: number;
}

interface LayoutEdge {
  source: string;
  target: string;
}

interface Position {
  x: number;
  y: number;
}

/**
 * Capas por camino más largo desde las raíces (nodos sin aristas entrantes).
 * Los ciclos no cuelgan el cálculo: cada nodo se relaja como máximo N veces.
 */
function assignLayers(nodes: LayoutNode[], edges: LayoutEdge[]): Map<string, number> {
  const layer = new Map<string, number>();
  for (const n of nodes) layer.set(n.id, 0);

  const indegree = new Map<string, number>();
  for (const n of nodes) indegree.set(n.id, 0);
  const outgoing = new Map<string, string[]>();
  for (const e of edges) {
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
    const list = outgoing.get(e.source);
    if (list) list.push(e.target);
    else outgoing.set(e.source, [e.target]);
  }

  let queue = nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  if (queue.length === 0 && nodes.length > 0) queue = [nodes[0].id];

  const relaxed = new Map<string, number>();
  while (queue.length > 0) {
    const next: string[] = [];
    for (const id of queue) {
      const count = (relaxed.get(id) ?? 0) + 1;
      relaxed.set(id, count);
      if (count > nodes.length) continue;
      const base = layer.get(id) ?? 0;
      for (const target of outgoing.get(id) ?? []) {
        if ((layer.get(target) ?? 0) < base + 1) {
          layer.set(target, base + 1);
          next.push(target);
        }
      }
    }
    queue = next;
  }

  return layer;
}

/**
 * Una columna por capa (izquierda → derecha), cada nodo a la altura promedio
 * de sus padres y apilado sin pisar al de arriba. Es el orden que sale al
 * armar el grafo a mano: la semilla a la izquierda y cada salto de la
 * consulta en la columna siguiente.
 */
function layeredLayout(nodes: LayoutNode[], edges: LayoutEdge[]): Record<string, Position> {
  if (nodes.length === 0) return {};

  const layer = assignLayers(nodes, edges);

  const predecessors = new Map<string, string[]>();
  for (const e of edges) {
    // Solo cuentan los padres de una capa anterior: una arista que va hacia
    // atrás no debe torcer el orden vertical.
    if ((layer.get(e.source) ?? 0) >= (layer.get(e.target) ?? 0)) continue;
    const list = predecessors.get(e.target);
    if (list) list.push(e.source);
    else predecessors.set(e.target, [e.source]);
  }

  const columns = new Map<number, LayoutNode[]>();
  for (const n of nodes) {
    const l = layer.get(n.id) ?? 0;
    const col = columns.get(l);
    if (col) col.push(n);
    else columns.set(l, [n]);
  }
  const layerIndices = [...columns.keys()].sort((a, b) => a - b);

  const positions: Record<string, Position> = {};
  let cursorX = MARGIN;

  for (const l of layerIndices) {
    const column = columns.get(l)!;
    const width = Math.max(...column.map((n) => nodeWidth(n.childCount)));

    // Y deseada: el promedio de los padres ya ubicados. Sin padres (raíces o
    // nodos sueltos) se respeta el orden vertical que ya tenían.
    const desired = new Map<string, number>();
    for (const n of column) {
      const parents = (predecessors.get(n.id) ?? []).filter((p) => positions[p]);
      desired.set(
        n.id,
        parents.length > 0
          ? parents.reduce((sum, p) => sum + positions[p].y, 0) / parents.length
          : n.y,
      );
    }

    const ordered = [...column].sort((a, b) => {
      const diff = (desired.get(a.id) ?? 0) - (desired.get(b.id) ?? 0);
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    });

    const stackHeight =
      ordered.reduce((sum, n) => sum + nodeHeight(n.childCount), 0) +
      GAP_Y * (ordered.length - 1);
    const subColumns = Math.max(1, Math.ceil(stackHeight / MAX_COLUMN_HEIGHT));
    const targetHeight = stackHeight / subColumns;

    let sub = 0;
    let cursorY = MARGIN;

    for (const n of ordered) {
      const height = nodeHeight(n.childCount);
      // Salto de sub-columna al llegar a la cuota de alto (nunca con la
      // sub-columna vacía, para no dejar huecos).
      if (sub < subColumns - 1 && cursorY > MARGIN && cursorY - MARGIN >= targetHeight) {
        sub++;
        cursorY = MARGIN;
      }
      const top =
        subColumns > 1 ? cursorY : Math.max(cursorY, (desired.get(n.id) ?? 0) - height / 2);
      positions[n.id] = {
        x: cursorX + width / 2 + sub * (width + GAP_SUBCOLUMN),
        y: top + height / 2,
      };
      cursorY = top + height + GAP_Y;
    }

    cursorX += subColumns * width + (subColumns - 1) * GAP_SUBCOLUMN + GAP_X;
  }

  // Todo el contenido pegado al origen + margen (coordenadas positivas).
  let minTop = Infinity;
  for (const n of nodes) {
    const pos = positions[n.id];
    if (pos) minTop = Math.min(minTop, pos.y - nodeHeight(n.childCount) / 2);
  }
  if (Number.isFinite(minTop) && minTop !== MARGIN) {
    const shift = MARGIN - minTop;
    for (const id of Object.keys(positions)) positions[id].y += shift;
  }

  return positions;
}

function boundingBox(nodes: LayoutNode[], positions: Record<string, Position>) {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const n of nodes) {
    const pos = positions[n.id];
    if (!pos) continue;
    const w = nodeWidth(n.childCount);
    const h = nodeHeight(n.childCount);
    x1 = Math.min(x1, pos.x - w / 2);
    y1 = Math.min(y1, pos.y - h / 2);
    x2 = Math.max(x2, pos.x + w / 2);
    y2 = Math.max(y2, pos.y + h / 2);
  }
  return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1 };
}

/** Pares de nodos cuyos rectángulos se pisan. */
function countOverlaps(nodes: LayoutNode[], positions: Record<string, Position>): number {
  const boxes = nodes
    .filter((n) => positions[n.id])
    .map((n) => {
      const pos = positions[n.id];
      const w = nodeWidth(n.childCount);
      const h = nodeHeight(n.childCount);
      return { x1: pos.x - w / 2, y1: pos.y - h / 2, x2: pos.x + w / 2, y2: pos.y + h / 2 };
    });

  let overlaps = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2) overlaps++;
    }
  }
  return overlaps;
}

/** Zoom/pan que encuadra el grafo en un canvas de referencia. */
function fittedViewport(bb: { x1: number; y1: number; w: number; h: number }) {
  const zoom = Math.min(1, (CANVAS_W - 2 * MARGIN) / bb.w, (CANVAS_H - 2 * MARGIN) / bb.h);
  return {
    zoom: Math.round(zoom * 100) / 100,
    pan: {
      x: Math.round((CANVAS_W - bb.w * zoom) / 2 - bb.x1 * zoom),
      y: Math.round((CANVAS_H - bb.h * zoom) / 2 - bb.y1 * zoom),
    },
  };
}

// ---------------------------------------------------------------------------
// Payload guardado
// ---------------------------------------------------------------------------

interface SerializedElement {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

interface SerializedGraph {
  nodes: SerializedElement[];
  edges: Array<{ id: string; source: string; target: string; data: Record<string, unknown> }>;
}

interface PanelSnapshot {
  id: string;
  name: string;
  graph: SerializedGraph;
  viewport?: { zoom: number; pan: { x: number; y: number } };
  [key: string]: unknown;
}

interface WorkspacePayload {
  panels: PanelSnapshot[];
  [key: string]: unknown;
}

/** `prop-<nodeId>-<propId>` / `lit-<nodeId>-<propId>` → `node-<nodeId>`. */
function ownerNodeId(childId: string): string | null {
  const parts = childId.split('-');
  return parts.length >= 3 ? `node-${parts[1]}` : null;
}

function toLayoutInput(graph: SerializedGraph): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const childCount = new Map<string, number>();
  for (const el of graph.nodes) {
    if (el.type !== 'property' && el.type !== 'literal') continue;
    const owner = ownerNodeId(el.id);
    if (owner) childCount.set(owner, (childCount.get(owner) ?? 0) + 1);
  }

  const nodes: LayoutNode[] = graph.nodes
    .filter((el) => el.type === 'node')
    .map((el) => ({
      id: el.id,
      childCount: childCount.get(el.id) ?? 0,
      y: typeof el.data['y'] === 'number' ? (el.data['y'] as number) : 0,
    }));

  const ids = new Set(nodes.map((n) => n.id));
  const edges: LayoutEdge[] = [];
  for (const edge of graph.edges ?? []) {
    const source = ownerNodeId(edge.source);
    if (!source || !ids.has(source) || !ids.has(edge.target) || source === edge.target) continue;
    edges.push({ source, target: edge.target });
  }

  return { nodes, edges };
}

function currentPositions(nodes: LayoutNode[], graph: SerializedGraph): Record<string, Position> {
  const byId = new Map(graph.nodes.map((el) => [el.id, el]));
  const positions: Record<string, Position> = {};
  for (const n of nodes) {
    const el = byId.get(n.id);
    if (!el) continue;
    positions[n.id] = {
      x: typeof el.data['x'] === 'number' ? (el.data['x'] as number) : 0,
      y: typeof el.data['y'] === 'number' ? (el.data['y'] as number) : 0,
    };
  }
  return positions;
}

function resolveDbPath(): string {
  const explicit = process.env['DASHBOARDS_SQLITE_PATH'];
  if (explicit && explicit.trim() !== '') return path.resolve(explicit);
  const backend = (process.env['SPARQL_BACKEND'] ?? 'wikidata')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  return path.resolve(`./data/${backend || 'wikidata'}.sqlite`);
}

interface Row {
  id: string;
  name: string;
  payload: string;
}

function main(): number {
  const dryRun = process.argv.includes('--dry-run');
  const idFlag = process.argv.indexOf('--id');
  const onlyId = idFlag >= 0 ? process.argv[idFlag + 1] : null;

  const dbPath = resolveDbPath();
  if (!fs.existsSync(dbPath)) {
    process.stderr.write(`No existe la base: ${dbPath}\n`);
    return 1;
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  const rows = db
    .prepare(
      onlyId
        ? `SELECT id, name, payload FROM dashboards WHERE kind = 'explorer' AND id = ?`
        : `SELECT id, name, payload FROM dashboards WHERE kind = 'explorer' ORDER BY id`,
    )
    .all(...(onlyId ? [onlyId] : [])) as Row[];

  if (rows.length === 0) {
    process.stdout.write('No hay workspaces de Explorer para reacomodar.\n');
    db.close();
    return 0;
  }

  process.stdout.write(`SQLite: ${dbPath}\n\n`);

  const updates: Array<{ id: string; payload: string }> = [];
  let totalBefore = 0;
  let totalAfter = 0;

  for (const row of rows) {
    const payload = JSON.parse(row.payload) as WorkspacePayload;
    const reports: string[] = [];

    for (const panel of payload.panels ?? []) {
      const graph = panel.graph;
      if (!graph?.nodes) continue;

      const { nodes, edges } = toLayoutInput(graph);
      if (nodes.length === 0) continue;

      const before = countOverlaps(nodes, currentPositions(nodes, graph));
      const positions = layeredLayout(nodes, edges);
      const after = countOverlaps(nodes, positions);
      totalBefore += before;
      totalAfter += after;

      if (after > 0) {
        process.stderr.write(
          `\n[${row.id}] el layout dejó ${after} par(es) solapado(s): no se escribe nada.\n`,
        );
        db.close();
        return 1;
      }

      for (const el of graph.nodes) {
        if (el.type !== 'node') continue;
        const pos = positions[el.id];
        if (!pos) continue;
        el.data['x'] = Math.round(pos.x);
        el.data['y'] = Math.round(pos.y);
      }

      const bb = boundingBox(nodes, positions);
      panel.viewport = fittedViewport(bb);

      reports.push(
        `    "${panel.name}": ${nodes.length} nodos, solapados ${before} → ${after}, ` +
          `${Math.round(bb.w)}x${Math.round(bb.h)}px, ` +
          `viewport zoom ${panel.viewport.zoom}`,
      );
    }

    process.stdout.write(`  [${row.id}] ${row.name}\n${reports.join('\n')}\n`);
    updates.push({ id: row.id, payload: JSON.stringify(payload) });
  }

  process.stdout.write(`\nPares de nodos solapados: ${totalBefore} → ${totalAfter}\n`);

  if (dryRun) {
    process.stdout.write('\ndry-run: no se escribió nada.\n');
    db.close();
    return 0;
  }

  db.pragma('wal_checkpoint(TRUNCATE)');
  const backup = `${dbPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(dbPath, backup);

  const update = db.prepare(`UPDATE dashboards SET payload = ?, updated_at = ? WHERE id = ?`);
  const now = new Date().toISOString();
  const tx = db.transaction((items: Array<{ id: string; payload: string }>) => {
    for (const item of items) update.run(item.payload, now, item.id);
  });
  tx(updates);

  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();

  process.stdout.write(`\nActualizados ${updates.length} workspace(s).\nBackup previo: ${backup}\n`);
  return 0;
}

if (require.main === module || process.argv[1]?.endsWith('relayout-explorer-workspaces.ts')) {
  try {
    process.exit(main());
  } catch (err) {
    process.stderr.write(`\nError: ${(err as Error).message}\n`);
    process.exit(1);
  }
}
