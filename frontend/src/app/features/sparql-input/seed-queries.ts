export interface StoredQuery {
  id: string;
  name: string;
  category: 'geo' | 'temporal' | 'exploration' | 'custom';
  description?: string;
  sparql: string;
  isSeed: boolean;
  createdAt?: string;
}

export const SEED_QUERIES: StoredQuery[] = [
  {
    id: 'seed-cities-argentina',
    name: 'Ciudades de Argentina con coordenadas',
    category: 'geo',
    description: 'Lista ciudades argentinas con población y coordenadas.',
    sparql: `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
SELECT ?city ?cityLabel ?coord ?population WHERE {
  ?city wdt:P31 wd:Q515 ; wdt:P17 wd:Q414 ; wdt:P625 ?coord .
  OPTIONAL { ?city wdt:P1082 ?population . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en" . }
} LIMIT 50`,
    isSeed: true,
  },
  {
    id: 'seed-universities-la-plata',
    name: 'Universidades en La Plata y alrededores',
    category: 'geo',
    description: 'Universidades con coordenadas en el área de La Plata.',
    sparql: `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
SELECT ?univ ?univLabel ?coord ?inception WHERE {
  ?univ wdt:P31/wdt:P279* wd:Q3918 ; wdt:P17 wd:Q414 ; wdt:P625 ?coord .
  OPTIONAL { ?univ wdt:P571 ?inception . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en" . }
} LIMIT 30`,
    isSeed: true,
  },
  {
    id: 'seed-rivers-argentina',
    name: 'Ríos de Argentina',
    category: 'exploration',
    description: 'Ríos en Argentina con longitud.',
    sparql: `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
SELECT ?river ?riverLabel ?length WHERE {
  ?river wdt:P31/wdt:P279* wd:Q4022 ; wdt:P17 wd:Q414 .
  OPTIONAL { ?river wdt:P2043 ?length . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en" . }
} LIMIT 50`,
    isSeed: true,
  },
  {
    id: 'seed-argentine-presidents',
    name: 'Presidentes argentinos con fechas de mandato',
    category: 'temporal',
    description: 'Presidentes de Argentina con fecha de inicio y fin.',
    sparql: `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX ps: <http://www.wikidata.org/prop/statement/>
PREFIX pq: <http://www.wikidata.org/prop/qualifier/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
SELECT ?president ?presidentLabel ?start ?end WHERE {
  ?president p:P39 ?stmt .
  ?stmt ps:P39 wd:Q207313 ; pq:P580 ?start .
  OPTIONAL { ?stmt pq:P582 ?end . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en" . }
} ORDER BY ?start`,
    isSeed: true,
  },
  {
    id: 'seed-museums-by-foundation',
    name: 'Museos de Argentina por año de fundación',
    category: 'temporal',
    description: 'Museos argentinos con fecha de fundación y coordenadas.',
    sparql: `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
SELECT ?museum ?museumLabel ?coord ?inception WHERE {
  ?museum wdt:P31/wdt:P279* wd:Q33506 ; wdt:P17 wd:Q414 .
  OPTIONAL { ?museum wdt:P625 ?coord . }
  OPTIONAL { ?museum wdt:P571 ?inception . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en" . }
} LIMIT 100`,
    isSeed: true,
  },
  {
    id: 'seed-argentine-writers',
    name: 'Escritores argentinos',
    category: 'exploration',
    description: 'Escritores argentinos con fecha de nacimiento.',
    sparql: `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
SELECT ?writer ?writerLabel ?birth WHERE {
  ?writer wdt:P106 wd:Q36180 ; wdt:P27 wd:Q414 .
  OPTIONAL { ?writer wdt:P569 ?birth . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en" . }
} LIMIT 50`,
    isSeed: true,
  },
];
