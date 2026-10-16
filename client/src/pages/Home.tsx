import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useLocation } from "wouter";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  Bell,
  BriefcaseBusiness,
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
  Menu,
  RefreshCw,
  Ticket,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  addDays,
  addMonths,
  addQuarters,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  formatDistanceToNow,
  isBefore,
  isWithinInterval,
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
  | "year"
  | "custom";

type ChartGranularity = "auto" | "day" | "week" | "month" | "quarter";

export type EmployeeHomeSection =
  | "dashboard"
  | "companies"
  | "quotations"
  | "invoices"
  | "payments"
  | "projects"
  | "support"
  | "ai"
  | "notifications"
  | "activity"
  | "audits"
  | "companyChanges"
  | "maintenance"
  | "automations"
  | "automationRuns"
  | "calendar";

export type EmployeeHomeNewAction =
  | "quotation"
  | "project"
  | "invoice";

interface ProjectRow {
  id: string;
  nombre: string;
  descripcion?: string | null;
  estado?: string | null;
  company_id?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  updated_at?: string | null;
}

interface CompanyRow {
  id: string;
  company_name?: string | null;
  created_at?: string | null;
}

interface QuotationRow {
  id: string;
  company_id?: string | null;
  project_id?: string | null;
  numero_presupuesto?: string | null;
  titulo?: string | null;
  precio_base?: number | null;
  precio_total?: number | null;
  iva_porcentaje?: number | null;
  estado?: string | null;
  fecha_emision?: string | null;
  fecha_validez?: string | null;
  created_at?: string | null;
}

interface InvoiceRow {
  id: string;
  company_id?: string | null;
  project_id?: string | null;
  numero_factura?: string | null;
  monto?: number | null;
  subtotal?: number | null;
  iva_importe?: number | null;
  importe_a_pagar?: number | null;
  irpf_importe?: number | null;
  estado?: string | null;
  fecha_emision?: string | null;
  fecha_vencimiento?: string | null;
  fecha_pago?: string | null;
  created_at?: string | null;
}

interface PaymentRow {
  id: string;
  company_id?: string | null;
  invoice_id?: string | null;
  amount?: number | null;
  currency?: string | null;
  status?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  description?: string | null;
}

