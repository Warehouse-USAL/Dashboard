# Plan — Conectar el dashboard a las nuevas APIs del backend (commit d303857)

> Backend de referencia: `C:/Users/Usuario/wh-backend`, commit `d303857`.
> Guía original del backend: `docs/DASHBOARD_INTEGRATION.md` en ese repo.

## Contexto

El backend agregó dos APIs pensadas específicamente para nosotros:

| API                                            | Responde                    | Fuente                             |
| ---------------------------------------------- | --------------------------- | ---------------------------------- |
| `POST /metrics/query` + `GET /metrics/catalog` | series temporales de rovers | VictoriaMetrics (30d de retención) |
| `POST /query/{entity}` + `GET /query/catalog`  | agregaciones de negocio     | MongoDB                            |

Nuestro dashboard hoy **no usa ninguna de las dos**. Hace tres cosas que ahora tienen solución directa:

### 1. Trae colecciones enteras y agrega en JS, con tope de 50 filas

[src/lib/api.ts](src/lib/api.ts) línea 261 — `getOrders(size = 50)`. Todo KPI "del período"
(cumplimiento, cycle time, demanda por SKU, top rotación, productividad por rover) se calcula
sobre **como mucho 50 órdenes**, sin importar el período elegido. El backend ya corrió su
blackbox contra 200.025 órdenes: en producción nuestros números serían silenciosamente falsos,
no lentos.

### 2. N+1+M requests para posiciones

[src/lib/api.ts](src/lib/api.ts) línea 330 — `getAllPositions()` hace 1 request de zonas + 1 por
zona + 1 por línea. Con 2 zonas / 7 líneas son 10 requests para lo que ahora es **una** llamada
agregada.

### 3. Datos hardcodeados manejando UI que parece real

| Archivo                                                                          | Constante / valor                                                                               | Qué debería ser     |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------- |
| [src/routes/\_dash.vehiculos-v2.tsx](src/routes/_dash.vehiculos-v2.tsx) L402-413 | `MTBF: "48.6 h"`, `MTTR: "18.7 min"`                                                            | recetas 3 y 4       |
| [src/routes/\_dash.vehiculos-v2.tsx](src/routes/_dash.vehiculos-v2.tsx)          | `HISTORIAL_BY_PERIOD`, `PARETO_BY_PERIOD`, `ACTIVIDAD_BY_PERIOD`                                | recetas 1, 2, 5 + 9 |
| [src/routes/\_dash.ordenes-v2.tsx](src/routes/_dash.ordenes-v2.tsx)              | `KPIS_BY_PERIOD`, `HORAS_BY_PERIOD`, `REINTENTOS_BY_PERIOD`, `HISTORICO`                        | recetas 7-10, 12-14 |
| [src/routes/\_dash.home.tsx](src/routes/_dash.home.tsx) L140-150                 | `picking`, `ordersHour` derivados de `throughput`; `stockDuration` inventado (`"bajo" ? 4 : 7`) | recetas 15, 9, 19   |
| [src/routes/\_dash.home.tsx](src/routes/_dash.home.tsx) L211-217                 | KPI "T. Prom. Entre Fallas" = `"—"`                                                             | receta 3            |

**Resultado buscado:** cada número del dashboard sale de una consulta al backend, calculado sobre
la ventana completa; los umbrales (SLA, "en riesgo", ventana de riesgo) siguen siendo **nuestros**,
que es exactamente la división que el backend documentó.

---

## Contrato verificado (leído del código del backend, no de la guía)

**Auth** — `POST /auth/login` → `{token, user:{id,name,email,role}}`. Token 24 h, sin refresh.

**Roles (bloqueante, ver Decisiones):**

- `/metrics/**` → `SUPERADMIN, ADMIN_SYSTEM, ADMIN_WAREHOUSE, DASHBOARD`
  (`api/metrics/MetricsController.java:24`)
- `/query/{orders,products}` → todos los roles de staff
- `/query/{vehicles,positions}` → sólo `SUPERADMIN, ADMIN_SYSTEM, ADMIN_WAREHOUSE, DASHBOARD`
  (`service/query/EntityRegistry.java:30-32`)
