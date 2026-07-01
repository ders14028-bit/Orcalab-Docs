# Atributos de Calidad — OrcaLab

## Principio rector (el mismo de las decisiones arquitectónicas)

Cada atributo de calidad que se declare "en alcance" debe:
1. Trazarse a una HU, un KPI o una exigencia explícita del profesor.
2. Tener un escenario medible (Source/Stimulus/Artifact/Environment/Response/Measure).
3. Tener una táctica arquitectónica concreta que lo soporte (no una aspiración).

Si un atributo no cumple las tres cosas, se declara **fuera de alcance de forma explícita**, con su justificación. Eso es preferible a fingir que "todo aplica un poco" — es exactamente el error que ya corregimos una vez (agregar cosas "porque es buena práctica" en abstracto).

---

## Resumen ejecutivo

| Atributo | Estado | Fuente de la exigencia |
|---|---|---|
| Desempeño | En alcance (ya existía) | HU-07/08/09, KPI-02 |
| Seguridad | En alcance (ya existía) | HU-03, KPI-04 |
| Observabilidad | En alcance (ya existía) | HU-14/15/17 |
| **Disponibilidad** | **En alcance (nuevo)** | Exigencia explícita del profesor: "soportar muchos usuarios" |
| **Escalabilidad** | **En alcance (nuevo)** | Misma exigencia + KPI-01 (relectura) |
| **Modificabilidad** | **En alcance (nuevo)** | Consecuencia directa de la decisión de 5 microservicios |
| Usabilidad | Fuera de alcance (justificado) | No hay HU ni criterio de aceptación con métrica de UX |
| Portabilidad | Fuera de alcance (justificado) | Un solo target de despliegue (web), no hay requisito multi-plataforma |
| Compatibilidad/Interoperabilidad avanzada | Parcialmente cubierta, no formalizada como escenario propio | Ya se resuelve como integración puntual (OSM, SMTP), no amerita escenario con métrica independiente |

---

## 1. Desempeño (Performance Efficiency)

**Por qué está en alcance:** HU-07 (mapa ≤500ms), HU-08 (timeline ≤300ms), HU-09 (chat ≤200ms) tienen métricas explícitas de latencia. KPI-02 exige ≤1s de latencia de visibilidad de observación.

**Escenario (ya definido, se mantiene):**

| Campo | Valor |
|---|---|
| Source | Investigador autenticado |
| Stimulus | Registra un marcador de observación en el mapa |
| Artifact | realtime-service (endpoint de marcadores) |
| Environment | Sala activa con ≥2 usuarios conectados, carga normal |
| Response | El marcador se publica en Redis y se propaga vía WebSocket a todos los clientes de la sala |
| Measure | Visible en los demás clientes en ≤500ms (p95) |

**Táctica arquitectónica:** Redis pub/sub como bus de baja latencia; WebSocket persistente en vez de polling; separación de realtime-service como servicio dedicado (no compite por recursos con reporting/observability).

---

## 2. Seguridad

**Por qué está en alcance:** HU-03 (RBAC), KPI-04 (100% de peticiones filtradas por rol, cero tolerancia). Es además el único KPI con meta de cero tolerancia — el más crítico del proyecto porque hay datos sensibles reales (ubicación de especies protegidas).

**Escenario (ya definido, se mantiene, ajustando el componente a la arquitectura actual):**

| Campo | Valor |
|---|---|
| Source | Usuario con rol "Público" |
| Stimulus | Intenta acceder a coordenadas exactas de una observación vía REST |
| Artifact | auth-service (validación JWT) + room-service/realtime-service (filtrado de respuesta según rol) |
| Environment | Producción, petición autenticada con JWT válido pero rol insuficiente |
| Response | El sistema valida el JWT localmente, filtra por rol, retorna solo ubicación aproximada |
| Measure | 100% de las peticiones filtradas correctamente; cero coordenadas exactas expuestas a roles no autorizados |

**Táctica arquitectónica:** JWT firmado y validado localmente en cada servicio (sin llamada síncrona obligatoria a auth-service, reduce acoplamiento sin sacrificar seguridad); filtrado de campos sensibles a nivel de servicio antes de responder, no a nivel de frontend (nunca confiar en que el cliente oculte el dato — si se manda, ya se filtró mal).

---

## 3. Observabilidad

**Por qué está en alcance:** HU-14/15/17 son épica completa dedicada a esto; hay servicio propio (observability-service) con Prometheus + Loki.

