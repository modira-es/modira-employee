import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Activity,
  BarChart3,
  Banknote,
  Bot,
  Building2,
  CalendarDays,
  CreditCard,
  FileBarChart2,
  FileText,
  FolderKanban,
  Landmark,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  Receipt,
  Settings2,
  ShieldCheck,
  Ticket,
  Users,
  WalletCards,
  Webhook,
  X,
  Zap,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";

interface EmployeeSidebarProps {
  showMobileTrigger?: boolean;
}

interface MenuItem {
  id: string;
  label: string;
  route: string;
  icon: React.ComponentType<{
    className?: string;
    strokeWidth?: number;
  }>;
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

type WorkerRole =
  | "direction"
  | "commercial"
  | "accounting"
  | "developer"
  | "support"
  | "unknown";

function normalizeRole(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getWorkerRole(roleNames: string[]): WorkerRole {
  if (
    roleNames.some(
      (role) =>
        role.includes("direction") ||
        role.includes("ceo") ||
        role.includes("direccion"),
    )
  ) {
    return "direction";
  }

  if (
    roleNames.some(
      (role) =>
        role.includes("developer") ||
        role.includes("develop") ||
        role.includes("automation"),
    )
  ) {
    return "developer";
  }

  if (
    roleNames.some(
      (role) =>
        role.includes("commercial") ||
        role.includes("comercial"),
    )
  ) {
    return "commercial";
  }

  if (
    roleNames.some(
      (role) =>
        role.includes("accounting") ||
        role.includes("administrativ") ||
        role.includes("contab"),
    )
  ) {
    return "accounting";
  }

  if (
    roleNames.some(
      (role) =>
        role.includes("support") ||
        role.includes("soporte"),
    )
  ) {
    return "support";
  }

  return "unknown";
}

const ROLE_LABELS: Record<WorkerRole, string> = {
  direction: "Dirección",
  commercial: "Comercial",
  accounting: "Administrativo · Contabilidad",
  developer: "Developer",
  support: "Soporte",
  unknown: "Trabajador",
};

/**
 * ============================================================
 * EMPLOYEE SIDEBAR
 * ============================================================
 *
 * IMPORTANTE:
 *
 * - El rol se utiliza únicamente para mostrar la etiqueta
 *   funcional del trabajador.
 *
 * - La visibilidad de cada módulo se determina mediante
 *   permisos RBAC.
 *
 * - La seguridad real continúa estando en App.tsx,
 *   los componentes y, sobre todo, en RLS/RPC del backend.
 *
 * De esta forma:
 *
 *     roles      → etiqueta visual
 *     permissions → navegación
 *     App.tsx     → acceso a rutas
 *     RPC/RLS     → seguridad real
 *
 * Esto permite que un trabajador con varios roles vea
 * todos los módulos correspondientes a sus permisos.
 */
export default function EmployeeSidebar({
  showMobileTrigger = true,
}: EmployeeSidebarProps) {
  const {
    roles,
    hasPermission,
    signOut,
  } = useAuth();

  const [location, setLocation] =
    useLocation();

  const [menuOpen, setMenuOpen] =
    useState(false);

  /**
   * ----------------------------------------------------------
   * Cerrar menú cuando cambia la ruta
   * ----------------------------------------------------------
   */

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  /**
   * ----------------------------------------------------------
   * Bloquear scroll cuando el menú móvil está abierto
   * ----------------------------------------------------------
   */

  useEffect(() => {
    if (!menuOpen) {
      document.body.style.overflow = "";
      return;
    }

    const handleEscape = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.body.style.overflow =
      "hidden";

    document.addEventListener(
      "keydown",
      handleEscape,
    );

    return () => {
      document.body.style.overflow =
        "";

      document.removeEventListener(
        "keydown",
        handleEscape,
      );
    };
  }, [menuOpen]);

  /**
   * ----------------------------------------------------------
   * Rol visual
   * ----------------------------------------------------------
   *
   * El rol NO se utiliza para decidir qué módulos aparecen.
   * Solo sirve para mostrar el nombre del departamento.
   */

  const role = useMemo<WorkerRole>(
    () =>
      getWorkerRole(
        roles.map((item) =>
          normalizeRole(
            item.role_name,
          ),
        ),
      ),
    [roles],
  );

  /**
   * ----------------------------------------------------------
   * MENÚ BASADO EN PERMISOS
   * ----------------------------------------------------------
   *
   * Cada módulo se muestra únicamente si el trabajador tiene
   * el permiso de lectura/acceso correspondiente.
   *
   * Las acciones de crear/editar/eliminar NO se controlan aquí.
   * Esas acciones se controlan dentro de cada módulo.
   */

  const menuGroups = useMemo<MenuGroup[]>(
    () => {
      const groups: MenuGroup[] = [
        {
          title: "Principal",
          items: [
            {
              id: "dashboard",
              label: "Inicio",
              route: "/",
              icon: LayoutDashboard,
            },
          ],
        },
      ];

      /**
       * ======================================================
       * GESTIÓN
       * ======================================================
       */

      const managementItems: MenuItem[] =
        [];

      if (
        hasPermission("clients.read")
      ) {
        managementItems.push({
          id: "clients",
          label: "Clientes",
          route: "/employee/clients",
          icon: Users,
        });
      }

      if (
        hasPermission("companies.read")
      ) {
        managementItems.push({
          id: "companies",
          label: "Empresas",
          route: "/employee/companies",
          icon: Building2,
        });
      }

      /**
       * Las solicitudes de cambio de empresa
       * requieren companies.update.
       *
       * No basta con companies.read porque aquí
       * existen operaciones de aprobación/modificación.
       */
      if (
        hasPermission("companies.update")
      ) {
        managementItems.push({
          id: "company-changes",
          label: "Solicitudes de empresa",
          route: "/employee/company-changes",
          icon: Building2,
        });
      }

      if (
        hasPermission("projects.read")
      ) {
        managementItems.push({
          id: "projects",
          label: "Proyectos",
          route: "/employee/projects",
          icon: FolderKanban,
        });
      }

      if (
        hasPermission("quotations.read")
      ) {
        managementItems.push({
          id: "quotations",
          label: "Presupuestos",
          route: "/employee/quotations",
          icon: FileText,
        });
      }

      if (
        hasPermission("invoices.read")
      ) {
        managementItems.push({
          id: "billing",
          label: "Facturación",
          route: "/employee/billing",
          icon: CreditCard,
        });
      }

      if (
        hasPermission("maintenance.read")
      ) {
        managementItems.push({
          id: "maintenance",
          label: "Mantenimiento",
          route: "/employee/maintenance",
          icon: CalendarDays,
        });
      }

      if (managementItems.length > 0) {
        groups.push({
          title: "Gestión",
          items: managementItems,
        });
      }

      /**
       * ======================================================
       * FINANZAS
       * ======================================================
       */

      const financeItems: MenuItem[] =
        [];

      if (
        hasPermission("payments.read")
      ) {
        financeItems.push({
          id: "payments",
          label: "Pagos",
          route: "/employee/payments",
          icon: WalletCards,
        });
      }

      if (
        hasPermission("expenses.read")
      ) {
        financeItems.push({
          id: "expenses",
          label: "Gastos",
          route: "/employee/expenses",
          icon: Receipt,
        });
      }

      if (
        hasPermission("payroll.read")
      ) {
        financeItems.push({
          id: "payroll",
          label: "Nóminas",
          route: "/employee/payroll",
          icon: Banknote,
        });
      }

      if (
        hasPermission("finance.read")
      ) {
        financeItems.push({
          id: "financials",
          label: "Finanzas",
          route: "/employee/financials",
          icon: Landmark,
        });
      }

      if (financeItems.length > 0) {
        groups.push({
          title: "Finanzas",
          items: financeItems,
        });
      }

      /**
       * ======================================================
       * OPERACIONES
       * ======================================================
       */

      const operationItems: MenuItem[] =
        [];

      if (
        hasPermission("internal_tasks.read")
      ) {
        operationItems.push({
          id: "tasks",
          label: "Tareas",
          route: "/employee/tasks",
          icon: ListTodo,
        });
      }

      if (
        hasPermission("project_tasks.read")
      ) {
        operationItems.push({
          id: "project-tasks",
          label: "Tareas de proyectos",
          route: "/employee/project-tasks",
          icon: FolderKanban,
        });
      }

      if (
        hasPermission("support.read")
      ) {
        operationItems.push({
          id: "support",
          label: "Soporte",
          route: "/employee/support",
          icon: Ticket,
        });
      }

      if (
        hasPermission("automations.read")
      ) {
        operationItems.push({
          id: "automations",
          label: "Automatizaciones",
          route: "/employee/automations",
          icon: Zap,
        });
      }

      if (
        hasPermission("ai.read")
      ) {
        operationItems.push({
          id: "ai",
          label: "IA",
          route: "/employee/ai",
          icon: Bot,
        });
      }

      if (operationItems.length > 0) {
        groups.push({
          title: "Operaciones",
          items: operationItems,
        });
      }

      /**
       * ======================================================
       * MARKETING Y ADQUISICIÓN
       * ======================================================
       */
      if (hasPermission("marketing.dashboard.read")) {
        groups.push({
          title: "Marketing",
          items: [
            {
              id: "marketing",
              label: "Marketing & adquisición",
              route: "/employee/marketing",
              icon: BarChart3,
            },
          ],
        });
      }

      /**
       * ======================================================
       * SISTEMA
       * ======================================================
       */


      const systemItems: MenuItem[] =
        [];

      if (
        hasPermission(
          "system.workers.read",
        )
      ) {
        systemItems.push({
          id: "team",
          label: "Equipo",
          route: "/employee/team",
          icon: Users,
        });
      }

      if (
        hasPermission(
          "system.roles.read",
        )
      ) {
        systemItems.push({
          id: "roles",
          label: "Roles y permisos",
          route: "/employee/roles",
          icon: ShieldCheck,
        });
      }

      if (
        hasPermission(
          "system.audit.read",
        )
      ) {
        systemItems.push({
          id: "audit",
          label: "Auditoría",
          route: "/employee/audit",
          icon: FileBarChart2,
        });
      }

      if (
        hasPermission(
          "system.error_logs.read",
        )
      ) {
        systemItems.push({
          id: "error-logs",
          label: "Logs de errores",
          route: "/employee/logs/errors",
          icon: Activity,
        });
      }

      if (
        hasPermission(
          "system.webhooks.read",
        )
      ) {
        systemItems.push({
          id: "webhooks",
          label: "Webhooks",
          route: "/employee/webhooks",
          icon: Webhook,
        });
      }

      if (
        hasPermission(
          "system.settings.read",
        )
      ) {
        systemItems.push({
          id: "settings",
          label: "Configuración",
          route: "/employee/settings",
          icon: Settings2,
        });
      }

      if (systemItems.length > 0) {
        groups.push({
          title: "Sistema",
          items: systemItems,
        });
      }

      return groups;
    },
    [hasPermission],
  );

  /**
   * ----------------------------------------------------------
   * Navegación
   * ----------------------------------------------------------
   */

  const navigate = (
    route: string,
  ) => {
    setMenuOpen(false);
    setLocation(route);
  };

  /**
   * ----------------------------------------------------------
   * Logout
   * ----------------------------------------------------------
   */

  const handleSignOut = async () => {
    setMenuOpen(false);

    const result = await signOut();

    if (!result.success) {
      console.error(
        "[EmployeeSidebar] Error signing out:",
        result.error,
      );
    }

    setLocation("/login");
  };

  /**
   * ----------------------------------------------------------
   * CONTENIDO DEL SIDEBAR
   * ----------------------------------------------------------
   */

  const sidebarContent = (
    <>
      <div className="flex h-[72px] items-center justify-between border-b border-[#EEF1F4] px-6">
        <div>
          <p className="text-lg font-semibold tracking-[-0.025em] text-[#172033]">
            MODIRA
          </p>

          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9AA2AE]">
            {ROLE_LABELS[role]}
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            setMenuOpen(false)
          }
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[#7B8594] transition-all hover:bg-[#F3F5F7] hover:text-[#172033]"
          aria-label="Cerrar menú"
        >
          <X
            className="h-5 w-5"
            strokeWidth={1.7}
          />
        </button>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-4 py-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div className="space-y-6">
          {menuGroups.map(
            (group) => (
              <SidebarGroup
                key={group.title}
                title={group.title}
                items={group.items}
                location={location}
                onNavigate={navigate}
              />
            ),
          )}
        </div>
      </nav>

      <div className="border-t border-[#EEF1F4] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F0F2F5] text-xs font-semibold text-[#566173]">
            <Users
              className="h-4 w-4"
              strokeWidth={1.7}
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[#344154]">
              {ROLE_LABELS[role]}
            </p>

            <p className="mt-0.5 truncate text-[11px] text-[#9AA2AE]">
              Sesión de trabajador
            </p>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#7B8594] transition-colors hover:bg-[#F7F8FA] hover:text-[#344154]"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <LogOut
              className="h-4 w-4"
              strokeWidth={1.7}
            />
          </button>
        </div>
      </div>
    </>
  );

  /**
   * ----------------------------------------------------------
   * RENDER
   * ----------------------------------------------------------
   */

  return (
    <>
      {showMobileTrigger &&
      !menuOpen ? (
        <button
          type="button"
          onClick={() =>
            setMenuOpen(true)
          }
          className="fixed left-5 top-5 z-50 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#E6E9EE] bg-white/95 text-[#566173] shadow-[0_8px_30px_rgba(15,23,42,0.10)] backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:text-[#172033] hover:shadow-[0_12px_34px_rgba(15,23,42,0.14)] active:translate-y-0"
          aria-label="Abrir menú de navegación"
          aria-expanded={false}
          title="Abrir menú"
        >
          <Menu
            className="h-5 w-5"
            strokeWidth={1.7}
          />
        </button>
      ) : null}

      {menuOpen ? (
        <div
          className="fixed inset-0 z-40 bg-[#172033]/10 backdrop-blur-[1px]"
          onClick={() =>
            setMenuOpen(false)
          }
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[86vw] flex-col border-r border-[#E6E9EE] bg-white shadow-[18px_0_45px_rgba(15,23,42,0.08)] transition-transform duration-200 ease-out ${
          menuOpen
            ? "translate-x-0"
            : "-translate-x-full"
        }`}
        aria-label="Navegación del área de empleados"
        aria-hidden={!menuOpen}
      >
        {sidebarContent}
      </aside>
    </>
  );
}

/**
 * ============================================================
 * SIDEBAR GROUP
 * ============================================================
 */

function SidebarGroup({
  title,
  items,
  location,
  onNavigate,
}: {
  title: string;
  items: MenuItem[];
  location: string;
  onNavigate: (
    route: string,
  ) => void;
}) {
  return (
    <section>
      <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9AA2AE]">
        {title}
      </p>

      <div className="mt-2 space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;

          const isActive =
            item.route === "/"
              ? location === "/"
              : location ===
                  item.route ||
                location.startsWith(
                  `${item.route}/`,
                );

          return (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                onNavigate(item.route)
              }
              className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all duration-150 ${
                isActive
                  ? "bg-[#F1F3F5] font-medium text-[#172033] shadow-[inset_0_0_0_1px_rgba(23,32,51,0.035)]"
                  : "text-[#596577] hover:bg-[#F7F8FA] hover:text-[#263044]"
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${
                  isActive
                    ? "text-[#344154]"
                    : "text-[#788394] group-hover:text-[#526073]"
                }`}
                strokeWidth={
                  isActive
                    ? 1.9
                    : 1.7
                }
              />

              <span>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}