- Cuenta nueva sembrada: `dashboard@smartwarehouse.local` / `Demo1234!`

**Campos** (snake_case en la API; el backend acepta ambas grafías vía `FieldNames.normalize`):

- `orders`: `id, status, requested_by_user_id, destination_area, assigned_vehicle_id, created_at,
started_at, completed_at, cancel_reason`, `items.sku`, `items.product_id`, `items.quantity`
  (requieren `unwind:"items"`), derivados `cycle_time_ms`, `assignment_latency_ms`
- `products`: `id, sku, name, category, active, minimum_stock, max_quantity_per_order, weight, created_at`
- `vehicles`: `id, name, status, battery, position_x, position_y, current_order_id, last_seen_at`
- `positions`: `id, position_name, product_id, current_stock, maximum_capacity, id_zone, id_line, is_active, created_at`

**Límites duros:**

|                                   |                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `orders` agregado                 | ventana `created_at` obligatoria (`gte`/`gt`), máx **92 días** → si no: `UNBOUNDED_RANGE` / `QUERY_TOO_BROAD` |
| `positions`/`products`/`vehicles` | **prohibido** filtrar por fecha (recortaría el stock viejo en silencio)                                       |
| filtros / group_by / aggregates   | 10 / 3 / 10                                                                                                   |
| filas                             | agregado 100 def., 1000 máx · documento 25 def., 100 máx                                                      |
| `/metrics/query`                  | rango ≤ **31 d**, step ≥ 10 s, ≤ 11000 puntos/serie, ≤ 100 series                                             |
| retención de métricas             | 30 días                                                                                                       |

**Respuestas:** `{items:[...], pagination:{page,size,total_elements,total_pages}}` ·
métricas `{metric,unit,step,series:[{labels,points:[[epochSec,valor]]}]}` ·
errores `{error:{code,message}}`, 400 salvo `METRICS_UNAVAILABLE` = **503**.

### Tres trampas concretas

1. **`status` viene en MAYÚSCULAS.** `GET /orders` serializa con `@JsonValue → toLowerCase()`
   (`"completed"`), pero `POST /query/orders` lee documentos crudos de Mongo y devuelve
   `"COMPLETED"`. Nuestro `orderStatusMap` en [src/lib/api.ts](src/lib/api.ts) L146 está indexado
   en minúsculas. **Normalizar en el borde**, una sola vez.
2. **`positions.id_zone` es un ObjectId, no `"A"`/`"B"`.** La receta "utilización por zona" agrupa
   por `id_zone`; para mostrar la letra sigue haciendo falta `GET /warehouse/zones`. Una llamada
   extra, cacheable — no diez.
3. **`count` sobre `wh.vehicle.state` da decimales** con step grande (es el promedio de rovers en
   ese estado durante el bloque). Correcto, pero hay que formatear con decimal o usar step chico.

---

## Plan

### Fase 0 — Plumbing

- **[vite.config.ts](vite.config.ts) L30-37** — agregar `/query` y `/metrics` al proxy dev.
- **[nginx.conf.template](nginx.conf.template) L8** — el regex es `^/(auth|vehicles|orders|products)`:
  agregar `query|metrics` **y `warehouse`**, que hoy falta
  (⚠️ bug preexistente: `getAllPositions()` no funciona en producción detrás de nginx).
- **[src/lib/api.ts](src/lib/api.ts) L83** — `apiFetch` sólo hace GET. Generalizar a
  `apiFetch(path, init?)` con body JSON, conservando el manejo de 401 → `clearStoredToken()` + redirect.
- **[src/lib/api.ts](src/lib/api.ts) L57** — `login()` descarta `body.user`. Guardar `user.role` en
  sessionStorage y exportar `getRole()` / `canReadFleetMetrics()`.

### Fase 1 — Clientes tipados nuevos

**`src/lib/query-api.ts`**

