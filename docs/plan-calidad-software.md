# Plan de calidad de software

Relevamiento realizado el **2026-09-10** sobre `main` (último commit `93eafcc`).
Este documento es ejecutable: cada ítem tiene evidencia, pasos concretos,
criterio de aceptación y una estimación. Los ítems descartados están al final
**con su fundamento**, para no volver a analizarlos.

---

## 1. Contexto y veredicto

El proyecto está bien construido. Los límites de módulo se respetan (cero
imports cruzados entre remotes), `packages/contracts` funciona como fuente de
verdad única, la construcción de SPARQL está correctamente saneada y hay una
red de tests real que pasa. **Nota global: 8/10.**

Los problemas encontrados son de **consistencia**, no de **diseño**. Por eso
este plan no es una refactorización: son cuatro intervenciones quirúrgicas.

---

## 2. Línea base

| Métrica | Valor al 2026-09-10 |
|---|---|
| Código productivo | ~18.300 líneas |
| Código de test | ~12.200 líneas (ratio 0,67) |
| Tests | **701, todos verdes** (165 backend + 328 GIS + 191 explorer + 17 shell) |
| `any` explícitos | 29 |
| `TODO` reales | 1 |
| `@ts-ignore` / `@ts-nocheck` / `@ts-expect-error` | **0** |
| `eslint-disable-next-line` | 5 (4 × `no-explicit-any` en Leaflet, 1 × `no-console` en un bench) |
| `console.*` en productivo | 22 |
| Imports cruzados entre remotes | **0** |
| Configuraciones de ESLint | 1 de 4 (solo backend) |
| CI | inexistente |

