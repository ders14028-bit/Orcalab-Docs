# OrcaLab — Documentación de Arquitectura

Plataforma web colaborativa en tiempo real para investigación y conservación de orcas. Permite a investigadores trabajar simultáneamente en salas compartidas con mapa colaborativo en vivo, línea temporal sincronizada, chat contextual, presencia de usuarios y panel de observaciones.

Este repositorio contiene la **documentación transversal** del proyecto — lo que describe al sistema como un todo, no a un microservicio en particular. El código vive en repos separados (ver mapa abajo).

## Mapa de repositorios

| Repo | Responsabilidad | HU que cubre |
|---|---|---|
| **orcalab-docs** (este) | Diagramas C4, decisiones, atributos de calidad, orquestación de la demo | — |
| `orcalab-auth-service` | Registro, login, roles/RBAC | HU-01, 02, 03 |
| `orcalab-room-service` | Crear sala, unirse, presencia | HU-04, 05, 06 |
| `orcalab-realtime-service` | Mapa colaborativo, timeline, chat, alertas | HU-07, 08, 09, 10 |
| `orcalab-reporting-service` | Panel general, consulta de observaciones, reportes | HU-11, 12, 13, 16 |
| `orcalab-observability-service` | Logs estructurados, métricas, dashboard técnico | HU-14, 15, 17 |
| `orcalab-api-gateway` | Punto de entrada único, ruteo a los 5 microservicios | — |
| `orcalab-frontend` | Cliente web (React + Vite) | Todas (consume las HU vía API Gateway) |

## Contenido de este repo

```
diagramas/              Diagramas C4 en formato .drawio
  02-contenedores.drawio    (contexto ya vigente, se agrega aquí en próxima ronda)
decisiones/
  historial-decisiones.md  Recorrido completo de decisiones arquitectónicas y por qué
atributos-calidad.md       Los 6 atributos de calidad en alcance, con escenario y táctica cada uno
infra/
  prometheus.yml            Config de scraping para la demo local
docker-compose.yml          Levanta el sistema completo (7 servicios + infra) para la demo
```

## Cómo correr la demo completa

Clona este repo y los 7 repos de servicio **como carpetas hermanas**, todos bajo el mismo directorio padre:

```
proyectos/
  orcalab-docs/
  orcalab-auth-service/
  orcalab-room-service/
  orcalab-realtime-service/
  orcalab-reporting-service/
  orcalab-observability-service/
  orcalab-api-gateway/
  orcalab-frontend/
```

Luego, desde `orcalab-docs/`:

```bash
docker compose up --build
```

Esto levanta: los 5 microservicios, el API Gateway, el frontend, y la infraestructura (2x PostgreSQL, Redis, MongoDB, Prometheus, Loki, Grafana).

| Servicio | Puerto |
|---|---|
| Frontend | http://localhost:3000 |
| API Gateway | http://localhost:8080 |
| Grafana | http://localhost:3001 |
| Prometheus | http://localhost:9090 |

## Principio rector del proyecto

Cada componente de la arquitectura debe trazarse a una HU, un criterio de aceptación o un escenario de calidad con métrica medible. Ver `decisiones/historial-decisiones.md` para el razonamiento completo detrás de cada decisión (por qué 5 microservicios, qué se descartó y por qué, qué queda abierto).
