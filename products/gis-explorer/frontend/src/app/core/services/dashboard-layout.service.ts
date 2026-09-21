import { Injectable, computed, effect, signal } from '@angular/core';
import type { QueryResult } from '@shared/models';

export type ViewType = 'table' | 'graph' | 'map' | 'timeline';
export type LayoutPreset =
  | 'single'
  | 'split-h'
  | 'split-v'
  | 'triple'
  | 'triple-inv'
  | 'triple-v'
  | 'triple-v-inv'
  | 'quad';

interface PersistedState {
  preset: LayoutPreset;
  slots: ViewType[];
}

const STORAGE_KEY = 'rdf-gis-explorer:dashboard-layout';
const DEFAULT_SLOTS: ViewType[] = ['graph', 'map', 'timeline', 'table'];
const SLOT_COUNT: Record<LayoutPreset, number> = {
  single: 1,
  'split-h': 2,
  'split-v': 2,
  triple: 3,
  'triple-inv': 3,
  'triple-v': 3,
  'triple-v-inv': 3,
  quad: 4,
};

@Injectable({ providedIn: 'root' })
export class DashboardLayoutService {
  readonly preset = signal<LayoutPreset>('quad');
  readonly slots = signal<ViewType[]>([...DEFAULT_SLOTS]);
  readonly editorCollapsed = signal(false);

  collapseEditor(): void {
    this.editorCollapsed.set(true);
  }

  toggleEditor(): void {
    this.editorCollapsed.update((v) => !v);
  }

  readonly slotCount = computed(() => SLOT_COUNT[this.preset()]);
  readonly visibleSlots = computed(() => this.slots().slice(0, this.slotCount()));

  constructor() {
    this.hydrate();
    effect(() => {
      const state: PersistedState = {
        preset: this.preset(),
        slots: this.slots(),
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // ignore quota / private-mode errors
      }
    });
  }

  setLayout(preset: LayoutPreset): void {
    // Cambiar manualmente la cantidad de vistas vuelve a la prioridad de
    // sugerencia. La hidratación de un dashboard no pasa por este método y,
    // por lo tanto, sigue respetando el orden guardado en su payload.
    this.slots.set([...DEFAULT_SLOTS]);
    this.preset.set(preset);
  }

  setSlot(index: number, view: ViewType): void {
    const next = [...this.slots()];
    while (next.length <= index) next.push(DEFAULT_SLOTS[next.length % DEFAULT_SLOTS.length]);
    const previous = next[index];
    if (previous === view) return;
    const swapIndex = next.findIndex((v, i) => i !== index && v === view);
    next[index] = view;
    if (swapIndex !== -1) {
      next[swapIndex] = previous;
    }
    this.slots.set(next);
  }

  /**
   * Ajusta el layout a partir de un resultado SPARQL, mostrando solo las
   * vistas que tienen datos relevantes. Usado al importar una query desde
   * RDF Explorer (handoff) para no forzar las 4 vistas cuando no aplica.
   */
  applyLayoutForResult(result: QueryResult): void {
    const hasGeo = result.nodes.some((node) => node.coordinate !== undefined);
    const hasTemporal = result.nodes.some(
      (node) => node.temporalEvents !== undefined && node.temporalEvents.length > 0,
    );

    if (hasGeo && hasTemporal) {
      this.preset.set('quad');
      this.slots.set(['graph', 'map', 'timeline', 'table']);
    } else if (hasGeo) {
      this.preset.set('split-h');
      this.slots.set(['graph', 'map']);
    } else if (hasTemporal) {
      this.preset.set('split-h');
      this.slots.set(['graph', 'timeline']);
    } else {
      this.preset.set('split-h');
      this.slots.set(['graph', 'table']);
    }
  }

  getPresetSnapshot(): LayoutPreset {
    return this.preset();
  }

  getSlotsSnapshot(): ViewType[] {
    return this.slots();
  }

  getEditorCollapsedSnapshot(): boolean {
    return this.editorCollapsed();
  }

  private hydrate(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      if (parsed.preset && SLOT_COUNT[parsed.preset] !== undefined) {
        this.preset.set(parsed.preset);
      }
      if (Array.isArray(parsed.slots) && parsed.slots.length > 0) {
        const seen = new Set<ViewType>();
        const valid: ViewType[] = [];
        for (const v of parsed.slots) {
          if (
            DEFAULT_SLOTS.includes(v as ViewType) &&
            !seen.has(v as ViewType)
          ) {
            valid.push(v as ViewType);
            seen.add(v as ViewType);
          }
        }
        for (const v of DEFAULT_SLOTS) {
          if (!seen.has(v)) {
            valid.push(v);
            seen.add(v);
          }
        }
        this.slots.set(valid);
      }
    } catch {
      // ignore parse errors, fall back to defaults
    }
  }
}
