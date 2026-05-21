# 02 — Data Contracts

> **CRÍTICO:** este es el **único** documento donde se definen los tipos compartidos entre frontend y backend. Si una AI necesita un tipo nuevo, NO lo define en su módulo — abre un issue/PR para agregarlo acá.

Los tipos se duplican en `frontend/src/app/shared/models/` y `backend/src/shared/dto/`. La duplicación es intencional (evita acoplamiento de build front/back). Cuando se modifica un tipo acá, se actualizan ambos archivos en el mismo PR.

---

## 1. SPARQL request / response

### `SparqlRequest`
```ts
export interface SparqlRequest {
  /** Texto SPARQL crudo. Backend lo valida con sparqljs antes de ejecutar. */
  sparql: string;
  /** Hard cap del backend. Si se omite, default 500. Máximo permitido 2000. */
  limit?: number;
}
```

### `QueryResult`
```ts
export interface QueryResult {
  /** Variables del SELECT (orden preservado). */
  variables: string[];
  /** Bindings crudos tal como vienen normalizados. */
  bindings: ResultBinding[];
  /** Nodos derivados de los bindings (uno por entidad única). */
  nodes: NormalizedNode[];
  /** Aristas entre nodos cuando el binding expresa una relación. */
  edges: NormalizedEdge[];
  /** Metadata de ejecución. */
  meta: {
    durationMs: number;
    truncated: boolean;       // true si llegó al limit
    limitApplied: number;
    backend: 'wikidata' | 'millenniumdb';
  };
}
```

### `ResultBinding`
Una fila del resultado, una propiedad por variable del SELECT.

```ts
export interface ResultBinding {
  [variableName: string]: BindingValue;
}

export type BindingValue =
  | { type: 'uri'; value: string }
  | { type: 'literal'; value: string; datatype?: string; lang?: string }
  | { type: 'bnode'; value: string }
  | { type: 'coordinate'; value: Coordinate; raw: string }   // ver detección abajo
  | { type: 'date'; value: string; raw: string };            // ISO 8601
```

---

## 2. Entidades normalizadas

### `NormalizedNode`
```ts
export interface NormalizedNode {
  /** IRI o identificador único del nodo. */
  uri: string;
  /** Label legible (rdfs:label si existe, fallback al fragmento del URI). */
  label: string;
  /** Tipo de entidad detectado (instance of / rdf:type). Free-form string. */
  type?: string;
  /** Atributos del nodo (clave = predicado o variable del SELECT). */
  attributes: Record<string, BindingValue>;
  /** Coordenadas si el nodo tiene al menos una. */
  coordinate?: Coordinate;
  /** Fechas asociadas al nodo (puede tener varias: publicación, actualización, etc). */
  temporalEvents?: TemporalEvent[];
  /** True si el módulo de curado detectó anomalías o correcciones pendientes. */
  flags?: {
    hasAnomaly?: boolean;
    hasPendingReview?: boolean;
    isConfirmedDuplicate?: boolean;
  };
}
```

### `NormalizedEdge`
```ts
export interface NormalizedEdge {
  id: string;                 // hash de source+predicate+target
  source: string;             // URI del nodo origen
  target: string;             // URI del nodo destino
  predicate: string;          // URI del predicado
  predicateLabel?: string;    // label legible si está disponible
}
```

### `Coordinate`
```ts
export interface Coordinate {
  lat: number;                // -90..90
  lng: number;                // -180..180
}
```

### `TemporalEvent`
```ts
export interface TemporalEvent {
  /** Predicado o variable que originó la fecha (ej: 'dateCreated', 'priceUpdatedAt'). */
  field: string;
  /** Fecha en ISO 8601 (siempre con TZ; si la fuente no la tiene, asumir UTC). */
  isoDate: string;
  /** Valor numérico opcional asociado al evento (ej: precio en una fecha). */
  numericValue?: number;
}
```

---

## 3. Selección y filtros