Reproducir estas métricas: ver [Anexo A](#anexo-a--comandos-de-relevamiento).

> **Estado al cerrar el plan (2026-09-10).** Los 6 ítems ejecutados, cada uno en
> su commit, en la rama `refactor/plan-calidad-software`. Las pruebas pasaron de
> **701 a 719** (se agregaron 3 en el Ítem 4, 4 en el Ítem 6 y 11 netos en el
> Ítem 2). Quedan **dos cosas pendientes que necesitan una terminal
> interactiva**, ambas del usuario:
>
> 1. **`pnpm install` con TTY y commitear `pnpm-lock.yaml`.** Los Ítems 1 y 3
>    agregaron dependencias (`@rdfgis/platform-bridge`, `eslint`, `@eslint/js`,
>    `globals`, `typescript-eslint`) que el lockfile no tiene. Sin eso el
>    `--frozen-lockfile` del CI falla. Los enlaces en `node_modules` se crearon a
>    mano (los mismos symlinks que hace pnpm) para poder verificar todo acá.
> 2. **Smoke test de `./start.sh` y `./start.sh .env.graphdb`**, con el camino
>    Welcome → Explorer → exportar al GIS → volver sin recargar → guardar.
>
> **Cómo se corrieron las suites.** Con `npx jest` / `npx ng test --watch=false`
> invocados dentro de cada paquete, **no** con `pnpm run test`: ese camino está
> roto en el momento del relevamiento (ver
> [Ítem 5](#ítem-5--unificar-el-pnpm-del-workspace)), y esa primera corrida se
> hizo sobre **Node 22** en lugar del 24.18.0 del `.nvmrc`. Las dos cosas quedaron
> resueltas: hoy se corre con `pnpm test` desde la raíz y sobre Node 24.

---

## 3. Hallazgos priorizados

| # | Hallazgo | Severidad | ¿Se ejecuta? |
|---|---|---|---|
| 1 | `QueryHandoffService` duplicado a mano entre dos remotes | 🔴 Alta | ✅ Ítem 1 |
| 2 | Patrón Adapter bypasseado en `SuggestionsService` | 🟠 Media-alta | ✅ Ítem 2 |
| 3 | Sin CI; ESLint solo en backend | 🟠 Media-alta | ✅ Ítem 3 |
| 4 | `TODO` de aristas duplicadas en `graph.ts` | 🟢 Baja | ✅ Ítem 4 |
| 5 | `graph-view.component.ts`: 915 líneas, God component | 🟡 Media | ❌ [§5.1](#51--no-partir-graph-viewcomponentts-todavía) |
| 6 | Backend sin `strict` en TypeScript | 🟡 Media | ⚠️ [§5.2](#52--strict-en-el-backend-medir-primero) |
| 7 | `process.env` directo aunque existe `ConfigService` | 🟡 Baja | ⚠️ [§5.3](#53--processenv--configservice-opcional) |
| 8 | DI mixto `inject()` + constructor en 14 archivos | 🟢 Cosmética | ❌ [§5.4](#54--no-hacer-por-sí-solo) |
| 9 | 22 `console.*` en productivo | 🟢 Cosmética | ❌ [§5.4](#54--no-hacer-por-sí-solo) |
| 10 | `federation.manifest.json` con `localhost` hardcodeado | 🟢 Baja | ❌ [§5.4](#54--no-hacer-por-sí-solo) |
| 11 | Proxy SPARQL sin auth ni rate limiting | ℹ️ Informativo | ❌ [§5.5](#55--fuera-de-alcance-para-la-tesis) |
| 12 | `backend/data/wikidata.sqlite` trackeado | ℹ️ Informativo | ❌ [§5.5](#55--fuera-de-alcance-para-la-tesis) |
| 13 | Dos majors de pnpm pineados en el mismo workspace: `pnpm run` aborta en root, `backend` y `packages/contracts` | 🔴 Alta | ✅ Ítem 5 |
| 14 | Canvas: posiciones relativas tratadas como absolutas al inicializar Cytoscape | 🟠 Media | ✅ Ítem 6 |
| 15 | `AppConfigService` también ramifica por backend (hallazgo nuevo) | 🟡 Media | ❌ [§5.6](#56--hallazgo-nuevo-appconfigservice-también-ramifica-por-backend) |

**Esfuerzo total de lo que se ejecuta: ~11 horas.**

**Orden obligatorio:** el **Ítem 5 va primero** — es requisito del Ítem 3, que
depende de que `pnpm -r` funcione. El resto es independiente entre sí.

---

## 4. Ítems a ejecutar

### Ítem 1 — Extraer el contrato de handoff a un paquete compartido

**Severidad:** 🔴 Alta · **Esfuerzo:** 2-3 h · **Riesgo:** bajo

#### Por qué

Es la **única clase de bug silencioso del sistema**. Si cambiás el TTL o la
clave de storage en un lado y no en el otro, no lo detecta el compilador, no lo
detecta ningún test, y el handoff falla en runtime sin error.

#### Evidencia

`frontend/rdf_explorer/src/app/core/query-handoff.service.ts` y
`frontend/rdf_gis_explorer/src/app/core/services/query-handoff.service.ts`
tienen ~90 líneas **idénticas**, incluidas las constantes que *son* el contrato:

```ts
const STORAGE_KEY = 'platform.handoff.pending';
const TTL_MS = 5 * 60 * 1000;
const CUSTOM_EVENT = 'query-handoff';
```

Lo mismo con `gis-session-channel.ts` (39 líneas en el Explorer vs 63 en el GIS,
mismo contrato, comentarios **ya divergidos**).

El comentario del código justifica la duplicación con *"los servicios no se
pueden compartir entre remotes"*. Eso es cierto para el **singleton de DI de
Angular**, pero no para el **código**: `@rdfgis/contracts` ya es `workspace:*`
en las cuatro apps y ya emite JS real (`packages/contracts/dist/*.js`), no solo
tipos. El acoplamiento acá es vía `sessionStorage` + `window`, no vía instancia
compartida.

#### Pasos

- [x] Crear `packages/platform-bridge/` (mismo molde que `packages/contracts`:
      `package.json` privado con `build: tsc -p tsconfig.json` y `prepare`).
      **No** meterlo dentro de `contracts`: ese paquete es `export type *` y
      debe seguir siendo solo tipos.
- [x] Mover al paquete: `STORAGE_KEY`, `TTL_MS`, `CUSTOM_EVENT`, `AUTO_RUN_KEY`,
      los tipos `HandoffPayload` / `HandoffPayloadInput`, la función `isExpired`,
      y el contrato de `gis-session-channel` (`GisSessionState` + el nombre de la
      propiedad de `window`).
- [x] Agregar `"@rdfgis/platform-bridge": "workspace:*"` a las `dependencies` de
      `frontend/rdf_explorer` y `frontend/rdf_gis_explorer`. **No** a `app_shell`:
      se verificó que no usa el handoff (`grep -rln handoff frontend/app_shell/src`
      no devuelve nada), así que agregarle la dep sería acoplamiento de más.
- [x] Reescribir ambos `QueryHandoffService` para importar el contrato. **Cada
      remote conserva su propio `@Injectable({ providedIn: 'root' })`** — no se
      comparte la instancia, solo el contrato.
- [x] Igual para `gis-session-channel.ts` en ambos lados: el Explorer sigue solo
      leyendo, el GIS sigue siendo el único que escribe. Preservar los comentarios
      de *por qué* el estado va en `window` y no en `sessionStorage`.
- [x] Revisar `federation.config.js` de ambos remotes: al ser un paquete workspace
      nuevo, decidir si va en `skip` (se bundlea en cada remote — **preferible**,
      porque son ~40 líneas y evita un chunk compartido más) o se comparte.
- [x] Build del paquete verificado. **Nota:** el enlace en `node_modules` se creó
      a mano (mismo symlink que usa pnpm para `@rdfgis/contracts`) porque un
      `pnpm install` acá quiere purgar `node_modules` y no hay TTY. Queda cubierto
      por el `pnpm install` pendiente del Ítem 5.
- [x] **Desviación deliberada respecto de lo planeado:** además de las constantes
      y los tipos se movió la **lógica** de lectura/escritura
      (`readPendingHandoff` / `writePendingHandoff` / `clearPendingHandoff` /
      `subscribeHandoffChanges`). Mover solo las constantes dejaba ~50 líneas de
      lógica de storage duplicadas, que es la mitad del problema que este ítem
      viene a resolver. Los servicios quedaron en 49 líneas cada uno y son puro
      envoltorio en signals.

#### Criterio de aceptación

- [x] Cada constante del contrato tiene **una sola** definición, en el paquete:
      `platform.handoff.pending`, el TTL, `query-handoff`,
      `__rdfgisGisSession_v1` y `platform.handoff.autoRun`.
      Excepción a propósito: `gis-overwrite-guard.service.spec.ts` y
      `gis-session-channel.spec.ts` siguen con la clave literal. Ahí el valor
      hardcodeado es un **canario**: si alguien cambia la clave en el paquete, el
      test falla, que es exactamente lo que se quiere. Importarla del paquete
      haría que el test siguiera el cambio en silencio y dejara de proteger.
- [x] Las **519** pruebas de los dos remotes verdes (191 Explorer + 328 GIS) sobre
      Node 24.18.0.
- [x] `pnpm build` de **los dos remotes** OK, y verificado que el contrato queda
      bundleado dentro de cada uno (las claves aparecen en `dist/`) y **no** en el
      import-map de federación. Este chequeo no estaba en el plan y hacía falta:
      es el modo real en que un paquete workspace con código de runtime puede
      romper, y los tests con vitest no lo cubren.
- [ ] Prueba manual del flujo completo: Explorer → *exportar al GIS* → el GIS
      levanta la query, incluido el aviso de sobreescritura (smoke test final).

---

### Ítem 2 — Subir `searchEntities` a la interfaz `SparqlEndpoint`

**Severidad:** 🟠 Media-alta · **Esfuerzo:** 3-4 h · **Riesgo:** bajo-medio

#### Por qué

Doble retorno:

1. **Técnico (OCP):** hoy agregar un backend requiere **editar un `if/else`**;
   después requiere **agregar una clase**.
2. **De tesis:** `docs/design-decisions.md` §9 declara la arquitectura
   *domain-agnostic* vía Adapter SPARQL. Este es el único lugar del código donde
   esa afirmación **no se cumple**. Un jurado que lea la decisión y después el
   código encuentra la discrepancia.

#### Evidencia

`backend/src/modules/suggestions/suggestions.service.ts` inyecta el adapter
(`@Inject(SPARQL_ENDPOINT)`) pero **solo lo usa para `getPredicates()`**
(línea 49). `searchEntities` hace:

```ts
const backend = this.config.get<string>('SPARQL_BACKEND') ?? 'wikidata';
if (backend === 'wikidata') { result = await this.wikidataSearch(...); }
else { result = await this.sparqlSearch(...); }
```

…con sus propias llamadas `axios`, su propia lectura de `SPARQL_ENDPOINT_URL` /
`SPARQL_USERNAME` / `SPARQL_PASSWORD`, y
`http://www.wikidata.org/prop/direct/P31` **hardcodeado** dentro de
`filterByClass` — lógica de Wikidata en código supuestamente genérico.
`SparqlEndpoint` no declara `searchEntities`.

#### Pasos

- [x] Agregar a `backend/src/adapters/sparql-endpoint.interface.ts`:
      `searchEntities(keyword: string, opts: { limit: number; classUri?: string }): Promise<EntitySearchResult[]>`
      y mover `EntitySearchResult` a un lugar compartido (el propio archivo de
      interfaz, o `shared/dto/`).
- [x] Crear `backend/src/adapters/wikidata.adapter.ts` extendiendo
      `GenericSparqlAdapter`, con `wikidataSearch` + `filterByClass` movidos tal
      cual (incluido el `P31`, que **acá sí corresponde**) y el caso especial de
      `owl#Thing`.
- [x] Implementar `searchEntities` en `GenericSparqlAdapter` con la lógica de
      `sparqlSearch` (plantilla `SPARQL_ENTITY_SEARCH_QUERY`), reusando el
      cliente HTTP, las credenciales y el manejo de timeout que **ya tiene** en
      lugar de instanciar `axios` de nuevo.
- [x] `MillenniumDBAdapter`: `throw new NotImplementedError('searchEntities')`,
      consistente con el resto de ese stub.
- [x] `sparql-endpoint.factory.ts`: agregar `case 'wikidata': return new WikidataAdapter()`
      y sacar `wikidata` del `default`.
- [x] `SuggestionsService` queda reducido a delegación + validación de entrada.
      **Conservar en el servicio** la validación `isValidUri(classUri)` con su
      `BadRequestException INVALID_CLASS_URI` (línea 67): es validación de borde
      HTTP, no responsabilidad del adapter.
- [x] Mover `escapeSparqlLiteral` + `URI_PATTERN` / `isValidUri` a un módulo
      compartido de adapters — los usan tanto el servicio como los adapters.
- [x] Bajar de `log.log` a `log.debug` los tres logs por request de
      `suggestions.controller.ts` (hoy loguean la query cruda en nivel info).

#### Criterio de aceptación

- [x] `grep -rn "P31\|axios" backend/src/modules/suggestions/` no devuelve nada.
- [x] `SuggestionsService` pasa de **236 a 67 líneas**: validación de borde y
      delegación. Ya no lee `SPARQL_BACKEND`, ni la URL del endpoint, ni las
      credenciales.
- [x] Suite del backend: **176 verdes** (antes 165), en 19 suites (antes 17).
      Los casos del detalle de Wikidata se movieron a `wikidata.adapter.spec.ts`,
      los del endpoint genérico a `generic-sparql.adapter.spec.ts` y los de
      escapeo a `sparql-text.spec.ts`. Se agregaron casos que antes no existían:
      el bypass de `owl#Thing`, la degradación cuando falla el filtro por clase,
      el descarte de URIs que cortarían el `VALUES` y el respeto de una plantilla
      propia de búsqueda.
- [x] `pnpm build` del backend OK.
- [ ] Prueba manual con los dos entornos: `./start.sh` (Wikidata) y
      `./start.sh .env.graphdb`, buscando entidades con y sin filtro de clase
      (smoke test final).

> **Nota de alcance.** `grep -n "SPARQL_BACKEND" backend/src/modules/` **sí**
> devuelve resultados todavía, pero de `app-config`, no de `suggestions`. Es un
> hallazgo nuevo, de otra forma: ver [§5.6](#56--hallazgo-nuevo-appconfigservice-tambien-ramifica-por-backend).

---

### Ítem 3 — CI mínimo + ESLint en los frontends

**Severidad:** 🟠 Media-alta · **Esfuerzo:** 1 h (+ ver la advertencia) · **Riesgo:** bajo
**⛔ Bloqueado por el [Ítem 5](#ítem-5--unificar-el-pnpm-del-workspace):** hoy
`pnpm -r --if-present test` **no puede funcionar**, porque `pnpm` aborta en la
raíz. Hacer el Ítem 5 antes de escribir un solo paso de este.

#### Por qué

Hay **701 tests verdes y 12.200 líneas de test** cuya ejecución hoy depende de
que alguien se acuerde. Es dejar sin usar el activo más caro del proyecto.
Además, los 5 `eslint-disable-next-line` de los frontends están **inertes**: no
hay ESLint configurado ahí, así que hoy son comentarios decorativos.

#### Evidencia

- No existe `.github/workflows/`, ni husky, ni hooks de git.
- `eslint.config.mjs` existe **solo** en `backend/`.
- El `package.json` raíz no tiene script `test` ni `lint`: no hay un comando
  único que corra las 701 pruebas.

#### Pasos

- [x] Agregar al `package.json` raíz:
      `"test": "pnpm -r --if-present test"`, `"lint": "pnpm -r --if-present lint"`,
      `"build": "pnpm -r --if-present build"`.
- [x] Agregar `"test": "ng test --watch=false"` en los tres `package.json` de
      frontend (hoy es `ng test`, que en CI se queda en modo watch).
- [x] Crear `eslint.config.mjs` en los tres frontends. **Desviación:** con
      `typescript-eslint` a secas, **no** con `angular-eslint`. Ese paquete no
      está en el store y sin poder correr `pnpm install` no habría podido
      *verificar* la config antes de dejarla — shippear un lint sin ejecutarlo es
      justo lo que rompe un CI recién creado. `typescript-eslint` ya estaba
      disponible (lo usa el backend), cubre todo el TS —que es donde viven los 29
      `any` y los 22 `console.*`— y quedó corrido y verificado. Falta el lint de
      los **templates HTML**: eso sí requiere `angular-eslint` y queda como
      seguimiento para cuando haya un install.
- [x] Agregar `"lint": "eslint src"` a los tres (no `ng lint`: sin
      `angular-eslint` no hace falta el target de architect en `angular.json`).
- [x] **No estaba en el plan y hacía falta:** el `lint` del backend corría con
      `--fix`, o sea que en CI hubiera *modificado archivos*. Se partió en `lint`
      (chequea) y `lint:fix` (arregla).
- [x] Crear `.github/workflows/ci.yml`: Node desde `.nvmrc`, `corepack enable`,
      `pnpm install --frozen-lockfile`, `pnpm build` (contracts primero),
      `pnpm lint`, `pnpm test`. Nada de `better-sqlite3` recompilado a mano: el
      `allowBuilds` de `pnpm-workspace.yaml` ya lo cubre.
- [x] **Fijar Node 24.18.0 en el workflow leyendo `.nvmrc`**
      (`actions/setup-node` con `node-version-file: .nvmrc`), nunca una versión
      literal. `better-sqlite3` trae binario prebuilt por `NODE_MODULE_VERSION`:
      con la major equivocada, `pnpm install` recompila o directamente falla al
      cargar. Es la misma razón por la que `start.sh` mantiene el marcador
      `.node-version-built` y corre `pnpm rebuild` al cambiar de major.
- [x] En CI la variable `CI=true` ya viene seteada, así que el chequeo previo de
      dependencias no se queda esperando un TTY. **No** poner `confirmModulesPurge=false`
      como remedio: eso *autoriza* el borrado de `node_modules`, no lo evita.

#### ⚠️ Advertencia de alcance

Activar `@typescript-eslint/no-explicit-any` en los frontends va a destapar los
**otros 29 `any`** y los **22 `console.*`**, que *no* están anotados. Si prendés
todas las reglas en `error` de una, este ítem deja de ser una hora.

**Estrategia:** introducir la config con las reglas ruidosas
(`no-explicit-any`, `no-console`) en `warn`, dejar el CI verde el mismo día, y
promoverlas a `error` de forma selectiva en un commit aparte.

#### Criterio de aceptación

- [x] `pnpm test` desde la raíz corre las cuatro suites: **719 casos verdes**
      (176 backend + 17 shell + 198 explorer + 328 GIS).
- [x] `pnpm lint` desde la raíz: **exit 0**, 108 warnings, **0 errores**.
- [x] `pnpm build` desde la raíz: **exit 0**, los dos paquetes y las tres apps.
- [ ] El workflow corre verde en un PR de prueba. **Bloqueado por el lockfile**
      (ver abajo): los tres pasos ya se verificaron localmente uno por uno.

#### Deuda que el lint dejó a la vista

Los 108 warnings son el inventario de lo que hay que bajar, en commits aparte:

| Paquete | Warnings | Qué son |
|---|---|---|
| `backend` | 55 | `no-unsafe-call` / `-member-access` / `-assignment` sobre respuestas de upstream y filas de SQLite tipadas como `any` |
| `rdf_explorer` | 47 | `no-explicit-any`, `no-console` y `no-unused-vars` |
| `rdf_gis_explorer` | 5 | idem |
| `app_shell` | 1 | idem |

Al medir se encontraron **2 errores reales** que sí se arreglaron acá, porque
bajar la regla para taparlos hubiera sido el instinto equivocado:

- `query.ts:109` — `const self = this` (`no-this-alias`), resabio de estilo
  pre-arrow: los 5 usos estaban en callbacks arrow, así que `this` léxico
  alcanza. Los golden tests confirman que el SPARQL generado no cambió.
- `map-view.component.ts:514` — `zoomToShowLayer?: Function`
  (`no-unsafe-function-type`) pasó a la firma concreta que se invoca.

El resto de los `no-unused-vars` eran parámetros con prefijo `_` (`_node`,
`_source`, `_options`), que ya es la convención del código: la config los ignora
en vez de pedir que se cambien 40 firmas.

> **⛔ Para que el CI pase hay que regenerar el lockfile.** Este ítem y el 1
> agregaron dependencias (`@rdfgis/platform-bridge`, `eslint`, `@eslint/js`,
> `globals`, `typescript-eslint`) que `pnpm-lock.yaml` todavía no tiene, así que
> `pnpm install --frozen-lockfile` va a fallar. Correr `pnpm install` (con TTY) y
> commitear el lockfile. Es el mismo install pendiente del Ítem 5.

---

### Ítem 4 — Resolver el `TODO` de aristas duplicadas

**Severidad:** 🟢 Baja · **Esfuerzo:** ~1 h · **Riesgo:** bajo

#### Por qué

Es el único `TODO` real del código. No es deuda peligrosa —el análisis de
impacto está abajo y muestra que está contenido— pero **es resoluble de verdad**
con una regla precisa, y deja de ser una pregunta abierta para quien lea el
dominio.

#### Evidencia

```ts
// frontend/rdf_explorer/src/app/graph/domain/graph.ts:181
addEdgeToList(edge: Edge): void {
  // TODO: duplicate edges are not deduplicated (preserved legacy behavior)
  this.edges.push(edge);
}
```

**Análisis de impacto (ya realizado):**

1. El único llamador es `addEdge()` (`graph.ts:243`), que siempre construye un
   `new Edge(...)`: una arista repetida es un objeto distinto.
2. El borrado **no** se corrompe: todos los caminos de eliminación usan identidad
   (`indexOf`/`splice`, `filter(e => e.source === prop)`).
3. **La query generada ya deduplica.** En `query.ts:57`, `addTriple` rechaza el
   triple si ya existe:
   `if (triples.some(e => e[0] === s && e[1] === p && e[2] === o)) return false;`

Conclusión: la duplicación vive **solo en el modelo/UI** (dos flechas dibujadas
una encima de la otra) y **nunca llega al SPARQL**.

**La regla de dedup tiene que ser precisa.** Dos hallazgos la delimitan:

- `removeNodeFromGraph` (`graph.ts:128`) contempla **explícitamente** que una
  property tenga varias aristas (`tmp.length === 1` vs `else`). El caso
  `prop → {A, B}` es **legítimo** y no se toca.
- En la rama `source instanceof Node`, `addEdge` llama a `source.newProp()`, que
  crea una `Property` **nueva**. Esa rama **nunca** puede duplicar por identidad
  y no debe deduplicarse: dos llamadas Node→Node son dos slots de predicado
  distintos, ambos legítimos.

Por lo tanto se deduplica **solo** la rama `source instanceof Property`, por
identidad de `(source, target)`.

#### Pasos

- [x] En `graph.ts`, mover el chequeo a `addEdge` (**no** a `addEdgeToList`): si
      se rechazara dentro de `addEdgeToList`, la rama `Node` ya habría creado una
      `Property` huérfana vía `newProp()` y `addEdge` devolvería una arista que no
      está en la lista.

      ```ts
      addEdge(source: Node | Property, target: Node): Edge | null {
        if (source instanceof Property) {
          // Un par (source, target) idéntico es ruido puro: `addTriple`
          // (query.ts) ya lo colapsa en un único patrón y el canvas dibujaría
          // dos flechas superpuestas. Idempotente: se devuelve la existente.
          // No aplica al caso legítimo de una property con varios targets
          // distintos, contemplado en removeNodeFromGraph.
          const existing = this.edges.find(
            e => e.source === source && e.target === target,
          );
          if (existing) {
            this.log('Edge from property id ' + source.id + ' to node id ' + target.id + ' already exists');
            return existing;
          }
          ...
      ```

- [x] Reemplazar el comentario de `addEdgeToList` por un doc comment que diga que
      la invariante se garantiza aguas arriba en `addEdge`. **Que no quede un
      `TODO`, pero que tampoco se pierda la explicación.**
- [x] Agregar los casos al `describe('addEdge')` de
      `graph/domain/__tests__/graph-mutations.spec.ts:45`:
      - `addEdge(p, o)` dos veces con la misma property → `graph.edges.length === 1`
        y la segunda llamada devuelve **la misma** instancia.
      - `addEdge(s, o)` dos veces con `s` siendo un `Node` → `graph.edges.length === 2`
        y `s.properties.length === 2` (**la rama Node NO se deduplica**).
- [x] Verificar `graph-serializer.ts` Pass 5 (línea 240): usa
      `graph.addEdge(sourceProp, targetNode)`, o sea la rama `Property`. Un
      workspace viejo guardado con duplicados los va a **colapsar al cargar**.
      Es el comportamiento deseable (se auto-sana), pero revisar que ningún
      round-trip de `graph-serializer.spec.ts` dependa de conservar el duplicado.
- [x] Correr `query.golden.spec.ts`: el SPARQL generado **no cambió** en ningún
      golden, como predecía el análisis de impacto (`addTriple` ya deduplicaba).
      Era la guarda del ítem y pasó.

#### Criterio de aceptación

- [x] `grep -rnw "TODO\|FIXME\|HACK" --include='*.ts' backend/src frontend/*/src packages/*/src | grep -v spec`
      no devuelve nada.
- [x] **194** pruebas del Explorer verdes (191 + 3 nuevas), **incluidos los
      goldens sin cambios**.
- [x] Se agregaron 3 casos y no 2: además de la idempotencia y de que la rama
      `Node` **no** deduplica, se cubrió que una property con varios targets
      distintos sigue conservando sus aristas. Sin ese tercero, un dedup mal
      escrito (por `source` solo, sin `target`) pasaría los otros dos.

---

### Ítem 5 — Unificar el pnpm del workspace

**Severidad:** 🔴 Alta · **Esfuerzo:** ~30 min · **Riesgo:** bajo
**Requisito del [Ítem 3](#ítem-3--ci-mínimo--eslint-en-los-frontends).**

#### Por qué

`pnpm run` **aborta** en la raíz, en `backend/` y en `packages/contracts/`, y por
lo tanto `pnpm -r <script>` desde la raíz es imposible hoy. El síntoma es
alarmante y sale casi gratis de arreglar:

```
[ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY] Aborted removal of modules directory due to no TTY
    at runDepsStatusCheck (.../pnpm.mjs:249406:7)
```

pnpm lanza un chequeo de dependencias **antes** de correr cualquier script, ese
chequeo decide que `node_modules` está desactualizado, dispara un `pnpm install`
y ese install quiere **purgar el directorio de módulos**. Sin TTY aborta — que
es lo único que evita que se borre `node_modules`.

#### Causa raíz (verificada)

Hay **dos majors de pnpm pineados en el mismo workspace**:

| Paquete | `packageManager` | pnpm efectivo | `pnpm run` |
|---|---|---|---|
| raíz | `pnpm@11.10.0` | 11.10.0 | ❌ aborta |
| `backend` | *(hereda raíz)* | 11.10.0 | ❌ aborta |
| `packages/contracts` | *(hereda raíz)* | 11.10.0 | ❌ aborta |
| `frontend/app_shell` | `pnpm@10.33.4` | 10.33.4 | ✅ |
| `frontend/rdf_explorer` | `pnpm@10.33.4` | 10.33.4 | ✅ |
| `frontend/rdf_gis_explorer` | `pnpm@10.33.4` | 10.33.4 | ✅ |

El chequeo previo de dependencias es comportamiento **de pnpm 11**: los tres
frontends no lo tienen porque corepack les resuelve pnpm 10. El install que está
en disco se hizo con pnpm 11 (`node_modules/.modules.yaml` → `packageManager: pnpm@11.10.0`),
así que además los frontends operan con pnpm 10 sobre un árbol instalado por 11.

Descartado explícitamente: **no** es la versión de Node (falla igual en 22 y en
24), **no** es contaminación de npm (`backend/node_modules` son symlinks al store
de pnpm), **no** es drift del lockfile (el importer `backend` coincide 39/39 con
su `package.json`) y **no** son las mtimes (`app_shell` tiene `node_modules` igual
de viejo que `backend` y funciona).

#### Por qué `start.sh` sí funciona

Termina en **`exec npm run dev`** — npm, no pnpm. Y el script `dev` de la raíz
llama `npm run dev:backend`, `npm run dev:shell`, `npm run dev:explorer`… y un
solo `pnpm run start` para `dev:gis`, que cae justo en un directorio con pnpm 10.
**El stack levanta por casualidad**, no por diseño: alcanza con pinear pnpm 11 en
un frontend, o con cambiar ese `pnpm run` de lugar, para romperlo.

#### Pasos

- [x] Quitar el campo `packageManager` de los tres `package.json` de frontend.
      La raíz queda como **única** fuente de verdad (`pnpm@11.10.0`), que es
      además la versión con la que está hecho el install en disco.
- [x] Unificar los scripts de la raíz: `dev:backend`, `dev:shell` y `dev:explorer`
      usaban `npm run` y `dev:gis` usaba `pnpm run`. Los cuatro pasaron a `pnpm run`.
- [x] Desactivar el chequeo previo en **`pnpm-workspace.yaml`** con
      `verifyDepsBeforeRun: false`.
      **Ojo — corrección sobre lo que decía este plan:** un `.npmrc` con
      `verify-deps-before-run=false` **no funciona** en pnpm 11 (se probó y quedó
      inerte: los 6 paquetes seguían abortando). pnpm 11 lee estos settings desde
      `pnpm-workspace.yaml`, igual que `allowBuilds` y `patchedDependencies`. El
      flag por CLI (`--config.verify-deps-before-run=false`) sí funciona, y de ahí
      venía la confusión.
- [x] Quitar `frontend/rdf_explorer/.npmrc` (`package-manager-strict=false`):
      verificado que existía solo para tapar el split de versiones. Sin el
      `packageManager` divergente, corepack ya no se queja.
- [ ] **Pendiente para el usuario (requiere TTY):** correr un `pnpm install`
      limpio en la raíz para reconciliar el estado de `node_modules` con pnpm 11.
      No se hizo acá porque el install quiere **purgar `node_modules`** y eso no
      se ejecuta sin confirmación interactiva. No es bloqueante: con
      `verifyDepsBeforeRun: false` todo funciona.
- [ ] **Pendiente de smoke test manual:** `./start.sh` y `./start.sh .env.graphdb`
      (levanta 4 servidores; se verifica al cerrar el plan, no por ítem).

#### Criterio de aceptación

- [x] `pnpm run` funciona **en los 6 paquetes** y en la raíz.
- [x] `pnpm test` en `backend/` ejecuta de verdad (no solo lista): **165 verdes
      sobre Node 24.18.0**.
- [x] `grep -rn packageManager */package.json */*/package.json` devuelve **una
      sola** definición (la raíz).
- [ ] `pnpm -r --if-present test` desde la raíz corre las cuatro suites →
      se cierra en el Ítem 3, que agrega `--watch=false` a los frontends (hoy
      `ng test` se queda en modo watch y colgaría la corrida recursiva).
- [ ] `./start.sh` sigue levantando los cuatro servicios (smoke test final).

---

### Ítem 6 — Canvas: posiciones relativas tratadas como absolutas al inicializar

**Severidad:** 🟠 Media · **Esfuerzo:** ~1 h (≈20 líneas + test) · **Riesgo:** bajo

#### Por qué

Es un bug de usuario visible: al volver al Explorer desde el GIS **sin recargar**,
el canvas se crea con un grafo ya cargado y **todos los nodos aparecen apilados en
la misma columna**, sin relación con sus coordenadas guardadas. Se acomoda solo en
cuanto el grafo se re-renderiza (alcanza un clic en un nodo), lo que lo hace
parecer cosmético — pero es la primera impresión del usuario al volver de una
vista a la otra.

Es independiente de los datos: pasa igual con un grafo hecho a mano.

#### Evidencia

La asimetría está en el propio código, y el camino incremental **ya documenta**
la conversión que le falta al de arranque:

- **Arranque** — `canvas-graph.component.ts:66`:
  ```ts
  this.cy = cytoscape({ ..., elements: this.computeElements() });
  ```
  `computeElements()` emite los hijos con posiciones **relativas al padre**
  (literalmente `position: { x: 0, y: childY }`). Cytoscape interpreta todo lo
  que viene en `elements` como **coordenadas absolutas del modelo**.

- **Incremental** — `canvas-graph.component.ts:245-260`:
  ```ts
  // Child positions in computeElements are relative to parent center.
  // After init, el.position() uses absolute coords — so we must convert.
  el.position({ x: parentDomain.x + rel.x, y: parentDomain.y + rel.y });
  ```

Con `x: 0` para todos los hijos, cada hijo cae en la misma abscisa; y como la
posición de un nodo compuesto se deriva del bounding box de sus hijos
(`updateCompoundBounds` en el fuente de Cytoscape), **cada nodo compuesto termina
centrado en x ≈ 0**. De ahí la columna única.

#### Pasos

- [x] Convertir relativo → absoluto también en el camino de arranque. Se tomó la
      **opción 1** (la de fondo):
      1. Que `computeElements()` reciba el centro del padre y emita **siempre**
         posiciones absolutas. Entonces el bloque de conversión del camino
         incremental (`:245-260`) se puede **borrar**, y desaparece la asimetría
         que causó el bug. Es el arreglo de fondo.
      2. Dejar `computeElements()` como está y convertir en el sitio de creación.
         Más chico, pero mantiene dos convenciones de coordenadas en el mismo
         archivo — o sea, el mismo bug esperando volver.
- [x] Revisados los consumidores de `computeElements()`. Había **tres** lugares
      con la convención de coordenadas, no dos: el arranque (sin convertir) y
      **dos** bloques en `syncCytoscape` (el de update y el de `cy.add`), que sí
      convertían. Los dos bloques de conversión se borraron: ~30 líneas menos y
      una sola convención en todo el archivo.
- [x] **Desviación deliberada:** el armado de elementos se extrajo a
      `canvas-graph.elements.ts` como función pura (`buildCanvasElements`). Sin
      esa costura, el test de regresión exigía instanciar el componente con
      Cytoscape mockeado en jsdom para verificar lo que en el fondo es geometría.
      El directorio ya usa este patrón (`canvas-graph.drop.ts`,
      `canvas-graph.styles.ts`, `canvas-graph.context-menus.ts`).
- [x] Test de regresión sobre `buildCanvasElements`: nodos en coordenadas
      conocidas y distintas, y se afirma que las `x` de los hijos **difieren**
      entre sí y valen `node.x` (antes valían 0 para todos). Se agregaron 4 casos:
      el del bug, el centrado del bloque sobre `(node.x, node.y)`, el apilado de
      varios hijos y el nodo sin hijos.
- [ ] Verificación manual del camino que lo dispara: Explorer → exportar al GIS →
      volver al Explorer **sin recargar** (navegación del shell, no F5) → el grafo
      debe aparecer bien puesto **antes** de tocar nada (smoke test final).

#### Criterio de aceptación

- [x] Los 4 tests de regresión pasan.
- [x] **198** pruebas del Explorer verdes y `pnpm build` OK.
- [ ] Verificación manual OK, y el grafo no se "acomoda" al primer clic
      (smoke test final).

---

## 5. Decisiones de NO hacer

Documentadas para no volver a analizarlas.

### 5.1 — No partir `graph-view.component.ts` (todavía)

915 líneas, ~50 métodos, 15 campos de estado mutable. Es un God component de
manual **y aun así no lo tocaría ahora**:

- Buena parte de la complejidad es inherente a envolver Cytoscape, una librería
  imperativa. No es complejidad propia.
- Tiene **1.114 líneas de test propias** cubriéndolo.
- Está aislado: nadie depende de sus internos.

Partir un God component con buena cobertura y sin acoplamiento externo es el
refactor clásico que se siente productivo y no mejora ningún resultado medible.

**Si igual se decide hacerlo**, hay dos costuras limpias y baratas que lo bajan
a ~750 líneas sin tocar el núcleo:

- **Drag en vivo** → `startLiveDrag` / `endLiveDrag` / `rememberManualPosition` /
  `applyManualPositions` (~60 líneas).
- **Sincronía de viewport/foco** → `applyFocusContext` / `applyExternalFocus` /
  `emitFocusFromViewport` / `intersectsViewport` / `allInsideViewport` /
  `suppressViewport` (~90 líneas).

### 5.2 — `strict` en el backend: medir primero

`backend/tsconfig.json` no tiene `strict`, y tiene `noImplicitAny: false` y
`strictBindCallApply: false`. Es el default de Nest, pero convive con tres
frontends en `strict: true` + `strictTemplates`: asimetría de rigor en el mismo
repo.

**Acción:** activar `strict: true` + `noImplicitAny: true` y **contar los
errores**. Si son menos de ~20, arreglarlos (30-60 min). Si explotan a cien,
dejarlo documentado como deuda consciente y **no tocarlo antes de defender**.

### 5.3 — `process.env` → `ConfigService` (opcional)

`ConfigModule` está configurado y `AppConfigService` / `SuggestionsService` usan
`ConfigService` correctamente. Pero `QueryService` lee
`process.env['SPARQL_MAX_LIMIT']`, `SPARQL_DEFAULT_LIMIT` y `SPARQL_TIMEOUT_MS`
**en cada request**, y lo mismo pasa en `create-dashboard.dto.ts`,
`sqlite.provider.ts` y `sparql-endpoint.factory.ts`.

Son dos formas de leer configuración en el mismo backend, y la de `QueryService`
no es testeable sin manipular el entorno. **~30 min, cosmético pero visible.**
Hacerlo solo si sobra tiempo. Nota: el `factory` corre en construcción de
providers, así que ahí `process.env` es defendible.

### 5.4 — No hacer por sí solo

- **`app-config.service.ts` duplicado:** divergieron **a propósito**. El Explorer
  expone 8 `computed` del config; el GIS expone un `load()` con `shareReplay`.
  Unificarlos agregaría acoplamiento para servir dos necesidades distintas.
- **`dashboard-api.client` ×3** (32 / 70 / 67 líneas): tres clientes HTTP
  distintos sobre el mismo endpoint. Unificar cruza el límite de microfrontend
  por muy poco beneficio.
- **DI mixto `inject()` + constructor** (14 archivos): unificar a `inject()`
  cuando se toque cada archivo por otro motivo. Nunca en un commit propio.
- **22 `console.*`:** reemplazar por el `LogService` que ya existe en el Explorer,
  al pasar. No cambia nada estructural.
- **`federation.manifest.json` con `localhost`:** resolver recién cuando exista un
  despliegue real que no sea `docker compose`.

### 5.5 — Fuera de alcance para la tesis

- **Proxy SPARQL sin auth ni rate limiting:** correcto para una herramienta local
  de tesis. **Bloqueante el día que se exponga** a una red no confiable.
- **`backend/data/wikidata.sqlite` trackeado** (52 K, un solo commit): es
  intencional, alimenta los tableros demo del seed. Dejarlo.
- **Los 5 `eslint-disable-next-line`:** **no son deuda.** Cero `@ts-ignore` en
  todo el repo. Los 4 `no-explicit-any` están en el borde de interop con plugins
  de Leaflet, que augmentan un `window.L` global libre sin superficie de tipos en
  el módulo ESM — no existe un tipo honesto que escribir ahí. Cada uno tiene su
  comentario, se re-angosta a un tipo real en el acto
  (`const DrawControl: new (opts: unknown) => L.Control = ...` + guarda de
  runtime) y no deja escapar el `any`. Es el patrón correcto para un borde FFI.

---

### 5.6 — Hallazgo nuevo: `AppConfigService` también ramifica por backend

Apareció al verificar el criterio del Ítem 2. `app-config.service.ts` tiene
`const isWikidata = backend === 'wikidata'` (línea 88) y
`if (cfg.backend === 'wikidata')` en `defaultSearchClassFor` (línea 172), y lee
`SPARQL_ENDPOINT_URL` / `SPARQL_USERNAME` / `SPARQL_PASSWORD` por su cuenta.

**No se ejecutó, y es a propósito.** Es otra forma de problema: ahí el branch no
decide *comportamiento de consulta* (lo que el Ítem 2 sacó del servicio) sino que
produce **metadata de capacidades** para el frontend — la clase de búsqueda por
defecto, `supportsWikibaseLabel`, los prefixes, el archivo de colores por backend.

Arreglarlo bien significa que `SparqlEndpoint` exponga esas capacidades
(`defaultSearchClass`, `supportsWikibaseLabel`, `defaultPrefixes`), lo que toca la
interfaz, el DTO de `/api/config` y las 270 líneas de
`app-config.service.spec.ts`. Es una decisión de diseño con su propio alcance, no
la continuación del Ítem 2, así que queda documentada para decidirla aparte.

Mientras no se haga, la afirmación *domain-agnostic* de
`docs/design-decisions.md` §9 es verdadera para **ejecutar y buscar** (Ítem 2) y
sigue teniendo esta excepción en **describir el backend**.

## 6. Definition of done

- [x] Ítems 1 a 6 completos, cada uno en su propio commit (el 5 fue primero).
- [x] `pnpm test` desde la raíz sobre **Node 24.18.0**: **719 casos verdes**
      (176 backend + 17 shell + 198 explorer + 328 GIS), exit 0.
- [x] `pnpm run` funciona en los 6 paquetes y en la raíz (Ítem 5).
- [x] `pnpm build` desde la raíz: exit 0, los dos paquetes del workspace y las
      tres apps.
- [x] `pnpm lint` desde la raíz: exit 0, 108 warnings, **0 errores**.
- [ ] CI verde. **Bloqueado por el lockfile** — los tres pasos del workflow se
      verificaron localmente uno por uno.
- [x] Sin `TODO`/`FIXME` en código productivo.
- [ ] Verificación manual del camino crítico end-to-end:
      Welcome → Explorer (construir query) → exportar al GIS → cuatro vistas
      coordinadas → guardar tablero → recargar desde Welcome.
- [ ] Verificado con **los dos** entornos: `./start.sh` y `./start.sh .env.graphdb`.
- [ ] Volver del GIS al Explorer **sin recargar** deja el grafo bien posicionado
      de entrada, sin necesidad de un clic (Ítem 6).
- [ ] `docs/design-decisions.md` §9 revisado: después del ítem 2, la afirmación
      *domain-agnostic* es verificable en el código. Vale una línea que lo diga.

---

## Anexo A — Comandos de relevamiento

Para reproducir la línea base y medir el progreso.

```bash
# Líneas por área
for d in backend/src frontend/app_shell/src frontend/rdf_explorer/src \
         frontend/rdf_gis_explorer/src packages/contracts; do
  echo "$d: $(find $d -type f \( -name '*.ts' -o -name '*.html' -o -name '*.scss' \) \
    -not -path '*/node_modules/*' -exec cat {} + 2>/dev/null | wc -l) líneas"
done

# Archivos más grandes
find backend/src frontend packages -name '*.ts' -not -path '*/node_modules/*' \
  -not -path '*/dist/*' -not -path '*/.angular/*' -exec wc -l {} + | sort -rn | head -20

# Deuda declarada (case-sensitive y palabra completa: evita "TODOS" en castellano)
grep -rnw "TODO\|FIXME\|HACK\|XXX" --include='*.ts' backend/src frontend/*/src | grep -v spec

# Supresiones: distinguir ts-ignore (grave) de eslint-disable (angosto)
grep -rn "@ts-ignore\|@ts-nocheck\|@ts-expect-error" --include='*.ts' backend/src frontend/*/src
grep -rn "eslint-disable" --include='*.ts' backend/src frontend/*/src

# any y console en productivo
grep -rn ": any\|as any\|<any>" --include='*.ts' backend/src frontend/*/src | grep -v spec | wc -l
grep -rn "console\." --include='*.ts' backend/src frontend/*/src | grep -v spec | wc -l

# Acoplamiento entre remotes (debe dar 0)
grep -rn "rdf_explorer\|rdf_gis_explorer" --include='*.ts' frontend/*/src \
  | grep -v spec | grep import | wc -l

# Suites
cd backend && npx jest --silent
cd frontend/rdf_explorer && npx ng test --watch=false
cd frontend/rdf_gis_explorer && npx ng test --watch=false
cd frontend/app_shell && npx ng test --watch=false
```
