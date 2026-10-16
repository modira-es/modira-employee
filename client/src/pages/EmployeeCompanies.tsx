import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Activity,
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  ExternalLink,
  FileText,
  Filter,
  FolderKanban,
  Loader2,
  Menu,
  RefreshCw,
  Search,
  ShieldCheck,
  Ticket,
  User,
  Users,
  X,
  Zap,
  ArrowRightLeft,
} from "lucide-react";

import { toast } from "sonner";

/* ============================================================================
   TIPOS
   ========================================================================== */

type Row = Record<string, any>;

type Company = Row & {
  id: string;
  company_code: string;
  company_name: string;
  legal_name?: string | null;
  cif_vat?: string | null;
  billing_email?: string | null;
  phone?: string | null;
  website?: string | null;
  logo_url?: string | null;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
  industry?: string | null;
  employees?: number | null;
  timezone?: string | null;
  language?: string | null;
  currency?: string | null;
  stripe_customer_id?: string | null;
  subscription_plan?: string | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  is_active?: boolean;
  created_by?: string | null;
  updated_by?: string | null;
  settings?: Row | null;
  created_at?: string | null;
    iva_recomendado_aplicado?: boolean;
  iva_recomendado_porcentaje?: number | null;
  iva_recomendado_por?: string | null;
  iva_recomendado_updated_at?: string | null;
  updated_at?: string | null;
};

interface EmployeeCompaniesProps {
  basePath?: string;
  onMenuNavigate?: (id: string) => void;
}

/* ============================================================================
   HELPERS
   ========================================================================== */

const formatDate = (value: unknown, withTime = false) => {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" as const } : {}),
  }).format(date);
};

const formatMoney = (value: unknown, currency = "EUR") => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
  }).format(number);
};

const paymentAmount = (value: unknown) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return number / 100;
};

const textValue = (value: unknown) =>
  value === null || value === undefined || String(value).trim() === ""
    ? "—"
    : String(value);

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

const statusLabel = (value: unknown) => {
  const status = normalize(value);
  const labels: Record<string, string> = {
    activo: "Activo",
    active: "Activo",
    pausado: "Pausado",
    cancelado: "Cancelado",
    finalizado: "Finalizado",
    pendiente: "Pendiente",
    nuevo: "Nuevo",
    abierto: "Abierto",
    en_progreso: "En progreso",
    cerrado: "Cerrado",
    aprobado: "Aprobado",
    aceptado: "Aceptado",
    rechazado: "Rechazado",
    vencida: "Vencida",
    pagada: "Pagada",
    borrador: "Borrador",
    ejecutando: "Ejecutando",
    exito: "Éxito",
    error: "Error",
    approved: "Aprobada",
    rejected: "Rechazada",
    pending: "Pendiente",
    cancelled: "Cancelada",
  };
  return labels[status] || textValue(value);
};

const badgeClass = (value: unknown) => {
  const status = normalize(value);
  if (["activo", "active", "pagada", "aceptado", "aprobado", "approved", "exito", "completado"].includes(status)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (["pendiente", "pending", "borrador", "pausado", "en_progreso", "ejecutando"].includes(status)) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (["error", "rechazado", "rejected", "vencida", "urgente", "cancelado", "cancelled"].includes(status)) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (["abierto", "nuevo"].includes(status)) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
};

function StatusBadge({ value }: { value: unknown }) {
  return (
    <Badge
      variant="outline"
      className={`${badgeClass(value)} whitespace-nowrap font-semibold`}
    >
      {statusLabel(value)}
    </Badge>
  );
}

async function assertActiveWorker() {
  const { data, error } = await supabase.rpc("current_user_is_worker");
  if (error) throw error;
  if (data !== true) {
    throw new Error(
      "La sesión actual no corresponde a un trabajador activo de Modira."
    );
  }
}

/* ============================================================================
   NAVEGACIÓN — MISMO FORMATO QUE EMPLOYEEQUOTATIONS
   ========================================================================== */

function EmployeeCompaniesNavigation({
  open,
  location,
  employeeRoot,
  companiesBase,
  onClose,
  onNavigate,
}: {
  open: boolean;
  location: string;
  employeeRoot: string;
  companiesBase: string;
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const groups: Array<{
    title: string;
    items: Array<{
      id: string;
      label: string;
      icon: ComponentType<{ className?: string; strokeWidth?: number }>;
    }>;
  }> = [
    {
      title: "Principal",
      items: [{ id: "dashboard", label: "Dashboard", icon: BarChart3 }],
    },
    {
      title: "Gestión",
      items: [
        { id: "projects", label: "Proyectos", icon: FolderKanban },
        { id: "companies", label: "Empresas", icon: Building2 },
        { id: "quotations", label: "Presupuestos", icon: FileText },
        { id: "billing", label: "Facturación", icon: CreditCard },
        { id: "payments", label: "Pagos", icon: CircleDollarSign },
        { id: "support", label: "Tickets", icon: Ticket },
      ],
    },
    {
      title: "Comunicación",
      items: [
        { id: "ai", label: "Conversaciones IA", icon: Zap },
        { id: "notifications", label: "Notificaciones", icon: Bell },
      ],
    },
    {
      title: "Operaciones",
      items: [
        { id: "activity", label: "Actividad", icon: Activity },
        { id: "audits", label: "Auditorías", icon: FileText },
        { id: "companyChanges", label: "Cambios de empresa", icon: Building2 },
        {
          id: "maintenance",
          label: "Contratos de mantenimiento",
          icon: CalendarDays,
        },
      ],
    },
    {
      title: "Automatización",
      items: [
        { id: "automations", label: "Automatizaciones", icon: Zap },
        { id: "automationRuns", label: "Ejecuciones", icon: RefreshCw },
      ],
    },
  ];

  const isActive = (id: string) => {
    if (id === "companies") {
      return (
        location === companiesBase ||
        location.startsWith(`${companiesBase}/`)
      );
    }
    if (id === "dashboard") {
      return location === employeeRoot || location === `${employeeRoot}/`;
    }
    return (
      location === `${employeeRoot}/${id}` ||
      location.startsWith(`${employeeRoot}/${id}/`)
    );
  };

  return (
    <aside
      className={[
        "fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[86vw]",
        "flex-col border-r border-[#E6E9EE] bg-white",
        "transition-transform duration-200 ease-out",
        open ? "translate-x-0" : "-translate-x-full",
      ].join(" ")}
      aria-hidden={!open}
    >
      <div className="flex h-[72px] items-center justify-between border-b border-[#EEF1F4] px-6">
        <div>
          <p className="text-lg font-semibold tracking-[-0.025em] text-[#172033]">
            MODIRA
          </p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9AA2AE]">
            Operaciones
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#7B8594] transition-colors hover:bg-[#F6F7F9] hover:text-[#172033]"
          aria-label="Cerrar menú"
        >
          <X className="h-5 w-5" strokeWidth={1.7} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-5">
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9AA2AE]">
                {group.title}
              </p>
              <div className="mt-2 space-y-1">
                {group.items.map((item) => {
                  const active = isActive(item.id);
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onNavigate(item.id)}
                      className={[
                        "flex w-full items-center gap-3 rounded-lg",
                        "px-3 py-2.5 text-left text-sm",
                        "transition-colors",
                        active
                          ? "bg-[#EEF3FF] font-semibold text-[#1E3A8A]"
                          : "font-medium text-[#536074] hover:bg-[#F6F7F9] hover:text-[#172033]",
                      ].join(" ")}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="border-t border-[#EEF1F4] px-6 py-5">
        <p className="text-xs text-[#8A94A4]">Sesión de trabajador interno</p>
        <p className="mt-1 truncate text-sm font-medium text-[#344154]">Modira</p>
      </div>
    </aside>
  );
}

function PageHeader({
  title,
  subtitle,
  onOpenMenu,
}: {
  title: string;
  subtitle: string;
  onOpenMenu: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <button
        type="button"
        onClick={onOpenMenu}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#5F6B7C] transition-colors hover:bg-white hover:text-[#172033]"
        aria-label="Abrir menú de navegación"
      >
        <Menu className="h-5 w-5" strokeWidth={1.7} />
      </button>
      <div className="hidden flex-1 sm:block">
        <p className="text-sm font-semibold text-[#263044]">{title}</p>
        <p className="text-xs text-[#939CAA]">{subtitle}</p>
      </div>
    </div>
  );
}

function PageLoading({ text = "Cargando empresas..." }: { text?: string }) {
  return (
    <Card className="border border-slate-200 bg-white shadow-none">
      <div className="flex min-h-[420px] flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#1E3A8A]" />
        <p className="mt-4 text-sm font-medium text-slate-600">{text}</p>
      </div>
    </Card>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <Card className="border border-red-200 bg-red-50 shadow-none">
      <div className="flex items-start gap-3 p-4">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div>
          <p className="font-semibold text-red-800">Se ha producido un error</p>
          <p className="mt-1 text-sm text-red-700">{message}</p>
        </div>
      </div>
    </Card>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail: string;
}) {
  return (
    <Card className="border border-slate-200 bg-white p-4 shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-800">
            {value}
          </p>
          <p className="mt-1 text-xs text-slate-400">{detail}</p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A]">
          {icon}
        </div>
      </div>
    </Card>
  );
}

function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F4F7FB] text-[#1E3A8A]">
            {icon}
          </div>
          <h2 className="truncate text-sm font-semibold text-[#263044]">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="px-5 py-10 text-center text-sm text-slate-400">{text}</div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9AA2AE]">
        {label}
      </p>
      <p className="mt-1 break-words text-sm text-[#344154]">{value}</p>
    </div>
  );
}

