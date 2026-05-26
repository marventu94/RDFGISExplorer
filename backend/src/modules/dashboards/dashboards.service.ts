import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { DASHBOARDS_DB } from './dashboards.db-token';
import type Database from 'better-sqlite3';
import { CreateDashboardDto } from './dto/create-dashboard.dto';
import { UpdateDashboardDto } from './dto/update-dashboard.dto';
import { Dashboard } from './dto/dashboard.dto';

interface DashboardRow {
  id: string;
  kind: string;
  name: string;
  payload: string;
  created_at: string;
  updated_at: string;
}

function rowToDashboard(row: DashboardRow): Dashboard {
  return {
    id: row.id,
    kind: row.kind as Dashboard['kind'],
    name: row.name,
    payload: JSON.parse(row.payload) as object,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class DashboardsService {
  constructor(
    @Inject(DASHBOARDS_DB)
    private readonly db: Database.Database,
  ) {}

  findAll(): Dashboard[] {
    const rows = this.db
      .prepare('SELECT * FROM dashboards ORDER BY updated_at DESC')
      .all() as DashboardRow[];
    return rows.map(rowToDashboard);
  }

  findRecent(limit: number): Dashboard[] {
    const rows = this.db
      .prepare('SELECT * FROM dashboards ORDER BY updated_at DESC LIMIT ?')
      .all(limit) as DashboardRow[];
    return rows.map(rowToDashboard);
  }

  findOne(id: string): Dashboard {
    const row = this.db
      .prepare('SELECT * FROM dashboards WHERE id = ?')
      .get(id) as DashboardRow | undefined;

    if (!row) {
      throw new NotFoundException({
        error: 'DASHBOARD_NOT_FOUND',
        message: `Dashboard with id "${id}" not found.`,
      });
    }

    return rowToDashboard(row);
  }

  create(dto: CreateDashboardDto): Dashboard {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO dashboards (id, kind, name, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, dto.kind, dto.name, JSON.stringify(dto.payload), now, now);

    const row = this.db
      .prepare('SELECT * FROM dashboards WHERE id = ?')
      .get(id) as DashboardRow;

    return rowToDashboard(row);
  }

  update(id: string, dto: UpdateDashboardDto): Dashboard {
    const existing = this.db
      .prepare('SELECT * FROM dashboards WHERE id = ?')
      .get(id) as DashboardRow | undefined;

    if (!existing) {
      throw new NotFoundException({
        error: 'DASHBOARD_NOT_FOUND',
        message: `Dashboard with id "${id}" not found.`,
      });
    }

    const name = dto.name !== undefined ? dto.name : existing.name;
    const payload = dto.payload !== undefined ? JSON.stringify(dto.payload) : existing.payload;
    const now = new Date().toISOString();

    this.db
      .prepare(
        'UPDATE dashboards SET name = ?, payload = ?, updated_at = ? WHERE id = ?',
      )
      .run(name, payload, now, id);

    const row = this.db
      .prepare('SELECT * FROM dashboards WHERE id = ?')
      .get(id) as DashboardRow;

    return rowToDashboard(row);
  }

  remove(id: string): void {
    const result = this.db
      .prepare('DELETE FROM dashboards WHERE id = ?')
      .run(id);

    if (result.changes === 0) {
      throw new NotFoundException({
        error: 'DASHBOARD_NOT_FOUND',
        message: `Dashboard with id "${id}" not found.`,
      });
    }
  }
}
