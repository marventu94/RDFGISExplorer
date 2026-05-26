import {
  Component,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';
import { CommonModule } from '@angular/common';
import type { ResultBinding } from '@shared/models';
import type { VariableRole } from './mapping-overrides.util';

interface FieldMapping {
  variable: string;
  detectedType: string;
  override: VariableRole;
}

@Component({
  selector: 'app-field-mapping-panel',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatSelectModule, MatIconModule, MatBadgeModule],
  templateUrl: './field-mapping-panel.component.html',
  styleUrl: './field-mapping-panel.component.scss',
})
export class FieldMappingPanelComponent {
  readonly variables = input<string[]>([]);
  readonly bindings = input<ResultBinding[]>([]);
  readonly overridesCount = input(0);
  readonly applyMapping = output<Record<string, VariableRole>>();
  readonly restoreAuto = output<void>();

  protected expanded = false;
  protected fields: FieldMapping[] = [];

  protected toggle(): void {
    this.expanded = !this.expanded;
    if (this.expanded) {
      this.buildFields();
    }
  }

  private buildFields(): void {
    this.fields = this.variables().map((v) => ({
      variable: v,
      detectedType: this.detectType(v),
      override: this.detectType(v) as VariableRole,
    }));
  }

  private detectType(variable: string): string {
    const rows = this.bindings();
    if (!rows || rows.length === 0) return 'literal';
    const sample = rows.find((r) => r[variable] !== undefined);
    if (!sample || !sample[variable]) return 'literal';
    const val = sample[variable];
    return val.type;
  }

  protected onOverrideChange(field: FieldMapping, role: VariableRole): void {
    field.override = role;
  }

  protected onApply(): void {
    const overrides: Record<string, VariableRole> = {};
    for (const f of this.fields) {
      if (f.override !== (f.detectedType as VariableRole)) {
        overrides[f.variable] = f.override;
      }
    }
    this.applyMapping.emit(overrides);
  }

  protected onRestore(): void {
    this.fields = this.fields.map((f) => ({
      ...f,
      override: f.detectedType as VariableRole,
    }));
    this.restoreAuto.emit();
  }

  protected typeLabel(role: string): string {
    const labels: Record<string, string> = {
      uri: 'URI (entidad)',
      literal: 'Literal (texto)',
      coordinate: 'Coordenada',
      date: 'Fecha',
      numeric: 'Numérico',
      ignore: 'Ignorar',
    };
    return labels[role] ?? role;
  }
}