```ts
export type Filter = {
  field: string;
  op: "eq"|"ne"|"gt"|"gte"|"lt"|"lte"|"in"|"nin"|"contains"|"exists";
  value: unknown;
};
export type GroupSpec = { field: string; bucket?: "hour"|"day"|"month"; as: string };
export type AggregateSpec = { op: "count"|"sum"|"avg"|"min"|"max"; field?: string; as: string };
export class ApiError extends Error { constructor(public code: string, message: string) {…} }

export async function queryEntity<T>(
  entity: "orders"|"products"|"vehicles"|"positions",
  req: QueryRequest,
): Promise<{ items: T[]; pagination: Pagination }>;

/** Los dos filtros created_at que `orders` exige. Recorta a 92 días. */
export function dateWindow(bounds: { from: number; to: number }): [Filter, Filter];
```

`dateWindow` reutiliza `periodToBounds` de [src/lib/dateRange.ts](src/lib/dateRange.ts) L37 y
**recorta a 92 días**, para que un rango custom ancho degrade en vez de tirar `QUERY_TOO_BROAD`.

**`src/lib/metrics-api.ts`**

```ts
export async function metricsQuery(req: MetricsRequest): Promise<MetricsResponse | null>; // null en 503
export function sumPoints(s: Series): number;
export function avgPoints(s: Series): number;
export function mtbfSeconds(failures: number, windowSeconds: number): number | null;
export function mttrSeconds(
  failures: number,
  errorFraction: number,
  windowSeconds: number,
): number | null;
```

Fórmulas copiadas literalmente de la guía (§6, recetas 3 y 4) — funciones puras, testeables sin red.
`metricsQuery` recorta el rango a 31 días y devuelve `null` ante 503 en vez de tirar: los gráficos
de flota degradan, el resto del dashboard sigue vivo.

**`src/lib/order-status.ts`** — `normalizeStatus("COMPLETED") → "completed"`, un solo lugar donde
convivan los dos vocabularios.

### Fase 2 — Hooks de react-query

Uno por familia de recetas, con `queryKey: [nombre, from, to]` y `refetchInterval: 30_000`
(la guía pide 10–30 s; sin rate limiting, el server es compartido).

| Hook                        | Recetas                 | Llamadas                                                                                                            |
| --------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `useFleetMetrics(period)`   | 1, 2, 3, 4, 5 + batería | 4 a `/metrics/query`                                                                                                |
| `useOrderStats(period)`     | 7-15                    | 5 a `/query/orders`                                                                                                 |
| `useDemandAndStock(period)` | 16-21                   | 3: `orders` (demanda por `items.product_id` + `max(created_at)`), `positions` (`on_hand`), `products` (`min_stock`) |

`useDemandAndStock` agrupa la demanda por **`items.product_id`**, no por SKU — así cruza directo
contra `positions.product_id` sin lookup extra (es lo que valida el check 22 del blackbox).

Los umbrales siguen del lado nuestro: `SLA_MINUTES`
([src/routes/\_dash.ordenes-v2.tsx](src/routes/_dash.ordenes-v2.tsx) L47) se convierte en el `value`
en ms del filtro `cycle_time_ms lte`, y [src/hooks/useRiskWindow.ts](src/hooks/useRiskWindow.ts)
sigue decidiendo "en riesgo".

### Fase 3 — Rewire de las páginas

**`useInventoryMetrics` — reescritura interna, misma superficie pública.**
Es el mayor rendimiento por línea: [src/hooks/useInventoryMetrics.ts](src/hooks/useInventoryMetrics.ts)
construye `demandMap`/`riskDemandMap`/`lastOrderMap` con `reduce` sobre ≤50 órdenes. Pasa a consumir
`useDemandAndStock` y devolver **exactamente los mismos** `EnrichedProduct[]`, `InventoryKPIs`,
`zoneOccupancy` — así [src/routes/\_dash.inventario-v2.tsx](src/routes/_dash.inventario-v2.tsx)
(1121 líneas) y [src/routes/\_dash.home.tsx](src/routes/_dash.home.tsx) no se tocan por este cambio.
Se preserva la separación deliberada período-picker vs. ventana-de-riesgo que ya está documentada
ahí; se pierde `lastOrderMap` "sin acotar" (ahora acotado a la ventana, tope 92 d) — aceptable y
explícito.

