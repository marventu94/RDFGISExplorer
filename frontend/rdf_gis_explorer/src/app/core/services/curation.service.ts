import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { CurationRecord, DuplicateCandidate } from '@shared/models';

export interface CreateCurationParams {
  nodeUri: string;
  fieldName: string;
  rawValue?: string;
  scriptValue?: string;
  manualValue?: string;
  status: 'validated' | 'corrected' | 'pending';
}

export interface UpdateCurationParams {
  manualValue?: string;
  status?: 'validated' | 'corrected' | 'pending';
}

@Injectable({ providedIn: 'root' })
export class CurationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:3000';

  getForNode(
    nodeUri: string,
  ): Observable<{ records: CurationRecord[]; duplicates: DuplicateCandidate[] }> {
    return this.http.get<{
      records: CurationRecord[];
      duplicates: DuplicateCandidate[];
    }>(`${this.baseUrl}/curation/${encodeURIComponent(nodeUri)}`);
  }

  create(params: CreateCurationParams): Observable<CurationRecord> {
    return this.http.post<CurationRecord>(`${this.baseUrl}/curation`, params, {
      headers: { 'X-Author': this.authorEmail() },
    });
  }

  update(id: number, params: UpdateCurationParams): Observable<CurationRecord> {
    return this.http.patch<CurationRecord>(
      `${this.baseUrl}/curation/${id}`,
      params,
      { headers: { 'X-Author': this.authorEmail() } },
    );
  }

  getDuplicates(
    nodeUri: string,
  ): Observable<DuplicateCandidate[]> {
    return this.http.get<DuplicateCandidate[]>(
      `${this.baseUrl}/curation/duplicates/${encodeURIComponent(nodeUri)}`,
    );
  }

  decideDuplicate(
    id: number,
    decision: 'confirmed' | 'rejected' | 'pending',
  ): Observable<DuplicateCandidate> {
    return this.http.post<DuplicateCandidate>(
      `${this.baseUrl}/curation/duplicates/${id}/decision`,
      { decision },
      { headers: { 'X-Author': this.authorEmail() } },
    );
  }

  private authorEmail(): string {
    return localStorage.getItem('rdf-explorer:author') ?? 'martin@bago.com.ar';
  }
}
