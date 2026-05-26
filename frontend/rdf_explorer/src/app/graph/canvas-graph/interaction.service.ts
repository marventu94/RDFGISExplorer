import { Injectable, signal } from '@angular/core';
import type { RDFResource } from '../domain';

@Injectable({ providedIn: 'root' })
export class GraphInteractionService {
  readonly requestedTool = signal<{
    tool: 'describe' | 'edit';
    target: RDFResource;
  } | null>(null);
}