**[src/routes/\_dash.vehiculos-v2.tsx](src/routes/_dash.vehiculos-v2.tsx)** — borrar
`HISTORIAL_BY_PERIOD`, `PARETO_BY_PERIOD`, `ACTIVIDAD_BY_PERIOD` (~120 líneas de mock); MTBF/MTTR
reales; productividad por rover desde la receta 11 en vez de escanear 50 órdenes (línea ~923).
El Pareto va a mostrar **una sola barra** (`category` siempre `UNCATEGORIZED` hasta que el equipo
de rovers acuerde una taxonomía) — no es un bug nuestro.

**[src/routes/\_dash.ordenes-v2.tsx](src/routes/_dash.ordenes-v2.tsx)** —
`KPIS_BY_PERIOD`/`HORAS_BY_PERIOD`/`REINTENTOS_BY_PERIOD`/`HISTORICO` fuera; cycle time desde la
receta 12 (promedio real, no de 50 filas); SLA desde la 14 (dos llamadas: con y sin umbral). La
tabla paginada sigue en `GET /orders` — el modo documento de `/query/orders` no aporta nada ahí.

**[src/routes/\_dash.home.tsx](src/routes/_dash.home.tsx)** — `picking` ← receta 15, `ordersHour` ←
receta 9, `stockDuration` ← días a quiebre reales, KPI "T. Prom. Entre Fallas" ← receta 3,
`compliance` ← receta 8 (conteo server-side, no muestra de 50).

### Fase 4 — Degradado y tests

- **Sin mocks en los caminos nuevos.** Los `catch → mock` de [src/lib/api.ts](src/lib/api.ts)
  L248, L278, L297 hacen que un backend caído se vea como datos plausibles. Los hooks nuevos
  devuelven `null` + estado "Sin datos" / "Métricas no disponibles". Los legacy quedan como están
  en esta tanda (ver Decisiones).
- **MSW** — agregar handlers `POST */query/:entity` y `POST */metrics/query` a
  [src/test/msw/handlers.ts](src/test/msw/handlers.ts), con fixtures en la forma real (`status` en
  MAYÚSCULAS, `points` como `[epochSec, valor]`), siguiendo el criterio que ya está documentado ahí.
- **Unit tests** (sin red) para la matemática pura: `mtbfSeconds`/`mttrSeconds` contra el ejemplo de
  la guía, `dateWindow` recortando a 92 d, `normalizeStatus`, y el cálculo de cobertura/días-a-quiebre.
- **Integration test** de una página con MSW, siguiendo el patrón de
  [src/routes/\_dash.ordenes-v2.test.tsx](src/routes/_dash.ordenes-v2.test.tsx).

---

## Decisiones tomadas

### 1. Permisos → guardar el rol y adaptar la UI

`login()` guarda también `user.role`. Cada panel que dependa de `/metrics/**` o de
`/query/{vehicles,positions}` chequea el permiso **antes** de pedir nada y, si el usuario no lo
tiene, muestra un estado explícito ("Requiere permisos de almacén") en lugar de un gráfico roto.

Ojo con los dos modos de fallo, que **no son iguales**:

| Endpoint                              | Rol sin permiso          | Por qué                                                                    |
| ------------------------------------- | ------------------------ | -------------------------------------------------------------------------- |
| `/metrics/query`                      | **403 Forbidden**        | lo corta Spring Security (`@PreAuthorize`) antes del código                |
| `/query/positions`, `/query/vehicles` | **400 `UNKNOWN_ENTITY`** | deliberado: no revela que la entidad existe (`EntityQueryService.java:61`) |

El cliente tiene que tratar `UNKNOWN_ENTITY` sobre esas dos entidades como "sin permiso", no como
"error de programación".

### 2. Alcance → por fases, Vehículos primero, rama nueva desde `develop`

Rama `feature/integracion-backend-metricas` (el nombre `integracion-backend` ya está tomado, local
y en remoto). Sin PR todavía; se respeta gitflow.

⚠️ **Ver "Nota sobre la base de la rama" más abajo** — `develop` no tiene Vitest ni MSW.

Orden: **Vehículos** (100 % mock, riesgo casi nulo, máximo impacto visual) → **Inventario** (mayor
impacto en correctitud) → **Órdenes** → **Home**.

### 3. Fallbacks → se quedan, pero etiquetados en la UI

