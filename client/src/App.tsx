import { useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";

import ResetPassword from "./pages/ResetPassword";
import EmployeeAuth from "./pages/EmployeeAuth";
import NotFound from "./pages/NotFound";
import AdminPanel from "./pages/AdminPanel";
import EmployeeRoute from "./components/EmployeeRoute";

import EmployeeFinancials from "./pages/EmployeeFinancials";
import EmployeeCompanyChanges from "./pages/EmployeeCompanyChanges";

import DirectionDashboard from "./areas/direction/DirectionDashboard";
import CommercialDashboard from "./areas/commercial/CommercialDashboard";
import AccountingDashboard from "./areas/accounting/AccountingDashboard";
import DeveloperDashboard from "./areas/developer/DeveloperDashboard";
import SupportDashboard from "./areas/support/SupportDashboard";

import Projects from "./areas/shared/projects/Projects";
import CompaniesArea from "./areas/shared/companies/CompaniesArea";
import QuotationsArea from "./areas/shared/quotations/QuotationsArea";
import BillingArea from "./areas/shared/billing/BillingArea";
import MaintenanceArea from "./areas/shared/maintenance/MaintenanceArea";
import Expenses from "./areas/shared/expenses/Expenses";
import AIConversations from "./areas/shared/AIConversations/AIConversations";
import { SupportArea } from "./areas/shared/support";
import InternalTasksArea from "./areas/shared/internal-tasks/InternalTasksArea";
import ProjectTasksArea from "./areas/shared/project-tasks/ProjectTasksArea";
import WorkersProfilesArea from "./areas/shared/worker-profiles/WorkersProfilesArea";
import RolesPermissions from "./areas/shared/roles-permissions/RolesPermissions";
import AuditRequestsPage from "./areas/shared/audit-requests/AuditRequestsPage";
import EmployeePayroll from "./areas/shared/payroll/EmployeePayroll";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ProjectDetail } from "./areas/shared/projects";


function normalizeRole(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function RoleDashboard() {
  const { roles } = useAuth();
  const roleNames = roles.map((role) => normalizeRole(role.role_name));

  if (
    roleNames.some(
      (role) =>
        role.includes("direction") ||
        role.includes("ceo") ||
        role.includes("direccion"),
    )
  ) {
    return <DirectionDashboard />;
  }

  if (
    roleNames.some(
      (role) =>
        role.includes("developer") ||
        role.includes("develop") ||
        role.includes("automation"),
    )
  ) {
    return <DeveloperDashboard />;
  }

  if (
    roleNames.some(
      (role) => role.includes("commercial") || role.includes("comercial"),
    )
  ) {
    return <CommercialDashboard />;
  }

  if (
    roleNames.some(
      (role) =>
        role.includes("accounting") ||
        role.includes("administrativ") ||
        role.includes("contab"),
    )
  ) {
    return <AccountingDashboard />;
  }

  if (
    roleNames.some(
      (role) => role.includes("support") || role.includes("soporte"),
    )
  ) {
    return <SupportDashboard />;
  }

  return <NotFound />;
}

function ModuleComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="min-h-screen bg-[#F7F8FA] px-6 py-10 md:px-10">
      <div className="mx-auto flex min-h-[70vh] max-w-5xl items-center justify-center">
        <div className="w-full max-w-xl rounded-3xl border border-[#E6E9EE] bg-white p-8 text-center shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F1F3F5] text-[#344154]">
            <span className="text-xl">⋯</span>
          </div>

          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-[#172033]">
            {title}
          </h1>

          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#697586]">
            {description}
          </p>

          <p className="mt-5 text-xs font-medium uppercase tracking-[0.14em] text-[#9AA2AE]">
            Módulo preparado · interfaz en desarrollo
          </p>
        </div>
      </div>
    </div>
  );
}

