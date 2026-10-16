
# Project Tasks — RBAC

Módulo compartido para **Direction + Developer**.

## Migraciones

- `133_project_tasks_core.sql`: crea `project_tasks` y `project_task_updates`, constraints, FKs e índices.
- `134_project_tasks_security.sql`: habilita RLS, revoca escrituras directas y permite SELECT solo con `project_tasks.read`.
- **La página necesita la migración 135 de RPCs funcionales** para leer/escribir mediante SECURITY DEFINER. Las llamadas están centralizadas en `projectTaskRpc.ts`.

## Permisos usados

- `project_tasks.read`
- `project_tasks.create`
- `project_tasks.update`
- `project_tasks.assign`
- `project_tasks.review`
- `project_tasks.delete`

No se añaden permisos nuevos desde frontend.

## Rutas

Recomendado:

- `/employee/project-tasks`
- `/employee/project-tasks/:id`

Si prefieres la nomenclatura indicada en el diseño:

- `/tareas-proyecto`
- `/tareas-proyecto/:id`

solo cambia `basePath` en App.

## Comportamiento

### Developer

Puede crear/editar sus tareas, iniciarlas, actualizar progreso y enviarlas a revisión. No puede aprobar, devolver desde revisión, reasignar ni cancelar administrativamente.

### Direction

Puede consultar todas las tareas, crear, asignar/reasignar, revisar, devolver, aprobar y cancelar.

### Seguridad

La UI solo oculta controles. La autoridad real sigue siendo RLS/RPC. La migración 134 bloquea INSERT/UPDATE/DELETE directo sobre ambas tablas y deja el historial (`project_task_updates`) inmutable.

## Importante sobre la migración 135

Este ZIP no inventa ni modifica la migración 135. `projectTaskRpc.ts` concentra las llamadas esperadas:

- `get_project_tasks`
- `get_project_task`
- `create_project_task`
- `update_project_task`
- `start_project_task`
- `update_project_task_progress`
- `submit_project_task_for_review`
- `review_project_task`
- `reassign_project_task`
- `direction_set_project_task_state`
- `delete_project_task`
- `add_project_task_comment`
- `get_project_task_history`

Si tu 135 usa nombres o firmas diferentes, solo hay que adaptar ese archivo.


## RPC 135 exactos

- `create_project_task(project_id, title, description, milestone_id, assigned_to_worker_id, priority, due_at)`
- `get_project_tasks(project_id, milestone_id, status, priority, assigned_to_worker_id, limit)`
- `get_project_task(task_id)`
- `update_project_task(task_id, title, description, milestone_id, priority, due_at)`
- `reassign_project_task(task_id, assigned_to_worker_id)`
- `start_project_task(task_id)`
- `update_project_task_progress(task_id, progress)`
- `submit_project_task_for_review(task_id, comment)`
- `review_project_task(task_id, approved, comment)`
- `direction_set_project_task_state(task_id, status, comment)`
- `delete_project_task(task_id, comment)`
- `add_project_task_comment(task_id, comment)`
- `get_project_task_history(task_id, limit)`
