# Modira — Área interna de solicitudes de auditoría

Este paquete añade la página frontend `/employee/audit` como módulo integrable en el proyecto `modira-employee`. No reemplaza ni modifica `App.tsx`, `AuthContext`, `EmployeeSidebar` ni el cliente Supabase existentes.

## Contenido

- `client/src/pages/employee/AuditRequestsPage.tsx`: página React completa.
- `client/src/pages/employee/AuditRequestsPage.css`: estilos responsive de la página.
- `INTEGRATION.md`: instrucciones para conectar la página al proyecto existente.

## Funcionalidad

- Resumen: total de solicitudes, nuevas, en curso y completadas.
- Tabla con contacto, empresa, tamaño, proceso, fecha y estado.
- Búsqueda por nombre, correo, empresa, tamaño o texto del proceso.
- Filtro por estado.
- Panel lateral de detalle.
- Edición de estado y notas internas para quien tenga `system.audit.update`.
- Mensajes de carga, error, lista vacía y guardado.
- Estados: `nuevo`, `en_revision`, `en_seguimiento`, `completado`, `descartado`.
- Lee `public.audit_requests` con el SELECT sujeto a RLS.
- Guarda usando `update_audit_request(p_request_id, p_estado, p_notas_internas)`.

## Requisitos del backend

Antes de usar la página, la migración de base de datos acordada debe haberse aplicado correctamente y haber creado:
- permiso `system.audit.update`;
- asignaciones de `system.audit.read` y `system.audit.update` a los roles `direction` y `commercial`;
- constraint con los cinco estados;
- RPC `public.update_audit_request(uuid,text,text)` con comprobación server-side del permiso `system.audit.update`.

El permiso `system.audit.read` y la política RLS de SELECT deben continuar activos. Esta página no concede permisos a nivel de tabla ni cambia la seguridad del backend.

## Dependencias

Utiliza React, `@supabase/supabase-js` y `lucide-react`, que forman parte del stack habitual de la aplicación. No incorpora dependencias nuevas aparte de esas.

## Importante

El paquete es un módulo de integración, no una copia de todo el repositorio. Como no se ha adjuntado el código actual completo de `modira-employee` en este turno, la página recibe `supabase` y `hasPermission` por props para reutilizar la instancia y el RBAC que ya existen, sin inventar rutas internas de importación.
