import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useLocation } from "wouter";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
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
  | "clients.update"
  | "companies.update"
  | "quotations.create"
  | "quotations.update"
  | "quotations.delete"
  | "maintenance.create"
  | "maintenance.update"
  | "maintenance.delete";

type CompanyRow = {
  id: string;
  company_name?: string | null;
  razon_social?: string | null;
  created_at?: string | null;
  estado?: string | null;
  is_active?: boolean | null;
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

type ProjectRow = {
  id: string;
  nombre: string;
  estado?: string | null;
  company_id?: string | null;
  client_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type QuotationRow = {
  id: string;
  company_id?: string | null;
  client_id?: string | null;
  project_id?: string | null;
  numero_presupuesto?: string | null;
  titulo?: string | null;
  descripcion_detallada?: string | null;
  precio_base?: number | null;
  iva_porcentaje?: number | null;
  iva_importe?: number | null;
  precio_total?: number | null;
  estado?: string | null;
  fecha_emision?: string | null;
  fecha_validez?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type InvoiceRow = {
  id: string;
  company_id?: string | null;
  quotation_id?: string | null;
  numero_factura?: string | null;
  monto?: number | null;
  estado?: string | null;
  fecha_emision?: string | null;
  fecha_vencimiento?: string | null;
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

type CustomProposalRow = {
  id: string;
  company_id?: string | null;
  plan_id?: string | null;
  status?: string | null;
  title?: string | null;
  description?: string | null;
  monthly_price?: number | null;
  monthly_hours?: number | null;
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

type DashboardData = {
  companies: CompanyRow[];
  clients: ClientRow[];
  quotations: QuotationRow[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  customProposals: CustomProposalRow[];
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

function quotationAmount(quotation: QuotationRow) {
  return Number(quotation.precio_total ?? quotation.precio_base ?? 0);
}

function isQuotationPending(quotation: QuotationRow) {
  return normalize(quotation.estado) === "pendiente";
}

function isQuotationAccepted(quotation: QuotationRow) {
  return normalize(quotation.estado) === "aceptado";
}

function isQuotationRejected(quotation: QuotationRow) {
  return normalize(quotation.estado) === "rechazado";
}

function isInvoicePaid(invoice: InvoiceRow) {
  return normalize(invoice.estado) === "pagada";
}

function isPaymentSuccessful(payment: PaymentRow) {
  return normalize(payment.status) === "succeeded";
}

function paymentInEuros(payment: PaymentRow) {
  if (String(payment.currency ?? "EUR").toUpperCase() !== "EUR") return 0;
  return Number(payment.amount ?? 0) / 100;
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
  accent?: "default" | "success" | "warning";
}) {
  const valueClass =
    accent === "success"
      ? "text-[#157A5A]"
      : accent === "warning"
        ? "text-[#9A6B18]"
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

  if (!onClick) return <div className="p-5">{content}</div>;

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

function LoadingPanel() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 w-28 rounded bg-[#EEF1F4]" />
      <div className="h-8 w-44 rounded bg-[#EEF1F4]" />
      <div className="h-3 w-64 rounded bg-[#EEF1F4]" />
    </div>
  );
}

function PipelineBar({
  pending,
  accepted,
  rejected,
  total,
}: {
  pending: number;
  accepted: number;
  rejected: number;
  total: number;
}) {
  if (total === 0) {
    return (
      <div className="mt-5 rounded-xl bg-[#F7F8FA] px-4 py-7 text-center text-sm text-[#8B95A4]">
        Todavía no hay presupuestos registrados.
      </div>
    );
  }

  const pendingWidth = (pending / total) * 100;
  const acceptedWidth = (accepted / total) * 100;
  const rejectedWidth = (rejected / total) * 100;

  return (
    <div className="mt-5">
      <div className="flex h-3 overflow-hidden rounded-full bg-[#F1F3F5]">
        {pendingWidth > 0 ? (
          <div className="bg-[#8B96A5]" style={{ width: `${pendingWidth}%` }} />
        ) : null}
        {acceptedWidth > 0 ? (
          <div className="bg-[#3F7B68]" style={{ width: `${acceptedWidth}%` }} />
        ) : null}
        {rejectedWidth > 0 ? (
          <div className="bg-[#C9CDD3]" style={{ width: `${rejectedWidth}%` }} />
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <PipelineLegend
          label="Pendientes"
          value={pending}
          tone="bg-[#8B96A5]"
        />
        <PipelineLegend
          label="Aceptados"
          value={accepted}
          tone="bg-[#3F7B68]"
        />
        <PipelineLegend
          label="Rechazados"
          value={rejected}
          tone="bg-[#C9CDD3]"
        />
      </div>
    </div>
  );
}

function PipelineLegend({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${tone}`} />
        <span className="text-[11px] text-[#818C9C]">{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold text-[#303B4D]">
        {number.format(value)}
      </p>
    </div>
  );
}

function FollowUpRow({
  key: _key,
  title,
  company,
  date,
  amount,
  status,
  onClick,
}: {
  key?: string;
  title: string;
  company: string;
  date: Date | null;
  amount: number;
  status: "pending" | "accepted" | "expired";
  onClick: () => void;
}) {
  const statusLabel =
    status === "accepted"
      ? "Aceptado"
      : status === "expired"
        ? "Vencido"
        : "Pendiente";

  const statusClass =
    status === "accepted"
      ? "bg-[#EDF7F3] text-[#31725F]"
      : status === "expired"
        ? "bg-[#FEF3F2] text-[#A33A32]"
        : "bg-[#F4F5F7] text-[#6E7989]";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-[#EEF1F4] py-3.5 text-left last:border-b-0"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F3F5F7]">
        <FileText className="h-4 w-4 text-[#657287]" strokeWidth={1.7} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[#354154]">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-[#9099A7]">
          {company}
          {date
            ? ` · ${format(date, "d MMM yyyy", { locale: es })}`
            : ""}
        </span>
      </span>
      <span className="hidden shrink-0 text-sm font-semibold text-[#465368] sm:block">
        {euro.format(amount)}
      </span>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusClass}`}>
        {statusLabel}
      </span>
    </button>
  );
}

function QuickAction({
  icon: Icon,
  label,
  description,
  onClick,
}: {
  icon: typeof FileText;
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
        <span className="mt-0.5 block truncate text-xs text-[#8A95A5]">
          {description}
        </span>
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
  icon: typeof FileText;
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
        <span className="mt-0.5 block truncate text-xs text-[#8A95A5]">
          {description}
        </span>
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-[#A3ACB8]" strokeWidth={1.7} />
    </button>
  );
}

export default function CommercialDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const [period, setPeriod] = useState<DashboardPeriod>("30d");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<DashboardData>({
    companies: [],
    clients: [],
    projects: [],
    quotations: [],
    invoices: [],
    payments: [],
    customProposals: [],
    activity: [],
    workerName: "",
  });

  const permissionCodes: PermissionCode[] = [
    "clients.update",
    "companies.update",
    "quotations.create",
    "quotations.update",
    "quotations.delete",
    "maintenance.create",
    "maintenance.update",
    "maintenance.delete",
  ];

  const [permissions, setPermissions] = useState<
    Record<PermissionCode, boolean>
  >(() =>
    Object.fromEntries(
      permissionCodes.map((code) => [code, false]),
    ) as Record<PermissionCode, boolean>,
  );

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
          clientsResult,
          quotationsResult,
          invoicesResult,
          paymentsResult,
          customProposalsResult,
          activityResult,
        ] = await Promise.all([
          supabase
            .from("workers")
            .select("id, auth_user_id, display_name")
            .eq("auth_user_id", user.id)
            .maybeSingle(),

          supabase
            .from("companies")
            .select(
              "id, company_name, razon_social, created_at, estado, is_active",
            )
            .order("company_name", { ascending: true }),

          supabase
            .from("clients")
            .select(
              "id, company_id, nombre, nombre_completo, email, estado, created_at",
            )
            .order("created_at", { ascending: false }),

          supabase
            .from("quotations")
            .select(
              "id, company_id, client_id, project_id, numero_presupuesto, titulo, descripcion_detallada, precio_base, iva_porcentaje, iva_importe, precio_total, estado, fecha_emision, fecha_validez, created_at, updated_at",
            )
            .order("created_at", { ascending: false }),

          supabase
            .from("invoices")
            .select(
              "id, company_id, quotation_id, numero_factura, monto, estado, fecha_emision, fecha_vencimiento, created_at",
            )
            .order("created_at", { ascending: false }),

          supabase
            .from("payments")
            .select("id, company_id, amount, currency, status, paid_at, created_at")
            .order("created_at", { ascending: false }),

          supabase
            .from("maintenance_custom_proposals")
            .select(
              "id, company_id, plan_id, status, title, description, monthly_price, monthly_hours, created_at, updated_at",
            )
            .order("created_at", { ascending: false }),

          supabase
            .from("activity_log")
            .select(
              "id, user_id, company_id, action, resource_type, description, created_at",
            )
            .order("created_at", { ascending: false })
            .limit(40),
        ]);

        const results = [
          ["trabajador", workerResult.error],
          ["empresas", companiesResult.error],
          ["clientes", clientsResult.error],
          ["presupuestos", quotationsResult.error],
          ["facturas", invoicesResult.error],
          ["pagos", paymentsResult.error],
          ["propuestas personalizadas", customProposalsResult.error],
          ["actividad", activityResult.error],
        ] as const;

        results.forEach(([name, error]) => {
          if (error) failed.push(name);
        });

        setData({
          workerName: workerResult.data?.display_name?.trim() || "Comercial",
          companies: (companiesResult.data ?? []) as CompanyRow[],
          clients: (clientsResult.data ?? []) as ClientRow[],
          quotations: (quotationsResult.data ?? []) as QuotationRow[],
          invoices: (invoicesResult.data ?? []) as InvoiceRow[],
          payments: (paymentsResult.data ?? []) as PaymentRow[],
          customProposals: (customProposalsResult.data ?? []) as CustomProposalRow[],
          activity: (activityResult.data ?? []) as ActivityRow[],
        });

        const permissionEntries = await Promise.all(
          permissionCodes.map(async (code) => {
            const result = await supabase.rpc(
              "current_worker_has_permission",
              {
                p_permission_code: code,
              },
            );

            return [
              code,
              result.error ? false : result.data === true,
            ] as const;
          }),
        );

        setPermissions(
          Object.fromEntries(permissionEntries) as Record<
            PermissionCode,
            boolean
          >,
        );
        setErrors(failed);
      } catch (error) {
        console.error("[CommercialDashboard] Error loading dashboard", error);
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
    () =>
      new Map(
        data.companies.map((company) => [
          company.id,
          company.company_name || company.razon_social || "Empresa",
        ]),
      ),
    [data.companies],
  );

  const metrics = useMemo(() => {
    const periodQuotations = data.quotations.filter((quotation) =>
      inPeriod(
        quotation.fecha_emision ?? quotation.created_at,
        range.start,
        range.end,
      ),
    );

    const pending = data.quotations.filter(isQuotationPending);
    const accepted = data.quotations.filter(isQuotationAccepted);
    const rejected = data.quotations.filter(isQuotationRejected);

    const pendingValue = pending.reduce(
      (sum, quotation) => sum + quotationAmount(quotation),
      0,
    );

    const acceptedValue = accepted.reduce(
      (sum, quotation) => sum + quotationAmount(quotation),
      0,
    );

    const periodAccepted = periodQuotations.filter(isQuotationAccepted);
    const periodRejected = periodQuotations.filter(isQuotationRejected);

    const decidedPeriod = periodAccepted.length + periodRejected.length;
    const conversionRate =
      decidedPeriod > 0
        ? (periodAccepted.length / decidedPeriod) * 100
        : 0;

    const activeClients = data.clients.filter(
      (client) => normalize(client.estado) !== "inactivo",
    ).length;

    const activeCompanies = data.companies.filter((company) => {
      if (typeof company.is_active === "boolean") return company.is_active;
      return normalize(company.estado) !== "inactivo";
    }).length;

    const pendingCustomProposals = data.customProposals.filter((proposal) =>
      ["submitted", "in_review", "quoted"].includes(normalize(proposal.status)),
    );

    const invoicesFromQuotations = data.invoices.filter(
      (invoice) => invoice.quotation_id,
    );

    const billedFromAcceptedQuotes = invoicesFromQuotations.reduce(
      (sum, invoice) => sum + Number(invoice.monto ?? 0),
      0,
    );

    const successfulPayments = data.payments.filter(isPaymentSuccessful);
    const collectedFromPayments = successfulPayments.reduce(
      (sum, payment) => sum + paymentInEuros(payment),
      0,
    );

    const expiringQuotations = pending.filter((quotation) => {
      const validity = dateOf(quotation.fecha_validez);
      if (!validity) return false;
      const days = (validity.getTime() - now.getTime()) / 86400000;
      return days >= 0 && days <= 7;
    });

    const expiredQuotations = pending.filter((quotation) => {
      const validity = dateOf(quotation.fecha_validez);
      return Boolean(validity && isBefore(validity, now));
    });

    return {
      periodQuotations,
      pending,
      accepted,
      rejected,
      pendingValue,
      acceptedValue,
      conversionRate,
      activeClients,
      activeCompanies,
      pendingCustomProposals,
      billedFromAcceptedQuotes,
      collectedFromPayments,
      expiringQuotations,
      expiredQuotations,
    };
  }, [data, now, range]);

  const filteredQuotes = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data.quotations.slice(0, 8);

    return data.quotations
      .filter((quotation) => {
        const company = quotation.company_id
          ? companyById.get(quotation.company_id)
          : "";
        const haystack = [
          quotation.numero_presupuesto,
          quotation.titulo,
          quotation.estado,
          company,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(term);
      })
      .slice(0, 8);
  }, [companyById, data.quotations, search]);

  const upcomingFollowUps = useMemo(() => {
    const today = startOfDay(now);

    return data.quotations
      .filter(isQuotationPending)
      .map((quotation) => {
        const validity = dateOf(quotation.fecha_validez);
        const company = quotation.company_id
          ? companyById.get(quotation.company_id) || "Empresa"
          : "Empresa";

        return {
          id: quotation.id,
          title: shortText(
            quotation.numero_presupuesto,
            quotation.titulo || "Presupuesto",
          ),
          company,
          date: validity,
          amount: quotationAmount(quotation),
          status: validity && isBefore(validity, today)
            ? "expired"
            : "pending",
        } as const;
      })
      .filter((item) => item.date)
      .sort(
        (a, b) =>
          (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0),
      )
      .slice(0, 7);
  }, [companyById, data.quotations, now]);

  const latestActivity = data.activity.slice(0, 7);

  const firstName = useMemo(() => {
    const clean = data.workerName.trim();
    return clean ? clean.split(/\s+/)[0] : "Comercial";
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
                Modira · Comercial
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold text-[#354154]">
                Centro comercial
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
              {metrics.expiringQuotations.length +
                metrics.pendingCustomProposals.length >
              0 ? (
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#B07B27]" />
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
                Visión comercial
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#7F8A9A]">
                Controla el pipeline, el estado de los presupuestos, los clientes
                y las oportunidades de mantenimiento desde un único punto.
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
                <ChevronDown
                  className="h-3.5 w-3.5 text-[#9099A7]"
                  strokeWidth={1.8}
                />
              </button>

              {periodOpen ? (
                <div className="absolute right-0 top-12 z-30 w-48 rounded-xl border border-[#E1E5EA] bg-white p-1.5 shadow-[0_12px_35px_rgba(20,28,40,0.12)]">
                  {(Object.keys(periodLabels) as DashboardPeriod[]).map(
                    (option) => (
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
                          <CheckCircle2
                            className="h-3.5 w-3.5"
                            strokeWidth={1.8}
                          />
                        ) : null}
                      </button>
                    ),
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {errors.length > 0 ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#F1DFC7] bg-[#FFF9F1] px-4 py-3 text-xs text-[#8A673A]">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.7} />
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
                  icon={FileText}
                  label="Pipeline abierto"
                  value={euro.format(metrics.pendingValue)}
                  detail={`${number.format(metrics.pending.length)} presupuestos pendientes`}
                  onClick={() => navigate("/employee/quotations")}
                  accent="warning"
                />
                <MetricCard
                  icon={TrendingUp}
                  label="Presupuestos aceptados"
                  value={euro.format(metrics.acceptedValue)}
                  detail={`${number.format(metrics.accepted.length)} aceptados acumulados`}
                  onClick={() => navigate("/employee/quotations")}
                  accent="success"
                />
                <MetricCard
                  icon={CircleDollarSign}
                  label="Conversión"
                  value={`${metrics.conversionRate.toFixed(1)}%`}
                  detail={`${metrics.periodQuotations.length} presupuestos en el periodo`}
                  onClick={() => navigate("/employee/quotations")}
                />
                <MetricCard
                  icon={Wrench}
                  label="Oportunidades mantenimiento"
                  value={number.format(
                    metrics.pendingCustomProposals.length,
                  )}
                  detail="Propuestas pendientes de seguimiento"
                  onClick={() => navigate("/employee/maintenance/proposals")}
                />
              </>
            )}
          </div>
        </section>

        <section className="mt-3 grid overflow-hidden rounded-2xl border border-[#E1E5EA] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.02)] sm:grid-cols-2 lg:grid-cols-4">
          <SmallStat
            icon={Users}
            label="Clientes"
            value={number.format(metrics.activeClients)}
            detail="Cartera activa"
            onClick={() => navigate("/employee/clients")}
          />
          <SmallStat
            icon={Building2}
            label="Empresas"
            value={number.format(metrics.activeCompanies)}
            detail="Empresas activas"
            onClick={() => navigate("/employee/companies")}
          />
          <SmallStat
            icon={Wrench}
            label="Propuestas mantenimiento"
            value={number.format(metrics.pendingCustomProposals.length)}
            detail="Oportunidades pendientes"
            onClick={() => navigate("/employee/maintenance/proposals")}
          />
          <SmallStat
            icon={CreditCard}
            label="Facturación vinculada"
            value={euro.format(metrics.billedFromAcceptedQuotes)}
            detail="Facturas asociadas a presupuestos"
            onClick={() => navigate("/employee/billing")}
          />
        </section>

        <section className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.85fr)]">
          <div className="rounded-2xl border border-[#E1E5EA] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.02)] sm:p-6">
            <SectionHeader
              eyebrow="Pipeline comercial"
              title="Estado de presupuestos"
              description="Distribución actual de las oportunidades comerciales."
              action="Gestionar presupuestos"
              onAction={() => navigate("/employee/quotations")}
            />

            <PipelineBar
              pending={metrics.pending.length}
              accepted={metrics.accepted.length}
              rejected={metrics.rejected.length}
              total={
                metrics.pending.length +
                metrics.accepted.length +
                metrics.rejected.length
              }
            />

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-[#F7F8FA] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#919BA9]">
                  Pendiente
                </p>
                <p className="mt-2 text-2xl font-semibold text-[#253044]">
                  {euro.format(metrics.pendingValue)}
                </p>
                <p className="mt-1 text-xs text-[#8994A4]">
                  Valor potencial abierto
                </p>
              </div>

              <div className="rounded-xl bg-[#F7F8FA] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#919BA9]">
                  Aceptado
                </p>
                <p className="mt-2 text-2xl font-semibold text-[#253044]">
                  {euro.format(metrics.acceptedValue)}
                </p>
                <p className="mt-1 text-xs text-[#8994A4]">
                  Valor de presupuestos aceptados
                </p>
              </div>

              <div className="rounded-xl bg-[#F7F8FA] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#919BA9]">
                  Conversión
                </p>
                <p className="mt-2 text-2xl font-semibold text-[#253044]">
                  {metrics.conversionRate.toFixed(1)}%
                </p>
                <p className="mt-1 text-xs text-[#8994A4]">
                  Aceptados frente a rechazados
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E1E5EA] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.02)] sm:p-6">
            <SectionHeader
              eyebrow="Seguimiento"
              title="Presupuestos a vigilar"
              description="Vencidos o próximos a vencer."
              action="Ver todos"
              onAction={() => navigate("/employee/quotations")}
            />

            <div className="mt-4 border-t border-[#EEF1F4]">
              {metrics.expiredQuotations.length === 0 &&
              metrics.expiringQuotations.length === 0 ? (
                <div className="py-8 text-sm text-[#8B95A4]">
                  No hay presupuestos que requieran seguimiento inmediato.
                </div>
              ) : (
                [
                  ...metrics.expiredQuotations.slice(0, 3),
                  ...metrics.expiringQuotations.slice(0, 4),
                ]
                  .filter(
                    (quotation, index, array) =>
                      array.findIndex((item) => item.id === quotation.id) ===
                      index,
                  )
                  .slice(0, 6)
                  .map((quotation) => (
                    <FollowUpRow
                      key={quotation.id}
                      title={shortText(
                        quotation.numero_presupuesto,
                        quotation.titulo || "Presupuesto",
                      )}
                      company={
                        quotation.company_id
                          ? companyById.get(quotation.company_id) || "Empresa"
                          : "Empresa"
                      }
                      date={dateOf(quotation.fecha_validez)}
                      amount={quotationAmount(quotation)}
                      status={
                        dateOf(quotation.fecha_validez) &&
                        isBefore(
                          dateOf(quotation.fecha_validez) as Date,
                          now,
                        )
                          ? "expired"
                          : "pending"
                      }
                      onClick={() =>
                        navigate(`/employee/quotations/${quotation.id}`)
                      }
                    />
                  ))
              )}
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="rounded-2xl border border-[#E1E5EA] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.02)] sm:p-6">
            <SectionHeader
              eyebrow="Presupuestos"
              title="Actividad comercial reciente"
              description="Consulta y seguimiento de las últimas oportunidades."
              action="Abrir presupuestos"
              onAction={() => navigate("/employee/quotations")}
            />

            <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#F7F8FA] px-3 py-2.5">
              <Search className="h-4 w-4 text-[#8D97A5]" strokeWidth={1.7} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar presupuesto, empresa o estado..."
                className="w-full bg-transparent text-xs text-[#354154] outline-none placeholder:text-[#A0A8B4]"
              />
            </div>

            <div className="mt-4 border-t border-[#EEF1F4]">
              {filteredQuotes.length === 0 ? (
                <div className="py-8 text-sm text-[#8B95A4]">
                  No se han encontrado presupuestos.
                </div>
              ) : (
                filteredQuotes.map((quotation) => {
                  const status = normalize(quotation.estado);
                  const statusClass =
                    status === "aceptado"
                      ? "bg-[#EDF7F3] text-[#31725F]"
                      : status === "rechazado"
                        ? "bg-[#FEF3F2] text-[#A33A32]"
                        : "bg-[#F4F5F7] text-[#6E7989]";

                  return (
                    <button
                      key={quotation.id}
                      type="button"
                      onClick={() =>
                        navigate(`/employee/quotations/${quotation.id}`)
                      }
                      className="flex w-full items-center gap-3 border-b border-[#EEF1F4] py-3.5 text-left last:border-b-0"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F3F5F7]">
                        <FileText
                          className="h-4 w-4 text-[#657287]"
                          strokeWidth={1.7}
                        />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[#354154]">
                          {shortText(
                            quotation.numero_presupuesto,
                            quotation.titulo || "Presupuesto",
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-[#9099A7]">
                          {quotation.company_id
                            ? companyById.get(quotation.company_id) || "Empresa"
                            : "Empresa"}
                          {quotation.fecha_emision
                            ? ` · ${format(
                                new Date(quotation.fecha_emision),
                                "d MMM",
                                { locale: es },
                              )}`
                            : ""}
                        </span>
                      </span>

                      <span className="hidden shrink-0 text-sm font-semibold text-[#465368] sm:block">
                        {euro.format(quotationAmount(quotation))}
                      </span>

                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusClass}`}
                      >
                        {status === "aceptado"
                          ? "Aceptado"
                          : status === "rechazado"
                            ? "Rechazado"
                            : "Pendiente"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#E1E5EA] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.02)] sm:p-6">
            <SectionHeader
              eyebrow="Mantenimiento"
              title="Oportunidades activas"
              description="Propuestas de mantenimiento que necesitan seguimiento."
              action="Ver propuestas"
              onAction={() => navigate("/employee/maintenance/proposals")}
            />

            <div className="mt-4 border-t border-[#EEF1F4]">
              {metrics.pendingCustomProposals
                .map((proposal) => ({
                  id: proposal.id,
                  title: shortText(proposal.title, "Propuesta personalizada"),
                  status: proposal.status || "submitted",
                  company: proposal.company_id
                    ? companyById.get(proposal.company_id) || "Empresa"
                    : "Empresa",
                  amount: Number(proposal.monthly_price ?? 0),
                  custom: true,
                }))
                .slice(0, 6)
                .map((proposal) => (
                  <button
                    key={`${proposal.custom ? "custom" : "standard"}-${proposal.id}`}
                    type="button"
                    onClick={() =>
                      navigate(
                        `/employee/maintenance/proposals/custom/${proposal.id}`,
                      )
                    }
                    className="flex w-full items-center gap-3 border-b border-[#EEF1F4] py-3.5 text-left last:border-b-0"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F3F5F7]">
                      <Wrench
                        className="h-4 w-4 text-[#657287]"
                        strokeWidth={1.7}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[#354154]">
                        {proposal.title}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[#9099A7]">
                        {proposal.company}
                        {proposal.status ? ` · ${proposal.status}` : ""}
                      </span>
                    </span>
                    {proposal.amount > 0 ? (
                      <span className="shrink-0 text-xs font-semibold text-[#4D5A6D]">
                        {euro.format(proposal.amount)}
                        <span className="font-normal text-[#929BA8]">/mes</span>
                      </span>
                    ) : null}
                  </button>
                ))}

              {metrics.pendingCustomProposals.length === 0 ? (
                <div className="py-8 text-sm text-[#8B95A4]">
                  No hay propuestas de mantenimiento pendientes.
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="rounded-2xl border border-[#E1E5EA] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.02)] sm:p-6">
            <SectionHeader
              eyebrow="Cartera"
              title="Clientes y empresas"
              description="Seguimiento de la base comercial y su actividad reciente."
              action="Ver clientes"
              onAction={() => navigate("/employee/clients")}
            />

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-[#F7F8FA] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#919BA9]">
                  Clientes activos
                </p>
                <p className="mt-2 text-2xl font-semibold text-[#253044]">
                  {number.format(metrics.activeClients)}
                </p>
                <p className="mt-1 text-xs text-[#8994A4]">
                  Personas/contacts de la cartera
                </p>
              </div>

              <div className="rounded-xl bg-[#F7F8FA] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#919BA9]">
                  Empresas activas
                </p>
                <p className="mt-2 text-2xl font-semibold text-[#253044]">
                  {number.format(metrics.activeCompanies)}
                </p>
                <p className="mt-1 text-xs text-[#8994A4]">
                  Organizaciones disponibles para venta
                </p>
              </div>
            </div>

            <div className="mt-5 border-t border-[#EEF1F4]">
              {data.companies.slice(0, 6).map((company) => (
                <button
                  key={company.id}
                  type="button"
                  onClick={() =>
                    navigate(`/employee/companies/${company.id}`)
                  }
                  className="flex w-full items-center gap-3 border-b border-[#EEF1F4] py-3.5 text-left last:border-b-0"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F3F5F7]">
                    <Building2
                      className="h-4 w-4 text-[#657287]"
                      strokeWidth={1.7}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[#354154]">
                      {shortText(
                        company.company_name || company.razon_social,
                        "Empresa",
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[#9099A7]">
                      {data.clients.filter(
                        (client) => client.company_id === company.id,
                      ).length}{" "}
                      clientes en cartera
                    </span>
                  </span>
                  <ArrowRight
                    className="h-3.5 w-3.5 shrink-0 text-[#A5ADBA]"
                    strokeWidth={1.7}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#E1E5EA] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.02)] sm:p-6">
            <SectionHeader
              eyebrow="Actividad"
              title="Actividad reciente"
              description="Últimos movimientos relevantes del área comercial."
              action="Ver actividad"
              onAction={() => navigate("/employee/activity")}
            />

            <div className="mt-4 border-t border-[#EEF1F4]">
              {latestActivity.length === 0 ? (
                <div className="py-8 text-sm text-[#8B95A4]">
                  No hay actividad registrada.
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
                      <Activity
                        className="h-4 w-4 text-[#697588]"
                        strokeWidth={1.7}
                      />
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
                    <ArrowRight
                      className="h-3.5 w-3.5 shrink-0 text-[#A5ADBA]"
                      strokeWidth={1.7}
                    />
                  </button>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <div className="rounded-2xl border border-[#E1E5EA] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.02)] sm:p-6">
            <SectionHeader
              eyebrow="Facturación · solo lectura"
              title="Resultado de ventas"
              description="Información financiera vinculada al proceso comercial, sin capacidad de gestión."
            />

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-[#F7F8FA] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#919BA9]">
                  Facturado vinculado
                </p>
                <p className="mt-2 text-2xl font-semibold text-[#253044]">
                  {euro.format(metrics.billedFromAcceptedQuotes)}
                </p>
                <p className="mt-1 text-xs text-[#8994A4]">
                  Facturas asociadas a presupuestos
                </p>
              </div>

              <div className="rounded-xl bg-[#F7F8FA] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#919BA9]">
                  Cobrado
                </p>
                <p className="mt-2 text-2xl font-semibold text-[#253044]">
                  {euro.format(metrics.collectedFromPayments)}
                </p>
                <p className="mt-1 text-xs text-[#8994A4]">
                  Pagos confirmados visibles
                </p>
              </div>

              <div className="rounded-xl bg-[#F7F8FA] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#919BA9]">
                  Acceso
                </p>
                <p className="mt-2 text-2xl font-semibold text-[#253044]">
                  Lectura
                </p>
                <p className="mt-1 text-xs text-[#8994A4]">
                  La gestión corresponde a otros permisos
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate("/employee/billing")}
              className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#566276] hover:text-[#18212F]"
            >
              Consultar facturación
              <ArrowRight
                className="h-3.5 w-3.5"
                strokeWidth={1.8}
              />
            </button>
          </div>

          <div className="rounded-2xl border border-[#E1E5EA] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.02)] sm:p-6">
            <SectionHeader
              eyebrow="Acceso rápido"
              title="Acciones comerciales"
              description="Las acciones de escritura se muestran según el permiso efectivo."
            />

            <div className="mt-5 grid gap-2.5">
              {permissions["quotations.create"] ? (
                <QuickAction
                  icon={FileText}
                  label="Nuevo presupuesto"
                  description="Crear una nueva oportunidad comercial"
                  onClick={() => navigate("/employee/quotations/new")}
                />
              ) : null}

              {permissions["maintenance.create"] ? (
                <QuickAction
                  icon={Wrench}
                  label="Nueva propuesta de mantenimiento"
                  description="Abrir una nueva oportunidad de mantenimiento"
                  onClick={() =>
                    navigate("/employee/maintenance/proposals/new")
                  }
                />
              ) : null}

              <QuickAction
                icon={Users}
                label="Clientes"
                description="Consultar y gestionar cartera"
                onClick={() => navigate("/employee/clients")}
              />

              <QuickAction
                icon={FileText}
                label="Presupuestos"
                description="Gestionar el pipeline comercial"
                onClick={() => navigate("/employee/quotations")}
              />
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ExecutiveLink
            icon={FileText}
            title="Presupuestos"
            description="Todos, pendientes, aceptados y rechazados"
            onClick={() => navigate("/employee/quotations")}
          />
          <ExecutiveLink
            icon={Wrench}
            title="Mantenimiento"
            description="Propuestas y oportunidades comerciales"
            onClick={() => navigate("/employee/maintenance")}
          />
          <ExecutiveLink
            icon={Users}
            title="Clientes"
            description="Cartera y seguimiento comercial"
            onClick={() => navigate("/employee/clients")}
          />
          <ExecutiveLink
            icon={Building2}
            title="Empresas"
            description="Organizaciones y oportunidades"
            onClick={() => navigate("/employee/companies")}
          />
        </section>

        <footer className="mt-8 flex flex-col justify-between gap-2 border-t border-[#E1E5EA] pt-5 text-[11px] text-[#9AA3B0] sm:flex-row">
          <span>Modira · Dashboard Comercial</span>
          <span>
            Las capacidades de escritura dependen del permiso RBAC efectivo.
          </span>
        </footer>
      </main>
    </div>
  );
}
