import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../core/settings.service';
import { RequestService } from '../../core/request.service';
import { querySearch } from '../../core/query.service';
import { AppConfigService } from '../../core/services/app-config.service';
import type { SparqlJsonResult } from '../../core/request.service';
import type { EndpointType } from '../../core/settings.types';

interface ColorOverrideRow {
  classUri: string;
  color: string;
}

@Component({
  selector: 'app-settings-panel',
  templateUrl: './settings-panel.component.html',
  standalone: true,
  imports: [FormsModule],
})
export class SettingsPanelComponent {
  private readonly settings = inject(SettingsService);
  private readonly request = inject(RequestService);
  private readonly appConfig = inject(AppConfigService);

  readonly endpointUrl = signal(this.appConfig.config()?.endpointUrl ?? '');
  readonly backendLabel = signal(this.appConfig.config()?.backend ?? '');
  readonly defaultClassColors = computed(() => this.appConfig.config()?.classColors ?? {});
  readonly defaultClassColorsEntries = computed<Array<[string, string]>>(() => Object.entries(this.defaultClassColors()));

  endpointLabel = signal(this.settings.app().endpointLabel);
  endpointType = signal<EndpointType>(this.settings.app().endpointType);
  searchClassValue = signal(this.settings.app().searchClass.uri.value);
  limit = signal<number>(this.settings.app().resultLimit);
  lang = signal<string>(this.settings.app().lang);
  labelUri = signal<string>(this.settings.app().labelUri);
  wikibaseAdapter = signal<boolean>(this.settings.app().wikibaseAdapter);

  colorOverrides = signal<ColorOverrideRow[]>(
    Object.entries(this.settings.app().classColorOverrides).map(([classUri, color]) => ({
      classUri,
      color,
    })),
  );

  classResults = signal<Array<{ uri: string; label: string }>>([]);
  classLoading = false;

  private classSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private classAbort: AbortController | null = null;

  addColorOverride(): void {
    this.colorOverrides.update(rows => [...rows, { classUri: '', color: '#1976D2' }]);
  }

  removeColorOverride(index: number): void {
    this.colorOverrides.update(rows => rows.filter((_, i) => i !== index));
  }

  objectEntries(obj: Record<string, string>): Array<[string, string]> {
    return Object.entries(obj);
  }

  onEndpointTypeChange(value: string): void {
    this.endpointType.set(value as EndpointType);
  }

  onClassSearch(value: string): void {
    if (this.classSearchTimer) clearTimeout(this.classSearchTimer);
    this.classSearchTimer = setTimeout(() => {
      this.searchClasses(value);
    }, 300);
  }

  private async searchClasses(label: string): Promise<void> {
    if (label.length < 3) {
      this.classResults.set([]);
      return;
    }

    if (this.classAbort) this.classAbort.abort();
    this.classAbort = new AbortController();
    this.classLoading = true;

    try {
      const q = querySearch(label, {
        type: 'http://www.w3.org/2002/07/owl#Class',
        ...this.settings.queryContext(),
        limit: 10,
      });
      const data = await this.request.execQuery<SparqlJsonResult>(q, { signal: this.classAbort.signal });
      const results = data.results.bindings.map(b => ({
        uri: b['uri'].value,
        label: b['label']?.value ?? b['uri'].value,
      }));
      this.classResults.set(results);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      this.classResults.set([]);
    } finally {
      this.classLoading = false;
    }
  }

  selectClass(uri: string): void {
    this.searchClassValue.set(uri);
    this.classResults.set([]);
  }

  save(): void {
    this.settings.update('endpointLabel', this.endpointLabel());
    this.settings.update('endpointType', this.endpointType());
    this.settings.update('resultLimit', this.limit());
    this.settings.update('lang', this.lang() as 'en');
    this.settings.update('labelUri', this.labelUri());
    this.settings.update('wikibaseAdapter', this.wikibaseAdapter());
    this.settings.update('searchClass', {
      uri: { type: 'uri', value: this.searchClassValue() },
      label: { type: 'literal', value: this.searchClassValue() },
    });
    const colorOverrides: Record<string, string> = {};
    for (const row of this.colorOverrides()) {
      if (row.classUri.trim() && /^#[0-9a-fA-F]{6}$/.test(row.color)) {
        colorOverrides[row.classUri.trim()] = row.color;
      }
    }
    this.settings.update('classColorOverrides', colorOverrides);
  }

  cancel(): void {
    this.resetForm();
  }

  resetToDefault(): void {
    this.settings.reset();
    this.resetForm();
  }

  private resetForm(): void {
    const s = this.settings.app();
    this.endpointLabel.set(s.endpointLabel);
    this.endpointType.set(s.endpointType);
    this.searchClassValue.set(s.searchClass.uri.value);
    this.limit.set(s.resultLimit);
    this.lang.set(s.lang);
    this.labelUri.set(s.labelUri);
    this.wikibaseAdapter.set(s.wikibaseAdapter);
    this.colorOverrides.set(
      Object.entries(s.classColorOverrides).map(([classUri, color]) => ({
        classUri,
        color,
      })),
    );
  }
}
