import { Component, input, computed } from '@angular/core';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import type { CurationRecord } from '@shared/models';

interface AnnotationItem {
  fieldName: string;
  author: string;
  timestamp: string;
  status: CurationRecord['status'];
  rawValue: string | null;
  scriptValue: string | null;
  manualValue: string | null;
}

@Component({
  selector: 'app-annotations-tab',
  standalone: true,
  imports: [MatListModule, MatIconModule],
  templateUrl: './annotations-tab.component.html',
  styleUrl: './annotations-tab.component.scss',
})
export class AnnotationsTabComponent {
  readonly records = input<CurationRecord[]>([]);

  protected readonly annotations = computed<AnnotationItem[]>(() => {
    return [...this.records()]
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .map((r) => ({
        fieldName: r.fieldName,
        author: r.author,
        timestamp: r.updatedAt,
        status: r.status,
        rawValue: r.rawValue,
        scriptValue: r.scriptValue,
        manualValue: r.manualValue,
      }));
  });

  protected statusIcon(status: CurationRecord['status']): string {
    switch (status) {
      case 'validated':
        return 'check_circle';
      case 'corrected':
        return 'edit';
      case 'pending':
        return 'pending';
    }
  }

  protected statusLabel(status: CurationRecord['status']): string {
    switch (status) {
      case 'validated':
        return 'Validado';
      case 'corrected':
        return 'Corregido';
      case 'pending':
        return 'Pendiente';
    }
  }

  protected changeDescription(item: AnnotationItem): string {
    const parts: string[] = [];
    if (item.rawValue !== null) {
      parts.push(`Original: ${item.rawValue || '(vacío)'}`);
    }
    if (item.scriptValue !== null && item.scriptValue !== item.rawValue) {
      parts.push(`Script: ${item.scriptValue}`);
    }
    if (item.manualValue !== null) {
      parts.push(`Manual: ${item.manualValue}`);
    }
    return parts.join(' → ');
  }

  protected formatDate(isoDate: string): string {
    try {
      return new Date(isoDate).toLocaleString('es-AR');
    } catch {
      return isoDate;
    }
  }
}