**Escenario (ya definido, se mantiene):**

| Campo | Valor |
|---|---|
| Source | Cualquier servicio del sistema |
| Stimulus | La latencia promedio de un flujo crítico (ej. propagación de marcador) supera 500ms |
| Artifact | observability-service |
| Environment | Producción, bajo carga variable |
| Response | Se registra el log estructurado, se actualiza la métrica en Prometheus, se genera alerta en Grafana |
| Measure | Alerta visible en ≤10s con contexto completo (servicio origen, timestamp, valor medido) |

**Táctica arquitectónica:** logs estructurados desde el origen (no parseo posterior de texto libre); métricas push/scrape a Prometheus; correlación por trace/request-id entre servicios.

---

## 4. Disponibilidad (NUEVO — resuelve el punto que quedó abierto)

**Por qué entra ahora en alcance:** el profesor pidió explícitamente que la plataforma "soporte muchos usuarios". Eso no es solo un tema de capacidad (escalabilidad) sino también de **qué pasa cuando un componente falla bajo esa carga** — si una sala de investigación pierde conexión durante una sesión de campo en vivo, se pierde la razón de ser del producto (colaboración en tiempo real).

**Alcance realista para un proyecto académico (importante ser honesto aquí):** no se exige alta disponibilidad de nivel productivo (multi-región, failover automático de base de datos, etc.). Se exige que la arquitectura **demuestre intención y mecanismo de recuperación ante fallos parciales**, medible en el escenario, no que se despliegue infraestructura de disponibilidad 99.99%.

**Escenario:**

| Campo | Valor |
|---|---|
| Source | Fallo transitorio de red o caída de una instancia de realtime-service |
| Stimulus | Se pierde la conexión WebSocket de un cliente activo en una sala |
| Artifact | Cliente Web + API Gateway + realtime-service |
| Environment | Sala activa con múltiples usuarios, degradación parcial (no caída total del sistema) |
| Response | El cliente detecta la desconexión, reintenta la conexión automáticamente, y al reconectar recupera el estado de la sala (presencia, últimos marcadores) desde Redis |
| Measure | Reconexión exitosa en ≤5s; cero pérdida de observaciones ya confirmadas (persistidas en MongoDB antes del corte) |

**Táctica arquitectónica:** reconexión automática con backoff en el cliente; separación de estado efímero (Redis, recuperable) de estado durable (MongoDB/PostgreSQL, nunca se pierde); statelessness de los servicios REST para permitir que cualquier instancia atienda la siguiente petición.

---

## 5. Escalabilidad (NUEVO — distinto de desempeño, y aquí está la diferencia que hay que dejar clara en la sustentación)

**Por qué entra en alcance:** misma exigencia del profesor. La diferencia con Desempeño es la siguiente y hay que decirla explícita en la sustentación:
- **Desempeño** mide qué tan rápido responde el sistema con la carga *actual* (KPI-02, ≤1s).
- **Escalabilidad** mide si esa misma latencia se mantiene cuando la carga *crece* (más salas, más usuarios concurrentes).

**Sobre la decisión que quedó abierta (EC2/nodos separados):** se cierra así para esta entrega — no se requiere desplegar múltiples nodos físicos reales para el proyecto académico, pero la arquitectura **debe estar diseñada para poder hacerlo sin refactor** (esto se demuestra en el diagrama de despliegue con múltiples réplicas de realtime-service detrás de un balanceador, y Redis como estado compartido en vez de estado en memoria local del proceso). Es una decisión de diseño demostrable en el diagrama, no necesariamente una prueba de carga real con infraestructura productiva.

**Escenario:**

| Campo | Valor |
|---|---|
| Source | Incremento de salas activas simultáneas (de baseline a carga alta, ej. 10x) |
| Stimulus | Múltiples salas de investigación operando en paralelo en horario pico de campo |
| Artifact | realtime-service (stateless) + Redis compartido + balanceador de carga |
| Environment | Producción simulada / prueba de carga |
| Response | El sistema distribuye las conexiones WebSocket entre múltiples instancias de realtime-service; Redis mantiene el estado de presencia y pub/sub compartido entre instancias |
| Measure | La latencia de propagación de marcador se mantiene ≤500ms (mismo umbral de HU-07) aun con el incremento de carga; ninguna instancia individual se convierte en cuello de botella único |

**Táctica arquitectónica:** servicios stateless horizontalmente escalables; Redis como fuente única de verdad para estado compartido (no memoria local del proceso); balanceador de carga en el diagrama de despliegue.

