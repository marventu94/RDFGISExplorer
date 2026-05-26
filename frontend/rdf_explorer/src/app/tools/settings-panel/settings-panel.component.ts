import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../core/settings.service';
import { RequestService } from '../../core/request.service';
import { querySearch } from '../../core/query.service';
import type { EndpointConfig, EndpointType } from '../../core/settings.types';
import type { SparqlJsonResult } from '../../core/request.service';

@Component({
  selector: 'app-settings-panel',
  templateUrl: './settings-panel.component.html',
  standalone: true,
  imports: [FormsModule],
})
export class SettingsPanelComponent {
  private readonly settings = inject(SettingsService);
  private readonly request = inject(RequestService);

  endpointLabel = signal(this.settings.app().endpoint.label);
  endpointType = signal(this.settings.app().endpoint.type);
  endpointUrl = signal(this.settings.app().endpoint.url);
  searchClassValue = signal(this.settings.app().searchClass.uri.value);
  limit = signal<number>(this.settings.app().resultLimit);

  classResults = signal<Array<{ uri: string; label: string }>>([]);
  classLoading = false;

  private classSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private classAbort: AbortController | null = null;

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
        endpointType: this.settings.app().endpoint.type,
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
    this.settings.update('endpoint', {
      url: this.endpointUrl(),
      type: this.endpointType(),
      label: this.endpointLabel(),
    });
    this.settings.update('resultLimit', this.limit());
    this.settings.update('searchClass', {
      uri: { type: 'uri', value: this.searchClassValue() },
      label: { type: 'literal', value: this.searchClassValue() },
    });
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
    this.endpointLabel.set(s.endpoint.label);
    this.endpointType.set(s.endpoint.type);
    this.endpointUrl.set(s.endpoint.url);
    this.searchClassValue.set(s.searchClass.uri.value);
    this.limit.set(s.resultLimit);
  }
}