interface TicketRow {
  id: string;
  company_id?: string | null;
  titulo?: string | null;
  estado?: string | null;
  prioridad?: string | null;
  fecha_creacion?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface MilestoneRow {
  id: string;
  project_id?: string | null;
  nombre?: string | null;
  fecha_prevista?: string | null;
  orden?: number | null;
  estado?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface ProgressRow {
  project_id: string;
  total_milestones?: number | null;
  completed_milestones?: number | null;
  progress_percentage?: number | null;
}

interface UpdateRow {
  id: string;
  project_id?: string | null;
  titulo?: string | null;
  contenido?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface ActivityRow {
  id: string;
  user_id?: string | null;
  company_id?: string | null;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

interface ContractRow {
  id: string;
  company_id?: string | null;
  nombre_plan?: string | null;
  precio?: number | null;
  periodicidad?: string | null;
  estado?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  created_at?: string | null;
}

interface ChangeRequestRow {
  id: string;
  user_id?: string | null;
  current_company_id?: string | null;
  requested_company_id?: string | null;
  reason?: string | null;
  status?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  created_at?: string | null;
}

interface ProfileRow {
  id: string;
  nombre?: string | null;
  rol?: string | null;
  company_id?: string | null;
  status?: string | null;
  created_at?: string | null;
}

interface AuditRequestRow {
  id: string;
  nombre?: string | null;
  empresa?: string | null;
  estado?: string | null;
  created_at?: string | null;
}

interface UpcomingEvent {
  id: string;
  kind: "invoice" | "project" | "milestone" | "contract" | "quotation";
  title: string;
  subtitle: string;
  date: Date;
  value?: number;
  section: EmployeeHomeSection;
}

interface AutomationRunRow {
  id: string;
  automation_id?: string | null;
  company_id?: string | null;
  estado?: string | null;
  inicio?: string | null;
  finalizacion?: string | null;
  duracion_ms?: number | null;
  error?: string | null;
  created_at?: string | null;
}

interface DashboardData {
  workerName: string;
  companies: CompanyRow[];
  projects: ProjectRow[];
  quotations: QuotationRow[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  tickets: TicketRow[];
  milestones: MilestoneRow[];
  progress: ProgressRow[];
  updates: UpdateRow[];
  activity: ActivityRow[];
  contracts: ContractRow[];
  changeRequests: ChangeRequestRow[];
  profiles: ProfileRow[];
  auditRequests: AuditRequestRow[];
  automationRuns: AutomationRunRow[];
}

interface PeriodRange {
  start: Date;
  end: Date;
  label: string;
}

const euro = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const compactNumber = new Intl.NumberFormat("es-ES");

const periodLabels: Record<DashboardPeriod, string> = {
  today: "Hoy",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  month: "Este mes",
  previousMonth: "Mes anterior",
  quarter: "Este trimestre",
  year: "Este año",
  custom: "Personalizado",
};

const chartGranularityLabels: Record<ChartGranularity, string> = {
  auto: "Automática",
  day: "Diaria",
  week: "Semanal",
  month: "Mensual",
  quarter: "Trimestral",
};

const routes: Partial<Record<EmployeeHomeSection, string>> = {
  dashboard: "/employee",
  projects: "/employee/projects",
  quotations: "/employee/quotations",
  invoices: "/employee/billing",
  payments: "/employee/billing",
  companies: "/employee/companies", // TODO: FUTURE EMPLOYEE ROUTE
  support: "/employee/support", // TODO: FUTURE EMPLOYEE ROUTE
  ai: "/employee/ai", // TODO: FUTURE EMPLOYEE ROUTE
  notifications: "/employee/notifications", // TODO: FUTURE EMPLOYEE ROUTE
  activity: "/employee/activity", // TODO: FUTURE EMPLOYEE ROUTE
  audits: "/employee/audits", // TODO: FUTURE EMPLOYEE ROUTE
  companyChanges: "/employee/company-changes", // TODO: FUTURE EMPLOYEE ROUTE
  maintenance: "/employee/maintenance", // TODO: FUTURE EMPLOYEE ROUTE
  automations: "/employee/automations", // TODO: FUTURE EMPLOYEE ROUTE
  automationRuns: "/employee/automation-runs", // TODO: FUTURE EMPLOYEE ROUTE
  calendar: "/employee/calendar", // TODO: FUTURE EMPLOYEE ROUTE · página completa futura
};

const newRoutes: Record<EmployeeHomeNewAction, string> = {
  quotation: "/employee/quotations/new",
  project: "/employee/projects/new",
  invoice: "/employee/billing/new",
};

function normalizeStatus(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntilLabel(date: Date): string {
  const days = Math.max(
    0,
    Math.ceil(
      (startOfDay(date).getTime() - startOfDay(new Date()).getTime()) /
        86400000
    )
  );

  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  return `en ${days} días`;
}

function inRange(
  value: string | Date | null | undefined,
  start: Date,
  end: Date
): boolean {
  const date = toDate(value);
  return Boolean(date && date >= start && date <= end);
}

function safeText(value: string | null | undefined, fallback: string): string {
  const text = value?.trim();
  return text || fallback;
}

function isCancelledInvoice(invoice: InvoiceRow): boolean {
  return normalizeStatus(invoice.estado) === "cancelada";
}

function isPaidInvoice(invoice: InvoiceRow): boolean {
  return normalizeStatus(invoice.estado) === "pagada";
}

function isOpenTicket(ticket: TicketRow): boolean {
  return ["abierto", "en_progreso"].includes(normalizeStatus(ticket.estado));
}

function isHighPriority(ticket: TicketRow): boolean {
  return ["alta", "urgente"].includes(normalizeStatus(ticket.prioridad));
}

function isCompletedMilestone(milestone: MilestoneRow): boolean {
  return Boolean(
    milestone.completed_at ||
      normalizeStatus(milestone.estado) === "completado"
  );
}

function isActiveProject(project: ProjectRow): boolean {
  return ["activo", "pendiente"].includes(normalizeStatus(project.estado));
}

function paymentIsSuccessful(payment: PaymentRow): boolean {
  return normalizeStatus(payment.status) === "succeeded";
}

function paymentAmountInEuros(payment: PaymentRow): number {
  const currency = String(payment.currency ?? "EUR").toUpperCase();
  if (currency !== "EUR") return 0;

  return Number(payment.amount ?? 0) / 100;
}

function invoiceOutstanding(invoice: InvoiceRow): number {
  if (
    isPaidInvoice(invoice) ||
    isCancelledInvoice(invoice)
  ) {
    return 0;
  }

  const amount = Number(
    invoice.importe_a_pagar ?? invoice.monto ?? 0
  );

  return Math.max(0, amount);
}

function invoiceNetAmount(invoice: InvoiceRow): number {
  // "Neto" se interpreta como base imponible: subtotal, antes de IVA.
  // Si una fila legacy no tuviera subtotal, se usa monto - iva_importe.
  const subtotal = Number(invoice.subtotal);
  if (Number.isFinite(subtotal)) return Math.max(0, subtotal);

  return Math.max(
    0,
    Number(invoice.monto ?? 0) - Number(invoice.iva_importe ?? 0)
  );
}

function monthlyContractValue(contract: ContractRow): number {
  const price = Number(contract.precio ?? 0);
  switch (normalizeStatus(contract.periodicidad)) {
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

function getPeriodRange(
  period: DashboardPeriod,
  now: Date,
  customStart: Date | null,
  customEnd: Date | null
): PeriodRange {
  switch (period) {
    case "today":
      return {
        start: startOfDay(now),
        end: endOfDay(now),
        label: periodLabels[period],
      };
    case "7d":
      return {
        start: startOfDay(addDays(now, -6)),
        end: endOfDay(now),
        label: periodLabels[period],
      };
    case "30d":
      return {
        start: startOfDay(addDays(now, -29)),
        end: endOfDay(now),
        label: periodLabels[period],
      };
    case "month":
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
        label: periodLabels[period],
      };
    case "previousMonth": {
      const previousMonth = addMonths(now, -1);
      return {
        start: startOfMonth(previousMonth),
        end: endOfMonth(previousMonth),
        label: periodLabels[period],
      };
    }
    case "quarter":
      return {
        start: startOfQuarter(now),
        end: endOfQuarter(now),
        label: periodLabels[period],
      };
    case "year":
      return {
        start: startOfYear(now),
        end: endOfYear(now),
        label: periodLabels[period],
      };
    case "custom":
      return {
        start: customStart ?? startOfMonth(now),
        end: customEnd ?? endOfDay(now),
        label: periodLabels[period],
      };
  }
}

function getAutoGranularity(start: Date, end: Date): Exclude<ChartGranularity, "auto"> {
  const days = Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime()) / 86_400_000)
  );

  if (days <= 31) return "day";
  if (days <= 120) return "week";
  if (days <= 730) return "month";
  return "quarter";
}

function startOfBucket(date: Date, granularity: Exclude<ChartGranularity, "auto">): Date {
  switch (granularity) {
    case "day":
      return startOfDay(date);
    case "week": {
      const day = date.getDay();
      const daysFromMonday = day === 0 ? 6 : day - 1;
      return startOfDay(addDays(date, -daysFromMonday));
    }
    case "month":
      return startOfMonth(date);
    case "quarter":
      return startOfQuarter(date);
  }
}

function nextBucket(
  date: Date,
  granularity: Exclude<ChartGranularity, "auto">
): Date {
  switch (granularity) {
    case "day":
      return addDays(date, 1);
    case "week":
      return addWeeks(date, 1);
    case "month":
      return addMonths(date, 1);
    case "quarter":
      return addQuarters(date, 1);
  }
}

function formatBucketLabel(
  date: Date,
  granularity: Exclude<ChartGranularity, "auto">
): string {
  switch (granularity) {
    case "day":
      return format(date, "d MMM", { locale: es });
    case "week":
      return `Sem. ${format(date, "d MMM", { locale: es })}`;
    case "month":
      return format(date, "MMM yy", { locale: es });
    case "quarter":
      return `T${Math.floor(date.getMonth() / 3) + 1} ${format(date, "yy")}`;
  }
}

function SectionTitle({
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8A93A3]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.015em] text-[#172033]">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-[#7C8798]">{description}</p>
        ) : null}
      </div>

      {action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-[#344154] transition-colors hover:text-[#172033]"
        >
          {action}
          <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
        </button>
      ) : null}
    </div>
  );
}

function PrimaryMetric({
  icon: Icon,
  label,
  value,
  detail,
  onClick,
}: {
  icon: typeof CircleDollarSign;
  label: string;
  value: string;
  detail: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 text-[#667285]" strokeWidth={1.7} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#7F8998]">
          {label}
        </span>
      </div>
      <p className="mt-4 text-[25px] font-semibold tracking-[-0.035em] text-[#172033] sm:text-[28px]">
        {value}
      </p>
      <p className="mt-1 text-xs text-[#8993A2]">{detail}</p>
    </>
  );

  if (!onClick) {
    return <div className="min-w-0 px-5 py-5 sm:px-6">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 px-5 py-5 text-left transition-colors hover:bg-[#FAFBFC] sm:px-6"
    >
      {content}
    </button>
  );
}

function SecondaryMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 py-4 sm:px-5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#778293]" strokeWidth={1.65} />
        <span className="text-xs font-medium text-[#697486]">{label}</span>
      </div>
      <p className="mt-2 text-xl font-semibold tracking-[-0.025em] text-[#263044]">
        {value}
      </p>
      <p className="mt-0.5 truncate text-xs text-[#929AAA]">{detail}</p>
    </div>
  );
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-[#EEF1F5] ${className}`}
      aria-hidden="true"
    />
  );
}

function AttentionRow({
  icon: Icon,
  title,
  detail,
  value,
  tone = "neutral",
  onClick,
}: {
  icon: typeof AlertCircle;
  title: string;
  detail: string;
  value: string;
  tone?: "neutral" | "warning" | "danger";
  onClick?: () => void;
}) {
  const toneClass =
    tone === "danger"
      ? "text-[#B54747]"
      : tone === "warning"
        ? "text-[#9A6B18]"
        : "text-[#526073]";

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 border-b border-[#EEF1F4] py-3.5 text-left last:border-b-0"
    >
      <span className={`mt-0.5 shrink-0 ${toneClass}`}>
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-[#303B4E] group-hover:text-[#172033]">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-[#8A94A4]">
          {detail}
        </span>
      </span>
      <span className="shrink-0 text-right text-sm font-semibold text-[#263044]">
        {value}
      </span>
      <ArrowRight
        className="h-3.5 w-3.5 shrink-0 text-[#A0A8B5] opacity-0 transition-opacity group-hover:opacity-100"
        strokeWidth={1.7}
      />
    </button>
  );
}

function RevenueChart({
  buckets,
  granularity,
}: {
  buckets: Array<{
    label: string;
    collected: number;
  }>;
  granularity: Exclude<ChartGranularity, "auto">;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const width = 760;
  const height = 280;
  const left = 48;
  const right = 18;
  const top = 18;
  const bottom = 40;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const max = Math.max(1, ...buckets.map((bucket) => bucket.collected));

  const points = buckets.map((bucket, index) => {
    const x =
      buckets.length === 1
        ? left + chartWidth / 2
        : left + (index / (buckets.length - 1)) * chartWidth;
    const y = top + chartHeight - (bucket.collected / max) * chartHeight;
    return { ...bucket, x, y };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${top + chartHeight} L ${points[0].x} ${top + chartHeight} Z`
      : "";

  const visibleLabels = points.filter((_, index) => {
    if (points.length <= 8) return true;
    const step = Math.ceil(points.length / 8);
    return index === 0 || index === points.length - 1 || index % step === 0;
  });

  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="relative mt-5 w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label="Ingresos cobrados por periodo"
      >
        {yTicks.map((ratio) => {
          const y = top + chartHeight - ratio * chartHeight;
          const value = max * ratio;
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
                x={left - 9}
                y={y + 4}
                textAnchor="end"
                className="fill-[#9AA3AF] text-[9px]"
              >
                {value >= 1000
                  ? `${Math.round(value / 1000)}k`
                  : Math.round(value)}
              </text>
            </g>
          );
        })}

        {areaPath ? (
          <path d={areaPath} fill="currentColor" className="text-[#F2F5F8]" />
        ) : null}

        {linePath ? (
          <path
            d={linePath}
            fill="none"
            stroke="#344154"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {points.map((point, index) => (
          <g
            key={`${point.label}-${index}`}
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered(null)}
          >
            <circle
              cx={point.x}
              cy={point.y}
              r={hovered === index ? 5 : 3}
              className="fill-white stroke-[#344154]"
              strokeWidth="2"
            />
          </g>
        ))}

        {visibleLabels.map((point) => (
          <text
            key={`label-${point.label}-${point.x}`}
            x={point.x}
            y={height - 13}
            textAnchor="middle"
            className="fill-[#969EAA] text-[9px]"
          >
            {point.label}
          </text>
        ))}
      </svg>

      {hovered !== null && points[hovered] ? (
        <div
          className="pointer-events-none absolute top-2 rounded-lg border border-[#E4E8EE] bg-white px-3 py-2 text-xs"
          style={{
            left: `${Math.min(
              82,
              Math.max(
                9,
                (points[hovered].x / width) * 100
              )
            )}%`,
            transform: "translateX(-50%)",
          }}
        >
          <p className="font-medium text-[#596476]">
            {points[hovered].label}
          </p>
          <p className="mt-0.5 font-semibold text-[#172033]">
            {euro.format(points[hovered].collected)}
          </p>
        </div>
      ) : null}

      <p className="mt-1 text-xs text-[#98A1AE]">
        {chartGranularityLabels[granularity]} · ingresos efectivamente cobrados
      </p>
    </div>
  );
}

export default function EmployeeHome() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const [period, setPeriod] = useState<DashboardPeriod>("30d");
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const [chartGranularity, setChartGranularity] =
    useState<ChartGranularity>("auto");
  const [chartMenuOpen, setChartMenuOpen] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() =>
    startOfMonth(new Date())
  );
  const [calendarSelectedDay, setCalendarSelectedDay] = useState<Date>(() =>
    startOfDay(new Date())
  );

  const [customStart, setCustomStart] = useState<Date | null>(null);
  const [customEnd, setCustomEnd] = useState<Date | null>(null);

  const [data, setData] = useState<DashboardData>({
    workerName: "",
    companies: [],
    projects: [],
    quotations: [],
    invoices: [],
    payments: [],
    tickets: [],
    milestones: [],
    progress: [],
    updates: [],
    activity: [],
    contracts: [],
    changeRequests: [],
    profiles: [],
    auditRequests: [],
    automationRuns: [],
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const periodRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const newRef = useRef<HTMLDivElement | null>(null);

  const navigate = useCallback(
    (section: EmployeeHomeSection) => {
      const route = routes[section];
      if (route) setLocation(route);
    },
    [setLocation]
  );

  const triggerNew = useCallback(
    (action: EmployeeHomeNewAction) => {
      setNewMenuOpen(false);
      setLocation(newRoutes[action]);
    },
    [setLocation]
  );

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (periodRef.current && !periodRef.current.contains(target)) {
        setPeriodMenuOpen(false);
      }
      if (chartRef.current && !chartRef.current.contains(target)) {
        setChartMenuOpen(false);
      }
      if (newRef.current && !newRef.current.contains(target)) {
        setNewMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPeriodMenuOpen(false);
        setChartMenuOpen(false);
        setNewMenuOpen(false);
        setMenuOpen(false);
        setCalendarOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [menuOpen]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const loadDashboard = useCallback(
    async (isRefresh = false) => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const warnings: string[] = [];

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
          progressResult,
          updatesResult,
          activityResult,
          contractsResult,
          changeRequestsResult,
          profilesResult,
          auditRequestsResult,
          automationRunsResult,
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
            .select(
              "id, nombre, descripcion, estado, company_id, fecha_inicio, fecha_fin, updated_at"
            )
            .order("updated_at", { ascending: false }),

          supabase
            .from("quotations")
            .select(
              "id, company_id, project_id, numero_presupuesto, titulo, precio_base, precio_total, iva_porcentaje, estado, fecha_emision, fecha_validez, created_at"
            )
            .order("created_at", { ascending: false }),

          supabase
            .from("invoices")
            .select(
              "id, company_id, project_id, numero_factura, monto, subtotal, iva_importe, importe_a_pagar, irpf_importe, estado, fecha_emision, fecha_vencimiento, fecha_pago, created_at"
            )
            .order("created_at", { ascending: false }),

          supabase
            .from("payments")
            .select(
              "id, company_id, invoice_id, amount, currency, status, paid_at, created_at, description"
            )
            .order("created_at", { ascending: false }),

          supabase
            .from("support_tickets")
            .select(
              "id, company_id, titulo, estado, prioridad, fecha_creacion, created_at, updated_at"
            )
            .order("created_at", { ascending: false }),

          supabase
            .from("project_milestones")
            .select(
              "id, project_id, nombre, fecha_prevista, orden, estado, completed_at, created_at, updated_at"
            )
            .order("fecha_prevista", { ascending: true }),

          supabase
            .from("project_progress")
            .select(
              "project_id, total_milestones, completed_milestones, progress_percentage"
            ),

          supabase
            .from("project_updates")
            .select(
              "id, project_id, titulo, contenido, created_by, created_at, updated_at"
            )
            .order("created_at", { ascending: false })
            .limit(30),

          supabase
            .from("activity_log")
            .select(
              "id, user_id, company_id, action, resource_type, resource_id, description, metadata, created_at"
            )
            .order("created_at", { ascending: false })
            .limit(30),

          supabase
            .from("maintenance_contracts")
            .select(
              "id, company_id, nombre_plan, precio, periodicidad, estado, fecha_inicio, fecha_fin, created_at"
            )
            .order("fecha_fin", { ascending: true }),

          // Esta RPC ya forma parte del flujo actual de EmployeeArea y
          // mantiene la revisión de solicitudes dentro de la frontera
          // SECURITY DEFINER existente.
          supabase.rpc("get_worker_project_change_requests"),

          // 016/021 permiten al worker activo consultar perfiles
          // necesarios para contexto operativo.
          supabase
            .from("profiles")
            .select("id, nombre, rol, company_id, status, created_at")
            .order("created_at", { ascending: false }),

          // 004 expone audit_requests al worker mediante RLS.
          // 028 mantiene el INSERT público detrás de submit_audit_request().
          supabase
            .from("audit_requests")
            .select("id, nombre, empresa, estado, created_at")
            .order("created_at", { ascending: false })
            .limit(100),

          // 005/016 permiten al worker consultar el historial de runs.
          supabase
            .from("automation_runs")
            .select(
              "id, automation_id, company_id, estado, inicio, finalizacion, duracion_ms, error, created_at"
            )
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
          ["soporte", ticketsResult.error],
          ["hitos", milestonesResult.error],
          ["progreso", progressResult.error],
          ["actualizaciones", updatesResult.error],
          ["actividad", activityResult.error],
          ["contratos", contractsResult.error],
          ["solicitudes de cambio", changeRequestsResult.error],
          ["perfiles", profilesResult.error],
          ["solicitudes de auditoría", auditRequestsResult.error],
          ["ejecuciones de automatización", automationRunsResult.error],
        ] as const;

        for (const [name, error] of results) {
          if (error) warnings.push(name);
        }

        setData({
          workerName:
            workerResult.data?.display_name?.trim() || "Trabajador",
          companies: (companiesResult.data || []) as CompanyRow[],
          projects: (projectsResult.data || []) as ProjectRow[],
          quotations: (quotationsResult.data || []) as QuotationRow[],
          invoices: (invoicesResult.data || []) as InvoiceRow[],
          payments: (paymentsResult.data || []) as PaymentRow[],
          tickets: (ticketsResult.data || []) as TicketRow[],
          milestones: (milestonesResult.data || []) as MilestoneRow[],
          progress: (progressResult.data || []) as ProgressRow[],
          updates: (updatesResult.data || []) as UpdateRow[],
          activity: (activityResult.data || []) as ActivityRow[],
          contracts: (contractsResult.data || []) as ContractRow[],
          changeRequests: (changeRequestsResult.data || []) as ChangeRequestRow[],
          profiles: (profilesResult.data || []) as ProfileRow[],
          auditRequests: (auditRequestsResult.data || []) as AuditRequestRow[],
          automationRuns: (automationRunsResult.data || []) as AutomationRunRow[],
        });

        setErrors(warnings);
      } catch (error) {
        console.error("[EmployeeHome] Error loading dashboard:", error);
        setErrors(["datos del dashboard"]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id]
  );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const now = useMemo(() => new Date(), []);

  const periodRange = useMemo(
    () => getPeriodRange(period, now, customStart, customEnd),
    [period, now, customStart, customEnd]
  );

  const companyById = useMemo(() => {
    const map = new Map<string, CompanyRow>();
    data.companies.forEach((company) => map.set(company.id, company));
    return map;
  }, [data.companies]);

  const projectById = useMemo(() => {
    const map = new Map<string, ProjectRow>();
    data.projects.forEach((project) => map.set(project.id, project));
    return map;
  }, [data.projects]);

  const profileById = useMemo(() => {
    const map = new Map<string, ProfileRow>();
    data.profiles.forEach((profile) => map.set(profile.id, profile));
    return map;
  }, [data.profiles]);

  const metrics = useMemo(() => {
    const periodInvoices = data.invoices.filter((invoice) =>
      inRange(
        invoice.fecha_emision || invoice.created_at,
        periodRange.start,
        periodRange.end
      )
    );

    const periodPayments = data.payments.filter((payment) =>
      inRange(
        payment.paid_at || payment.created_at,
        periodRange.start,
        periodRange.end
      )
    );

    const billedNet = periodInvoices
      .filter((invoice) => !isCancelledInvoice(invoice))
      .reduce((sum, invoice) => sum + invoiceNetAmount(invoice), 0);

    const billedGross = periodInvoices
  .filter((invoice) => !isCancelledInvoice(invoice))
  .reduce((sum, invoice) => sum + Number(invoice.monto ?? 0), 0);

    const collected = periodPayments
      .filter(paymentIsSuccessful)
      .reduce((sum, payment) => sum + paymentAmountInEuros(payment), 0);

    const outstandingInvoices = periodInvoices.filter(
      (invoice) => invoiceOutstanding(invoice) > 0
    );

    const outstanding = outstandingInvoices.reduce(
      (sum, invoice) => sum + invoiceOutstanding(invoice),
      0
    );

    const pendingQuotations = data.quotations.filter(
      (quotation) =>
        normalizeStatus(quotation.estado) === "pendiente" &&
        inRange(
          quotation.fecha_emision || quotation.created_at,
          periodRange.start,
          periodRange.end
        )
    );

    const pipeline = pendingQuotations.reduce(
      (sum, quotation) =>
        sum +
        Number(
          quotation.precio_total ??
            quotation.precio_base ??
            0
        ),
      0
    );

    const clientProfiles = data.profiles.filter(
      (profile) =>
        normalizeStatus(profile.rol) === "user"
    );

    const activeUsers = clientProfiles.filter(
      (profile) => normalizeStatus(profile.status) !== "blocked"
    ).length;

    const newUsers = clientProfiles.filter((profile) =>
      inRange(profile.created_at, periodRange.start, periodRange.end)
    ).length;

    const periodProjects = data.projects.filter((project) =>
      inRange(project.updated_at, periodRange.start, periodRange.end)
    );

    // "Proyectos activos" es un snapshot del estado actual. No se fuerza
    // artificialmente al rango temporal: el periodo se refleja mediante
    // "updatedProjectsInPeriod" si posteriormente se quiere mostrar contexto.
    const activeProjects = data.projects.filter(
      (project) => normalizeStatus(project.estado) === "activo"
    ).length;

    const pendingProjects = data.projects.filter(
      (project) => normalizeStatus(project.estado) === "pendiente"
    ).length;

    const pausedProjects = data.projects.filter(
      (project) => normalizeStatus(project.estado) === "pausado"
    ).length;

    const completedProjects = data.projects.filter((project) =>
      ["entregado", "completado"].includes(
        normalizeStatus(project.estado)
      )
    ).length;

    const openTickets = data.tickets.filter(isOpenTicket);
    const highPriorityTickets = openTickets.filter(isHighPriority);

    const activeContracts = data.contracts.filter(
      (contract) => normalizeStatus(contract.estado) === "activo"
    );

    const pendingChanges = data.changeRequests.filter(
      (request) => normalizeStatus(request.status) === "pending"
    ).length;

    const newAudits = data.auditRequests.filter(
      (request) =>
        normalizeStatus(request.estado) === "nuevo" &&
        inRange(request.created_at, periodRange.start, periodRange.end)
    ).length;

    const automationErrors = data.automationRuns.filter(
      (run) =>
        normalizeStatus(run.estado) === "error" &&
        inRange(run.created_at, periodRange.start, periodRange.end)
    ).length;

    const overdueInvoices = data.invoices.filter((invoice) => {
      const due = toDate(invoice.fecha_vencimiento);
      return Boolean(
        due &&
          isBefore(due, now) &&
          !isPaidInvoice(invoice) &&
          !isCancelledInvoice(invoice)
      );
    });

    const overdueAmount = overdueInvoices.reduce(
      (sum, invoice) => sum + invoiceOutstanding(invoice),
      0
    );

    const overdueMilestones = data.milestones.filter((milestone) => {
      const due = toDate(milestone.fecha_prevista);
      return Boolean(
        due &&
          isBefore(due, now) &&
          !isCompletedMilestone(milestone)
      );
    });

    const affectedMilestoneProjects = new Set(
      overdueMilestones
        .map((milestone) => milestone.project_id)
        .filter(Boolean)
    ).size;

    const activeContractsValue = activeContracts.reduce(
      (sum, contract) => sum + monthlyContractValue(contract),
      0
    );

    return {
      billedNet,
      billedGross,
      collected,
      outstanding,
      outstandingInvoiceCount: outstandingInvoices.length,
      pipeline,
      pipelineCount: pendingQuotations.length,
      activeUsers,
      newUsers,
      activeProjects,
      pendingProjects,
      pausedProjects,
      completedProjects,
      updatedProjectsInPeriod: periodProjects.length,
      openTickets: openTickets.length,
      highPriorityTickets: highPriorityTickets.length,
      activeContracts: activeContracts.length,
      activeContractsValue,
      pendingChanges,
      newAudits,
      automationErrors,
      overdueInvoices,
      overdueAmount,
      overdueMilestones,
      affectedMilestoneProjects,
    };
  }, [
    data.auditRequests,
    data.changeRequests,
    data.contracts,
    data.invoices,
    data.payments,
    data.profiles,
    data.projects,
    data.quotations,
    data.tickets,
    data.milestones,
    data.automationRuns,
    now,
    periodRange,
  ]);

  const chartData = useMemo(() => {
    const requestedGranularity =
      chartGranularity === "auto"
        ? getAutoGranularity(periodRange.start, periodRange.end)
        : chartGranularity;

    const firstBucket = startOfBucket(
      periodRange.start,
      requestedGranularity
    );

    const buckets: Array<{
      label: string;
      collected: number;
      date: Date;
    }> = [];

    let cursor = firstBucket;
    let guard = 0;

    while (
      cursor <= periodRange.end &&
      guard < 100
    ) {
      const bucketStart = cursor;
      const bucketEnd = nextBucket(
        cursor,
        requestedGranularity
      );

      const collected = data.payments
        .filter(
          (payment) =>
            paymentIsSuccessful(payment) &&
            inRange(
              payment.paid_at || payment.created_at,
              bucketStart < periodRange.start
                ? periodRange.start
                : bucketStart,
              bucketEnd > periodRange.end
                ? periodRange.end
                : bucketEnd
            )
        )
        .reduce(
          (sum, payment) =>
            sum + paymentAmountInEuros(payment),
          0
        );

      buckets.push({
        date: cursor,
        label: formatBucketLabel(
          cursor,
          requestedGranularity
        ),
        collected,
      });

      cursor = bucketEnd;
      guard += 1;
    }

    return {
      granularity: requestedGranularity,
      buckets,
    };
  }, [
    chartGranularity,
    data.payments,
    periodRange,
  ]);

  const attention = useMemo(() => {
    const rows = [
      {
        key: "overdue-invoices",
        icon: CreditCard,
        title: "Facturas vencidas",
        detail: `${compactNumber.format(metrics.overdueInvoices.length)} facturas pendientes`,
        value: euro.format(metrics.overdueAmount),
        tone: "danger" as const,
        section: "invoices" as EmployeeHomeSection,
      },
      {
        key: "overdue-milestones",
        icon: Flag,
        title: "Hitos retrasados",
        detail: `${compactNumber.format(metrics.affectedMilestoneProjects)} proyectos afectados`,
        value: compactNumber.format(metrics.overdueMilestones.length),
        tone: "warning" as const,
        section: "projects" as EmployeeHomeSection,
      },
      {
        key: "company-changes",
        icon: Building2,
        title: "Cambios de empresa",
        detail: "Solicitudes pendientes",
        value: compactNumber.format(metrics.pendingChanges),
        tone: "warning" as const,
        section: "companyChanges" as EmployeeHomeSection,
      },
      {
        key: "automation-errors",
        icon: Zap,
        title: "Automatizaciones con errores",
        detail: "Ejecuciones con error en el periodo",
        value: compactNumber.format(metrics.automationErrors),
        tone: "danger" as const,
        section: "automationRuns" as EmployeeHomeSection,
      },
      {
        key: "audit-requests",
        icon: FileText,
        title: "Nuevas auditorías",
        detail: "Solicitudes con estado nuevo",
        value: compactNumber.format(metrics.newAudits),
        tone: "neutral" as const,
        section: "audits" as EmployeeHomeSection,
      },
    ];

    // Se muestran siempre las categorías principales, incluso cuando el
    // contador es 0. Así el worker tiene una lectura estable del centro
    // operativo y no desaparecen categorías por el formato monetario.
    return rows;
  }, [metrics]);

  const latestActivity = useMemo(
    () => data.activity.slice(0, 5),
    [data.activity]
  );

  const allUpcomingEvents = useMemo<UpcomingEvent[]>(() => {
    const today = startOfDay(now);
    const events: UpcomingEvent[] = [];

    data.invoices.forEach((invoice) => {
      const date = toDate(invoice.fecha_vencimiento);
      if (
        !date ||
        date < today ||
        isPaidInvoice(invoice) ||
        isCancelledInvoice(invoice)
      ) {
        return;
      }

      const companyName = invoice.company_id
        ? companyById.get(invoice.company_id)?.company_name
        : null;

      events.push({
        id: `invoice-${invoice.id}`,
        kind: "invoice",
        title: safeText(invoice.numero_factura, "Factura pendiente"),
        subtitle: `${safeText(companyName, "Empresa")} · ${daysUntilLabel(date)}`,
        date,
        value: invoiceOutstanding(invoice),
        section: "invoices",
      });
    });

    data.projects.forEach((project) => {
      const date = toDate(project.fecha_fin);
      if (
        !date ||
        date < today ||
        !["activo", "pendiente", "pausado"].includes(
          normalizeStatus(project.estado)
        )
      ) {
        return;
      }

      events.push({
        id: `project-${project.id}`,
        kind: "project",
        title: safeText(project.nombre, "Proyecto"),
        subtitle: `Finaliza · ${daysUntilLabel(date)}`,
        date,
        section: "projects",
      });
    });

    data.quotations.forEach((quotation) => {
      const date = toDate(quotation.fecha_validez);
      if (
        !date ||
        date < today ||
        normalizeStatus(quotation.estado) !== "pendiente"
      ) {
        return;
      }

      events.push({
        id: `quotation-${quotation.id}`,
        kind: "quotation",
        title: safeText(
          quotation.numero_presupuesto,
          safeText(quotation.titulo, "Presupuesto")
        ),
        subtitle: `Caduca · ${daysUntilLabel(date)}`,
        date,
        value: Number(
          quotation.precio_total ?? quotation.precio_base ?? 0
        ),
        section: "quotations",
      });
    });

    data.milestones.forEach((milestone) => {
      const date = toDate(milestone.fecha_prevista);
      if (!date || date < today || isCompletedMilestone(milestone)) {
        return;
      }

      const project = milestone.project_id
        ? projectById.get(milestone.project_id)
        : null;

      events.push({
        id: `milestone-${milestone.id}`,
        kind: "milestone",
        title: safeText(milestone.nombre, "Hito"),
        subtitle: `${safeText(project?.nombre, "Proyecto")} · ${daysUntilLabel(date)}`,
        date,
        section: "projects",
      });
    });

    data.contracts.forEach((contract) => {
      const date = toDate(contract.fecha_fin);
      if (
        !date ||
        date < today ||
        !["activo", "pausado"].includes(normalizeStatus(contract.estado))
      ) {
        return;
      }

      events.push({
        id: `contract-${contract.id}`,
        kind: "contract",
        title: safeText(contract.nombre_plan, "Contrato de mantenimiento"),
        subtitle: `Finaliza · ${daysUntilLabel(date)}`,
        date,
        value: Number(contract.precio ?? 0),
        section: "maintenance",
      });
    });

    return events.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [
    companyById,
    data.contracts,
    data.invoices,
    data.milestones,
    data.projects,
    data.quotations,
    now,
    projectById,
  ]);

  const upcomingEvents = useMemo(() => {
    const today = startOfDay(now);
    const limit = addDays(today, 3);

    const priority: Record<
      "invoice" | "project" | "quotation" | "milestone",
      number
    > = {
      invoice: 0,
      project: 1,
      quotation: 2,
      milestone: 3,
    };

    return allUpcomingEvents
      .filter(
        (event) =>
          event.date <= limit &&
          event.kind !== "contract"
      )
      .sort((a, b) => {
        const priorityDifference =
          priority[a.kind as keyof typeof priority] -
          priority[b.kind as keyof typeof priority];

        if (priorityDifference !== 0) return priorityDifference;
        return a.date.getTime() - b.date.getTime();
      })
      .slice(0, 8);
  }, [allUpcomingEvents, now]);

  const calendarDays = useMemo(() => {
    const firstDay = startOfMonth(calendarMonth);
    const offset = firstDay.getDay();
    const firstCell = addDays(firstDay, -offset);

    return Array.from({ length: 42 }, (_, index) =>
      addDays(firstCell, index)
    );
  }, [calendarMonth]);

  const selectedCalendarEvents = useMemo(
    () =>
      allUpcomingEvents.filter(
        (event) =>
          format(event.date, "yyyy-MM-dd") ===
          format(calendarSelectedDay, "yyyy-MM-dd")
      ),
    [allUpcomingEvents, calendarSelectedDay]
  );

  const greeting = useMemo(() => {
    const hour = now.getHours();
    if (hour < 12) return "Buenos días";
    if (hour < 19) return "Buenas tardes";
    return "Buenas noches";
  }, [now]);

  const firstName = useMemo(() => {
    const value = data.workerName.trim();
    return value ? value.split(/\s+/)[0] : "equipo";
  }, [data.workerName]);

  const handlePeriodChange = useCallback(
    (nextPeriod: DashboardPeriod) => {
      setPeriod(nextPeriod);
      setPeriodMenuOpen(false);

      if (nextPeriod !== "custom") {
        setCustomStart(null);
        setCustomEnd(null);
      }
    },
    []
  );

  const customStartValue = customStart
    ? format(customStart, "yyyy-MM-dd")
    : "";

  const customEndValue = customEnd
    ? format(customEnd, "yyyy-MM-dd")
    : "";

  return (
    <div className="min-h-screen bg-white text-[#172033]">
      {menuOpen ? (
        <div
          className="fixed inset-0 z-40 bg-[#172033]/20 backdrop-blur-[1px]"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[86vw] flex-col border-r border-[#E6E9EE] bg-white transition-transform duration-200 ease-out ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!menuOpen}
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
            onClick={() => setMenuOpen(false)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#7B8594] transition-colors hover:bg-[#F6F7F9] hover:text-[#172033]"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" strokeWidth={1.7} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-5">
          <div className="space-y-6">
            <MenuGroup
              title="Principal"
              items={[
                {
                  id: "dashboard",
                  label: "Dashboard",
                  icon: BarChart3,
                },
              ]}
              active="dashboard"
              onNavigate={(id) => {
                navigate(id);
                setMenuOpen(false);
              }}
            />

            <MenuGroup
              title="Gestión"
              items={[
                { id: "projects", label: "Proyectos", icon: FolderKanban },
                { id: "companies", label: "Empresas", icon: Building2 },
                { id: "quotations", label: "Presupuestos", icon: FileText },
                { id: "invoices", label: "Facturación", icon: CreditCard },
                { id: "payments", label: "Pagos", icon: CircleDollarSign },
                { id: "support", label: "Tickets", icon: Ticket },
              ]}
              onNavigate={(id) => {
                navigate(id);
                setMenuOpen(false);
              }}
            />

            <MenuGroup
              title="Comunicación"
              items={[
                { id: "ai", label: "Conversaciones IA", icon: Zap },
                { id: "notifications", label: "Notificaciones", icon: Bell },
              ]}
              onNavigate={(id) => {
                navigate(id);
                setMenuOpen(false);
              }}
            />

            <MenuGroup
              title="Operaciones"
              items={[
                { id: "activity", label: "Actividad", icon: Activity },
                { id: "audits", label: "Auditorías", icon: FileText },
                {
                  id: "companyChanges",
                  label: "Cambios de empresa",
                  icon: Building2,
                },
                {
                  id: "maintenance",
                  label: "Contratos de mantenimiento",
                  icon: CalendarDays,
                },
              ]}
              onNavigate={(id) => {
                navigate(id);
                setMenuOpen(false);
              }}
            />

            <MenuGroup
              title="Automatización"
              items={[
                { id: "automations", label: "Automatizaciones", icon: Zap },
                {
                  id: "automationRuns",
                  label: "Ejecuciones",
                  icon: RefreshCw,
                },
              ]}
              onNavigate={(id) => {
                navigate(id);
                setMenuOpen(false);
              }}
            />
          </div>
        </nav>

        <div className="border-t border-[#EEF1F4] px-6 py-5">
          <p className="text-xs text-[#8A94A4]">
            Sesión de trabajador interno
          </p>
          <p className="mt-1 truncate text-sm font-medium text-[#344154]">
            {data.workerName || "Trabajador"}
          </p>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-[1500px] px-5 pb-12 pt-5 sm:px-7 lg:px-10 xl:px-12">
        <header className="flex min-h-[52px] items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#5F6B7C] transition-colors hover:bg-[#F5F7F9] hover:text-[#172033]"
              aria-label="Abrir menú de navegación"
            >
              <Menu className="h-5 w-5" strokeWidth={1.7} />
            </button>

            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-[#263044]">
                Dashboard
              </p>
              <p className="text-xs text-[#939CAA]">
                Centro de operaciones
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div ref={newRef} className="relative">
              <button
                type="button"
                onClick={() => setNewMenuOpen((value) => !value)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#DDE2E8] px-3.5 text-sm font-medium text-[#344154] transition-colors hover:bg-[#F8F9FA]"
              >
                Nuevo
                <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.8} />
              </button>

              {newMenuOpen ? (
                <div className="absolute right-0 top-12 z-30 w-48 rounded-xl border border-[#E1E5EA] bg-white p-1.5">
                  <NewMenuItem
                    icon={FileText}
                    label="Presupuesto"
                    onClick={() => triggerNew("quotation")}
                  />
                  <NewMenuItem
                    icon={FolderKanban}
                    label="Proyecto"
                    onClick={() => triggerNew("project")}
                  />
                  <NewMenuItem
                    icon={CreditCard}
                    label="Factura"
                    onClick={() => triggerNew("invoice")}
                  />
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => void loadDashboard(true)}
              disabled={refreshing}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#7A8595] transition-colors hover:bg-[#F5F7F9] hover:text-[#344154] disabled:cursor-wait disabled:opacity-60"
              aria-label="Actualizar dashboard"
              title="Actualizar"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                strokeWidth={1.7}
              />
            </button>

            <div className="hidden h-9 w-9 items-center justify-center rounded-full bg-[#F0F2F5] text-xs font-semibold text-[#566173] sm:flex">
              {firstName.slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>

        <section className="mt-5">
          <div className="flex flex-col gap-5 border-b border-[#E9ECF0] pb-7 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium text-[#7C8797]">
                {greeting}, {firstName}
              </p>
              <h1 className="mt-1.5 text-[28px] font-semibold tracking-[-0.04em] text-[#172033] sm:text-[32px]">
                Estado general de Modira
              </h1>
            </div>

            <div ref={periodRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setPeriodMenuOpen((value) => !value)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#DDE2E8] bg-white px-3.5 text-sm font-medium text-[#344154]"
              >
                <Clock3 className="h-4 w-4 text-[#7C8797]" strokeWidth={1.7} />
                {periodRange.label}
                <ChevronDown
                  className="h-3.5 w-3.5 text-[#8A94A3]"
                  strokeWidth={1.8}
                />
              </button>

              {periodMenuOpen ? (
                <div className="absolute right-0 top-12 z-30 w-56 rounded-xl border border-[#E1E5EA] bg-white p-1.5">
                  {(
                    [
                      "today",
                      "7d",
                      "30d",
                      "month",
                      "previousMonth",
                      "quarter",
                      "year",
                      "custom",
                    ] as DashboardPeriod[]
                  ).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handlePeriodChange(option)}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                        period === option
                          ? "bg-[#F5F7F9] font-medium text-[#172033]"
                          : "text-[#596577] hover:bg-[#F8F9FA]"
                      }`}
                    >
                      <span>{periodLabels[option]}</span>
                      {period === option ? (
                        <CheckCircle2
                          className="h-3.5 w-3.5 text-[#667386]"
                          strokeWidth={1.8}
                        />
                      ) : null}
                    </button>
                  ))}

                  {period === "custom" ? (
                    <div className="mt-1 border-t border-[#EEF1F4] p-2">
                      <label className="block text-[11px] font-medium text-[#7D8797]">
                        Desde
                      </label>
                      <input
                        type="date"
                        value={customStartValue}
                        onChange={(event) => {
                          const next = toDate(event.target.value);
                          if (next) setCustomStart(startOfDay(next));
                        }}
                        className="mt-1 h-9 w-full rounded-lg border border-[#DDE2E8] bg-white px-2.5 text-xs text-[#344154] outline-none focus:border-[#B9C2CF]"
                      />

                      <label className="mt-3 block text-[11px] font-medium text-[#7D8797]">
                        Hasta
                      </label>
                      <input
                        type="date"
                        value={customEndValue}
                        onChange={(event) => {
                          const next = toDate(event.target.value);
                          if (next) setCustomEnd(endOfDay(next));
                        }}
                        className="mt-1 h-9 w-full rounded-lg border border-[#DDE2E8] bg-white px-2.5 text-xs text-[#344154] outline-none focus:border-[#B9C2CF]"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {errors.length > 0 ? (
          <div className="mt-5 flex items-start gap-2 border-b border-[#F0E2D2] pb-4 text-xs text-[#8C6A3E]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.7} />
            <span>
              Algunos bloques no han podido actualizarse: {errors.join(", ")}.
            </span>
          </div>
        ) : null}

        <section className="mt-6">
          <div className="overflow-hidden rounded-xl border border-[#E2E6EB]">
            <div className="grid divide-y divide-[#E8EBEF] sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
              {loading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="px-5 py-5 sm:px-6">
                    <SkeletonBlock className="h-4 w-28" />
                    <SkeletonBlock className="mt-4 h-8 w-32" />
                    <SkeletonBlock className="mt-2 h-3 w-40" />
                  </div>
                ))
              ) : (
                <>
                  <PrimaryMetric
                    icon={CircleDollarSign}
                    label="Ingresos cobrados"
                    value={euro.format(metrics.collected)}
                    detail="Pagos Stripe con estado succeeded"
                    onClick={() => navigate("payments")}
                  />
                  <PrimaryMetric
  icon={BarChart3}
  label="Facturación neta"
  value={euro.format(metrics.billedNet)}
  detail={`Bruto con IVA · ${euro.format(metrics.billedGross)}`}
  onClick={() => navigate("invoices")}
/>
                  <PrimaryMetric
                    icon={CreditCard}
                    label="Pendiente de cobro"
                    value={euro.format(metrics.outstanding)}
                    detail={`${compactNumber.format(metrics.outstandingInvoiceCount)} facturas pendientes`}
                    onClick={() => navigate("invoices")}
                  />
                  <PrimaryMetric
                    icon={FileText}
                    label="Pipeline comercial"
                    value={euro.format(metrics.pipeline)}
                    detail={`${compactNumber.format(metrics.pipelineCount)} presupuestos pendientes`}
                    onClick={() => navigate("quotations")}
                  />
                </>
              )}
            </div>
          </div>
        </section>