---

## 6. Modificabilidad (NUEVO — consecuencia directa de haber pasado a 5 microservicios)

**Por qué entra en alcance:** es literalmente la justificación que el profesor dio para exigir microservicios en vez de monolito. Si se declaran 5 microservicios pero nunca se demuestra que efectivamente se puede modificar uno sin tocar los demás, la decisión de arquitectura queda sin sustento medible — y ese es justo el estándar que nos hemos exigido en todas las decisiones anteriores.

**Escenario:**

| Campo | Valor |
|---|---|
| Source | Equipo de desarrollo |
| Stimulus | Se requiere agregar un nuevo tipo de alerta en tiempo real (extensión de HU-10) |
| Artifact | realtime-service exclusivamente |
| Environment | Ambiente de desarrollo, sistema en producción sin interrupción de los demás servicios |
| Response | El cambio se implementa, prueba y despliega tocando únicamente realtime-service; los demás 4 servicios no requieren cambios de código ni redeploy |
| Measure | 0 archivos modificados fuera de realtime-service; 0 downtime en auth-service, room-service, reporting-service, observability-service durante el despliegue del cambio |

**Táctica arquitectónica:** límites de servicio alineados a épicas (bounded contexts claros); comunicación por contrato (REST + eventos versionados) en vez de acoplamiento a código compartido; despliegue independiente por servicio (ya implícito en la decisión de "no monolito", ahora con métrica propia).

---

## Atributos explícitamente fuera de alcance

### Usabilidad
No hay ninguna HU ni criterio de aceptación que defina una métrica de usabilidad (ej. tiempo de tarea, tasa de error de usuario, SUS score). Es un atributo real e importante para el producto, pero no es un atributo de calidad **arquitectónicamente significativo** en este proyecto — no hay una decisión de arquitectura que se tome distinto por causa de usabilidad. Se maneja a nivel de diseño de interfaz, no de arquitectura de software.

### Portabilidad
El sistema tiene un solo target de despliegue (aplicación web). No existe requisito de ejecutar en múltiples plataformas/sistemas operativos que exija abstracción arquitectónica adicional. Declarar portabilidad como atributo en alcance sin esa exigencia sería agregar una decisión "porque es buena práctica" — justo lo que decidimos no hacer.

### Compatibilidad/Interoperabilidad (como atributo formal independiente)
Ya se resuelve puntualmente: integración con OpenStreetMap (API externa de mapas) y SMTP (envío de correo). Son integraciones puntuales con contratos externos estables, no un requisito arquitectónico transversal que amerite su propio escenario con métrica. Se documenta como parte del diagrama de contexto (ya vigente), no como atributo de calidad separado.

---

## Tabla de trazabilidad completa

| Atributo | HU relacionadas | KPI relacionado | Escenario con métrica | Táctica principal |
|---|---|---|---|---|
| Desempeño | HU-07, 08, 09 | KPI-02 | ≤500ms propagación marcador | Redis pub/sub + WebSocket |
| Seguridad | HU-03, 14 | KPI-04 | 100% filtrado por rol | JWT local + filtrado server-side |
| Observabilidad | HU-14, 15, 17 | — | Alerta visible ≤10s | Logs estructurados + Prometheus/Loki |
| Disponibilidad | HU-06, 07 | KPI-01 (indirecto) | Reconexión ≤5s, 0 pérdida de datos confirmados | Reconexión con backoff + estado durable separado |
| Escalabilidad | HU-06, 07 | KPI-01 (releído) | Latencia se mantiene ≤500ms con 10x carga | Stateless + Redis compartido + balanceador |
| Modificabilidad | Todas (transversal) | — | 0 archivos fuera del servicio modificado | Bounded contexts por épica + contratos versionados |

---

## Nota para la sustentación

Cuando el profesor pregunte "¿por qué ahora sí escalabilidad y disponibilidad si antes decían que no aplicaban?", la respuesta honesta y defendible es: **no es que no aplicaran, es que las HU originales no las exigían con métrica propia — fue una decisión consciente de alcance en su momento.** Lo que cambió fue una exigencia nueva y explícita (soportar muchos usuarios), y en vez de ignorarla o de agregarla sin sustento, se le dio el mismo tratamiento riguroso que a los demás atributos: escenario medible + táctica concreta + trazabilidad a la exigencia real. Esa es la historia coherente, no una improvisación de última hora.
