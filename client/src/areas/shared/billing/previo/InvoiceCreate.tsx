import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AlertCircle, ArrowLeft, ChevronRight, ReceiptText } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import InvoiceEditor from "./InvoiceEditor";
import { emptyForm, validateForm, buildInvoiceDescription } from "./billingTypes";
import type { Company, Project, InvoiceForm } from "./billingTypes";
import { Loading } from "./BillingUI";
import { uploadInvoicePdf } from "./InvoiceDocuments";

export default function InvoiceCreate({ basePath }: { basePath: string }) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [canCreate, setCanCreate] = useState(false);
  const [canManageDocument, setCanManageDocument] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState<InvoiceForm>(emptyForm());
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!user?.id) { setPermissionsLoading(false); setLoading(false); return; }
      try {
        const [create, docs, c, p] = await Promise.all([
          supabase.rpc("current_worker_has_permission", { p_permission_code: "invoices.create" }),
          supabase.rpc("current_worker_has_permission", { p_permission_code: "billing_documents.manage" }),
          supabase.from("companies").select("id, company_name, currency, iva_recomendado_aplicado, iva_recomendado_porcentaje, iva_aprobado_aplicado, iva_aprobado_porcentaje, iva_aprobado_at").order("company_name", { ascending: true }),
          supabase.from("projects").select("id, nombre, company_id, client_id, user_id, estado").order("nombre", { ascending: true }),
        ]);
        if (create.error) throw create.error;
        if (docs.error) throw docs.error;
        if (c.error) throw c.error;
        if (p.error) throw p.error;
        if (!active) return;
        setCanCreate(create.data === true);
        setCanManageDocument(docs.data === true);
        setCompanies(c.data || []);
        setProjects(p.data || []);
      } catch (e: any) { if (active) setError(e?.message || "No se pudieron cargar los datos."); }
      finally { if (active) { setPermissionsLoading(false); setLoading(false); } }
    };
    run();
    return () => { active = false; };
  }, [user?.id]);

  const save = async () => {
    if (!canCreate) return setError("No tienes permiso para crear facturas.");
    const validationError = validateForm(form);
    if (validationError) return setError(validationError);
    if (form.estado === "pagada") return setError("Una factura nueva debe crearse como Pendiente. Solo un pago confirmado puede marcarla como Pagada.");
    if (pdfFile && !canManageDocument) return setError("No tienes permiso para adjuntar documentos de facturación.");
    const project = projects.find(p => String(p.id) === String(form.project_id));
    if (!project) return setError("El proyecto seleccionado no existe.");
    if (String(project.company_id) !== String(form.company_id)) return setError("El proyecto no pertenece a la empresa seleccionada.");
    if (!project.user_id) return setError("El proyecto seleccionado no tiene un usuario asociado.");
    try {
      setSaving(true); setError("");
      const { data, error: createError } = await supabase.rpc("create_invoice_by_worker", {
        p_company_id: form.company_id,
        p_project_id: form.project_id,
        p_fecha_emision: form.fecha_emision ? new Date(`${form.fecha_emision}T00:00:00`).toISOString() : null,
        p_fecha_vencimiento: form.fecha_vencimiento ? new Date(`${form.fecha_vencimiento}T00:00:00`).toISOString() : null,
        p_descripcion: buildInvoiceDescription(form) || null,
        p_subtotal: Number(form.precio_base || 0),
        p_iva_porcentaje: Number(form.iva_porcentaje || 0),
      });
      if (createError) throw createError;
      let saved = Array.isArray(data) ? data[0] : data;
      if (!saved?.id || !saved?.numero_factura) throw new Error("El backend no devolvió una factura válida.");
      if (!form.iva_aplicado || Number(form.iva_porcentaje || 0) !== 21 || form.irpf_aplicado || Number(form.irpf_porcentaje || 0) !== 0 || form.estado !== "pendiente") {
        const { data: updatedData, error: updateError } = await supabase.rpc("update_invoice_by_worker", {
          p_invoice_id: saved.id, p_company_id: form.company_id, p_project_id: form.project_id,
          p_fecha_emision: form.fecha_emision ? new Date(`${form.fecha_emision}T00:00:00`).toISOString() : null,
          p_fecha_vencimiento: form.fecha_vencimiento ? new Date(`${form.fecha_vencimiento}T00:00:00`).toISOString() : null,
          p_descripcion: buildInvoiceDescription(form) || null, p_subtotal: Number(form.precio_base || 0),
          p_iva_aplicado: Boolean(form.iva_aplicado), p_iva_porcentaje: form.iva_aplicado ? Number(form.iva_porcentaje || 0) : 0,
          p_irpf_aplicado: Boolean(form.irpf_aplicado), p_irpf_porcentaje: form.irpf_aplicado ? Number(form.irpf_porcentaje || 0) : 0,
          p_estado: form.estado,
        });
        if (updateError) throw updateError;
        saved = Array.isArray(updatedData) ? updatedData[0] : updatedData;
      }
      if (pdfFile) {
        if (!canManageDocument) throw new Error("La factura se creó, pero tu rol no tiene permiso para adjuntar documentos.");
        await uploadInvoicePdf(saved, pdfFile);
      }
      setLocation(`${basePath}/${saved.id}`);
    } catch (e: any) { setError(e?.message || "No se pudo crear la factura."); }
    finally { setSaving(false); }
  };

  if (permissionsLoading || loading) return <div className="min-h-screen bg-[#F7F8FA] p-5 sm:p-6 lg:p-8"><Loading text="Cargando facturación…"/></div>;
  if (!canCreate) return <div className="min-h-screen bg-[#F7F8FA] p-5 sm:p-6 lg:p-8"><div className="mx-auto max-w-[1500px]"><div className="border border-slate-200 bg-white p-10 text-center"><ReceiptText className="mx-auto h-8 w-8 text-slate-400"/><h2 className="mt-3 font-semibold text-slate-800">Sin permiso para crear facturas</h2><p className="mt-1 text-sm text-slate-500">Tu rol puede consultar facturación, pero no crear nuevas facturas.</p></div></div></div>;

  return <div className="min-h-screen bg-[#F7F8FA] text-[#172033]"><div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8"><button type="button" onClick={()=>setLocation(basePath)} className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-800"><ArrowLeft className="h-4 w-4"/>Volver a facturación</button><div><div className="mb-2 flex items-center gap-2 text-sm text-[#64748B]"><ReceiptText className="h-4 w-4 text-[#1E3A8A]"/><span>Operaciones</span><ChevronRight className="h-3.5 w-3.5"/><span>Facturación</span></div><h1 className="text-3xl font-bold tracking-tight">Crear factura</h1><p className="mt-1 max-w-2xl text-sm text-gray-500">Completa los datos comerciales y fiscales. El número de factura lo asignará automáticamente el backend.</p></div>{error&&<div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4"/><span>{error}</span></div>}<InvoiceEditor form={form} setForm={setForm} companies={companies} projects={projects} pdfFile={pdfFile} setPdfFile={setPdfFile} saving={saving} onCancel={()=>setLocation(basePath)} onSave={save} creationMode canManageDocument={canManageDocument}/></div></div>;
}