function EmployeeProjectDetailRoute({
  params,
}: {
  params: { id: string };
}) {
  const [, setLocation] = useLocation();

  return (
    <EmployeeRoute requiredPermission="projects.read">
      <ProjectDetail
        projectId={params.id}
        onBack={() => setLocation("/employee/projects")}
        onNavigate={setLocation}
      />
    </EmployeeRoute>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={EmployeeAuth} />
      <Route path="/reset-password" component={ResetPassword} />

      {/* ==========================================================
          TAREAS DE PROYECTOS — Direction + Developer
         ========================================================== */}
      <Route
        path="/employee/project-tasks/:id"
        component={({ params }) => (
          <EmployeeRoute requiredPermission="project_tasks.read">
            <ProjectTasksArea basePath="/employee/project-tasks" />
          </EmployeeRoute>
        )}
      />
      <Route
        path="/employee/project-tasks"
        component={() => (
          <EmployeeRoute requiredPermission="project_tasks.read">
            <ProjectTasksArea basePath="/employee/project-tasks" />
          </EmployeeRoute>
        )}
      />

      {/* ==========================================================
          PANEL PRINCIPAL — DASHBOARD DETERMINADO POR EL ROL
         ========================================================== */}
      <Route
        path="/"
        component={() => (
          <EmployeeRoute>
            <RoleDashboard />
          </EmployeeRoute>
        )}
      />

      <Route
        path="/employee"
        component={() => (
          <EmployeeRoute>
            <RoleDashboard />
          </EmployeeRoute>
        )}
      />

      {/* ==========================================================
          PROYECTOS — módulo existente
         ========================================================== */}
      <Route
        path="/employee/projects/new"
        component={() => (
          <EmployeeRoute requiredPermission="projects.create">
            <Projects />
          </EmployeeRoute>
        )}
      />
      <Route
  path="/employee/projects/:id"
  component={({ params }) => (
    <EmployeeRoute requiredPermission="projects.read">
      <ProjectDetail
        projectId={params.id}
        onBack={() => {
          window.history.back();
        }}
        onNavigate={(path) => {
          window.history.pushState({}, "", path);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }}
      />
    </EmployeeRoute>
  )}
/>
     
      <Route
        path="/employee/projects"
        component={() => (
          <EmployeeRoute requiredPermission="projects.read">
            <Projects />
          </EmployeeRoute>
        )}
      />

      {/* ==========================================================
          EMPRESAS — módulo existente
         ========================================================== */}
      <Route
        path="/employee/companies/:id"
        component={() => (
          <EmployeeRoute requiredPermission="companies.read">
            <CompaniesArea basePath="/employee/companies" />
          </EmployeeRoute>
        )}
      />
      <Route
        path="/employee/companies"
        component={() => (
          <EmployeeRoute requiredPermission="companies.read">
            <CompaniesArea basePath="/employee/companies" />
          </EmployeeRoute>
        )}
      />

      {/* ==========================================================
          CAMBIOS DE EMPRESA — funcionalidad existente
         ========================================================== */}
      <Route
        path="/employee/company-changes/:id"
        component={() => (
          <EmployeeRoute requiredPermission="companies.update">
            <EmployeeCompanyChanges />
          </EmployeeRoute>
        )}
      />
      <Route
        path="/employee/company-changes"
        component={() => (
          <EmployeeRoute requiredPermission="companies.update">
            <EmployeeCompanyChanges />
          </EmployeeRoute>
        )}
      />

      {/* ==========================================================
          PRESUPUESTOS — módulo existente
         ========================================================== */}
      <Route
        path="/employee/quotations/new"
        component={() => (
          <EmployeeRoute requiredPermission="quotations.create">
            <QuotationsArea basePath="/employee/quotations" />
          </EmployeeRoute>
        )}
      />

      <Route
        path="/employee/quotations/draft/:id"
        component={() => (
          <EmployeeRoute requiredPermission="quotations.read">
            <QuotationsArea basePath="/employee/quotations" />
          </EmployeeRoute>
        )}
      />


      <Route
        path="/employee/quotations/:id"
        component={() => (
          <EmployeeRoute requiredPermission="quotations.read">
            <QuotationsArea basePath="/employee/quotations" />
          </EmployeeRoute>
        )}
      />
      <Route
        path="/employee/quotations"
        component={() => (
          <EmployeeRoute requiredPermission="quotations.read">
            <QuotationsArea basePath="/employee/quotations" />
          </EmployeeRoute>
        )}
      />

      {/* ==========================================================
          FACTURACIÓN — módulo existente
         ========================================================== */}
      <Route
        path="/employee/billing/new"
        component={() => (
          <EmployeeRoute requiredPermission="invoices.create">
            <BillingArea basePath="/employee/billing" />
          </EmployeeRoute>
        )}
      />
      <Route
        path="/employee/billing/:id"
        component={() => (
          <EmployeeRoute requiredPermission="invoices.read">
            <BillingArea basePath="/employee/billing" />
          </EmployeeRoute>
        )}
      />
      <Route
        path="/employee/billing"
        component={() => (
          <EmployeeRoute requiredPermission="invoices.read">
            <BillingArea basePath="/employee/billing" />
          </EmployeeRoute>
        )}
      />

      {/* ==========================================================
          MANTENIMIENTO — módulo existente
         ========================================================== */}
      <Route
        path="/employee/maintenance/plan/:id"
        component={() => (
          <EmployeeRoute requiredPermission="maintenance.read">
            <MaintenanceArea basePath="/employee/maintenance" />
          </EmployeeRoute>
        )}
      />
      <Route
        path="/employee/maintenance/contract/:id"
        component={() => (
          <EmployeeRoute requiredPermission="maintenance.read">
            <MaintenanceArea basePath="/employee/maintenance" />
          </EmployeeRoute>
        )}
      />
      <Route
        path="/employee/maintenance/proposal/:id"
        component={() => (
          <EmployeeRoute requiredPermission="maintenance.read">
            <MaintenanceArea basePath="/employee/maintenance" />
          </EmployeeRoute>
        )}
      />
      <Route
        path="/employee/maintenance"
        component={() => (
          <EmployeeRoute requiredPermission="maintenance.read">
            <MaintenanceArea basePath="/employee/maintenance" />
          </EmployeeRoute>
        )}
      />

      {/* ==========================================================
          SOPORTE — módulo existente
         ========================================================== */}
      <Route
        path="/employee/support/:id"
        component={({ params }) => (
          <EmployeeRoute requiredPermission="support.read">
            <SupportArea
              basePath="/employee/support"
              ticketId={params.id}
            />
          </EmployeeRoute>
        )}
      />
      <Route
        path="/employee/support"
        component={() => (
          <EmployeeRoute requiredPermission="support.read">
            <SupportArea basePath="/employee/support" />
          </EmployeeRoute>
        )}
      />

      {/* ==========================================================
          TAREAS INTERNAS — módulo existente
         ========================================================== */}
      <Route
        path="/employee/tasks/:id"
        component={({ params }) => (
          <EmployeeRoute requiredPermission="internal_tasks.read">
            <InternalTasksArea
              basePath="/employee/tasks"
              taskId={params.id}
            />
          </EmployeeRoute>
        )}
      />
      <Route
        path="/employee/tasks"
        component={() => (
          <EmployeeRoute requiredPermission="internal_tasks.read">
            <InternalTasksArea basePath="/employee/tasks" />
          </EmployeeRoute>
        )}
      />

      {/* ==========================================================
          IA — módulo existente
         ========================================================== */}
      <Route
        path="/employee/ai/:id"
        component={() => (
          <EmployeeRoute requiredPermission="ai.read">
            <AIConversations />
          </EmployeeRoute>
        )}
      />
      <Route
        path="/employee/ai"
        component={() => (
          <EmployeeRoute requiredPermission="ai.read">
            <AIConversations />
          </EmployeeRoute>
        )}
      />

      {/* ==========================================================
          FINANZAS — módulo existente
         ========================================================== */}
      <Route
        path="/employee/financials"
        component={() => (
          <EmployeeRoute requiredPermission="finance.read">
            <EmployeeFinancials />
          </EmployeeRoute>
        )}
      />






      <Route
  path="/employee/team"
  component={() => (
    <EmployeeRoute requiredPermission="system.workers.read">
      <WorkersProfilesArea />
    </EmployeeRoute>
  )}
/>

      {/* ==========================================================
          MÓDULOS FUTUROS — rutas preparadas para el Sidebar
         ========================================================== */}
      <Route
        path="/employee/clients"
        component={() => (
          <EmployeeRoute requiredPermission="clients.read">
            <ModuleComingSoon
              title="Clientes"
              description="El acceso de Clientes está definido en RBAC. La interfaz específica de gestión de clientes se incorporará en este módulo."
            />
          </EmployeeRoute>
        )}
      />

      <Route
        path="/employee/payments"
        component={() => (
          <EmployeeRoute requiredPermission="payments.read">
            <ModuleComingSoon
              title="Pagos"
              description="El módulo de Pagos está preparado a nivel de permisos. La interfaz independiente de gestión y consulta se incorporará próximamente."
            />
          </EmployeeRoute>
        )}
      />

      <Route
  path="/employee/expenses"
  component={() => (
    <EmployeeRoute requiredPermission="expenses.read">
      <Expenses />
    </EmployeeRoute>
  )}
/>

      <Route
        path="/employee/automations"
        component={() => (
          <EmployeeRoute requiredPermission="automations.read">
            <ModuleComingSoon
              title="Automatizaciones"
              description="El acceso de Automatizaciones está definido para Dirección y Developer. La interfaz de gestión se incorporará en este módulo."
            />
          </EmployeeRoute>
        )}
      />


            <Route
        path="/employee/roles"
        component={() => (
          <EmployeeRoute requiredPermission="system.roles.read">
            <RolesPermissions />
          </EmployeeRoute>
        )}
      />

   <Route
  path="/employee/audit"
  component={() => (
    <EmployeeRoute requiredPermission="system.audit.read">
      <AuditRequestsPage />
    </EmployeeRoute>
  )}
/>
<Route
  path="/employee/payroll"
  component={() => (
    <EmployeeRoute requiredPermission="payroll.read">
      <EmployeePayroll />
    </EmployeeRoute>
  )}
/>

      <Route
        path="/employee/logs/errors"
        component={() => (
          <EmployeeRoute requiredPermission="system.error_logs.read">
            <ModuleComingSoon
              title="Logs de errores"
              description="Los logs de errores están disponibles para Dirección y Developer."
            />
          </EmployeeRoute>
        )}
      />

      <Route
        path="/employee/webhooks"
        component={() => (
          <EmployeeRoute requiredPermission="system.webhooks.read">
            <ModuleComingSoon
              title="Webhooks"
              description="La consulta de webhooks está preparada para Dirección y Developer."
            />
          </EmployeeRoute>
        )}
      />

      <Route
        path="/employee/settings"
        component={() => (
          <EmployeeRoute requiredPermission="system.settings.read">
            <ModuleComingSoon
              title="Configuración"
              description="La configuración del sistema está reservada a Dirección."
            />
          </EmployeeRoute>
        )}
      />

      {/* ==========================================================
          ADMIN LEGACY
         ========================================================== */}
      <Route path="/admin" component={AdminPanel} />

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    const savedScroll = sessionStorage.getItem("modira_restore_scroll");
    if (!savedScroll) return;

    sessionStorage.removeItem("modira_restore_scroll");

    const scrollY = Number(savedScroll);
    if (!Number.isFinite(scrollY)) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({
          top: scrollY,
          behavior: "instant",
        });
      });
    });
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider defaultTheme="light">
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
