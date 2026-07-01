# Historial de Decisiones Arquitectónicas — OrcaLab

Principio rector usado en cada decisión: cada componente debe trazarse a una HU, un criterio de aceptación o un escenario de calidad con métrica medible. Nada se agrega "porque es buena práctica" en abstracto. Pregunta de prueba antes de agregar cualquier pieza: **¿qué se rompe si la quito?**

## Recorrido

1. **Arquitectura híbrida REST + Pub/Sub en un solo backend Spring Boot (monolito modular).** Punto de partida.
2. **El profesor exige explícitamente NO usar monolito** → pivote a 2 servicios separados: `core-service` (REST) + `realtime-service` (STOMP/WebSocket + Redis), con arquitectura hexagonal aplicada solo en `realtime-service`.
3. **El profesor evaluó esto y dijo que la parte hexagonal "no sería implementable"** para el alcance del proyecto y sugirió microservicios.
4. **Decisión definitiva: 5 microservicios, uno por épica.** No se está reconsiderando esta decisión salvo nueva justificación.
5. **Se evaluó arquitectura orientada a eventos pura entre los 5 servicios** → se concluyó que NO simplifica (introduce consistencia eventual, necesitaría Kafka/RabbitMQ para ser confiable, ya descartado antes por sobre-ingeniería). Se mantiene REST + eventos selectivos vía Redis, con validación de JWT local en cada servicio.

## Decisiones explícitamente descartadas (no reabrir sin nueva justificación)

| Descartado | Por qué |
|---|---|
| Kafka / NATS / MQTT | Redis cubre el volumen real; KPI-01 solo exige ≥2 usuarios/sala |
| EC2/nodos físicos separados como requisito obligatorio | La separación de procesos ya cumple "no monolito"; separar máquinas añadiría latencia sin beneficio medible bajo la carga original — **este punto se reabrió parcialmente** (ver abajo) |

## Punto reabierto y cerrado: escalabilidad/disponibilidad

El profesor pidió explícitamente que la plataforma "soporte muchos usuarios" — un requisito nuevo no capturado completamente en el KPI-01 original (≥2 usuarios/sala es una meta modesta). Se resolvió así:

- **No** se requiere infraestructura multi-nodo real desplegada para la entrega académica.
- **Sí** se requiere que la arquitectura esté diseñada para escalar horizontalmente sin refactor: servicios stateless, Redis como estado compartido (no memoria local del proceso), balanceador de carga en el diagrama de despliegue.
- Ver `atributos-calidad.md` → secciones de Disponibilidad y Escalabilidad para el detalle con escenarios medibles.

## Arquitectura actual decidida: 5 microservicios por épica

| Microservicio | HU que cubre | Base de datos | Tipo | Por qué |
|---|---|---|---|---|
| auth-service | HU-01, 02, 03 | PostgreSQL | Relacional | Relaciones usuario-rol-permiso estrictas, requiere ACID |
| room-service | HU-04, 05, 06 | PostgreSQL | Relacional | Integridad referencial sala-líder-miembro |
| realtime-service | HU-07, 08, 09, 10 | Redis + MongoDB | No relacional (mixto) | Redis: presencia/pub-sub efímero (TTL) + bus de eventos. MongoDB: observaciones/mensajes/rutas (esquema variable) |
| reporting-service | HU-11, 12, 13, 16 | Sin DB propia de escritura | Derivada | Lee vista materializada / read replica / eventos de otros servicios — no duplica datos |
| observability-service | HU-14, 15, 17 | Prometheus + Loki | Series de tiempo + logs | Métricas y logs no son relacionales ni documento |

**Comunicación:**
- API Gateway al frente de los 5 servicios (punto de entrada único).
- REST síncrono (línea sólida en los diagramas): operaciones CRUD/transaccionales.
- Eventos vía Redis pub/sub (línea punteada): tiempo real cliente-servidor y bus de integración entre microservicios (ej. `auth-service` publica `UsuarioUnidoASala`, `realtime-service` lo consume).
- JWT validado localmente por cada servicio (firma verificable sin llamar siempre a auth-service) para reducir acoplamiento síncrono.

## Estado de los entregables

**Vigente y reutilizable:** diagrama de contexto (nivel 1), los 3 escenarios de calidad originales (Desempeño, Seguridad, Observabilidad — solo cambia qué microservicio implementa cada uno), los 4 KPIs, las 17 HU.

**Actualizado en esta ronda:** diagrama de contenedores (5 microservicios), atributos de calidad (se agregaron Disponibilidad, Escalabilidad, Modificabilidad con justificación).

**Pendiente:** diagrama de componentes, diagrama de clases, diagrama de despliegue, actualizar PPTX y guion de sustentación a la arquitectura de 5 microservicios.
