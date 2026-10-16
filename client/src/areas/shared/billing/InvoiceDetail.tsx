import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertCircle,
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  FileText,
  Loader2,
  Pencil,
  ReceiptText,
  Trash2,
  UserRound,
  Building2,
  Calculator,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import InvoiceEditor, { type QuotationOption } from "./InvoiceEditor";
import { openInvoicePdf } from "./InvoiceDocuments";
import type { Company, Invoice, Project, Profile, InvoiceForm } from "./billingTypes";
import {
  buildInvoiceDescription,
  dateLabel,
  getCompanyCurrency,
  getCompanyName,
  getProjectName,
  money,
  normalizedStatus,
  parseInvoiceDescription,
  toForm,
  validateForm,
  roundCurrency,
} from "./billingTypes";
import {
  AccessDenied,
  BackendRules,
  DocumentBadge,
  ErrorMessage,
  InfoBlock,
  InvoiceStatusBadge,
  Loading,
  MetricCard,
  Section,
  TotalRow,
  fiscalIcons,
} from "./BillingUI";

export default function InvoiceDetail({ invoiceId, basePath }: { invoiceId: string; basePath: string }) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [canRead, setCanRead] = useState(false);
  const [canUpdate, setCanUpdate] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [canReadDocument, setCanReadDocument] = useState(false);

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [rectifiableInvoices, setRectifiableInvoices] = useState<Invoice[]>([]);
  const [quotations, setQuotations] = useState<QuotationOption[]>([]);
  const [quotationId, setQuotationId] = useState("");

  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [openingPdf, setOpeningPdf] = useState(false);
  const [error, setError] = useState("");
  const [workerNotes,setWorkerNotes]=useState("");

