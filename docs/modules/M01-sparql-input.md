# M01 — SPARQL Input

## 1. Contexto

Punto de entrada de la herramienta. Editor de SPARQL con resaltado de sintaxis, biblioteca de queries predefinidas para Wikidata (fase 1) y validación previa a la ejecución. El foco es hacer la entrada SPARQL cómoda para un usuario con conocimiento técnico básico; **no** se implementa un query builder visual.

## 2. Alcance

**SÍ implementa:**
- Componente Angular standalone `SparqlInputComponent`.
- Editor CodeMirror 6 con highlighting SPARQL.
- Panel lateral con biblioteca de queries predefinidas (Wikidata).
- Botón "Ejecutar" + atajo `Ctrl+Enter`.
- Persistencia de queries propias en `localStorage`.
- Indicador de límite aplicado (500 por default, opción de subir a 2000).
- **Panel de Mapeo de Variables**: después de ejecutar la query, mostrar las variables del SELECT con su tipo auto-detectado y permitir override manual (ver §7.4).

**NO implementa:**
- Ejecución contra el endpoint (eso es M08 vía un `ApiService`).
- Renderizado de resultados (eso son M02-M05).
- Query builder visual (trabajo futuro).

## 3. Requerimientos funcionales

| ID PDF | Prioridad | Descripción | Criterio de aceptación |
|---|---|---|---|
| SPARQL-01 | Alta | Editor con resaltado y `Ctrl+Enter` | Editor renderiza, palabras clave SPARQL coloreadas; atajo dispara `execute()` |
| SPARQL-02 | Alta | Biblioteca de queries predefinidas seleccionables y editables | Panel muestra ≥6 queries; click carga al editor; usuario puede editar antes de ejecutar |
| SPARQL-03 | Alta | Validación de sintaxis con mensaje de error antes de ejecutar | Query inválida muestra error inline; el botón Ejecutar no envía request |
| SPARQL-04 | Alta | Límite 500 auto, ampliable a 2000 con confirmación | UI indica "LIMIT 500 aplicado"; opción "Aumentar a 2000" abre confirm dialog |
| SPARQL-05 | Media | Autocompletado de prefijos | Al escribir `wd:` o `wdt:` sugiere entidades/propiedades comunes (lista hardcoded en fase 1) |
| SPARQL-06 | Media | Guardar consultas propias en localStorage | Botón "Guardar"; queries propias aparecen en una sección "Mis queries" |
| SPARQL-07 | Alta | Panel de Mapeo de Variables después de ejecutar | Cada variable del SELECT muestra su tipo detectado y un dropdown para override |
| SPARQL-08 | Alta | Override de mapeo re-emite QueryResult con re-normalización | Cambiar `?year` de "literal" a "date" hace que M05 timeline aparezca con los items |
| SPARQL-09 | Media | Overrides persisten en localStorage por hash de query | Re-ejecutar la misma query restaura los overrides anteriores |

## 4. Dependencias

- **Lee de:** ninguna directa. Llama al backend M08 a través de un `ApiService` que cada módulo de vista usa.
- **Es consumido por:** M07 (al ejecutar, llama `selectionService.setQueryResult(result)`).
- **Librerías:** `codemirror ^6.0.1`, `@codemirror/lang-sparql` o `@codemirror/legacy-modes/sparql`, `sparqljs ^3.7.0` (validación opcional cliente; obligatoria en M08).

## 5. Interfaces TypeScript

```ts
// frontend/src/app/features/sparql-input/sparql-input.component.ts
import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { EditorView, basicSetup } from 'codemirror';
import { StreamLanguage } from '@codemirror/language';
import { sparql } from '@codemirror/legacy-modes/mode/sparql';

@Component({
  selector: 'app-sparql-input',
  standalone: true,
  templateUrl: './sparql-input.component.html',
  styleUrl: './sparql-input.component.scss',
})
export class SparqlInputComponent implements OnInit {
  // ...
  execute(): void { /* ... */ }
  loadPredefined(query: PredefinedQuery): void { /* ... */ }
  saveUserQuery(name: string): void { /* ... */ }
}

// frontend/src/app/features/sparql-input/predefined-queries.ts
export interface PredefinedQuery {
  id: string;
  name: string;
  category: 'exploration' | 'geo' | 'temporal';
  description: string;
  sparql: string;
}
```

## 6. Contrato HTTP (consumido)

Usa M08:
- `POST /query/execute` con `{ sparql, limit }` (límite efectivo según el estado del UI).

