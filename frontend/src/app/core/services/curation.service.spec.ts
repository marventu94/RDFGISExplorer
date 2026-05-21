import { TestBed } from '@angular/core/testing';
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { CurationService } from './curation.service';
import type { CurationRecord, DuplicateCandidate } from '@shared/models';

describe('CurationService', () => {
  let service: CurationService;
  let httpMock: HttpTestingController;
  const baseUrl = 'http://localhost:3000';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CurationService,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(CurationService);
    httpMock = TestBed.inject(HttpTestingController);
    localStorage.setItem('rdf-explorer:author', 'test@test.com');
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  describe('getForNode', () => {
    it('should GET curation records for a node URI', () => {
      const mockResponse = {
        records: [
          {
            id: 1,
            nodeUri: 'http://example.org/Q1',
            fieldName: 'label',
            rawValue: 'Foo',
            scriptValue: null,
            manualValue: 'Bar',
            status: 'corrected' as const,
            author: 'x@y.com',
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
          },
        ],
        duplicates: [] as DuplicateCandidate[],
      };

      service
        .getForNode('http://example.org/Q1')
        .subscribe((res) => {
          expect(res.records.length).toBe(1);
          expect(res.records[0].fieldName).toBe('label');
        });

      const req = httpMock.expectOne(
        `${baseUrl}/curation/${encodeURIComponent('http://example.org/Q1')}`,
      );
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });
  });

  describe('create', () => {
    it('should POST a new curation record with X-Author header', () => {
      const params = {
        nodeUri: 'http://example.org/Q1',
        fieldName: 'label',
        rawValue: 'Foo',
        manualValue: 'Bar',
        status: 'corrected' as const,
      };
      const mockRecord: CurationRecord = {
        id: 1,
        ...params,
        scriptValue: null,
        author: 'test@test.com',
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      };

      service.create(params).subscribe((record) => {
        expect(record.id).toBe(1);
        expect(record.nodeUri).toBe('http://example.org/Q1');
      });

      const req = httpMock.expectOne(`${baseUrl}/curation`);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('X-Author')).toBe('test@test.com');
      req.flush(mockRecord);
    });

    it('should use default author when localStorage is empty', () => {
      localStorage.removeItem('rdf-explorer:author');
      const params = {
        nodeUri: 'http://example.org/Q1',
        fieldName: 'label',
        status: 'validated' as const,
      };

      service.create(params).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/curation`);
      expect(req.request.headers.get('X-Author')).toBe('martin@bago.com.ar');
      req.flush({ id: 1, ...params, author: 'martin@bago.com.ar' } as CurationRecord);
    });
  });

  describe('update', () => {
    it('should PATCH a curation record with X-Author header', () => {
      const mockRecord: CurationRecord = {
        id: 1,
        nodeUri: 'http://example.org/Q1',
        fieldName: 'label',
        rawValue: 'Foo',
        scriptValue: null,
        manualValue: 'New',
        status: 'corrected',
        author: 'test@test.com',
        createdAt: '2025-01-01',
        updatedAt: '2025-01-02',
      };

      service
        .update(1, { manualValue: 'New', status: 'corrected' })
        .subscribe((record) => {
          expect(record.manualValue).toBe('New');
        });

      const req = httpMock.expectOne(`${baseUrl}/curation/1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.headers.get('X-Author')).toBe('test@test.com');
      req.flush(mockRecord);
    });
  });

  describe('getDuplicates', () => {
    it('should GET duplicate candidates for a node', () => {
      const mockDups: DuplicateCandidate[] = [
        {
          id: 1,
          nodeUriA: 'http://example.org/Q1',
          nodeUriB: 'http://example.org/Q2',
          score: 0.95,
          decision: 'pending',
        },
      ];

      service.getDuplicates('http://example.org/Q1').subscribe((dups) => {
        expect(dups.length).toBe(1);
        expect(dups[0].score).toBe(0.95);
      });

      const req = httpMock.expectOne(
        `${baseUrl}/curation/duplicates/${encodeURIComponent('http://example.org/Q1')}`,
      );
      expect(req.request.method).toBe('GET');
      req.flush(mockDups);
    });
  });

  describe('decideDuplicate', () => {
    it('should POST a duplicate decision', () => {
      const mockDup: DuplicateCandidate = {
        id: 1,
        nodeUriA: 'http://example.org/Q1',
        nodeUriB: 'http://example.org/Q2',
        score: 0.95,
        decision: 'confirmed',
        decidedBy: 'test@test.com',
        decidedAt: '2025-01-01',
      };

      service.decideDuplicate(1, 'confirmed').subscribe((dup) => {
        expect(dup.decision).toBe('confirmed');
      });

      const req = httpMock.expectOne(`${baseUrl}/curation/duplicates/1/decision`);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('X-Author')).toBe('test@test.com');
      req.flush(mockDup);
    });
  });
});
