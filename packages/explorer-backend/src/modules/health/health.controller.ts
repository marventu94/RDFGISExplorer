import { Controller, Get, Inject } from '@nestjs/common';
import { SPARQL_ENDPOINT } from '../../adapters/sparql-endpoint.interface';
import type { SparqlEndpoint } from '../../adapters/sparql-endpoint.interface';

@Controller('health')
export class HealthController {
  private readonly startTime = Date.now();

  constructor(
    @Inject(SPARQL_ENDPOINT) private readonly endpoint: SparqlEndpoint,
  ) {}

  @Get()
  getHealth() {
    return {
      status: 'ok',
      backend: this.endpoint.backendName,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  @Get('sparql')
  async getSparqlHealth() {
    const t0 = Date.now();
    try {
      await this.endpoint.execute('SELECT ?s WHERE { ?s ?p ?o } LIMIT 1', {
        timeoutMs: 5000,
        limit: 1,
      });
      return {
        status: 'ok',
        backend: this.endpoint.backendName,
        latencyMs: Date.now() - t0,
      };
    } catch (e) {
      return {
        status: 'error',
        backend: this.endpoint.backendName,
        message: e instanceof Error ? e.message : String(e),
        latencyMs: Date.now() - t0,
      };
    }
  }
}