const [form, setForm] = useState<InvoiceForm>(toForm({
  id: "",
  user_id: "",
  company_id: "",
  project_id: "",
  numero_factura: "",
  estado: "pendiente",
} as Invoice));

  const checkPermissions = useCallback(async () => {
    if (!user?.id) {
      setPermissionsLoading(false);
      return;
    }

    try {
      const codes = [
        "invoices.read",
        "invoices.update",
        "invoices.delete",
        "billing_documents.read",
      ];

      const entries = await Promise.all(
        codes.map(async (code) => {
          const { data, error } = await supabase.rpc("current_worker_has_permission", {
            p_permission_code: code,
          });
          return [code, !error && data === true] as const;
        }),
      );

      const result = Object.fromEntries(entries) as Record<string, boolean>;
      setCanRead(!!result["invoices.read"]);
      setCanUpdate(!!result["invoices.update"]);
      setCanDelete(!!result["invoices.delete"]);
      setCanReadDocument(!!result["billing_documents.read"]);
    } catch (e) {
      console.error("[InvoiceDetail] permission error", e);
    } finally {
      setPermissionsLoading(false);
    }
  }, [user?.id]);

  const load = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [invoiceResult, companyResult, projectResult, profileResult, rectificationResult, quotationResult] =
        await Promise.all([
          supabase.from("invoices").select("*").eq("id", invoiceId).single(),
          supabase
            .from("companies")
            .select(
              "id, company_name, currency, iva_recomendado_aplicado, iva_recomendado_porcentaje, iva_aprobado_aplicado, iva_aprobado_porcentaje, iva_aprobado_at",
            )
            .order("company_name", { ascending: true }),
          supabase
            .from("projects")
            .select("id, nombre, company_id, client_id, user_id, estado")
            .order("nombre", { ascending: true }),
          supabase
            .from("profiles")
            .select("id, nombre, email, telefono, company_id, rol")
            .order("nombre", { ascending: true }),
          supabase
            .from("invoices")
            .select("id, numero_factura, company_id, estado, fecha_emision, rectifies_invoice_id")
            .order("fecha_emision", { ascending: false }),
          supabase
            .from("quotations")
            .select("id, company_id, project_id, numero_presupuesto, titulo, estado, precio_total, fecha_emision")
            .order("fecha_emision", { ascending: false }),
        ]);

      if (invoiceResult.error) throw invoiceResult.error;
      if (companyResult.error) throw companyResult.error;
      if (projectResult.error) throw projectResult.error;
      if (profileResult.error) throw profileResult.error;
      if (rectificationResult.error) throw rectificationResult.error;
      if (quotationResult.error) throw quotationResult.error;

      setInvoice(invoiceResult.data);
      setCompanies(companyResult.data || []);
      setProjects(projectResult.data || []);
      setProfiles(profileResult.data || []);
      setRectifiableInvoices(rectificationResult.data || []);
      setQuotations((quotationResult.data || []) as QuotationOption[]);
      setQuotationId(String((invoiceResult.data as any).quotation_id || ""));
      setForm(toForm(invoiceResult.data));
    } catch (e: any) {
      setError(e?.message || "No se pudo cargar la factura.");
    } finally {
      setLoading(false);
    }
  }, [invoiceId, canRead]);

  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  useEffect(() => {
    if (!permissionsLoading) load();
  }, [permissionsLoading, load]);
  useEffect(()=>{
  const companyId=invoice?.company_id;

  if(!companyId){
    setWorkerNotes("");
    return;
  }

  const loadWorkerNotes=async()=>{
    try{
      const {data,error}=await supabase.rpc(
        "get_company_worker_notes_for_invoice",
        {
          p_company_id:companyId,
        }
      );

      if(error)throw error;

      setWorkerNotes(data||"");
    }catch(e:any){
      setWorkerNotes("");
    }
  };

  void loadWorkerNotes();
},[invoice?.company_id]);

  if (permissionsLoading || loading) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] p-5 sm:p-6 lg:p-8">
        <Loading text="Cargando factura…" />
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] p-5 sm:p-6 lg:p-8">
        <AccessDenied />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] p-5 sm:p-6 lg:p-8">
        <ErrorMessage message={error || "Factura no encontrada."} />
      </div>
    );
  }

  const client = profiles.find((profile) => String(profile.id) === String(invoice.user_id));
  const parsed = parseInvoiceDescription(invoice.descripcion);
  const currency = getCompanyCurrency(companies, invoice.company_id);
  const subtotal = Number(invoice.subtotal || 0);
  const ivaImporte = Number(invoice.iva_importe || 0);
  const monto = Number(invoice.monto || subtotal + ivaImporte);
  const irpfImporte = Number(invoice.irpf_importe || 0);
  const payable = Number(invoice.importe_a_pagar ?? monto - irpfImporte);
  const originalInvoice = rectifiableInvoices.find(
    (item) => String(item.id) === String(invoice.rectifies_invoice_id),
  );

  const persistDraft = async () => {
    if (!invoice || !form || !canUpdate) throw new Error("No tienes permiso para editar esta factura.");
    if (normalizedStatus(invoice.estado) !== "borrador" || invoice.document_path || invoice.document_sha256) {
      throw new Error("Solo se pueden editar borradores sin documento oficial.");
    }

    const validation = validateForm(form);
    if (validation) throw new Error(validation);
    if (!quotationId) throw new Error("Debes seleccionar un presupuesto aceptado de referencia.");

    const quotation = quotations.find((item) => String(item.id) === String(quotationId));
    if (!quotation) throw new Error("El presupuesto seleccionado no está disponible.");
    if (String(quotation.estado).toLowerCase() !== "aceptado") {
      throw new Error("Solo puedes facturar a partir de un presupuesto aceptado.");
    }
    if (
      String(quotation.company_id) !== String(form.company_id) ||
      String(quotation.project_id) !== String(form.project_id)
    ) {
      throw new Error("El presupuesto debe pertenecer a la misma empresa y proyecto que la factura.");
    }

    const project = projects.find((item) => String(item.id) === String(form.project_id));
    if (!project) throw new Error("El proyecto seleccionado no existe.");
    if (String(project.company_id) !== String(form.company_id)) {
      throw new Error("El proyecto no pertenece a la empresa seleccionada.");
    }
    if (!project.user_id) throw new Error("El proyecto seleccionado no tiene un usuario asociado.");

    const { data, error: rpcError } = await supabase.rpc("save_invoice_draft_by_worker", {
      p_invoice_id: invoice.id,
      p_company_id: form.company_id,
      p_project_id: form.project_id,
      p_quotation_id: quotationId,
      p_fecha_emision: form.fecha_emision
        ? new Date(`${form.fecha_emision}T00:00:00`).toISOString()
        : null,
      p_fecha_vencimiento: form.fecha_vencimiento
        ? new Date(`${form.fecha_vencimiento}T00:00:00`).toISOString()
        : null,
      p_descripcion: buildInvoiceDescription(form) || null,
      p_subtotal: roundCurrency(Number(form.precio_base || 0)),
      p_iva_aplicado: Boolean(form.iva_aplicado),
      p_iva_porcentaje: form.iva_aplicado ? Number(form.iva_porcentaje || 0) : 0,
      p_irpf_aplicado: Boolean(form.irpf_aplicado),
      p_irpf_porcentaje: form.irpf_aplicado ? Number(form.irpf_porcentaje || 0) : 0,
    });
    if (rpcError) throw rpcError;

    const saved = Array.isArray(data) ? data[0] : data;
    if (!saved?.id) throw new Error("El borrador no se pudo guardar.");

    const { error: rectificationError } = await supabase.rpc(
      "set_invoice_rectification_by_worker",
      {
        p_invoice_id: saved.id,
        p_rectifies_invoice_id: form.rectifies_invoice_id || null,
        p_rectification_reason: form.rectifies_invoice_id
          ? form.rectification_reason.trim()
          : null,
        p_rectification_customer_data_source: form.rectifies_invoice_id
          ? form.rectification_customer_data_source || "original_invoice"
          : "original_invoice",
      },
    );
    if (rectificationError) throw rectificationError;

    return saved;
  };

  const saveDraft = async () => {
    try {
      setSaving(true);
      setError("");
      const saved = await persistDraft();
      setInvoice(saved);
      setForm(toForm(saved));
      setQuotationId(String((saved as any).quotation_id || quotationId));
      setEditing(false);
      await load();
    } catch (e: any) {
      setError(e?.message || "No se pudo guardar el borrador.");
    } finally {
      setSaving(false);
    }
  };

  const sendToClient = async () => {
    let saved: any = null;
    try {
      setSaving(true);
      setError("");
      saved = await persistDraft();
      setInvoice(saved);
      setForm(toForm(saved));
      setQuotationId(String(saved.quotation_id || quotationId));

      const { data: documentData, error: documentError } =
        await supabase.functions.invoke("set-invoice-document-hash", {
          body: {
            invoice_id: saved.id,
            action: "generate_invoice_document",
          },
        });

      if (documentError) {
        let message = documentError.message || "Error desconocido al generar el PDF oficial.";
        try {
          const body = await documentError.context?.json();
          message = body?.error || message;
        } catch {
          // Conservamos el mensaje original si no se puede leer el cuerpo.
        }
        throw new Error(message);
      }
      if (!documentData?.success || !documentData?.document_path || !documentData?.document_sha256) {
        throw new Error("El backend no confirmó la generación del PDF oficial y su SHA-256.");
      }

      setEditing(false);
      await load();
    } catch (e: any) {
      setError(
        saved?.numero_factura
          ? `El borrador ${saved.numero_factura} se ha conservado. No se ha enviado al cliente: ${e?.message || "error desconocido"}`
          : e?.message || "No se pudo enviar la factura al cliente.",
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteInvoice = async () => {
    if (!invoice || !canDelete || normalizedStatus(invoice.estado) !== "borrador" || invoice.document_path || invoice.document_sha256) return;

    if (
      !window.confirm(
        `¿Seguro que quieres eliminar el borrador ${invoice.numero_factura}? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }

    try {
      setDeleting(true);
      setError("");

      const { data, error: rpcError } = await supabase.rpc("delete_invoice_by_worker", {
        p_invoice_id: invoice.id,
      });

      if (rpcError) throw rpcError;
      if (!data) throw new Error("La factura no se pudo eliminar correctamente.");

      setLocation(basePath);
    } catch (e: any) {
      setError(e?.message || "No se pudo eliminar la factura.");
    } finally {
      setDeleting(false);
    }
  };

  const viewPdf = async (download = false) => {
    try {
      setOpeningPdf(true);
      setError("");
      await openInvoicePdf(invoice, download);
    } catch (e: any) {
      setError(e?.message || "No se pudo abrir el PDF.");
    } finally {
      setOpeningPdf(false);
    }
  };


  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#172033]">
      <div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
        <button
          type="button"
          onClick={() => setLocation(basePath)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a facturación
        </button>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <InvoiceStatusBadge status={invoice.estado} />
              <DocumentBadge attached={Boolean(invoice.document_path)} />
            </div>
            <p className="text-sm font-semibold text-[#1E3A8A]">{invoice.numero_factura}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
              {parsed.title || "Factura"}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {getCompanyName(companies, invoice.company_id)} · {getProjectName(projects, invoice.project_id)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {invoice.document_path && canReadDocument && (
              <>
                <button
                  type="button"
                  onClick={() => viewPdf(false)}
                  disabled={openingPdf}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  {openingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
                  Ver PDF
                </button>
                <button
                  type="button"
                  onClick={() => viewPdf(true)}
                  disabled={openingPdf}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Descargar
                </button>
              </>
            )}


            {canUpdate && normalizedStatus(invoice.estado) === "borrador" && !invoice.document_path && !invoice.document_sha256 && (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setEditing(true);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1E3A8A] px-3 py-2 text-sm font-semibold text-white hover:bg-[#162D6B]"
              >
                <Pencil className="h-4 w-4" />
                Editar
              </button>
            )}
          </div>
        </div>

        {error && <ErrorMessage message={error} />}

        {editing && form ? (
          <InvoiceEditor
            form={form}
            setForm={setForm}
            companies={companies}
            projects={projects}
            rectifiableInvoices={rectifiableInvoices}
            quotations={quotations}
            quotationId={quotationId}
            setQuotationId={setQuotationId}
            currentInvoiceId={invoice.id}
            saving={saving}
            onCancel={() => {
              setForm(toForm(invoice));
              setEditing(false);
              setError("");
            }}
            onSaveDraft={saveDraft}
            onSendToClient={sendToClient}
            creationMode={false}
            workerNotes={workerNotes}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard icon={fiscalIcons.base} label="Base imponible" value={money(subtotal, currency)} />
              <MetricCard
                icon={fiscalIcons.total}
                label="IVA"
                value={invoice.iva_aplicado ? money(ivaImporte, currency) : "No aplicado"}
                helper={invoice.iva_aplicado ? `${Number(invoice.iva_porcentaje || 0).toFixed(2)}%` : undefined}
              />
              <MetricCard
                icon={<ShieldCheck className="h-4 w-4" />}
                label="IRPF"
                value={invoice.irpf_aplicado ? money(irpfImporte, currency) : "No aplicado"}
                helper={invoice.irpf_aplicado ? `${Number(invoice.irpf_porcentaje || 0).toFixed(2)}%` : undefined}
              />
              <MetricCard
                icon={<CreditCard className="h-4 w-4" />}
                label="A pagar"
                value={money(payable, currency)}
                emphasized
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-6">
                <Section title="Información de la factura" icon={<FileText className="h-4 w-4" />}>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <InfoBlock
                      icon={<Building2 className="h-4 w-4" />}
                      label="Empresa"
                      value={getCompanyName(companies, invoice.company_id)}
                    />
                    <InfoBlock
                      icon={<BriefcaseBusiness className="h-4 w-4" />}
                      label="Proyecto"
                      value={getProjectName(projects, invoice.project_id)}
                    />
                    <InfoBlock
                      icon={<UserRound className="h-4 w-4" />}
                      label="Cliente / usuario del proyecto"
                      value={client?.nombre || client?.email || "Sin cliente"}
                      secondary={client?.email}
                    />
                    <InfoBlock
                      icon={<CalendarDays className="h-4 w-4" />}
                      label="Fecha de emisión"
                      value={dateLabel(invoice.fecha_emision)}
                    />
                    <InfoBlock
                      icon={<CalendarDays className="h-4 w-4" />}
                      label="Fecha de vencimiento"
                      value={dateLabel(invoice.fecha_vencimiento)}
                    />
                    <InfoBlock
                      icon={<CheckCircle2 className="h-4 w-4" />}
                      label="Fecha de pago"
                      value={dateLabel(invoice.fecha_pago)}
                    />
                  </div>
                </Section>

                {(invoice.issuer_legal_name || invoice.customer_legal_name || invoice.rectifies_invoice_id) && (
                  <Section title="Datos fiscales y rectificación" icon={<Calculator className="h-4 w-4" />}>
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Emisor</p>
                        <p className="mt-2 text-sm font-semibold text-gray-800">
                          {invoice.issuer_legal_name || "—"}
                        </p>
                        <p className="mt-1 text-sm text-gray-600">{invoice.issuer_tax_id || "—"}</p>
                        <p className="mt-1 text-sm text-gray-600">
                          {[invoice.issuer_address, invoice.issuer_postal_code, invoice.issuer_city, invoice.issuer_province]
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Cliente</p>
                        <p className="mt-2 text-sm font-semibold text-gray-800">
                          {invoice.customer_legal_name || "—"}
                        </p>
                        <p className="mt-1 text-sm text-gray-600">{invoice.customer_tax_id || "—"}</p>
                        <p className="mt-1 text-sm text-gray-600">
                          {[invoice.customer_address, invoice.customer_postal_code, invoice.customer_city, invoice.customer_province]
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </p>
                      </div>

                      {invoice.rectifies_invoice_id && (
  <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
      Factura rectificativa
    </p>

    <p className="mt-1 text-sm font-semibold text-gray-800">
      Rectifica {originalInvoice?.numero_factura || invoice.rectifies_invoice_id}
    </p>

    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-700">
      {invoice.rectification_reason || "Sin motivo registrado."}
    </p>

    <p className="mt-2 text-xs text-gray-600">
      Datos fiscales del destinatario:{" "}
      {invoice.rectification_customer_data_source === "current_company"
        ? "datos actuales del cliente"
        : "datos de la factura original"}
    </p>
  </div>
)}
                    </div>
                  </Section>
                )}

                <Section title="Concepto y servicios" icon={<ReceiptText className="h-4 w-4" />}>
                  {parsed.descriptionDetail && (
                    <div className="mb-5 bg-gray-50 p-4">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Descripción
                      </p>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">
                        {parsed.descriptionDetail}
                      </p>
                    </div>
                  )}

                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <div className="grid grid-cols-[minmax(0,1fr)_90px_120px_130px] bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <span>Concepto</span>
                      <span className="text-right">Cantidad</span>
                      <span className="text-right">Precio</span>
                      <span className="text-right">Importe</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {parsed.services.map((service, index) => (
                        <div
                          key={`${service.descripcion}-${index}`}
                          className="grid grid-cols-[minmax(0,1fr)_90px_120px_130px] items-center px-4 py-3 text-sm"
                        >
                          <span>{service.descripcion || "Servicio"}</span>
                          <span className="text-right text-gray-600">{Number(service.cantidad || 0)}</span>
                          <span className="text-right text-gray-600">{money(service.precio, currency)}</span>
                          <span className="text-right font-semibold">
                            {money(Number(service.cantidad || 0) * Number(service.precio || 0), currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Section>

                {parsed.notes && (
                  <Section title="Notas" icon={<FileText className="h-4 w-4" />}>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">{parsed.notes}</p>
                  </Section>
                )}

                <Section title="Resumen fiscal" icon={<Calculator className="h-4 w-4" />}>
                  <div className="space-y-3 text-sm">
                    <TotalRow label="Base imponible" value={money(subtotal, currency)} />
                    <TotalRow
                      label={invoice.iva_aplicado ? `IVA (${Number(invoice.iva_porcentaje || 0).toFixed(2)}%)` : "IVA"}
                      value={invoice.iva_aplicado ? money(ivaImporte, currency) : "No aplicado"}
                    />
                    <TotalRow
                      label={invoice.irpf_aplicado ? `IRPF (${Number(invoice.irpf_porcentaje || 0).toFixed(2)}%)` : "IRPF"}
                      value={invoice.irpf_aplicado ? `− ${money(irpfImporte, currency)}` : "No aplicado"}
                    />
                    <div className="border-t border-gray-200 pt-2">
                      <TotalRow label="Importe a pagar" value={money(payable, currency)} strong emphasized />
                    </div>
                  </div>
                </Section>
              </div>

              <aside className="space-y-6">
                <div className="border border-gray-200 bg-white">
                  <div className="border-b border-gray-100 p-4">
                    <p className="text-sm font-semibold text-gray-900">Estado de cobro</p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      El estado y la fecha de pago quedan vinculados al flujo de facturación.
                    </p>
                  </div>
                  <div className="space-y-4 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Estado</span>
                      <InvoiceStatusBadge status={invoice.estado} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">A pagar</span>
                      <span className="font-semibold">{money(payable, currency)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Pago registrado</span>
                      <span className="text-sm font-medium">
                        {invoice.fecha_pago ? dateLabel(invoice.fecha_pago) : "Pendiente"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border border-gray-200 bg-white">
                  <div className="border-b border-gray-100 p-4">
                    <p className="text-sm font-semibold text-gray-900">Documento fiscal</p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      El PDF oficial se genera en backend y se guarda en el bucket privado de facturas.
                    </p>
                  </div>
                  <div className="p-4">
                    {invoice.document_path ? (
                      <div className="flex items-center gap-3 rounded-lg border border-green-100 bg-green-50 p-3">
                        <FileCheck2 className="h-4 w-4 text-green-700" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{invoice.numero_factura}.pdf</p>
                          <p className="text-xs text-green-700">
                            {invoice.document_sha256 ? "Documento finalizado y con huella SHA-256" : "Documento asociado, pendiente de huella"}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center">
                        <FileText className="mx-auto h-5 w-5 text-gray-400" />
                        <p className="mt-2 text-sm font-medium">Sin PDF oficial</p>
                        <p className="mt-1 text-xs text-gray-500">
                          Puedes generarlo desde el botón superior si tu rol tiene acceso de creación o edición.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {canDelete && normalizedStatus(invoice.estado) === "borrador" && !invoice.document_path && !invoice.document_sha256 && (
                  <div className="border border-red-200 bg-white">
                    <div className="p-4">
                      <p className="text-sm font-semibold text-red-700">Zona de eliminación</p>
                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        La eliminación utiliza la operación segura del backend y gestiona el PDF asociado.
                      </p>
                      <button
                        type="button"
                        onClick={deleteInvoice}
                        disabled={deleting}
                        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                      >
                        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Eliminar borrador
                      </button>
                    </div>
                  </div>
                )}

                <BackendRules />
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
