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
  ListTodo,
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
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  formatDistanceToNow,
  isBefore,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
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
  created_at?: string | null;
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

type ExpenseRow = {
  id: string;
  expense_date?: string | null;
  description?: string | null;
  status?: string | null;
  currency?: string | null;
  total_amount?: number | null;
  created_at?: string | null;
};

type WorkerRow = {
  id: string;
  auth_user_id: string;
  display_name?: string | null;
  is_active?: boolean | null;
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
  plan_id?: string | null;
  nombre_plan?: string | null;
  precio?: number | null;
  periodicidad?: string | null;
  estado?: string | null;
  fecha_fin?: string | null;
};

type MaintenancePlanRow = {
  id: string;
  nombre?: string | null;
  code?: string | null;
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
  fecha_ultimo_login?: string | null;
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

type DashboardTaskMode = "internal" | "project";

type DashboardTaskRow = {
  id: string;
  title?: string | null;
  status?: string | null;
  priority?: string | null;
  progress?: number | null;
  due_at?: string | null;
  assigned_to_worker_id?: string | null;
  project_id?: string | null;
  milestone_id?: string | null;
};

type DashboardData = {
  workerName: string;
  companies: CompanyRow[];
  workers: WorkerRow[];
  projects: ProjectRow[];
  expenses: ExpenseRow[];
  quotations: QuotationRow[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  tickets: TicketRow[];
  milestones: MilestoneRow[];
  contracts: ContractRow[];
  maintenancePlans: MaintenancePlanRow[];
  changeRequests: ChangeRequestRow[];
  profiles: ProfileRow[];
  activity: ActivityRow[];
  automationRuns: AutomationRunRow[];
  customProposals: CustomProposalRow[];
  internalTasks: DashboardTaskRow[];
  projectTasks: DashboardTaskRow[];
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
          <Icon className="h-3.5 w-3.5 text-[#788496]" strokeWidth={1.8} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[#697588]">
            {label}
          </span>
        </div>
        {onClick ? (
          <ArrowRight className="h-3 w-3 text-[#A7AFBA]" strokeWidth={1.8} />
        ) : null}
      </div>
      <p className={`mt-3 text-[25px] font-semibold leading-none tracking-[-0.045em] ${valueClass}`}>
        {value}
      </p>
      <p className="mt-1.5 truncate text-[10px] leading-4 text-[#8A95A5]">{detail}</p>
    </>
  );

  if (!onClick) {
    return <div className="px-4 py-4">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full px-4 py-4 text-left transition-colors hover:bg-[#FBFCFD]"
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
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9AA3B0]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-0.5 text-[15px] font-semibold tracking-[-0.015em] text-[#18212F]">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-[11px] leading-4 text-[#8994A4]">{description}</p>
        ) : null}
      </div>
      {action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex h-7 shrink-0 items-center rounded-md border border-[#D7E8F8] bg-[#EAF5FF] px-2.5 text-[10px] font-semibold text-[#4B8FE2] transition-colors hover:bg-[#DFF0FF] hover:text-[#2F76C7]"
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}

function RevenueChart({
  buckets,
  period,
}: {
  buckets: Array<{ label: string; start: Date; end: Date; income: number; expenses: number }>;
  period: DashboardPeriod;
}) {
  const max = Math.max(
    1,
    ...buckets.flatMap((item) => [item.income, item.expenses]),
  );
  const width = 860;
  const height = 380;
  const left = 42;
  const right = 12;
  const top = 12;
  const bottom = 38;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;

  const makePoints = (key: "income" | "expenses") =>
    buckets.map((item, index) => ({
      ...item,
      value: item[key],
      x:
        buckets.length === 1
          ? left + chartWidth / 2
          : left + (index / (buckets.length - 1)) * chartWidth,
      y:
        top +
        chartHeight -
        (item[key] / max) * chartHeight,
    }));

  const incomePoints = makePoints("income");
  const expensePoints = makePoints("expenses");

  const pathFor = (points: Array<{ x: number; y: number }>) =>
    points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");

  const incomePath = pathFor(incomePoints);
  const expensePath = pathFor(expensePoints);

  const incomeArea =
    incomePoints.length > 0
      ? `${incomePath} L ${incomePoints[incomePoints.length - 1].x} ${
          top + chartHeight
        } L ${incomePoints[0].x} ${top + chartHeight} Z`
      : "";

  const expenseArea =
    expensePoints.length > 0
      ? `${expensePath} L ${expensePoints[expensePoints.length - 1].x} ${
          top + chartHeight
        } L ${expensePoints[0].x} ${top + chartHeight} Z`
      : "";

  return (
    <div className="mt-3 flex h-[425px] min-h-0 flex-col overflow-hidden">
      <div className="mb-1 flex items-center justify-end gap-4 text-[9px] text-[#7F8A9A]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#65B894]" />
          Ingresos
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#D38A8A]" />
          Gastos
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-h-0 w-full flex-1"
        role="img"
        aria-label="Evolución de ingresos y gastos"
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
                {max <= 1
                  ? (ratio === 0 ? "0" : "")
                  : max * ratio >= 1000
                    ? `${Math.round((max * ratio) / 1000)}k`
                    : Math.round(max * ratio)}
              </text>
            </g>
          );
        })}

        {incomeArea ? (
          <path d={incomeArea} fill="#65B894" fillOpacity="0.08" />
        ) : null}

        {expenseArea ? (
          <path d={expenseArea} fill="#D38A8A" fillOpacity="0.07" />
        ) : null}

        {incomePath ? (
          <path
            d={incomePath}
            fill="none"
            stroke="#65B894"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {expensePath ? (
          <path
            d={expensePath}
            fill="none"
            stroke="#D38A8A"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {incomePoints.map((point, index) => (
          <circle
            key={`income-${point.label}-${index}`}
            cx={point.x}
            cy={point.y}
            r="2.5"
            fill="white"
            stroke="#65B894"
            strokeWidth="2"
          />
        ))}

        {expensePoints.map((point, index) => (
          <circle
            key={`expense-${point.label}-${index}`}
            cx={point.x}
            cy={point.y}
            r="2.5"
            fill="white"
            stroke="#D38A8A"
            strokeWidth="2"
          />
        ))}

        {buckets
          .filter((_, index) => {
            if (buckets.length <= 8) return true;
            if (period === "year") return index % 2 === 0 || index === buckets.length - 1;
            return index === 0 || index === buckets.length - 1 || index % Math.ceil(buckets.length / 6) === 0;
          })
          .map((point) => {
            const index = buckets.indexOf(point);
            const x =
              buckets.length === 1
                ? left + chartWidth / 2
                : left + (index / (buckets.length - 1)) * chartWidth;
            const label =
              period === "year"
                ? format(point.start, "MMM", { locale: es })
                : period === "quarter"
                  ? format(point.start, "d MMM", { locale: es })
                  : point.label;

            return (
              <text
                key={`${point.label}-label`}
                x={x}
                y={height - 10}
                textAnchor="middle"
                className="fill-[#98A2AF] text-[9px]"
              >
                {label}
              </text>
            );
          })}
      </svg>
    </div>
  );
}

function ProjectStatusChart({
  counts,
}: {
  counts: Array<{
    key: string;
    label: string;
    value: number;
    color: string;
  }>;
}) {
  const total = counts.reduce((sum, item) => sum + item.value, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="mt-3 flex items-center gap-3">
      <div className="relative h-[108px] w-[108px] shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="#F0F2F4"
            strokeWidth="17"
          />
          {counts.map((item) => {
            const length =
              total > 0 ? (item.value / total) * circumference : 0;
            const currentOffset = offset;
            offset += length;
            return (
              <circle
                key={item.key}
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth="17"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-currentOffset}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[9px] text-[#8A95A5]">Total</span>
          <span className="text-[22px] font-semibold tracking-[-0.04em] text-[#18212F]">
            {number.format(total)}
          </span>
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        {counts.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-2 text-[10px]">
            <span className="flex min-w-0 items-center gap-2 text-[#596579]">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate">{item.label}</span>
            </span>
            <span className="font-semibold text-[#465368]">
              {number.format(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MaintenancePlanChart({
  counts,
}: {
  counts: Array<{ key: string; label: string; value: number; color: string }>;
}) {
  const total = counts.reduce((sum, item) => sum + item.value, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="mt-3 flex items-center gap-3">
      <div className="relative h-[108px] w-[108px] shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle cx="70" cy="70" r={radius} fill="none" stroke="#F0F2F4" strokeWidth="17" />
          {counts.map((item) => {
            const length = total > 0 ? (item.value / total) * circumference : 0;
            const currentOffset = offset;
            offset += length;
            return (
              <circle
                key={item.key}
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth="17"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-currentOffset}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[9px] text-[#8A95A5]">Activos</span>
          <span className="text-[22px] font-semibold tracking-[-0.04em] text-[#18212F]">
            {number.format(total)}
          </span>
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        {counts.length === 0 ? (
          <p className="text-[11px] text-[#8A95A5]">No hay contratos activos.</p>
        ) : (
          counts.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="flex min-w-0 items-center gap-2 text-[#596579]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="font-semibold text-[#465368]">{number.format(item.value)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function getActivityVisual(item: ActivityRow) {
  const resource = normalize(item.resource_type);
  const action = normalize(item.action);

  if (resource.includes("project") || resource.includes("milestone")) {
    return { icon: FolderKanban, bg: "bg-[#EEF5FF]", text: "text-[#4B8FE2]" };
  }
  if (resource.includes("quotation") || resource.includes("budget")) {
    return { icon: FileText, bg: "bg-[#FFF7E7]", text: "text-[#C48720]" };
  }
  if (resource.includes("invoice") || resource.includes("payment")) {
    return { icon: CreditCard, bg: "bg-[#F1EDFF]", text: "text-[#7656B5]" };
  }
  if (resource.includes("maintenance") || resource.includes("contract")) {
    return { icon: Wrench, bg: "bg-[#EAF8F3]", text: "text-[#3C9A78]" };
  }
  if (resource.includes("company") || resource.includes("fiscal")) {
    return { icon: Building2, bg: "bg-[#EEF5FF]", text: "text-[#4B8FE2]" };
  }
  if (resource.includes("client") || resource.includes("profile") || resource.includes("user")) {
    return { icon: Users, bg: "bg-[#F3F5F7]", text: "text-[#596579]" };
  }
  if (resource.includes("ticket") || resource.includes("support")) {
    return { icon: Ticket, bg: "bg-[#FFF3F0]", text: "text-[#C66D4A]" };
  }
  if (resource.includes("automation") || action.includes("automation")) {
    return { icon: Zap, bg: "bg-[#FFF8E8]", text: "text-[#B17B20]" };
  }
  if (action.includes("delete") || action.includes("reject") || action.includes("error")) {
    return { icon: AlertCircle, bg: "bg-[#FEF3F2]", text: "text-[#B42318]" };
  }
  if (action.includes("complete") || action.includes("accept") || action.includes("approve")) {
    return { icon: CheckCircle2, bg: "bg-[#EAF8F3]", text: "text-[#3C9A78]" };
  }
  return { icon: Activity, bg: "bg-[#EEF5FF]", text: "text-[#4B8FE2]" };
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
      className="group flex w-full items-center gap-2.5 border-b border-[#EEF1F4] py-2.5 text-left last:border-b-0"
    >
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tone}`}>
        <Icon className="h-3.5 w-3.5" strokeWidth={1.7} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-[#303B4D] group-hover:text-[#18212F]">
          {item.title}
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-[#8C97A6]">
          {item.description}
        </span>
      </span>
      <span className="shrink-0 text-[10px] font-semibold text-[#39465A]">
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
    workers: [],
    projects: [],
    expenses: [],
    quotations: [],
    invoices: [],
    payments: [],
    tickets: [],
    milestones: [],
    contracts: [],
    maintenancePlans: [],
    changeRequests: [],
    profiles: [],
    activity: [],
    automationRuns: [],
    customProposals: [],
    internalTasks: [],
    projectTasks: [],
  });
  const [permissions, setPermissions] = useState<Record<PermissionCode, boolean>>({
    "projects.create": false,
    "quotations.create": false,
    "invoices.create": false,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [taskMode, setTaskMode] = useState<DashboardTaskMode>("internal");
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
          workersResult,
          companiesResult,
          expensesResult,
          projectsResult,
          quotationsResult,
          invoicesResult,
          paymentsResult,
          ticketsResult,
          milestonesResult,
          contractsResult,
          maintenancePlansResult,
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
            .from("workers")
            .select("id, auth_user_id, display_name, is_active")
            .order("display_name", { ascending: true }),

          supabase
            .from("companies")
            .select("id, company_name, created_at")
            .order("company_name", { ascending: true }),

          supabase
            .from("expenses")
            .select("id, expense_date, description, status, currency, total_amount, created_at")
            .order("expense_date", { ascending: false }),

          supabase.rpc("get_worker_projects"),

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
            .select("id, company_id, plan_id, nombre_plan, precio, periodicidad, estado, fecha_fin")
            .order("fecha_fin", { ascending: true }),

          supabase
            .from("maintenance_plans")
            .select("id, nombre, code")
            .order("precio", { ascending: true, nullsFirst: false }),

          supabase.rpc("get_worker_project_change_requests"),

          supabase
            .from("profiles")
            .select("id, nombre, rol, status, fecha_ultimo_login, created_at")
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
          ["trabajadores", workersResult.error],
          ["empresas", companiesResult.error],
          ["gastos", expensesResult.error],
          ["proyectos", projectsResult.error],
          ["presupuestos", quotationsResult.error],
          ["facturas", invoicesResult.error],
          ["pagos", paymentsResult.error],
          ["tickets", ticketsResult.error],
          ["hitos", milestonesResult.error],
          ["mantenimientos", contractsResult.error],
          ["planes de mantenimiento", maintenancePlansResult.error],
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
          workerName: workerResult.data?.display_name?.trim() || profilesResult.data?.find((profile) => profile.id === user.id)?.nombre?.trim() || "Dirección",
          companies: (companiesResult.data ?? []) as CompanyRow[],
          workers: (workersResult.data ?? []) as WorkerRow[],
          expenses: (expensesResult.data ?? []) as ExpenseRow[],
          projects: (projectsResult.data ?? []) as ProjectRow[],
          quotations: (quotationsResult.data ?? []) as QuotationRow[],
          invoices: (invoicesResult.data ?? []) as InvoiceRow[],
          payments: (paymentsResult.data ?? []) as PaymentRow[],
          tickets: (ticketsResult.data ?? []) as TicketRow[],
          milestones: (milestonesResult.data ?? []) as MilestoneRow[],
          contracts: (contractsResult.data ?? []) as ContractRow[],
          maintenancePlans: (maintenancePlansResult.data ?? []) as MaintenancePlanRow[],
          changeRequests,
          profiles: (profilesResult.data ?? []) as ProfileRow[],
          activity: (activityResult.data ?? []) as ActivityRow[],
          automationRuns: (automationRunsResult.data ?? []) as AutomationRunRow[],
          customProposals: (customProposalsResult.data ?? []) as CustomProposalRow[],
          internalTasks: [],
          projectTasks: [],
        });

        // Las tareas del dashboard se limitan estrictamente al trabajador que ha
        // iniciado sesión. No reutilizamos la lista global de otros trabajadores.
        const currentWorkerId = workerResult.data?.id ?? null;
        if (currentWorkerId) {
          const [internalTasksResult, projectTasksResult] = await Promise.all([
            supabase.rpc("get_internal_tasks", {
              p_status: null,
              p_limit: 200,
              p_offset: 0,
            }),
            supabase.rpc("get_project_tasks", {
              p_project_id: null,
              p_milestone_id: null,
              p_status: null,
              p_priority: null,
              p_assigned_to_worker_id: currentWorkerId,
              p_limit: 200,
            }),
          ]);

          if (internalTasksResult.error) failed.push("tareas internas");
          if (projectTasksResult.error) failed.push("tareas de proyecto");

          setData((current) => ({
            ...current,
            internalTasks: ((internalTasksResult.data ?? []) as DashboardTaskRow[]).filter(
              (task) => task.assigned_to_worker_id === currentWorkerId,
            ),
            projectTasks: (projectTasksResult.data ?? []) as DashboardTaskRow[],
          }));
        }

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

    const pausedProjects = data.projects.filter(
      (project) => normalize(project.estado) === "pausado",
    ).length;

    const completedProjects = data.projects.filter(
      (project) => normalize(project.estado) === "completado",
    ).length;

    const pendingProjects = data.projects.filter(
      (project) => normalize(project.estado) === "pendiente",
    ).length;

    const dashboardProjects = activeProjects + pausedProjects + completedProjects;

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

    const periodClients = data.profiles.filter(
      (profile) =>
        normalize(profile.rol) === "user" &&
        inPeriod(profile.created_at, range.start, range.end),
    ).length;

    const newClients = periodClients;

    const periodProjects = data.projects.filter((project) =>
      inPeriod(project.created_at ?? project.updated_at, range.start, range.end),
    ).length;

    const periodQuotations = data.quotations.filter((quotation) =>
      inPeriod(quotation.fecha_emision ?? quotation.created_at, range.start, range.end),
    );

    const periodPaidInvoices = periodInvoices.filter(isPaidInvoice).length;

    const periodPendingQuotations = periodQuotations.filter(
      (quotation) => normalize(quotation.estado) === "pendiente",
    ).length;

    const newActiveProjects = data.projects.filter(
      (project) =>
        normalize(project.estado) === "activo" &&
        inPeriod(project.updated_at, range.start, range.end),
    ).length;

    const pendingCustomProposals = data.customProposals.filter((proposal) =>
      ["submitted", "in_review", "quoted"].includes(normalize(proposal.status)),
    ).length;

    const projectStatusCounts = [
      { key: "activo", label: "Activo", value: data.projects.filter((project) => normalize(project.estado) === "activo").length, color: "#4FB48B" },
      { key: "pendiente", label: "Pendiente", value: data.projects.filter((project) => normalize(project.estado) === "pendiente").length, color: "#8A95A5" },
      { key: "pausado", label: "Pausado", value: data.projects.filter((project) => normalize(project.estado) === "pausado").length, color: "#E7A63C" },
      { key: "entregado", label: "Entregado", value: data.projects.filter((project) => normalize(project.estado) === "entregado").length, color: "#4A90E2" },
    ];

    const activeMaintenanceContracts = data.contracts.filter(
      (contract) => normalize(contract.estado) === "activo",
    );

    const maintenancePlanMap = new Map<string, { key: string; label: string; value: number }>();
    activeMaintenanceContracts.forEach((contract) => {
      const plan = contract.plan_id
        ? data.maintenancePlans.find((item) => item.id === contract.plan_id)
        : null;
      const key = contract.plan_id || normalize(contract.nombre_plan) || contract.id;
      const label = plan?.nombre || contract.nombre_plan || plan?.code || "Plan sin identificar";
      const previous = maintenancePlanMap.get(key);
      maintenancePlanMap.set(key, {
        key,
        label,
        value: (previous?.value ?? 0) + 1,
      });
    });

    const maintenancePlanCounts = Array.from(maintenancePlanMap.values()).map((item, index) => ({
      key: item.key,
      label: item.label,
      value: item.value,
      color: ["#7B61B8", "#D68B42", "#3C9A78", "#C75B69"][index % 4],
    }));

    return {
      collected,
      billed,
      outstanding,
      outstandingCount: outstandingInvoices.length,
      pipeline,
      pipelineCount: pendingQuotations.length,
      activeProjects,
      pausedProjects,
      completedProjects,
      dashboardProjects,
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
      periodClients,
      newClients,
      periodProjects,
      pendingCustomProposals,
      periodQuotations,
      periodInvoices,
      periodPaidInvoices,
      periodPendingQuotations,
      newActiveProjects,
      projectStatusCounts,
      maintenancePlanCounts,
    };
  }, [data, now, range]);

  const revenueBuckets = useMemo(() => {
    const buckets: Array<{
      label: string;
      start: Date;
      end: Date;
      income: number;
      expenses: number;
    }> = [];

    const addBucket = (label: string, start: Date, end: Date) => {
      const income = data.payments
        .filter(
          (payment) =>
            isSuccessfulPayment(payment) &&
            inPeriod(payment.paid_at ?? payment.created_at, start, end),
        )
        .reduce((sum, payment) => sum + paymentInEuros(payment), 0);

      const expenses = data.expenses
        .filter(
          (expense) =>
            normalize(expense.currency) === "eur" &&
            !["cancelled", "cancelada", "canceled"].includes(normalize(expense.status)) &&
            inPeriod(expense.expense_date ?? expense.created_at, start, end),
        )
        .reduce((sum, expense) => sum + Number(expense.total_amount ?? 0), 0);

      buckets.push({ label, start, end, income, expenses });
    };

    const addDailyBuckets = () => {
      let cursor = range.start;
      while (cursor <= range.end) {
        const bucketEnd = endOfDay(cursor) > range.end ? range.end : endOfDay(cursor);
        addBucket(format(cursor, "d MMM", { locale: es }), cursor, bucketEnd);
        cursor = addDays(cursor, 1);
      }
    };

    if (period === "today") {
      addBucket("Hoy", range.start, range.end);
    } else if (period === "7d") {
      addDailyBuckets();
    } else if (period === "30d") {
      addDailyBuckets();
    } else if (period === "month" || period === "previousMonth") {
      let cursor = startOfWeek(range.start, { weekStartsOn: 1 });
      while (cursor <= range.end) {
        const start = cursor < range.start ? range.start : cursor;
        const end = endOfWeek(cursor, { weekStartsOn: 1 }) > range.end ? range.end : endOfWeek(cursor, { weekStartsOn: 1 });
        addBucket(format(start, "d MMM", { locale: es }), start, end);
        cursor = addWeeks(cursor, 1);
      }
    } else {
      // Trimestre y año: un punto por mes, empezando siempre en el día 1.
      let cursor = startOfMonth(range.start);
      while (cursor <= range.end) {
        const monthEnd = endOfMonth(cursor);
        const start = cursor < range.start ? range.start : cursor;
        const end = monthEnd > range.end ? range.end : monthEnd;
        addBucket(format(cursor, "d MMM", { locale: es }), start, end);
        cursor = addMonths(cursor, 1);
      }
    }

    return buckets;
  }, [data.expenses, data.payments, period, range]);

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

  const dashboardTasks = useMemo(() => {
    const source = taskMode === "internal" ? data.internalTasks : data.projectTasks;
    return [...source]
      .filter((task) => !["completed", "cancelled"].includes(normalize(task.status)))
      .sort((a, b) => {
        const aDue = dateOf(a.due_at)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bDue = dateOf(b.due_at)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return aDue - bDue;
      })
      .slice(0, 5);
  }, [data.internalTasks, data.projectTasks, taskMode]);

  const currentProfile = useMemo(
    () => data.profiles.find((profile) => profile.id === user?.id),
    [data.profiles, user?.id],
  );

  const workerByAuthId = useMemo(
    () =>
      new Map(
        data.workers.map((worker) => [
          worker.auth_user_id,
          shortText(worker.display_name, "Trabajador"),
        ]),
      ),
    [data.workers],
  );

  const latestActivity = useMemo(() => {
    const lastLogin = dateOf(currentProfile?.fecha_ultimo_login);
    const workerIds = new Set(
      data.workers
        .filter((worker) => worker.is_active !== false)
        .map((worker) => worker.auth_user_id),
    );

    return data.activity
      .filter((item) => workerIds.has(item.user_id ?? ""))
      .filter((item) => {
        if (!lastLogin) return true;
        return new Date(item.created_at) >= lastLogin;
      })
      .slice(0, 5);
  }, [currentProfile?.fecha_ultimo_login, data.activity, data.workers]);

  const firstName = useMemo(() => {
    const clean = data.workerName.trim();
    return clean ? clean.split(/\s+/)[0] : "Dirección";
  }, [data.workerName]);

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#18212F]">
      <main className="mx-auto w-full max-w-[1240px] px-5 pb-10 pt-6 sm:px-6">
        <header className="relative flex min-h-[42px] items-center justify-between gap-4">
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
            <h1 className="text-[21px] font-semibold leading-tight tracking-[-0.04em] text-[#18212F]">
              Resumen global
            </h1>
            <p className="mt-0.5 text-[11px] text-[#7F8A9A]">
              Visión completa de actividad de Modira
            </p>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/employee/notifications")}
              className="relative mr-1 flex h-8 w-8 items-center justify-center rounded-full text-[#5E6B7D] transition hover:bg-white"
              aria-label="Notificaciones"
              title="Notificaciones"
            >
              <Bell className="h-4 w-4" strokeWidth={1.7} />
              {metrics.pendingChanges + metrics.highPriorityTickets > 0 ? (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#D95C65]" />
              ) : null}
            </button>

            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1F356D] text-[11px] font-bold text-white">
                {firstName.slice(0, 1).toUpperCase()}
              </span>
              <div className="leading-tight">
                <p className="text-[11px] font-semibold text-[#354154]">
                  {data.workerName || "Dirección"}
                </p>
                <p className="mt-0.5 text-[10px] text-[#8A95A5]">Dirección</p>
              </div>
            </div>
          </div>
        </header>

        <div className="mt-3 flex justify-end">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setPeriodOpen((value) => !value)}
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-[#E0E4E9] bg-white px-3 text-[10px] font-semibold text-[#4D5A6D] shadow-[0_1px_2px_rgba(16,24,40,0.02)]"
            >
              {periodLabels[period]}
              <ChevronDown className="h-3.5 w-3.5 text-[#9099A7]" strokeWidth={1.8} />
            </button>

            {periodOpen ? (
              <div className="absolute right-0 top-11 z-30 w-48 rounded-xl border border-[#E1E5EA] bg-white p-1.5 shadow-[0_12px_35px_rgba(20,28,40,0.12)]">
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

        <section className="mt-4 grid gap-2" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
          <div className="overflow-hidden rounded-xl border border-[#D7E8F8] bg-[#EAF5FF]">
            <MetricCard
              icon={Users}
              label="Clientes"
              value={number.format(metrics.periodClients)}
              detail={`${number.format(metrics.activeClients)} activos actualmente`}
              onClick={() => navigate("/employee/clients")}
              accent="default"
            />
          </div>
          <div className="overflow-hidden rounded-xl border border-[#D6EEE4] bg-[#E9F8F1]">
            <MetricCard
              icon={FolderKanban}
              label="Proyectos"
              value={number.format(metrics.dashboardProjects)}
              detail={`${number.format(metrics.pendingProjects)} pendientes`}
              onClick={() => navigate("/employee/projects")}
              accent="success"
            />
          </div>
          <div className="overflow-hidden rounded-xl border border-[#F4E5C5] bg-[#FFF7E7]">
            <MetricCard
              icon={FileText}
              label="Presupuestos"
              value={number.format(metrics.periodQuotations.length)}
              detail={`${number.format(metrics.periodPendingQuotations)} pendientes`}
              onClick={() => navigate("/employee/quotations")}
              accent="default"
            />
          </div>
          <div className="overflow-hidden rounded-xl border border-[#E1D9F5] bg-[#F1EDFF]">
            <MetricCard
              icon={CreditCard}
              label="Facturas"
              value={number.format(metrics.periodInvoices.length)}
              detail={`${number.format(metrics.periodPaidInvoices)} pagadas`}
              onClick={() => navigate("/employee/billing")}
              accent="default"
            />
          </div>
          <div className="overflow-hidden rounded-xl border border-[#D6EEE4] bg-[#E9F8F1]">
            <MetricCard
              icon={CircleDollarSign}
              label="Ingresos"
              value={euro.format(metrics.collected)}
              detail={`${periodLabels[period]} · cobros confirmados`}
              onClick={() => navigate("/employee/billing")}
              accent="success"
            />
          </div>
        </section>

        <section className="mt-3 grid items-stretch gap-2.5" style={{ gridTemplateColumns: "1.48fr 0.82fr 0.90fr" }}>
          <div className="h-[490px] overflow-hidden rounded-[10px] border border-[#E1E5EA] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#96A0AE]">
                  Rendimiento económico
                </p>
                <h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-[#18212F]">
                  Evolución de ingresos y gastos
                </h2>
              </div>
              <button
                type="button"
                onClick={() => navigate("/employee/finance")}
                className="text-[11px] font-semibold text-[#4B8FE2] transition-colors hover:text-[#2F76C7]"
              >
                Ver detalle
              </button>
            </div>

            <div className="mt-1.5 border-t border-[#EEF1F4] pt-1">
              {loading ? (
                <div className="flex min-h-[220px] items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-[#8994A4]" />
                </div>
              ) : revenueBuckets.length === 0 ? (
                <div className="flex min-h-[220px] items-center justify-center text-[10px] text-[#8B95A4]">
                  No hay datos para el periodo seleccionado.
                </div>
              ) : (
                <RevenueChart buckets={revenueBuckets} period={period} />
              )}
            </div>
          </div>

          <div className="h-[490px] overflow-hidden rounded-[10px] border border-[#E1E5EA] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#96A0AE]">
                Proyectos
              </p>
              <h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-[#18212F]">
                Estado de proyectos
              </h2>
            </div>
            <ProjectStatusChart counts={metrics.projectStatusCounts} />

            <div className="mt-5 border-t border-[#EEF1F4] pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#96A0AE]">
                Mantenimiento
              </p>
              <h3 className="mt-1 text-[13px] font-semibold tracking-[-0.015em] text-[#18212F]">
                Planes contratados
              </h3>
              <MaintenancePlanChart counts={metrics.maintenancePlanCounts} />
            </div>
          </div>

          <div className="h-[490px] overflow-hidden rounded-[10px] border border-[#E1E5EA] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#96A0AE]">
                  Trazabilidad
                </p>
                <h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-[#18212F]">
                  Actividad reciente
                </h2>
              </div>
              <button
                type="button"
                onClick={() => navigate("/employee/activity")}
                className="text-[11px] font-semibold text-[#4B8FE2] transition-colors hover:text-[#2F76C7]"
              >
                Ver todo
              </button>
            </div>

            <div className="mt-3 border-t border-[#EEF1F4]">
              {latestActivity.length === 0 ? (
                <div className="py-7 text-sm text-[#8B95A4]">
                  No hay actividad registrada desde tu última conexión.
                </div>
              ) : (
                latestActivity.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate("/employee/activity")}
                    className="flex w-full items-center gap-2 border-b border-[#EEF1F4] py-2 text-left last:border-b-0"
                  >
                    {(() => {
                      const visual = getActivityVisual(item);
                      const Icon = visual.icon;
                      return (
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${visual.bg}`}>
                          <Icon className={`h-3.5 w-3.5 ${visual.text}`} strokeWidth={1.7} />
                        </span>
                      );
                    })()}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-[#354154]">
                        {shortText(item.description, item.action)}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-[#9099A7]">
                        {workerByAuthId.get(item.user_id ?? "") ?? "Trabajador"} ·{" "}
                        {formatDistanceToNow(new Date(item.created_at), {
                          addSuffix: true,
                          locale: es,
                        })}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="mt-3 grid gap-2.5" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <div className="rounded-[10px] border border-[#E1E5EA] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <SectionHeader
              eyebrow="Control ejecutivo"
              title="Requiere atención"
              description="Elementos que pueden requerir una decisión o seguimiento."
            />
            <div className="mt-3 border-t border-[#EEF1F4]">
              {alerts.map((item) => (
                <div key={item.id}>
                  <AlertRow item={item} onClick={() => navigate(item.route)} />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[10px] border border-[#E1E5EA] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <SectionHeader
              eyebrow="Trabajo pendiente"
              title="Tareas"
              description="Solo tareas asignadas a la cuenta que ha iniciado sesión."
            />

            <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#EEF1F4] pt-3">
              <div className="flex rounded-lg bg-[#F4F5F7] p-0.5">
                <button
                  type="button"
                  onClick={() => setTaskMode("internal")}
                  className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition ${
                    taskMode === "internal"
                      ? "bg-white text-[#354154] shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
                      : "text-[#8994A4]"
                  }`}
                >
                  Tareas internas
                </button>
                <button
                  type="button"
                  onClick={() => setTaskMode("project")}
                  className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition ${
                    taskMode === "project"
                      ? "bg-white text-[#354154] shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
                      : "text-[#8994A4]"
                  }`}
                >
                  Tareas de proyectos
                </button>
              </div>
              <button
                type="button"
                onClick={() => navigate(taskMode === "internal" ? "/employee/tasks" : "/employee/project-tasks")}
                className="text-[10px] font-semibold text-[#4B8FE2] transition-colors hover:text-[#2F76C7]"
              >
                Ver todo
              </button>
            </div>

            <div className="mt-1 border-t border-[#EEF1F4]">
              {dashboardTasks.length === 0 ? (
                <div className="py-7 text-sm text-[#8B95A4]">
                  No tienes tareas pendientes en esta categoría.
                </div>
              ) : (
                dashboardTasks.map((task) => {
                  const due = dateOf(task.due_at);
                  const overdue = Boolean(due && isBefore(due, startOfDay(now)));
                  const project = task.project_id ? projectById.get(task.project_id) : null;
                  const statusLabel =
                    normalize(task.status) === "pending_review"
                      ? "Pendiente de revisión"
                      : normalize(task.status) === "in_progress"
                        ? "En curso"
                        : "Por hacer";

                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() =>
                        navigate(
                          taskMode === "internal"
                            ? `/employee/tasks/${task.id}`
                            : `/employee/project-tasks/${task.id}`,
                        )
                      }
                      className="group flex w-full items-center gap-3 border-b border-[#EEF1F4] py-3 text-left last:border-b-0"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F3F5F7]">
                        <ListTodo className="h-4 w-4 text-[#657287]" strokeWidth={1.7} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-[#354154]">
                          {shortText(task.title, "Tarea")}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-[#9099A7]">
                          {taskMode === "project"
                            ? `${shortText(project?.nombre, "Proyecto")} · `
                            : ""}
                          {statusLabel}
                          {task.progress != null ? ` · ${Math.round(Number(task.progress))}%` : ""}
                        </span>
                      </span>
                      {due ? (
                        <span className={`shrink-0 text-[10px] font-semibold ${overdue ? "text-[#B42318]" : "text-[#697588]"}`}>
                          {overdue ? "Vencida" : format(due, "d MMM", { locale: es })}
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-[10px] border border-[#E1E5EA] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <SectionHeader
              eyebrow="Agenda operativa"
              title="Próximos vencimientos"
              description="Fechas que requieren seguimiento próximamente."
              action="Abrir calendario"
              onAction={() => navigate("/employee/calendar")}
            />
            <div className="mt-3 border-t border-[#EEF1F4]">
              {upcoming.length === 0 ? (
                <div className="py-7 text-sm text-[#8B95A4]">
                  No hay vencimientos próximos registrados.
                </div>
              ) : (
                upcoming.slice(0, 5).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.route)}
                    className="group flex w-full items-center gap-3 border-b border-[#EEF1F4] py-3 text-left last:border-b-0"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F5F6F8]">
                      <CalendarDays className="h-4 w-4 text-[#697588]" strokeWidth={1.7} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-[#354154]">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-[#9099A7]">
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

          <div className="rounded-[10px] border border-[#E1E5EA] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <SectionHeader
              eyebrow="Acceso rápido"
              title="Acciones de Dirección"
              description="Acciones disponibles según el permiso efectivo del trabajador."
            />
            <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
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

        <footer className="mt-5 border-t border-[#E1E5EA] pt-3 text-[9px] text-[#9AA3B0]">
          <span>Modira · Dashboard de Dirección</span>
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
      className="flex items-center gap-2.5 rounded-lg border border-[#E6E9ED] bg-white p-2.5 text-left transition hover:border-[#D6DBE2] hover:bg-[#FAFBFC]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F2F4F6]">
        <Icon className="h-4 w-4 text-[#596579]" strokeWidth={1.7} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-[#354154]">{label}</span>
        <span className="mt-0.5 block truncate text-[10px] text-[#8A95A5]">{description}</span>
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
        <span className="mt-0.5 block truncate text-[10px] text-[#8A95A5]">{description}</span>
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-[#A3ACB8]" strokeWidth={1.7} />
    </button>
  );
}
