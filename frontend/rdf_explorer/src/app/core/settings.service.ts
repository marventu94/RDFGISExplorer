import { Injectable, signal } from '@angular/core';
import type { AppSettings, EndpointConfig, DescribeConfig, Prefix, SearchClass } from './settings.types';

const STORAGE_KEY = 'rdfexplorer.settings.v1';

const DEFAULT_APP_SETTINGS: AppSettings = {
  lang: 'en',
  labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
  endpoint: {
    url: 'https://query.wikidata.org/sparql',
    type: 'other',
    label: 'wikidata',
  },
  searchClass: {
    uri: { type: 'uri', value: 'http://dbpedia.org/ontology/Person' },
    label: { type: 'literal', value: 'person', 'xml:lang': 'en' },
  },
  resultLimit: 20,
};

const DEFAULT_PREFIXES: readonly Prefix[] = [
  { prefix: 'rdf',       uri: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#' },
  { prefix: 'owl',       uri: 'http://www.w3.org/2002/07/owl#' },
  { prefix: 'text',      uri: 'http://jena.apache.org/text#' },
  { prefix: 'wds',       uri: 'http://www.wikidata.org/entity/statement/' },
  { prefix: 'wd',        uri: 'http://www.wikidata.org/entity/' },
  { prefix: 'wdv',       uri: 'http://www.wikidata.org/value/' },
  { prefix: 'wikibase',  uri: 'http://wikiba.se/ontology#' },
  { prefix: 'psvn',      uri: 'http://www.wikidata.org/prop/statement/value-normalized/' },
  { prefix: 'ps',        uri: 'http://www.wikidata.org/prop/statement/' },
  { prefix: 'pqv',       uri: 'http://www.wikidata.org/prop/qualifier/value/' },
  { prefix: 'pq',        uri: 'http://www.wikidata.org/prop/qualifier/' },
  { prefix: 'wdt',       uri: 'http://www.wikidata.org/prop/direct/' },
  { prefix: 'p',         uri: 'http://www.wikidata.org/prop/' },
  { prefix: 'rdfs',      uri: 'http://www.w3.org/2000/01/rdf-schema#' },
  { prefix: 'bd',        uri: 'http://www.bigdata.com/rdf#' },
  { prefix: 'dbc',       uri: 'http://dbpedia.org/resource/Category:' },
  { prefix: 'dbo',       uri: 'http://dbpedia.org/ontology/' },
  { prefix: 'dbp',       uri: 'http://dbpedia.org/property/' },
  { prefix: 'dbt',       uri: 'http://dbpedia.org/resource/Template:' },
  { prefix: 'dbr',       uri: 'http://dbpedia.org/resource/' },
  { prefix: 'dc',        uri: 'http://purl.org/dc/elements/1.1/' },
  { prefix: 'dct',       uri: 'http://purl.org/dc/terms/' },
  { prefix: 'foaf',      uri: 'http://xmlns.com/foaf/0.1/' },
  { prefix: 'yago',      uri: 'http://dbpedia.org/class/yago/' },
  { prefix: 'wiki-commons', uri: 'http://commons.wikimedia.org/wiki/' },
  { prefix: 'umbel',     uri: 'http://umbel.org/umbel#' },
  { prefix: 'umbel-ac',  uri: 'http://umbel.org/umbel/ac/' },
  { prefix: 'umbel-rc',  uri: 'http://umbel.org/umbel/rc/' },
  { prefix: 'umbel-sc',  uri: 'http://umbel.org/umbel/sc/' },
  { prefix: 'dul',       uri: 'http://www.ontologydesignpatterns.org/ont/dul/DUL.owl' },
  { prefix: 'schema',    uri: 'http://schema.org/' },
  { prefix: 'vrank',     uri: 'http://purl.org/voc/vrank#' },
  { prefix: 'skos',      uri: 'http://www.w3.org/2004/02/skos/core#' },
  { prefix: 'prov',      uri: 'http://www.w3.org/ns/prov#' },
];

const DEFAULT_DESCRIBE: DescribeConfig = {
  exclude: [
    'http://www.wikidata.org/prop/direct/P443',
    'http://www.wikidata.org/prop/direct/P109',
  ],
  objects: ['http://www.wikidata.org/prop/direct/P31'],
  datatype: [],
  text: ['http://dbpedia.org/ontology/abstract'],
  image: [
    'http://www.wikidata.org/prop/direct/P18',
    'http://www.wikidata.org/prop/direct/P154',
    'http://www.wikidata.org/prop/direct/P41',
    'http://www.wikidata.org/prop/direct/P94',
    'http://www.wikidata.org/prop/direct/P158',
    'http://www.wikidata.org/prop/direct/P242',
    'http://www.wikidata.org/prop/direct/P948',
  ],
  external: [
    'http://www.wikidata.org/prop/direct/P2035',
    'http://www.wikidata.org/prop/direct/P2888',
    'http://www.wikidata.org/prop/direct/P973',
    'http://www.wikidata.org/prop/direct/P856',
    'http://www.wikidata.org/prop/direct/P3264',
    'http://www.wikidata.org/prop/direct/P1896',
    'http://www.wikidata.org/prop/direct/P1581',
  ],
};

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function hydratePersisted(): AppSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.lang === 'string') {
      return parsed as AppSettings;
    }
    return null;
  } catch {
    return null;
  }
}

function persist(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* localStorage may be full or disabled */
  }
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly app = signal<AppSettings>(
    hydratePersisted() ?? deepClone(DEFAULT_APP_SETTINGS),
  );
  readonly prefixes = signal<readonly Prefix[]>([...DEFAULT_PREFIXES]);
  readonly describe = signal<DescribeConfig>(deepClone(DEFAULT_DESCRIBE));

  update<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    this.app.update(current => {
      const next = { ...current, [key]: value };
      persist(next);
      return next;
    });
  }

  reset(): void {
    this.app.set(deepClone(DEFAULT_APP_SETTINGS));
    this.prefixes.set([...DEFAULT_PREFIXES]);
    this.describe.set(deepClone(DEFAULT_DESCRIBE));
    localStorage.removeItem(STORAGE_KEY);
  }
}