        <section className="mt-3">
          <div className="grid border-t border-[#E8EBEF] sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-[#E8EBEF]">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="py-4 sm:px-5">
                  <SkeletonBlock className="h-4 w-20" />
                  <SkeletonBlock className="mt-2 h-7 w-14" />
                  <SkeletonBlock className="mt-1 h-3 w-28" />
                </div>
              ))
            ) : (
              <>
                <SecondaryMetric
                  icon={BriefcaseBusiness}
                  label="Usuarios"
                  value={compactNumber.format(metrics.activeUsers)}
                  detail={`+${compactNumber.format(metrics.newUsers)} en el periodo`}
                />
                <SecondaryMetric
                  icon={FolderKanban}
                  label="Proyectos activos"
                  value={compactNumber.format(metrics.activeProjects)}
                  detail={`${metrics.pendingProjects} pendientes · ${metrics.pausedProjects} pausados · ${metrics.completedProjects} completados`}
                />
                <SecondaryMetric
                  icon={Ticket}
                  label="Tickets abiertos"
                  value={compactNumber.format(metrics.openTickets)}
                  detail={`${metrics.highPriorityTickets} alta prioridad`}
                />
                <SecondaryMetric
                  icon={CalendarDays}
                  label="Contratos activos"
                  value={compactNumber.format(metrics.activeContracts)}
                  detail={`${euro.format(metrics.activeContractsValue)}/mes equivalente`}
                />
              </>
            )}
          </div>
        </section>

        <section className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.8fr)_minmax(330px,0.85fr)]">
          <div className="min-w-0">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8A93A3]">
                  Cobros
                </p>
                <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.015em] text-[#172033]">
                  Ingresos cobrados
                </h2>
              </div>

              <div ref={chartRef} className="relative">
                <button
                  type="button"
                  onClick={() => setChartMenuOpen((value) => !value)}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#E0E4E9] px-3 text-xs font-medium text-[#566274]"
                >
                  {chartGranularityLabels[chartGranularity]}
                  <ChevronDown
                    className="h-3.5 w-3.5 text-[#8E97A4]"
                    strokeWidth={1.8}
                  />
                </button>

                {chartMenuOpen ? (
                  <div className="absolute right-0 top-11 z-20 w-40 rounded-xl border border-[#E1E5EA] bg-white p-1.5">
                    {(
                      ["auto", "day", "week", "month", "quarter"] as ChartGranularity[]
                    ).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          setChartGranularity(option);
                          setChartMenuOpen(false);
                        }}
                        className="flex w-full rounded-lg px-3 py-2 text-left text-xs text-[#596577] hover:bg-[#F7F8FA]"
                      >
                        {chartGranularityLabels[option]}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-4 min-h-[330px] border-y border-[#E8EBEF] py-3">
              {loading ? (
                <div className="space-y-4 px-2 py-8">
                  <SkeletonBlock className="h-3 w-full" />
                  <SkeletonBlock className="h-32 w-full" />
                  <SkeletonBlock className="h-3 w-2/3" />
                </div>
              ) : chartData.buckets.length === 0 ? (
                <div className="flex min-h-[300px] items-center justify-center text-sm text-[#8B95A4]">
                  No hay datos de cobros para el periodo seleccionado.
                </div>
              ) : (
                <RevenueChart
                  buckets={chartData.buckets}
                  granularity={chartData.granularity}
                />
              )}
            </div>
          </div>

          <div className="min-w-0 xl:border-l xl:border-[#E8EBEF] xl:pl-8">
            <SectionTitle title="Requiere atención" />

            <div className="mt-3 border-t border-[#E8EBEF]">
              {loading ? (
                <div className="space-y-5 py-5">
                  <SkeletonBlock className="h-9 w-full" />
                  <SkeletonBlock className="h-9 w-full" />
                  <SkeletonBlock className="h-9 w-full" />
                  <SkeletonBlock className="h-9 w-full" />
                </div>
              ) : attention.length === 0 ? (
                <div className="py-8">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#445165]">
                    <CheckCircle2
                      className="h-4 w-4 text-[#6F7D8E]"
                      strokeWidth={1.7}
                    />
                    No hay asuntos pendientes destacados.
                  </div>
                  <p className="mt-1 pl-6 text-xs leading-5 text-[#9099A7]">
                    El estado operativo no presenta incidencias de las categorías
                    monitorizadas.
                  </p>
                </div>
              ) : (
                attention.map((row) => (
                  <div key={row.key}>
                    <AttentionRow
                      icon={row.icon}
                      title={row.title}
                      detail={row.detail}
                      value={row.value}
                      tone={row.tone}
                      onClick={() => navigate(row.section)}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.85fr)]">
          <div className="min-w-0">
            <SectionTitle
              eyebrow="Trazabilidad"
              title="Actividad reciente"
              action="Ver toda la actividad"
              onAction={() => navigate("activity")}
            />

            <div className="mt-4 border-y border-[#E8EBEF]">
              {loading ? (
                <div className="space-y-5 py-5">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div key={index}>
                      <SkeletonBlock className="h-4 w-2/3" />
                      <SkeletonBlock className="mt-2 h-3 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : latestActivity.length === 0 ? (
                <div className="py-9 text-sm text-[#8B95A4]">
                  Todavía no hay actividad registrada para mostrar.
                </div>
              ) : (
                latestActivity.map((item) => {
                  const actor = item.user_id
                    ? profileById.get(item.user_id)?.nombre
                    : null;
                  const companyName = item.company_id
                    ? companyById.get(item.company_id)?.company_name
                    : null;
                  const time = toDate(item.created_at);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigate("activity")}
                      className="group flex w-full items-center gap-4 border-b border-[#EEF1F4] py-4 text-left last:border-b-0"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-[#344154] group-hover:text-[#172033]">
                          {safeText(
                            item.description,
                            safeText(item.action, "Actividad registrada")
                          )}
                        </span>
                        <span className="mt-1 block truncate text-xs text-[#919AA8]">
                          {actor ? `${actor} · ` : ""}
                          {companyName ? `${companyName} · ` : ""}
                          {time
                            ? formatDistanceToNow(time, {
                                addSuffix: true,
                                locale: es,
                              })
                            : "Fecha no disponible"}
                        </span>
                      </span>

                      <span className="hidden items-center gap-1 text-xs font-medium text-[#8A94A2] sm:flex">
                        {item.resource_type}
                        <ArrowRight
                          className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100"
                          strokeWidth={1.7}
                        />
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="min-w-0 lg:border-l lg:border-[#E8EBEF] lg:pl-8">
            <div className="flex items-end justify-between gap-3">
              <div>
                <SectionTitle eyebrow="Seguimiento" title="Próximos vencimientos" />
                <p className="mt-1 text-xs text-[#929AAA]">
                  Fechas previstas para los próximos 3 días.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCalendarMonth(startOfMonth(now));
                  setCalendarSelectedDay(startOfDay(now));
                  setCalendarOpen(true);
                }}
                className="mb-0.5 inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-[#667285] transition-colors hover:text-[#172033]"
                title="Ver calendario"
              >
                <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.7} />
                Calendario
              </button>
            </div>

            <div className="mt-4 max-h-[360px] overflow-y-auto border-y border-[#E8EBEF] pr-1">
              {loading ? (
                <div className="space-y-5 py-5">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="py-1">
                      <SkeletonBlock className="h-4 w-3/4" />
                      <SkeletonBlock className="mt-2 h-3 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : upcomingEvents.length === 0 ? (
                <div className="py-8 text-sm text-[#8B95A4]">
                  No hay vencimientos en los próximos 3 días.
                </div>
              ) : (
                upcomingEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => navigate(event.section)}
                    className="group flex w-full items-center justify-between gap-4 border-b border-[#EEF1F4] py-3.5 text-left last:border-b-0"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            event.kind === "invoice"
                              ? "bg-[#B54747]"
                              : event.kind === "project"
                                ? "bg-[#9A6B18]"
                                : "bg-[#9AA3AF]"
                          }`}
                        />
                        <span className="truncate text-sm font-medium text-[#344154] group-hover:text-[#172033]">
                          {event.title}
                        </span>
                      </span>
                      <span className="mt-1 block truncate pl-3.5 text-xs text-[#919AA8]">
                        {event.subtitle} · {format(event.date, "d MMM", { locale: es })}
                      </span>
                    </span>

                    <span className="shrink-0 text-right">
                      {event.kind === "invoice" && event.value != null ? (
                        <span className="block text-sm font-semibold text-[#263044]">
                          {euro.format(event.value)}
                        </span>
                      ) : event.kind === "quotation" && event.value != null ? (
                        <span className="block text-xs font-medium text-[#667285]">
                          {euro.format(event.value)}
                        </span>
                      ) : (
                        <span className="block text-xs font-medium capitalize text-[#7C8797]">
                          {event.kind === "project"
                            ? "Proyecto"
                            : event.kind === "milestone"
                              ? "Hito"
                              : "Contrato"}
                        </span>
                      )}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </section>

        {calendarOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#172033]/20 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Calendario de fechas importantes"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setCalendarOpen(false);
              }
            }}
          >
            <div className="w-full max-w-4xl overflow-hidden rounded-xl border border-[#E1E5EA] bg-white">
              <div className="flex items-center justify-between gap-4 border-b border-[#E8EBEF] px-5 py-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9AA2AE]">
                    Fechas importantes
                  </p>
                  <h2 className="mt-1 text-base font-semibold capitalize text-[#263044]">
                    {format(calendarMonth, "MMMM yyyy", { locale: es })}
                  </h2>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setCalendarMonth((month) => addMonths(month, -1))
                    }
                    className="rounded-md p-2 text-[#687486] hover:bg-[#F5F6F8] hover:text-[#263044]"
                    aria-label="Mes anterior"
                  >
                    <ChevronDown
                      className="h-4 w-4 rotate-90"
                      strokeWidth={1.7}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const today = startOfDay(now);
                      setCalendarMonth(startOfMonth(today));
                      setCalendarSelectedDay(today);
                    }}
                    className="px-2.5 py-1.5 text-xs font-medium text-[#687486] hover:text-[#263044]"
                  >
                    Hoy
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCalendarMonth((month) => addMonths(month, 1))
                    }
                    className="rounded-md p-2 text-[#687486] hover:bg-[#F5F6F8] hover:text-[#263044]"
                    aria-label="Mes siguiente"
                  >
                    <ChevronDown
                      className="h-4 w-4 -rotate-90"
                      strokeWidth={1.7}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarOpen(false)}
                    className="ml-1 rounded-md p-2 text-[#687486] hover:bg-[#F5F6F8] hover:text-[#263044]"
                    aria-label="Cerrar calendario"
                  >
                    <X className="h-4 w-4" strokeWidth={1.7} />
                  </button>
                </div>
              </div>

              <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="p-5">
                  <div className="grid grid-cols-7 border-b border-[#E8EBEF] pb-2 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA2AE]">
                    {["dom", "lun", "mar", "mié", "jue", "vie", "sáb"].map(
                      (day) => (
                        <span key={day}>{day}</span>
                      )
                    )}
                  </div>

                  <div className="mt-2 grid grid-cols-7 overflow-hidden rounded-lg border border-[#E8EBEF]">
                    {calendarDays.map((day) => {
                      const dayKey = format(day, "yyyy-MM-dd");
                      const dayEvents = allUpcomingEvents.filter(
                        (event) => format(event.date, "yyyy-MM-dd") === dayKey
                      );
                      const isCurrentMonth =
                        day.getMonth() === calendarMonth.getMonth() &&
                        day.getFullYear() === calendarMonth.getFullYear();
                      const isSelected =
                        format(day, "yyyy-MM-dd") ===
                        format(calendarSelectedDay, "yyyy-MM-dd");
                      const isToday =
                        format(day, "yyyy-MM-dd") ===
                        format(now, "yyyy-MM-dd");

                      return (
                        <button
                          key={dayKey}
                          type="button"
                          onClick={() => setCalendarSelectedDay(day)}
                          className={`relative min-h-[72px] border-b border-r border-[#EEF1F4] p-2 text-left transition-colors hover:bg-[#F8F9FA] ${
                            !isCurrentMonth
                              ? "bg-[#FAFBFC] text-[#B1B8C2]"
                              : "text-[#526073]"
                          } ${isSelected ? "bg-[#F3F5F7]" : ""}`}
                        >
                          <span
                            className={`text-xs ${
                              isToday
                                ? "font-semibold text-[#172033]"
                                : "font-medium"
                            }`}
                          >
                            {format(day, "d")}
                          </span>

                          {dayEvents.length > 0 ? (
                            <span className="mt-2 flex gap-1">
                              {dayEvents.slice(0, 3).map((event) => (
                                <span
                                  key={event.id}
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    event.kind === "invoice"
                                      ? "bg-[#B54747]"
                                      : event.kind === "project"
                                        ? "bg-[#9A6B18]"
                                        : "bg-[#9AA3AF]"
                                  }`}
                                  aria-hidden="true"
                                />
                              ))}
                              {dayEvents.length > 3 ? (
                                <span className="text-[9px] text-[#8A94A2]">
                                  +{dayEvents.length - 3}
                                </span>
                              ) : null}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <aside className="border-t border-[#E8EBEF] bg-[#FCFCFD] p-5 lg:border-l lg:border-t-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9AA2AE]">
                    Seleccionado
                  </p>
                  <h3 className="mt-1 text-sm font-semibold capitalize text-[#344154]">
                    {format(calendarSelectedDay, "EEEE, d MMMM", {
                      locale: es,
                    })}
                  </h3>

                  <div className="mt-4 max-h-[340px] overflow-y-auto border-y border-[#E8EBEF]">
                    {selectedCalendarEvents.length === 0 ? (
                      <p className="py-6 text-sm leading-6 text-[#8B95A4]">
                        No hay fechas importantes registradas para este día.
                      </p>
                    ) : (
                      selectedCalendarEvents.map((event) => (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => {
                            setCalendarOpen(false);
                            navigate(event.section);
                          }}
                          className="group flex w-full items-start justify-between gap-3 border-b border-[#EEF1F4] py-3 text-left last:border-b-0"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-[#344154] group-hover:text-[#172033]">
                              {event.title}
                            </span>
                            <span className="mt-1 block text-xs text-[#8E98A6]">
                              {event.kind === "invoice"
                                ? "Factura"
                                : event.kind === "project"
                                  ? "Proyecto"
                                  : event.kind === "quotation"
                                    ? "Presupuesto"
                                    : event.kind === "milestone"
                                      ? "Hito"
                                      : "Contrato"}
                            </span>
                          </span>
                          {event.value != null ? (
                            <span className="shrink-0 text-xs font-semibold text-[#526073]">
                              {euro.format(event.value)}
                            </span>
                          ) : null}
                        </button>
                      ))
                    )}
                  </div>
                </aside>
              </div>
            </div>
          </div>
        ) : null}

        <footer className="mt-8 border-t border-[#EEF1F4] pt-5 text-xs text-[#A0A8B3]">
          Dashboard operativo · Modira
        </footer>
      </main>
    </div>
  );
}

function MenuGroup({
  title,
  items,
  active,
  onNavigate,
}: {
  title: string;
  items: Array<{
    id: EmployeeHomeSection;
    label: string;
    icon: typeof Activity;
  }>;
  active?: EmployeeHomeSection;
  onNavigate: (id: EmployeeHomeSection) => void;
}) {
  return (
    <section>
      <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9AA2AE]">
        {title}
      </p>
      <div className="mt-2 space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                isActive
                  ? "bg-[#F2F4F7] font-medium text-[#172033]"
                  : "text-[#596577] hover:bg-[#F7F8FA] hover:text-[#263044]"
              }`}
            >
              <Icon
                className="h-4 w-4 shrink-0"
                strokeWidth={isActive ? 1.9 : 1.7}
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function NewMenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof FileText;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-[#596577] hover:bg-[#F7F8FA] hover:text-[#263044]"
    >
      <Icon className="h-4 w-4 text-[#788394]" strokeWidth={1.7} />
      <span>{label}</span>
    </button>
  );
}
