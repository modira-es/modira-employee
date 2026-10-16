# Integración en `modira-employee`

## 1. Copiar archivos

Copia estos dos archivos respetando las rutas:
- `client/src/pages/employee/AuditRequestsPage.tsx`
- `client/src/pages/employee/AuditRequestsPage.css`

## 2. Conectar la ruta en `App.tsx`

Importa la página:

```tsx
import AuditRequestsPage from "@/pages/employee/AuditRequestsPage";
```

Añade el contenido a la ruta `/employee/audit` que ya existe, conservando el `EmployeeRoute` y el layout actual. Dentro de esa ruta, pasa el cliente Supabase existente y la función `hasPermission` del `AuthContext`:

```tsx
<AuditRequestsPage
  supabase={supabase}
  hasPermission={hasPermission}
/>
```

**Adapta solo los nombres de las variables** si en tu `App.tsx` el cliente o el contexto se llaman de otra forma. No crees un segundo cliente Supabase ni un segundo sistema de permisos. Si la ruta actual ya está protegida por `EmployeeRoute requiredPermission="system.audit.read"`, conserva esa protección.

## 3. Sidebar

Conserva la entrada existente condicionada por:

```tsx
hasPermission("system.audit.read")
```

No añadas otra entrada duplicada si ya existe.

## 4. Backend y permisos

La página puede consultar los registros con `SELECT` porque la política RLS de `audit_requests` exige `system.audit.read`. Las actualizaciones llaman a la RPC `update_audit_request` y solo aparecen en la interfaz si `hasPermission("system.audit.update")` es verdadero. La RPC debe validar ese permiso también en el servidor; el control de interfaz no sustituye la seguridad de base de datos.

## 5. Prueba

1. Inicia sesión con un usuario de Dirección o Comercial que tenga ambos permisos.
2. Abre `/employee/audit`.
3. Comprueba que aparecen las solicitudes.
4. Abre una, cambia el estado y guarda una nota interna.
5. Actualiza la página y confirma que persisten los cambios.
6. Comprueba con un rol sin `system.audit.read` que no puede abrir la página.
