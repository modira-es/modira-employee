import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AlertCircle, ArrowLeft, BriefcaseBusiness, CalendarDays, CheckCircle2, CreditCard, FileCheck2, FileText, Loader2, Pencil, ReceiptText, Trash2, Upload, UserRound, Building2, Calculator, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import InvoiceEditor from "./InvoiceEditor";
import { openInvoicePdf, uploadInvoicePdf } from "./InvoiceDocuments";
import type { Company, Project, Profile, InvoiceForm } from "./billingTypes";
import { buildInvoiceDescription, dateLabel, getCompanyCurrency, getCompanyName, getProjectName, money, normalizedStatus, parseInvoiceDescription, toForm, validateForm, roundCurrency } from "./billingTypes";
import { AccessDenied, BackendRules, DocumentBadge, ErrorMessage, InfoBlock, InvoiceStatusBadge, Loading, MetricCard, Section, TotalRow, fiscalIcons } from "./BillingUI";

export default function InvoiceDetail({ invoiceId, basePath }: { invoiceId: string; basePath: string }) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [canRead, setCanRead] = useState(false);
  const [canUpdate, setCanUpdate] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [canReadDocument, setCanReadDocument] = useState(false);
  const [canManageDocument, setCanManageDocument] = useState(false);
  const [invoice, setInvoice] = useState<any | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [openingPdf, setOpeningPdf] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<InvoiceForm | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const checkPermissions = useCallback(async () => {
    if (!user?.id) { setPermissionsLoading(false); return; }
    try {
      const codes = ["invoices.read", "invoices.update", "invoices.delete", "billing_documents.read", "billing_documents.manage"];
      const entries = await Promise.all(codes.map(async code => {
        const { data, error } = await supabase.rpc("current_worker_has_permission", { p_permission_code: code });
        return [code, !error && data === true] as const;
      }));
      const result = Object.fromEntries(entries) as Record<string, boolean>;
      setCanRead(!!result["invoices.read"]);
      setCanUpdate(!!result["invoices.update"]);
      setCanDelete(!!result["invoices.delete"]);
      setCanReadDocument(!!result["billing_documents.read"]);
      setCanManageDocument(!!result["billing_documents.manage"]);
    } catch (e) {
      console.error("[InvoiceDetail] permission error", e);
    } finally {
      setPermissionsLoading(false);
    }
  }, [user?.id]);

  const load = useCallback(async () => {
    if (!canRead) { setLoading(false); return; }
    try {
      setLoading(true);
      const [invoiceResult, companyResult, projectResult, profileResult] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", invoiceId).single(),
        supabase.from("companies").select("id, company_name, currency, iva_recomendado_aplicado, iva_recomendado_porcentaje, iva_aprobado_aplicado, iva_aprobado_porcentaje, iva_aprobado_at").order("company_name", { ascending: true }),
        supabase.from("projects").select("id, nombre, company_id, client_id, user_id, estado").order("nombre", { ascending: true }),
        supabase.from("profiles").select("id, nombre, email, telefono, company_id, rol").order("nombre", { ascending: true }),
      ]);
      if (invoiceResult.error) throw invoiceResult.error;
      if (companyResult.error) throw companyResult.error;
      if (projectResult.error) throw projectResult.error;
      if (profileResult.error) throw profileResult.error;
      setInvoice(invoiceResult.data);
      setCompanies(companyResult.data || []);
      setProjects(projectResult.data || []);
      setProfiles(profileResult.data || []);
      setForm(toForm(invoiceResult.data));
    } catch (e: any) {
      setError(e?.message || "No se pudo cargar la factura.");
    } finally {
      setLoading(false);
    }
  }, [invoiceId, canRead]);

  useEffect(() => { checkPermissions(); }, [checkPermissions]);
  useEffect(() => { if (!permissionsLoading) load(); }, [permissionsLoading, load]);

  if (permissionsLoading || loading) return <div className="min-h-screen bg-[#F7F8FA] p-5 sm:p-6 lg:p-8"><Loading text="Cargando factura…" /></div>;
  if (!canRead) return <div className="min-h-screen bg-[#F7F8FA] p-5 sm:p-6 lg:p-8"><AccessDenied /></div>;
  if (!invoice) return <div className="min-h-screen bg-[#F7F8FA] p-5 sm:p-6 lg:p-8"><ErrorMessage message={error || "Factura no encontrada."} /></div>;

  const client = profiles.find(profile => String(profile.id) === String(invoice.user_id));
  const parsed = parseInvoiceDescription(invoice.descripcion);
  const currency = getCompanyCurrency(companies, invoice.company_id);
  const subtotal = Number(invoice.subtotal || 0);
  const ivaImporte = Number(invoice.iva_importe || 0);
  const monto = Number(invoice.monto || subtotal + ivaImporte);
  const irpfImporte = Number(invoice.irpf_importe || 0);
  const payable = Number(invoice.importe_a_pagar ?? monto - irpfImporte);

  const save = async () => {
    if (!invoice || !form || !canUpdate) return;
    const validation = validateForm(form);
    if (validation) return setError(validation);
    if (normalizedStatus(invoice.estado) !== "pagada" && form.estado === "pagada") return setError("Una factura solo puede pasar a Pagada cuando existe un pago confirmado.");
    const project = projects.find(item => String(item.id) === String(form.project_id));
    if (!project) return setError("El proyecto seleccionado no existe.");
    if (String(project.company_id) !== String(form.company_id)) return setError("El proyecto no pertenece a la empresa seleccionada.");
    if (!project.user_id) return setError("El proyecto seleccionado no tiene un usuario asociado.");
    try {
      setSaving(true); setError("");
      const { data, error: rpcError } = await supabase.rpc("update_invoice_by_worker", {
        p_invoice_id: invoice.id,
        p_company_id: form.company_id,
        p_project_id: form.project_id,
        p_fecha_emision: form.fecha_emision ? new Date(`${form.fecha_emision}T00:00:00`).toISOString() : null,
        p_fecha_vencimiento: form.fecha_vencimiento ? new Date(`${form.fecha_vencimiento}T00:00:00`).toISOString() : null,
        p_descripcion: buildInvoiceDescription(form) || null,
        p_subtotal: roundCurrency(Number(form.precio_base || 0)),
        p_iva_aplicado: Boolean(form.iva_aplicado),
        p_iva_porcentaje: form.iva_aplicado ? Number(form.iva_porcentaje || 0) : 0,
        p_irpf_aplicado: Boolean(form.irpf_aplicado),
        p_irpf_porcentaje: form.irpf_aplicado ? Number(form.irpf_porcentaje || 0) : 0,
        p_estado: form.estado,
      });
      if (rpcError) throw rpcError;
      const saved = Array.isArray(data) ? data[0] : data;
      if (!saved?.id) throw new Error("La factura no se pudo actualizar.");
      if (pdfFile) {
        if (!canManageDocument) throw new Error("No tienes permiso para gestionar el PDF de la factura.");
        await uploadInvoicePdf(saved, pdfFile);
      }
      setInvoice(saved); setForm(toForm(saved)); setPdfFile(null); setEditing(false); await load();
    } catch (e: any) {
      setError(e?.message || "No se pudo actualizar la factura.");
    } finally { setSaving(false); }
  };

  const deleteInvoice = async () => {
    if (!invoice || !canDelete) return;
    if (!window.confirm(`¿Seguro que quieres eliminar la factura ${invoice.numero_factura}? Esta acción también eliminará su PDF asociado.`)) return;
    try {
      setDeleting(true); setError("");
      const { data, error: rpcError } = await supabase.rpc("delete_invoice_by_worker", { p_invoice_id: invoice.id });
      if (rpcError) throw rpcError;
      if (!data) throw new Error("La factura no se pudo eliminar correctamente.");
      setLocation(basePath);
    } catch (e: any) {
      setError(e?.message || "No se pudo eliminar la factura.");
    } finally { setDeleting(false); }
  };

  const viewPdf = async (download = false) => {
    try { setOpeningPdf(true); setError(""); await openInvoicePdf(invoice, download); }
    catch (e: any) { setError(e?.message || "No se pudo abrir el PDF."); }
    finally { setOpeningPdf(false); }
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#172033]">
      <div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
        <button type="button" onClick={() => setLocation(basePath)} className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-800"><ArrowLeft className="h-4 w-4" />Volver a facturación</button>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2"><InvoiceStatusBadge status={invoice.estado} /><DocumentBadge attached={Boolean(invoice.document_path)} /></div>
            <p className="text-sm font-semibold text-[#1E3A8A]">{invoice.numero_factura}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">{parsed.title || "Factura"}</h1>
            <p className="mt-1 text-sm text-gray-500">{getCompanyName(companies, invoice.company_id)} · {getProjectName(projects, invoice.project_id)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {invoice.document_path && canReadDocument && <>
              <button type="button" onClick={() => viewPdf(false)} disabled={openingPdf} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">{openingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}Ver PDF</button>
              <button type="button" onClick={() => viewPdf(true)} disabled={openingPdf} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Descargar</button>
            </>}
            {canUpdate && <button type="button" onClick={() => { setError(""); setPdfFile(null); setEditing(true); }} className="inline-flex items-center gap-2 rounded-lg bg-[#1E3A8A] px-3 py-2 text-sm font-semibold text-white hover:bg-[#162D6B]"><Pencil className="h-4 w-4" />Editar</button>}
          </div>
        </div>
        {error && <ErrorMessage message={error} />}
        {editing && form ? (
          <InvoiceEditor form={form} setForm={setForm} companies={companies} projects={projects} pdfFile={pdfFile} setPdfFile={setPdfFile} saving={saving} onCancel={() => { setForm(toForm(invoice)); setPdfFile(null); setEditing(false); setError(""); }} onSave={save} creationMode={false} canManageDocument={canManageDocument} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <MetricCard icon={fiscalIcons.base} label="Base imponible" value={money(subtotal, currency)} />
              <MetricCard icon={fiscalIcons.total} label="IVA" value={invoice.iva_aplicado ? money(ivaImporte, currency) : "No aplicado"} helper={invoice.iva_aplicado ? `${Number(invoice.iva_porcentaje || 0).toFixed(2)}%` : undefined} />
              <MetricCard icon={fiscalIcons.total} label="Total bruto" value={money(monto, currency)} />
              <MetricCard icon={<ShieldCheck className="h-4 w-4" />} label="IRPF" value={invoice.irpf_aplicado ? money(irpfImporte, currency) : "No aplicado"} helper={invoice.irpf_aplicado ? `${Number(invoice.irpf_porcentaje || 0).toFixed(2)}%` : undefined} />
              <MetricCard icon={<CreditCard className="h-4 w-4" />} label="A pagar" value={money(payable, currency)} emphasized />
            </div>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-6">
                <Section title="Información de la factura" icon={<FileText className="h-4 w-4" />}>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <InfoBlock icon={<Building2 className="h-4 w-4" />} label="Empresa" value={getCompanyName(companies, invoice.company_id)} />
                    <InfoBlock icon={<BriefcaseBusiness className="h-4 w-4" />} label="Proyecto" value={getProjectName(projects, invoice.project_id)} />
                    <InfoBlock icon={<UserRound className="h-4 w-4" />} label="Cliente / usuario del proyecto" value={client?.nombre || client?.email || "Sin cliente"} secondary={client?.email} />
                    <InfoBlock icon={<CalendarDays className="h-4 w-4" />} label="Fecha de emisión" value={dateLabel(invoice.fecha_emision)} />
                    <InfoBlock icon={<CalendarDays className="h-4 w-4" />} label="Fecha de vencimiento" value={dateLabel(invoice.fecha_vencimiento)} />
                    <InfoBlock icon={<CheckCircle2 className="h-4 w-4" />} label="Fecha de pago" value={dateLabel(invoice.fecha_pago)} />
                  </div>
                </Section>
                <Section title="Concepto y servicios" icon={<ReceiptText className="h-4 w-4" />}>
                  {parsed.descriptionDetail && <div className="mb-5 bg-gray-50 p-4"><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Descripción</p><p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">{parsed.descriptionDetail}</p></div>}
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <div className="grid grid-cols-[minmax(0,1fr)_90px_120px_130px] bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500"><span>Concepto</span><span className="text-right">Cantidad</span><span className="text-right">Precio</span><span className="text-right">Importe</span></div>
                    <div className="divide-y divide-gray-100">{parsed.services.map((service, index) => <div key={`${service.descripcion}-${index}`} className="grid grid-cols-[minmax(0,1fr)_90px_120px_130px] items-center px-4 py-3 text-sm"><span>{service.descripcion || "Servicio"}</span><span className="text-right text-gray-600">{Number(service.cantidad || 0)}</span><span className="text-right text-gray-600">{money(service.precio, currency)}</span><span className="text-right font-semibold">{money(Number(service.cantidad || 0) * Number(service.precio || 0), currency)}</span></div>)}</div>
                  </div>
                </Section>
                {parsed.notes && <Section title="Notas" icon={<FileText className="h-4 w-4" />}><p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">{parsed.notes}</p></Section>}
                <Section title="Resumen fiscal" icon={<Calculator className="h-4 w-4" />}>
                  <div className="space-y-3 text-sm"><TotalRow label="Base imponible" value={money(subtotal, currency)} /><TotalRow label={`IVA (${Number(invoice.iva_porcentaje || 0).toFixed(2)}%)`} value={money(ivaImporte, currency)} /><TotalRow label="Total bruto" value={money(monto, currency)} strong /><TotalRow label={invoice.irpf_aplicado ? `IRPF (${Number(invoice.irpf_porcentaje || 0).toFixed(2)}%)` : "IRPF"} value={invoice.irpf_aplicado ? `− ${money(irpfImporte, currency)}` : "No aplicado"} /><div className="border-t border-gray-200 pt-2"><TotalRow label="Importe a pagar" value={money(payable, currency)} strong emphasized /></div></div>
                </Section>
              </div>
              <aside className="space-y-6">
                <div className="border border-gray-200 bg-white"><div className="border-b border-gray-100 p-4"><p className="text-sm font-semibold text-gray-900">Estado de cobro</p><p className="mt-1 text-xs leading-5 text-gray-500">El estado y la fecha de pago quedan vinculados al flujo de facturación.</p></div><div className="space-y-4 p-4"><div className="flex items-center justify-between"><span className="text-sm text-gray-500">Estado</span><InvoiceStatusBadge status={invoice.estado} /></div><div className="flex items-center justify-between"><span className="text-sm text-gray-500">A pagar</span><span className="font-semibold">{money(payable, currency)}</span></div><div className="flex items-center justify-between"><span className="text-sm text-gray-500">Pago registrado</span><span className="text-sm font-medium">{invoice.fecha_pago ? dateLabel(invoice.fecha_pago) : "Pendiente"}</span></div></div></div>
                <div className="border border-gray-200 bg-white"><div className="border-b border-gray-100 p-4"><p className="text-sm font-semibold text-gray-900">Documento fiscal</p><p className="mt-1 text-xs leading-5 text-gray-500">El PDF se guarda en el bucket privado de facturas.</p></div><div className="p-4">{invoice.document_path ? <div className="flex items-center gap-3 rounded-lg border border-green-100 bg-green-50 p-3"><FileCheck2 className="h-4 w-4 text-green-700" /><div><p className="truncate text-sm font-semibold">{invoice.numero_factura}.pdf</p><p className="text-xs text-green-700">Documento asociado</p></div></div> : <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center"><Upload className="mx-auto h-5 w-5 text-gray-400" /><p className="mt-2 text-sm font-medium">Sin PDF adjunto</p><p className="mt-1 text-xs text-gray-500">Puedes adjuntarlo desde Editar si tienes permiso documental.</p></div>}</div></div>
                {canDelete && <div className="border border-red-200 bg-white"><div className="p-4"><p className="text-sm font-semibold text-red-700">Zona de eliminación</p><p className="mt-1 text-xs leading-5 text-gray-500">La eliminación utiliza la operación segura del backend y gestiona el PDF asociado.</p><button type="button" onClick={deleteInvoice} disabled={deleting} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60">{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Eliminar factura</button></div></div>}
                <BackendRules />
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
