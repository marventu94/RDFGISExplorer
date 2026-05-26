import { Injectable, signal, inject, DestroyRef } from '@angular/core';
import Shepherd from 'shepherd.js';
import type { Tour } from 'shepherd.js';
import { buildSteps } from './tutorial.steps';
import type { TutorialContext } from './tutorial.steps';
import { ToolService } from '../tool/tool.service';
import { PropertyGraphService } from '../graph/property-graph.service';
import { LogService } from '../core/log.service';

@Injectable({ providedIn: 'root' })
export class TutorialService {
  private readonly toolService = inject(ToolService);
  private readonly graph = inject(PropertyGraphService);
  private readonly log = inject(LogService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isActive = signal(false);

  private tour: Tour | null = null;

  start(): void {
    this.log.add('Tutorial started');

    this.toolService.active.set('none');

    this.graph.reset();

    const ctx: TutorialContext = {
      simulateTyping: this.simulateTyping.bind(this),
      simulateSearchDrag: this.simulateSearchDrag.bind(this),
      simulatePropertyDrag: this.simulatePropertyDrag.bind(this),
      toggleSparql: () => this.toolService.toggle('sparql'),
      continue: () => this.tour?.next(),
      back: () => this.tour?.back(),
      complete: () => this.tour?.complete(),
    };

    const steps = buildSteps(ctx);

    const tour = new Shepherd.Tour({
      useModalOverlay: true,
      defaultStepOptions: {
        cancelIcon: { enabled: true },
        scrollTo: { behavior: 'smooth', block: 'center' },
        canClickTarget: false,
      },
    });

    tour.addSteps(steps as any);

    tour.on('active', () => {
      this.isActive.set(true);
    });

    tour.on('inactive', () => {
      this.isActive.set(false);
    });

    tour.on('cancel', () => {
      this.isActive.set(false);
      this.log.add('Tutorial cancelled');
    });

    tour.on('complete', () => {
      this.isActive.set(false);
      this.log.add('Tutorial completed');
    });

    this.tour = tour;
    tour.start();
  }

  private simulateTyping(text: string, onDone: () => void): void {
    const input = document.getElementById('search-input') as HTMLInputElement;
    if (!input) return;

    const chars = text.split('');
    let i = 0;

    const typeNext = () => {
      if (i < chars.length) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;
        nativeInputValueSetter?.call(input, text.substring(0, i + 1));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        i++;
        const delays = [200, 300, 400, 600, 800, 900, 1000];
        const delay = delays[Math.min(i - 1, delays.length - 1)] ?? 200;
        setTimeout(typeNext, delay);
      } else {
        onDone();
      }
    };

    typeNext();
  }

  private simulateSearchDrag(): void {
    const vqbMain = document.getElementById('vqb-main');
    if (!vqbMain) return;

    const base = document.getElementById('result0');
    if (!base) return;

    const pos = base.getBoundingClientRect();
    const vqbRect = vqbMain.getBoundingClientRect();

    const clone = base.cloneNode(true) as HTMLElement;
    clone.id = 'example-move';
    clone.style.position = 'fixed';
    clone.style.zIndex = '9999';
    clone.style.pointerEvents = 'none';
    clone.style.left = `${pos.left}px`;
    clone.style.top = `${pos.top}px`;
    clone.style.animation = 'simulate-drag 1.5s 1';
    clone.style.width = `${pos.width}px`;
    document.body.appendChild(clone);

    setTimeout(() => {
      clone.remove();
      const uri = this.graph.nodes().length === 0
        ? 'http://www.wikidata.org/entity/Q937'
        : 'http://www.wikidata.org/entity/Q937';

      let resource = this.graph.getNodeByUri(uri);
      if (!resource) {
        resource = this.graph.addNode();
        resource.addUri(uri);
        resource.mkConst();
      }
      resource.setPosition(
        pos.left - vqbRect.left + 300 + 110,
        pos.top - vqbRect.top + 15
      );
      this.graph.refresh();
    }, 1500);
  }

  private simulatePropertyDrag(): void {
    const vqbMain = document.getElementById('vqb-main');
    if (!vqbMain) return;

    const base = document.getElementById('propId0');
    if (!base) return;

    const pos = base.getBoundingClientRect();
    const vqbRect = vqbMain.getBoundingClientRect();

    const clone = base.cloneNode(true) as HTMLElement;
    clone.id = 'example-move';
    clone.style.position = 'fixed';
    clone.style.zIndex = '9999';
    clone.style.pointerEvents = 'none';
    clone.style.left = `${pos.left}px`;
    clone.style.top = `${pos.top}px`;
    clone.style.width = '200px';
    clone.style.borderColor = 'rgb(255, 127, 14)';
    clone.style.border = '2px solid rgb(255, 127, 14)';
    clone.style.borderRadius = '4px';
    clone.style.backgroundColor = 'rgba(255, 127, 14, 0.1)';
    clone.style.padding = '2px 6px';
    clone.style.animation = 'simulate-drag2 1.5s 1';
    document.body.appendChild(clone);

    setTimeout(() => {
      const propUri = clone.getAttribute('title');
      clone.remove();

      const nodes = this.graph.nodes();
      if (nodes.length > 0) {
        const sourceResource = nodes[0];
        const newResource = this.graph.addNode();
        newResource.setPosition(700, 150);

        let prop = propUri ? sourceResource.getPropByUri(propUri) : null;
        if (!prop) {
          prop = sourceResource.newProp();
          if (propUri) {
            prop.addUri(propUri);
          }
          prop.mkConst();
        }
        this.graph.addEdge(prop, newResource);
        this.graph.refresh();
      }
    }, 1500);
  }
}
