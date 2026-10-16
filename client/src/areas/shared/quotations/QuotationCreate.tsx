import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { Company, Project, QuotationForm } from "./quotationTypes";
import { cleanServices, emptyQuotationForm, toInputDate, toIsoDate } from "./quotationTypes";
import QuotationEditor from "./QuotationEditor";
import { ErrorBox, Loading } from "./QuotationUI";

type DraftKind = "initial" | "correction" | "requested_change";
type WorkflowDraft = {
  id: string;
  company_id: string;
  project_id: string;
  quotation_id: string | null;
  draft_kind: DraftKind;
  draft_status: "draft" | "published" | "discarded";
  content: Record<string, unknown>;
};

export default function QuotationCreate({
  onBack,
  onCreated,
  draftId,
  onDraftCreated,
}: {
  onBack: () => void;
  onCreated: (id: string) => void;
  draftId?: string;
  onDraftCreated?: (id: string) => void;
}) {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState({ create: false, update: false });
  const [companies, setCompanies] = useState<Company[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState<QuotationForm>(emptyQuotationForm());
  const [currentDraft, setCurrentDraft] = useState<WorkflowDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workerNotes, setWorkerNotes] = useState("");

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [createPermission, updatePermission] = await Promise.all([
        supabase.rpc("current_worker_has_permission", { p_permission_code: "quotations.create" }),
        supabase.rpc("current_worker_has_permission", { p_permission_code: "quotations.update" }),
      ]);
      const canCreate = !createPermission.error && createPermission.data === true;
      const canUpdate = !updatePermission.error && updatePermission.data === true;
      setPermissions({ create: canCreate, update: canUpdate });

      const [companiesResult, projectsResult] = await Promise.all([
        supabase.from("companies").select("id,company_name,iva_recomendado_aplicado,iva_recomendado_porcentaje,iva_aprobado_aplicado,iva_aprobado_porcentaje,iva_aprobado_at").order("company_name"),
        supabase.from("projects").select("id,nombre,company_id,client_id,user_id,estado").order("nombre"),
      ]);
      if (companiesResult.error) throw companiesResult.error;
      if (projectsResult.error) throw projectsResult.error;
      const loadedCompanies = (companiesResult.data || []) as Company[];
      const loadedProjects = (projectsResult.data || []) as Project[];
      setCompanies(loadedCompanies);
      setProjects(loadedProjects);

      if (draftId) {
        const { data, error: draftError } = await supabase
          .from("quotation_workflow_drafts")
          .select("id,company_id,project_id,quotation_id,draft_kind,draft_status,content")
          .eq("id", draftId)
          .maybeSingle();
        if (draftError) throw draftError;
        if (!data || data.draft_status !== "draft") throw new Error("El borrador no existe, ya se publicó o ya no está disponible.");
        const draft = data as WorkflowDraft;
        setCurrentDraft(draft);
        const c = draft.content || {};
        let existingQuotation: {numero_presupuesto?:string;estado?:any;fecha_emision?:string} | null = null;
        if (draft.quotation_id) {
          const { data: quotationData, error: quotationError } = await supabase.from("quotations").select("numero_presupuesto,estado,fecha_emision").eq("id", draft.quotation_id).maybeSingle();
          if (quotationError) throw quotationError;
          existingQuotation = quotationData;
        }
        setForm({
          ...emptyQuotationForm(),
          company_id: draft.company_id,
          project_id: draft.project_id,
          numero_presupuesto: existingQuotation?.numero_presupuesto || "",
          titulo: String(c.titulo ?? ""),
          descripcion_detallada: String(c.descripcion_detallada ?? ""),
          servicios_incluidos: Array.isArray(c.servicios_incluidos)
            ? cleanServices(c.servicios_incluidos as any).length
              ? cleanServices(c.servicios_incluidos as any)
              : [{ descripcion: "", cantidad: 1, precio: 0 }]
            : [{ descripcion: "", cantidad: 1, precio: 0 }],
          iva_porcentaje: String(c.iva_porcentaje ?? 21),
          irpf_aplicado: Boolean(c.irpf_aplicado),
          irpf_porcentaje: String(c.irpf_porcentaje ?? 0),
          estado: existingQuotation?.estado || "Pendiente",
          fecha_emision: existingQuotation?.fecha_emision ? toInputDate(existingQuotation.fecha_emision) : emptyQuotationForm().fecha_emision,
          fecha_validez: c.fecha_validez ? toInputDate(String(c.fecha_validez)) : "",
          notas: String(c.notas ?? ""),
        });
      } else {
        setCurrentDraft(null);
        setForm(emptyQuotationForm());
      }
    } catch (e: any) {
      setError(e?.message || "No se pudieron cargar los datos del borrador.");
    } finally {
      setLoading(false);
    }
  }, [user?.id, draftId]);

  useEffect(() => { void load(); }, [load]);

  const availableProjects = useMemo(
    () => projects.filter((p) => !form.company_id || p.company_id === form.company_id),
    [projects, form.company_id],
  );

  useEffect(() => {
    if (!form.company_id) {
      setWorkerNotes("");
      return;
    }
    let active = true;
    void (async () => {
      const { data, error: notesError } = await supabase.rpc("get_company_worker_notes_for_quotation", { p_company_id: form.company_id });
      if (!active) return;
      setWorkerNotes(!notesError && typeof data === "string" ? data : "");
    })();
    return () => { active = false; };
  }, [form.company_id]);

  const getContent = () => ({
    titulo: form.titulo.trim(),
    descripcion_detallada: form.descripcion_detallada.trim() || null,
    servicios_incluidos: cleanServices(form.servicios_incluidos),
    iva_porcentaje: Number(form.iva_porcentaje || 0),
    irpf_aplicado: Boolean(form.irpf_aplicado),
    irpf_porcentaje: form.irpf_aplicado ? Number(form.irpf_porcentaje || 0) : 0,
    fecha_validez: form.fecha_validez ? toIsoDate(form.fecha_validez) : null,
    notas: form.notas.trim() || null,
  });

  const validate = (requirePublishable = false) => {
    if (!form.company_id) throw new Error("Selecciona una empresa.");
    const project = projects.find((p) => p.id === form.project_id);
    if (!project) throw new Error("Selecciona un proyecto.");
    if (project.company_id !== form.company_id) throw new Error("El proyecto no pertenece a la empresa seleccionada.");
    if (!project.user_id || !project.client_id) throw new Error("El proyecto debe tener un cliente vinculado antes de continuar.");
    if (requirePublishable && !form.titulo.trim()) throw new Error("Introduce un título para el presupuesto.");
    const iva = Number(form.iva_porcentaje || 0);
    const irpf = Number(form.irpf_porcentaje || 0);
    const services = cleanServices(form.servicios_incluidos);
    if (!Number.isFinite(iva) || iva < 0 || iva > 100) throw new Error("El IVA debe estar entre 0 y 100.");
    if (form.irpf_aplicado && (!Number.isFinite(irpf) || irpf <= 0 || irpf > 100)) throw new Error("El IRPF debe ser mayor que 0 y menor o igual que 100.");
    if (!form.irpf_aplicado && irpf !== 0) throw new Error("Si el IRPF no se aplica, el porcentaje debe ser 0.");
    if (requirePublishable && (!services.length || services.some((s) => !s.descripcion.trim()))) throw new Error("Añade al menos un servicio y completa su descripción.");
    return project;
  };

  const ensureDraft = async (): Promise<WorkflowDraft> => {
    const project = validate(false);
    let draft = currentDraft;
    let createdDraftId: string | null = null;
    if (!draft) {
      const { data, error: startError } = await supabase.rpc("start_quotation_workflow_draft", {
        p_project_id: project.id,
        p_quotation_id: null,
        p_draft_kind: "initial",
      });
      if (startError) throw startError;
      if (!data?.id) throw new Error("La base de datos no devolvió el borrador creado.");
      draft = data as WorkflowDraft;
      setCurrentDraft(draft);
      createdDraftId = draft.id;
    }
    const { data, error: saveError } = await supabase.rpc("save_quotation_workflow_draft", {
      p_draft_id: draft.id,
      p_content: getContent(),
    });
    if (saveError) throw saveError;
    const saved = (data || draft) as WorkflowDraft;
    setCurrentDraft(saved);
    if (createdDraftId) onDraftCreated?.(createdDraftId);
    return saved;
  };

  const saveDraft = async () => {
    setError(null);
    try {
      setSaving(true);
      await ensureDraft();
      toast.success("Borrador guardado. Todavía no es visible para el cliente.");
    } catch (e: any) {
      setError(e?.message || "No se pudo guardar el borrador.");
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    setError(null);
    try {
      setSaving(true);
      validate(true);
      const draft = await ensureDraft();
      const mode = draft.draft_kind;
      const { data, error: publishError } = await supabase.rpc("publish_quotation_workflow_draft", {
        p_draft_id: draft.id,
        p_publish_mode: mode,
      });
      if (publishError) throw publishError;
      const result = (Array.isArray(data) ? data[0] : data) as any;
      const quotationId = String(result?.quotation_id || result?.quotation?.id || draft.quotation_id || "");
      const versionId = String(result?.version_id || "");
      if (!quotationId || !versionId) throw new Error("El backend publicó el borrador, pero no devolvió el presupuesto y la versión oficial.");

      // La publicación ya se ha confirmado en BD. Si el PDF falla, no se revierte
      // ni se crea otro presupuesto: abrimos el detalle para permitir reintentar.
      let documentError: string | null = null;
      try {
        const { data: documentData, error: invokeError } = await supabase.functions.invoke("set-quotation-document-hash", {
          body: { action: "generate_quotation_official_version_document", version_id: versionId },
        });
        if (invokeError) {
          let message = invokeError.message || "No se pudo generar el PDF oficial.";
          try { const body = await invokeError.context?.json(); message = body?.error || message; } catch { /* conservar mensaje */ }
          throw new Error(message);
        }
        if (!documentData?.success || !documentData?.document_path || !documentData?.document_sha256) {
          throw new Error("El backend no confirmó el PDF y su huella digital.");
        }
      } catch (e: any) {
        documentError = e?.message || "No se pudo generar el PDF oficial.";
      }

      if (documentError) {
        toast.error(`La versión ${result.version_label} se publicó, pero el PDF no quedó registrado: ${documentError}`);
      } else {
        toast.success(`Presupuesto publicado como ${result.version_label}. El cliente ya puede consultarlo.`);
      }
      onCreated(quotationId);
    } catch (e: any) {
      setError(e?.message || "No se pudo publicar el presupuesto.");
    } finally {
      setSaving(false);
    }
  };

  const leave = async () => {
    setError(null);
    if (currentDraft || (form.project_id && form.company_id)) {
      try {
        setSaving(true);
        await ensureDraft();
        toast.success("Borrador guardado. Puedes retomarlo desde la lista de presupuestos.");
        onBack();
      } catch (e: any) {
        setError(e?.message || "No se pudo guardar el borrador antes de salir.");
      } finally { setSaving(false); }
      return;
    }
    onBack();
  };

  const discard = async () => {
    if (!currentDraft) { onBack(); return; }
    if (!window.confirm("¿Quieres descartar este borrador interno? No se publicará al cliente.")) return;
    try {
      setSaving(true);
      const { error: discardError } = await supabase.rpc("discard_quotation_workflow_draft", { p_draft_id: currentDraft.id });
      if (discardError) throw discardError;
      toast.success("Borrador descartado.");
      onBack();
    } catch (e: any) {
      setError(e?.message || "No se pudo descartar el borrador.");
    } finally { setSaving(false); }
  };

  if (loading) return <div className="min-h-screen bg-[#F7F8FA] p-5 sm:p-6 lg:p-8"><Loading text="Preparando borrador de presupuesto…" /></div>;
  const canManageThisDraft = currentDraft ? (currentDraft.draft_kind === "initial" ? permissions.create : permissions.update) : permissions.create;
  if (!canManageThisDraft) return <div className="min-h-screen bg-[#F7F8FA] p-5 sm:p-6 lg:p-8"><ErrorBox message="Este rol no tiene permiso para crear este presupuesto o gestionar este borrador." /><button onClick={onBack} className="mt-4 text-sm font-semibold text-[#1E3A8A]">Volver</button></div>;

  const title = currentDraft?.draft_kind === "correction" ? "Corrección interna" : currentDraft?.draft_kind === "requested_change" ? "Atender solicitud de cambios" : "Nuevo presupuesto";
  const publishLabel = currentDraft?.draft_kind === "correction" ? "Enviar actualización" : currentDraft?.draft_kind === "requested_change" ? "Enviar nueva versión" : "Enviar al cliente";

  return <div className="min-h-screen bg-[#F7F8FA] text-[#172033]"><div className="mx-auto w-full max-w-[1540px] space-y-6 p-5 sm:p-6 lg:p-8">
    <div><p className="text-sm font-semibold">Presupuestos</p><p className="text-xs text-gray-400">{title}</p></div>
    <div className="flex flex-wrap items-center gap-4"><button onClick={leave} disabled={saving} className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-800"><ArrowLeft className="h-4 w-4" />Guardar y salir</button>{currentDraft&&<button onClick={discard} disabled={saving} className="text-sm font-semibold text-red-600 hover:text-red-700">Descartar borrador</button>}</div>
    <div><div className="flex items-center gap-2 text-sm text-[#64748B]"><FileText className="h-4 w-4 text-[#1E3A8A]" />Gestión comercial</div><h1 className="mt-2 text-3xl font-bold tracking-tight">{title}</h1><p className="mt-1 max-w-3xl text-sm text-gray-500">Los cambios se guardan como borrador interno. El cliente solo verá esta versión cuando pulses «{publishLabel}» y el documento oficial quede registrado.</p></div>
    {error && <ErrorBox message={error} />}
    <QuotationEditor
      form={form} setForm={setForm} companies={companies} projects={availableProjects} saving={saving}
      selectedPdf={null} setSelectedPdf={() => undefined} creationMode={!currentDraft || currentDraft.draft_kind === "initial"}
      onCancel={leave} onSave={saveDraft} onPublish={publish} publishLabel={publishLabel}
      saveLabel="Guardar borrador" hidePdf lockProject={Boolean(currentDraft)} workflowMode workerNotes={workerNotes}
      canManageDocument={false}
    />
  </div></div>;
}
