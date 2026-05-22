import { Injectable, computed, effect, signal } from '@angular/core';

export type ViewType = 'table' | 'graph' | 'map' | 'timeline';
export type LayoutPreset = 'single' | 'split-h' | 'triple' | 'quad';

interface PersistedState {
  preset: LayoutPreset;
  slots: ViewType[];
}

const STORAGE_KEY = 'rdf-gis-explorer:dashboard-layout';
const DEFAULT_SLOTS: ViewType[] = ['table', 'graph', 'map', 'timeline'];
const SLOT_COUNT: Record<LayoutPreset, number> = {
  single: 1,
  'split-h': 2,
  triple: 3,
  quad: 4,
};

@Injectable({ providedIn: 'root' })
export class DashboardLayoutService {
  readonly preset = signal<LayoutPreset>('quad');
  readonly slots = signal<ViewType[]>([...DEFAULT_SLOTS]);

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
    const count = SLOT_COUNT[preset];
    const current = this.slots();
    const visible = current.slice(0, count);
    const used = new Set<ViewType>(visible);
    const filled = [...visible];
    for (const v of DEFAULT_SLOTS) {
      if (filled.length >= count) break;
      if (!used.has(v)) {
        filled.push(v);
        used.add(v);
      }
    }
    const tail = current.slice(count).filter((v) => !used.has(v));
    this.slots.set([...filled, ...tail]);
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
            ['table', 'graph', 'map', 'timeline'].includes(v as string) &&
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