### `Selection`
```ts
export interface Selection {
  /** Nodo actualmente focalizado. null = sin selección. */
  node: NormalizedNode | null;
  /** Origen del evento de selección (para evitar loops en linking). */
  source: 'table' | 'graph' | 'map' | 'timeline' | 'curation' | 'external';
}
```

### `Filter`
Filtros acumulables. Todos los componentes filtran su dataset local según el set completo de filtros activos.

```ts
export type Filter = GeoFilter | TemporalFilter;

export interface GeoFilter {
  id: string;                 // uuid
  kind: 'geo';
  /** GeoJSON Polygon. Coordenadas en [lng, lat]. */
  polygon: GeoJSON.Polygon;
  label: string;              // descripción legible para mostrar
}

export interface TemporalFilter {
  id: string;
  kind: 'temporal';
  from: string;               // ISO 8601
  to: string;                 // ISO 8601
  label: string;
}
```

---

## 4. Curado

### `CurationRecord`
Una corrección/validación por campo de un nodo.

```ts
export interface CurationRecord {
  id: number;                       // PK SQLite
  nodeUri: string;
  fieldName: string;                // nombre del atributo o variable
  rawValue: string | null;          // valor original del grafo (snapshot)
  scriptValue: string | null;       // valor sugerido por script de curado
  manualValue: string | null;       // valor validado/corregido por usuario
  status: 'validated' | 'corrected' | 'pending';
  author: string;                   // email del curador
  createdAt: string;                // ISO 8601
  updatedAt: string;                // ISO 8601
}
```

### `DuplicateCandidate`
```ts
export interface DuplicateCandidate {
  id: number;
  nodeUriA: string;
  nodeUriB: string;
  score: number;                    // 0..1
  decision: 'pending' | 'confirmed' | 'rejected';
  decidedBy?: string;
  decidedAt?: string;
}
```

---

## 5. Detección automática de tipos en bindings de Wikidata

El backend normaliza los bindings antes de devolver `QueryResult`. Reglas:

| Si el binding tiene... | Se mapea a `BindingValue.type` | `value` |
|---|---|---|
| `xml:lang` presente | `'literal'` | string |
| `datatype = http://www.w3.org/2001/XMLSchema#date` o `#dateTime` | `'date'` | ISO 8601 (string) |
| `datatype = http://www.opengis.net/ont/geosparql#wktLiteral` o valor empieza con `Point(` | `'coordinate'` | `Coordinate` parseado del WKT |
| `datatype = http://www.w3.org/2001/XMLSchema#decimal/integer/float/double` | `'literal'` con `datatype` preservado | string (el front parsea si necesita) |
| `type = uri` | `'uri'` | string |
| `type = bnode` | `'bnode'` | string |
| Cualquier otro literal | `'literal'` | string |

**Wikidata específico:** algunas coordenadas vienen como `<http://www.wikidata.org/entity/Q...>` con la coordenada en una variable adicional `?coordLatLng`. El normalizador hace el join cuando detecta el patrón `?coord` o `?location` con `wdt:P625`.

---

## 6. Códigos de error HTTP

| Código | Significado | Body |
|---|---|---|
| `400` | SPARQL inválido | `{ error: 'INVALID_SPARQL', message: string, position?: number }` |
| `408` | Timeout (>10s) | `{ error: 'TIMEOUT', message: string }` |
| `413` | Limit excedido (>2000) | `{ error: 'LIMIT_EXCEEDED', message: string, maxAllowed: 2000 }` |
| `502` | Endpoint upstream caído | `{ error: 'UPSTREAM_ERROR', message: string }` |
| `503` | Backend no implementado (MillenniumDB en fase 1) | `{ error: 'NOT_IMPLEMENTED', message: string }` |

---

## 7. Versionado de contratos

Cualquier cambio breaking a estos tipos requiere:
1. Bump del `apiVersion` en el response (`meta.apiVersion`, agregar campo si se necesita).
2. Comunicación explícita en `ai-workflow.md` antes del PR.
3. Actualización simultánea de `frontend/src/app/shared/models/` y `backend/src/shared/dto/`.
