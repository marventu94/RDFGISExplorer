export interface CurationRecord {
  id: number;
  nodeUri: string;
  fieldName: string;
  rawValue: string | null;
  scriptValue: string | null;
  manualValue: string | null;
  status: 'validated' | 'corrected' | 'pending';
  author: string;
  createdAt: string;
  updatedAt: string;
}

export interface DuplicateCandidate {
  id: number;
  nodeUriA: string;
  nodeUriB: string;
  score: number;
  decision: 'pending' | 'confirmed' | 'rejected';
  decidedBy?: string;
  decidedAt?: string;
}
