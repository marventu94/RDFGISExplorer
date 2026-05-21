import { IsString, IsOptional, IsIn } from 'class-validator';

export class CreateCurationDto {
  @IsString() nodeUri!: string;
  @IsString() fieldName!: string;
  @IsOptional() @IsString() rawValue?: string;
  @IsOptional() @IsString() scriptValue?: string;
  @IsOptional() @IsString() manualValue?: string;
  @IsIn(['validated', 'corrected', 'pending']) status!: 'validated' | 'corrected' | 'pending';
}

export class UpdateCurationDto {
  @IsOptional() @IsString() manualValue?: string;
  @IsOptional() @IsIn(['validated', 'corrected', 'pending']) status?: string;
}

export class DuplicateDecisionDto {
  @IsIn(['confirmed', 'rejected', 'pending']) decision!: 'confirmed' | 'rejected' | 'pending';
}

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
