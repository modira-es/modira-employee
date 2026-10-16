import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Filter,
  History,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type ExpenseStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "pending_payment"
  | "partially_paid"
  | "paid"
  | "cancelled";

type ExpenseType =
  | "supplier_invoice"
  | "employee_expense"
  | "travel"
  | "meals"
  | "corporate_card"
  | "subscription"
  | "tax"
  | "other";

type Expense = {
  id: string;
  expense_number: string;
  expense_date: string;
  description: string;
  expense_type: ExpenseType;
  category_id: string | null;
  supplier_id: string | null;
  project_id: string | null;
  status: ExpenseStatus;
  currency: string;
  subtotal: number;
  total_tax: number;
  total_withholding: number;
  total_amount: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type Supplier = { id: string; legal_name: string };
type Category = { id: string; name: string };
type Project = { id: string; nombre: string };

type TaxLine = {
  id: string;
  expense_id: string;
  tax_type: "vat" | "withholding" | "other";
  tax_rate: number;
  taxable_base: number;
  tax_amount: number;
  deductible_amount: number;
  created_at: string;
  updated_at: string;
};

type ExpenseDocument = {
  id: string;
  expense_id: string;
  document_type:
    | "invoice"
    | "receipt"
    | "payment_proof"
    | "delivery_note"
    | "other";
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  document_sha256: string;
  uploaded_by: string | null;
  uploaded_at: string;
  created_at: string;
};

type ExpensePayment = {
  id: string;
  expense_id: string;
  amount: number;
  payment_date: string;
  payment_method:
    | "bank_transfer"
    | "card"
    | "cash"
    | "direct_debit"
    | "other";
  reference: string | null;
  status: "pending" | "succeeded" | "failed" | "cancelled";
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ExpenseAllocation = {
  id: string;
  expense_id: string;
  project_id: string;
  amount: number;
  percentage: number;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type ActivityLog = {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  description: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  user_id: string | null;
};

type Permission = string;

type Props = {
  onAction?: (
    action:
      | "create"
      | "view"
      | "edit"
      | "approve"
      | "reject"
      | "pending_payment"
      | "payment"
      | "documents"
      | "allocation"
      | "history"
      | "delete",
    expense?: Expense,
  ) => void;
};

const STATUS_META: Record<
  ExpenseStatus,
  { label: string; className: string }
> = {
  draft: { label: "Borrador", className: "bg-slate-100 text-slate-700" },
  pending_review: {
    label: "Pendiente de revisión",
    className: "bg-amber-50 text-amber-700",
  },
  approved: { label: "Aprobado", className: "bg-blue-50 text-blue-700" },
  rejected: { label: "Rechazado", className: "bg-red-50 text-red-700" },
  pending_payment: {
    label: "Pendiente de pago",
    className: "bg-orange-50 text-orange-700",
  },
  partially_paid: {
    label: "Pago parcial",
    className: "bg-violet-50 text-violet-700",
  },
  paid: { label: "Pagado", className: "bg-emerald-50 text-emerald-700" },
  cancelled: {
    label: "Cancelado",
    className: "bg-slate-100 text-slate-500",
  },
};

const TYPE_LABELS: Record<ExpenseType, string> = {
  supplier_invoice: "Factura de proveedor",
  employee_expense: "Gasto de empleado",
  travel: "Viaje",
  meals: "Comidas",
  corporate_card: "Tarjeta corporativa",
  subscription: "Suscripción",
  tax: "Impuesto",
  other: "Otros",
};

const TAX_LABELS = {
  vat: "IVA",
  withholding: "Retención",
  other: "Otro",
} as const;

const DOCUMENT_LABELS = {
  invoice: "Factura",
  receipt: "Ticket / recibo",
  payment_proof: "Justificante de pago",
  delivery_note: "Albarán",
  other: "Otro",
} as const;

const PAYMENT_LABELS = {
  bank_transfer: "Transferencia",
  card: "Tarjeta",
  cash: "Efectivo",
  direct_debit: "Domiciliación",
  other: "Otro",
} as const;

const PERMISSIONS = {
  read: "expenses.read",
  create: "expenses.create",
  update: "expenses.update",
  delete: "expenses.delete",
  approve: "expenses.approve",
  pay: "expenses.pay",
  documents: "expenses.documents",
  allocate: "expenses.allocate",
} as const;

const money = (value: number, currency = "EUR") =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const dateLabel = (value: string) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
};

const dateTimeLabel = (value: string) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
};

const today = () => new Date().toISOString().slice(0, 10);

const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : String((error as { message?: string } | null)?.message ?? error);

function StatusBadge({ status }: { status: ExpenseStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

function StatCard({
  label,
  value,
  icon,
  detail,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {value}
          </p>
          {detail && <p className="mt-1 text-xs text-slate-400">{detail}</p>}
        </div>
        <div className="rounded-xl bg-slate-50 p-2.5 text-slate-600">{icon}</div>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

function Line({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 ${
        strong
          ? "text-base font-semibold text-slate-950"
          : "text-sm text-slate-600"
      }`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4"
      onClick={onClose}
    >
      <div
        className={`max-h-[92vh] w-full overflow-auto rounded-2xl bg-white shadow-2xl ${
          wide ? "max-w-5xl" : "max-w-2xl"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  required = false,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-600">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const inputClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100";

const selectClass = inputClass;

export default function Expenses({ onAction }: Props) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [permissions, setPermissions] = useState<Set<Permission>>(new Set());

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ExpenseStatus | "all">("all");
  const [type, setType] = useState<ExpenseType | "all">("all");
  const [category, setCategory] = useState("all");
  const [supplier, setSupplier] = useState("all");
  const [project, setProject] = useState("all");
  const [period, setPeriod] = useState<"month" | "quarter" | "year" | "all">(
    "month",
  );
  const [showFilters, setShowFilters] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const [selected, setSelected] = useState<Expense | null>(null);
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [panel, setPanel] = useState<
    "payments" | "documents" | "allocation" | "history" | null
  >(null);

  const [taxLines, setTaxLines] = useState<TaxLine[]>([]);
  const [documents, setDocuments] = useState<ExpenseDocument[]>([]);
  const [payments, setPayments] = useState<ExpensePayment[]>([]);
  const [allocations, setAllocations] = useState<ExpenseAllocation[]>([]);
  const [history, setHistory] = useState<ActivityLog[]>([]);

  const [form, setForm] = useState({
    expense_date: today(),
    description: "",
    expense_type: "supplier_invoice" as ExpenseType,
    category_id: "",
    supplier_id: "",
    project_id: "",
    currency: "EUR",
    subtotal: "0",
  });

  const [taxForm, setTaxForm] = useState({
    tax_type: "vat" as TaxLine["tax_type"],
    tax_rate: "21",
    taxable_base: "0",
    tax_amount: "0",
    deductible_amount: "0",
  });

  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    payment_date: new Date().toISOString().slice(0, 16),
    payment_method: "bank_transfer" as ExpensePayment["payment_method"],
    reference: "",
  });

  const [allocationForm, setAllocationForm] = useState({
    project_id: "",
    amount: "",
    description: "",
  });

  const [documentType, setDocumentType] =
    useState<ExpenseDocument["document_type"]>("invoice");

  const can = useCallback(
    (permission: string) => permissions.has(permission),
    [permissions],
  );

  const load = useCallback(async (silent = false) => {
    setError(null);
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const permissionCodes = Object.values(PERMISSIONS);
      const entries = await Promise.all(
        permissionCodes.map(async (code) => {
          const { data, error: permissionError } = await supabase.rpc(
            "current_worker_has_permission",
            { p_permission_code: code },
          );
          return [code, !permissionError && data === true] as const;
        }),
      );

      const nextPermissions = new Set<Permission>(
        entries.filter(([, allowed]) => allowed).map(([code]) => code),
      );
      setPermissions(nextPermissions);

      if (!nextPermissions.has(PERMISSIONS.read)) {
        setExpenses([]);
        setSuppliers([]);
        setCategories([]);
        setProjects([]);
        return;
      }

      const [expenseResult, supplierResult, categoryResult, projectResult] =
        await Promise.all([
          supabase.from("expenses").select("*").order("expense_date", {
            ascending: false,
          }),
          supabase.from("suppliers").select("*"),
          supabase.from("expense_categories").select("*"),
          supabase.rpc("get_worker_projects"),
        ]);

      if (expenseResult.error) throw expenseResult.error;
      if (supplierResult.error) throw supplierResult.error;
      if (categoryResult.error) throw categoryResult.error;
      if (projectResult.error) throw projectResult.error;

      const expenseRows = (expenseResult.data ?? []) as unknown as Record<
        string,
        unknown
      >[];
      setExpenses(
        expenseRows.map((row) => ({
          id: String(row.id ?? ""),
          expense_number: String(row.expense_number ?? ""),
          expense_date: String(row.expense_date ?? ""),
          description: String(row.description ?? ""),
          expense_type: String(row.expense_type ?? "other") as ExpenseType,
          category_id: row.category_id == null ? null : String(row.category_id),
          supplier_id: row.supplier_id == null ? null : String(row.supplier_id),
          project_id: row.project_id == null ? null : String(row.project_id),
          status: String(row.status ?? "draft") as ExpenseStatus,
          currency: String(row.currency ?? "EUR"),
          subtotal: Number(row.subtotal ?? 0),
          total_tax: Number(row.total_tax ?? 0),
          total_withholding: Number(row.total_withholding ?? 0),
          total_amount: Number(row.total_amount ?? 0),
          created_by: row.created_by == null ? null : String(row.created_by),
          updated_by: row.updated_by == null ? null : String(row.updated_by),
          created_at: String(row.created_at ?? ""),
          updated_at: String(row.updated_at ?? ""),
        })),
      );

      const supplierRows = (supplierResult.data ?? []) as unknown as Record<
        string,
        unknown
      >[];
      setSuppliers(
        supplierRows
          .filter((row) => row.is_active !== false)
          .map((row) => ({
            id: String(row.id ?? ""),
            legal_name: String(row.legal_name ?? ""),
          }))
          .filter((row) => row.id && row.legal_name)
          .sort((a, b) => a.legal_name.localeCompare(b.legal_name, "es")),
      );

      const categoryRows = (categoryResult.data ?? []) as unknown as Record<
        string,
        unknown
      >[];
      setCategories(
        categoryRows
          .filter((row) => row.is_active !== false)
          .map((row) => ({
            id: String(row.id ?? ""),
            name: String(row.name ?? ""),
            sort: Number(row.sort_order ?? Number.MAX_SAFE_INTEGER),
          }))
          .filter((row) => row.id && row.name)
          .sort(
            (a, b) =>
              a.sort - b.sort || a.name.localeCompare(b.name, "es"),
          )
          .map(({ sort, ...row }) => row),
      );

      const projectRows = (projectResult.data ?? []) as unknown as Record<
        string,
        unknown
      >[];
      setProjects(
        projectRows
          .map((row) => ({
            id: String(row.id ?? ""),
            nombre: String(row.nombre ?? ""),
          }))
          .filter((row) => row.id && row.nombre)
          .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      );
    } catch (err) {
      console.error("[Expenses] Load error", err);
      setError(errorMessage(err) || "No se han podido cargar los gastos.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const supplierMap = useMemo(
    () => new Map(suppliers.map((x) => [x.id, x.legal_name])),
    [suppliers],
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((x) => [x.id, x.name])),
    [categories],
  );
  const projectMap = useMemo(
    () => new Map(projects.map((x) => [x.id, x.nombre])),
    [projects],
  );

  const filtered = useMemo(() => {
    const now = new Date();
    const start = new Date(now);

    if (period === "month") start.setDate(1);
    if (period === "quarter")
      start.setMonth(Math.floor(now.getMonth() / 3) * 3, 1);
    if (period === "year") start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);

    const q = search.trim().toLowerCase();

    return expenses.filter((expense) => {
      if (
        period !== "all" &&
        new Date(expense.expense_date) < start
      )
        return false;
      if (status !== "all" && expense.status !== status) return false;
      if (type !== "all" && expense.expense_type !== type) return false;
      if (category !== "all" && expense.category_id !== category) return false;
      if (supplier !== "all" && expense.supplier_id !== supplier) return false;
      if (project !== "all" && expense.project_id !== project) return false;
      if (!q) return true;

      return [
        expense.expense_number,
        expense.description,
        supplierMap.get(expense.supplier_id ?? ""),
        categoryMap.get(expense.category_id ?? ""),
        projectMap.get(expense.project_id ?? ""),
        TYPE_LABELS[expense.expense_type],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [
    expenses,
    search,
    status,
    type,
    category,
    supplier,
    project,
    period,
    supplierMap,
    categoryMap,
    projectMap,
  ]);

  const metrics = useMemo(() => {
    const sum = (items: Expense[]) =>
      items.reduce((total, item) => total + Number(item.total_amount || 0), 0);

    const counts = Object.fromEntries(
      (Object.keys(STATUS_META) as ExpenseStatus[]).map((key) => [
        key,
        filtered.filter((x) => x.status === key).length,
      ]),
    ) as Record<ExpenseStatus, number>;

    return {
      total: sum(filtered),
      pendingReview: sum(
        filtered.filter((x) => x.status === "pending_review"),
      ),
      pendingPayment: sum(
        filtered.filter(
          (x) =>
            x.status === "pending_payment" ||
            x.status === "partially_paid",
        ),
      ),
      paid: sum(filtered.filter((x) => x.status === "paid")),
      counts,
    };
  }, [filtered]);

  const refreshSelected = useCallback(
    async (expenseId: string) => {
      const { data, error: refreshError } = await supabase
        .from("expenses")
        .select("*")
        .eq("id", expenseId)
        .maybeSingle();

      if (refreshError) throw refreshError;
      if (!data) return;

      const row = data as unknown as Record<string, unknown>;
      const next: Expense = {
        id: String(row.id),
        expense_number: String(row.expense_number ?? ""),
        expense_date: String(row.expense_date ?? ""),
        description: String(row.description ?? ""),
        expense_type: String(row.expense_type ?? "other") as ExpenseType,
        category_id: row.category_id == null ? null : String(row.category_id),
        supplier_id: row.supplier_id == null ? null : String(row.supplier_id),
        project_id: row.project_id == null ? null : String(row.project_id),
        status: String(row.status ?? "draft") as ExpenseStatus,
        currency: String(row.currency ?? "EUR"),
        subtotal: Number(row.subtotal ?? 0),
        total_tax: Number(row.total_tax ?? 0),
        total_withholding: Number(row.total_withholding ?? 0),
        total_amount: Number(row.total_amount ?? 0),
        created_by: row.created_by == null ? null : String(row.created_by),
        updated_by: row.updated_by == null ? null : String(row.updated_by),
        created_at: String(row.created_at ?? ""),
        updated_at: String(row.updated_at ?? ""),
      };

      setExpenses((current) =>
        current.map((item) => (item.id === next.id ? next : item)),
      );
      setSelected(next);
    },
    [],
  );

  const loadPanelData = useCallback(
    async (
      kind: "payments" | "documents" | "allocation" | "history",
      expenseId: string,
    ) => {
      if (kind === "payments") {
        const { data, error: e } = await supabase
          .from("expense_payments")
          .select("*")
          .eq("expense_id", expenseId)
          .order("payment_date", { ascending: false });
        if (e) throw e;
        setPayments((data ?? []) as unknown as ExpensePayment[]);
      }

      if (kind === "documents") {
        const { data, error: e } = await supabase
          .from("expense_documents")
          .select("*")
          .eq("expense_id", expenseId)
          .order("created_at", { ascending: false });
        if (e) throw e;
        setDocuments((data ?? []) as unknown as ExpenseDocument[]);
      }

      if (kind === "allocation") {
        const { data, error: e } = await supabase
          .from("expense_allocations")
          .select("*")
          .eq("expense_id", expenseId)
          .order("created_at", { ascending: true });
        if (e) throw e;
        setAllocations((data ?? []) as unknown as ExpenseAllocation[]);
        setAllocationForm((current) => ({
          ...current,
          project_id:
            current.project_id ||
            selected?.project_id ||
            projects[0]?.id ||
            "",
        }));
      }

      if (kind === "history") {
        const { data, error: e } = await supabase
          .from("activity_log")
          .select(
            "id,action,resource_type,resource_id,description,metadata,created_at,user_id",
          )
          .eq("resource_type", "expense")
          .eq("resource_id", expenseId)
          .order("created_at", { ascending: false });
        if (e) throw e;
        setHistory((data ?? []) as unknown as ActivityLog[]);
      }
    },
    [projects, selected?.project_id],
  );

  const openPanel = async (
    kind: "payments" | "documents" | "allocation" | "history",
    expense: Expense,
  ) => {
    setOpenMenu(null);
    setSelected(expense);
    setPanel(kind);
    setError(null);

    try {
      await loadPanelData(kind, expense.id);
    } catch (err) {
      setError(errorMessage(err) || "No se ha podido cargar la información.");
    }
  };

  const openCreate = () => {
    setOpenMenu(null);
    setSelected(null);
    setEditorMode("create");
    setForm({
      expense_date: today(),
      description: "",
      expense_type: "supplier_invoice",
      category_id: categories[0]?.id ?? "",
      supplier_id: "",
      project_id: "",
      currency: "EUR",
      subtotal: "0",
    });
  };

  const openEdit = (expense: Expense) => {
    setOpenMenu(null);
    setSelected(expense);
    setEditorMode("edit");
    setForm({
      expense_date: expense.expense_date.slice(0, 10),
      description: expense.description,
      expense_type: expense.expense_type,
      category_id: expense.category_id ?? "",
      supplier_id: expense.supplier_id ?? "",
      project_id: expense.project_id ?? "",
      currency: expense.currency,
      subtotal: String(expense.subtotal),
    });
  };

  const invokeExpenseRpc = useCallback(
    async (fn: string, args: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const { data, error: rpcError } = await supabase.rpc(fn, args);
        if (rpcError) throw rpcError;
        return data;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const saveExpense = async () => {
    if (!form.description.trim()) {
      setError("La descripción del gasto es obligatoria.");
      return;
    }
    if (!form.category_id) {
      setError("Debes seleccionar una categoría.");
      return;
    }

    try {
      setBusy(true);
      setError(null);

      const args = {
        p_expense_date: form.expense_date || null,
        p_description: form.description,
        p_expense_type: form.expense_type,
        p_category_id: form.category_id,
        p_supplier_id: form.supplier_id || null,
        p_project_id: form.project_id || null,
        p_currency: form.currency.toUpperCase(),
        p_subtotal: Number(form.subtotal || 0),
      };

      if (editorMode === "create") {
        const { data, error: e } = await supabase.rpc("create_expense", args);
        if (e) throw e;

        const created = data as unknown as Expense;
        setEditorMode(null);
        await load(true);
        if (created?.id) {
          const fresh = expenses.find((x) => x.id === created.id) ?? created;
          setSelected(fresh);
        }
      } else if (selected) {
        const { data, error: e } = await supabase.rpc("update_expense", {
          p_expense_id: selected.id,
          ...args,
        });
        if (e) throw e;
        setEditorMode(null);
        await load(true);
        await refreshSelected(selected.id);
      }
    } catch (err) {
      setError(errorMessage(err) || "No se ha podido guardar el gasto.");
    } finally {
      setBusy(false);
    }
  };

  const submitForReview = async (expense: Expense) => {
    if (!can(PERMISSIONS.update)) return;
    try {
      await invokeExpenseRpc("submit_expense_for_review", {
        p_expense_id: expense.id,
      });
      await load(true);
      await refreshSelected(expense.id);
    } catch (err) {
      setError(errorMessage(err) || "No se ha podido enviar a revisión.");
    }
  };

  const approveExpense = async (expense: Expense) => {
    if (!can(PERMISSIONS.approve)) return;
    try {
      await invokeExpenseRpc("approve_expense", { p_expense_id: expense.id });
      await load(true);
      await refreshSelected(expense.id);
    } catch (err) {
      setError(errorMessage(err) || "No se ha podido aprobar el gasto.");
    }
  };

  const rejectExpense = async (expense: Expense) => {
    if (!can(PERMISSIONS.approve)) return;
    try {
      await invokeExpenseRpc("reject_expense", { p_expense_id: expense.id });
      await load(true);
      await refreshSelected(expense.id);
    } catch (err) {
      setError(errorMessage(err) || "No se ha podido rechazar el gasto.");
    }
  };

  const cancelExpense = async (expense: Expense) => {
    if (!can(PERMISSIONS.update)) return;
    if (!window.confirm(`¿Cancelar el gasto ${expense.expense_number}?`)) return;
    try {
      await invokeExpenseRpc("cancel_expense", { p_expense_id: expense.id });
      await load(true);
      await refreshSelected(expense.id);
    } catch (err) {
      setError(errorMessage(err) || "No se ha podido cancelar el gasto.");
    }
  };

  const deleteExpense = async (expense: Expense) => {
    if (!can(PERMISSIONS.delete)) return;
    if (!window.confirm(`¿Eliminar definitivamente ${expense.expense_number}?`))
      return;

    try {
      await invokeExpenseRpc("delete_expense", { p_expense_id: expense.id });
      setSelected(null);
      await load(true);
    } catch (err) {
      setError(errorMessage(err) || "No se ha podido eliminar el gasto.");
    }
  };

  const addTaxLine = async () => {
    if (!selected || !can(PERMISSIONS.update)) return;
    try {
      await invokeExpenseRpc("create_expense_tax_line", {
        p_expense_id: selected.id,
        p_tax_type: taxForm.tax_type,
        p_tax_rate: Number(taxForm.tax_rate || 0),
        p_taxable_base: Number(taxForm.taxable_base || 0),
        p_tax_amount: Number(taxForm.tax_amount || 0),
        p_deductible_amount: Number(taxForm.deductible_amount || 0),
      });

      const { data, error: e } = await supabase
        .from("expense_tax_lines")
        .select("*")
        .eq("expense_id", selected.id)
        .order("created_at", { ascending: true });
      if (e) throw e;
      setTaxLines((data ?? []) as unknown as TaxLine[]);
      await load(true);
      await refreshSelected(selected.id);
      setTaxForm({
        tax_type: "vat",
        tax_rate: "21",
        taxable_base: String(selected.subtotal),
        tax_amount: "0",
        deductible_amount: "0",
      });
    } catch (err) {
      setError(errorMessage(err) || "No se ha podido añadir el impuesto.");
    }
  };

  const deleteTaxLine = async (line: TaxLine) => {
    if (!can(PERMISSIONS.update)) return;
    try {
      await invokeExpenseRpc("delete_expense_tax_line", {
        p_tax_line_id: line.id,
      });
      setTaxLines((current) => current.filter((x) => x.id !== line.id));
      if (selected) {
        await load(true);
        await refreshSelected(selected.id);
      }
    } catch (err) {
      setError(errorMessage(err) || "No se ha podido eliminar la línea fiscal.");
    }
  };

  const createPayment = async () => {
    if (!selected || !can(PERMISSIONS.pay)) return;
    try {
      await invokeExpenseRpc("create_expense_payment", {
        p_expense_id: selected.id,
        p_amount: Number(paymentForm.amount || 0),
        p_payment_date: paymentForm.payment_date
          ? new Date(paymentForm.payment_date).toISOString()
          : new Date().toISOString(),
        p_payment_method: paymentForm.payment_method,
        p_reference: paymentForm.reference || null,
      });
      setPaymentForm({
        amount: "",
        payment_date: new Date().toISOString().slice(0, 16),
        payment_method: "bank_transfer",
        reference: "",
      });
      await loadPanelData("payments", selected.id);
      await load(true);
      await refreshSelected(selected.id);
    } catch (err) {
      setError(errorMessage(err) || "No se ha podido registrar el pago.");
    }
  };

  const confirmPayment = async (payment: ExpensePayment) => {
    if (!can(PERMISSIONS.pay)) return;
    try {
      await invokeExpenseRpc("confirm_expense_payment", {
        p_payment_id: payment.id,
      });
      if (selected) {
        await loadPanelData("payments", selected.id);
        await load(true);
        await refreshSelected(selected.id);
      }
    } catch (err) {
      setError(errorMessage(err) || "No se ha podido confirmar el pago.");
    }
  };

  const cancelPayment = async (payment: ExpensePayment) => {
    if (!can(PERMISSIONS.pay)) return;
    try {
      await invokeExpenseRpc("cancel_expense_payment", {
        p_payment_id: payment.id,
      });
      if (selected) {
        await loadPanelData("payments", selected.id);
        await load(true);
        await refreshSelected(selected.id);
      }
    } catch (err) {
      setError(errorMessage(err) || "No se ha podido cancelar el pago.");
    }
  };

  const addAllocation = async () => {
    if (!selected || !can(PERMISSIONS.allocate)) return;
    if (!allocationForm.project_id) {
      setError("Selecciona un proyecto para imputar el gasto.");
      return;
    }

    try {
      await invokeExpenseRpc("create_expense_allocation", {
        p_expense_id: selected.id,
        p_project_id: allocationForm.project_id,
        p_amount: Number(allocationForm.amount || 0),
        p_description: allocationForm.description || null,
      });
      setAllocationForm({
        project_id: "",
        amount: "",
        description: "",
      });
      await loadPanelData("allocation", selected.id);
    } catch (err) {
      setError(errorMessage(err) || "No se ha podido crear la imputación.");
    }
  };

  const deleteAllocation = async (allocation: ExpenseAllocation) => {
    if (!can(PERMISSIONS.allocate)) return;
    try {
      await invokeExpenseRpc("delete_expense_allocation", {
        p_allocation_id: allocation.id,
      });
      if (selected) await loadPanelData("allocation", selected.id);
    } catch (err) {
      setError(errorMessage(err) || "No se ha podido eliminar la imputación.");
    }
  };

  const sha256 = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  };

  const uploadDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selected || !can(PERMISSIONS.documents)) return;

    if (file.type !== "application/pdf") {
      setError("El documento debe ser un PDF.");
      return;
    }
    if (file.size <= 0 || file.size > 20 * 1024 * 1024) {
      setError("El PDF debe pesar entre 1 byte y 20 MiB.");
      return;
    }

    try {
      setBusy(true);
      setError(null);

      const hash = await sha256(file);
      const path = `${selected.id}/${crypto.randomUUID()}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("expense-documents")
        .upload(path, file, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      try {
        const { error: attachError } = await supabase.rpc(
          "attach_expense_document",
          {
            p_expense_id: selected.id,
            p_document_type: documentType,
            p_file_name: file.name,
            p_storage_path: path,
            p_mime_type: "application/pdf",
            p_file_size: file.size,
            p_document_sha256: hash,
          },
        );

        if (attachError) throw attachError;
      } catch (attachError) {
        await supabase.storage.from("expense-documents").remove([path]);
        throw attachError;
      }

      await loadPanelData("documents", selected.id);
    } catch (err) {
      setError(errorMessage(err) || "No se ha podido adjuntar el documento.");
    } finally {
      setBusy(false);
    }
  };

  const deleteDocument = async (document: ExpenseDocument) => {
    if (!selected || !can(PERMISSIONS.documents)) return;
    try {
      setBusy(true);
      const { data, error: rpcError } = await supabase.rpc(
        "delete_expense_document",
        { p_document_id: document.id },
      );
      if (rpcError) throw rpcError;

      // La migración 124 devuelve la ruta para que un backend/service_role
      // pueda eliminar el objeto físico. El frontend NO intenta hacer DELETE
      // directo sobre Storage porque la migración 125 no concede ese permiso.
      void data;

      await loadPanelData("documents", selected.id);
    } catch (err) {
      setError(errorMessage(err) || "No se ha podido eliminar el documento.");
    } finally {
      setBusy(false);
    }
  };

  const openDocument = async (document: ExpenseDocument) => {
    try {
      const { data, error: e } = await supabase.storage
        .from("expense-documents")
        .createSignedUrl(document.storage_path, 60 * 10);
      if (e) throw e;
      if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
    } catch (err) {
      setError(errorMessage(err) || "No se ha podido abrir el documento.");
    }
  };

  const exportCsv = () => {
    const headers = [
      "Fecha",
      "Número",
      "Descripción",
      "Proveedor",
      "Categoría",
      "Proyecto",
      "Tipo",
      "Estado",
      "Moneda",
      "Total",
    ];

    const rows = filtered.map((item) => [
      item.expense_date,
      item.expense_number,
      item.description,
      supplierMap.get(item.supplier_id ?? "") ?? "",
      categoryMap.get(item.category_id ?? "") ?? "",
      projectMap.get(item.project_id ?? "") ?? "",
      TYPE_LABELS[item.expense_type],
      STATUS_META[item.status].label,
      item.currency,
      String(item.total_amount ?? 0),
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";"),
      )
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `gastos-${today()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const openDetail = async (expense: Expense) => {
    setOpenMenu(null);
    setSelected(expense);
    setPanel(null);
    setEditorMode(null);

    try {
      const { data, error: taxError } = await supabase
        .from("expense_tax_lines")
        .select("*")
        .eq("expense_id", expense.id)
        .order("created_at", { ascending: true });
      if (taxError) throw taxError;
      setTaxLines((data ?? []) as unknown as TaxLine[]);
    } catch (err) {
      setError(errorMessage(err) || "No se han podido cargar los impuestos.");
    }

    onAction?.("view", expense);
  };

  const dispatchAction = async (
    action:
      | "create"
      | "view"
      | "edit"
      | "approve"
      | "reject"
      | "pending_payment"
      | "payment"
      | "documents"
      | "allocation"
      | "history"
      | "delete",
    expense?: Expense,
  ) => {
    setOpenMenu(null);
    onAction?.(action, expense);

    if (action === "create") {
      openCreate();
      return;
    }
    if (!expense) return;

    if (action === "view") {
      await openDetail(expense);
      return;
    }
    if (action === "edit") {
      openEdit(expense);
      return;
    }
    if (action === "approve") {
      await approveExpense(expense);
      return;
    }
    if (action === "reject") {
      await rejectExpense(expense);
      return;
    }
    if (action === "pending_payment" || action === "payment") {
      if (can(PERMISSIONS.pay)) await openPanel("payments", expense);
      return;
    }
    if (action === "documents") {
      if (can(PERMISSIONS.documents)) await openPanel("documents", expense);
      return;
    }
    if (action === "allocation") {
      if (can(PERMISSIONS.allocate)) await openPanel("allocation", expense);
      return;
    }
    if (action === "history") {
      await openPanel("history", expense);
      return;
    }
    if (action === "delete") {
      await deleteExpense(expense);
    }
  };

  if (loading) {
    return (
      <div className="min-h-full bg-slate-50 p-6 lg:p-8">
        <div className="mx-auto max-w-[1600px] animate-pulse space-y-6">
          <div className="h-10 w-64 rounded-lg bg-slate-200" />
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((x) => (
              <div key={x} className="h-32 rounded-2xl bg-white" />
            ))}
          </div>
          <div className="h-[520px] rounded-2xl bg-white" />
        </div>
      </div>
    );
  }

  if (!can(PERMISSIONS.read)) {
    return (
      <div className="min-h-full bg-slate-50 p-6 lg:p-8">
        <div className="mx-auto max-w-[900px] rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-red-50 p-3 text-red-600">
              <AlertCircle />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                Acceso no autorizado
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Tu trabajador no dispone del permiso <code>expenses.read</code>.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8"
      onClick={() => openMenu && setOpenMenu(null)}
    >
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-slate-900 p-2.5 text-white">
              <ReceiptText size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                Gastos
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Control interno de gastos, proveedores, impuestos, pagos y
                rentabilidad.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void load(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              Actualizar
            </button>

            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <ArrowDownToLine size={16} />
              Exportar
            </button>

            {can(PERMISSIONS.create) && (
              <button
                type="button"
                onClick={() => void dispatchAction("create")}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                <Plus size={17} />
                Nuevo gasto
              </button>
            )}
          </div>
        </header>

        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={17} />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="font-semibold"
            >
              Cerrar
            </button>
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total de gastos"
            value={money(metrics.total)}
            detail={`${filtered.length} registros`}
            icon={<CircleDollarSign size={20} />}
          />
          <StatCard
            label="Pendientes de revisión"
            value={money(metrics.pendingReview)}
            detail={`${metrics.counts.pending_review} gastos`}
            icon={<Clock3 size={20} />}
          />
          <StatCard
            label="Pendientes de pago"
            value={money(metrics.pendingPayment)}
            detail={`${metrics.counts.pending_payment + metrics.counts.partially_paid} gastos`}
            icon={<WalletCards size={20} />}
          />
          <StatCard
            label="Pagado"
            value={money(metrics.paid)}
            detail={`${metrics.counts.paid} gastos`}
            icon={<Check size={20} />}
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative min-w-0 flex-1 xl:max-w-xl">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={17}
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por número, descripción, proveedor, categoría o proyecto…"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={period}
                onChange={(event) =>
                  setPeriod(
                    event.target.value as "month" | "quarter" | "year" | "all",
                  )
                }
                className={selectClass}
              >
                <option value="month">Este mes</option>
                <option value="quarter">Este trimestre</option>
                <option value="year">Este año</option>
                <option value="all">Todo</option>
              </select>

              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as ExpenseStatus | "all")
                }
                className={selectClass}
              >
                <option value="all">Todos los estados</option>
                {(Object.keys(STATUS_META) as ExpenseStatus[]).map((key) => (
                  <option key={key} value={key}>
                    {STATUS_META[key].label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setShowFilters((value) => !value)}
                className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium ${
                  showFilters
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <Filter size={16} />
                Filtros
                <ChevronDown
                  size={15}
                  className={showFilters ? "rotate-180" : ""}
                />
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Tipo">
                <select
                  value={type}
                  onChange={(event) =>
                    setType(event.target.value as ExpenseType | "all")
                  }
                  className={selectClass}
                >
                  <option value="all">Todos</option>
                  {(Object.keys(TYPE_LABELS) as ExpenseType[]).map((key) => (
                    <option key={key} value={key}>
                      {TYPE_LABELS[key]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Categoría">
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className={selectClass}
                >
                  <option value="all">Todas</option>
                  {categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Proveedor">
                <select
                  value={supplier}
                  onChange={(event) => setSupplier(event.target.value)}
                  className={selectClass}
                >
                  <option value="all">Todos</option>
                  {suppliers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.legal_name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Proyecto">
                <select
                  value={project}
                  onChange={(event) => setProject(event.target.value)}
                  className={selectClass}
                >
                  <option value="all">Todos</option>
                  {projects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nombre}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Distribución por estado
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Situación actual del conjunto filtrado.
              </p>
            </div>
            <span className="text-sm font-medium text-slate-500">
              {filtered.length} gastos
            </span>
          </div>

          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
            {(Object.keys(STATUS_META) as ExpenseStatus[]).map((key) => {
              const width = filtered.length
                ? `${(metrics.counts[key] / filtered.length) * 100}%`
                : "0%";
              return (
                <div
                  key={key}
                  title={`${STATUS_META[key].label}: ${metrics.counts[key]}`}
                  style={{ width }}
                  className={`h-full ${STATUS_META[key].className.split(" ")[0]}`}
                />
              );
            })}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Todos los gastos
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Los gastos son exclusivamente internos de Modira y no forman
                parte del área del cliente.
              </p>
            </div>
            <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
              <FileCheck2 size={15} />
              Datos protegidos por RLS + RBAC
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
              <div className="rounded-2xl bg-slate-50 p-4 text-slate-400">
                <ReceiptText size={28} />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">
                No hay gastos que mostrar
              </h3>
              <p className="mt-1 max-w-md text-sm text-slate-500">
                Prueba a cambiar los filtros o crea un nuevo gasto si tu rol
                dispone del permiso correspondiente.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-left">
                <thead className="border-b border-slate-100 bg-slate-50/70">
                  <tr className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-3">Fecha</th>
                    <th className="px-5 py-3">Gasto</th>
                    <th className="px-5 py-3">Proveedor</th>
                    <th className="px-5 py-3">Categoría</th>
                    <th className="px-5 py-3">Proyecto</th>
                    <th className="px-5 py-3">Estado</th>
                    <th className="px-5 py-3 text-right">Total</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((expense) => (
                    <tr
                      key={expense.id}
                      className="cursor-pointer hover:bg-slate-50/70"
                      onClick={() => void openDetail(expense)}
                    >
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
                        {dateLabel(expense.expense_date)}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-900">
                          {expense.expense_number}
                        </p>
                        <p className="mt-1 max-w-[280px] truncate text-xs text-slate-400">
                          {expense.description}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        {supplierMap.get(expense.supplier_id ?? "") ??
                          "Sin proveedor"}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        {categoryMap.get(expense.category_id ?? "") ??
                          "Sin categoría"}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        {projectMap.get(expense.project_id ?? "") ?? "Interno"}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={expense.status} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right text-sm font-semibold text-slate-900">
                        {money(expense.total_amount, expense.currency)}
                      </td>
                      <td className="relative px-3 py-4">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenMenu(
                              openMenu === expense.id ? null : expense.id,
                            );
                          }}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <MoreHorizontal size={18} />
                        </button>

                        {openMenu === expense.id && (
                          <div
                            onClick={(event) => event.stopPropagation()}
                            className="absolute right-3 top-12 z-30 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
                          >
                            <button
                              onClick={() => void dispatchAction("view", expense)}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <Eye size={15} />
                              Ver detalle
                            </button>

                            {can(PERMISSIONS.update) &&
                              !["paid", "cancelled"].includes(expense.status) && (
                                <button
                                  onClick={() =>
                                    void dispatchAction("edit", expense)
                                  }
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  <Pencil size={15} />
                                  Editar
                                </button>
                              )}

                            {can(PERMISSIONS.update) &&
                              expense.status === "draft" && (
                                <button
                                  onClick={() => void submitForReview(expense)}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  <FileCheck2 size={15} />
                                  Enviar a revisión
                                </button>
                              )}

                            {can(PERMISSIONS.approve) &&
                              expense.status === "pending_review" && (
                                <>
                                  <button
                                    onClick={() =>
                                      void dispatchAction("approve", expense)
                                    }
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                  >
                                    <Check size={15} />
                                    Aprobar
                                  </button>
                                  <button
                                    onClick={() =>
                                      void dispatchAction("reject", expense)
                                    }
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                  >
                                    <X size={15} />
                                    Rechazar
                                  </button>
                                </>
                              )}

                            {can(PERMISSIONS.pay) &&
                              ["pending_payment", "partially_paid"].includes(
                                expense.status,
                              ) && (
                                <button
                                  onClick={() =>
                                    void dispatchAction(
                                      "pending_payment",
                                      expense,
                                    )
                                  }
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  <WalletCards size={15} />
                                  Gestionar pagos
                                </button>
                              )}

                            {can(PERMISSIONS.documents) && (
                              <button
                                onClick={() =>
                                  void dispatchAction("documents", expense)
                                }
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                              >
                                <Paperclip size={15} />
                                Documentos
                              </button>
                            )}

                            {can(PERMISSIONS.allocate) && (
                              <button
                                onClick={() =>
                                  void dispatchAction("allocation", expense)
                                }
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                              >
                                <ReceiptText size={15} />
                                Imputación
                              </button>
                            )}

                            <button
                              onClick={() =>
                                void dispatchAction("history", expense)
                              }
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <History size={15} />
                              Historial
                            </button>

                            {can(PERMISSIONS.update) &&
                              !["paid", "cancelled"].includes(expense.status) && (
                                <button
                                  onClick={() => void cancelExpense(expense)}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-orange-700 hover:bg-orange-50"
                                >
                                  <X size={15} />
                                  Cancelar gasto
                                </button>
                              )}

                            {can(PERMISSIONS.delete) &&
                              expense.status === "draft" && (
                                <button
                                  onClick={() =>
                                    void dispatchAction("delete", expense)
                                  }
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 size={15} />
                                  Eliminar
                                </button>
                              )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {editorMode && (
          <Modal
            title={editorMode === "create" ? "Nuevo gasto" : "Editar gasto"}
            onClose={() => !busy && setEditorMode(null)}
            wide
          >
            <div className="grid gap-5 p-6 md:grid-cols-2">
              <Field label="Fecha" required>
                <input
                  type="date"
                  value={form.expense_date}
                  onChange={(e) =>
                    setForm((x) => ({ ...x, expense_date: e.target.value }))
                  }
                  className={inputClass}
                />
              </Field>

              <Field label="Tipo de gasto" required>
                <select
                  value={form.expense_type}
                  onChange={(e) =>
                    setForm((x) => ({
                      ...x,
                      expense_type: e.target.value as ExpenseType,
                    }))
                  }
                  className={selectClass}
                >
                  {(Object.keys(TYPE_LABELS) as ExpenseType[]).map((key) => (
                    <option key={key} value={key}>
                      {TYPE_LABELS[key]}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="md:col-span-2">
                <Field label="Descripción" required>
                  <textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm((x) => ({ ...x, description: e.target.value }))
                    }
                    rows={4}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                    placeholder="Describe el gasto…"
                  />
                </Field>
              </div>

              <Field label="Categoría" required>
                <select
                  value={form.category_id}
                  onChange={(e) =>
                    setForm((x) => ({ ...x, category_id: e.target.value }))
                  }
                  className={selectClass}
                >
                  <option value="">Seleccionar categoría…</option>
                  {categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Proveedor">
                <select
                  value={form.supplier_id}
                  onChange={(e) =>
                    setForm((x) => ({ ...x, supplier_id: e.target.value }))
                  }
                  className={selectClass}
                >
                  <option value="">Sin proveedor</option>
                  {suppliers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.legal_name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Proyecto">
                <select
                  value={form.project_id}
                  onChange={(e) =>
                    setForm((x) => ({ ...x, project_id: e.target.value }))
                  }
                  className={selectClass}
                >
                  <option value="">Gasto interno / sin proyecto</option>
                  {projects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nombre}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Moneda" required>
                <input
                  value={form.currency}
                  maxLength={3}
                  onChange={(e) =>
                    setForm((x) => ({
                      ...x,
                      currency: e.target.value.toUpperCase(),
                    }))
                  }
                  className={inputClass}
                />
              </Field>

              <Field label="Base imponible / subtotal" required>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.subtotal}
                  onChange={(e) =>
                    setForm((x) => ({ ...x, subtotal: e.target.value }))
                  }
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditorMode(null)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveExpense()}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                {editorMode === "create" ? "Crear gasto" : "Guardar cambios"}
              </button>
            </div>
          </Modal>
        )}

        {selected && !editorMode && !panel && (
          <Modal
            title={`${selected.expense_number} · Detalle`}
            onClose={() => setSelected(null)}
            wide
          >
            <div className="grid gap-6 p-6 md:grid-cols-2">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <StatusBadge status={selected.status} />
                  <span className="text-xs text-slate-400">
                    Actualizado {dateTimeLabel(selected.updated_at)}
                  </span>
                </div>
                <Detail label="Fecha" value={dateLabel(selected.expense_date)} />
                <Detail
                  label="Tipo"
                  value={TYPE_LABELS[selected.expense_type]}
                />
                <Detail
                  label="Proveedor"
                  value={
                    supplierMap.get(selected.supplier_id ?? "") ??
                    "Sin proveedor"
                  }
                />
                <Detail
                  label="Categoría"
                  value={
                    categoryMap.get(selected.category_id ?? "") ??
                    "Sin categoría"
                  }
                />
                <Detail
                  label="Proyecto"
                  value={
                    projectMap.get(selected.project_id ?? "") ??
                    "Gasto interno"
                  }
                />
                <div>
                  <p className="text-xs font-medium text-slate-400">
                    Descripción
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                    {selected.description}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Resumen fiscal
                </p>
                <div className="mt-4 space-y-3">
                  <Line
                    label="Base imponible"
                    value={money(selected.subtotal, selected.currency)}
                  />
                  <Line
                    label="Impuestos"
                    value={money(selected.total_tax, selected.currency)}
                  />
                  <Line
                    label="Retenciones"
                    value={money(
                      selected.total_withholding,
                      selected.currency,
                    )}
                  />
                  <div className="border-t border-slate-200 pt-3">
                    <Line
                      label="Total"
                      value={money(selected.total_amount, selected.currency)}
                      strong
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 p-6">
              <div className="flex flex-wrap gap-2">
                {can(PERMISSIONS.update) &&
                  selected.status === "draft" && (
                    <button
                      onClick={() => void submitForReview(selected)}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white"
                    >
                      <FileCheck2 size={16} />
                      Enviar a revisión
                    </button>
                  )}

                {can(PERMISSIONS.update) &&
                  !["paid", "cancelled"].includes(selected.status) && (
                    <button
                      onClick={() => openEdit(selected)}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700"
                    >
                      <Pencil size={16} />
                      Editar
                    </button>
                  )}

                {can(PERMISSIONS.approve) &&
                  selected.status === "pending_review" && (
                    <>
                      <button
                        onClick={() => void approveExpense(selected)}
                        className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white"
                      >
                        <Check size={16} />
                        Aprobar
                      </button>
                      <button
                        onClick={() => void rejectExpense(selected)}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-medium text-red-600"
                      >
                        <X size={16} />
                        Rechazar
                      </button>
                    </>
                  )}

                {can(PERMISSIONS.pay) &&
                  ["pending_payment", "partially_paid"].includes(
                    selected.status,
                  ) && (
                    <button
                      onClick={() => void openPanel("payments", selected)}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700"
                    >
                      <WalletCards size={16} />
                      Pagos
                    </button>
                  )}

                {can(PERMISSIONS.documents) && (
                  <button
                    onClick={() => void openPanel("documents", selected)}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700"
                  >
                    <Paperclip size={16} />
                    Documentos
                  </button>
                )}

                {can(PERMISSIONS.allocate) && (
                  <button
                    onClick={() => void openPanel("allocation", selected)}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700"
                  >
                    <ReceiptText size={16} />
                    Imputación
                  </button>
                )}

                <button
                  onClick={() => void openPanel("history", selected)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700"
                >
                  <History size={16} />
                  Historial
                </button>

                {can(PERMISSIONS.update) &&
                  !["paid", "cancelled"].includes(selected.status) && (
                    <button
                      onClick={() => void cancelExpense(selected)}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-orange-200 bg-white px-4 text-sm font-medium text-orange-700"
                    >
                      <X size={16} />
                      Cancelar
                    </button>
                  )}

                {can(PERMISSIONS.delete) && selected.status === "draft" && (
                  <button
                    onClick={() => void deleteExpense(selected)}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-medium text-red-600"
                  >
                    <Trash2 size={16} />
                    Eliminar
                  </button>
                )}
              </div>
            </div>

            {can(PERMISSIONS.update) &&
              !["paid", "cancelled"].includes(selected.status) && (
                <div className="border-t border-slate-100 p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        Líneas fiscales
                      </h3>
                      <p className="mt-1 text-xs text-slate-400">
                        Las migraciones recalculan automáticamente los totales
                        del gasto a partir de estas líneas.
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                        <tr>
                          <th className="px-4 py-3 text-left">Tipo</th>
                          <th className="px-4 py-3 text-right">%</th>
                          <th className="px-4 py-3 text-right">Base</th>
                          <th className="px-4 py-3 text-right">Importe</th>
                          <th className="px-4 py-3 text-right">Deducible</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {taxLines.map((line) => (
                          <tr key={line.id}>
                            <td className="px-4 py-3">
                              {TAX_LABELS[line.tax_type]}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {line.tax_rate}%
                            </td>
                            <td className="px-4 py-3 text-right">
                              {money(line.taxable_base, selected.currency)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {money(line.tax_amount, selected.currency)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {money(line.deductible_amount, selected.currency)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => void deleteTaxLine(line)}
                                className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {taxLines.length === 0 && (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-4 py-6 text-center text-slate-400"
                            >
                              No hay líneas fiscales.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-5">
                    <select
                      value={taxForm.tax_type}
                      onChange={(e) =>
                        setTaxForm((x) => ({
                          ...x,
                          tax_type: e.target.value as TaxLine["tax_type"],
                        }))
                      }
                      className={selectClass}
                    >
                      <option value="vat">IVA</option>
                      <option value="withholding">Retención</option>
                      <option value="other">Otro</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.0001"
                      value={taxForm.tax_rate}
                      onChange={(e) =>
                        setTaxForm((x) => ({ ...x, tax_rate: e.target.value }))
                      }
                      className={inputClass}
                      placeholder="%"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={taxForm.taxable_base}
                      onChange={(e) =>
                        setTaxForm((x) => ({
                          ...x,
                          taxable_base: e.target.value,
                        }))
                      }
                      className={inputClass}
                      placeholder="Base"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={taxForm.tax_amount}
                      onChange={(e) =>
                        setTaxForm((x) => ({
                          ...x,
                          tax_amount: e.target.value,
                        }))
                      }
                      className={inputClass}
                      placeholder="Importe"
                    />
                    <button
                      onClick={() => void addTaxLine()}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white"
                    >
                      <Plus size={15} />
                      Añadir impuesto
                    </button>
                  </div>
                </div>
              )}
          </Modal>
        )}

        {selected && panel === "payments" && (
          <Modal
            title={`Pagos · ${selected.expense_number}`}
            onClose={() => setPanel(null)}
            wide
          >
            <div className="p-6">
              <div className="mb-6 grid gap-4 md:grid-cols-3">
                <StatCard
                  label="Total del gasto"
                  value={money(selected.total_amount, selected.currency)}
                  icon={<ReceiptText size={19} />}
                />
                <StatCard
                  label="Pagos registrados"
                  value={money(
                    payments
                      .filter((x) => x.status === "succeeded")
                      .reduce((s, x) => s + Number(x.amount), 0),
                    selected.currency,
                  )}
                  icon={<WalletCards size={19} />}
                />
                <StatCard
                  label="Pendiente"
                  value={money(
                    Math.max(
                      selected.total_amount -
                        payments
                          .filter((x) => x.status === "succeeded")
                          .reduce((s, x) => s + Number(x.amount), 0),
                      0,
                    ),
                    selected.currency,
                  )}
                  icon={<Clock3 size={19} />}
                />
              </div>

              {can(PERMISSIONS.pay) &&
                ["pending_payment", "partially_paid"].includes(
                  selected.status,
                ) && (
                  <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <h3 className="font-semibold text-slate-900">
                      Registrar pago
                    </h3>
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={paymentForm.amount}
                        onChange={(e) =>
                          setPaymentForm((x) => ({
                            ...x,
                            amount: e.target.value,
                          }))
                        }
                        className={inputClass}
                        placeholder="Importe"
                      />
                      <input
                        type="datetime-local"
                        value={paymentForm.payment_date}
                        onChange={(e) =>
                          setPaymentForm((x) => ({
                            ...x,
                            payment_date: e.target.value,
                          }))
                        }
                        className={inputClass}
                      />
                      <select
                        value={paymentForm.payment_method}
                        onChange={(e) =>
                          setPaymentForm((x) => ({
                            ...x,
                            payment_method:
                              e.target.value as ExpensePayment["payment_method"],
                          }))
                        }
                        className={selectClass}
                      >
                        {(
                          Object.keys(PAYMENT_LABELS) as ExpensePayment["payment_method"][]
                        ).map((key) => (
                          <option key={key} value={key}>
                            {PAYMENT_LABELS[key]}
                          </option>
                        ))}
                      </select>
                      <input
                        value={paymentForm.reference}
                        onChange={(e) =>
                          setPaymentForm((x) => ({
                            ...x,
                            reference: e.target.value,
                          }))
                        }
                        className={inputClass}
                        placeholder="Referencia"
                      />
                    </div>
                    <button
                      onClick={() => void createPayment()}
                      className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white"
                    >
                      <Plus size={15} />
                      Registrar pago
                    </button>
                  </div>
                )}

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[800px] text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-3 text-left">Fecha</th>
                      <th className="px-4 py-3 text-left">Método</th>
                      <th className="px-4 py-3 text-left">Referencia</th>
                      <th className="px-4 py-3 text-right">Importe</th>
                      <th className="px-4 py-3 text-left">Estado</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="px-4 py-3">
                          {dateTimeLabel(payment.payment_date)}
                        </td>
                        <td className="px-4 py-3">
                          {PAYMENT_LABELS[payment.payment_method]}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {payment.reference || "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {money(payment.amount, selected.currency)}
                        </td>
                        <td className="px-4 py-3">{payment.status}</td>
                        <td className="px-4 py-3 text-right">
                          {can(PERMISSIONS.pay) &&
                            payment.status === "pending" && (
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => void confirmPayment(payment)}
                                  className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"
                                >
                                  Confirmar
                                </button>
                                <button
                                  onClick={() => void cancelPayment(payment)}
                                  className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
                                >
                                  Cancelar
                                </button>
                              </div>
                            )}
                        </td>
                      </tr>
                    ))}
                    {payments.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-8 text-center text-slate-400"
                        >
                          No hay pagos registrados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Modal>
        )}

        {selected && panel === "documents" && (
          <Modal
            title={`Documentos · ${selected.expense_number}`}
            onClose={() => setPanel(null)}
            wide
          >
            <div className="p-6">
              {can(PERMISSIONS.documents) && (
                <div className="mb-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        Adjuntar PDF
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Máximo 20 MiB. Se calcula SHA-256 sobre el archivo real
                        antes de asociarlo mediante la RPC segura.
                      </p>
                    </div>
                    <select
                      value={documentType}
                      onChange={(e) =>
                        setDocumentType(
                          e.target.value as ExpenseDocument["document_type"],
                        )
                      }
                      className={selectClass}
                    >
                      {(
                        Object.keys(DOCUMENT_LABELS) as ExpenseDocument["document_type"][]
                      ).map((key) => (
                        <option key={key} value={key}>
                          {DOCUMENT_LABELS[key]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="mt-4 inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">
                    <Paperclip size={16} />
                    Seleccionar PDF
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={uploadDocument}
                      disabled={busy}
                    />
                  </label>
                </div>
              )}

              <div className="space-y-3">
                {documents.map((document) => (
                  <div
                    key={document.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="rounded-xl bg-slate-50 p-2.5 text-slate-500">
                        <FileText size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {document.file_name}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {DOCUMENT_LABELS[document.document_type]} ·{" "}
                          {(document.file_size / 1024 / 1024).toFixed(2)} MiB ·{" "}
                          {dateTimeLabel(document.uploaded_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => void openDocument(document)}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700"
                      >
                        <Eye size={14} />
                        Abrir
                      </button>
                      {can(PERMISSIONS.documents) &&
                        !["paid", "cancelled"].includes(selected.status) && (
                          <button
                            onClick={() => void deleteDocument(document)}
                            className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600"
                          >
                            <Trash2 size={14} />
                            Eliminar
                          </button>
                        )}
                    </div>
                  </div>
                ))}

                {documents.length === 0 && (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-5 py-10 text-center text-sm text-slate-400">
                    No hay documentos asociados.
                  </div>
                )}
              </div>
            </div>
          </Modal>
        )}

        {selected && panel === "allocation" && (
          <Modal
            title={`Imputación · ${selected.expense_number}`}
            onClose={() => setPanel(null)}
            wide
          >
            <div className="p-6">
              <div className="mb-6 grid gap-4 md:grid-cols-3">
                <StatCard
                  label="Total del gasto"
                  value={money(selected.total_amount, selected.currency)}
                  icon={<ReceiptText size={19} />}
                />
                <StatCard
                  label="Total imputado"
                  value={money(
                    allocations.reduce((sum, x) => sum + Number(x.amount), 0),
                    selected.currency,
                  )}
                  icon={<CircleDollarSign size={19} />}
                />
                <StatCard
                  label="Sin imputar"
                  value={money(
                    Math.max(
                      selected.total_amount -
                        allocations.reduce(
                          (sum, x) => sum + Number(x.amount),
                          0,
                        ),
                      0,
                    ),
                    selected.currency,
                  )}
                  icon={<WalletCards size={19} />}
                />
              </div>

              {can(PERMISSIONS.allocate) &&
                !["paid", "cancelled"].includes(selected.status) && (
                  <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <h3 className="font-semibold text-slate-900">
                      Nueva imputación
                    </h3>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <select
                        value={allocationForm.project_id}
                        onChange={(e) =>
                          setAllocationForm((x) => ({
                            ...x,
                            project_id: e.target.value,
                          }))
                        }
                        className={selectClass}
                      >
                        <option value="">Seleccionar proyecto…</option>
                        {projects.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nombre}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={allocationForm.amount}
                        onChange={(e) =>
                          setAllocationForm((x) => ({
                            ...x,
                            amount: e.target.value,
                          }))
                        }
                        className={inputClass}
                        placeholder="Importe"
                      />
                      <input
                        value={allocationForm.description}
                        onChange={(e) =>
                          setAllocationForm((x) => ({
                            ...x,
                            description: e.target.value,
                          }))
                        }
                        className={inputClass}
                        placeholder="Descripción opcional"
                      />
                    </div>
                    <button
                      onClick={() => void addAllocation()}
                      className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white"
                    >
                      <Plus size={15} />
                      Imputar gasto
                    </button>
                  </div>
                )}

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-3 text-left">Proyecto</th>
                      <th className="px-4 py-3 text-right">Importe</th>
                      <th className="px-4 py-3 text-right">%</th>
                      <th className="px-4 py-3 text-left">Descripción</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allocations.map((allocation) => (
                      <tr key={allocation.id}>
                        <td className="px-4 py-3">
                          {projectMap.get(allocation.project_id) ??
                            allocation.project_id}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {money(allocation.amount, selected.currency)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {allocation.percentage}%
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {allocation.description || "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {can(PERMISSIONS.allocate) && (
                            <button
                              onClick={() => void deleteAllocation(allocation)}
                              className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {allocations.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-8 text-center text-slate-400"
                        >
                          No hay imputaciones.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Modal>
        )}

        {selected && panel === "history" && (
          <Modal
            title={`Historial · ${selected.expense_number}`}
            onClose={() => setPanel(null)}
            wide
          >
            <div className="p-6">
              <div className="space-y-3">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium text-slate-900">
                          {entry.action}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {entry.description}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-400">
                        {dateTimeLabel(entry.created_at)}
                      </span>
                    </div>

                    {entry.metadata && (
                      <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                        {JSON.stringify(entry.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}

                {history.length === 0 && (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-5 py-10 text-center text-sm text-slate-400">
                    No hay actividad registrada para este gasto.
                  </div>
                )}
              </div>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}
