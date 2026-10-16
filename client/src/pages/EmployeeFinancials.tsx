import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Download,
  FileText,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  WalletCards,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ProjectRow {
  id: string;
  nombre: string;
  company_id?: string | null;
}

interface CompanyRow {
  id: string;
  company_name?: string | null;
}

interface InvoiceRow {
  id: string;
  company_id?: string | null;
  project_id?: string | null;
  numero_factura?: string | null;
  monto?: number | null;
  subtotal?: number | null;
  iva_aplicado?: boolean | null;
  iva_porcentaje?: number | null;
  iva_importe?: number | null;
  irpf_aplicado?: boolean | null;
  irpf_porcentaje?: number | null;
  irpf_importe?: number | null;
  importe_a_pagar?: number | null;
  estado?: string | null;
  fecha_emision?: string | null;
  fecha_vencimiento?: string | null;
  fecha_pago?: string | null;
  descripcion?: string | null;
  created_at?: string | null;
}

interface PaymentRow {
  id: string;
  invoice_id?: string | null;
  amount?: number | null;
  currency?: string | null;
  status?: string | null;
  paid_at?: string | null;
}

interface ExpenseRow {
  id: string;
  expense_number?: string | null;
  expense_date?: string | null;
  description?: string | null;
  expense_type?: string | null;
  category_id?: string | null;
  supplier_id?: string | null;
  project_id?: string | null;
  status?: string | null;
  currency?: string | null;
  subtotal?: number | null;
  total_tax?: number | null;
  total_withholding?: number | null;
  total_amount?: number | null;
  created_at?: string | null;
}

interface SupplierRow {
  id: string;
  legal_name?: string | null;
}

interface ExpenseCategoryRow {
  id: string;
  name?: string | null;
}

function expenseStatusLabel(value?: string | null) {
  const labels: Record<string, string> = {
    draft: "Borrador",
    pending_review: "Pendiente de aprobación",
    approved: "Aprobado",
    rejected: "Rechazado",
    pending_payment: "Pendiente de pago",
    partially_paid: "Parcialmente pagado",
    paid: "Pagado",
    cancelled: "Cancelado",
  };
  return labels[String(value || "").toLowerCase()] || value || "Sin estado";
}

function isExpenseIncludedInResult(expense: ExpenseRow) {
  return ["approved", "pending_payment", "partially_paid", "paid"].includes(
    String(expense.status || "").toLowerCase()
  );
}

type PeriodPreset = "all" | "30d" | "3m" | "12m" | "custom";
type SortKey =
  | "date"
  | "project"
  | "company"
  | "subtotal"
  | "iva"
  | "irpf"
  | "total"
  | "payable";

const euro = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const integer = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 0,
});