## 7. Comportamiento esperado

### Ciclo de ejecución
1. Usuario escribe o carga una predefined query.
2. Click en "Ejecutar" (o `Ctrl+Enter`):
   - Validación cliente opcional con `sparqljs`. Si falla, muestra error y aborta.
   - Aplica `limit` actual (default 500).
   - Llama `apiService.executeQuery({ sparql, limit })`.
   - Muestra spinner.
3. Si responde 200:
   - `selectionService.setQueryResult(result)`.
   - Spinner off. Toast "X resultados en Yms".
   - Si `result.meta.truncated === true`, mostrar warning "Resultado truncado a {limit}".
4. Si responde error:
   - Mostrar mensaje legible (mapear `INVALID_SPARQL`, `TIMEOUT`, `UPSTREAM_ERROR`).

### 7.4 Panel de Mapeo de Variables (Field Mapping)

**Problema que resuelve:** M09 auto-detecta tipos (uri, literal, coordinate, date) por `datatype`, `xml:lang`, o pattern matching (`Point(...)`). Pero hay casos donde la detección falla:

- Una variable `?año` de Wikidata viene como literal sin `xsd:date` → no se detecta como fecha.
- Una columna `?ubicacion` con valor "POINT(-58.4 -34.6)" pero sin `datatype=wktLiteral`.
- Un `?precio` que el usuario quiere graficar como `numericValue` en M05.

**Cómo funciona:**

1. Después de ejecutar la query, el componente recibe el `QueryResult` desde el backend.
2. Antes de llamar `selectionService.setQueryResult(result)`, M01 muestra un panel "Mapeo de Variables" debajo del editor.
3. Cada variable del `result.variables` aparece con su tipo detectado y un dropdown:
   - URI (entidad)
   - Literal (texto)
   - Coordenada (lat,lng)
   - Fecha (ISO 8601)
   - Valor numérico (asociado a evento temporal)
   - Ignorar (no usar)
4. Al cambiar un mapeo, M01 **re-normaliza el `QueryResult` en cliente** y emite el resultado al SelectionService.

**Re-normalización en cliente:**

```ts
function applyMappingOverrides(
  raw: QueryResult,
  overrides: Record<string, VariableRole>
): QueryResult {
  const newBindings = raw.bindings.map(row => {
    const out: ResultBinding = {};
    for (const v of raw.variables) {
      const original = row[v];
      const role = overrides[v];
      out[v] = role ? coerceTo(role, original) : original;
    }
    return out;
  });

  // Reconstruir nodes y edges con los nuevos tipos
  const { nodes, edges } = rebuildGraph(newBindings, raw.variables);

  return { ...raw, bindings: newBindings, nodes, edges };
}

function coerceTo(role: VariableRole, value: BindingValue): BindingValue {
  switch (role) {
    case 'coordinate': return parseCoordinate(value);   // intenta WKT, lat/lng, etc.
    case 'date':       return parseDate(value);          // intenta varios formatos ISO
    case 'numeric':    return { ...value, type: 'literal', datatype: 'xsd:decimal' };
    case 'uri':        return { type: 'uri', value: String(value.value) };
    case 'literal':    return { type: 'literal', value: String(value.value) };
    case 'ignore':     return value;  // queda pero no se usa para construir node attrs
  }
}
```

**Persistencia:**

Los overrides se guardan en `localStorage` con clave `mapping-overrides:<hash(sparql)>`. Al volver a ejecutar la misma query, se aplican automáticamente sin preguntar.

**Wireframe del panel:**

```
┌─ Mapeo de Variables (auto-detectado, podés ajustar) ────────────┐
│  ?city       URI (entidad)        [URI ▼]                        │
│  ?cityLabel  Literal (texto)      [Literal ▼]                    │
│  ?coord      Coordenada           [Coordenada ▼]  ← auto detectó │
│  ?population Literal (texto)      [Numérico ▼]    ← override     │
│  ?inception  Fecha                [Fecha ▼]                      │
│                                          [Restaurar auto] [Aplicar]│
└──────────────────────────────────────────────────────────────────┘
```

El panel está colapsado por default (se expande con un botón ▼ "Mapeo de variables"). Cuando hay overrides activos, el botón muestra un badge "N overrides".

### Biblioteca de queries (fase 1, Wikidata)