function TableShell({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

/* ============================================================================
   COMPONENTE PRINCIPAL
   ========================================================================== */

export default function EmployeeCompanies({
  basePath = "/employee/companies",
  onMenuNavigate,
}: EmployeeCompaniesProps) {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const base = basePath.replace(/\/+$/, "") || "/employee/companies";
  const employeeRoot = base.replace(/\/companies$/, "") || "/employee";
  const normalizedLocation = location.split("?")[0].replace(/\/+$/, "");

  const companyId =
    normalizedLocation.startsWith(`${base}/`) && normalizedLocation !== `${base}/`
      ? normalizedLocation.slice(`${base}/`.length)
      : null;

  const [companies, setCompanies] = useState<Company[]>([]);
  const [profiles, setProfiles] = useState<Row[]>([]);
  const [clients, setClients] = useState<Row[]>([]);
  const [projects, setProjects] = useState<Row[]>([]);
  const [quotations, setQuotations] = useState<Row[]>([]);
  const [invoices, setInvoices] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [tickets, setTickets] = useState<Row[]>([]);
  const [maintenanceContracts, setMaintenanceContracts] = useState<Row[]>([]);
  const [maintenancePlans, setMaintenancePlans] = useState<Row[]>([]);
  const [maintenanceInvoices, setMaintenanceInvoices] = useState<Row[]>([]);
  const [maintenanceContractProjects, setMaintenanceContractProjects] = useState<Row[]>([]);
  const [maintenanceContractAutomations, setMaintenanceContractAutomations] = useState<Row[]>([]);
  const [changeRequests, setChangeRequests] = useState<Row[]>([]);
  const [activityLog, setActivityLog] = useState<Row[]>([]);
  const [auditRequests, setAuditRequests] = useState<Row[]>([]);
  const [notifications, setNotifications] = useState<Row[]>([]);
  const [milestones, setMilestones] = useState<Row[]>([]);
  const [progressRows, setProgressRows] = useState<Row[]>([]);
  const [projectUpdates, setProjectUpdates] = useState<Row[]>([]);
  const [projectDocuments, setProjectDocuments] = useState<Row[]>([]);
  const [projectChangeRequests, setProjectChangeRequests] = useState<Row[]>([]);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [subscriptionFilter, setSubscriptionFilter] = useState("all");
  const [previousCompanyFilter, setPreviousCompanyFilter] = useState("current");
const [companyChangeSearch, setCompanyChangeSearch] = useState("");
const [companyChangeStatusFilter, setCompanyChangeStatusFilter] = useState("pending");
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);
  const [assignTargetByUser, setAssignTargetByUser] = useState<Record<string, string>>({});
 const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(null);

const [ivaRecomendado, setIvaRecomendado] = useState("21");
const [guardandoIva, setGuardandoIva] = useState(false);

const [ivaChangeRequests, setIvaChangeRequests] = useState<Row[]>([]);
const [resolvingIvaRequestId, setResolvingIvaRequestId] = useState<string | null>(null);
  const activeCompanies = useMemo(
    () => companies.filter((company) => company.is_active !== false),
    [companies]
  );
const previousCompanyIds = useMemo(
  () =>
    new Set(
      changeRequests
        .filter((request) => {
          const status = normalize(request.status);
          return (
            status === "approved" ||
            status === "aprobado" ||
            status === "aceptado" ||
            status === "accepted"
          );
        })
        .map((request) => request.current_company_id)
        .filter(Boolean)
    ),
  [changeRequests]
);
  const loadCompanyList = useCallback(
    async (silent = false) => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        if (silent) setRefreshing(true);
        else setLoading(true);
        setError(null);
        await assertActiveWorker();

        const [
  companiesResult,
  profilesResult,
  changesResult,
] = await Promise.all([
  supabase
    .from("companies")
    .select("*")
    .order("company_name", { ascending: true }),

  supabase
    .from("profiles")
    .select("*")
    .order("nombre", { ascending: true }),

  supabase
    .from("company_change_requests")
    .select("*")
    .order("created_at", { ascending: false }),

]);

        if (companiesResult.error) throw companiesResult.error;
        if (profilesResult.error) throw profilesResult.error;
        if (changesResult.error) throw changesResult.error;

        setCompanies((companiesResult.data || []) as Company[]);
        setProfiles((profilesResult.data || []) as Row[]);
        setChangeRequests((changesResult.data || []) as Row[]);
      } catch (err: any) {
        console.error("[EmployeeCompanies] List load error:", err);
        setError(err?.message || "No se pudieron cargar las empresas.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user]
  );

  const loadCompanyDetail = useCallback(
    async (silent = false) => {
      if (!user || !companyId) return;

      try {
        if (!silent) setDetailLoading(true);
        setDetailError(null);
        await assertActiveWorker();

        const [
          companyResult,
          profilesResult,
          clientsResult,
          projectsResult,
          quotationsResult,
          invoicesResult,
          paymentsResult,
          ticketsResult,
          maintenanceResult,
          maintenancePlansResult,
          maintenanceInvoicesResult,
          maintenanceContractProjectsResult,
          maintenanceContractAutomationsResult,
          changesResult,
          ivaChangeRequestsResult,
          activityResult,
          auditsResult,
          notificationsResult,
        ] = await Promise.all([
          supabase.from("companies").select("*").eq("id", companyId).maybeSingle(),
          supabase.from("profiles").select("*").eq("company_id", companyId).order("nombre", { ascending: true }),
          supabase.from("clients").select("*").eq("company_id", companyId).order("nombre", { ascending: true }),
          supabase.from("projects").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
          supabase.from("quotations").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
          supabase.from("invoices").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
          supabase.from("payments").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
          supabase.from("support_tickets").select("*").eq("company_id", companyId).order("updated_at", { ascending: false }),
          supabase.from("maintenance_contracts").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
          supabase.from("maintenance_plans").select("*").order("nombre", { ascending: true }),
          supabase.from("maintenance_invoices").select("*").eq("company_id", companyId).order("fecha_emision", { ascending: false }),
          supabase.from("maintenance_contract_projects").select("*"),
          supabase.from("maintenance_contract_automations").select("*"),
          supabase.from("company_change_requests").select("*").or(`current_company_id.eq.${companyId},requested_company_id.eq.${companyId}`).order("created_at", { ascending: false }),
          supabase
  .from("company_iva_change_requests")
  .select(
    "id, company_id, user_id, requested_iva_aplicado, requested_iva_porcentaje, reason, status, reviewed_by, reviewed_at, worker_notes, created_at, updated_at"
  )
  .eq("company_id", companyId)
  .order("created_at", { ascending: false }),
          supabase.from("activity_log").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(100),
          supabase.from("audit_requests").select("*").order("created_at", { ascending: false }),
          supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(300),
        ]);

        if (companyResult.error) throw companyResult.error;
        if (profilesResult.error) throw profilesResult.error;
        if (clientsResult.error) throw clientsResult.error;
        if (projectsResult.error) throw projectsResult.error;
        if (quotationsResult.error) throw quotationsResult.error;
        if (invoicesResult.error) throw invoicesResult.error;
        if (paymentsResult.error) throw paymentsResult.error;
        if (ticketsResult.error) throw ticketsResult.error;
        if (maintenanceResult.error) throw maintenanceResult.error;
        if (maintenancePlansResult.error) throw maintenancePlansResult.error;
        if (maintenanceInvoicesResult.error) throw maintenanceInvoicesResult.error;
        if (maintenanceContractProjectsResult.error) throw maintenanceContractProjectsResult.error;
        if (maintenanceContractAutomationsResult.error) throw maintenanceContractAutomationsResult.error;
        if (changesResult.error) throw changesResult.error;
        if (ivaChangeRequestsResult.error) {
  console.warn(
    "[EmployeeCompanies] Error loading IVA change requests:",
    ivaChangeRequestsResult.error
  );
}
        if (activityResult.error) throw activityResult.error;
        if (auditsResult.error) throw auditsResult.error;
        if (notificationsResult.error) throw notificationsResult.error;
        if (!companyResult.data) throw new Error("La empresa indicada no existe o no está disponible.");

        setCompanies((current) => {
          const without = current.filter((item) => item.id !== companyId);
          return [companyResult.data as Company, ...without].sort((a, b) =>
            String(a.company_name || "").localeCompare(String(b.company_name || ""), "es")
          );
        });

        setProfiles((profilesResult.data || []) as Row[]);
        setClients((clientsResult.data || []) as Row[]);
        setProjects((projectsResult.data || []) as Row[]);
        setQuotations((quotationsResult.data || []) as Row[]);
        setInvoices((invoicesResult.data || []) as Row[]);
        setPayments((paymentsResult.data || []) as Row[]);
        setTickets((ticketsResult.data || []) as Row[]);
        setMaintenanceContracts((maintenanceResult.data || []) as Row[]);
        setMaintenancePlans((maintenancePlansResult.data || []) as Row[]);
        setMaintenanceInvoices((maintenanceInvoicesResult.data || []) as Row[]);
        const maintenanceContractIds = new Set(
          ((maintenanceResult.data || []) as Row[]).map((contract) => contract.id).filter(Boolean)
        );
        setMaintenanceContractProjects(
          ((maintenanceContractProjectsResult.data || []) as Row[]).filter((row) => maintenanceContractIds.has(row.maintenance_contract_id))
        );
        setMaintenanceContractAutomations(
          ((maintenanceContractAutomationsResult.data || []) as Row[]).filter((row) => maintenanceContractIds.has(row.maintenance_contract_id))
        );
        setChangeRequests((changesResult.data || []) as Row[]);
        setIvaChangeRequests(
  (ivaChangeRequestsResult.data || []) as Row[]
);
        setActivityLog((activityResult.data || []) as Row[]);
        setAuditRequests((auditsResult.data || []) as Row[]);

        const companyUserIds = new Set(
          ((profilesResult.data || []) as Row[]).map((profile) => profile.id).filter(Boolean)
        );
        setNotifications(
          ((notificationsResult.data || []) as Row[]).filter((notification) =>
            companyUserIds.has(notification.user_id)
          )
        );

        const projectIds = ((projectsResult.data || []) as Row[])
          .map((project) => project.id)
          .filter(Boolean);

        if (projectIds.length > 0) {
          const [milestonesResult, progressResult, updatesResult, documentsResult, projectChangesResult] =
            await Promise.all([
              supabase.from("project_milestones").select("*").in("project_id", projectIds).order("orden", { ascending: true }),
              supabase.from("project_progress").select("*").in("project_id", projectIds),
              supabase.from("project_updates").select("*").in("project_id", projectIds).order("created_at", { ascending: false }),
              supabase.from("project_documents").select("*").in("project_id", projectIds).order("created_at", { ascending: false }),
              supabase.from("project_change_requests").select("*").in("project_id", projectIds).order("created_at", { ascending: false }),
            ]);

          if (milestonesResult.error) throw milestonesResult.error;
          if (progressResult.error) throw progressResult.error;
          if (updatesResult.error) throw updatesResult.error;
          if (documentsResult.error) throw documentsResult.error;
          if (projectChangesResult.error) throw projectChangesResult.error;

          setMilestones((milestonesResult.data || []) as Row[]);
          setProgressRows((progressResult.data || []) as Row[]);
          setProjectUpdates((updatesResult.data || []) as Row[]);
          setProjectDocuments((documentsResult.data || []) as Row[]);
          setProjectChangeRequests((projectChangesResult.data || []) as Row[]);
        } else {
          setMilestones([]);
          setProgressRows([]);
          setProjectUpdates([]);
          setProjectDocuments([]);
          setProjectChangeRequests([]);
        }
      } catch (err: any) {
        console.error("[EmployeeCompanies] Detail load error:", err);
        setDetailError(err?.message || "No se pudo cargar la información de la empresa.");
      } finally {
        setDetailLoading(false);
      }
    },
    [user, companyId]
  );

  useEffect(() => {
    if (!companyId) {
      void loadCompanyList();
    } else {
      void loadCompanyDetail();
    }
  }, [companyId, loadCompanyList, loadCompanyDetail]);

  const navigateFromMenu = useCallback(
    (id: string) => {
      setMenuOpen(false);
      if (onMenuNavigate) {
        onMenuNavigate(id);
        return;
      }

      const pathMap: Record<string, string> = {
        dashboard: employeeRoot,
        projects: `${employeeRoot}/projects`,
        companies: base,
        quotations: `${employeeRoot}/quotations`,
        billing: `${employeeRoot}/billing`,
        payments: `${employeeRoot}/payments`,
        support: `${employeeRoot}/support`,
        ai: `${employeeRoot}/ai`,
        notifications: `${employeeRoot}/notifications`,
        activity: `${employeeRoot}/activity`,
        audits: `${employeeRoot}/audits`,
        companyChanges: `${employeeRoot}/companyChanges`,
        maintenance: `${employeeRoot}/maintenance`,
        automations: `${employeeRoot}/automations`,
        automationRuns: `${employeeRoot}/automationRuns`,
      };

      const target = pathMap[id];
      if (target) setLocation(target);
    },
    [base, employeeRoot, onMenuNavigate, setLocation]
  );

  const filteredCompanies = useMemo(() => {
  const query = search.trim().toLowerCase();

  return companies
    .filter((company) => {
      const isPreviousCompany = previousCompanyIds.has(company.id);

      const matchesPreviousCompany =
        previousCompanyFilter === "all" ||
        (previousCompanyFilter === "current" && !isPreviousCompany) ||
        (previousCompanyFilter === "previous" && isPreviousCompany);

      const matchesSearch =
        !query ||
        [
          company.company_name,
          company.company_code,
          company.legal_name,
          company.cif_vat,
          company.billing_email,
          company.phone,
          company.website,
          company.city,
          company.province,
          company.industry,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(query)
          );

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && company.is_active !== false) ||
        (statusFilter === "inactive" && company.is_active === false);

      const matchesSubscription =
        subscriptionFilter === "all" ||
        normalize(company.subscription_status) === normalize(subscriptionFilter);

      return (
        matchesPreviousCompany &&
        matchesSearch &&
        matchesStatus &&
        matchesSubscription
      );
    })
    .sort((a, b) =>
      String(a.company_name || "").localeCompare(
        String(b.company_name || ""),
        "es"
      )
    );
}, [
  companies,
  search,
  statusFilter,
  subscriptionFilter,
  previousCompanyFilter,
  previousCompanyIds,
]);

  const company = useMemo(
    () => companies.find((item) => item.id === companyId) || null,
    [companies, companyId]
  );
    useEffect(() => {
    if (!company) return;

    setIvaRecomendado(
      String(company.iva_recomendado_porcentaje ?? 21)
    );
  }, [
    company?.id,
    company?.iva_recomendado_porcentaje,
  ]);

  const companyProjects = projects;
  const companyQuotations = quotations;
  const companyInvoices = invoices;
  const companyTickets = tickets;
  const companyChanges = changeRequests;
  const companyMaintenance = maintenanceContracts;
  const companyMaintenancePlans = maintenancePlans;
  const companyMaintenanceInvoices = maintenanceInvoices;
  const companyMaintenanceContractProjects = maintenanceContractProjects;
  const companyMaintenanceContractAutomations = maintenanceContractAutomations;
  const companyProfiles = useMemo(
    () => profiles.filter((profile) => profile.company_id === companyId),
    [profiles, companyId]
  );

  const pendingChangeRequests = useMemo(
    () => changeRequests.filter((request) => normalize(request.status) === "pending" || normalize(request.status) === "pendiente"),
    [changeRequests]
  );
const filteredCompanyChangeRequests = useMemo(() => {
  const query = companyChangeSearch.trim().toLowerCase();

  return changeRequests
    .filter((request) => {
      const currentCompany = companies.find(
        (company) => company.id === request.current_company_id
      );

      const requestedCompany = companies.find(
        (company) => company.id === request.requested_company_id
      );

      const matchesSearch =
        !query ||
        [
          request.requested_company_name,
          currentCompany?.company_name,
          currentCompany?.company_code,
          requestedCompany?.company_name,
          requestedCompany?.company_code,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(query)
          );

      const normalizedStatus = normalize(request.status);

      const matchesStatus =
        companyChangeStatusFilter === "all" ||
        (companyChangeStatusFilter === "pending" &&
          (normalizedStatus === "pending" ||
            normalizedStatus === "pendiente")) ||
        (companyChangeStatusFilter === "approved" &&
          (normalizedStatus === "approved" ||
            normalizedStatus === "aprobado" ||
            normalizedStatus === "accepted" ||
            normalizedStatus === "aceptado")) ||
        (companyChangeStatusFilter === "rejected" &&
          (normalizedStatus === "rejected" ||
            normalizedStatus === "rechazado"));

      return matchesSearch && matchesStatus;
    })
    .sort(
      (a, b) =>
        new Date(String(b.created_at || 0)).getTime() -
        new Date(String(a.created_at || 0)).getTime()
    );
}, [
  changeRequests,
  companies,
  companyChangeSearch,
  companyChangeStatusFilter,
]);
  const companyStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const profile of profiles) {
      if (!profile.company_id) continue;
      counts.set(profile.company_id, (counts.get(profile.company_id) || 0) + 1);
    }
    return counts;
  }, [profiles]);

  const listPendingChanges = useMemo(
    () => changeRequests.filter((request) => normalize(request.status) === "pending").length,
    [changeRequests]
  );

  const assignUserToCompany = async (profile: Row) => {
    const targetCompanyId = assignTargetByUser[profile.id];
    if (!targetCompanyId) {
      toast.error("Selecciona una empresa de destino.");
      return;
    }
    if (targetCompanyId === profile.company_id) {
      toast.info("El usuario ya pertenece a esa empresa.");
      return;
    }

    try {
      setAssigningUserId(profile.id);
      const { error: rpcError } = await supabase.rpc("admin_update_profile_company", {
        p_user_id: profile.id,
        p_company_id: targetCompanyId,
      });
      if (rpcError) throw rpcError;

      const targetCompany = companies.find((item) => item.id === targetCompanyId);
      toast.success(`Usuario asignado a ${targetCompany?.company_name || "la nueva empresa"}.`);
      setProfiles((current) =>
        current.map((item) =>
          item.id === profile.id
            ? { ...item, company_id: targetCompanyId, empresa: targetCompany?.company_name || item.empresa }
            : item
        )
      );
      setAssignTargetByUser((current) => ({ ...current, [profile.id]: "" }));
    } catch (err: any) {
      console.error("[EmployeeCompanies] Error assigning user:", err);
      toast.error(err?.message || "No se pudo cambiar la empresa del usuario.");
    } finally {
      setAssigningUserId(null);
    }
  };

  const resolveChangeRequest = async (requestId: string, action: "approved" | "rejected") => {
    try {
      setResolvingRequestId(requestId);
      const { error: rpcError } = await supabase.rpc("resolve_company_change_request", {
        p_request_id: requestId,
        p_action: action,
      });
      if (rpcError) throw rpcError;

      toast.success(action === "approved" ? "Solicitud aprobada correctamente." : "Solicitud rechazada correctamente.");
      await loadCompanyDetail(true);
      await loadCompanyList(true);
    } catch (err: any) {
      console.error("[EmployeeCompanies] Error resolving company change request:", err);
      toast.error(err?.message || "No se pudo resolver la solicitud.");
    } finally {
      setResolvingRequestId(null);
    }
  };
  const resolveIvaChangeRequest = async (
  requestId: string,
  action: "approved" | "rejected"
) => {
  try {
    setResolvingIvaRequestId(requestId);

    const { error } = await supabase.rpc(
      "resolve_company_iva_change_request",
      {
        p_request_id: requestId,
        p_action: action,
      }
    );

    if (error) throw error;

    toast.success(
      action === "approved"
        ? "Solicitud de IVA aprobada correctamente."
        : "Solicitud de IVA rechazada correctamente."
    );

    await loadCompanyDetail(true);
    await loadCompanyList(true);
  } catch (err: any) {
    console.error(
      "[EmployeeCompanies] Error resolving IVA change request:",
      err
    );

    toast.error(
      err?.message ||
        "No se pudo resolver la solicitud de cambio de IVA."
    );
  } finally {
    setResolvingIvaRequestId(null);
  }
};
  const saveIvaRecomendado = async () => {
    if (!companyId) return;

    const iva = Number(ivaRecomendado);

    if (!Number.isFinite(iva) || iva < 0 || iva > 100) {
      toast.error("Introduce un IVA válido entre 0 % y 100 %.");
      return;
    }

    try {
      setGuardandoIva(true);

      const { error } = await supabase.rpc("set_company_iva_recommendation", {
        p_company_id: companyId,
        p_iva_aplicado: iva > 0,
        p_iva_porcentaje: iva,
      });

      if (error) throw error;

      toast.success("IVA recomendado actualizado correctamente.");

      await loadCompanyDetail(true);
      await loadCompanyList(true);
    } catch (err: any) {
      console.error("[EmployeeCompanies] Error updating recommended IVA:", err);
      toast.error(
        err?.message || "No se pudo actualizar el IVA recomendado."
      );
    } finally {
      setGuardandoIva(false);
    }
  };
  const openCompany = (id: string) => {
    setLocation(`${base}/${id}`);
  };

  const goBackToCompanies = () => {
    setLocation(base);
    setDetailError(null);
  };

  const goTo = (path: string) => setLocation(path);

  const relatedCompanyName = (id: unknown) =>
    companies.find((item) => item.id === id)?.company_name || "—";

  const projectName = (id: unknown) =>
    projects.find((item) => item.id === id)?.nombre || "—";

  const invoiceAmount = (invoice: Row) =>
    Number(invoice.importe_a_pagar ?? invoice.monto ?? 0);

  const openInvoices = useMemo(
    () => invoices.filter((invoice) => ["pendiente", "vencida"].includes(normalize(invoice.estado))),
    [invoices]
  );

  const collectedPayments = useMemo(
    () => payments.filter((payment) => ["paid", "succeeded", "pagado", "pagada", "exito"].includes(normalize(payment.status || payment.estado))),
    [payments]
  );

  const totalCollected = useMemo(
    () => collectedPayments.reduce((sum, payment) => sum + paymentAmount(payment.amount ?? payment.monto), 0),
    [collectedPayments]
  );

  const maintenancePlanById = useMemo(
    () => new Map(companyMaintenancePlans.map((plan) => [plan.id, plan])),
    [companyMaintenancePlans]
  );

  const maintenanceProjectsByContract = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const relation of companyMaintenanceContractProjects) {
      const current = map.get(relation.maintenance_contract_id) || [];
      current.push(relation);
      map.set(relation.maintenance_contract_id, current);
    }
    return map;
  }, [companyMaintenanceContractProjects]);

  const maintenanceAutomationsByContract = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const relation of companyMaintenanceContractAutomations) {
      const current = map.get(relation.maintenance_contract_id) || [];
      current.push(relation);
      map.set(relation.maintenance_contract_id, current);
    }
    return map;
  }, [companyMaintenanceContractAutomations]);

  
  const maintenanceOpenInvoices = useMemo(
    () => companyMaintenanceInvoices.filter((invoice) => ["pendiente", "enviada", "impagada"].includes(normalize(invoice.estado))),
    [companyMaintenanceInvoices]
  );

  const matchedAudits = useMemo(() => {
    if (!company) return [];
    const target = normalize(company.company_name);
    return auditRequests.filter((audit) => normalize(audit.empresa) === target);
  }, [auditRequests, company]);

  if (loading && !companyId) {
    return (
      <div className="min-h-screen bg-white text-[#172033]">
        <div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
          <PageHeader title="Empresas" subtitle="Gestión y consulta de empresas" onOpenMenu={() => setMenuOpen(true)} />
          <PageLoading />
        </div>
        <EmployeeCompaniesNavigation
          open={menuOpen}
          location={normalizedLocation}
          employeeRoot={employeeRoot}
          companiesBase={base}
          onClose={() => setMenuOpen(false)}
          onNavigate={navigateFromMenu}
        />
        {menuOpen && (
          <div className="fixed inset-0 z-40 bg-[#172033]/20 backdrop-blur-[1px]" onClick={() => setMenuOpen(false)} aria-hidden="true" />
        )}
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="min-h-screen bg-white text-[#172033]">
        <div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
          <PageHeader
            title="Empresas"
            subtitle="Consulta, revisión y gestión de la relación con las empresas"
            onOpenMenu={() => setMenuOpen(true)}
          />

          {error && <ErrorBox message={error} />}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              icon={<Building2 className="h-4 w-4" />}
              label="Empresas"
              value={companies.length}
              detail="Total disponible para el trabajador"
            />
            <SummaryCard
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Activas"
              value={companies.filter((item) => item.is_active !== false).length}
              detail="Empresas operativas"
            />
            <SummaryCard
              icon={<Users className="h-4 w-4" />}
              label="Usuarios"
              value={profiles.filter((profile) => profile.company_id).length}
              detail="Perfiles asociados a empresas"
            />
            <SummaryCard
              icon={<Clock3 className="h-4 w-4" />}
              label="Cambios pendientes"
              value={listPendingChanges}
              detail="Solicitudes por revisar"
            />
          </div>

          <Card className="border border-slate-200 bg-white shadow-none">
            <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9AA2AE]" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por empresa, código, CIF, email, teléfono o ubicación..."
                  className="h-10 border-[#E2E7ED] pl-9 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-[#1E3A8A]"
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-10 w-full border-[#E2E7ED] text-sm shadow-none sm:w-[170px]">
                    <Filter className="mr-2 h-4 w-4 text-[#8B95A4]" />
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    <SelectItem value="active">Activas</SelectItem>
                    <SelectItem value="inactive">Inactivas</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={subscriptionFilter} onValueChange={setSubscriptionFilter}>
                  <SelectTrigger className="h-10 w-full border-[#E2E7ED] text-sm shadow-none sm:w-[190px]">
                    <SelectValue placeholder="Suscripción" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las suscripciones</SelectItem>
                    {Array.from(new Set(companies.map((item) => item.subscription_status).filter(Boolean))).map((status) => (
                      <SelectItem key={String(status)} value={String(status)}>
                        {statusLabel(status)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
<Select
  value={previousCompanyFilter}
  onValueChange={setPreviousCompanyFilter}
>
  <SelectTrigger className="h-10 w-full border-[#E2E7ED] text-sm shadow-none sm:w-[200px]">
    <SelectValue placeholder="Empresas anteriores" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="current">
      Empresas actuales
    </SelectItem>
    <SelectItem value="previous">
      Empresas anteriores
    </SelectItem>
    <SelectItem value="all">
      Todas las empresas
    </SelectItem>
  </SelectContent>
</Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void loadCompanyList(true)}
                  disabled={refreshing}
                  className="h-10 border-[#E2E7ED] px-3 text-[#536074] shadow-none hover:bg-[#F6F7F9]"
                  aria-label="Actualizar empresas"
                >
                  <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                </Button>
              </div>
            </div>
          </Card>
          
          <Card className="overflow-hidden border border-slate-200 bg-white shadow-none">
            <TableShell>
              <table className="w-full min-w-[900px] text-left">
                <thead className="border-b border-slate-100 bg-[#FAFBFC]">
                  <tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA2AE]">
                    <th className="px-5 py-3">Empresa</th>
                    <th className="px-5 py-3">Plan / suscripción</th>
                    <th className="px-5 py-3">Usuarios</th>
                    <th className="px-5 py-3">Ubicación</th>
                    <th className="px-5 py-3">Estado</th>
                    <th className="px-5 py-3">Actualización</th>
                    <th className="px-5 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCompanies.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <EmptyState text="No hay empresas que coincidan con los filtros actuales." />
                      </td>
                    </tr>
                  ) : (
                    filteredCompanies.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-slate-100 last:border-0 hover:bg-[#FBFCFE]"
                      >
                        <td className="px-5 py-4">
                          <button type="button" onClick={() => openCompany(item.id)} className="group text-left">
                            <p className="text-sm font-semibold text-[#263044] group-hover:text-[#1E3A8A]">
                              {item.company_name}
                            </p>
                            <p className="mt-1 text-[11px] text-[#9AA2AE]">{item.company_code}</p>
                          </button>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm text-[#536074]">{textValue(item.subscription_plan)}</p>
                          {item.subscription_status && (
                            <div className="mt-1"><StatusBadge value={item.subscription_status} /></div>
                          )}
                        </td>
                        <td className="px-5 py-4 text-sm text-[#536074]">{companyStats.get(item.id) || 0}</td>
                        <td className="px-5 py-4 text-sm text-[#536074]">
                          {[item.city, item.province].filter(Boolean).join(", ") || "—"}
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge value={item.is_active === false ? "inactivo" : "activo"} />
                        </td>
                        <td className="px-5 py-4 text-sm text-[#718096]">{formatDate(item.updated_at)}</td>
                        <td className="px-5 py-4 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => openCompany(item.id)}
                            className="h-8 px-2.5 text-[#1E3A8A] hover:bg-[#EEF3FF] hover:text-[#1E3A8A]"
                          >
                            Revisar
                            <ChevronRight className="ml-1 h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TableShell>
          </Card>

<Section
  title="Solicitudes de cambio de empresa"
  icon={<ArrowRightLeft className="h-4 w-4" />}
  action={
    <span className="text-xs text-[#9AA2AE]">
      {filteredCompanyChangeRequests.length} solicitudes
    </span>
  }
>
  <div className="border-b border-slate-100 p-4">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9AA2AE]" />

        <Input
          value={companyChangeSearch}
          onChange={(event) =>
            setCompanyChangeSearch(event.target.value)
          }
          placeholder="Buscar por empresa actual o empresa solicitada..."
          className="h-10 border-[#E2E7ED] pl-9 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-[#1E3A8A]"
        />
      </div>

      <Select
        value={companyChangeStatusFilter}
        onValueChange={setCompanyChangeStatusFilter}
      >
        <SelectTrigger className="h-10 w-full border-[#E2E7ED] text-sm shadow-none lg:w-[180px]">
          <Filter className="mr-2 h-4 w-4 text-[#8B95A4]" />
          <SelectValue placeholder="Estado" />
        </SelectTrigger>

        <SelectContent>
          <SelectItem value="pending">
            Pendientes
          </SelectItem>

          <SelectItem value="approved">
            Aceptadas
          </SelectItem>

          <SelectItem value="rejected">
            Rechazadas
          </SelectItem>

          <SelectItem value="all">
            Todos los estados
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>

  {filteredCompanyChangeRequests.length === 0 ? (
    <EmptyState
      text={
        companyChangeStatusFilter === "pending"
          ? "No hay solicitudes de cambio de empresa pendientes."
          : "No hay solicitudes que coincidan con los filtros actuales."
      }
    />
  ) : (
    <TableShell>
      <table className="w-full text-left">
        <thead className="border-b border-slate-100 bg-[#FAFBFC]">
          <tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA2AE]">
            <th className="px-5 py-3">
              Empresa actual
            </th>

            <th className="px-5 py-3">
              Empresa solicitada
            </th>

            <th className="px-5 py-3">
              Usuario
            </th>

            <th className="px-5 py-3">
              Proyectos
            </th>

            <th className="px-5 py-3">
              Estado
            </th>

            <th className="px-5 py-3">
              Fecha
            </th>

            <th className="px-5 py-3 text-right">
              Acción
            </th>
          </tr>
        </thead>

        <tbody>
          {filteredCompanyChangeRequests.map((request) => {
            const currentCompany = companies.find(
              (company) =>
                company.id === request.current_company_id
            );

            const requestedCompany = companies.find(
              (company) =>
                company.id === request.requested_company_id
            );

            const requester = profiles.find(
              (profile) =>
                profile.id === request.user_id
            );

            const normalizedStatus = normalize(
              request.status
            );

            const isPending =
              normalizedStatus === "pending" ||
              normalizedStatus === "pendiente";

            const requesterName =
              [
                requester?.nombre,
                requester?.apellidos,
              ]
                .filter(Boolean)
                .join(" ") ||
              requester?.email ||
              "Usuario";

            return (
              <tr
                key={request.id}
                className="border-b border-slate-100 last:border-0 hover:bg-[#FBFCFE]"
              >
                <td className="px-5 py-4">
                  <p className="text-sm font-semibold text-[#344154]">
                    {textValue(
                      currentCompany?.company_name
                    )}
                  </p>

                  <p className="mt-1 text-[11px] text-[#9AA2AE]">
                    {textValue(
                      currentCompany?.company_code
                    )}
                  </p>
                </td>

                <td className="px-5 py-4">
                  <p className="text-sm font-semibold text-[#344154]">
                    {textValue(
                      request.requested_company_name ||
                        requestedCompany?.company_name
                    )}
                  </p>

                  <p className="mt-1 text-[11px] text-[#9AA2AE]">
                    {textValue(
                      requestedCompany?.company_code
                    )}
                  </p>

                  <p className="mt-1 text-xs text-[#8A94A4]">
                    {textValue(request.requested_legal_name)} · NIF {textValue(request.requested_cif_vat)}
                  </p>
                </td>

                <td className="px-5 py-4">
                  <p className="text-sm font-medium text-[#536074]">
                    {requesterName}
                  </p>

                  <p className="mt-1 text-xs text-[#8A94A4]">
                    {textValue(requester?.email)}
                  </p>
                </td>

                <td className="px-5 py-4">
                  <span
                    className={
                      request.apply_to_active_projects
                        ? "text-sm font-medium text-[#1E3A8A]"
                        : "text-sm text-[#536074]"
                    }
                  >
                    {request.apply_to_active_projects
                      ? "Aplicar también el cambio a mis proyectos"
                      : "Mantener mis proyectos en la empresa actual"}
                  </span>
                </td>

                <td className="px-5 py-4">
                  <StatusBadge value={request.status} />
                </td>

                <td className="px-5 py-4 text-sm text-[#718096]">
                  {formatDate(request.created_at, true)}
                </td>

                <td className="px-5 py-4 text-right">
                  {isPending ? (
                    <div className="flex justify-end gap-1.5">
                      <Button
                        type="button"
                        onClick={() =>
                          void resolveChangeRequest(
                            request.id,
                            "approved"
                          )
                        }
                        className="h-8 w-8 rounded-lg bg-[#1E3A8A] p-0 text-white shadow-none hover:bg-[#17306F]"
                        title="Aceptar solicitud"
                        aria-label="Aceptar solicitud"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          void resolveChangeRequest(
                            request.id,
                            "rejected"
                          )
                        }
                        className="h-8 w-8 rounded-lg border-[#E2E7ED] p-0 text-[#536074] shadow-none hover:bg-[#F6F7F9]"
                        title="Rechazar solicitud"
                        aria-label="Rechazar solicitud"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-[#9AA2AE]">
                      Revisada
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableShell>
  )}
</Section>



        </div>

        <EmployeeCompaniesNavigation
          open={menuOpen}
          location={normalizedLocation}
          employeeRoot={employeeRoot}
          companiesBase={base}
          onClose={() => setMenuOpen(false)}
          onNavigate={navigateFromMenu}
        />
        {menuOpen && (
          <div className="fixed inset-0 z-40 bg-[#172033]/20 backdrop-blur-[1px]" onClick={() => setMenuOpen(false)} aria-hidden="true" />
        )}
      </div>
    );
  }

  if (detailLoading && !company) {
    return (
      <div className="min-h-screen bg-white text-[#172033]">
        <div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
          <PageHeader title="Empresa" subtitle="Cargando información de la empresa" onOpenMenu={() => setMenuOpen(true)} />
          <PageLoading text="Cargando información de la empresa..." />
        </div>
        <EmployeeCompaniesNavigation
          open={menuOpen}
          location={normalizedLocation}
          employeeRoot={employeeRoot}
          companiesBase={base}
          onClose={() => setMenuOpen(false)}
          onNavigate={navigateFromMenu}
        />
        {menuOpen && (
          <div className="fixed inset-0 z-40 bg-[#172033]/20 backdrop-blur-[1px]" onClick={() => setMenuOpen(false)} aria-hidden="true" />
        )}
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen bg-white text-[#172033]">
        <div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
          <PageHeader title="Empresa" subtitle="Consulta de empresa" onOpenMenu={() => setMenuOpen(true)} />
          <ErrorBox message={detailError || "La empresa indicada no existe o no está disponible."} />
          <Button type="button" variant="outline" onClick={goBackToCompanies} className="border-slate-200 shadow-none">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a empresas
          </Button>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-white text-[#172033]">
      <div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
        <PageHeader
          title="Empresas"
          subtitle="Consulta y gestión integral de la relación con la empresa"
          onOpenMenu={() => setMenuOpen(true)}
        />

        {detailError && <ErrorBox message={detailError} />}

        <div className="flex flex-col gap-4 border-b border-[#E8ECF2] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <button
              type="button"
              onClick={goBackToCompanies}
              className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#6B7687] transition-colors hover:text-[#1E3A8A]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Volver a empresas
            </button>
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EEF3FF] text-[#1E3A8A]">
                <Building2 className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-[-0.025em] text-[#172033] sm:text-3xl">
                    {company.company_name}
                  </h1>
                  <StatusBadge value={company.is_active === false ? "inactivo" : "activo"} />
                </div>
                <p className="mt-1 text-sm text-[#7B8594]">
                  {company.company_code} · {textValue(company.legal_name)}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadCompanyDetail()}
              disabled={detailLoading}
              className="h-9 border-[#E2E7ED] text-[#536074] shadow-none hover:bg-[#F6F7F9]"
            >
              <RefreshCw className={detailLoading ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
              Actualizar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(company.id);
                toast.success("ID de empresa copiado.");
              }}
              className="h-9 border-[#E2E7ED] text-[#536074] shadow-none hover:bg-[#F6F7F9]"
            >
              Copiar ID
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard icon={<Users className="h-4 w-4" />} label="Usuarios" value={companyProfiles.length} detail="Perfiles asociados" />
          <SummaryCard icon={<FolderKanban className="h-4 w-4" />} label="Proyectos" value={companyProjects.length} detail="Proyectos de la empresa" />
          <SummaryCard icon={<CircleDollarSign className="h-4 w-4" />} label="Facturas pendientes" value={openInvoices.length} detail="Pendientes o vencidas" />
          <SummaryCard icon={<Ticket className="h-4 w-4" />} label="Tickets abiertos" value={companyTickets.filter((ticket) => normalize(ticket.estado) !== "cerrado").length} detail="Asuntos de soporte activos" />
        </div>

        <Section
          title="Información de la empresa"
          icon={<Building2 className="h-4 w-4" />}
        >
          <div className="grid gap-x-8 gap-y-6 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <DetailRow label="Nombre comercial" value={company.company_name} />
            <DetailRow label="Código de empresa" value={company.company_code} />
            <DetailRow label="Teléfono" value={textValue(company.phone)} />
            <DetailRow label="Web" value={company.website ? <a href={company.website} target="_blank" rel="noreferrer" className="text-[#1E3A8A] hover:underline">{company.website}<ExternalLink className="ml-1 inline h-3 w-3" /></a> : "—"} />
            <DetailRow label="Sector" value={textValue(company.industry)} />
            <DetailRow label="Empleados" value={textValue(company.employees)} />
            <DetailRow label="Zona horaria" value={textValue(company.timezone)} />
            <DetailRow label="Idioma" value={textValue(company.language)} />
            <DetailRow label="Moneda" value={textValue(company.currency)} />
            <DetailRow label="Plan" value={textValue(company.subscription_plan)} />
            <DetailRow label="Estado de suscripción" value={<StatusBadge value={company.subscription_status} />} />
            <DetailRow label="Fin de prueba" value={formatDate(company.trial_ends_at)} />
            <DetailRow label="Stripe customer" value={textValue(company.stripe_customer_id)} />
            <DetailRow label="Creada" value={formatDate(company.created_at, true)} />
            <DetailRow label="Última actualización" value={formatDate(company.updated_at, true)} />
          </div>
          <div className="border-t border-slate-100 px-5 py-4 text-xs text-[#8A94A4]">
            La información de empresa se muestra según el esquema y permisos actuales de Modira. Las cuentas de trabajador no tienen edición directa de la fila de <span className="font-mono">companies</span>; los cambios sensibles de asociación se realizan mediante las RPC de seguridad definidas en las migraciones.
          </div>
        </Section>

        <Section
          title="Datos fiscales"
          icon={<FileText className="h-4 w-4" />}
          action={<span className="text-xs text-[#9AA2AE]">Información para facturación</span>}
        >
          <div className="grid gap-x-8 gap-y-6 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <DetailRow label="Razón social fiscal" value={textValue(company.legal_name || company.company_name)} />
            <DetailRow label="NIF / CIF / VAT" value={textValue(company.cif_vat)} />
            <DetailRow label="Email de facturación" value={textValue(company.billing_email)} />
            <DetailRow label="Dirección fiscal" value={textValue(company.address)} />
            <DetailRow label="Código postal" value={textValue(company.postal_code)} />
            <DetailRow label="Ciudad fiscal" value={textValue(company.city)} />
            <DetailRow label="Provincia fiscal" value={textValue(company.province)} />
            <DetailRow label="País fiscal" value={textValue(company.country)} />
            <DetailRow
              label="Estado de datos fiscales"
              value={
                (company.legal_name || company.company_name) &&
                company.cif_vat &&
                company.address &&
                company.postal_code &&
                company.city &&
                company.country
                  ? <StatusBadge value="activo" />
                  : <StatusBadge value="pendiente" />
              }
            />
            <DetailRow label="Solicitudes pendientes" value={pendingChangeRequests.length} />
            <DetailRow label="Último cambio solicitado" value={formatDate(changeRequests[0]?.reviewed_at || changeRequests[0]?.created_at, true)} />
          </div>
                    <div className="border-t border-slate-100 px-5 py-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
               <p className="text-sm font-semibold text-[#263044]">
  Configuración fiscal
</p>

<p className="mt-1 text-sm text-[#536074]">
  IVA de la empresa
</p>

<p className="mt-2 max-w-2xl text-xs leading-5 text-[#8A94A4]">
  Aquí puedes establecer el IVA recomendado por Modira y revisar
  las solicitudes de los clientes que pidan un tratamiento fiscal
  diferente.
</p>

                <p className="mt-3 text-xs text-[#8A94A4]">
  Origen:{" "}
  <span className="font-medium text-[#536074]">
    {company.iva_recomendado_por
      ? "Establecido por empleado"
      : "Valor predeterminado de Modira"}
  </span>
</p>

                {company.iva_recomendado_updated_at && (
                  <p className="mt-1 text-xs text-[#9AA2AE]">
                    Última modificación:{" "}
                    {formatDate(company.iva_recomendado_updated_at, true)}
                  </p>
                )}
              </div>

              <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                <Input
  type="number"
  min="0"
  max="100"
  step="0.01"
  value={ivaRecomendado}
  onChange={(e) => setIvaRecomendado(e.target.value)}
  placeholder="Ej. 21"
/>

                <Button
                  type="button"
                  onClick={() => void saveIvaRecomendado()}
                  disabled={
                    guardandoIva ||
                    ivaRecomendado ===
                      String(company.iva_recomendado_porcentaje ?? 21)
                  }
                  className="h-10 bg-[#1E3A8A] px-4 text-sm text-white shadow-none hover:bg-[#17306F]"
                >
                  {guardandoIva ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Guardar
                </Button>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
  <p className="text-xs leading-5 text-amber-800">
    Este valor es la recomendación fiscal de Modira para esta empresa.
    Se utilizará como referencia al crear nuevos presupuestos y
    facturas, salvo que el empleado establezca manualmente otro
    tratamiento. Los contratos de mantenimiento conservan su propio
    tratamiento fiscal una vez configurados.
  </p>
</div>
          </div>
          <div className="mt-6 border-t border-slate-100 pt-6">
  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
    <div className="min-w-0">
      <p className="text-sm font-semibold text-[#263044]">
        Solicitudes de tratamiento de IVA
      </p>

      <p className="mt-1 max-w-2xl text-xs leading-5 text-[#8A94A4]">
        Los clientes pueden solicitar un tratamiento de IVA diferente
        al recomendado. Estas solicitudes deben revisarse antes de
        aplicarse a la configuración fiscal general de la empresa.
      </p>
    </div>

    <span className="shrink-0 text-xs text-[#9AA2AE]">
      {ivaChangeRequests.filter(
        (request) =>
          normalize(request.status) === "pending" ||
          normalize(request.status) === "in_review"
      ).length}{" "}
      pendientes
    </span>
  </div>

  {ivaChangeRequests.length === 0 ? (
    <div className="mt-4 border-y border-slate-100 py-5">
      <p className="text-xs text-[#8A94A4]">
        No hay solicitudes de cambio de IVA para esta empresa.
      </p>
    </div>
  ) : (
    <div className="mt-4 divide-y divide-slate-100 border-y border-slate-100">
      {ivaChangeRequests.map((request) => {
        const normalizedStatus = normalize(request.status);

        const isPending =
          normalizedStatus === "pending" ||
          normalizedStatus === "in_review";

        const requestedIva = request.requested_iva_aplicado
          ? `${Number(request.requested_iva_porcentaje)} %`
          : "IVA no aplicado";

        return (
          <div
            key={request.id}
            className="flex flex-col gap-4 px-0 py-5 lg:flex-row lg:items-start lg:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-[#344154]">
                  Tratamiento solicitado: {requestedIva}
                </p>

                <StatusBadge value={request.status} />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <DetailRow
                  label="Solicitado"
                  value={formatDate(request.created_at, true)}
                />

                <DetailRow
                  label="Revisado"
                  value={formatDate(request.reviewed_at, true)}
                />
              </div>

              <div className="mt-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA2AE]">
                  Justificación del cliente
                </p>

                <p className="mt-1 text-xs leading-5 text-[#536074]">
                  {textValue(request.reason)}
                </p>
              </div>

              {request.worker_notes && (
                <div className="mt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA2AE]">
                    Notas de revisión
                  </p>

                  <p className="mt-1 text-xs leading-5 text-[#8A94A4]">
                    {request.worker_notes}
                  </p>
                </div>
              )}
            </div>

            {isPending && (
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  onClick={() =>
                    void resolveIvaChangeRequest(
                      request.id,
                      "approved"
                    )
                  }
                  disabled={
                    resolvingIvaRequestId === request.id
                  }
                  className="h-9 bg-[#1E3A8A] px-3 text-xs text-white shadow-none hover:bg-[#17306F]"
                >
                  {resolvingIvaRequestId === request.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="mr-1.5 h-4 w-4" />
                      Aprobar
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void resolveIvaChangeRequest(
                      request.id,
                      "rejected"
                    )
                  }
                  disabled={
                    resolvingIvaRequestId === request.id
                  }
                  className="h-9 border-[#E2E7ED] px-3 text-xs text-[#536074] shadow-none"
                >
                  <X className="mr-1.5 h-4 w-4" />
                  Rechazar
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  )}
</div>
          <div className="border-t border-slate-100 px-5 py-4 text-xs text-[#8A94A4]">
            Estos son los datos fiscales actuales de <span className="font-mono">companies</span>. Los cambios se gestionan mediante solicitudes y RPC protegidas; las facturas de mantenimiento conservan su propio snapshot fiscal.
          </div>
        </Section>

        

        <Section
          title="Usuarios y contactos"
          icon={<Users className="h-4 w-4" />}
          action={<span className="text-xs text-[#9AA2AE]">{companyProfiles.length} perfiles</span>}
        >
          {companyProfiles.length === 0 ? (
            <EmptyState text="No hay perfiles asociados a esta empresa." />
          ) : (
            <TableShell>
              <table className="w-full min-w-[900px] text-left">
                <thead className="border-b border-slate-100 bg-[#FAFBFC]">
                  <tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA2AE]">
                    <th className="px-5 py-3">Usuario</th>
                    <th className="px-5 py-3">Contacto</th>
                    <th className="px-5 py-3">Rol</th>
                    <th className="px-5 py-3">Estado</th>
                    <th className="px-5 py-3">Cambiar empresa</th>
                    <th className="px-5 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {companyProfiles.map((profile) => (
                    <tr key={profile.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-[#344154]">{textValue(profile.nombre)} {profile.apellidos ? profile.apellidos : ""}</p>
                        <p className="mt-1 font-mono text-[10px] text-[#A0A8B4]">{profile.id}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm text-[#536074]">{textValue(profile.email)}</p>
                        <p className="mt-1 text-xs text-[#8A94A4]">{textValue(profile.telefono)}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-[#536074]">{textValue(profile.rol)}</td>
                      <td className="px-5 py-4"><StatusBadge value={profile.is_active === false || normalize(profile.status) === "inactive" ? "inactivo" : "activo"} /></td>
                      <td className="px-5 py-4">
                        <div className="flex min-w-[270px] items-center gap-2">
                          <Select
                            value={assignTargetByUser[profile.id] || ""}
                            onValueChange={(value) => setAssignTargetByUser((current) => ({ ...current, [profile.id]: value }))}
                          >
                            <SelectTrigger className="h-9 border-[#E2E7ED] text-xs shadow-none">
                              <SelectValue placeholder="Empresa de destino" />
                            </SelectTrigger>
                            <SelectContent>
                              {activeCompanies.filter((item) => item.id !== company.id).map((item) => (
                                <SelectItem key={item.id} value={item.id}>{item.company_name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void assignUserToCompany(profile)}
                            disabled={assigningUserId === profile.id}
                            className="h-9 border-[#E2E7ED] px-2.5 text-xs shadow-none"
                          >
                            {assigningUserId === profile.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Aplicar"}
                          </Button>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Button type="button" variant="ghost" onClick={() => void navigator.clipboard?.writeText(profile.email || profile.id)} className="h-8 px-2.5 text-xs text-[#1E3A8A] hover:bg-[#EEF3FF]">
                          Copiar contacto
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>
          )}
        </Section>

        <Section
          title="Clientes"
          icon={<User className="h-4 w-4" />}
          action={<span className="text-xs text-[#9AA2AE]">{clients.length} registros</span>}
        >
          {clients.length === 0 ? <EmptyState text="No hay clientes asociados a esta empresa." /> : (
            <TableShell>
              <table className="w-full min-w-[850px] text-left">
                <thead className="border-b border-slate-100 bg-[#FAFBFC]"><tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA2AE]"><th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Contacto</th><th className="px-5 py-3">Empresa</th><th className="px-5 py-3">Ubicación</th><th className="px-5 py-3">Estado</th></tr></thead>
                <tbody>
                  {clients.map((client) => <tr key={client.id} className="border-b border-slate-100 last:border-0"><td className="px-5 py-4"><p className="text-sm font-semibold text-[#344154]">{textValue(client.nombre)}</p><p className="mt-1 font-mono text-[10px] text-[#A0A8B4]">{client.id}</p></td><td className="px-5 py-4"><p className="text-sm text-[#536074]">{textValue(client.email)}</p><p className="mt-1 text-xs text-[#8A94A4]">{textValue(client.telefono)}</p></td><td className="px-5 py-4 text-sm text-[#536074]">{textValue(client.empresa)}</td><td className="px-5 py-4 text-sm text-[#536074]">{[client.ciudad, client.provincia].filter(Boolean).join(", ") || "—"}</td><td className="px-5 py-4"><StatusBadge value={client.is_active === false ? "inactivo" : "activo"} /></td></tr>)}
                </tbody>
              </table>
            </TableShell>
          )}
        </Section>

        <Section
          title="Proyectos"
          icon={<FolderKanban className="h-4 w-4" />}
          action={<Button type="button" variant="ghost" onClick={() => goTo(`${employeeRoot}/projects`)} className="h-8 px-2.5 text-xs text-[#1E3A8A] hover:bg-[#EEF3FF]">Ver proyectos</Button>}
        >
          {companyProjects.length === 0 ? <EmptyState text="No hay proyectos asociados a esta empresa." /> : (
            <TableShell>
              <table className="w-full min-w-[900px] text-left">
                <thead className="border-b border-slate-100 bg-[#FAFBFC]"><tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA2AE]"><th className="px-5 py-3">Proyecto</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Inicio</th><th className="px-5 py-3">Fin</th><th className="px-5 py-3">Hitos</th><th className="px-5 py-3">Documentos</th><th className="px-5 py-3 text-right">Acción</th></tr></thead>
                <tbody>
                  {companyProjects.map((project) => {
                    const projectMilestones = milestones.filter((item) => item.project_id === project.id);
                    const projectDocs = projectDocuments.filter((item) => item.project_id === project.id);
                    const progress = progressRows.find((item) => item.project_id === project.id);
                    return <tr key={project.id} className="border-b border-slate-100 last:border-0"><td className="px-5 py-4"><button type="button" onClick={() => goTo(`${employeeRoot}/projects/${project.id}`)} className="text-left"><p className="text-sm font-semibold text-[#344154] hover:text-[#1E3A8A]">{textValue(project.nombre)}</p><p className="mt-1 text-xs text-[#8A94A4] line-clamp-1">{textValue(project.descripcion)}</p></button></td><td className="px-5 py-4"><StatusBadge value={project.estado} /></td><td className="px-5 py-4 text-sm text-[#536074]">{formatDate(project.fecha_inicio)}</td><td className="px-5 py-4 text-sm text-[#536074]">{formatDate(project.fecha_fin)}</td><td className="px-5 py-4 text-sm text-[#536074]">{projectMilestones.length}{progress?.progress_percentage !== undefined ? ` · ${progress.progress_percentage}%` : ""}</td><td className="px-5 py-4 text-sm text-[#536074]">{projectDocs.length}</td><td className="px-5 py-4 text-right"><Button type="button" variant="ghost" onClick={() => goTo(`${employeeRoot}/projects/${project.id}`)} className="h-8 px-2.5 text-[#1E3A8A] hover:bg-[#EEF3FF]">Abrir<ChevronRight className="ml-1 h-4 w-4" /></Button></td></tr>;
                  })}
                </tbody>
              </table>
            </TableShell>
          )}
        </Section>

        <div className="md:col-span-2">
          <Section title="Presupuestos comerciales" icon={<FileText className="h-4 w-4" />} action={<Button type="button" variant="ghost" onClick={() => goTo(`${employeeRoot}/quotations`)} className="h-8 px-2.5 text-xs text-[#1E3A8A] hover:bg-[#EEF3FF]">Ver presupuestos</Button>}>
            {companyQuotations.length === 0 ? <EmptyState text="No hay presupuestos comerciales." /> : <TableShell><table className="w-full min-w-[650px] text-left"><thead className="border-b border-slate-100 bg-[#FAFBFC]"><tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA2AE]"><th className="px-5 py-3">Presupuesto</th><th className="px-5 py-3">Proyecto</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3 text-right">Total</th></tr></thead><tbody>{companyQuotations.map((quotation) => <tr key={quotation.id} className="border-b border-slate-100 last:border-0"><td className="px-5 py-4"><p className="text-sm font-semibold text-[#344154]">{textValue(quotation.numero_presupuesto)}</p><p className="mt-1 text-xs text-[#8A94A4]">{textValue(quotation.titulo)}</p></td><td className="px-5 py-4 text-sm text-[#536074]">{projectName(quotation.project_id)}</td><td className="px-5 py-4"><StatusBadge value={quotation.estado} /></td><td className="px-5 py-4 text-right text-sm font-semibold text-[#344154]">{formatMoney(quotation.precio_total, company.currency || "EUR")}</td></tr>)}</tbody></table></TableShell>}
          </Section>

        </div>

        <Section title="Facturación y pagos" icon={<CreditCard className="h-4 w-4" />} action={<Button type="button" variant="ghost" onClick={() => goTo(`${employeeRoot}/billing`)} className="h-8 px-2.5 text-xs text-[#1E3A8A] hover:bg-[#EEF3FF]">Ver facturación</Button>}>
          <div className="grid gap-4 border-b border-slate-100 p-5 sm:grid-cols-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9AA2AE]">Facturas</p><p className="mt-2 text-xl font-semibold text-[#263044]">{companyInvoices.length}</p></div><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9AA2AE]">Pendiente</p><p className="mt-2 text-xl font-semibold text-[#263044]">{formatMoney(openInvoices.reduce((sum, invoice) => sum + invoiceAmount(invoice), 0), company.currency || "EUR")}</p></div><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9AA2AE]">Cobrado</p><p className="mt-2 text-xl font-semibold text-[#263044]">{formatMoney(totalCollected, company.currency || "EUR")}</p></div></div>
          {companyInvoices.length === 0 ? <EmptyState text="No hay facturas para esta empresa." /> : <TableShell><table className="w-full min-w-[850px] text-left"><thead className="border-b border-slate-100 bg-[#FAFBFC]"><tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA2AE]"><th className="px-5 py-3">Factura</th><th className="px-5 py-3">Proyecto</th><th className="px-5 py-3">Emisión</th><th className="px-5 py-3">Vencimiento</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3 text-right">Importe</th></tr></thead><tbody>{companyInvoices.map((invoice) => <tr key={invoice.id} className="border-b border-slate-100 last:border-0"><td className="px-5 py-4 text-sm font-semibold text-[#344154]">{textValue(invoice.numero_factura)}</td><td className="px-5 py-4 text-sm text-[#536074]">{projectName(invoice.project_id)}</td><td className="px-5 py-4 text-sm text-[#536074]">{formatDate(invoice.fecha_emision)}</td><td className="px-5 py-4 text-sm text-[#536074]">{formatDate(invoice.fecha_vencimiento)}</td><td className="px-5 py-4"><StatusBadge value={invoice.estado} /></td><td className="px-5 py-4 text-right text-sm font-semibold text-[#344154]">{formatMoney(invoiceAmount(invoice), company.currency || "EUR")}</td></tr>)}</tbody></table></TableShell>}
        </Section>

        <Section title="Tickets de soporte" icon={<Ticket className="h-4 w-4" />} action={<Button type="button" variant="ghost" onClick={() => goTo(`${employeeRoot}/support`)} className="h-8 px-2.5 text-xs text-[#1E3A8A] hover:bg-[#EEF3FF]">Ver tickets</Button>}>
          {companyTickets.length === 0 ? <EmptyState text="No hay tickets asociados a esta empresa." /> : <TableShell><table className="w-full min-w-[850px] text-left"><thead className="border-b border-slate-100 bg-[#FAFBFC]"><tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA2AE]"><th className="px-5 py-3">Ticket</th><th className="px-5 py-3">Prioridad</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Creación</th><th className="px-5 py-3">Actualización</th><th className="px-5 py-3 text-right">Acción</th></tr></thead><tbody>{companyTickets.map((ticket) => <tr key={ticket.id} className="border-b border-slate-100 last:border-0"><td className="px-5 py-4"><p className="text-sm font-semibold text-[#344154]">{textValue(ticket.titulo || ticket.asunto)}</p><p className="mt-1 text-xs text-[#8A94A4] line-clamp-1">{textValue(ticket.descripcion)}</p></td><td className="px-5 py-4"><StatusBadge value={ticket.prioridad} /></td><td className="px-5 py-4"><StatusBadge value={ticket.estado} /></td><td className="px-5 py-4 text-sm text-[#536074]">{formatDate(ticket.fecha_creacion || ticket.created_at)}</td><td className="px-5 py-4 text-sm text-[#536074]">{formatDate(ticket.updated_at, true)}</td><td className="px-5 py-4 text-right"><Button type="button" variant="ghost" onClick={() => goTo(`${employeeRoot}/support/${ticket.id}`)} className="h-8 px-2.5 text-[#1E3A8A] hover:bg-[#EEF3FF]">Abrir<ChevronRight className="ml-1 h-4 w-4" /></Button></td></tr>)}</tbody></table></TableShell>}
        </Section>

        <div className="md:col-span-2">
          <Section title="Mantenimiento" icon={<CalendarDays className="h-4 w-4" />} action={<Button type="button" variant="ghost" onClick={() => goTo(`${employeeRoot}/maintenance`)} className="h-8 px-2.5 text-xs text-[#1E3A8A] hover:bg-[#EEF3FF]">Ver contratos</Button>}>
            {companyMaintenance.length === 0 ? <EmptyState text="No hay contratos de mantenimiento asociados." /> : <TableShell><table className="w-full min-w-[700px] text-left"><thead className="border-b border-slate-100 bg-[#FAFBFC]"><tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA2AE]"><th className="px-5 py-3">Plan</th><th className="px-5 py-3">Precio</th><th className="px-5 py-3">Periodicidad</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Periodo actual</th><th className="px-5 py-3">Renovación</th><th className="px-5 py-3">Cancelación</th><th className="px-5 py-3">Stripe</th></tr></thead><tbody>{companyMaintenance.map((contract) => { const plan = maintenancePlanById.get(contract.plan_id); const pendingPlan = maintenancePlanById.get(contract.pending_plan_id); const projectCount = (maintenanceProjectsByContract.get(contract.id) || []).length; const automationCount = (maintenanceAutomationsByContract.get(contract.id) || []).length; return <tr key={contract.id} className="border-b border-slate-100 last:border-0"><td className="px-5 py-4"><p className="text-sm font-semibold text-[#344154]">{textValue(plan?.nombre || contract.nombre_plan)}</p><p className="mt-1 text-xs text-[#8A94A4]">{textValue(plan?.code)} · {textValue(contract.descripcion || plan?.descripcion)}</p><p className="mt-1 text-[10px] text-[#A0A8B4]">{projectCount} proyectos · {automationCount} automatizaciones cubiertas</p></td><td className="px-5 py-4 text-right text-sm font-semibold text-[#344154]">{formatMoney(contract.precio, contract.moneda || company.currency || "EUR")}</td><td className="px-5 py-4 text-sm text-[#536074]">{textValue(contract.periodicidad)}</td><td className="px-5 py-4"><StatusBadge value={contract.estado} /></td><td className="px-5 py-4 text-sm text-[#536074]">{formatDate(contract.current_period_start || contract.fecha_inicio)} → {formatDate(contract.current_period_end || contract.fecha_fin)}</td><td className="px-5 py-4 text-sm text-[#536074]">{contract.renewal_day ? `Día ${contract.renewal_day}` : formatDate(contract.fecha_inicio)}</td><td className="px-5 py-4 text-sm text-[#536074]">{contract.cancel_at_period_end ? `Fin de periodo · ${formatDate(contract.cancel_effective_at)}` : "No programada"}</td><td className="px-5 py-4 text-xs text-[#536074]">{textValue(contract.stripe_subscription_id)}</td></tr>})}</tbody></table></TableShell>}
            {companyMaintenance.length > 0 && (
              <div className="border-t border-slate-100">
                {companyMaintenance.map((contract) => {
                  const plan = maintenancePlanById.get(contract.plan_id);
                  const pendingPlan = maintenancePlanById.get(contract.pending_plan_id);
                  const projectRelations = maintenanceProjectsByContract.get(contract.id) || [];
                  const automationRelations = maintenanceAutomationsByContract.get(contract.id) || [];
                  return (
                    <div key={`details-${contract.id}`} className="border-b border-slate-100 p-5 last:border-0">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-semibold text-[#344154]">Detalles del contrato · {textValue(plan?.nombre || contract.nombre_plan)}</p>
                        <span className="font-mono text-[10px] text-[#A0A8B4]">{contract.id}</span>
                      </div>
                      <div className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
                        <DetailRow label="Usuario asociado" value={<span className="font-mono text-xs">{textValue(contract.user_id)}</span>} />
                        <DetailRow label="Empresa asociada" value={<span className="font-mono text-xs">{textValue(contract.company_id)}</span>} />
                        <DetailRow label="Plan ID" value={<span className="font-mono text-xs">{textValue(contract.plan_id)}</span>} />
                        <DetailRow label="Código de plan" value={textValue(plan?.code)} />
                        <DetailRow label="Nombre del plan" value={textValue(plan?.nombre || contract.nombre_plan)} />
                        <DetailRow label="Descripción" value={textValue(contract.descripcion || plan?.descripcion)} />
                        <DetailRow label="Precio contratado" value={formatMoney(contract.precio, contract.moneda || company.currency || "EUR")} />
                        <DetailRow label="Precio catálogo" value={plan?.precio != null ? formatMoney(plan.precio, plan.moneda || "EUR") : "Personalizado"} />
                        <DetailRow label="Moneda contrato" value={textValue(contract.moneda)} />
                        <DetailRow label="Moneda catálogo" value={textValue(plan?.moneda)} />
                        <DetailRow label="Periodicidad contrato" value={textValue(contract.periodicidad)} />
                        <DetailRow label="Periodicidad catálogo" value={textValue(plan?.periodicidad)} />
                        <DetailRow label="Plan personalizado" value={plan?.es_personalizado ? "Sí" : "No"} />
                        <DetailRow label="Plan activo en catálogo" value={plan?.activo === false ? "No" : "Sí"} />
                        <DetailRow label="Stripe product del plan" value={textValue(plan?.stripe_product_id)} />
                        <DetailRow label="Stripe price del plan" value={textValue(plan?.stripe_price_id)} />
                        <DetailRow label="Estado" value={<StatusBadge value={contract.estado} />} />
                        <DetailRow label="Fecha de inicio" value={formatDate(contract.fecha_inicio)} />
                        <DetailRow label="Fecha de fin" value={formatDate(contract.fecha_fin)} />
                        <DetailRow label="Inicio de periodo actual" value={formatDate(contract.current_period_start)} />
                        <DetailRow label="Fin de periodo actual" value={formatDate(contract.current_period_end)} />
                        <DetailRow label="Día de renovación" value={contract.renewal_day ? `Día ${contract.renewal_day}` : "—"} />
                        <DetailRow label="Cancelación al final del periodo" value={<StatusBadge value={contract.cancel_at_period_end ? "pendiente" : "activo"} />} />
                        <DetailRow label="Solicitud de cancelación" value={formatDate(contract.cancel_requested_at, true)} />
                        <DetailRow label="Cancelación efectiva" value={formatDate(contract.cancel_effective_at)} />
                        <DetailRow label="Plan pendiente" value={textValue(pendingPlan?.nombre || contract.pending_plan_id)} />
                        <DetailRow label="Cambio de plan efectivo" value={formatDate(contract.pending_change_effective_at)} />
                        <DetailRow label="Stripe customer" value={textValue(contract.stripe_customer_id)} />
                        <DetailRow label="Stripe subscription" value={textValue(contract.stripe_subscription_id)} />
                        <DetailRow label="Stripe subscription item" value={textValue(contract.stripe_subscription_item_id)} />
                        <DetailRow label="Stripe price" value={textValue(contract.stripe_price_id)} />
                        <DetailRow label="Proyectos cubiertos" value={projectRelations.length > 0 ? projectRelations.map((relation) => companyProjects.find((project) => project.id === relation.project_id)?.nombre || relation.project_id).join(", ") : "—"} />
                        <DetailRow label="Creado" value={formatDate(contract.created_at, true)} />
                        <DetailRow label="Actualizado" value={formatDate(contract.updated_at, true)} />
                      </div>
                      {contract.plan_snapshot && (
                        <div className="mt-5 border-t border-slate-100 pt-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9AA2AE]">Snapshot comercial del plan</p>
                          <div className="mt-2 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                            <DetailRow label="Código" value={textValue(contract.plan_snapshot.code)} />
                            <DetailRow label="Nombre" value={textValue(contract.plan_snapshot.nombre)} />
                            <DetailRow label="Descripción" value={textValue(contract.plan_snapshot.descripcion)} />
                            <DetailRow label="Precio catálogo" value={contract.plan_snapshot.precio_catalogo != null ? formatMoney(contract.plan_snapshot.precio_catalogo, contract.plan_snapshot.moneda || "EUR") : "Personalizado"} />
                            <DetailRow label="Moneda" value={textValue(contract.plan_snapshot.moneda)} />
                            <DetailRow label="Periodicidad" value={textValue(contract.plan_snapshot.periodicidad)} />
                            <DetailRow label="Capturado" value={formatDate(contract.plan_snapshot.captured_at, true)} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="border-t border-slate-100 px-5 py-4">
              <div className="grid gap-4 sm:grid-cols-3"><DetailRow label="Contratos activos" value={companyMaintenance.filter((contract) => normalize(contract.estado) === "activo").length} /><DetailRow label="Planes de catálogo disponibles" value={companyMaintenancePlans.filter((plan) => plan.activo !== false).length} /><DetailRow label="Contratos con cambio de plan pendiente" value={companyMaintenance.filter((contract) => contract.pending_plan_id).length} /></div>
            </div>
          </Section>

         
        </div>

        <Section title="Facturas de mantenimiento" icon={<CreditCard className="h-4 w-4" />} action={<span className="text-xs text-[#9AA2AE]">{maintenanceOpenInvoices.length} abiertas</span>}>
          <div className="grid gap-4 border-b border-slate-100 p-5 sm:grid-cols-4"><DetailRow label="Facturas" value={companyMaintenanceInvoices.length} /><DetailRow label="Pendientes" value={maintenanceOpenInvoices.length} /><DetailRow label="Total facturado" value={formatMoney(companyMaintenanceInvoices.reduce((sum, invoice) => sum + Number(invoice.monto || 0), 0), companyMaintenanceInvoices[0]?.moneda || company.currency || "EUR")} /><DetailRow label="Total a pagar" value={formatMoney(companyMaintenanceInvoices.reduce((sum, invoice) => sum + Number(invoice.importe_a_pagar || 0), 0), companyMaintenanceInvoices[0]?.moneda || company.currency || "EUR")} /></div>
          {companyMaintenanceInvoices.length === 0 ? <EmptyState text="No hay facturas de mantenimiento para esta empresa." /> : <TableShell><table className="w-full min-w-[1500px] text-left"><thead className="border-b border-slate-100 bg-[#FAFBFC]"><tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA2AE]"><th className="px-5 py-3">Factura</th><th className="px-5 py-3">Contrato / periodo</th><th className="px-5 py-3">Emisión</th><th className="px-5 py-3">Vencimiento</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">IVA</th><th className="px-5 py-3">IRPF</th><th className="px-5 py-3 text-right">Subtotal</th><th className="px-5 py-3 text-right">A pagar</th><th className="px-5 py-3">Documento</th><th className="px-5 py-3">Stripe</th></tr></thead><tbody>{companyMaintenanceInvoices.map((invoice) => <tr key={invoice.id} className="border-b border-slate-100 last:border-0"><td className="px-5 py-4"><p className="text-sm font-semibold text-[#344154]">{textValue(invoice.serie)}-{textValue(invoice.numero)}</p><p className="mt-1 font-mono text-[10px] text-[#A0A8B4]">{invoice.id}</p></td><td className="px-5 py-4 text-sm text-[#536074]">{textValue(companyMaintenance.find((contract) => contract.id === invoice.maintenance_contract_id)?.nombre_plan)}<p className="mt-1 text-xs text-[#8A94A4]">{formatDate(invoice.periodo_inicio)} → {formatDate(invoice.periodo_fin)}</p></td><td className="px-5 py-4 text-sm text-[#536074]">{formatDate(invoice.fecha_emision)}</td><td className="px-5 py-4 text-sm text-[#536074]">{formatDate(invoice.fecha_vencimiento)}</td><td className="px-5 py-4"><StatusBadge value={invoice.estado} /></td><td className="px-5 py-4 text-sm text-[#536074]">{invoice.iva_aplicado ? `${textValue(invoice.iva_porcentaje)}% · ${formatMoney(invoice.iva_importe, invoice.moneda || company.currency || "EUR")}` : "No aplicado"}</td><td className="px-5 py-4 text-sm text-[#536074]">{invoice.irpf_aplicado ? `${textValue(invoice.irpf_porcentaje)}% · ${formatMoney(invoice.irpf_importe, invoice.moneda || company.currency || "EUR")}` : "No aplicado"}</td><td className="px-5 py-4 text-right text-sm text-[#344154]">{formatMoney(invoice.subtotal, invoice.moneda || company.currency || "EUR")}</td><td className="px-5 py-4 text-right text-sm font-semibold text-[#344154]">{formatMoney(invoice.importe_a_pagar, invoice.moneda || company.currency || "EUR")}</td><td className="px-5 py-4 text-xs text-[#536074]">{invoice.pdf_storage_path || invoice.electronic_document_storage_path || invoice.document_path ? "Disponible" : "Sin documento"}</td><td className="px-5 py-4 text-xs text-[#536074]">{textValue(invoice.stripe_invoice_id)}</td></tr>)}</tbody></table></TableShell>}
          {companyMaintenanceInvoices.length > 0 && (
            <div className="border-t border-slate-100">
              {companyMaintenanceInvoices.map((invoice) => (
                <div key={`maintenance-invoice-details-${invoice.id}`} className="border-b border-slate-100 p-5 last:border-0">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-semibold text-[#344154]">Detalle fiscal y documental · {textValue(invoice.serie)}-{textValue(invoice.numero)}</p>
                    <span className="font-mono text-[10px] text-[#A0A8B4]">{invoice.id}</span>
                  </div>
                  <div className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
                    <DetailRow label="Contrato" value={<span className="font-mono text-xs">{textValue(invoice.maintenance_contract_id)}</span>} />
                    <DetailRow label="Empresa" value={<span className="font-mono text-xs">{textValue(invoice.company_id)}</span>} />
                    <DetailRow label="Usuario" value={<span className="font-mono text-xs">{textValue(invoice.user_id)}</span>} />
                    <DetailRow label="Serie / número" value={`${textValue(invoice.serie)}-${textValue(invoice.numero)}`} />
                    <DetailRow label="Estado" value={<StatusBadge value={invoice.estado} />} />
                    <DetailRow label="Fecha de emisión" value={formatDate(invoice.fecha_emision)} />
                    <DetailRow label="Fecha de operación" value={formatDate(invoice.fecha_operacion)} />
                    <DetailRow label="Fecha de vencimiento" value={formatDate(invoice.fecha_vencimiento)} />
                    <DetailRow label="Fecha de pago" value={formatDate(invoice.fecha_pago)} />
                    <DetailRow label="Periodo" value={`${formatDate(invoice.periodo_inicio)} → ${formatDate(invoice.periodo_fin)}`} />
                    <DetailRow label="Descripción" value={textValue(invoice.descripcion)} />
                    <DetailRow label="Moneda" value={textValue(invoice.moneda)} />
                    <DetailRow label="Snapshot contrato · plan" value={textValue(invoice.contract_snapshot?.nombre)} />
                    <DetailRow label="Snapshot contrato · precio" value={invoice.contract_snapshot?.precio != null ? formatMoney(invoice.contract_snapshot.precio, invoice.contract_snapshot.moneda || invoice.moneda || "EUR") : "—"} />
                    <DetailRow label="Subtotal" value={formatMoney(invoice.subtotal, invoice.moneda || company.currency || "EUR")} />
                    <DetailRow label="IVA aplicado" value={invoice.iva_aplicado ? "Sí" : "No"} />
                    <DetailRow label="IVA" value={`${textValue(invoice.iva_porcentaje)}% · ${formatMoney(invoice.iva_importe, invoice.moneda || company.currency || "EUR")}`} />
                    <DetailRow label="IRPF aplicado" value={invoice.irpf_aplicado ? "Sí" : "No"} />
                    <DetailRow label="IRPF" value={`${textValue(invoice.irpf_porcentaje)}% · ${formatMoney(invoice.irpf_importe, invoice.moneda || company.currency || "EUR")}`} />
                    <DetailRow label="Monto" value={formatMoney(invoice.monto, invoice.moneda || company.currency || "EUR")} />
                    <DetailRow label="Importe a pagar" value={formatMoney(invoice.importe_a_pagar, invoice.moneda || company.currency || "EUR")} />
                    <DetailRow label="Stripe invoice" value={textValue(invoice.stripe_invoice_id)} />
                    <DetailRow label="Stripe customer" value={textValue(invoice.stripe_customer_id)} />
                    <DetailRow label="Formato electrónico" value={textValue(invoice.electronic_format)} />
                    <DetailRow label="Documento electrónico" value={textValue(invoice.electronic_document_storage_path)} />
                    <DetailRow label="Hash documento electrónico" value={<span className="font-mono text-[10px]">{textValue(invoice.electronic_document_hash)}</span>} />
                    <DetailRow label="PDF Modira" value={textValue(invoice.document_path || invoice.pdf_storage_path)} />
                    <DetailRow label="MIME PDF" value={textValue(invoice.document_mime_type)} />
                    <DetailRow label="Tamaño PDF" value={invoice.document_file_size != null ? `${invoice.document_file_size} bytes` : "—"} />
                    <DetailRow label="SHA-256 PDF" value={<span className="font-mono text-[10px]">{textValue(invoice.document_sha256 || invoice.pdf_sha256)}</span>} />
                    <DetailRow label="PDF Stripe" value={textValue(invoice.stripe_pdf_storage_path)} />
                    <DetailRow label="SHA-256 PDF Stripe" value={<span className="font-mono text-[10px]">{textValue(invoice.stripe_pdf_sha256)}</span>} />
                    <DetailRow label="Documento subido" value={formatDate(invoice.document_uploaded_at, true)} />
                    <DetailRow label="Subido por" value={<span className="font-mono text-xs">{textValue(invoice.document_uploaded_by)}</span>} />
                    <DetailRow label="Rectifica factura" value={<span className="font-mono text-xs">{textValue(invoice.rectifies_invoice_id)}</span>} />
                    <DetailRow label="Creada" value={formatDate(invoice.created_at, true)} />
                    <DetailRow label="Actualizada" value={formatDate(invoice.updated_at, true)} />
                  </div>
                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9AA2AE]">Snapshot fiscal del destinatario</p>
                    <div className="mt-3 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
                      <DetailRow label="Razón social" value={textValue(invoice.customer_legal_name)} />
                      <DetailRow label="NIF / CIF / VAT" value={textValue(invoice.customer_tax_id)} />
                      <DetailRow label="Dirección" value={textValue(invoice.customer_address)} />
                      <DetailRow label="Código postal" value={textValue(invoice.customer_postal_code)} />
                      <DetailRow label="Ciudad" value={textValue(invoice.customer_city)} />
                      <DetailRow label="Provincia" value={textValue(invoice.customer_province)} />
                      <DetailRow label="País" value={textValue(invoice.customer_country)} />
                    </div>
                  </div>
                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9AA2AE]">Snapshot del emisor</p>
                    <div className="mt-3 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
                      <DetailRow label="Razón social emisora" value={textValue(invoice.issuer_legal_name)} />
                      <DetailRow label="NIF / tax ID emisor" value={textValue(invoice.issuer_tax_id)} />
                      <DetailRow label="Dirección emisora" value={textValue(invoice.issuer_address)} />
                      <DetailRow label="CP emisor" value={textValue(invoice.issuer_postal_code)} />
                      <DetailRow label="Ciudad emisora" value={textValue(invoice.issuer_city)} />
                      <DetailRow label="Provincia emisora" value={textValue(invoice.issuer_province)} />
                      <DetailRow label="País emisor" value={textValue(invoice.issuer_country)} />
                    </div>
                  </div>
                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9AA2AE]">Pagos asociados</p>
                    <div className="mt-3 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
                      <DetailRow label="Payments asociados" value={payments.filter((payment) => payment.maintenance_invoice_id === invoice.id).length} />
                      <DetailRow label="Pago exitoso" value={payments.some((payment) => payment.maintenance_invoice_id === invoice.id && ["succeeded", "paid", "pagado", "pagada", "exito"].includes(normalize(payment.status || payment.estado))) ? <StatusBadge value="pagada" /> : <StatusBadge value="pendiente" />} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-slate-100 px-5 py-4 text-xs text-[#8A94A4]">Las facturas de mantenimiento conservan el snapshot fiscal del destinatario y los documentos asociados según las migraciones 049/050/051.</div>
        </Section>

        <Section title="Solicitudes de cambio de empresa" icon={<ShieldCheck className="h-4 w-4" />} action={<Button type="button" variant="ghost" onClick={() => goTo(`${employeeRoot}/companyChanges`)} className="h-8 px-2.5 text-xs text-[#1E3A8A] hover:bg-[#EEF3FF]">Ver solicitudes</Button>}>
          {companyChanges.length === 0 ? <EmptyState text="No hay solicitudes de cambio relacionadas con esta empresa." /> : <div className="divide-y divide-slate-100">{companyChanges.map((request) => { const isPending = normalize(request.status) === "pending"; const requestedName = request.requested_company_name || relatedCompanyName(request.requested_company_id); const currentName = relatedCompanyName(request.current_company_id); return <div key={request.id} className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-[#344154]">Solicitud {request.id}</p><StatusBadge value={request.status} /></div><div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><DetailRow label="Usuario" value={profiles.find((profile) => profile.id === request.user_id)?.email || request.user_id || "—"} /><DetailRow label="Empresa actual" value={currentName} /><DetailRow label="Empresa solicitada" value={requestedName} /><DetailRow label="Razón social solicitada" value={textValue(request.requested_legal_name)} /><DetailRow label="NIF/CIF/VAT solicitado" value={textValue(request.requested_cif_vat)} /><DetailRow label="Email fiscal solicitado" value={textValue(request.requested_billing_email)} /><DetailRow label="Dirección fiscal solicitada" value={textValue(request.requested_address)} /><DetailRow
  label="Proyectos"
  value={
    request.apply_to_active_projects
      ? "Aplicar también el cambio a mis proyectos"
      : "Mantener mis proyectos en la empresa actual"
  }
/>
<DetailRow label="Creada" value={formatDate(request.created_at, true)} /></div><p className="mt-4 text-sm leading-6 text-[#536074]">{textValue(request.reason)}</p>{request.review_notes && <p className="mt-2 text-xs text-[#8A94A4]">Notas de revisión: {request.review_notes}</p>}</div>{isPending && <div className="flex shrink-0 gap-2"><Button type="button" onClick={() => void resolveChangeRequest(request.id, "approved")} disabled={resolvingRequestId === request.id} className="h-9 bg-[#1E3A8A] px-3 text-xs hover:bg-[#17306F]">{resolvingRequestId === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="mr-1.5 h-4 w-4" />Aprobar</>}</Button><Button type="button" variant="outline" onClick={() => void resolveChangeRequest(request.id, "rejected")} disabled={resolvingRequestId === request.id} className="h-9 border-[#E2E7ED] px-3 text-xs text-[#536074] shadow-none">Rechazar</Button></div>}</div></div>; })}</div>}
        </Section>

        <Section title="Auditorías" icon={<ShieldCheck className="h-4 w-4" />} action={<Button type="button" variant="ghost" onClick={() => goTo(`${employeeRoot}/audits`)} className="h-8 px-2.5 text-xs text-[#1E3A8A] hover:bg-[#EEF3FF]">Ver auditorías</Button>}>
          {matchedAudits.length === 0 ? <EmptyState text="No hay solicitudes de auditoría con el mismo nombre de empresa." /> : <TableShell><table className="w-full min-w-[750px] text-left"><thead className="border-b border-slate-100 bg-[#FAFBFC]"><tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA2AE]"><th className="px-5 py-3">Solicitud</th><th className="px-5 py-3">Contacto</th><th className="px-5 py-3">Proceso</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Fecha</th></tr></thead><tbody>{matchedAudits.map((audit) => <tr key={audit.id} className="border-b border-slate-100 last:border-0"><td className="px-5 py-4 text-sm font-semibold text-[#344154]">{audit.id}</td><td className="px-5 py-4"><p className="text-sm text-[#536074]">{textValue(audit.nombre)}</p><p className="mt-1 text-xs text-[#8A94A4]">{textValue(audit.email)}</p></td><td className="px-5 py-4 text-sm text-[#536074]">{textValue(audit.proceso)}</td><td className="px-5 py-4"><StatusBadge value={audit.estado} /></td><td className="px-5 py-4 text-sm text-[#536074]">{formatDate(audit.created_at, true)}</td></tr>)}</tbody></table></TableShell>}
          <div className="border-t border-slate-100 px-5 py-3 text-[11px] text-[#9AA2AE]">Las auditorías no tienen <span className="font-mono">company_id</span> en el esquema; esta sección solo muestra coincidencias exactas por nombre de empresa.</div>
        </Section>

        <Section title="Actividad de la empresa" icon={<Activity className="h-4 w-4" />} action={<Button type="button" variant="ghost" onClick={() => goTo(`${employeeRoot}/activity`)} className="h-8 px-2.5 text-xs text-[#1E3A8A] hover:bg-[#EEF3FF]">Ver actividad</Button>}>
          {activityLog.length === 0 ? <EmptyState text="No hay actividad registrada para esta empresa." /> : <div className="divide-y divide-slate-100">{activityLog.slice(0, 50).map((entry) => <div key={entry.id} className="flex gap-4 p-5"><div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F4F7FB] text-[#1E3A8A]"><Activity className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><p className="text-sm font-semibold text-[#344154]">{textValue(entry.action)}</p><p className="text-[10px] text-[#9AA2AE]">{formatDate(entry.created_at, true)}</p></div><p className="mt-1 text-xs leading-5 text-[#718096]">{textValue(entry.description)}</p><p className="mt-1 font-mono text-[10px] text-[#A0A8B4]">{textValue(entry.resource_type)} · {textValue(entry.resource_id)}</p></div></div>)}</div>}
        </Section>

        <Section title="Notificaciones relacionadas" icon={<Bell className="h-4 w-4" />} action={<Button type="button" variant="ghost" onClick={() => goTo(`${employeeRoot}/notifications`)} className="h-8 px-2.5 text-xs text-[#1E3A8A] hover:bg-[#EEF3FF]">Ver notificaciones</Button>}>
          {notifications.length === 0 ? <EmptyState text="No hay notificaciones de los usuarios de esta empresa." /> : <div className="divide-y divide-slate-100">{notifications.slice(0, 30).map((notification) => <div key={notification.id} className="p-5"><div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><p className="text-sm font-semibold text-[#344154]">{textValue(notification.titulo)}</p><p className="text-[10px] text-[#9AA2AE]">{formatDate(notification.created_at, true)}</p></div><p className="mt-1 text-xs leading-5 text-[#718096]">{textValue(notification.mensaje)}</p></div>)}</div>}
        </Section>

        <Section title="Datos técnicos y trazabilidad" icon={<ShieldCheck className="h-4 w-4" />}>
          <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <DetailRow label="Company ID" value={<span className="font-mono text-xs">{company.id}</span>} />
            <DetailRow label="Creado por" value={<span className="font-mono text-xs">{textValue(company.created_by)}</span>} />
            <DetailRow label="Actualizado por" value={<span className="font-mono text-xs">{textValue(company.updated_by)}</span>} />
            <DetailRow label="Logo" value={company.logo_url ? <a href={company.logo_url} target="_blank" rel="noreferrer" className="text-[#1E3A8A] hover:underline">Abrir logo<ExternalLink className="ml-1 inline h-3 w-3" /></a> : "—"} />
          </div>
        </Section>
      </div>

      <EmployeeCompaniesNavigation
        open={menuOpen}
        location={normalizedLocation}
        employeeRoot={employeeRoot}
        companiesBase={base}
        onClose={() => setMenuOpen(false)}
        onNavigate={navigateFromMenu}
      />
      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-[#172033]/20 backdrop-blur-[1px]" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      )}
    </div>
  );
}
