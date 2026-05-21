# M06 — Curation Panel

## 1. Contexto

Panel lateral (sidenav derecho) para operaciones **avanzadas** de curado sobre un nodo: validación masiva, historial de anotaciones, gestión de duplicados, vista comparativa (raw / script / manual).

**Importante: la edición rápida campo-a-campo NO es exclusiva de este panel.** M02 (tabla) implementa edición inline en cada celda usando el mismo `CurationService` que vive en `frontend/src/app/core/services/curation.service.ts` (creado por M02). M06 reutiliza ese servicio, no lo duplica.

División de responsabilidades:

| Operación | Lugar |
|---|---|
| Corregir un campo puntual de una fila | M02 (✏️ inline) |
| Ver historial / anotaciones de un nodo | M06 (tab Anotaciones) |
| Validar TODOS los campos del nodo en un click | M06 (botón Validar todo) |
| Confirmar / descartar duplicados | M06 (tab Duplicados) |
| Ver lado a lado raw / script / manual | M06 (tab Datos) |

Las correcciones se guardan en SQLite (overlay) **sin tocar el grafo original**.

## 2. Alcance

**SÍ implementa:**
- Componente Angular standalone `CurationPanelComponent` montado en un `MatSidenav`.
- Tres tabs: **Datos** / **Anotaciones** / **Duplicados**.
- Edición campo a campo con persistencia en backend.
- Botón "Validar todo".
- Lista de candidatos a duplicado con score; acciones confirmar/descartar/diferir.
- Indicador visual de `flags.hasPendingReview`.

**NO implementa:**
- Detección automática de anomalías (script externo).
- Generación de candidatos a duplicado (modulo Deduplicador del OVS, externo).

## 3. Requerimientos funcionales

| ID PDF | Prioridad | Descripción | Criterio de aceptación |
|---|---|---|---|
| CUR-01 | Alta | Panel lateral con datos / anotaciones / duplicados | Sidenav abre al haber `selectedNode` no null; 3 tabs funcionan |
| CUR-02 | Alta | Mostrar valor crudo, corregido por script, validado | Cada fila muestra las 3 columnas si existen |
| CUR-03 | Alta | Edición y validación campo a campo persiste en SQLite | POST/PATCH al backend; el record aparece tras refresh |
| CUR-04 | Alta | "Validar todo" en un click | Botón crea N records con status='validated' |
| CUR-05 | Alta | Lista de duplicados con score, confirmar/descartar | Tab Duplicados muestra; acciones llaman al backend |
| CUR-06 | Alta | Toda corrección persiste con author, timestamp | Verificable en SQLite |
| CUR-07 | Alta | Grafo TTL nunca se modifica | Backend nunca hace UPDATE a Wikidata/MillenniumDB (solo lectura) |
| CUR-08 | Media | Marca visual en nodos con `flags.hasPendingReview` | Borde punteado en grafo, mapa y timeline |

## 4. Dependencias

- **Lee de:** `selectedNode$`, `CurationService` (ya existe en `core/services/`, creado por M02 en Wave 2).
- **Emite a:** mismo `CurationService` (POST/PATCH `/curation`, `/curation/duplicates/:id/decision`).
- **Librerías:** `@angular/cdk` (Sidenav), `@angular/material` (Tabs, Form Fields, Snackbar).

**No duplicar** `CurationService`. Si M02 ya está implementado (Wave 2), el servicio existe. Si M06 se implementa antes de M02 (raro), entonces M06 lo crea y M02 lo reutiliza.

## 5. Interfaces TypeScript

```ts
// frontend/src/app/features/curation-panel/curation-panel.component.ts
@Component({
  selector: 'app-curation-panel',
  standalone: true,
  imports: [MatSidenavModule, MatTabsModule, MatFormFieldModule, ...],
  templateUrl: './curation-panel.component.html',
})
export class CurationPanelComponent implements OnInit, OnDestroy {
  selectedNode: NormalizedNode | null = null;
  records: CurationRecord[] = [];
  duplicates: DuplicateCandidate[] = [];
  isOpen = false;

  editField(fieldName: string, newValue: string): void { /* ... */ }
  validateAll(): void { /* ... */ }
  decideDuplicate(id: number, decision: 'confirmed' | 'rejected'): void { /* ... */ }
}
```

### Service para curado

