# Perfiles de trabajadores — RBAC

Módulo compartido para el área de trabajadores de Modira.

## Qué incluye

- Solo accesible mediante `system.workers.read`.
- Diseñado para Dirección, que es el rol que dispone de este permiso en el catálogo RBAC actual.
- Tarjetas de trabajadores activos.
- Nombre y email.
- Uno o varios roles asignados.
- Nº de tareas asignadas.
- Nº de tareas completadas.
- Barra horizontal de filtros por rol.
- Buscador por nombre/email.
- Click en una tarjeta → modal con:
  - Todas las tareas asignadas.
  - Tareas completadas.
- No incluye edición de perfiles, roles o estados: este módulo es de consulta.

## Archivos

`WorkerProfiles.tsx` — página visual.
`WorkersProfilesArea.tsx` — wrapper del módulo compartido.
`workerProfileTypes.ts` — tipos, permisos y etiquetas.
`index.ts` — exports.
`133_direction_worker_profiles.sql` — RPCs de lectura necesarias para no conceder SELECT directo sobre workers/internal_tasks.

## Integración App.tsx

Añade:

```tsx
import WorkersProfilesArea from "./areas/shared/worker-profiles/WorkersProfilesArea";
```

Y la ruta:

```tsx
<Route
  path="/employee/team"
  component={() => (
    <EmployeeRoute requiredPermission="system.workers.read">
      <WorkersProfilesArea />
    </EmployeeRoute>
  )}
/>
```

Si prefieres que la URL sea `/employee/workers`, cambia únicamente la ruta.

## Integración EmployeeSidebar

El botón debe mostrarse solo con:

```tsx
if (hasPermission("system.workers.read")) {
  // entrada Trabajadores / Perfiles
}
```

No se añade ningún sidebar dentro del módulo.

## Seguridad

El frontend no consulta directamente `workers` ni `internal_tasks` para construir la lista. Las RPCs son `SECURITY DEFINER` y vuelven a comprobar `system.workers.read` mediante `current_worker_has_permission`.

El permiso backend sigue siendo la autoridad real.

## Importante sobre la migración

Ejecuta `133_direction_worker_profiles.sql` antes de utilizar la página. La migración no modifica tareas ni trabajadores; únicamente crea dos RPCs de lectura.


CORRECCIÓN IMPORTANTE
La relación de roles usa la estructura real de Modira: workers.auth_user_id = worker_role_assignments.worker_auth_user_id y worker_role_assignments.role_id = worker_roles.id. No se añade ni se requiere ninguna columna worker_id en worker_role_assignments. La migración 133 sustituye la 132 que se ha revertido.
