import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  Banknote,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  FileText,
  Filter,
  Loader2,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import "./EmployeePayroll.css";

type PayrollStatus = "draft" | "approved" | "paid" | "cancelled";
type StatusFilter = "all" | PayrollStatus;

interface WorkerRow {
  id: string;
  auth_user_id?: string;
  display_name: string | null;
  is_active: boolean;
}

interface PayrollRow {
  id: string;
  worker_id: string;
  period_year: number;
  period_month: number;
  gross_salary: number;
  employee_deductions: number;
  net_salary: number;
  employer_social_security: number;
  other_employer_costs: number;
  total_employer_cost: number;
  status: PayrollStatus;
  payment_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface PayrollTemplate {
  id: string;
  worker_id: string;
  gross_salary: number;
  employee_deductions: number;
  net_salary: number;
  employer_social_security: number;
  other_employer_costs: number;
  total_employer_cost: number;
  notes: string | null;
  is_active: boolean;
}

interface PayrollDocument {
  id: string;
  payroll_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  sha256: string | null;
  uploaded_by: string | null;
  created_at: string;
}

interface PayrollForm {
  worker_id: string;
  period_year: string;
  period_month: string;
  gross_salary: string;
  employee_deductions: string;
  net_salary: string;
  employer_social_security: string;
  other_employer_costs: string;
  status: PayrollStatus;
  payment_date: string;
  notes: string;
  save_template: boolean;
}

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const monthFormatter = new Intl.DateTimeFormat("es-ES", { month: "long" });
const monthNames = Array.from({ length: 12 }, (_, index) =>
  monthFormatter.format(new Date(2024, index, 1)),
);

const EMPTY_FORM: PayrollForm = {
  worker_id: "",
  period_year: String(new Date().getFullYear()),
  period_month: String(new Date().getMonth() + 1),
  gross_salary: "",
  employee_deductions: "0",
  net_salary: "",
  employer_social_security: "0",
  other_employer_costs: "0",
  status: "draft",
  payment_date: "",
  notes: "",
  save_template: false,
};

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown): string {
  return euro.format(numeric(value));
}

function amountInput(value: unknown): string {
  return numeric(value).toFixed(2);
}

function payrollPeriod(year: number, month: number): string {
  const name = monthNames[month - 1] ?? String(month);
  return `${name.charAt(0).toLocaleUpperCase("es-ES")}${name.slice(1)} ${year}`;
}

function statusLabel(status: PayrollStatus): string {
  return {
    draft: "Borrador",
    approved: "Aprobada",
    paid: "Pagada",
    cancelled: "Cancelada",
  }[status];
}

function statusClass(status: PayrollStatus): string {
  return {
    draft: "border-slate-200 bg-slate-100 text-slate-700",
    approved: "border-blue-200 bg-blue-50 text-blue-700",
    paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
    cancelled: "border-rose-200 bg-rose-50 text-rose-700",
  }[status];
}

function fileIsPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "Error inesperado.");
  }
  return "Ha ocurrido un error inesperado.";
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function EmployeePayroll() {
  const { user, hasPermission } = useAuth();
  const canRead = hasPermission("payroll.read");
  const canCreate = hasPermission("payroll.create");
  const canUpdate = hasPermission("payroll.update");
  const canDelete = hasPermission("payroll.delete");

  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [records, setRecords] = useState<PayrollRow[]>([]);
  const [templates, setTemplates] = useState<PayrollTemplate[]>([]);
  const [documents, setDocuments] = useState<PayrollDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPayrollId, setUploadingPayrollId] = useState<string | null>(null);
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [monthFilter, setMonthFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PayrollForm>(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [documentBusy, setDocumentBusy] = useState(false);

  const workerNames = useMemo(() => {
    const map = new Map<string, string>();
    workers.forEach((worker) => map.set(worker.id, worker.display_name?.trim() || "Trabajador sin nombre"));
    return map;
  }, [workers]);

  const documentMap = useMemo(() => {
    const map = new Map<string, PayrollDocument[]>();
    documents.forEach((document) => {
      const current = map.get(document.payroll_id) ?? [];
      current.push(document);
      map.set(document.payroll_id, current);
    });
    return map;
  }, [documents]);

  const loadData = useCallback(async (refresh = false) => {
    if (!user?.id || !canRead) {
      setLoading(false);
      return;
    }

    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const [workerResult, payrollResult, templateResult, documentResult] = await Promise.all([
        supabase
          .from("workers")
          .select("id, auth_user_id, display_name, is_active")
          .order("display_name", { ascending: true }),
        supabase
          .from("payroll_records")
          .select("id, worker_id, period_year, period_month, gross_salary, employee_deductions, net_salary, employer_social_security, other_employer_costs, total_employer_cost, status, payment_date, notes, created_at, updated_at")
          .order("period_year", { ascending: false })
          .order("period_month", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("payroll_templates")
          .select("id, worker_id, gross_salary, employee_deductions, net_salary, employer_social_security, other_employer_costs, total_employer_cost, notes, is_active"),
        supabase
          .from("payroll_documents")
          .select("id, payroll_id, file_name, storage_path, mime_type, file_size, sha256, uploaded_by, created_at")
          .order("created_at", { ascending: false }),
      ]);

      const firstError = workerResult.error || payrollResult.error || templateResult.error || documentResult.error;
      if (firstError) throw firstError;

      setWorkers((workerResult.data ?? []) as WorkerRow[]);
      setRecords((payrollResult.data ?? []) as PayrollRow[]);
      setTemplates((templateResult.data ?? []) as PayrollTemplate[]);
      setDocuments((documentResult.data ?? []) as PayrollDocument[]);
    } catch (loadError) {
      setError(`No se han podido cargar las nóminas. ${errorMessage(loadError)}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, canRead]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const availableYears = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()]);
    records.forEach((record) => years.add(Number(record.period_year)));
    return Array.from(years).sort((a, b) => b - a);
  }, [records]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es-ES");
    return records
      .filter((record) => {
        if (statusFilter !== "all" && record.status !== statusFilter) return false;
        if (yearFilter !== "all" && String(record.period_year) !== yearFilter) return false;
        if (monthFilter !== "all" && String(record.period_month) !== monthFilter) return false;
        const workerName = workerNames.get(record.worker_id) ?? "";
        const searchable = `${workerName} ${payrollPeriod(record.period_year, record.period_month)} ${record.status}`.toLocaleLowerCase("es-ES");
        return !query || searchable.includes(query);
      })
      .sort((a, b) => {
        const periodA = a.period_year * 100 + a.period_month;
        const periodB = b.period_year * 100 + b.period_month;
        return sortNewestFirst ? periodB - periodA : periodA - periodB;
      });
  }, [records, search, statusFilter, yearFilter, monthFilter, workerNames, sortNewestFirst]);

  const kpis = useMemo(() => {
    const selectedYear = yearFilter === "all" ? null : Number(yearFilter);
    const selectedMonth = monthFilter === "all" ? null : Number(monthFilter);
    const scoped = records.filter((record) =>
      (selectedYear === null || record.period_year === selectedYear) &&
      (selectedMonth === null || record.period_month === selectedMonth),
    );
    const active = scoped.filter((record) => record.status === "approved" || record.status === "paid");
    return {
      employerCost: active.reduce((sum, record) => sum + numeric(record.total_employer_cost), 0),
      gross: active.reduce((sum, record) => sum + numeric(record.gross_salary), 0),
      paid: scoped.filter((record) => record.status === "paid").reduce((sum, record) => sum + numeric(record.net_salary), 0),
      pending: scoped.filter((record) => record.status === "draft" || record.status === "approved").length,
      count: scoped.length,
    };
  }, [records, yearFilter, monthFilter]);

  const setFormField = <K extends keyof PayrollForm>(key: K, value: PayrollForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const applyTemplate = (workerId: string, base: PayrollForm = form): PayrollForm => {
    const template = templates.find((item) => item.worker_id === workerId && item.is_active);
    if (!template) return { ...base, worker_id: workerId };
    return {
      ...base,
      worker_id: workerId,
      gross_salary: amountInput(template.gross_salary),
      employee_deductions: amountInput(template.employee_deductions),
      net_salary: amountInput(template.net_salary),
      employer_social_security: amountInput(template.employer_social_security),
      other_employer_costs: amountInput(template.other_employer_costs),
      notes: template.notes ?? base.notes,
    };
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, period_year: yearFilter === "all" ? String(new Date().getFullYear()) : yearFilter, period_month: monthFilter === "all" ? String(new Date().getMonth() + 1) : monthFilter });
    setError("");
    setNotice("");
    setModalOpen(true);
  };

  const openEdit = (record: PayrollRow) => {
    setEditingId(record.id);
    setForm({
      worker_id: record.worker_id,
      period_year: String(record.period_year),
      period_month: String(record.period_month),
      gross_salary: amountInput(record.gross_salary),
      employee_deductions: amountInput(record.employee_deductions),
      net_salary: amountInput(record.net_salary),
      employer_social_security: amountInput(record.employer_social_security),
      other_employer_costs: amountInput(record.other_employer_costs),
      status: record.status,
      payment_date: record.payment_date ?? "",
      notes: record.notes ?? "",
      save_template: false,
    });
    setError("");
    setNotice("");
    setModalOpen(true);
  };

  const saveTemplate = async (payload: {
    worker_id: string;
    gross_salary: number;
    employee_deductions: number;
    net_salary: number;
    employer_social_security: number;
    other_employer_costs: number;
    notes: string | null;
    created_by?: string;
    updated_by?: string;
  }) => {
    const existing = templates.find((item) => item.worker_id === payload.worker_id);
    const result = existing
      ? await supabase.from("payroll_templates").update({
          gross_salary: payload.gross_salary,
          employee_deductions: payload.employee_deductions,
          net_salary: payload.net_salary,
          employer_social_security: payload.employer_social_security,
          other_employer_costs: payload.other_employer_costs,
          notes: payload.notes,
          is_active: true,
          updated_by: user?.id,
        }).eq("worker_id", payload.worker_id)
      : await supabase.from("payroll_templates").insert({
          worker_id: payload.worker_id,
          gross_salary: payload.gross_salary,
          employee_deductions: payload.employee_deductions,
          net_salary: payload.net_salary,
          employer_social_security: payload.employer_social_security,
          other_employer_costs: payload.other_employer_costs,
          notes: payload.notes,
          is_active: true,
          created_by: user?.id,
          updated_by: user?.id,
        });
    if (result.error) throw result.error;
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.id) return;
    if (editingId ? !canUpdate : !canCreate) {
      setError("No tienes permiso para realizar esta acción.");
      return;
    }

    const year = Number(form.period_year);
    const month = Number(form.period_month);
    const gross = Number(form.gross_salary);
    const deductions = Number(form.employee_deductions || 0);
    const net = Number(form.net_salary);
    const employerSS = Number(form.employer_social_security || 0);
    const otherCosts = Number(form.other_employer_costs || 0);

    if (!form.worker_id) return setError("Selecciona un trabajador.");
    if (!Number.isInteger(year) || year < 2000 || year > 2200) return setError("Introduce un año válido.");
    if (!Number.isInteger(month) || month < 1 || month > 12) return setError("Selecciona un mes válido.");
    if ([gross, deductions, net, employerSS, otherCosts].some((value) => !Number.isFinite(value) || value < 0)) return setError("Todos los importes deben ser números iguales o superiores a cero.");
    if (form.status === "paid" && !form.payment_date) return setError("Indica la fecha de pago para marcar la nómina como pagada.");
    if (form.status !== "paid" && form.payment_date) return setError("La fecha de pago solo puede indicarse cuando la nómina está pagada.");

    const payload = {
      worker_id: form.worker_id,
      period_year: year,
      period_month: month,
      gross_salary: gross,
      employee_deductions: deductions,
      net_salary: net,
      employer_social_security: employerSS,
      other_employer_costs: otherCosts,
      status: form.status,
      payment_date: form.status === "paid" ? form.payment_date : null,
      notes: form.notes.trim() || null,
      updated_by: user.id,
    };

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = editingId
        ? await supabase.from("payroll_records").update(payload).eq("id", editingId).select("id").single()
        : await supabase.from("payroll_records").insert({ ...payload, created_by: user.id }).select("id").single();
      if (result.error) throw result.error;

      let templateWarning = "";
      if (form.save_template) {
        try {
          await saveTemplate({
            worker_id: form.worker_id,
            gross_salary: gross,
            employee_deductions: deductions,
            net_salary: net,
            employer_social_security: employerSS,
            other_employer_costs: otherCosts,
            notes: form.notes.trim() || null,
            created_by: user.id,
            updated_by: user.id,
          });
        } catch (templateError) {
          templateWarning = ` La nómina se ha guardado, pero no se ha podido guardar la plantilla: ${errorMessage(templateError)}`;
        }
      }

      setModalOpen(false);
      setNotice((editingId ? "Nómina actualizada correctamente." : "Nómina creada correctamente.") + templateWarning);
      await loadData(true);
    } catch (saveError) {
      const message = errorMessage(saveError);
      if (message.toLowerCase().includes("payroll_records_one_per_worker_period") || message.toLowerCase().includes("duplicate key")) {
        setError("Ya existe una nómina para este trabajador y periodo. Abre la existente para modificarla.");
      } else {
        setError(`No se ha podido guardar la nómina. ${message}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const uploadDocument = async (record: PayrollRow, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user?.id) return;
    if (!canCreate && !canUpdate) {
      setError("No tienes permiso para adjuntar documentos.");
      return;
    }
    if (!fileIsPdf(file)) {
      setError("El documento debe ser un PDF.");
      return;
    }
    if (file.size < 1 || file.size > MAX_PDF_BYTES) {
      setError("El PDF debe pesar como máximo 20 MB.");
      return;
    }

    setUploadingPayrollId(record.id);
    setError("");
    setNotice("");
    const documentId = crypto.randomUUID();
    const storagePath = `${record.id}/${documentId}.pdf`;
    let metadataCreated = false;
    try {
      const metadata = await supabase.from("payroll_documents").insert({
        id: documentId,
        payroll_id: record.id,
        file_name: file.name.slice(0, 255),
        storage_path: storagePath,
        mime_type: "application/pdf",
        file_size: file.size,
        uploaded_by: user.id,
      }).select("id").single();
      if (metadata.error) throw metadata.error;
      metadataCreated = true;

      const upload = await supabase.storage.from("payroll-documents").upload(storagePath, file, {
        contentType: "application/pdf",
        cacheControl: "3600",
        upsert: false,
      });
      if (upload.error) throw upload.error;

      setNotice(`PDF «${file.name}» adjuntado correctamente.`);
      await loadData(true);
    } catch (uploadError) {
      if (metadataCreated) {
        // Ambas funciones de la aplicación tienen payroll.delete; si la subida falla,
        // se intenta retirar el metadato huérfano para no dejar un adjunto fantasma.
        await supabase.from("payroll_documents").delete().eq("id", documentId);
      }
      setError(`No se ha podido adjuntar el PDF. ${errorMessage(uploadError)}`);
    } finally {
      setUploadingPayrollId(null);
    }
  };

  const downloadDocument = async (document: PayrollDocument) => {
    setBusyDocumentId(document.id);
    setError("");
    try {
      const result = await supabase.storage.from("payroll-documents").createSignedUrl(document.storage_path, 60);
      if (result.error) throw result.error;
      window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (downloadError) {
      setError(`No se ha podido abrir el PDF. ${errorMessage(downloadError)}`);
    } finally {
      setBusyDocumentId(null);
    }
  };

  const deleteDocument = async (document: PayrollDocument) => {
    if (!canDelete) return;
    if (!window.confirm(`¿Eliminar el documento «${document.file_name}»? Esta acción no se puede deshacer.`)) return;
    setDocumentBusy(true);
    setError("");
    try {
      const remove = await supabase.storage.from("payroll-documents").remove([document.storage_path]);
      if (remove.error) throw remove.error;
      const metadata = await supabase.from("payroll_documents").delete().eq("id", document.id);
      if (metadata.error) throw metadata.error;
      setNotice("Documento eliminado.");
      await loadData(true);
    } catch (deleteError) {
      setError(`No se ha podido eliminar el documento. ${errorMessage(deleteError)}`);
    } finally {
      setDocumentBusy(false);
    }
  };

  const deletePayroll = async (record: PayrollRow) => {
    if (!canDelete) return;
    if ((documentMap.get(record.id) ?? []).length > 0) {
      setError("Antes de eliminar la nómina, elimina sus PDF adjuntos. Así se evita dejar archivos huérfanos.");
      setExpandedId(record.id);
      return;
    }
    if (!window.confirm(`¿Eliminar la nómina de ${workerNames.get(record.worker_id) ?? "este trabajador"} (${payrollPeriod(record.period_year, record.period_month)})? Esta acción no se puede deshacer.`)) return;
    setError("");
    try {
      const result = await supabase.from("payroll_records").delete().eq("id", record.id);
      if (result.error) throw result.error;
      setNotice("Nómina eliminada.");
      await loadData(true);
    } catch (deleteError) {
      setError(`No se ha podido eliminar la nómina. ${errorMessage(deleteError)}`);
    }
  };

  const exportCsv = () => {
    const rows = [
      ["Trabajador", "Año", "Mes", "Estado", "Salario bruto", "Retenciones trabajador", "Salario neto", "SS empresarial", "Otros costes empresariales", "Coste empresarial total", "Fecha de pago", "Notas"],
      ...filteredRecords.map((record) => [
        workerNames.get(record.worker_id) ?? "Trabajador sin nombre",
        record.period_year,
        record.period_month,
        statusLabel(record.status),
        record.gross_salary,
        record.employee_deductions,
        record.net_salary,
        record.employer_social_security,
        record.other_employer_costs,
        record.total_employer_cost,
        record.payment_date ?? "",
        record.notes ?? "",
      ]),
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `modira-nominas-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!canRead) {
    return (
      <div className="mx-auto max-w-3xl p-6 md:p-10">
        <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <LockKeyhole className="mx-auto mb-4 h-10 w-10 text-rose-600" />
          <h1 className="text-xl font-semibold text-slate-900">Acceso restringido</h1>
          <p className="mt-2 text-sm text-slate-600">El módulo de nóminas está disponible únicamente para Dirección y Contabilidad.</p>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 p-4 text-slate-900 sm:p-6 xl:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">
            <ShieldCheck className="h-3.5 w-3.5" /> Área confidencial · Dirección y Contabilidad
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Nóminas</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 sm:text-base">Control de costes de personal, documentos salariales y estado de pago en un único lugar.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportCsv} disabled={filteredRecords.length === 0} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
            <ArrowDownToLine className="h-4 w-4" /> Exportar CSV
          </button>
          <button type="button" onClick={() => void loadData(true)} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Actualizar
          </button>
          {canCreate && <button type="button" onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">
            <Plus className="h-4 w-4" /> Nueva nómina
          </button>}
        </div>
      </header>

      {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span><button type="button" onClick={() => setError("")} className="ml-auto text-rose-700 hover:text-rose-950" aria-label="Cerrar error"><X className="h-4 w-4" /></button></div>}
      {notice && <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{notice}</span><button type="button" onClick={() => setNotice("")} className="ml-auto text-emerald-700 hover:text-emerald-950" aria-label="Cerrar aviso"><X className="h-4 w-4" /></button></div>}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={CircleDollarSign} label="Coste empresarial" value={money(kpis.employerCost)} hint="Nóminas aprobadas o pagadas" iconClass="bg-indigo-50 text-indigo-700" />
        <KpiCard icon={Banknote} label="Salario bruto" value={money(kpis.gross)} hint="Sobre nóminas contabilizables" iconClass="bg-sky-50 text-sky-700" />
        <KpiCard icon={CheckCircle2} label="Neto pagado" value={money(kpis.paid)} hint="Importe neto de nóminas pagadas" iconClass="bg-emerald-50 text-emerald-700" />
        <KpiCard icon={Clock3} label="Pendientes de cerrar" value={String(kpis.pending)} hint={`${kpis.count} nómina(s) en el periodo filtrado`} iconClass="bg-amber-50 text-amber-700" />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">Registro de nóminas</h2>
            <p className="mt-1 text-sm text-slate-500">El coste empresarial se calcula automáticamente. Las retenciones del trabajador no se suman al coste.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block min-w-0 sm:min-w-[250px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar trabajador o periodo" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <button type="button" onClick={() => setShowFilters((current) => !current)} className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${showFilters ? "border-indigo-200 bg-indigo-50 text-indigo-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
              <Filter className="h-4 w-4" /> Filtros <ChevronDown className={`h-4 w-4 transition ${showFilters ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>

        {showFilters && <div className="grid grid-cols-1 gap-3 border-b border-slate-100 bg-slate-50/70 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <FilterField label="Año"><select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="all">Todos los años</option>{availableYears.map((year) => <option key={year} value={String(year)}>{year}</option>)}</select></FilterField>
          <FilterField label="Mes"><select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="all">Todos los meses</option>{monthNames.map((month, index) => <option key={month} value={String(index + 1)}>{month.charAt(0).toLocaleUpperCase("es-ES") + month.slice(1)}</option>)}</select></FilterField>
          <FilterField label="Estado"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="all">Todos los estados</option><option value="draft">Borrador</option><option value="approved">Aprobada</option><option value="paid">Pagada</option><option value="cancelled">Cancelada</option></select></FilterField>
          <FilterField label="Orden"><select value={sortNewestFirst ? "newest" : "oldest"} onChange={(event) => setSortNewestFirst(event.target.value === "newest")} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="newest">Periodo más reciente</option><option value="oldest">Periodo más antiguo</option></select></FilterField>
        </div>}

        {loading ? <div className="flex items-center justify-center gap-3 p-16 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Cargando nóminas…</div> : filteredRecords.length === 0 ? <div className="flex flex-col items-center px-5 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><FileText className="h-7 w-7" /></div>
          <h3 className="font-semibold text-slate-900">No hay nóminas para estos filtros</h3>
          <p className="mt-1 max-w-md text-sm text-slate-500">Crea la primera nómina o cambia los filtros para consultar otro periodo.</p>
          {canCreate && <button type="button" onClick={openCreate} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"><Plus className="h-4 w-4" /> Nueva nómina</button>}
        </div> : <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-semibold">Trabajador / periodo</th><th className="px-4 py-3 font-semibold">Estado</th><th className="px-4 py-3 text-right font-semibold">Bruto</th><th className="px-4 py-3 text-right font-semibold">Neto</th><th className="px-4 py-3 text-right font-semibold">SS empresa</th><th className="px-4 py-3 text-right font-semibold">Coste empresa</th><th className="px-5 py-3 text-right font-semibold">Acciones</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((record) => <PayrollTableRow key={record.id} record={record} workerName={workerNames.get(record.worker_id) ?? "Trabajador sin nombre"} documents={documentMap.get(record.id) ?? []} documentCount={(documentMap.get(record.id) ?? []).length} expanded={expandedId === record.id} canUpdate={canUpdate} canDelete={canDelete} canUpload={canCreate || canUpdate} uploading={uploadingPayrollId === record.id} busyDocumentId={busyDocumentId} documentBusy={documentBusy} onUpload={(event) => void uploadDocument(record, event)} onDownload={(document) => void downloadDocument(document)} onDeleteDocument={(document) => void deleteDocument(document)} onEdit={() => openEdit(record)} onDelete={() => void deletePayroll(record)} onToggle={() => setExpandedId((current) => current === record.id ? null : record.id)} />)}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-slate-100 lg:hidden">
            {filteredRecords.map((record) => <div key={record.id} className="p-4">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-950">{workerNames.get(record.worker_id) ?? "Trabajador sin nombre"}</p><p className="mt-1 text-sm text-slate-500">{payrollPeriod(record.period_year, record.period_month)}</p></div><StatusBadge status={record.status} /></div>
              <div className="mt-4 grid grid-cols-2 gap-3"><MiniAmount label="Salario bruto" value={money(record.gross_salary)} /><MiniAmount label="Salario neto" value={money(record.net_salary)} /><MiniAmount label="SS empresarial" value={money(record.employer_social_security)} /><MiniAmount label="Coste empresarial" value={money(record.total_employer_cost)} prominent /></div>
              <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => setExpandedId((current) => current === record.id ? null : record.id)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">{expandedId === record.id ? "Ocultar documentos" : `Documentos (${(documentMap.get(record.id) ?? []).length})`}</button>{canUpdate && <button type="button" onClick={() => openEdit(record)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"><Pencil className="h-3.5 w-3.5" /> Editar</button>}{canDelete && <button type="button" onClick={() => void deletePayroll(record)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700"><Trash2 className="h-3.5 w-3.5" /> Eliminar</button>}</div>
              {expandedId === record.id && <DocumentPanel record={record} documents={documentMap.get(record.id) ?? []} canUpload={canCreate || canUpdate} canDelete={canDelete} uploading={uploadingPayrollId === record.id} busyDocumentId={busyDocumentId} documentBusy={documentBusy} onUpload={(event) => void uploadDocument(record, event)} onDownload={(document) => void downloadDocument(document)} onDelete={(document) => void deleteDocument(document)} />}
            </div>)}
          </div>
          <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-5"><span>{filteredRecords.length} resultado(s)</span><span>Los borradores y las nóminas canceladas no se incluyen en el KPI de coste empresarial.</span></div>
        </>}
      </section>

      <div className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm text-indigo-950"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-semibold">Información salarial confidencial</p><p className="mt-1 leading-relaxed text-indigo-900/80">Los importes y los PDF se protegen también en Supabase mediante permisos y RLS. No compartas enlaces de descarga ni exportaciones fuera de los canales autorizados.</p></div></div>

      {modalOpen && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModalOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="payroll-form-title" className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4 sm:px-6"><div><h2 id="payroll-form-title" className="text-lg font-bold text-slate-950">{editingId ? "Editar nómina" : "Registrar nómina"}</h2><p className="mt-1 text-sm text-slate-500">Introduce los importes de la nómina recibida de la gestoría.</p></div><button type="button" onClick={() => setModalOpen(false)} disabled={saving} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar"><X className="h-5 w-5" /></button></div>
          <form onSubmit={(event) => void handleSave(event)} className="space-y-6 p-5 sm:p-6">
            {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{error}</div>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField label="Trabajador" required><select value={form.worker_id} required disabled={Boolean(editingId)} onChange={(event) => setForm((current) => applyTemplate(event.target.value, current))} className="form-control"><option value="">Seleccionar trabajador…</option>{workers.filter((worker) => worker.is_active || worker.id === form.worker_id).map((worker) => <option key={worker.id} value={worker.id}>{worker.display_name?.trim() || "Trabajador sin nombre"}{worker.is_active ? "" : " · Inactivo"}</option>)}</select>{editingId && <span className="mt-1 block text-xs text-slate-500">El trabajador no se puede cambiar una vez creada la nómina.</span>}</FormField>
              <FormField label="Año" required><input type="number" min="2000" max="2200" value={form.period_year} required onChange={(event) => setFormField("period_year", event.target.value)} className="form-control" /></FormField>
              <FormField label="Mes" required><select value={form.period_month} required onChange={(event) => setFormField("period_month", event.target.value)} className="form-control">{monthNames.map((month, index) => <option key={month} value={String(index + 1)}>{month.charAt(0).toLocaleUpperCase("es-ES") + month.slice(1)}</option>)}</select></FormField>
            </div>

            {form.worker_id && templates.some((template) => template.worker_id === form.worker_id && template.is_active) && !editingId && <div className="flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2.5 text-sm text-sky-900"><Check className="mt-0.5 h-4 w-4 shrink-0" /><p>Se han precargado los importes habituales de este trabajador. Revísalos con la nómina real antes de guardar.</p></div>}

            <div><h3 className="mb-3 text-sm font-semibold text-slate-900">Importes de la nómina</h3><div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <MoneyField label="Salario bruto" required value={form.gross_salary} onChange={(value) => setFormField("gross_salary", value)} />
              <MoneyField label="Retenciones del trabajador" value={form.employee_deductions} onChange={(value) => setFormField("employee_deductions", value)} hint="No se suman al coste empresarial." />
              <MoneyField label="Salario neto" required value={form.net_salary} onChange={(value) => setFormField("net_salary", value)} />
              <MoneyField label="Seguridad Social empresarial" value={form.employer_social_security} onChange={(value) => setFormField("employer_social_security", value)} />
              <MoneyField label="Otros costes empresariales" value={form.other_employer_costs} onChange={(value) => setFormField("other_employer_costs", value)} />
              <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Coste empresarial total</p><p className="mt-2 text-2xl font-bold tracking-tight text-indigo-950">{money(numeric(form.gross_salary) + numeric(form.employer_social_security) + numeric(form.other_employer_costs))}</p><p className="mt-1 text-xs text-indigo-800/80">Bruto + SS empresa + otros costes.</p></div>
            </div></div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><FormField label="Estado" required><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as PayrollStatus, payment_date: event.target.value === "paid" ? (current.payment_date || new Date().toISOString().slice(0, 10)) : "" }))} className="form-control"><option value="draft">Borrador</option><option value="approved">Aprobada</option><option value="paid">Pagada</option><option value="cancelled">Cancelada</option></select></FormField><FormField label="Fecha de pago" required={form.status === "paid"}><input type="date" value={form.payment_date} disabled={form.status !== "paid"} required={form.status === "paid"} onChange={(event) => setFormField("payment_date", event.target.value)} className="form-control disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400" /></FormField></div>

            <FormField label="Notas internas"><textarea rows={3} value={form.notes} onChange={(event) => setFormField("notes", event.target.value)} placeholder="Observaciones de la gestoría, incidencias o aclaraciones…" className="form-control resize-y" /></FormField>

            {!editingId && canCreate && <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3.5"><input type="checkbox" checked={form.save_template} onChange={(event) => setFormField("save_template", event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" /><span><span className="block text-sm font-semibold text-slate-900">Guardar estos importes como plantilla habitual</span><span className="mt-1 block text-xs leading-relaxed text-slate-500">Solo sirve para precargar futuras nóminas. No crea automáticamente nóminas ni pagos.</span></span></label>}

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setModalOpen(false)} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancelar</button><button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear nómina"}</button></div>
          </form>
        </section>
      </div>}
    </main>
  );
}

function KpiCard({ icon: Icon, label, value, hint, iconClass }: { icon: typeof CircleDollarSign; label: string; value: string; hint: string; iconClass: string }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{value}</p></div><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconClass}`}><Icon className="h-5 w-5" /></div></div><p className="mt-3 text-xs text-slate-500">{hint}</p></article>;
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>{children}</label>;
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}{required && <span className="ml-1 text-rose-600">*</span>}</span>{children}</label>;
}

function MoneyField({ label, value, onChange, required, hint }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; hint?: string }) {
  return <FormField label={label} required={required}><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">€</span><input type="number" min="0" step="0.01" value={value} required={required} onChange={(event) => onChange(event.target.value)} className="form-control pl-8" /></div>{hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}</FormField>;
}

function StatusBadge({ status }: { status: PayrollStatus }) {
  return <Badge variant="outline" className={`whitespace-nowrap font-semibold ${statusClass(status)}`}>{statusLabel(status)}</Badge>;
}

function MiniAmount({ label, value, prominent }: { label: string; value: string; prominent?: boolean }) {
  return <div className={`rounded-lg p-3 ${prominent ? "bg-indigo-50" : "bg-slate-50"}`}><p className="text-[11px] font-medium text-slate-500">{label}</p><p className={`mt-1 text-sm font-bold ${prominent ? "text-indigo-900" : "text-slate-900"}`}>{value}</p></div>;
}

function PayrollTableRow({ record, workerName, documents, documentCount, expanded, canUpdate, canDelete, canUpload, uploading, busyDocumentId, documentBusy, onUpload, onDownload, onDeleteDocument, onEdit, onDelete, onToggle }: { record: PayrollRow; workerName: string; documents: PayrollDocument[]; documentCount: number; expanded: boolean; canUpdate: boolean; canDelete: boolean; canUpload: boolean; uploading: boolean; busyDocumentId: string | null; documentBusy: boolean; onUpload: (event: ChangeEvent<HTMLInputElement>) => void; onDownload: (document: PayrollDocument) => void; onDeleteDocument: (document: PayrollDocument) => void; onEdit: () => void; onDelete: () => void; onToggle: () => void }) {
  return <>
    <tr className="transition hover:bg-slate-50/70"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Users className="h-4 w-4" /></div><div><p className="font-semibold text-slate-900">{workerName}</p><p className="mt-0.5 text-xs text-slate-500">{payrollPeriod(record.period_year, record.period_month)}</p></div></div></td><td className="px-4 py-4"><StatusBadge status={record.status} />{record.payment_date && <p className="mt-1 text-xs text-slate-500">Pago: {record.payment_date}</p>}</td><td className="px-4 py-4 text-right font-medium text-slate-700">{money(record.gross_salary)}</td><td className="px-4 py-4 text-right font-medium text-slate-700">{money(record.net_salary)}</td><td className="px-4 py-4 text-right text-slate-600">{money(record.employer_social_security)}</td><td className="px-4 py-4 text-right font-bold text-slate-950">{money(record.total_employer_cost)}</td><td className="px-5 py-4"><div className="flex items-center justify-end gap-1"><button type="button" onClick={onToggle} title="Ver documentos" className={`rounded-lg p-2 transition ${expanded ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-100"}`}><FileText className="h-4 w-4" /><span className="sr-only">Documentos ({documentCount})</span></button>{canUpdate && <button type="button" onClick={onEdit} title="Editar nómina" className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"><Pencil className="h-4 w-4" /></button>}{canDelete && <button type="button" onClick={onDelete} title="Eliminar nómina" className="rounded-lg p-2 text-rose-600 transition hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>}</div></td></tr>
    {expanded && <tr><td colSpan={7} className="bg-slate-50/70 px-5 py-4"><p className="mb-3 text-xs text-slate-500">Retenciones del trabajador: <strong>{money(record.employee_deductions)}</strong> · Otros costes empresariales: <strong>{money(record.other_employer_costs)}</strong>{record.notes ? <> · Nota: <span className="text-slate-700">{record.notes}</span></> : null}</p><DocumentPanel record={record} documents={documents} canUpload={canUpload} canDelete={canDelete} uploading={uploading} busyDocumentId={busyDocumentId} documentBusy={documentBusy} onUpload={onUpload} onDownload={onDownload} onDelete={onDeleteDocument} /></td></tr>}
  </>;
}

function DocumentPanel({ record, documents, canUpload, canDelete, uploading, busyDocumentId, documentBusy, onUpload, onDownload, onDelete }: { record: PayrollRow; documents: PayrollDocument[]; canUpload: boolean; canDelete: boolean; uploading: boolean; busyDocumentId: string | null; documentBusy: boolean; onUpload: (event: ChangeEvent<HTMLInputElement>) => void; onDownload: (document: PayrollDocument) => void; onDelete: (document: PayrollDocument) => void }) {
  return <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h4 className="text-sm font-semibold text-slate-900">Documentación de nómina</h4><p className="mt-1 text-xs text-slate-500">PDF privado · Máximo 20 MB · Acceso restringido</p></div>{canUpload && <label className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 ${uploading ? "pointer-events-none opacity-50" : ""}`}><Upload className="h-3.5 w-3.5" />{uploading ? "Subiendo PDF…" : "Adjuntar PDF"}<input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={uploading} onChange={onUpload} /></label>}</div>
    {documents.length === 0 ? <div className="mt-4 rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center"><FileText className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-2 text-sm font-medium text-slate-700">Sin documentos adjuntos</p><p className="mt-1 text-xs text-slate-500">Adjunta el PDF original de la gestoría para tenerlo asociado a esta nómina.</p></div> : <div className="mt-3 divide-y divide-slate-100">{documents.map((document) => <div key={document.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-700"><FileText className="h-4 w-4" /></div><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900">{document.file_name}</p><p className="mt-0.5 text-xs text-slate-500">{(document.file_size / (1024 * 1024)).toFixed(2)} MB · {new Date(document.created_at).toLocaleDateString("es-ES")}</p></div></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => onDownload(document)} disabled={busyDocumentId === document.id} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{busyDocumentId === document.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}Abrir PDF</button>{canDelete && <button type="button" onClick={() => onDelete(document)} disabled={documentBusy} className="rounded-lg border border-rose-200 p-2 text-rose-700 hover:bg-rose-50 disabled:opacity-50" aria-label={`Eliminar ${document.file_name}`}><Trash2 className="h-3.5 w-3.5" /></button>}</div></div>)}</div>}
    <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400"><CalendarDays className="h-3.5 w-3.5" /> Periodo asociado: {payrollPeriod(record.period_year, record.period_month)}</p>
  </div>;
}

