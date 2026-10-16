# AI Conversations — RBAC

Módulo compartido para el área interna de Modira AI.

## Acceso

El acceso se basa en permisos efectivos mediante `current_worker_has_permission`:

- `ai.read`: acceso a conversaciones, historial y uso por conversación.
- `ai.manage`: además permite visualizar el panel operativo completo de IA (cuotas, reservas, consumo, rate limits y configuración).
- `ai.use`: representa el uso de Modira AI y **por sí solo no abre el historial interno de conversaciones**.

Según la matriz RBAC actual:
- Dirección: `ai.read` + `ai.use` + `ai.manage`.
- Developer: acceso según los permisos efectivos que tenga asignados.
- Comercial, Accounting y Support: sin acceso al módulo IA.

## Backend utilizado

No se han inventado operaciones nuevas. El módulo conserva únicamente las operaciones presentes en `EmployeeAIConversations`:

- `ai_conversations` — lectura.
- `ai_messages` — lectura.
- `get_ai_worker_panel_data()` — panel operativo protegido.
- `get_ai_worker_conversation_usage(uuid)` — uso de una conversación.

Las tablas internas de cuotas siguen protegidas por backend/RPC y no se accede directamente a ellas.

## UI

- Sin menú lateral interno.
- Sin navegación duplicada del Employee Area.
- Diseño alineado con los módulos RBAC compartidos.
- Vista responsive de listado y detalle.
- Se conservan filtros, métricas, panel operativo, historial, contexto, reservas y rate limits.
