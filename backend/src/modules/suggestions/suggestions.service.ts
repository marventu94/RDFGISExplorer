import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SPARQL_ENDPOINT } from '../../adapters/sparql-endpoint.interface';
import type {
  EntitySearchResult,
  SparqlEndpoint,
} from '../../adapters/sparql-endpoint.interface';
import { isValidUri } from '../../adapters/sparql-text';

export type { EntitySearchResult };

const DEFAULT_MAX_LIMIT = 2000;

/**
 * Capa HTTP de las sugerencias: valida la entrada y delega en el adapter.
 *
 * Como se resuelve la busqueda depende del backend, y eso vive en el adapter
 * correspondiente (`WikidataAdapter`, `GenericSparqlAdapter`): sumar un backend
 * es agregar una clase, no editar un `if` aca.
 */
@Injectable()
export class SuggestionsService {
  private readonly log = new Logger(SuggestionsService.name);

  constructor(
    @Inject(SPARQL_ENDPOINT) private readonly endpoint: SparqlEndpoint,
    private readonly config: ConfigService,
  ) {}

  getPredicates(): Promise<string[]> {
    return this.endpoint.getPredicates();
  }

  async searchEntities(
    keyword: string,
    limit = 20,
    classUri?: string,
  ): Promise<EntitySearchResult[]> {
    const maxLimit = parseInt(
      this.config.get<string>('SPARQL_MAX_LIMIT') ?? String(DEFAULT_MAX_LIMIT),
      10,
    );
    const resolvedLimit = Math.min(limit, maxLimit);

    // El classUri se interpola en la query del adapter: se valida en el borde y
    // se rechaza acá, no adentro del adapter, para poder devolver un 400 claro.
    if (classUri && !isValidUri(classUri)) {
      throw new BadRequestException({
        error: 'INVALID_CLASS_URI',
        message: 'classUri is not a valid IRI',
      });
    }

    this.log.debug(
      `[searchEntities] q="${keyword}" limit=${resolvedLimit} classUri=${classUri ?? '(none)'} backend=${this.endpoint.backendName}`,
    );

    const results = await this.endpoint.searchEntities(keyword, {
      limit: resolvedLimit,
      classUri,
    });

    this.log.debug(`[searchEntities] returning ${results.length} entities`);
    return results;
  }
}
