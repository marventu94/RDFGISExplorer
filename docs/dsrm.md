# Marco DSRM — mapeo del artefacto a las etapas

> La tesis sigue **Design Science Research Methodology** [Peffers et al.
> 2006]. Este documento fija en qué etapa está cada componente del trabajo,
> para que la trazabilidad paper → artefacto → evaluación sea explícita.

## Las 6 actividades y su materialización

| # | Actividad DSRM | Materialización en este trabajo | Estado |
|---|----------------|----------------------------------|--------|
| 1 | Identificación del problema y motivación | **Paper DECISIONING 2026** (rapid review de 30 trabajos: solo 7/30 integran G+S+T, todos domain-specific, ecosistema frágil) + análisis del dominio OVS (consultas SPARQL reales de los analistas del LINTA, con su complejidad y errores documentados) | ✅ Completa |
| 2 | Objetivos de la solución | **Requisitos de diseño derivados del paper** — cada decisión del artefacto trazada a un hallazgo del estado del arte ([design-decisions.md](./design-decisions.md)) + requerimientos del LINTA acotados al alcance de la tesis | ✅ Completa |
| 3 | Diseño y desarrollo | **RDFGISExplorer**: AppShell + RDF Explorer (query builder visual) + RDF GIS Explorer (4 vistas coordinadas) + backend Adapter SPARQL genérico; panel de resumen; export completo; límites por configuración | ✅ Completa (iterativa) |
| 4 | Demostración | **Caso de estudio OVS**: grafo real en GraphDB (~81M tripletas con `rdf:type`), escenarios de prueba basados en las consultas reales de los analistas (p. ej. E01 "¿cuánto vale una casa en Berisso?") | 🔄 En curso |
| 5 | Evaluación | **Estudio con usuarios del LINTA** (5-10 analistas): tasa de éxito, tiempo, errores y carga cognitiva (NASA-TLX), comparado contra SPARQL manual | ⏳ Pendiente |
| 6 | Comunicación | Paper DECISIONING 2026 (problema + estado del arte) · esta documentación · tesis en redacción | 🔄 En curso |

## Componente → etapa

| Componente | Etapa | Notas |
|------------|-------|-------|
| Rapid review (paper) | 1-2 | Identifica brechas; sus research opportunities se convierten en objetivos de diseño |
| RDF Explorer (query builder) | 3 | Extiende el paradigma de Vargas et al. [2019], parte del corpus del propio paper |
| RDF GIS Explorer (4 vistas) | 3 | Materializa la conclusión RQ2 del paper (linked views) |
| Backend Adapter SPARQL | 3 | Responde a la brecha de generalización (§5 del paper) |
| Panel de resumen + export | 3 | Cierra las tareas generales simples sin volverse herramienta analítica |
| Escenarios OVS (GraphDB real) | 4 | Datos y preguntas reales del LINTA |
| Estudio con usuarios | 5 | Es además el *future work* declarado del propio paper: *"user studies involving both experts and non-experts"* |

## Coherencia del encuadre

El hilo conductor es cronológico y honesto: el paper se escribió primero, el
software después — las decisiones de diseño se derivan de los hallazgos de la
review, no se justifican a posteriori. La evaluación con usuarios (etapa 5,
pendiente) no es un agregado externo: es exactamente el trabajo futuro que el
paper identifica como necesario para el campo.

## Referencia

- [Peffers et al. 2006] Peffers, K., Tuunanen, T., Gengler, C. E., Rossi, M.,
  Hui, W., Virtanen, V., & Bragge, J. "The Design Science Research Process: A
  Model for Producing and Presenting Information Systems Research."
  Proceedings of DESRIST 2006, 83–106.
- [Venturino et al. 2026] Paper DECISIONING 2026 — ver
  [design-decisions.md](./design-decisions.md) §Referencias.
- [Vargas et al. 2019] "RDF Explorer: A Visual SPARQL Query Builder."
  ISWC 2019.
