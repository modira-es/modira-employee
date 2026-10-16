import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useLocation } from "wouter";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Download,
  FileCheck2,
  FileText,
  Loader2,
  Receipt,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
  XCircle,
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
  | "billing_documents.read"
  | "billing_documents.manage"
  | "billing.read"
  | "billing.create"
  | "billing.update"
  | "billing.delete"
  | "invoices.read"
  | "invoices.create"
  | "invoices.update"
  | "invoices.delete"
  | "payments.read"
  | "expenses.read"
  | "expenses.create"
  | "expenses.update"
  | "expenses.delete"
  | "finance.read"
  | "finance.create"
  | "finance.update"
  | "finance.delete"
  | "clients.read"
  | "budgets.read"
  | "quotations.read"
  | "quotation_documents.read"
  | "maintenance.read";

type InvoiceRow = {
  id: string;
  user_id?: string | null;
  company_id?: string | null;
  project_id?: string | null;
  client_id?: string | null;
  quotation_id?: string | null;
  numero_factura?: string | null;
  monto?: number | null;
  importe_a_pagar?: number | null;
  subtotal?: number | null;
  iva_porcentaje?: number | null;
  iva_importe?: number | null;
  irpf_aplicado?: boolean | null;
  irpf_porcentaje?: number | null;
  irpf_importe?: number | null;
  estado?: string | null;
  fecha_emision?: string | null;
  fecha_vencimiento?: string | null;
  fecha_pago?: string | null;
  descripcion?: string | null;
  document_path?: string | null;
  document_sha256?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type PaymentRow = {
  id: string;
  company_id?: string | null;
  invoice_id?: string | null;
  maintenance_invoice_id?: string | null;
  amount?: number | null;
  currency?: string | null;
  status?: string | null;
  stripe_payment_intent_id?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
};

type ClientRow = {
  id: string;
  company_id?: string | null;
  nombre?: string | null;
  nombre_completo?: string | null;
  email?: string | null;
  estado?: string | null;
  created_at?: string | null;
};

type QuotationRow = {
  id: string;
  company_id?: string | null;
  client_id?: string | null;
  numero_presupuesto?: string | null;
  titulo?: string | null;
  precio_total?: number | null;
  estado?: string | null;
  fecha_emision?: string | null;
  fecha_validez?: string | null;
  created_at?: string | null;
};

type MaintenanceContractRow = {
  id: string;
  company_id?: string | null;
  nombre_plan?: string | null;
  precio?: number | null;
  moneda?: string | null;
  estado?: string | null;
  current_period_end?: string | null;
  fecha_fin?: string | null;
  created_at?: string | null;
};

type ExpenseRow = Record<string, unknown> & {
  id: string;
  created_at?: string | null;
  updated_at?: string | null;
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

type CompanyRow = {
  id: string;
  company_name?: string | null;
  razon_social?: string | null;
  estado?: string | null;
  is_active?: boolean | null;
};

type DashboardData = {
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  clients: ClientRow[];
  quotations: QuotationRow[];
  maintenanceContracts: MaintenanceContractRow[];
  expenses: ExpenseRow[];
  companies: CompanyRow[];
  activity: ActivityRow[];
  workerName: string;
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

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function dateOf(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function inPeriod(value: unknown, start: Date, end: Date) {
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

function money(value: unknown) {
  const numeric = Number(value ?? 0);
  return euro.format(Number.isFinite(numeric) ? numeric : 0);
}

function numericField(row: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = Number(row[name]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function textField(row: Record<string, unknown>, names: string[], fallback = "") {
  for (const name of names) {
    const value = row[name];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value);
    }
  }
  return fallback;
}

function statusLabel(status: unknown) {
  const normalized = normalize(status);
  const labels: Record<string, string> = {
    pendiente: "Pendiente",
    pagada: "Pagada",
    impagada: "Impagada",
    vencida: "Vencida",
    borrador: "Borrador",
    enviada: "Enviada",
    anulada: "Anulada",
    rectificada: "Rectificada",
    succeeded: "Confirmado",
    failed: "Fallido",
    canceled: "Cancelado",
    cancelado: "Cancelado",
    activo: "Activo",
    activa: "Activa",
    pausado: "Pausado",
    pausada: "Pausada",
  };
  return labels[normalized] ?? (String(status ?? "").trim() || "Sin estado");
}

function statusTone(status: unknown) {
  const normalized = normalize(status);
  if (["pagada", "succeeded", "activo", "activa"].includes(normalized)) {
    return "bg-emerald-50 text-emerald-700 border-emerald-100";
  }
  if (["pendiente", "enviada", "borrador"].includes(normalized)) {
    return "bg-amber-50 text-amber-700 border-amber-100";
  }
  if (["impagada", "vencida", "failed", "cancelado", "anulada"].includes(normalized)) {
    return "bg-rose-50 text-rose-700 border-rose-100";
  }
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function invoiceAmount(invoice: InvoiceRow) {
  return Number(invoice.importe_a_pagar ?? invoice.monto ?? 0);
}

function invoiceState(invoice: InvoiceRow, now = new Date()) {
  const state = normalize(invoice.estado);
  if (["pagada", "anulada", "rectificada"].includes(state)) return state;
  const due = dateOf(invoice.fecha_vencimiento);
  if (due && isBefore(due, startOfDay(now))) return "vencida";
  return state || "pendiente";
}

function companyName(company: CompanyRow | undefined, fallback = "Empresa") {
  return (
    company?.razon_social ||
    company?.company_name ||
    fallback
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "A";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function hasText(value: unknown, query: string) {
  if (!query.trim()) return true;
  return String(value ?? "").toLowerCase().includes(query.trim().toLowerCase());
}

function PermissionChip({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
        active
          ? "border-slate-200 bg-white text-slate-600"
          : "border-slate-100 bg-slate-50 text-slate-400"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-slate-300"}`} />
      {label}
    </span>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  helper,
  tone = "slate",
  trend,
}: {
  icon: typeof Receipt;
  label: string;
  value: string;
  helper: string;
  tone?: "slate" | "blue" | "green" | "amber" | "rose";
  trend?: "up" | "down" | "neutral";
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
  };
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        {trend && trend !== "neutral" && (
          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${trend === "up" ? "text-emerald-600" : "text-rose-600"}`}>
            {trend === "up" ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          </span>
        )}
      </div>
      <div className="mt-5 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</div>
      <div className="mt-1 text-[28px] font-semibold tracking-tight text-slate-900">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{helper}</div>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{eyebrow}</div>}
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export default function AccountingDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [period, setPeriod] = useState<DashboardPeriod>("month");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [data, setData] = useState<DashboardData>({
    invoices: [],
    payments: [],
    clients: [],
    quotations: [],
    maintenanceContracts: [],
    expenses: [],
    companies: [],
    activity: [],
    workerName: "Administración",
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [expenseSearch, setExpenseSearch] = useState("");
  const [permissions, setPermissions] = useState<Record<PermissionCode, boolean>>({} as Record<PermissionCode, boolean>);

  const range = useMemo(() => getPeriodRange(period, now), [period, now]);

  const loadPermissions = useCallback(async () => {
    const codes: PermissionCode[] = [
      "billing_documents.read",
      "billing_documents.manage",
      "billing.read",
      "billing.create",
      "billing.update",
      "billing.delete",
      "invoices.read",
      "invoices.create",
      "invoices.update",
      "invoices.delete",
      "payments.read",
      "expenses.read",
      "expenses.create",
      "expenses.update",
      "expenses.delete",
      "finance.read",
      "finance.create",
      "finance.update",
      "finance.delete",
      "clients.read",
      "budgets.read",
      "quotations.read",
      "quotation_documents.read",
      "maintenance.read",
    ];

    const entries = await Promise.all(
      codes.map(async (permission) => {
        const { data: allowed, error: permissionError } = await supabase.rpc(
          "current_worker_has_permission",
          { p_permission_code: permission },
        );
        if (permissionError) return [permission, false] as const;
        return [permission, Boolean(allowed)] as const;
      }),
    );

    setPermissions(Object.fromEntries(entries) as Record<PermissionCode, boolean>);
  }, []);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    try {
      setError(null);
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const [
        workerResult,
        invoicesResult,
        paymentsResult,
        clientsResult,
        quotationsResult,
        maintenanceResult,
        expensesResult,
        companiesResult,
        activityResult,
      ] = await Promise.all([
        supabase
          .from("workers")
          .select("id, full_name, nombre, apellidos")
          .eq("id", user?.id ?? "")
          .maybeSingle(),
        supabase
          .from("invoices")
          .select("*")
          .order("fecha_emision", { ascending: false })
          .limit(500),
        supabase
          .from("payments")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("clients")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("quotations")
          .select("id, company_id, client_id, numero_presupuesto, titulo, precio_total, estado, fecha_emision, fecha_validez, created_at")
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("maintenance_contracts")
          .select("id, company_id, nombre_plan, precio, moneda, estado, current_period_end, fecha_fin, created_at")
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("expenses")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("companies")
          .select("id, company_name, razon_social, estado, is_active")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("activity_log")
          .select("id, user_id, company_id, action, resource_type, description, created_at")
          .order("created_at", { ascending: false })
          .limit(12),
      ]);

      const failures = [
        invoicesResult.error,
        paymentsResult.error,
        clientsResult.error,
        quotationsResult.error,
        maintenanceResult.error,
        expensesResult.error,
        companiesResult.error,
        activityResult.error,
      ].filter(Boolean);

      if (failures.length) {
        console.warn("Accounting dashboard partial load:", failures);
        setError("Algunos módulos financieros no han podido cargarse. Se muestran los datos disponibles.");
      }

      const worker = workerResult.data as Record<string, unknown> | null;
      const workerName =
        textField(worker ?? {}, ["full_name", "nombre"], "Administración") ||
        "Administración";

      setData({
        invoices: (invoicesResult.data ?? []) as InvoiceRow[],
        payments: (paymentsResult.data ?? []) as PaymentRow[],
        clients: (clientsResult.data ?? []) as ClientRow[],
        quotations: (quotationsResult.data ?? []) as QuotationRow[],
        maintenanceContracts: (maintenanceResult.data ?? []) as MaintenanceContractRow[],
        expenses: (expensesResult.data ?? []) as ExpenseRow[],
        companies: (companiesResult.data ?? []) as CompanyRow[],
        activity: (activityResult.data ?? []) as ActivityRow[],
        workerName,
      });
      setNow(new Date());
    } catch (loadError) {
      console.error(loadError);
      setError("No se ha podido cargar el dashboard financiero.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void Promise.all([loadPermissions(), loadDashboard()]);
  }, [loadPermissions, loadDashboard]);

  const periodInvoices = useMemo(
    () => data.invoices.filter((invoice) => inPeriod(invoice.fecha_emision ?? invoice.created_at, range.start, range.end)),
    [data.invoices, range],
  );

  const periodPayments = useMemo(
    () => data.payments.filter((payment) => inPeriod(payment.paid_at ?? payment.created_at, range.start, range.end)),
    [data.payments, range],
  );

  const periodExpenses = useMemo(
    () => data.expenses.filter((expense) => inPeriod(expense["fecha"] ?? expense["expense_date"] ?? expense.created_at, range.start, range.end)),
    [data.expenses, range],
  );

  const activeInvoices = useMemo(
    () => data.invoices.filter((invoice) => !["anulada", "rectificada"].includes(normalize(invoice.estado))),
    [data.invoices],
  );

  const pendingInvoices = useMemo(
    () => activeInvoices.filter((invoice) => ["pendiente", "enviada", "borrador"].includes(invoiceState(invoice, now))),
    [activeInvoices, now],
  );

  const overdueInvoices = useMemo(
    () => activeInvoices.filter((invoice) => invoiceState(invoice, now) === "vencida"),
    [activeInvoices, now],
  );

  const paidInvoices = useMemo(
    () => activeInvoices.filter((invoice) => normalize(invoice.estado) === "pagada"),
    [activeInvoices],
  );

  const periodBilling = useMemo(
    () => periodInvoices
      .filter((invoice) => !["anulada", "rectificada"].includes(normalize(invoice.estado)))
      .reduce((sum, invoice) => sum + invoiceAmount(invoice), 0),
    [periodInvoices],
  );

  const periodCollected = useMemo(
    () => periodPayments
      .filter((payment) => normalize(payment.status) === "succeeded")
      .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0),
    [periodPayments],
  );

  const periodExpenseTotal = useMemo(
    () => periodExpenses.reduce((sum, expense) => sum + numericField(expense, ["amount", "importe", "monto", "total", "cost", "precio"]), 0),
    [periodExpenses],
  );

  const netCash = periodCollected - periodExpenseTotal;

  const collectionRate = periodBilling > 0 ? Math.min(100, (periodCollected / periodBilling) * 100) : 0;

  const dueNext7Days = useMemo(() => {
    const today = startOfDay(now);
    const limit = endOfDay(addDays(now, 7));
    return activeInvoices
      .filter((invoice) => {
        const state = invoiceState(invoice, now);
        const due = dateOf(invoice.fecha_vencimiento);
        return due && due >= today && due <= limit && !["pagada", "anulada", "rectificada"].includes(state);
      })
      .sort((a, b) => (dateOf(a.fecha_vencimiento)?.getTime() ?? 0) - (dateOf(b.fecha_vencimiento)?.getTime() ?? 0));
  }, [activeInvoices, now]);

  const topClients = useMemo(() => {
    const totals = new Map<string, number>();
    for (const invoice of periodInvoices) {
      if (!invoice.client_id) continue;
      totals.set(invoice.client_id, (totals.get(invoice.client_id) ?? 0) + invoiceAmount(invoice));
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [periodInvoices]);

  const filteredInvoices = useMemo(() => {
    return data.invoices
      .filter((invoice) => {
        const query = invoiceSearch.trim().toLowerCase();
        if (!query) return true;
        return [invoice.numero_factura, invoice.descripcion, invoice.id, invoice.company_id]
          .some((value) => hasText(value, query));
      })
      .slice(0, 8);
  }, [data.invoices, invoiceSearch]);

  const filteredExpenses = useMemo(() => {
    return data.expenses
      .filter((expense) => {
        const query = expenseSearch.trim().toLowerCase();
        if (!query) return true;
        return [
          textField(expense, ["description", "descripcion", "concept", "concepto", "name", "nombre"]),
          textField(expense, ["category", "categoria"]),
          expense.id,
        ].some((value) => hasText(value, query));
      })
      .slice(0, 6);
  }, [data.expenses, expenseSearch]);

  const invoiceStatusCounts = useMemo(() => {
    return {
      pending: pendingInvoices.length,
      paid: paidInvoices.length,
      overdue: overdueInvoices.length,
    };
  }, [pendingInvoices.length, paidInvoices.length, overdueInvoices.length]);

  const monthlySeries = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, index) => {
      const monthDate = addMonths(now, index - 5);
      const start = startOfMonth(monthDate);
      const end = endOfMonth(monthDate);
      const income = data.payments
        .filter((payment) => normalize(payment.status) === "succeeded" && inPeriod(payment.paid_at ?? payment.created_at, start, end))
        .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
      const expenses = data.expenses
        .filter((expense) => inPeriod(expense["fecha"] ?? expense["expense_date"] ?? expense.created_at, start, end))
        .reduce((sum, expense) => sum + numericField(expense, ["amount", "importe", "monto", "total", "cost", "precio"]), 0);
      return { label: format(monthDate, "MMM", { locale: es }), income, expenses };
    });
    const max = Math.max(1, ...months.flatMap((month) => [month.income, month.expenses]));
    return months.map((month) => ({ ...month, incomePct: (month.income / max) * 100, expensePct: (month.expenses / max) * 100 }));
  }, [data.expenses, data.payments, now]);

  const canManageInvoices = permissions["invoices.create"] || permissions["invoices.update"] || permissions["invoices.delete"];
  const canManageBilling = permissions["billing_documents.manage"] || permissions["billing.create"] || permissions["billing.update"];
  const canManageExpenses = permissions["expenses.create"] || permissions["expenses.update"] || permissions["expenses.delete"];
  const canManageFinance = permissions["finance.create"] || permissions["finance.update"] || permissions["finance.delete"];

  const quickActions = [
    canManageInvoices && {
      label: "Nueva factura",
      description: "Crear y gestionar una factura",
      icon: Receipt,
      onClick: () => navigate("/employee/invoices/new"),
    },
    canManageExpenses && {
      label: "Nuevo gasto",
      description: "Registrar un gasto operativo",
      icon: TrendingDown,
      onClick: () => navigate("/employee/expenses/new"),
    },
    canManageBilling && {
      label: "Documentos",
      description: "Revisar documentación fiscal",
      icon: FileCheck2,
      onClick: () => navigate("/employee/billing/documents"),
    },
    permissions["quotations.read"] && {
      label: "Presupuestos",
      description: "Consultar presupuestos comerciales",
      icon: FileText,
      onClick: () => navigate("/employee/quotations"),
    },
  ].filter(Boolean) as Array<{ label: string; description: string; icon: typeof Receipt; onClick: () => void }>;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-[1540px] items-center justify-center py-32">
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Cargando panel financiero…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-slate-900">
      <div className="mx-auto max-w-[1540px] px-5 py-6 sm:px-8 lg:px-10">
        <header className="mb-7 flex flex-col gap-5 rounded-3xl border border-slate-200/80 bg-white px-5 py-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#102A66] text-white shadow-sm">
              <CircleDollarSign className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Modira · Accounting</div>
              <div className="mt-0.5 text-sm font-medium text-slate-700">Administración y control financiero</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/employee/notifications")}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
              aria-label="Notificaciones"
            >
              <Bell className="h-4.5 w-4.5" />
            </button>
            <button
              type="button"
              onClick={() => void loadDashboard(true)}
              className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Actualizar
            </button>
            <div className="ml-1 flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
              {getInitials(data.workerName)}
            </div>
          </div>
        </header>

        <section className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#102A66]">Panel financiero</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Control financiero</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Facturación, cobros, vencimientos, gastos y documentación fiscal en una única vista operativa.
            </p>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setPeriodOpen((value) => !value)}
              className="flex min-w-[190px] items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm"
            >
              <span>{periodLabels[period]}</span>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>
            {periodOpen && (
              <div className="absolute right-0 z-20 mt-2 w-[190px] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                {(Object.keys(periodLabels) as DashboardPeriod[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setPeriod(option);
                      setPeriodOpen(false);
                    }}
                    className={`flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm transition ${period === option ? "bg-slate-100 font-semibold text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}
                  >
                    {periodLabels[option]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={Receipt}
            label="Facturación del periodo"
            value={money(periodBilling)}
            helper={`${number.format(periodInvoices.length)} facturas emitidas`}
            tone="blue"
          />
          <KpiCard
            icon={CreditCard}
            label="Cobros confirmados"
            value={money(periodCollected)}
            helper={`${collectionRate.toFixed(0)}% sobre la facturación del periodo`}
            tone="green"
            trend="up"
          />
          <KpiCard
            icon={CalendarClock}
            label="Facturas vencidas"
            value={number.format(overdueInvoices.length)}
            helper={`${money(overdueInvoices.reduce((sum, invoice) => sum + invoiceAmount(invoice), 0))} pendiente`}
            tone="rose"
            trend={overdueInvoices.length ? "down" : "neutral"}
          />
          <KpiCard
            icon={Wallet}
            label="Gastos del periodo"
            value={money(periodExpenseTotal)}
            helper={`${number.format(periodExpenses.length)} movimientos registrados`}
            tone="amber"
          />
        </section>

        <section className="mt-4 grid gap-4 md:grid-cols-4">
          {[
            ["Pendientes", invoiceStatusCounts.pending, "Facturas por cobrar", "bg-amber-50 text-amber-700"],
            ["Pagadas", invoiceStatusCounts.paid, "Facturas cobradas", "bg-emerald-50 text-emerald-700"],
            ["Cobros", periodPayments.filter((payment) => normalize(payment.status) === "succeeded").length, "Pagos confirmados", "bg-blue-50 text-blue-700"],
            ["Contratos", data.maintenanceContracts.filter((contract) => ["activo", "activa"].includes(normalize(contract.estado))).length, "Mantenimientos activos", "bg-violet-50 text-violet-700"],
          ].map(([label, value, helper, tone]) => (
            <div key={String(label)} className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-[0_8px_30px_rgba(15,23,42,0.03)]">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <div className="text-lg font-semibold text-slate-900">{number.format(Number(value))}</div>
                <div className="text-xs text-slate-500">{String(helper)}</div>
              </div>
              <div className="ml-auto text-[11px] font-semibold uppercase tracking-wider text-slate-300">{String(label)}</div>
            </div>
          ))}
        </section>

        <section className="mt-7 grid gap-5 xl:grid-cols-[1.45fr_0.8fr]">
          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <SectionHeader
              eyebrow="Tesorería"
              title="Ingresos y gastos"
              description="Evolución de cobros confirmados frente a gastos registrados."
              action={
                <button type="button" onClick={() => navigate("/employee/finance")} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#102A66] hover:underline">
                  Ver finanzas <ArrowUpRight className="h-4 w-4" />
                </button>
              }
            />
            <div className="mb-5 flex items-center gap-5 text-xs font-medium text-slate-500">
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#102A66]" />Cobros</span>
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" />Gastos</span>
            </div>
            <div className="flex h-[245px] items-end gap-3 sm:gap-5">
              {monthlySeries.map((month) => (
                <div key={month.label} className="flex h-full flex-1 items-end gap-1.5">
                  <div className="relative flex h-full flex-1 items-end rounded-t-xl bg-slate-50">
                    <div className="w-full rounded-t-xl bg-[#102A66] transition-all" style={{ height: `${Math.max(3, month.incomePct)}%` }} />
                  </div>
                  <div className="relative flex h-full flex-1 items-end rounded-t-xl bg-slate-50">
                    <div className="w-full rounded-t-xl bg-slate-300 transition-all" style={{ height: `${Math.max(3, month.expensePct)}%` }} />
                  </div>
                  <div className="absolute" />
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-6 gap-3 text-center text-[11px] font-medium capitalize text-slate-400">
              {monthlySeries.map((month) => <span key={month.label}>{month.label}</span>)}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="text-xs text-slate-500">Cobros</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{money(periodCollected)}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="text-xs text-slate-500">Gastos</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{money(periodExpenseTotal)}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="text-xs text-slate-500">Balance operativo</div>
                <div className={`mt-1 text-lg font-semibold ${netCash >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{money(netCash)}</div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <SectionHeader eyebrow="Seguimiento" title="Cobros próximos" description="Facturas cuyo vencimiento se aproxima." />
            <div className="space-y-3">
              {dueNext7Days.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
                  <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500" />
                  <div className="mt-2 text-sm font-semibold text-slate-800">Sin vencimientos inmediatos</div>
                  <div className="mt-1 text-xs text-slate-500">No hay facturas pendientes con vencimiento en los próximos 7 días.</div>
                </div>
              ) : (
                dueNext7Days.slice(0, 5).map((invoice) => {
                  const due = dateOf(invoice.fecha_vencimiento);
                  return (
                    <button key={invoice.id} type="button" onClick={() => navigate(`/employee/invoices/${invoice.id}`)} className="group flex w-full items-center gap-3 rounded-2xl border border-slate-100 p-3 text-left transition hover:border-slate-200 hover:bg-slate-50">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><CalendarClock className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-800">{invoice.numero_factura || "Factura"}</div>
                        <div className="mt-0.5 text-xs text-slate-500">Vence {due ? format(due, "d MMM", { locale: es }) : "próximamente"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-slate-900">{money(invoiceAmount(invoice))}</div>
                        <ArrowRight className="ml-auto mt-1 h-3.5 w-3.5 text-slate-300 transition group-hover:text-slate-500" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            {dueNext7Days.length > 0 && (
              <button type="button" onClick={() => navigate("/employee/invoices?status=pending")} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Ver facturas pendientes <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <SectionHeader
              eyebrow="Facturación"
              title="Últimas facturas"
              description="Consulta rápida del estado documental y de cobro."
              action={
                <div className="flex items-center gap-2">
                  <div className="hidden items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 sm:flex">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} placeholder="Buscar factura…" className="w-36 bg-transparent text-sm outline-none placeholder:text-slate-400" />
                  </div>
                  <button type="button" onClick={() => navigate("/employee/invoices")} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#102A66] hover:underline">Ver todas <ArrowUpRight className="h-4 w-4" /></button>
                </div>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">
                    <th className="pb-3 pr-4">Factura</th>
                    <th className="pb-3 pr-4">Emisión</th>
                    <th className="pb-3 pr-4">Vencimiento</th>
                    <th className="pb-3 pr-4">Estado</th>
                    <th className="pb-3 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((invoice) => {
                    const state = invoiceState(invoice, now);
                    return (
                      <tr key={invoice.id} onClick={() => navigate(`/employee/invoices/${invoice.id}`)} className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50/80">
                        <td className="py-4 pr-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Receipt className="h-4 w-4" /></div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-800">{invoice.numero_factura || "Sin número"}</div>
                              <div className="max-w-[230px] truncate text-xs text-slate-400">{invoice.descripcion || "Factura"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 pr-4 text-sm text-slate-500">{dateOf(invoice.fecha_emision) ? format(dateOf(invoice.fecha_emision)!, "d MMM yyyy", { locale: es }) : "—"}</td>
                        <td className="py-4 pr-4 text-sm text-slate-500">{dateOf(invoice.fecha_vencimiento) ? format(dateOf(invoice.fecha_vencimiento)!, "d MMM yyyy", { locale: es }) : "—"}</td>
                        <td className="py-4 pr-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(state)}`}>{statusLabel(state)}</span></td>
                        <td className="py-4 text-right text-sm font-semibold text-slate-900">{money(invoiceAmount(invoice))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredInvoices.length === 0 && <div className="py-10 text-center text-sm text-slate-500">No hay facturas para la búsqueda indicada.</div>}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <SectionHeader eyebrow="Cobros" title="Actividad de pagos" description="Últimos movimientos confirmados y fallidos." />
            <div className="space-y-3">
              {data.payments.slice(0, 6).map((payment) => {
                const succeeded = normalize(payment.status) === "succeeded";
                return (
                  <div key={payment.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${succeeded ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                      {succeeded ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-800">{succeeded ? "Pago confirmado" : "Pago no confirmado"}</div>
                      <div className="mt-0.5 text-xs text-slate-400">{dateOf(payment.paid_at ?? payment.created_at) ? formatDistanceToNow(dateOf(payment.paid_at ?? payment.created_at)!, { addSuffix: true, locale: es }) : "—"}</div>
                    </div>
                    <div className={`text-sm font-semibold ${succeeded ? "text-emerald-700" : "text-slate-700"}`}>{money(payment.amount)}</div>
                  </div>
                );
              })}
              {data.payments.length === 0 && <div className="py-8 text-center text-sm text-slate-500">No hay pagos registrados.</div>}
            </div>
            <button type="button" onClick={() => navigate("/employee/payments")} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Ver pagos <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-2">
          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <SectionHeader
              eyebrow="Gastos"
              title="Últimos gastos"
              description="Movimientos de gasto disponibles para administración."
              action={
                <div className="flex items-center gap-2">
                  <div className="hidden items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 sm:flex">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input value={expenseSearch} onChange={(event) => setExpenseSearch(event.target.value)} placeholder="Buscar gasto…" className="w-32 bg-transparent text-sm outline-none placeholder:text-slate-400" />
                  </div>
                  <button type="button" onClick={() => navigate("/employee/expenses")} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#102A66] hover:underline">Ver todos <ArrowUpRight className="h-4 w-4" /></button>
                </div>
              }
            />
            <div className="space-y-2">
              {filteredExpenses.map((expense) => {
                const description = textField(expense, ["description", "descripcion", "concept", "concepto", "name", "nombre"], "Gasto");
                const category = textField(expense, ["category", "categoria", "type", "tipo"], "Operativo");
                const amount = numericField(expense, ["amount", "importe", "monto", "total", "cost", "precio"]);
                const date = dateOf(expense["fecha"] ?? expense["expense_date"] ?? expense.created_at);
                return (
                  <button key={expense.id} type="button" onClick={() => navigate(`/employee/expenses/${expense.id}`)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 p-3 text-left transition hover:border-slate-200 hover:bg-slate-50">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700"><TrendingDown className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-800">{description}</div>
                      <div className="mt-0.5 text-xs text-slate-400">{category}{date ? ` · ${format(date, "d MMM", { locale: es })}` : ""}</div>
                    </div>
                    <div className="text-sm font-semibold text-slate-900">{money(amount)}</div>
                  </button>
                );
              })}
              {filteredExpenses.length === 0 && <div className="py-8 text-center text-sm text-slate-500">No hay gastos disponibles.</div>}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <SectionHeader eyebrow="Clientes y cartera" title="Actividad financiera por cliente" description="Principales clientes por volumen facturado en el periodo seleccionado." />
            <div className="space-y-3">
              {topClients.map(([clientId, total], index) => {
                const client = data.clients.find((item) => item.id === clientId);
                return (
                  <button key={clientId} type="button" onClick={() => navigate(`/employee/clients/${clientId}`)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 p-3 text-left hover:border-slate-200 hover:bg-slate-50">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-600">{String(index + 1).padStart(2, "0")}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-800">{client?.nombre_completo || client?.nombre || client?.email || "Cliente"}</div>
                      <div className="mt-0.5 text-xs text-slate-400">{client?.email || "Cliente activo"}</div>
                    </div>
                    <div className="text-sm font-semibold text-slate-900">{money(total)}</div>
                  </button>
                );
              })}
              {topClients.length === 0 && <div className="py-8 text-center text-sm text-slate-500">Todavía no hay facturación asociada a clientes en este periodo.</div>}
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <SectionHeader eyebrow="Mantenimiento" title="Contratos activos" description="Seguimiento económico del mantenimiento recurrente." action={<button type="button" onClick={() => navigate("/employee/maintenance")} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#102A66] hover:underline">Ver mantenimiento <ArrowUpRight className="h-4 w-4" /></button>} />
            <div className="grid gap-3 sm:grid-cols-2">
              {data.maintenanceContracts.filter((contract) => ["activo", "activa"].includes(normalize(contract.estado))).slice(0, 6).map((contract) => (
                <button key={contract.id} type="button" onClick={() => navigate(`/employee/maintenance/contracts/${contract.id}`)} className="rounded-2xl border border-slate-100 p-4 text-left transition hover:border-slate-200 hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Wrench className="h-4 w-4" /></div>
                    <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Activo</span>
                  </div>
                  <div className="mt-4 truncate text-sm font-semibold text-slate-800">{contract.nombre_plan || "Mantenimiento"}</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{money(contract.precio)}</div>
                  <div className="mt-1 text-xs text-slate-400">{contract.current_period_end ? `Periodo hasta ${format(dateOf(contract.current_period_end)!, "d MMM yyyy", { locale: es })}` : "Contrato recurrente"}</div>
                </button>
              ))}
            </div>
            {data.maintenanceContracts.filter((contract) => ["activo", "activa"].includes(normalize(contract.estado))).length === 0 && <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No hay contratos de mantenimiento activos.</div>}
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <SectionHeader eyebrow="Presupuestos" title="Consulta comercial" description="Acceso de solo lectura a la información comercial necesaria para contabilidad." />
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Pendientes", data.quotations.filter((quotation) => ["pendiente", "enviada"].includes(normalize(quotation.estado))).length, "bg-amber-50 text-amber-700"],
                ["Aceptados", data.quotations.filter((quotation) => normalize(quotation.estado) === "aceptado" || normalize(quotation.estado) === "aceptada").length, "bg-emerald-50 text-emerald-700"],
                ["Rechazados", data.quotations.filter((quotation) => ["rechazado", "rechazada"].includes(normalize(quotation.estado))).length, "bg-rose-50 text-rose-700"],
                ["Total", data.quotations.length, "bg-slate-100 text-slate-700"],
              ].map(([label, value, tone]) => (
                <button key={String(label)} type="button" onClick={() => navigate("/employee/quotations")} className="rounded-2xl border border-slate-100 p-4 text-left hover:border-slate-200 hover:bg-slate-50">
                  <div className={`inline-flex rounded-xl px-2.5 py-2 text-xs font-bold ${tone}`}><FileText className="mr-1.5 h-3.5 w-3.5" />{String(label)}</div>
                  <div className="mt-3 text-2xl font-semibold text-slate-900">{number.format(Number(value))}</div>
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
              <div className="flex items-start gap-3">
                <FileCheck2 className="mt-0.5 h-5 w-5 text-blue-700" />
                <div>
                  <div className="text-sm font-semibold text-slate-800">Documentación de presupuestos</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">Administración puede consultar documentos de presupuestos, pero las acciones comerciales permanecen fuera de este rol.</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
          <SectionHeader eyebrow="Actividad" title="Actividad reciente" description="Últimos eventos disponibles para el trabajador administrativo." />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.activity.map((item) => (
              <div key={item.id} className="flex gap-3 rounded-2xl border border-slate-100 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Activity className="h-4 w-4" /></div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-800">{item.description || `${item.action} · ${item.resource_type}`}</div>
                  <div className="mt-1 text-xs text-slate-400">{dateOf(item.created_at) ? formatDistanceToNow(dateOf(item.created_at)!, { addSuffix: true, locale: es }) : "—"}</div>
                </div>
              </div>
            ))}
          </div>
          {data.activity.length === 0 && <div className="py-8 text-center text-sm text-slate-500">No hay actividad reciente disponible.</div>}
        </section>

        <section className="mt-5 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
          <SectionHeader eyebrow="Acceso rápido" title="Herramientas administrativas" description="Accesos alineados con las capacidades efectivas del trabajador." />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button key={action.label} type="button" onClick={action.onClick} className="group rounded-2xl border border-slate-200 p-4 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 group-hover:bg-[#102A66] group-hover:text-white"><Icon className="h-4.5 w-4.5" /></div>
                    <ArrowUpRight className="h-4 w-4 text-slate-300 transition group-hover:text-slate-600" />
                  </div>
                  <div className="mt-4 text-sm font-semibold text-slate-800">{action.label}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{action.description}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-5 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Capacidades</div>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Área administrativa</h2>
              <p className="mt-1 text-sm text-slate-500">El dashboard refleja permisos de lectura y gestión sin sustituir las comprobaciones de backend, RLS o RPC.</p>
            </div>
            <div className="flex flex-wrap gap-2 lg:max-w-[720px] lg:justify-end">
              <PermissionChip label="Facturas" active={permissions["invoices.read"]} />
              <PermissionChip label="Pagos" active={permissions["payments.read"]} />
              <PermissionChip label="Gastos" active={permissions["expenses.read"]} />
              <PermissionChip label="Finanzas" active={permissions["finance.read"]} />
              <PermissionChip label="Clientes" active={permissions["clients.read"]} />
              <PermissionChip label="Presupuestos" active={permissions["quotations.read"]} />
              <PermissionChip label="Mantenimiento" active={permissions["maintenance.read"]} />
              <PermissionChip label="Documentos" active={permissions["billing_documents.read"] || permissions["quotation_documents.read"]} />
            </div>
          </div>
        </section>

        <footer className="flex flex-col gap-3 px-1 py-7 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <div>Modira · Panel de Administración</div>
          <div>Datos consultados según los permisos efectivos del trabajador.</div>
        </footer>
      </div>
    </div>
  );
}