function money(value: unknown) {
  const number = Number(value ?? 0);
  return euro.format(Number.isFinite(number) ? number : 0);
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizeStatus(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function statusLabel(value?: string | null) {
  const status = normalizeStatus(value);

  if (status === "pagada") return "Pagada";
  if (status === "vencida") return "Vencida";
  if (status === "cancelada") return "Cancelada";
  if (status === "pendiente") return "Pendiente";

  return value?.trim() || "Sin estado";
}

function statusClass(value?: string | null) {
  const status = normalizeStatus(value);

  if (status === "pagada") {
    return "border-none bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
  }

  if (status === "vencida") {
    return "border-none bg-red-50 text-red-700 hover:bg-red-50";
  }

  if (status === "cancelada") {
    return "border-none bg-slate-100 text-slate-600 hover:bg-slate-100";
  }

  return "border-none bg-amber-50 text-amber-700 hover:bg-amber-50";
}

function dateOnly(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
    .format(date)
    .replace(".", "");
}

function isPaid(invoice: InvoiceRow) {
  return normalizeStatus(invoice.estado) === "pagada";
}

function isCancelled(invoice: InvoiceRow) {
  return normalizeStatus(invoice.estado) === "cancelada";
}

function outstanding(invoice: InvoiceRow) {
  if (isPaid(invoice) || isCancelled(invoice)) return 0;
  return Math.max(
    0,
    numberValue(invoice.importe_a_pagar ?? invoice.monto)
  );
}

function paymentSucceeded(payment: PaymentRow) {
  return normalizeStatus(payment.status) === "succeeded";
}

function paymentEuros(payment: PaymentRow) {
  return numberValue(payment.amount) / 100;
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function getPresetDates(preset: Exclude<PeriodPreset, "all" | "custom">) {
  const end = new Date();
  const start = new Date(end);

  if (preset === "30d") {
    start.setDate(start.getDate() - 30);
  } else if (preset === "3m") {
    start.setMonth(start.getMonth() - 3);
  } else {
    start.setFullYear(start.getFullYear() - 1);
  }

  return {
    start: dateOnly(start.toISOString()),
    end: dateOnly(end.toISOString()),
  };
}

export default function EmployeeFinancials() {
  const { user } = useAuth();

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategoryRow[]>([]);
  const [canReadExpenses, setCanReadExpenses] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("12m");
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const presetDates = useMemo(() => {
    if (periodPreset === "custom") return null;
    if (periodPreset === "all") return null;
    return getPresetDates(periodPreset);
  }, [periodPreset]);

  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ivaFilter, setIvaFilter] = useState("all");
  const [irpfFilter, setIrpfFilter] = useState("all");

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const navigate = useCallback((path: string) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  const loadData = useCallback(
    async (refresh = false) => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      if (refresh) setRefreshing(true);
      else setLoading(true);

      setError("");

      try {
        const expensePermissionResult = await supabase.rpc(
          "current_worker_has_permission",
          { p_permission_code: "expenses.read" }
        );
        const mayReadExpenses =
          !expensePermissionResult.error && expensePermissionResult.data === true;

        const [invoiceResult, projectResult, companyResult, paymentResult, expenseResult, supplierResult, categoryResult] =
          await Promise.all([
            supabase
              .from("invoices")
              .select(
                [
                  "id",
                  "company_id",
                  "project_id",
                  "numero_factura",
                  "monto",
                  "subtotal",
                  "iva_aplicado",
                  "iva_porcentaje",
                  "iva_importe",
                  "irpf_aplicado",
                  "irpf_porcentaje",
                  "irpf_importe",
                  "importe_a_pagar",
                  "estado",
                  "fecha_emision",
                  "fecha_vencimiento",
                  "fecha_pago",
                  "descripcion",
                  "created_at",
                ].join(", ")
              )
              .order("fecha_emision", { ascending: false }),

            supabase
              .from("projects")
              .select("id, nombre, company_id")
              .order("nombre", { ascending: true }),

            supabase
              .from("companies")
              .select("id, company_name")
              .order("company_name", { ascending: true }),

            supabase
              .from("payments")
              .select("id, invoice_id, amount, currency, status, paid_at")
              .order("paid_at", { ascending: false }),

            mayReadExpenses
              ? supabase.from("expenses").select("id, expense_number, expense_date, description, expense_type, category_id, supplier_id, project_id, status, currency, subtotal, total_tax, total_withholding, total_amount, created_at").order("expense_date", { ascending: false })
              : Promise.resolve({ data: [], error: null }),

            mayReadExpenses
              ? supabase.from("suppliers").select("id, legal_name")
              : Promise.resolve({ data: [], error: null }),

            mayReadExpenses
              ? supabase.from("expense_categories").select("id, name")
              : Promise.resolve({ data: [], error: null }),
          ]);

        const firstError =
          invoiceResult.error ||
          projectResult.error ||
          companyResult.error ||
          paymentResult.error ||
          expenseResult.error ||
          supplierResult.error ||
          categoryResult.error;

        if (firstError) throw firstError;

        setCanReadExpenses(mayReadExpenses);
        setExpenses((expenseResult.data || []) as ExpenseRow[]);
        setSuppliers((supplierResult.data || []) as SupplierRow[]);
        setExpenseCategories((categoryResult.data || []) as ExpenseCategoryRow[]);

        setInvoices((invoiceResult.data || []) as InvoiceRow[]);
        setProjects((projectResult.data || []) as ProjectRow[]);
        setCompanies((companyResult.data || []) as CompanyRow[]);
        setPayments((paymentResult.data || []) as PaymentRow[]);
      } catch (err: any) {
        console.error("[EmployeeFinancials] Error loading financial data:", err);
        setError(
          err?.message ||
            "No se ha podido cargar la información financiera."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id]
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const companyById = useMemo(() => {
    const map = new Map<string, CompanyRow>();
    companies.forEach((company) => map.set(company.id, company));
    return map;
  }, [companies]);

  const projectById = useMemo(() => {
    const map = new Map<string, ProjectRow>();
    projects.forEach((project) => map.set(project.id, project));
    return map;
  }, [projects]);

  const supplierById = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier.legal_name || "Sin proveedor"])),
    [suppliers]
  );

  const expenseCategoryById = useMemo(
    () => new Map(expenseCategories.map((category) => [category.id, category.name || "Sin categoría"])),
    [expenseCategories]
  );

  const paymentByInvoice = useMemo(() => {
    const map = new Map<string, PaymentRow>();

    for (const payment of payments) {
      if (!payment.invoice_id || !paymentSucceeded(payment)) continue;
      if (!map.has(payment.invoice_id)) {
        map.set(payment.invoice_id, payment);
      }
    }

    return map;
  }, [payments]);

  const periodStart = useMemo(() => {
    if (periodPreset === "custom") return customStart;
    return presetDates?.start || "";
  }, [customStart, periodPreset, presetDates]);

  const periodEnd = useMemo(() => {
    if (periodPreset === "custom") return customEnd;
    return presetDates?.end || "";
  }, [customEnd, periodPreset, presetDates]);

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();

    const rows = invoices.filter((invoice) => {
      const project = invoice.project_id
        ? projectById.get(invoice.project_id)
        : undefined;

      const company = invoice.company_id
        ? companyById.get(invoice.company_id)
        : undefined;

      const invoiceDate = dateOnly(
        invoice.fecha_emision || invoice.created_at
      );

      const matchesDate =
        (!periodStart || invoiceDate >= periodStart) &&
        (!periodEnd || invoiceDate <= periodEnd);

      const matchesSearch =
        !query ||
        [
          invoice.numero_factura,
          invoice.descripcion,
          project?.nombre,
          company?.company_name,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(query)
          );

      const matchesCompany =
        companyFilter === "all" || invoice.company_id === companyFilter;

      const matchesProject =
        projectFilter === "all" || invoice.project_id === projectFilter;

      const matchesStatus =
        statusFilter === "all" ||
        normalizeStatus(invoice.estado) === statusFilter;

      const matchesIva =
        ivaFilter === "all" ||
        (ivaFilter === "applied"
          ? invoice.iva_aplicado === true
          : invoice.iva_aplicado === false);

      const matchesIrpf =
        irpfFilter === "all" ||
        (irpfFilter === "applied"
          ? invoice.irpf_aplicado === true
          : invoice.irpf_aplicado === false);

      return (
        matchesDate &&
        matchesSearch &&
        matchesCompany &&
        matchesProject &&
        matchesStatus &&
        matchesIva &&
        matchesIrpf
      );
    });

    rows.sort((a, b) => {
      const projectA = a.project_id
        ? projectById.get(a.project_id)?.nombre || ""
        : "";
      const projectB = b.project_id
        ? projectById.get(b.project_id)?.nombre || ""
        : "";

      const companyA = a.company_id
        ? companyById.get(a.company_id)?.company_name || ""
        : "";
      const companyB = b.company_id
        ? companyById.get(b.company_id)?.company_name || ""
        : "";

      const values: Record<SortKey, string | number> = {
        date: new Date(
          a.fecha_emision || a.created_at || 0
        ).getTime(),
        project: projectA.toLowerCase(),
        company: companyA.toLowerCase(),
        subtotal: numberValue(a.subtotal),
        iva: numberValue(a.iva_importe),
        irpf: numberValue(a.irpf_importe),
        total: numberValue(a.monto),
        payable: numberValue(a.importe_a_pagar ?? a.monto),
      };

      const otherValues: Record<SortKey, string | number> = {
        date: new Date(
          b.fecha_emision || b.created_at || 0
        ).getTime(),
        project: projectB.toLowerCase(),
        company: companyB.toLowerCase(),
        subtotal: numberValue(b.subtotal),
        iva: numberValue(b.iva_importe),
        irpf: numberValue(b.irpf_importe),
        total: numberValue(b.monto),
        payable: numberValue(b.importe_a_pagar ?? b.monto),
      };

      const first = values[sortKey];
      const second = otherValues[sortKey];

      if (typeof first === "string" && typeof second === "string") {
        return sortAsc
          ? first.localeCompare(second, "es")
          : second.localeCompare(first, "es");
      }

      const difference = Number(first) - Number(second);
      return sortAsc ? difference : -difference;
    });

    return rows;
  }, [
    companyById,
    companyFilter,
    invoices,
    irpfFilter,
    ivaFilter,
    periodEnd,
    periodStart,
    projectById,
    projectFilter,
    search,
    sortAsc,
    sortKey,
    statusFilter,
  ]);

  const filteredExpenses = useMemo(() => {
    const query = search.trim().toLowerCase();

    return expenses
      .filter((expense) => {
        const expenseDate = dateOnly(expense.expense_date || expense.created_at);
        const matchesDate =
          (!periodStart || expenseDate >= periodStart) &&
          (!periodEnd || expenseDate <= periodEnd);
        const project = expense.project_id ? projectById.get(expense.project_id) : undefined;
        const matchesCompany =
          companyFilter === "all" || project?.company_id === companyFilter;
        const matchesProject =
          projectFilter === "all" || expense.project_id === projectFilter;
        const matchesSearch =
          !query ||
          [
            expense.expense_number,
            expense.description,
            project?.nombre,
            project?.company_id ? companyById.get(project.company_id)?.company_name : "",
            supplierById.get(expense.supplier_id || ""),
            expenseCategoryById.get(expense.category_id || ""),
            expenseStatusLabel(expense.status),
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query));

        return matchesDate && matchesCompany && matchesProject && matchesSearch;
      })
      .sort((a, b) => {
        const dateA = new Date(a.expense_date || a.created_at || 0).getTime();
        const dateB = new Date(b.expense_date || b.created_at || 0).getTime();
        return sortAsc ? dateA - dateB : dateB - dateA;
      });
  }, [
    expenses,
    periodStart,
    periodEnd,
    companyFilter,
    projectFilter,
    search,
    projectById,
    companyById,
    supplierById,
    expenseCategoryById,
    sortAsc,
  ]);

  const financialSummary = useMemo(() => {
    const active = filteredInvoices.filter((invoice) => !isCancelled(invoice));

    const subtotal = active.reduce(
      (sum, invoice) => sum + numberValue(invoice.subtotal),
      0
    );

    const iva = active.reduce(
      (sum, invoice) => sum + numberValue(invoice.iva_importe),
      0
    );

    const irpf = active.reduce(
      (sum, invoice) => sum + numberValue(invoice.irpf_importe),
      0
    );

    const total = active.reduce(
      (sum, invoice) => sum + numberValue(invoice.monto),
      0
    );

    const payable = active.reduce(
      (sum, invoice) =>
        sum + numberValue(invoice.importe_a_pagar ?? invoice.monto),
      0
    );

    const pending = active.reduce(
      (sum, invoice) => sum + outstanding(invoice),
      0
    );

    const paidCount = active.filter(isPaid).length;

    const collected = active.reduce((sum, invoice) => {
      const payment = paymentByInvoice.get(invoice.id);
      return sum + (payment ? paymentEuros(payment) : 0);
    }, 0);

    const projects = new Set(
      active.map((invoice) => invoice.project_id).filter(Boolean)
    );

    const companies = new Set(
      active.map((invoice) => invoice.company_id).filter(Boolean)
    );

    return {
      subtotal,
      iva,
      irpf,
      total,
      payable,
      pending,
      collected,
      paidCount,
      invoiceCount: active.length,
      projectCount: projects.size,
      companyCount: companies.size,
      expenseCount: filteredExpenses.filter(isExpenseIncludedInResult).length,
      expenseBase: filteredExpenses
        .filter(isExpenseIncludedInResult)
        .reduce((sum, expense) => sum + numberValue(expense.subtotal), 0),
      expenseTotal: filteredExpenses
        .filter(isExpenseIncludedInResult)
        .reduce((sum, expense) => sum + numberValue(expense.total_amount), 0),
      operatingResult: subtotal - filteredExpenses
        .filter(isExpenseIncludedInResult)
        .reduce((sum, expense) => sum + numberValue(expense.subtotal), 0),
    };
  }, [filteredInvoices, paymentByInvoice, filteredExpenses]);

  const activeFiltersCount = [
    companyFilter !== "all",
    projectFilter !== "all",
    statusFilter !== "all",
    ivaFilter !== "all",
    irpfFilter !== "all",
    search.trim().length > 0,
    periodPreset !== "12m",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearch("");
    setCompanyFilter("all");
    setProjectFilter("all");
    setStatusFilter("all");
    setIvaFilter("all");
    setIrpfFilter("all");
    setPeriodPreset("12m");
    setCustomStart("");
    setCustomEnd("");
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((value) => !value);
      return;
    }

    setSortKey(key);
    setSortAsc(false);
  };

  const exportCsv = () => {
    const headers = [
      "Tipo",
      "Número",
      "Fecha",
      "Proyecto",
      "Empresa / proveedor",
      "Categoría / descripción",
      "Base imponible",
      "IVA / impuestos",
      "Retenciones / IRPF",
      "Total",
      "Importe a cobrar/pagar",
      "Estado",
      "Vencimiento",
      "Fecha de pago",
    ];

    const invoiceRows = filteredInvoices.map((invoice) => {
      const project = invoice.project_id ? projectById.get(invoice.project_id) : undefined;
      const company = invoice.company_id ? companyById.get(invoice.company_id) : undefined;
      return [
        "Ingreso · Factura",
        invoice.numero_factura,
        dateOnly(invoice.fecha_emision || invoice.created_at),
        project?.nombre,
        company?.company_name,
        invoice.descripcion,
        numberValue(invoice.subtotal).toFixed(2),
        numberValue(invoice.iva_importe).toFixed(2),
        numberValue(invoice.irpf_importe).toFixed(2),
        numberValue(invoice.monto).toFixed(2),
        numberValue(invoice.importe_a_pagar ?? invoice.monto).toFixed(2),
        statusLabel(invoice.estado),
        dateOnly(invoice.fecha_vencimiento),
        dateOnly(invoice.fecha_pago),
      ];
    });

    const expenseRows = filteredExpenses.map((expense) => {
      const project = expense.project_id ? projectById.get(expense.project_id) : undefined;
      const company = project?.company_id ? companyById.get(project.company_id) : undefined;
      return [
        "Gasto",
        expense.expense_number,
        dateOnly(expense.expense_date || expense.created_at),
        project?.nombre || "Gasto interno",
        supplierById.get(expense.supplier_id || "") || company?.company_name || "—",
        expense.description || expenseCategoryById.get(expense.category_id || ""),
        numberValue(expense.subtotal).toFixed(2),
        numberValue(expense.total_tax).toFixed(2),
        numberValue(expense.total_withholding).toFixed(2),
        numberValue(expense.total_amount).toFixed(2),
        numberValue(expense.total_amount).toFixed(2),
        expenseStatusLabel(expense.status),
        "",
        "",
      ];
    });

    const rows = [...invoiceRows, ...expenseRows];
    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(";"))
      .join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `modira-finanzas-${dateOnly(new Date().toISOString())}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const periodLabel =
    periodPreset === "all"
      ? "Todo el periodo"
      : periodPreset === "30d"
        ? "Últimos 30 días"
        : periodPreset === "3m"
          ? "Últimos 3 meses"
          : periodPreset === "12m"
            ? "Últimos 12 meses"
            : customStart || customEnd
              ? `${customStart || "…"} → ${customEnd || "…"}`
              : "Periodo personalizado";

  const periodOptions: Array<[PeriodPreset, string]> = [
    ["30d", "Últimos 30 días"],
    ["3m", "Últimos 3 meses"],
    ["12m", "Últimos 12 meses"],
    ["all", "Todo el periodo"],
    ["custom", "Personalizado"],
  ];

  if (loading) {
    return (
      <main className="min-h-full bg-[#F5F7FA] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[60vh] max-w-[1500px] items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-[#687386]">
            <Loader2 className="h-7 w-7 animate-spin text-[#1E3A8A]" />
            <p className="text-sm">Cargando información financiera…</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-[#F5F7FA] px-4 py-7 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#7B8494] transition hover:text-[#1E3A8A]"
            >
              ← Inicio
            </button>

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#EAF0FF] text-[#1E3A8A]">
                <CircleDollarSign className="h-5 w-5" />
              </div>

              <div>
                <h1 className="text-[29px] font-semibold tracking-[-0.035em] text-[#172033]">
                  Finanzas
                </h1>
                <p className="mt-0.5 text-sm text-[#707A8B]">
                  Visión económica consolidada de ingresos, gastos, impuestos y cobros.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setPeriodMenuOpen((open) => !open)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#DDE3EC] bg-white px-3.5 text-sm font-medium text-[#465166] transition hover:border-[#C9D2E0]"
              >
                <CalendarDays className="h-4 w-4 text-[#6F7A8C]" />
                {periodLabel}
                <ChevronDown className="h-3.5 w-3.5 text-[#929AAA]" />
              </button>

              {periodMenuOpen ? (
                <div className="absolute right-0 z-30 mt-2 w-52 overflow-hidden rounded-lg border border-[#E0E5ED] bg-white p-1 shadow-lg">
                  {periodOptions.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setPeriodPreset(value);
                        setPeriodMenuOpen(false);
                      }}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                        periodPreset === value
                          ? "bg-[#F1F5FF] font-medium text-[#1E3A8A]"
                          : "text-[#596477] hover:bg-[#F7F8FB]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#DDE3EC] bg-white px-3.5 text-sm font-medium text-[#465166] transition hover:border-[#C9D2E0]"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
              {activeFiltersCount > 0 ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1E3A8A] px-1.5 text-[10px] font-bold text-white">
                  {activeFiltersCount}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => void loadData(true)}
              disabled={refreshing}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#DDE3EC] bg-white px-3.5 text-sm font-medium text-[#465166] transition hover:border-[#C9D2E0] disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  refreshing ? "animate-spin" : ""
                }`}
              />
              Actualizar
            </button>

            <button
              type="button"
              onClick={exportCsv}
              disabled={!filteredInvoices.length && !filteredExpenses.length}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1E3A8A] px-4 text-sm font-semibold text-white transition hover:bg-[#193273] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Exportar
            </button>
          </div>
        </header>

        {error ? (
          <div className="mb-6 flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">No se ha podido cargar todo.</p>
              <p className="mt-0.5 text-xs text-amber-700">{error}</p>
            </div>
          </div>
        ) : null}

        {filtersOpen ? (
          <section className="mb-6 border-y border-[#E2E7EE] bg-white px-5 py-5 sm:px-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#263044]">
                  Filtros financieros
                </p>
                <p className="mt-0.5 text-xs text-[#8A93A3]">
                  Combina empresa, proyecto, estado y fiscalidad.
                </p>
              </div>

              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6C7789] hover:text-[#1E3A8A]"
              >
                <X className="h-3.5 w-3.5" />
                Limpiar
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#6D7789]">
                  Empresa
                </span>
                <select
                  value={companyFilter}
                  onChange={(event) =>
                    setCompanyFilter(event.target.value)
                  }
                  className="h-10 w-full rounded-lg border border-[#DDE3EC] bg-white px-3 text-sm text-[#465166] outline-none focus:border-[#AAB9D5]"
                >
                  <option value="all">Todas</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.company_name || "Sin nombre"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#6D7789]">
                  Proyecto
                </span>
                <select
                  value={projectFilter}
                  onChange={(event) =>
                    setProjectFilter(event.target.value)
                  }
                  className="h-10 w-full rounded-lg border border-[#DDE3EC] bg-white px-3 text-sm text-[#465166] outline-none focus:border-[#AAB9D5]"
                >
                  <option value="all">Todos</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#6D7789]">
                  Estado
                </span>
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value)
                  }
                  className="h-10 w-full rounded-lg border border-[#DDE3EC] bg-white px-3 text-sm text-[#465166] outline-none focus:border-[#AAB9D5]"
                >
                  <option value="all">Todos</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="pagada">Pagada</option>
                  <option value="vencida">Vencida</option>
                  <option value="cancelada">Cancelada</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#6D7789]">
                  IVA
                </span>
                <select
                  value={ivaFilter}
                  onChange={(event) => setIvaFilter(event.target.value)}
                  className="h-10 w-full rounded-lg border border-[#DDE3EC] bg-white px-3 text-sm text-[#465166] outline-none focus:border-[#AAB9D5]"
                >
                  <option value="all">Todos</option>
                  <option value="applied">Aplicado</option>
                  <option value="not_applied">No aplicado</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#6D7789]">
                  IRPF
                </span>
                <select
                  value={irpfFilter}
                  onChange={(event) =>
                    setIrpfFilter(event.target.value)
                  }
                  className="h-10 w-full rounded-lg border border-[#DDE3EC] bg-white px-3 text-sm text-[#465166] outline-none focus:border-[#AAB9D5]"
                >
                  <option value="all">Todos</option>
                  <option value="applied">Aplicado</option>
                  <option value="not_applied">No aplicado</option>
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-[#6D7789]">
                    Desde
                  </span>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(event) => {
                      setCustomStart(event.target.value);
                      setPeriodPreset("custom");
                    }}
                    className="h-10 w-full rounded-lg border border-[#DDE3EC] bg-white px-2.5 text-xs text-[#465166] outline-none focus:border-[#AAB9D5]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-[#6D7789]">
                    Hasta
                  </span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(event) => {
                      setCustomEnd(event.target.value);
                      setPeriodPreset("custom");
                    }}
                    className="h-10 w-full rounded-lg border border-[#DDE3EC] bg-white px-2.5 text-xs text-[#465166] outline-none focus:border-[#AAB9D5]"
                  />
                </label>
              </div>
            </div>
          </section>
        ) : null}

        <section className={`mb-7 grid gap-4 sm:grid-cols-2 ${canReadExpenses ? "xl:grid-cols-8" : "xl:grid-cols-6"}`}>
          <div className="border-b border-[#E1E6ED] pb-4">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#8A93A3]">
              Facturas
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#172033]">
              {integer.format(financialSummary.invoiceCount)}
            </p>
            <p className="mt-1 text-xs text-[#929AAA]">
              {integer.format(financialSummary.projectCount)} proyectos
            </p>
          </div>

          <div className="border-b border-[#E1E6ED] pb-4">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#8A93A3]">
              Base imponible
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#172033]">
              {money(financialSummary.subtotal)}
            </p>
            <p className="mt-1 text-xs text-[#929AAA]">
              Valor antes de IVA
            </p>
          </div>

          <div className="border-b border-[#E1E6ED] pb-4">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#8A93A3]">
              IVA
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#172033]">
              {money(financialSummary.iva)}
            </p>
            <p className="mt-1 text-xs text-[#929AAA]">
              IVA repercutido
            </p>
          </div>

          <div className="border-b border-[#E1E6ED] pb-4">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#8A93A3]">
              IRPF
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#172033]">
              {money(financialSummary.irpf)}
            </p>
            <p className="mt-1 text-xs text-[#929AAA]">
              Retenciones registradas
            </p>
          </div>

          <div className="border-b border-[#E1E6ED] pb-4">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#8A93A3]">
              Total facturado
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#172033]">
              {money(financialSummary.total)}
            </p>
            <p className="mt-1 text-xs text-[#929AAA]">
              Base + IVA
            </p>
          </div>

          <div className="border-b border-[#E1E6ED] pb-4">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#8A93A3]">
              A cobrar
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#1E3A8A]">
              {money(financialSummary.pending)}
            </p>
            <p className="mt-1 text-xs text-[#929AAA]">
              {integer.format(financialSummary.paidCount)} pagadas
            </p>
          </div>

          {canReadExpenses ? (
            <>
              <div className="border-b border-[#E1E6ED] pb-4">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#8A93A3]">Gastos computables</p>
                <p className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#172033]">{money(financialSummary.expenseTotal)}</p>
                <p className="mt-1 text-xs text-[#929AAA]">Aprobados, pendientes de pago o pagados</p>
              </div>
              <div className="border-b border-[#E1E6ED] pb-4">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#8A93A3]">Resultado estimado</p>
                <p className={`mt-1 text-2xl font-semibold tracking-[-0.03em] ${financialSummary.operatingResult < 0 ? "text-red-700" : "text-emerald-700"}`}>{money(financialSummary.operatingResult)}</p>
                <p className="mt-1 text-xs text-[#929AAA]">Base de ingresos − base de gastos</p>
              </div>
            </>
          ) : null}
        </section>

        <section className="mb-7 border-y border-[#E1E6ED] bg-white">
          <div className="flex flex-col gap-4 border-b border-[#EDF0F4] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-[17px] font-semibold text-[#172033]">
                Registro financiero
              </h2>
              <p className="mt-1 text-xs text-[#8A93A3]">
                {integer.format(filteredInvoices.length)} facturas · importes calculados a partir de la información fiscal de cada factura.
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9AA2B0]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar factura, gasto, proyecto, empresa o proveedor…"
                className="h-10 w-full rounded-lg border border-[#DDE3EC] bg-white pl-9 pr-3 text-sm text-[#465166] outline-none placeholder:text-[#A1A8B4] focus:border-[#AAB9D5]"
              />
            </div>
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[1180px] border-collapse">
              <thead>
                <tr className="border-b border-[#E8ECF1] text-left">
                  {[
                    ["date", "Fecha"],
                    ["project", "Proyecto"],
                    ["company", "Empresa"],
                    ["subtotal", "Base"],
                    ["iva", "IVA"],
                    ["irpf", "IRPF"],
                    ["total", "Total"],
                    ["payable", "A pagar"],
                  ].map(([key, label]) => (
                    <th
                      key={key}
                      className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8A93A3] first:pl-6"
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(key as SortKey)}
                        className="inline-flex items-center gap-1.5 hover:text-[#1E3A8A]"
                      >
                        {label}
                        {sortKey === key ? (
                          sortAsc ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : null}
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8A93A3]">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8A93A3] last:pr-6">
                    Detalle
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredInvoices.map((invoice) => {
                  const project = invoice.project_id
                    ? projectById.get(invoice.project_id)
                    : undefined;

                  const company = invoice.company_id
                    ? companyById.get(invoice.company_id)
                    : undefined;

                  const expanded = expandedId === invoice.id;

                  return (
                    <tr
                      key={invoice.id}
                      className="border-b border-[#F0F2F5] align-top last:border-b-0"
                    >
                      <td className="px-4 py-4 pl-6">
                        <p className="text-sm font-medium text-[#3B4556]">
                          {formatDate(
                            invoice.fecha_emision || invoice.created_at
                          )}
                        </p>
                        <p className="mt-1 text-xs text-[#9AA2B0]">
                          {invoice.numero_factura || "Sin número"}
                        </p>
                      </td>

                      <td className="max-w-[220px] px-4 py-4">
                        <p className="truncate text-sm font-semibold text-[#344055]">
                          {project?.nombre || "Sin proyecto"}
                        </p>
                        {invoice.descripcion ? (
                          <p className="mt-1 truncate text-xs text-[#929AAA]">
                            {invoice.descripcion}
                          </p>
                        ) : null}
                      </td>

                      <td className="max-w-[190px] px-4 py-4">
                        <p className="truncate text-sm text-[#4D586A]">
                          {company?.company_name || "Sin empresa"}
                        </p>
                      </td>

                      <td className="px-4 py-4 text-sm font-medium text-[#3B4556]">
                        {money(invoice.subtotal)}
                      </td>

                      <td className="px-4 py-4">
                        <p className="text-sm font-medium text-[#3B4556]">
                          {money(invoice.iva_importe)}
                        </p>
                        <p className="mt-1 text-[11px] text-[#929AAA]">
                          {invoice.iva_aplicado
                            ? `${numberValue(
                                invoice.iva_porcentaje
                              ).toLocaleString("es-ES")} %`
                            : "No aplicado"}
                        </p>
                      </td>

                      <td className="px-4 py-4">
                        <p className="text-sm font-medium text-[#3B4556]">
                          {money(invoice.irpf_importe)}
                        </p>
                        <p className="mt-1 text-[11px] text-[#929AAA]">
                          {invoice.irpf_aplicado
                            ? `${numberValue(
                                invoice.irpf_porcentaje
                              ).toLocaleString("es-ES")} %`
                            : "No aplicado"}
                        </p>
                      </td>

                      <td className="px-4 py-4 text-sm font-semibold text-[#263044]">
                        {money(invoice.monto)}
                      </td>

                      <td className="px-4 py-4 text-sm font-semibold text-[#1E3A8A]">
                        {money(
                          invoice.importe_a_pagar ?? invoice.monto
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <Badge className={statusClass(invoice.estado)}>
                          {statusLabel(invoice.estado)}
                        </Badge>
                      </td>

                      <td className="px-4 py-4 pr-6 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(
                              expanded ? null : invoice.id
                            )
                          }
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#687386] hover:text-[#1E3A8A]"
                        >
                          {expanded ? "Cerrar" : "Ver"}
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition ${
                              expanded ? "rotate-180" : ""
                            }`}
                          />
                        </button>

                        {expanded ? (
                          <div className="absolute z-20 mt-2 w-80 -translate-x-64 rounded-lg border border-[#E0E5ED] bg-white p-4 text-left shadow-lg">
                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8A93A3]">
                              Desglose fiscal
                            </p>

                            <div className="mt-3 space-y-2 text-xs">
                              <div className="flex justify-between gap-4">
                                <span className="text-[#7B8494]">
                                  Base imponible
                                </span>
                                <span className="font-medium text-[#344055]">
                                  {money(invoice.subtotal)}
                                </span>
                              </div>

                              <div className="flex justify-between gap-4">
                                <span className="text-[#7B8494]">
                                  IVA
                                </span>
                                <span className="font-medium text-[#344055]">
                                  {invoice.iva_aplicado
                                    ? `${numberValue(
                                        invoice.iva_porcentaje
                                      ).toLocaleString("es-ES")} % · ${money(
                                        invoice.iva_importe
                                      )}`
                                    : "No aplicado"}
                                </span>
                              </div>

                              <div className="flex justify-between gap-4">
                                <span className="text-[#7B8494]">
                                  Total factura
                                </span>
                                <span className="font-medium text-[#344055]">
                                  {money(invoice.monto)}
                                </span>
                              </div>

                              <div className="flex justify-between gap-4">
                                <span className="text-[#7B8494]">
                                  IRPF
                                </span>
                                <span className="font-medium text-[#344055]">
                                  {invoice.irpf_aplicado
                                    ? `${numberValue(
                                        invoice.irpf_porcentaje
                                      ).toLocaleString("es-ES")} % · ${money(
                                        invoice.irpf_importe
                                      )}`
                                    : "No aplicado"}
                                </span>
                              </div>

                              <div className="flex justify-between gap-4 border-t border-[#EDF0F4] pt-2">
                                <span className="font-medium text-[#526075]">
                                  Importe a pagar
                                </span>
                                <span className="font-semibold text-[#1E3A8A]">
                                  {money(
                                    invoice.importe_a_pagar ??
                                      invoice.monto
                                  )}
                                </span>
                              </div>

                              <div className="flex justify-between gap-4">
                                <span className="text-[#7B8494]">
                                  Vencimiento
                                </span>
                                <span className="text-[#344055]">
                                  {formatDate(
                                    invoice.fecha_vencimiento
                                  )}
                                </span>
                              </div>

                              {paymentByInvoice.has(invoice.id) ? (
                                <div className="flex justify-between gap-4">
                                  <span className="text-[#7B8494]">
                                    Cobrado
                                  </span>
                                  <span className="font-medium text-emerald-700">
                                    {money(
                                      paymentEuros(
                                        paymentByInvoice.get(
                                          invoice.id
                                        )!
                                      )
                                    )}
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-[#EDF0F4] lg:hidden">
            {filteredInvoices.map((invoice) => {
              const project = invoice.project_id
                ? projectById.get(invoice.project_id)
                : undefined;

              const company = invoice.company_id
                ? companyById.get(invoice.company_id)
                : undefined;

              const expanded = expandedId === invoice.id;

              return (
                <div key={invoice.id} className="px-5 py-5">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId(expanded ? null : invoice.id)
                    }
                    className="w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#344055]">
                          {project?.nombre || "Sin proyecto"}
                        </p>
                        <p className="mt-1 truncate text-xs text-[#8A93A3]">
                          {company?.company_name || "Sin empresa"}
                        </p>
                        <p className="mt-1 text-[11px] text-[#A0A8B5]">
                          {invoice.numero_factura || "Sin número"} ·{" "}
                          {formatDate(
                            invoice.fecha_emision || invoice.created_at
                          )}
                        </p>
                      </div>

                      <Badge className={statusClass(invoice.estado)}>
                        {statusLabel(invoice.estado)}
                      </Badge>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-left">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.08em] text-[#9AA2B0]">
                          Base
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[#3B4556]">
                          {money(invoice.subtotal)}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] uppercase tracking-[0.08em] text-[#9AA2B0]">
                          Total
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[#3B4556]">
                          {money(invoice.monto)}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] uppercase tracking-[0.08em] text-[#9AA2B0]">
                          IVA
                        </p>
                        <p className="mt-1 text-sm font-medium text-[#3B4556]">
                          {money(invoice.iva_importe)}
                        </p>
                        <p className="text-[10px] text-[#929AAA]">
                          {invoice.iva_aplicado
                            ? `${numberValue(
                                invoice.iva_porcentaje
                              )} %`
                            : "No aplicado"}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] uppercase tracking-[0.08em] text-[#9AA2B0]">
                          IRPF
                        </p>
                        <p className="mt-1 text-sm font-medium text-[#3B4556]">
                          {money(invoice.irpf_importe)}
                        </p>
                        <p className="text-[10px] text-[#929AAA]">
                          {invoice.irpf_aplicado
                            ? `${numberValue(
                                invoice.irpf_porcentaje
                              )} %`
                            : "No aplicado"}
                        </p>
                      </div>
                    </div>
                  </button>

                  {expanded ? (
                    <div className="mt-4 border-t border-[#EDF0F4] pt-4">
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between gap-4">
                          <span className="text-[#7B8494]">
                            Importe a pagar
                          </span>
                          <span className="font-semibold text-[#1E3A8A]">
                            {money(
                              invoice.importe_a_pagar ??
                                invoice.monto
                            )}
                          </span>
                        </div>

                        <div className="flex justify-between gap-4">
                          <span className="text-[#7B8494]">
                            Vencimiento
                          </span>
                          <span className="text-[#344055]">
                            {formatDate(invoice.fecha_vencimiento)}
                          </span>
                        </div>

                        <div className="flex justify-between gap-4">
                          <span className="text-[#7B8494]">
                            Pago registrado
                          </span>
                          <span className="text-[#344055]">
                            {paymentByInvoice.has(invoice.id)
                              ? money(
                                  paymentEuros(
                                    paymentByInvoice.get(
                                      invoice.id
                                    )!
                                  )
                                )
                              : "Sin pago exitoso"}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/employee/billing/${invoice.id}`)
                          }
                          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E3A8A]"
                        >
                          Abrir factura
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {filteredInvoices.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#F0F3F7] text-[#8791A2]">
                <FileText className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-semibold text-[#4A5567]">
                No hay registros financieros
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[#929AAA]">
                No se han encontrado facturas con los filtros seleccionados.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 text-xs font-semibold text-[#1E3A8A] hover:text-[#16306F]"
              >
                Limpiar filtros
              </button>
            </div>
          ) : null}
        </section>

        {canReadExpenses ? (
          <section className="mb-7 overflow-hidden border-y border-[#E1E6ED] bg-white">
            <div className="flex flex-col gap-2 border-b border-[#EDF0F4] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <h2 className="text-[17px] font-semibold text-[#172033]">Registro de gastos</h2>
                <p className="mt-1 text-xs text-[#8A93A3]">
                  {integer.format(filteredExpenses.length)} gastos · filtrados por la fecha del gasto y el mismo periodo seleccionado arriba.
                </p>
              </div>
              <p className="text-xs text-[#8A93A3]">Los borradores, gastos pendientes de aprobación, rechazados y cancelados se muestran, pero no se incluyen en el resultado estimado.</p>
            </div>

            {filteredExpenses.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <WalletCards className="mx-auto h-7 w-7 text-[#9AA2B0]" />
                <p className="mt-3 text-sm font-semibold text-[#4A5567]">No hay gastos en este periodo</p>
                <p className="mt-1 text-xs text-[#929AAA]">Prueba otro periodo o revisa los filtros de empresa, proyecto o búsqueda.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] border-collapse">
                  <thead>
                    <tr className="border-b border-[#E8ECF1] text-left">
                      { ["Fecha", "N.º gasto / descripción", "Proveedor / categoría", "Proyecto", "Base", "Impuestos", "Total", "Estado"].map((label) => (
                        <th key={label} className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8A93A3] first:pl-6">{label}</th>
                      )) }
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.map((expense) => {
                      const project = expense.project_id ? projectById.get(expense.project_id) : undefined;
                      const supplier = supplierById.get(expense.supplier_id || "");
                      const category = expenseCategoryById.get(expense.category_id || "");
                      const included = isExpenseIncludedInResult(expense);
                      return (
                        <tr key={expense.id} className="border-b border-[#F0F2F5] align-top last:border-b-0">
                          <td className="whitespace-nowrap px-4 py-4 pl-6 text-sm text-[#4D586A]">{formatDate(expense.expense_date || expense.created_at)}</td>
                          <td className="max-w-[260px] px-4 py-4">
                            <p className="text-sm font-semibold text-[#344055]">{expense.expense_number || "Sin número"}</p>
                            <p className="mt-1 truncate text-xs text-[#929AAA]">{expense.description || "Sin descripción"}</p>
                          </td>
                          <td className="px-4 py-4">
                            <p className="text-sm text-[#4D586A]">{supplier || "Sin proveedor"}</p>
                            <p className="mt-1 text-xs text-[#929AAA]">{category || "Sin categoría"}</p>
                          </td>
                          <td className="px-4 py-4 text-sm text-[#4D586A]">{project?.nombre || "Gasto interno"}</td>
                          <td className="whitespace-nowrap px-4 py-4 text-sm text-[#4D586A]">{money(expense.subtotal)}</td>
                          <td className="whitespace-nowrap px-4 py-4 text-sm text-[#4D586A]">{money(expense.total_tax)}</td>
                          <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-[#263044]">{money(expense.total_amount)}</td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${included ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{expenseStatusLabel(expense.status)}</span>
                            {!included ? <p className="mt-1 text-[10px] text-[#929AAA]">Fuera del resultado</p> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        <section className="border-t border-[#E1E6ED] pt-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#7B8494]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#1E3A8A]" />
              Total factura = base + IVA
            </span>

            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#7B8494]" />
              IRPF reduce el importe efectivo a pagar
            </span>

            <span className="ml-auto">
              {integer.format(financialSummary.companyCount)} empresas ·{" "}
              {integer.format(financialSummary.projectCount)} proyectos ·{" "}
              {canReadExpenses ? `${integer.format(financialSummary.expenseCount)} gastos` : "gastos no disponibles para este usuario"}
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
