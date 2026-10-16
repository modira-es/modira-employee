import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useLocation } from "wouter";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FileText,
  Flag,
  FolderKanban,
  LifeBuoy,
  Loader2,
  RefreshCw,
  Settings2,
  ShieldAlert,
  Ticket,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import {
  addDays,
  addMonths,
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  formatDistanceToNow,
  isBefore,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfYear,
} from "date-fns";
import { es } from "date-fns/locale";

type DashboardPeriod =
  | "today"
  | "7d"
  | "30d"
  | "month"
  | "previousMonth"
  | "quarter"
  | "year";

type PermissionCode =
  | "projects.create"
  | "quotations.create"
  | "invoices.create";

type CompanyRow = {
  id: string;
  company_name?: string | null;
  created_at?: string | null;
};

type ProjectRow = {
  id: string;
  nombre: string;
  estado?: string | null;
  company_id?: string | null;
  fecha_fin?: string | null;
  updated_at?: string | null;
};

type QuotationRow = {
  id: string;
  company_id?: string | null;
  numero_presupuesto?: string | null;
  titulo?: string | null;
  precio_base?: number | null;
  precio_total?: number | null;
  estado?: string | null;
  fecha_emision?: string | null;
  fecha_validez?: string | null;
  created_at?: string | null;
};

type InvoiceRow = {
  id: string;
  company_id?: string | null;
  numero_factura?: string | null;
  monto?: number | null;
  subtotal?: number | null;
  importe_a_pagar?: number | null;
  estado?: string | null;
  fecha_emision?: string | null;
  fecha_vencimiento?: string | null;
  fecha_pago?: string | null;
  created_at?: string | null;
};

type PaymentRow = {
  id: string;
  company_id?: string | null;
  amount?: number | null;
  currency?: string | null;
  status?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
};

type TicketRow = {
  id: string;
  company_id?: string | null;
  titulo?: string | null;
  estado?: string | null;
  prioridad?: string | null;
  created_at?: string | null;
};

type MilestoneRow = {
  id: string;
  project_id?: string | null;
  nombre?: string | null;
  fecha_prevista?: string | null;
  estado?: string | null;
  completed_at?: string | null;
};

type ContractRow = {
  id: string;
  company_id?: string | null;
  nombre_plan?: string | null;
  precio?: number | null;
  periodicidad?: string | null;
  estado?: string | null;
  fecha_fin?: string | null;
};

type ChangeRequestRow = {
  id: string;
  status?: string | null;
  created_at?: string | null;
};

type ProfileRow = {
  id: string;
  nombre?: string | null;
  rol?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type ActivityRow = {
  id: string;
  user_id?: string | null;
  company_id?: string | null;
  action: string;
  resource_type: string;
  description?: string | null;
  created_at: string;
};

type AutomationRunRow = {
  id: string;
  estado?: string | null;
  created_at?: string | null;
};

type CustomProposalRow = {
  id: string;
  company_id?: string | null;
  status?: string | null;
  title?: string | null;
  created_at?: string | null;
};

type DashboardData = {
  workerName: string;
  companies: CompanyRow[];
  projects: ProjectRow[];
  quotations: QuotationRow[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  tickets: TicketRow[];
  milestones: MilestoneRow[];
  contracts: ContractRow[];
  changeRequests: ChangeRequestRow[];
  profiles: ProfileRow[];
  activity: ActivityRow[];
  automationRuns: AutomationRunRow[];
  customProposals: CustomProposalRow[];
};

type AlertItem = {
  id: string;
  title: string;
  description: string;
  value: string;
  tone: "danger" | "warning" | "neutral";
  icon: typeof AlertCircle;
  route: string;
};

const euro = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const number = new Intl.NumberFormat("es-ES");

const periodLabels: Record<DashboardPeriod, string> = {
  today: "Hoy",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  month: "Este mes",
  previousMonth: "Mes anterior",
  quarter: "Este trimestre",
  year: "Este año",
};

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function dateOf(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inPeriod(
  value: string | Date | null | undefined,
  start: Date,
  end: Date,
) {
  const date = dateOf(value);
  return Boolean(date && date >= start && date <= end);
}

function getPeriodRange(period: DashboardPeriod, now: Date) {
  switch (period) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "7d":
      return { start: startOfDay(addDays(now, -6)), end: endOfDay(now) };
    case "30d":
      return { start: startOfDay(addDays(now, -29)), end: endOfDay(now) };
    case "month":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case "previousMonth": {
      const previous = addMonths(now, -1);
      return { start: startOfMonth(previous), end: endOfMonth(previous) };
    }
    case "quarter":
      return { start: startOfQuarter(now), end: endOfQuarter(now) };
    case "year":
      return { start: startOfYear(now), end: endOfYear(now) };
  }
}

function isPaidInvoice(invoice: InvoiceRow) {
  return normalize(invoice.estado) === "pagada";
}

function isCancelledInvoice(invoice: InvoiceRow) {
  return normalize(invoice.estado) === "cancelada";
}

function isSuccessfulPayment(payment: PaymentRow) {
  return normalize(payment.status) === "succeeded";
}

function paymentInEuros(payment: PaymentRow) {
  if (String(payment.currency ?? "EUR").toUpperCase() !== "EUR") return 0;
  return Number(payment.amount ?? 0) / 100;
}

function invoiceOutstanding(invoice: InvoiceRow) {
  if (isPaidInvoice(invoice) || isCancelledInvoice(invoice)) return 0;
  return Math.max(
    0,
    Number(invoice.importe_a_pagar ?? invoice.monto ?? 0),
  );
}

function monthlyContractValue(contract: ContractRow) {
  const price = Number(contract.precio ?? 0);
  switch (normalize(contract.periodicidad)) {
    case "trimestral":
      return price / 3;
    case "semestral":
      return price / 6;
    case "anual":
      return price / 12;
    default:
      return price;
  }
}

function shortText(value: string | null | undefined, fallback: string) {
  const clean = value?.trim();
  return clean || fallback;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  onClick,
  accent = "default",
}: {
  icon: typeof CircleDollarSign;
  label: string;
  value: string;
  detail: string;
  onClick?: () => void;
  accent?: "default" | "danger" | "success";
}) {
  const valueClass =
    accent === "danger"
      ? "text-[#B42318]"
      : accent === "success"
        ? "text-[#157A5A]"
        : "text-[#18212F]";

  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F3F5F7]">
            <Icon className="h-4 w-4 text-[#596579]" strokeWidth={1.7} />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#7B8798]">
            {label}
          </span>
        </div>
        {onClick ? (
          <ArrowRight className="h-4 w-4 text-[#A5ADBA]" strokeWidth={1.7} />
        ) : null}
      </div>
      <p className={`mt-5 text-[27px] font-semibold tracking-[-0.04em] ${valueClass}`}>
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-[#8994A5]">{detail}</p>
    </>
  );

  if (!onClick) {
    return <div className="p-5">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full p-5 text-left transition-colors hover:bg-[#FBFCFD]"
    >
      {content}
    </button>
  );
}

function SmallStat({
  icon: Icon,
  label,
  value,
  detail,
  onClick,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  detail: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="flex items-center gap-2 text-xs font-medium text-[#687487]">
        <Icon className="h-4 w-4 text-[#8994A4]" strokeWidth={1.7} />
        {label}
      </div>
      <p className="mt-2 text-xl font-semibold tracking-[-0.025em] text-[#263044]">
        {value}
      </p>
      <p className="mt-0.5 truncate text-xs text-[#929BA9]">{detail}</p>
    </>
  );

  if (!onClick) return <div className="px-5 py-4">{content}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      className="px-5 py-4 text-left transition-colors hover:bg-[#FBFCFD]"
    >
      {content}
    </button>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  onAction,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#96A0AE]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-[#18212F]">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-[#8994A4]">{description}</p>
        ) : null}
      </div>
      {action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[#566276] hover:text-[#18212F]"
        >
          {action}
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
      ) : null}
    </div>
  );
}

