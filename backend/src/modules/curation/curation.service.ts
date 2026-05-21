import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { DATABASE_CONNECTION } from '../../db/database.module';
import type Database from 'better-sqlite3';
import {
  CreateCurationDto,
  UpdateCurationDto,
  CurationRecord,
  DuplicateCandidate,
} from '../../shared/dto/curation.dto';

interface CurationRow {
  id: number;
  node_uri: string;
  field_name: string;
  raw_value: string | null;
  script_value: string | null;
  manual_value: string | null;
  status: string;
  author: string;
  created_at: string;
  updated_at: string;
}

interface DuplicateRow {
  id: number;
  node_uri_a: string;
  node_uri_b: string;
  score: number;
  decision: string;
  decided_by: string | null;
  decided_at: string | null;
}

function rowToRecord(row: CurationRow): CurationRecord {
  return {
    id: row.id,
    nodeUri: row.node_uri,
    fieldName: row.field_name,
    rawValue: row.raw_value,
    scriptValue: row.script_value,
    manualValue: row.manual_value,
    status: row.status as CurationRecord['status'],
    author: row.author,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToDuplicate(row: DuplicateRow): DuplicateCandidate {
  return {
    id: row.id,
    nodeUriA: row.node_uri_a,
    nodeUriB: row.node_uri_b,
    score: row.score,
    decision: row.decision as DuplicateCandidate['decision'],
    decidedBy: row.decided_by ?? undefined,
    decidedAt: row.decided_at ?? undefined,
  };
}

@Injectable()
export class CurationService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database.Database,
  ) {}

  getForNode(nodeUri: string): {
    records: CurationRecord[];
    duplicates: DuplicateCandidate[];
  } {
    const records = this.db
      .prepare('SELECT * FROM curation_records WHERE node_uri = ?')
      .all(nodeUri) as CurationRow[];
    const duplicates = this.db
      .prepare(
        'SELECT * FROM duplicate_candidates WHERE node_uri_a = ? OR node_uri_b = ?',
      )
      .all(nodeUri, nodeUri) as DuplicateRow[];

    return {
      records: records.map(rowToRecord),
      duplicates: duplicates.map(rowToDuplicate),
    };
  }

  create(dto: CreateCurationDto, author: string): CurationRecord {
    const existing = this.db
      .prepare(
        'SELECT id FROM curation_records WHERE node_uri = ? AND field_name = ?',
      )
      .get(dto.nodeUri, dto.fieldName) as { id: number } | undefined;

    if (existing) {
      throw new ConflictException({
        error: 'DUPLICATE_RECORD',
        message: `A curation record already exists for node "${dto.nodeUri}" field "${dto.fieldName}". Use PATCH /curation/${existing.id} to update.`,
        existingId: existing.id,
      });
    }

    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
    const stmt = this.db.prepare(
      `INSERT INTO curation_records (node_uri, field_name, raw_value, script_value, manual_value, status, author, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const result = stmt.run(
      dto.nodeUri,
      dto.fieldName,
      dto.rawValue ?? null,
      dto.scriptValue ?? null,
      dto.manualValue ?? null,
      dto.status,
      author,
      now,
      now,
    );

    const row = this.db
      .prepare('SELECT * FROM curation_records WHERE id = ?')
      .get(result.lastInsertRowid) as CurationRow;
    return rowToRecord(row);
  }

  update(id: number, dto: UpdateCurationDto): CurationRecord {
    const existing = this.db
      .prepare('SELECT * FROM curation_records WHERE id = ?')
      .get(id) as CurationRow | undefined;

    if (!existing) {
      throw new NotFoundException({
        error: 'RECORD_NOT_FOUND',
        message: `Curation record with id ${id} not found.`,
      });
    }

    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
    const manualValue =
      dto.manualValue !== undefined ? dto.manualValue : existing.manual_value;
    const status = dto.status !== undefined ? dto.status : existing.status;

    this.db
      .prepare(
        'UPDATE curation_records SET manual_value = ?, status = ?, updated_at = ? WHERE id = ?',
      )
      .run(manualValue, status, now, id);

    const row = this.db
      .prepare('SELECT * FROM curation_records WHERE id = ?')
      .get(id) as CurationRow;
    return rowToRecord(row);
  }

  getDuplicates(nodeUri: string): DuplicateCandidate[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM duplicate_candidates WHERE node_uri_a = ? OR node_uri_b = ?',
      )
      .all(nodeUri, nodeUri) as DuplicateRow[];
    return rows.map(rowToDuplicate);
  }

  decideDuplicate(
    id: number,
    decision: 'confirmed' | 'rejected' | 'pending',
    decidedBy: string,
  ): DuplicateCandidate {
    const existing = this.db
      .prepare('SELECT * FROM duplicate_candidates WHERE id = ?')
      .get(id) as DuplicateRow | undefined;

    if (!existing) {
      throw new NotFoundException({
        error: 'DUPLICATE_NOT_FOUND',
        message: `Duplicate candidate with id ${id} not found.`,
      });
    }

    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
    this.db
      .prepare(
        'UPDATE duplicate_candidates SET decision = ?, decided_by = ?, decided_at = ? WHERE id = ?',
      )
      .run(decision, decidedBy, now, id);

    const row = this.db
      .prepare('SELECT * FROM duplicate_candidates WHERE id = ?')
      .get(id) as DuplicateRow;
    return rowToDuplicate(row);
  }
}