```ts
@Injectable({ providedIn: 'root' })
export class CurationService {
  constructor(private http: HttpClient) {}

  getForNode(nodeUri: string) {
    return this.http.get<{ records: CurationRecord[]; duplicates: DuplicateCandidate[] }>(
      `/api/curation/${encodeURIComponent(nodeUri)}`
    );
  }
  create(dto: CreateCurationDto) {
    return this.http.post<CurationRecord>('/api/curation', dto, {
      headers: { 'X-Author': this.authorEmail() },
    });
  }
  // ... patch, deduplicate decision
}
```

### Resolución de valor a mostrar

```ts
function effectiveValue(record: CurationRecord, raw: string | undefined): string {
  return record?.manualValue ?? record?.scriptValue ?? raw ?? '';
}
```

## 6. Contrato HTTP

Consume todos los endpoints `/curation/*` de M08. Detalles en `docs/modules/M08-backend-api.md` §6.

## 7. Comportamiento esperado

### Apertura del panel
1. Suscripción a `selectedNode$`.
2. Si `node` no null → cargar `CurationService.getForNode(node.uri)`, abrir Sidenav.
3. Si `node` null → cerrar Sidenav.

### Tab Datos
- Tabla con columnas: `Campo | Crudo | Script | Manual | Estado | Acciones`.
- Cada fila tiene un icono ✏️. Click → input editable + botones Guardar/Cancelar.
- Al guardar:
  - Si no existe `CurationRecord` para `(nodeUri, fieldName)`: POST.
  - Si existe: PATCH.
- Snackbar de confirmación.

### Tab Anotaciones
- Lista cronológica de records del nodo: autor, timestamp, valor anterior/nuevo, status.
- Solo lectura.

### Tab Duplicados
- Lista de `DuplicateCandidate` para este `nodeUri`.
- Cada item: el otro URI, score, acciones [Confirmar] [Descartar] [Diferir].
- Confirmar dispara `POST /curation/duplicates/:id/decision { decision: 'confirmed' }` y marca visualmente ambos nodos.

### Validar todo
1. Iterar atributos del nodo.
2. Por cada uno sin record o con status !== 'validated', crear record con `status: 'validated'`, `manual_value: null` (o el `rawValue` si se quiere snapshot).
3. Snackbar: "N campos validados".

## 8. Wireframe ASCII

```
┌──────────────────────────────────────┐
│ ▼ Detalle de Buenos Aires        ×   │
├──────────────────────────────────────┤
│ [Datos] [Anotaciones] [Duplicados]   │
├──────────────────────────────────────┤
│ Campo     Crudo      Script   Manual │
│ ─────────────────────────────────────│
│ label     B. Aires    —       Buenos │ ← validado
│                               Aires  │
│ pop       3075646     —       —      │ ← crudo
│ coord     -34.6,-58.4 —       —      │
│                                      │
│           [Validar todo]             │
└──────────────────────────────────────┘
```

## 9. Criterios de aceptación

- [ ] Sidenav abre/cierra según selección.
- [ ] Las 3 tabs funcionan.
- [ ] Edición persiste en backend (verificable con `curl GET /curation/...` después).
- [ ] "Validar todo" crea N records.
- [ ] Tab Duplicados muestra candidatos; decisiones persisten.
- [ ] Author tomado de localStorage o env (default `martin@bago.com.ar` en dev).
- [ ] Nodo con `flags.hasPendingReview` se ve marcado en M03/M04/M05 (coordinar con ellos).

## 10. Prompt para AI ejecutora

```
Sos un experto en Angular 17 + Angular Material + REST.

Lee primero:
- docs/00-architecture.md
- docs/01-tech-stack.md
- docs/02-data-contracts.md (§4)
- docs/04-conventions-and-glossary.md
- docs/modules/M06-curation.md (este archivo)
- docs/modules/M07-selection-service.md
- docs/modules/M08-backend-api.md (todos los endpoints /curation/*)

Pre-requisitos: M07 y M08 implementados.

Archivos a crear:
- frontend/src/app/features/curation-panel/curation-panel.component.{ts,html,scss}
- frontend/src/app/core/services/curation.service.ts
- frontend/src/app/features/curation-panel/curation-panel.component.spec.ts

Restricciones:
- NO modifiques M07, M08 ni 02-data-contracts.md.
- Standalone components.
- Author email leído de localStorage con default 'martin@bago.com.ar'.

Definición de hecho:
- Criterios §9 verificados.
- Demo: seleccionar un nodo, editar un campo, ver record en sqlite (`docker compose exec backend sqlite3 data/curation.db 'SELECT * FROM curation_records'`).
```