function RevenueChart({
  buckets,
}: {
  buckets: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(1, ...buckets.map((item) => item.value));
  const width = 820;
  const height = 270;
  const left = 48;
  const right = 18;
  const top = 18;
  const bottom = 38;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;

  const points = buckets.map((item, index) => ({
    ...item,
    x:
      buckets.length === 1
        ? left + chartWidth / 2
        : left + (index / (buckets.length - 1)) * chartWidth,
    y: top + chartHeight - (item.value / max) * chartHeight,
  }));

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  const area =
    points.length > 0
      ? `${path} L ${points[points.length - 1].x} ${top + chartHeight} L ${points[0].x} ${top + chartHeight} Z`
      : "";

  return (
    <div className="mt-4 overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label="Evolución de ingresos cobrados"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = top + chartHeight - ratio * chartHeight;
          return (
            <g key={ratio}>
              <line
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
                stroke="#EEF1F4"
                strokeWidth="1"
              />
              <text
                x={left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-[#A0A8B4] text-[9px]"
              >
                {max * ratio >= 1000
                  ? `${Math.round((max * ratio) / 1000)}k`
                  : Math.round(max * ratio)}
              </text>
            </g>
          );
        })}

        {area ? (
          <path d={area} fill="currentColor" className="text-[#F2F5F8]" />
        ) : null}

        {path ? (
          <path
            d={path}
            fill="none"
            stroke="#25344A"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {points.map((point) => (
          <circle
            key={point.label}
            cx={point.x}
            cy={point.y}
            r="3.5"
            className="fill-white stroke-[#25344A]"
            strokeWidth="2"
          />
        ))}

        {points
          .filter((_, index) =>
            points.length <= 8
              ? true
              : index === 0 ||
                index === points.length - 1 ||
                index % Math.ceil(points.length / 8) === 0,
          )
          .map((point) => (
            <text
              key={`${point.label}-label`}
              x={point.x}
              y={height - 12}
              textAnchor="middle"
              className="fill-[#98A2AF] text-[9px]"
            >
              {point.label}
            </text>
          ))}
      </svg>
      <p className="mt-1 text-xs text-[#9AA3AF]">
        Pagos recibidos con estado confirmado.
      </p>
    </div>
  );
}

function AlertRow({
  item,
  onClick,
}: {
  item: AlertItem;
  onClick: () => void;
}) {
  const Icon = item.icon;
  const tone =
    item.tone === "danger"
      ? "text-[#B42318] bg-[#FEF3F2]"
      : item.tone === "warning"
        ? "text-[#9A6B18] bg-[#FFF8E8]"
        : "text-[#596579] bg-[#F3F5F7]";

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 border-b border-[#EEF1F4] py-3.5 text-left last:border-b-0"
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
        <Icon className="h-4 w-4" strokeWidth={1.7} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[#303B4D] group-hover:text-[#18212F]">
          {item.title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-[#8C97A6]">
          {item.description}
        </span>
      </span>
      <span className="shrink-0 text-sm font-semibold text-[#39465A]">
        {item.value}
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#A3ACB8]" strokeWidth={1.7} />
    </button>
  );
}

function LoadingPanel() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 w-28 rounded bg-[#EEF1F4]" />
      <div className="h-8 w-44 rounded bg-[#EEF1F4]" />
      <div className="h-3 w-64 rounded bg-[#EEF1F4]" />
    </div>
  );
}

export default function DirectionDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [period, setPeriod] = useState<DashboardPeriod>("30d");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [data, setData] = useState<DashboardData>({
    workerName: "",
    companies: [],
    projects: [],
    quotations: [],
    invoices: [],
    payments: [],
    tickets: [],
    milestones: [],
    contracts: [],
    changeRequests: [],
    profiles: [],
    activity: [],
    automationRuns: [],
    customProposals: [],
  });
  const [permissions, setPermissions] = useState<Record<PermissionCode, boolean>>({
    "projects.create": false,
    "quotations.create": false,
    "invoices.create": false,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const now = useMemo(() => new Date(), []);
  const range = useMemo(() => getPeriodRange(period, now), [period, now]);

  const navigate = useCallback(
    (path: string) => setLocation(path),
    [setLocation],
  );

  const loadDashboard = useCallback(
    async (refresh = false) => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      if (refresh) setRefreshing(true);
      else setLoading(true);

      const failed: string[] = [];

      try {
        const [
          workerResult,
          companiesResult,
          projectsResult,
          quotationsResult,
          invoicesResult,
          paymentsResult,
          ticketsResult,
          milestonesResult,
          contractsResult,
          changesResult,
          profilesResult,
          activityResult,
          automationRunsResult,
          customProposalsResult,
        ] = await Promise.all([
          supabase
            .from("workers")
            .select("id, auth_user_id, display_name")
            .eq("auth_user_id", user.id)
            .maybeSingle(),

          supabase
            .from("companies")
            .select("id, company_name, created_at")
            .order("company_name", { ascending: true }),

          supabase
            .from("projects")
            .select("id, nombre, estado, company_id, fecha_fin, updated_at")
            .order("updated_at", { ascending: false }),

          supabase
            .from("quotations")
            .select(
              "id, company_id, numero_presupuesto, titulo, precio_base, precio_total, estado, fecha_emision, fecha_validez, created_at",
            )
            .order("created_at", { ascending: false }),

          supabase
            .from("invoices")
            .select(
              "id, company_id, numero_factura, monto, subtotal, importe_a_pagar, estado, fecha_emision, fecha_vencimiento, fecha_pago, created_at",
            )
            .order("created_at", { ascending: false }),

          supabase
            .from("payments")
            .select("id, company_id, amount, currency, status, paid_at, created_at")
            .order("created_at", { ascending: false }),

          supabase
            .from("support_tickets")
            .select("id, company_id, titulo, estado, prioridad, created_at")
            .order("created_at", { ascending: false }),

          supabase
            .from("project_milestones")
            .select("id, project_id, nombre, fecha_prevista, estado, completed_at")
            .order("fecha_prevista", { ascending: true }),

          supabase
            .from("maintenance_contracts")
            .select("id, company_id, nombre_plan, precio, periodicidad, estado, fecha_fin")
            .order("fecha_fin", { ascending: true }),

          supabase.rpc("get_worker_project_change_requests"),

          supabase
            .from("profiles")
            .select("id, nombre, rol, status, created_at")
            .order("created_at", { ascending: false }),

          supabase
            .from("activity_log")
            .select(
              "id, user_id, company_id, action, resource_type, description, created_at",
            )
            .order("created_at", { ascending: false })
            .limit(40),

          supabase
            .from("automation_runs")
            .select("id, estado, created_at")
            .order("created_at", { ascending: false })
            .limit(100),

          supabase
            .from("maintenance_custom_proposals")
            .select("id, company_id, status, title, created_at")
            .order("created_at", { ascending: false })
            .limit(100),
        ]);

        const results = [
          ["trabajador", workerResult.error],
          ["empresas", companiesResult.error],
          ["proyectos", projectsResult.error],
          ["presupuestos", quotationsResult.error],
          ["facturas", invoicesResult.error],
          ["pagos", paymentsResult.error],
          ["tickets", ticketsResult.error],
          ["hitos", milestonesResult.error],
          ["mantenimientos", contractsResult.error],
          ["solicitudes", changesResult.error],
          ["perfiles", profilesResult.error],
          ["actividad", activityResult.error],
          ["automatizaciones", automationRunsResult.error],
          ["propuestas de mantenimiento", customProposalsResult.error],
        ] as const;

        results.forEach(([name, error]) => {
          if (error) failed.push(name);
        });

        const changeRequests = Array.isArray(changesResult.data)
          ? (changesResult.data as ChangeRequestRow[])
          : [];

        setData({
          workerName: workerResult.data?.display_name?.trim() || "Dirección",
          companies: (companiesResult.data ?? []) as CompanyRow[],
          projects: (projectsResult.data ?? []) as ProjectRow[],
          quotations: (quotationsResult.data ?? []) as QuotationRow[],
          invoices: (invoicesResult.data ?? []) as InvoiceRow[],
          payments: (paymentsResult.data ?? []) as PaymentRow[],
          tickets: (ticketsResult.data ?? []) as TicketRow[],
          milestones: (milestonesResult.data ?? []) as MilestoneRow[],
          contracts: (contractsResult.data ?? []) as ContractRow[],
          changeRequests,
          profiles: (profilesResult.data ?? []) as ProfileRow[],
          activity: (activityResult.data ?? []) as ActivityRow[],
          automationRuns: (automationRunsResult.data ?? []) as AutomationRunRow[],
          customProposals: (customProposalsResult.data ?? []) as CustomProposalRow[],
        });

        const permissionCodes: PermissionCode[] = [
          "projects.create",
          "quotations.create",
          "invoices.create",
        ];

        const permissionEntries = await Promise.all(
          permissionCodes.map(async (code) => {
            const result = await supabase.rpc("current_worker_has_permission", {
              p_permission_code: code,
            });
            return [code, result.error ? false : result.data === true] as const;
          }),
        );

        setPermissions(Object.fromEntries(permissionEntries) as Record<PermissionCode, boolean>);
        setErrors(failed);
      } catch (error) {
        console.error("[DirectionDashboard] Error loading dashboard", error);
        setErrors(["datos del dashboard"]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id],
  );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const companyById = useMemo(
    () => new Map(data.companies.map((company) => [company.id, company])),
    [data.companies],
  );

  const projectById = useMemo(
    () => new Map(data.projects.map((project) => [project.id, project])),
    [data.projects],
  );

  const metrics = useMemo(() => {
    const periodPayments = data.payments.filter((payment) =>
      inPeriod(payment.paid_at ?? payment.created_at, range.start, range.end),
    );

    const periodInvoices = data.invoices.filter((invoice) =>
      inPeriod(invoice.fecha_emision ?? invoice.created_at, range.start, range.end),
    );

    const collected = periodPayments
      .filter(isSuccessfulPayment)
      .reduce((sum, payment) => sum + paymentInEuros(payment), 0);

    const billed = periodInvoices
      .filter((invoice) => !isCancelledInvoice(invoice))
      .reduce((sum, invoice) => sum + Number(invoice.monto ?? 0), 0);

    const outstandingInvoices = data.invoices.filter(
      (invoice) => invoiceOutstanding(invoice) > 0,
    );

    const outstanding = outstandingInvoices.reduce(
      (sum, invoice) => sum + invoiceOutstanding(invoice),
      0,
    );

    const pendingQuotations = data.quotations.filter(
      (quotation) => normalize(quotation.estado) === "pendiente",
    );

    const pipeline = pendingQuotations.reduce(
      (sum, quotation) =>
        sum + Number(quotation.precio_total ?? quotation.precio_base ?? 0),
      0,
    );

    const activeProjects = data.projects.filter(
      (project) => normalize(project.estado) === "activo",
    ).length;

    const completedProjects = data.projects.filter((project) =>
      ["entregado", "completado"].includes(normalize(project.estado)),
    ).length;

    const pendingProjects = data.projects.filter(
      (project) => normalize(project.estado) === "pendiente",
    ).length;

    const openTickets = data.tickets.filter((ticket) =>
      ["abierto", "en_progreso"].includes(normalize(ticket.estado)),
    );

    const highPriorityTickets = openTickets.filter((ticket) =>
      ["alta", "urgente"].includes(normalize(ticket.prioridad)),
    );

    const activeContracts = data.contracts.filter(
      (contract) => normalize(contract.estado) === "activo",
    );

    const maintenanceMonthlyValue = activeContracts.reduce(
      (sum, contract) => sum + monthlyContractValue(contract),
      0,
    );

    const pendingChanges = data.changeRequests.filter(
      (request) => normalize(request.status) === "pending",
    ).length;

    const overdueInvoices = data.invoices.filter((invoice) => {
      const due = dateOf(invoice.fecha_vencimiento);
      return Boolean(
        due &&
          isBefore(due, now) &&
          !isPaidInvoice(invoice) &&
          !isCancelledInvoice(invoice),
      );
    });

    const overdueAmount = overdueInvoices.reduce(
      (sum, invoice) => sum + invoiceOutstanding(invoice),
      0,
    );

    const overdueMilestones = data.milestones.filter((milestone) => {
      const due = dateOf(milestone.fecha_prevista);
      return Boolean(
        due &&
          isBefore(due, now) &&
          !milestone.completed_at &&
          normalize(milestone.estado) !== "completado",
      );
    });

    const automationErrors = data.automationRuns.filter(
      (run) =>
        normalize(run.estado) === "error" &&
        inPeriod(run.created_at, range.start, range.end),
    ).length;

    const activeClients = data.profiles.filter(
      (profile) =>
        normalize(profile.rol) === "user" &&
        normalize(profile.status) !== "blocked",
    ).length;

    const newClients = data.profiles.filter(
      (profile) =>
        normalize(profile.rol) === "user" &&
        inPeriod(profile.created_at, range.start, range.end),
    ).length;

    const pendingCustomProposals = data.customProposals.filter((proposal) =>
      ["submitted", "in_review", "quoted"].includes(normalize(proposal.status)),
    ).length;

    return {
      collected,
      billed,
      outstanding,
      outstandingCount: outstandingInvoices.length,
      pipeline,
      pipelineCount: pendingQuotations.length,
      activeProjects,
      completedProjects,
      pendingProjects,
      openTickets: openTickets.length,
      highPriorityTickets: highPriorityTickets.length,
      activeContracts: activeContracts.length,
      maintenanceMonthlyValue,
      pendingChanges,
      overdueInvoices,
      overdueAmount,
      overdueMilestones,
      automationErrors,
      activeClients,
      newClients,
      pendingCustomProposals,
    };
  }, [data, now, range]);

  const revenueBuckets = useMemo(() => {
    const start = startOfMonth(range.start);
    const end = range.end;
    const buckets: Array<{ label: string; value: number }> = [];
    let cursor = start;
    let guard = 0;

    while (cursor <= end && guard < 24) {
      const bucketEnd = endOfMonth(cursor);
      const value = data.payments
        .filter(
          (payment) =>
            isSuccessfulPayment(payment) &&
            inPeriod(
              payment.paid_at ?? payment.created_at,
              cursor > range.start ? cursor : range.start,
              bucketEnd < end ? bucketEnd : end,
            ),
        )
        .reduce((sum, payment) => sum + paymentInEuros(payment), 0);

      buckets.push({
        label: format(cursor, "MMM yy", { locale: es }),
        value,
      });

      cursor = addMonths(cursor, 1);
      guard += 1;
    }

    return buckets;
  }, [data.payments, range]);

  const alerts = useMemo<AlertItem[]>(() => {
    return [
      {
        id: "overdue-invoices",
        title: "Facturas vencidas",
        description: `${number.format(metrics.overdueInvoices.length)} pendientes de cobro`,
        value: euro.format(metrics.overdueAmount),
        tone: "danger",
        icon: CreditCard,
        route: "/employee/billing",
      },
      {
        id: "milestones",
        title: "Hitos retrasados",
        description: "Requieren seguimiento de proyecto",
        value: number.format(metrics.overdueMilestones.length),
        tone: "warning",
        icon: Flag,
        route: "/employee/projects",
      },
      {
        id: "company-changes",
        title: "Solicitudes pendientes",
        description: "Cambios de empresa pendientes de revisión",
        value: number.format(metrics.pendingChanges),
        tone: "warning",
        icon: Building2,
        route: "/employee/company-changes",
      },
      {
        id: "automation-errors",
        title: "Errores de automatización",
        description: "Ejecuciones fallidas en el periodo",
        value: number.format(metrics.automationErrors),
        tone: "danger",
        icon: Zap,
        route: "/employee/automation-runs",
      },
      {
        id: "support",
        title: "Tickets de alta prioridad",
        description: "Tickets abiertos con prioridad alta o urgente",
        value: number.format(metrics.highPriorityTickets),
        tone: "neutral",
        icon: Ticket,
        route: "/employee/support",
      },
    ];
  }, [metrics]);

  const upcoming = useMemo(() => {
    const today = startOfDay(now);

    const invoiceEvents = data.invoices
      .map((invoice) => ({
        id: `invoice-${invoice.id}`,
        kind: "Factura",
        title: shortText(invoice.numero_factura, "Factura"),
        company: invoice.company_id
          ? companyById.get(invoice.company_id)?.company_name
          : null,
        date: dateOf(invoice.fecha_vencimiento),
        amount: invoiceOutstanding(invoice),
        route: "/employee/billing",
        priority: 0,
      }))
      .filter(
        (item) =>
          item.date &&
          item.date >= today &&
          item.amount > 0,
      );

    const projectEvents = data.projects
      .map((project) => ({
        id: `project-${project.id}`,
        kind: "Proyecto",
        title: shortText(project.nombre, "Proyecto"),
        company: project.company_id
          ? companyById.get(project.company_id)?.company_name
          : null,
        date: dateOf(project.fecha_fin),
        amount: 0,
        route: "/employee/projects",
        priority: 1,
      }))
      .filter(
        (item) =>
          item.date &&
          item.date >= today &&
          ["activo", "pendiente", "pausado"].includes(
            normalize(
              data.projects.find((project) => project.id === item.id.replace("project-", ""))
                ?.estado,
            ),
          ),
      );

    const quotationEvents = data.quotations
      .map((quotation) => ({
        id: `quotation-${quotation.id}`,
        kind: "Presupuesto",
        title: shortText(quotation.numero_presupuesto, "Presupuesto"),
        company: quotation.company_id
          ? companyById.get(quotation.company_id)?.company_name
          : null,
        date: dateOf(quotation.fecha_validez),
        amount: Number(quotation.precio_total ?? quotation.precio_base ?? 0),
        route: "/employee/quotations",
        priority: 2,
      }))
      .filter(
        (item) =>
          item.date &&
          item.date >= today &&
          normalize(
            data.quotations.find(
              (quotation) => quotation.id === item.id.replace("quotation-", ""),
            )?.estado,
          ) === "pendiente",
      );

    const milestoneEvents = data.milestones
      .map((milestone) => ({
        id: `milestone-${milestone.id}`,
        kind: "Hito",
        title: shortText(milestone.nombre, "Hito"),
        company: milestone.project_id
          ? companyById.get(projectById.get(milestone.project_id)?.company_id ?? "")
              ?.company_name
          : null,
        date: dateOf(milestone.fecha_prevista),
        amount: 0,
        route: "/employee/projects",
        priority: 3,
      }))
      .filter(
        (item) =>
          item.date &&
          item.date >= today &&
          !data.milestones.find(
            (milestone) => milestone.id === item.id.replace("milestone-", ""),
          )?.completed_at,
      );

    return [
      ...invoiceEvents,
      ...projectEvents,
      ...quotationEvents,
      ...milestoneEvents,
    ]
      .sort(
        (a, b) =>
          (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0) ||
          a.priority - b.priority,
      )
      .slice(0, 7);
  }, [companyById, data.invoices, data.milestones, data.projects, data.quotations, now, projectById]);

  const latestActivity = data.activity.slice(0, 7);

  const firstName = useMemo(() => {
    const clean = data.workerName.trim();
    return clean ? clean.split(/\s+/)[0] : "Dirección";
  }, [data.workerName]);

  const greeting =
    now.getHours() < 12
      ? "Buenos días"
      : now.getHours() < 19
        ? "Buenas tardes"
        : "Buenas noches";

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#18212F]">
      <main className="mx-auto w-full max-w-[1540px] px-5 pb-14 pt-7 sm:px-8 lg:px-10 xl:px-12">
        <header className="flex items-center justify-between gap-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#18212F] text-sm font-bold tracking-[-0.04em] text-white">
              M
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9AA3B0]">
                Modira · Dirección
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold text-[#354154]">
                Centro de control
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/employee/notifications")}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[#E0E4E9] bg-white text-[#687487] transition hover:bg-[#F3F5F7]"
              aria-label="Notificaciones"
              title="Notificaciones"
            >
              <Bell className="h-4 w-4" strokeWidth={1.7} />
              {(metrics.pendingChanges + metrics.highPriorityTickets) > 0 ? (
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#B42318]" />
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => void loadDashboard(true)}
              disabled={refreshing}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E0E4E9] bg-white text-[#687487] transition hover:bg-[#F3F5F7] disabled:cursor-wait disabled:opacity-60"
              aria-label="Actualizar dashboard"
              title="Actualizar"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                strokeWidth={1.7}
              />
            </button>

            <div className="hidden h-10 items-center gap-2 rounded-xl border border-[#E0E4E9] bg-white px-3 sm:flex">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EEF1F4] text-xs font-bold text-[#526073]">
                {firstName.slice(0, 1).toUpperCase()}
              </span>
              <span className="max-w-[120px] truncate text-xs font-semibold text-[#526073]">
                {firstName}
              </span>
            </div>
          </div>
        </header>

        <section className="mt-8">
          <div className="flex flex-col justify-between gap-5 rounded-2xl border border-[#E1E5EA] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.02)] lg:flex-row lg:items-end lg:px-7 lg:py-7">
            <div>
              <p className="text-sm font-medium text-[#788496]">
                {greeting}, {firstName}
              </p>
              <h1 className="mt-1.5 text-[30px] font-semibold tracking-[-0.045em] text-[#18212F] sm:text-[36px]">
                Visión general del negocio
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#7F8A9A]">
                Una vista ejecutiva de clientes, proyectos, ventas, facturación,
                mantenimiento y operaciones de Modira.
              </p>
            </div>

            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setPeriodOpen((value) => !value)}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#DDE2E8] bg-white px-3.5 text-xs font-semibold text-[#4D5A6D]"
              >
                <Clock3 className="h-4 w-4 text-[#7E8999]" strokeWidth={1.7} />
                {periodLabels[period]}
                <ChevronDown className="h-3.5 w-3.5 text-[#9099A7]" strokeWidth={1.8} />
              </button>

              {periodOpen ? (
                <div className="absolute right-0 top-12 z-30 w-48 rounded-xl border border-[#E1E5EA] bg-white p-1.5 shadow-[0_12px_35px_rgba(20,28,40,0.12)]">
                  {(Object.keys(periodLabels) as DashboardPeriod[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setPeriod(option);
                        setPeriodOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs ${
                        period === option
                          ? "bg-[#F1F3F5] font-semibold text-[#18212F]"
                          : "text-[#647084] hover:bg-[#F7F8FA]"
                      }`}
                    >
                      {periodLabels[option]}
                      {period === option ? (
                        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {errors.length > 0 ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#F1DFC7] bg-[#FFF9F1] px-4 py-3 text-xs text-[#8A673A]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.7} />
            <span>
              Algunos datos no se han podido cargar: {errors.join(", ")}.
            </span>
          </div>
        ) : null}

        <section className="mt-5 overflow-hidden rounded-2xl border border-[#E1E5EA] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
          <div className="grid divide-y divide-[#E9ECF0] md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="p-5">
                  <LoadingPanel />
                </div>
              ))
            ) : (
              <>
                <MetricCard
                  icon={CircleDollarSign}
                  label="Ingresos cobrados"
                  value={euro.format(metrics.collected)}
                  detail={`Cobros confirmados · ${periodLabels[period].toLowerCase()}`}
                  onClick={() => navigate("/employee/billing")}
                  accent="success"
                />
                <MetricCard
                  icon={BarChart3}
                  label="Facturación"
                  value={euro.format(metrics.billed)}
                  detail={`Facturas emitidas · ${periodLabels[period].toLowerCase()}`}
                  onClick={() => navigate("/employee/billing")}
                />
                <MetricCard
                  icon={CreditCard}
                  label="Por cobrar"
                  value={euro.format(metrics.outstanding)}
                  detail={`${number.format(metrics.outstandingCount)} facturas pendientes`}
                  onClick={() => navigate("/employee/billing")}
                  accent={metrics.outstanding > 0 ? "danger" : "default"}
                />
                <MetricCard
                  icon={FileText}
                  label="Pipeline comercial"
                  value={euro.format(metrics.pipeline)}
                  detail={`${number.format(metrics.pipelineCount)} presupuestos pendientes`}
                  onClick={() => navigate("/employee/quotations")}
                />
              </>
            )}
          </div>
        </section>

        <section className="mt-3 grid overflow-hidden rounded-2xl border border-[#E1E5EA] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.02)] sm:grid-cols-2 lg:grid-cols-4">
          <SmallStat
            icon={Users}
            label="Clientes activos"
            value={number.format(metrics.activeClients)}
            detail={`+${number.format(metrics.newClients)} en el periodo`}
            onClick={() => navigate("/employee/clients")}
          />
          <SmallStat
            icon={FolderKanban}
            label="Proyectos activos"
            value={number.format(metrics.activeProjects)}
            detail={`${metrics.pendingProjects} pendientes · ${metrics.completedProjects} completados`}
            onClick={() => navigate("/employee/projects")}
          />
          <SmallStat
            icon={Ticket}
            label="Tickets abiertos"
            value={number.format(metrics.openTickets)}
            detail={`${metrics.highPriorityTickets} de alta prioridad`}
            onClick={() => navigate("/employee/support")}
          />
          <SmallStat
            icon={Wrench}
            label="Mantenimiento activo"
            value={number.format(metrics.activeContracts)}
            detail={`${euro.format(metrics.maintenanceMonthlyValue)}/mes equivalente`}
            onClick={() => navigate("/employee/maintenance")}
          />
        </section>

        <section className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.8fr)]">
          <div className="rounded-2xl border border-[#E1E5EA] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.02)] sm:p-6">
            <SectionHeader
              eyebrow="Rendimiento económico"
              title="Ingresos cobrados"
              description="Evolución de los cobros confirmados durante el periodo seleccionado."
              action="Ver facturación"
              onAction={() => navigate("/employee/billing")}
            />
            <div className="mt-5 border-t border-[#EEF1F4] pt-3">
              {loading ? (
                <div className="flex min-h-[270px] items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-[#8994A4]" />
                </div>
              ) : revenueBuckets.length === 0 ? (
                <div className="flex min-h-[270px] items-center justify-center text-sm text-[#8B95A4]">
                  No hay cobros para el periodo seleccionado.
                </div>
              ) : (
                <RevenueChart buckets={revenueBuckets} />
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#E1E5EA] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.02)] sm:p-6">
            <SectionHeader
              eyebrow="Control ejecutivo"
              title="Requiere atención"
              description="Elementos que pueden requerir una decisión o seguimiento."
            />
            <div className="mt-4 border-t border-[#EEF1F4]">
              {alerts.map((item) => (
                <AlertRow key={item.id} item={item} onClick={() => navigate(item.route)} />
              ))}
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="rounded-2xl border border-[#E1E5EA] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.02)] sm:p-6">
            <SectionHeader
              eyebrow="Ventas"
              title="Actividad comercial"
              description="Presupuestos pendientes y propuestas de mantenimiento en curso."
              action="Ver presupuestos"
              onAction={() => navigate("/employee/quotations")}
            />

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-[#F7F8FA] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#919BA9]">
                  Presupuestos
                </p>
                <p className="mt-2 text-2xl font-semibold text-[#253044]">
                  {number.format(metrics.pipelineCount)}
                </p>
                <p className="mt-1 text-xs text-[#8994A4]">
                  {euro.format(metrics.pipeline)} en pipeline
                </p>
              </div>
              <div className="rounded-xl bg-[#F7F8FA] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#919BA9]">
                  Propuestas mantenimiento
                </p>
                <p className="mt-2 text-2xl font-semibold text-[#253044]">
                  {number.format(metrics.pendingCustomProposals)}
                </p>
                <p className="mt-1 text-xs text-[#8994A4]">
                  En revisión o con propuesta
                </p>
              </div>
              <div className="rounded-xl bg-[#F7F8FA] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#919BA9]">
                  Cambios empresa
                </p>
                <p className="mt-2 text-2xl font-semibold text-[#253044]">
                  {number.format(metrics.pendingChanges)}
                </p>
                <p className="mt-1 text-xs text-[#8994A4]">
                  Solicitudes pendientes
                </p>
              </div>
            </div>

            <div className="mt-5 border-t border-[#EEF1F4]">
              {data.quotations
                .filter((quotation) => normalize(quotation.estado) === "pendiente")
                .slice(0, 5)
                .map((quotation) => (
                  <button
                    key={quotation.id}
                    type="button"
                    onClick={() => navigate("/employee/quotations")}
                    className="flex w-full items-center gap-4 border-b border-[#EEF1F4] py-3.5 text-left last:border-b-0"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F3F5F7]">
                      <FileText className="h-4 w-4 text-[#657287]" strokeWidth={1.7} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[#354154]">
                        {shortText(quotation.numero_presupuesto, quotation.titulo ?? "Presupuesto")}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[#9099A7]">
                        {quotation.company_id
                          ? shortText(
                              companyById.get(quotation.company_id)?.company_name,
                              "Empresa",
                            )
                          : "Empresa"}
                        {quotation.fecha_validez
                          ? ` · válido hasta ${format(new Date(quotation.fecha_validez), "d MMM", {
                              locale: es,
                            })}`
                          : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-[#465368]">
                      {euro.format(Number(quotation.precio_total ?? quotation.precio_base ?? 0))}
                    </span>
                  </button>
                ))}

              {metrics.pipelineCount === 0 ? (
                <div className="py-7 text-sm text-[#8B95A4]">
                  No hay presupuestos pendientes.
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-[#E1E5EA] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.02)] sm:p-6">
            <SectionHeader
              eyebrow="Agenda operativa"
              title="Próximos vencimientos"
              description="Fechas que requieren seguimiento próximamente."
              action="Abrir calendario"
              onAction={() => navigate("/employee/calendar")}
            />

            <div className="mt-5 border-t border-[#EEF1F4]">
              {upcoming.length === 0 ? (
                <div className="py-8 text-sm text-[#8B95A4]">
                  No hay vencimientos próximos registrados.
                </div>
              ) : (
                upcoming.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.route)}
                    className="group flex w-full items-center gap-3 border-b border-[#EEF1F4] py-3.5 text-left last:border-b-0"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F5F6F8]">
                      <CalendarDays className="h-4 w-4 text-[#697588]" strokeWidth={1.7} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[#354154]">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[#9099A7]">
                        {item.kind}
                        {item.company ? ` · ${item.company}` : ""}
                        {item.date
                          ? ` · ${format(item.date, "d MMM", { locale: es })}`
                          : ""}
                      </span>
                    </span>
                    {item.amount > 0 ? (
                      <span className="shrink-0 text-xs font-semibold text-[#4D5A6D]">
                        {euro.format(item.amount)}
                      </span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <div className="rounded-2xl border border-[#E1E5EA] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.02)] sm:p-6">
            <SectionHeader
              eyebrow="Trazabilidad"
              title="Actividad reciente"
              description="Últimos movimientos registrados en Modira."
              action="Ver actividad"
              onAction={() => navigate("/employee/activity")}
            />

            <div className="mt-5 border-t border-[#EEF1F4]">
              {latestActivity.length === 0 ? (
                <div className="py-8 text-sm text-[#8B95A4]">
                  Todavía no hay actividad registrada.
                </div>
              ) : (
                latestActivity.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate("/employee/activity")}
                    className="flex w-full items-center gap-3 border-b border-[#EEF1F4] py-3.5 text-left last:border-b-0"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F3F5F7]">
                      <Activity className="h-4 w-4 text-[#697588]" strokeWidth={1.7} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[#354154]">
                        {shortText(item.description, item.action)}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[#9099A7]">
                        {item.resource_type} ·{" "}
                        {formatDistanceToNow(new Date(item.created_at), {
                          addSuffix: true,
                          locale: es,
                        })}
                      </span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#A5ADBA]" strokeWidth={1.7} />
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#E1E5EA] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.02)] sm:p-6">
            <SectionHeader
              eyebrow="Acceso rápido"
              title="Acciones de Dirección"
              description="Acciones disponibles según el permiso efectivo del trabajador."
            />

            <div className="mt-5 grid gap-2.5">
              {permissions["projects.create"] ? (
                <QuickAction
                  icon={FolderKanban}
                  label="Nuevo proyecto"
                  description="Crear un proyecto operativo"
                  onClick={() => navigate("/employee/projects/new")}
                />
              ) : null}

              {permissions["quotations.create"] ? (
                <QuickAction
                  icon={FileText}
                  label="Nuevo presupuesto"
                  description="Crear una nueva propuesta comercial"
                  onClick={() => navigate("/employee/quotations/new")}
                />
              ) : null}

              {permissions["invoices.create"] ? (
                <QuickAction
                  icon={CreditCard}
                  label="Nueva factura"
                  description="Emitir documentación de facturación"
                  onClick={() => navigate("/employee/billing/new")}
                />
              ) : null}

              <QuickAction
                icon={Users}
                label="Clientes"
                description="Gestionar la cartera de clientes"
                onClick={() => navigate("/employee/clients")}
              />

              <QuickAction
                icon={Building2}
                label="Empresas"
                description="Consultar y gestionar empresas"
                onClick={() => navigate("/employee/companies")}
              />

              <QuickAction
                icon={Settings2}
                label="Sistema"
                description="Acceder a la administración del CRM"
                onClick={() => navigate("/employee/system")}
              />
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ExecutiveLink
            icon={CircleDollarSign}
            title="Finanzas"
            description="Visión financiera y económica"
            onClick={() => navigate("/employee/finance")}
          />
          <ExecutiveLink
            icon={BarChart3}
            title="Gastos"
            description="Control de costes y gastos"
            onClick={() => navigate("/employee/expenses")}
          />
          <ExecutiveLink
            icon={LifeBuoy}
            title="Soporte"
            description="Tickets y atención operativa"
            onClick={() => navigate("/employee/support")}
          />
          <ExecutiveLink
            icon={ShieldAlert}
            title="Auditoría"
            description="Trazabilidad y actividad del sistema"
            onClick={() => navigate("/employee/audits")}
          />
        </section>

        <footer className="mt-8 flex flex-col justify-between gap-2 border-t border-[#E1E5EA] pt-5 text-[11px] text-[#9AA3B0] sm:flex-row">
          <span>Modira · Dashboard de Dirección</span>
          <span>Los permisos efectivos se comprueban también en backend.</span>
        </footer>
      </main>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  description,
  onClick,
}: {
  icon: typeof FolderKanban;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-[#E6E9ED] bg-white p-3 text-left transition hover:border-[#D6DBE2] hover:bg-[#FAFBFC]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F2F4F6]">
        <Icon className="h-4 w-4 text-[#596579]" strokeWidth={1.7} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[#354154]">{label}</span>
        <span className="mt-0.5 block truncate text-xs text-[#8A95A5]">{description}</span>
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#A5ADBA]" strokeWidth={1.7} />
    </button>
  );
}

function ExecutiveLink({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof CircleDollarSign;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-[#E1E5EA] bg-white p-4 text-left shadow-[0_1px_2px_rgba(16,24,40,0.02)] transition hover:border-[#D5DAE1] hover:bg-[#FBFCFD]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F3F5F7]">
        <Icon className="h-4 w-4 text-[#5C697C]" strokeWidth={1.7} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[#354154]">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-[#8A95A5]">{description}</span>
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-[#A3ACB8]" strokeWidth={1.7} />
    </button>
  );
}