```ts
export const PREDEFINED_QUERIES: PredefinedQuery[] = [
  {
    id: 'cities-argentina',
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
  },
  {
    id: 'argentine-presidents',
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
  },
  {
    id: 'universities-la-plata',
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
  },
  {
    id: 'rivers-argentina',
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
  },
  {
    id: 'museums-by-foundation',
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
  },
  {
    id: 'argentine-writers',
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
  },
];
```

## 8. Ejemplos / Wireframe ASCII

```
┌─────────────────────────────────────────────────────────────────┐
│ ▼ Biblioteca de queries        │ ┌─────────────────────────────┐│
│ ─────────────────────────────  │ │ PREFIX wd: <http://...>     ││
│ 📍 Geo (3)                     │ │ PREFIX wdt: <http://...>    ││
│   Ciudades de Argentina        │ │ SELECT ?city ?cityLabel ... ││
│   Universidades en La Plata    │ │ WHERE {                     ││
│ 🕐 Temporal (2)                │ │   ?city wdt:P31 wd:Q515 ;   ││
│   Presidentes argentinos       │ │         wdt:P17 wd:Q414 .   ││
│   Museos por fundación         │ │ }                           ││
│ 🔍 Exploración (1)             │ │ LIMIT 50                    ││
│   Escritores argentinos        │ └─────────────────────────────┘│
│ ─────────────────────────────  │                                │
│ ⭐ Mis queries (localStorage)  │  [LIMIT 500 ▼]   [Ejecutar ▶]  │
│   (sin guardadas)              │   Ctrl+Enter para ejecutar     │
└─────────────────────────────────────────────────────────────────┘
```

## 9. Criterios de aceptación

- [ ] CodeMirror 6 monta con highlighting SPARQL visible.
- [ ] `Ctrl+Enter` ejecuta. Click en botón ejecuta.
- [ ] Las 6 queries predefinidas se cargan al editor al click.
- [ ] Validación cliente (opcional) muestra error inline antes de hacer request si SPARQL es inválido.
- [ ] Spinner durante ejecución. Toast con `Xresultados / Yms`.
- [ ] `result.meta.truncated` → warning visible.
- [ ] "Aumentar a 2000" abre dialog de confirmación.
- [ ] Guardar query propia → aparece en "Mis queries" → persiste tras reload.
- [ ] Mapeo de errores: 400/408/413/502 a mensajes en español.

## 10. Integración con App Shell (M00)

Lee `docs/modules/M00-app-shell.md` §3 para ver el contexto completo.

| Ítem | Valor |
|---|---|
| **Selector exacto** | `app-sparql-input` |
| **Dónde lo monta M00** | Franja superior colapsable (`DashboardComponent`) |
| **Tamaño** | M00 controla la altura (180px expandido / 0px colapsado). **No agregues altura fija** en el componente. |
| **CSS del host** | `:host { display: block; width: 100%; overflow: hidden; }` |

El componente recibe `@Input() collapsed: boolean` desde `DashboardComponent` para animar su colapso, o alternativamente emite un `EventEmitter` — coordiná con la implementación de M00.

## 11. Prompt para AI ejecutora

```
Sos un experto en Angular 17 standalone components + CodeMirror 6.

Lee primero (obligatorio):
- docs/00-architecture.md
- docs/01-tech-stack.md
- docs/02-data-contracts.md (§1)
- docs/04-conventions-and-glossary.md
- docs/modules/M00-app-shell.md (§3 y §9 — selector exacto y cómo DashboardComponent controla el colapso)
- docs/modules/M01-sparql-input.md (este archivo, especialmente §10 Integración con M00)
- docs/modules/M07-selection-service.md (para llamar setQueryResult)
- docs/modules/M08-backend-api.md (para entender el contrato del endpoint)

Pre-requisitos: M07 y un ApiService básico que llame /query/execute deben existir.

Archivos a crear:
- frontend/src/app/features/sparql-input/sparql-input.component.{ts,html,scss}
- frontend/src/app/features/sparql-input/predefined-queries.ts
- frontend/src/app/features/sparql-input/sparql-input.component.spec.ts
- frontend/src/app/core/services/api.service.ts (si no existe, crear con método executeQuery)

Restricciones:
- NO modifiques 02-data-contracts.md ni M07.
- NO toques otras features.
- Standalone component (Angular 17). Sin NgModules.
- Usar Angular Material para botones/dialog.

Definición de hecho:
- Criterios de §9 verificados.
- Tests pasan.
- Lint limpio.
- Demo: cargar query "Ciudades de Argentina", ejecutar, ver toast con cantidad de resultados.
```