Los `catch → mock` siguen existiendo, **pero ningún dato mock puede volver a verse como real**.
Cada hook devuelve el origen del dato junto con el dato:

```ts
type DataSource = "live" | "mock" | "unavailable" | "forbidden";
type Sourced<T> = { data: T; source: DataSource };
```

Y un componente nuevo `src/components/dashboard/SourceBadge.tsx` lo muestra: un chip discreto
("datos de ejemplo" / "métricas no disponibles" / "requiere permisos") en la esquina del `Panel` o
junto al valor del `KpiCard`. Es un cambio chico pero cruza todo el trabajo, así que va en la Fase 0
y no al final: si se deja para después, los paneles nuevos nacen sin él.

### 4. Ventana de 90 días → recortar a 30 y avisar

Sólo afecta a los gráficos de rovers (VictoriaMetrics retiene 30 días y rechaza rangos > 31). Los
datos de negocio salen de MongoDB y aguantan los 92 días. Si el usuario elige 90 d, pedimos 30 y el
subtítulo del panel aclara _"últimos 30 días — límite de retención de métricas"_.

---

## Nota sobre la base de la rama (a resolver antes de empezar)

`develop` **no tiene Vitest, ni MSW, ni ningún test**. Todo eso vive en dos commits que sólo existen
en `feature/50-setup-testing-vitest` y todavía no se mergearon:

```
4c6dcd4 feat: tests unitarios de filtros/paginacion + test de integracion de Ordenes con MSW
dd65054 feat: setup Vitest + tests unitarios de mapVehicle y dashboard-data
```

Si ramificamos de `develop` tal cual, la Fase 4 de este plan (handlers de MSW, unit tests de
`mtbfSeconds`/`dateWindow`) no tiene sobre qué apoyarse: habría que reinstalar Vitest y MSW en esta
rama, y después resolver el conflicto cuando la otra se mergee. Tres caminos:

- **(a)** Mergear/PR `feature/50-setup-testing-vitest` → `develop` primero, y recién después ramificar.
  Es lo más limpio y lo que gitflow espera.
- **(b)** Ramificar de `feature/50-setup-testing-vitest` en vez de `develop`. Conserva los tests, pero
  la rama nueva queda colgando de una sin mergear.
- **(c)** Ramificar de `develop` y hacer la integración sin tests por ahora, dejando la Fase 4 para
  cuando `develop` tenga el setup.

---

## Verificación

1. **Backend sano primero:** `SEED_DEMO=true make up-dev` y
   `BASE_URL=http://localhost:8080 ./scripts/blackbox-dashboard.sh` → 39/39. Si falla ahí, no es nuestro.
2. `npm run type-check` y `npm test` (los tests nuevos de Fase 4 + los existentes en verde).
3. `BACKEND_URL=http://localhost:8080 npm run dev`, login como
   `dashboard@smartwarehouse.local` / `Demo1234!`, y recorrer:
   - **Vehículos** — MTBF/MTTR con números finitos y distintos por rover; histórico de fallas con
     picos reales (la semilla tiene un rover que falla en ciclo); "rovers activos" con decimales en
     step grande; Pareto con una barra.
   - **Inventario** — cambiar el período mueve "Dem. diaria"/"Cobertura" pero **no** los KPIs de
     riesgo; el stock total coincide con
     `db.positions.aggregate([{$group:{_id:null,n:{$sum:"$currentStock"}}}])`.
   - **Órdenes** — el conteo por estado coincide con la receta 7 pedida por curl; cycle time ya no
     se mueve al cambiar el `size`.
   - **Home** — el KPI de cumplimiento coincide con el de Órdenes para el mismo período (hoy también,
     pero por casualidad: ambos ven las mismas 50 filas).
4. **Degradado:** `docker stop` de VictoriaMetrics → los paneles de flota muestran "métricas no
   disponibles" y el resto del dashboard sigue funcionando (503 aislado, es el contrato).
5. **Números grandes:** el backend verificó el blackbox contra 200.025 órdenes. Si podemos sembrar
   volumen, comparar Órdenes/Inventario antes y después del cambio es la prueba de que el tope de 50
   era el bug.
