# Integración de Nóminas en Modira

## Archivos
- `EmployeePayroll.tsx`: página del módulo de nóminas.
- `EmployeePayroll.css`: estilos de los controles del formulario. Debe estar junto al TSX.
- `EmployeeSidebar.tsx`: versión de la barra lateral con el acceso a Nóminas basado en `payroll.read`.

## 1. Colocar los archivos
Coloca `EmployeePayroll.tsx` y `EmployeePayroll.css` en la misma carpeta donde esté el componente `EmployeeFinancials.tsx` (o en la carpeta equivalente de páginas de empleado). El CSS se importa de forma relativa.

Sustituye el componente `EmployeeSidebar.tsx` actual por el incluido, o replica únicamente el import de `Banknote` y el bloque de menú `payroll.read` si tu archivo ha cambiado desde el que se revisó.

## 2. Registrar la ruta
En `App.tsx` (o el archivo donde se registran las rutas del área de empleados):

```tsx
import EmployeePayroll from "RUTA_REAL/EmployeePayroll";
```

Añade junto a las rutas de los demás módulos de empleado:

```tsx
<Route path="/employee/payroll" component={EmployeePayroll} />
```

Usa la ruta de importación real de tu proyecto. Si la aplicación envuelve los módulos con un layout o guard de rutas, aplica el mismo wrapper que utiliza `/employee/financials`.

## 3. Comportamiento esperado
- El enlace de Nóminas solo aparece si `hasPermission("payroll.read")` es verdadero.
- La página comprueba también permisos de creación, edición y eliminación para mostrar las acciones.
- La seguridad real sigue dependiendo de las políticas RLS y Storage de la migración 153; ocultar un enlace no sustituye a esas políticas.
- Los PDF se guardan en el bucket privado `payroll-documents` y se abren mediante una URL firmada de corta duración.
- El coste empresarial mostrado se calcula como bruto + Seguridad Social empresarial + otros costes empresariales.

## 4. Comprobación antes de desplegar
1. Confirma que la migración 153 está aplicada en el entorno al que apunta la aplicación.
2. Comprueba que `direction` y `accounting` tienen `payroll.read/create/update/delete`.
3. Prueba crear una nómina borrador, aprobarla, marcarla como pagada con fecha, adjuntar/abrir/eliminar un PDF y exportar CSV.
4. Entra con un rol sin `payroll.read`: no debe ver el enlace ni poder leer datos mediante Supabase.
5. Comprueba que una combinación trabajador + año + mes no permite duplicados.

No se ha aplicado ningún cambio en Supabase desde esta entrega.
