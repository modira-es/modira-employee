# Modira — Roles y permisos

## Archivos
- `RolesPermissions.tsx`: pantalla completa.
- `rolesPermissionsRpc.ts`: llamadas a las RPC de Supabase.
- `rolesPermissionsTypes.ts`: tipos TypeScript.
- `index.ts`: exportación del módulo.

## Integración
Copia la carpeta `roles-permissions` en:
`client/src/areas/shared/roles-permissions/`

En `App.tsx`, conserva la ruta existente `/employee/roles` y sustituye únicamente el componente provisional `ModuleComingSoon` por `RolesPermissions` importado desde `@/areas/shared/roles-permissions` (ajusta el alias solo si tu proyecto usa otro).

No cambies `EmployeeRoute`, `EmployeeSidebar`, `AuthContext` ni otras rutas para integrar esta pantalla.

## Dependencias usadas
- React
- `lucide-react`
- Tailwind CSS
- Cliente Supabase existente en `@/lib/supabase`

## Notas
- Lee datos mediante las RPC de la migración 151.
- Asignaciones usan `assign_worker_role` y `remove_worker_role`.
- Los roles del sistema no se editan desde esta pantalla.
- La pantalla no escribe directamente en tablas RBAC.
