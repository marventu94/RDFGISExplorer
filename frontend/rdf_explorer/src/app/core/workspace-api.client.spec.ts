import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { WorkspaceApiClient } from './workspace-api.client';

function createMockHttp(): HttpClient {
  return {
    get: vi.fn(() => of([])),
    post: vi.fn(() => of({})),
    put: vi.fn(() => of({})),
    delete: vi.fn(() => of(undefined)),
  } as unknown as HttpClient;
}

describe('WorkspaceApiClient', () => {
  let client: WorkspaceApiClient;
  let mockHttp: HttpClient;

  beforeEach(() => {
    TestBed.resetTestingModule();
    mockHttp = createMockHttp();
    TestBed.configureTestingModule({
      providers: [WorkspaceApiClient, { provide: HttpClient, useValue: mockHttp }],
    });
    client = TestBed.inject(WorkspaceApiClient);
  });

  it('lists dashboards', () => {
    client.list().subscribe();
    expect(mockHttp.get).toHaveBeenCalledWith('/api/dashboards');
  });

  it('gets a dashboard by id', () => {
    client.get('123').subscribe();
    expect(mockHttp.get).toHaveBeenCalledWith('/api/dashboards/123');
  });

  it('creates an explorer dashboard', () => {
    const input = {
      kind: 'explorer' as const,
      name: 'Test',
      payload: {
        panels: [],
        activePanelId: '',
        settings: { endpointType: 'generic' as const, limit: 20 },
      },
    };
    client.create(input).subscribe();
    expect(mockHttp.post).toHaveBeenCalledWith('/api/dashboards', input);
  });

  it('updates a dashboard', () => {
    const input = { name: 'Updated' };
    client.update('123', input).subscribe();
    expect(mockHttp.put).toHaveBeenCalledWith('/api/dashboards/123', input);
  });

  it('deletes a dashboard', () => {
    client.delete('123').subscribe();
    expect(mockHttp.delete).toHaveBeenCalledWith('/api/dashboards/123');
  });
});
