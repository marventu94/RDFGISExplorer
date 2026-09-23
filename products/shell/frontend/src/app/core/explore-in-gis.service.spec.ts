import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import {
  registerQueryExportProvider,
  requestQueryExport,
} from '@rdfgis/platform-bridge';

import { ExploreInGisService } from './explore-in-gis.service';
import { GisOpenGuardService } from './gis-open-guard.service';

describe('ExploreInGisService', () => {
  it('handles the request emitted by the restored Explorer toolbar button', async () => {
    const navigate = vi.fn().mockResolvedValue(true);
    const askBeforeHandoff = vi.fn().mockResolvedValue('proceed');
    const unregister = registerQueryExportProvider({
      listCandidates: () => [{
        id: 'panel:0',
        label: 'Panel · Query 1',
        query: 'SELECT ?x WHERE { ?x ?p ?o }',
        backend: 'generic',
        source: { panelId: 'panel' },
      }],
    });

    TestBed.configureTestingModule({
      providers: [
        ExploreInGisService,
        { provide: Dialog, useValue: { open: vi.fn() } },
        { provide: Router, useValue: { navigate } },
        { provide: GisOpenGuardService, useValue: { askBeforeHandoff } },
      ],
    });
    TestBed.inject(ExploreInGisService);

    requestQueryExport();
    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(['/gis'], { queryParams: { handoff: '1' } });
    });
    expect(askBeforeHandoff).toHaveBeenCalledOnce();

    unregister();
    TestBed.resetTestingModule();
  });
});
