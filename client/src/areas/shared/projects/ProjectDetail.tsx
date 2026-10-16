import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  ArrowLeft,
  BellRing,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  FileText,
  FolderKanban,
  Loader2,
  MessageSquare,
  Pencil,
  RefreshCw,
  User,
} from "lucide-react";
import { toast } from "sonner";

import ProjectMilestones from "./ProjectMilestones";
import ProjectUpdates from "./ProjectUpdates";
import ProjectDocuments from "./ProjectDocuments";
import ProjectChangeRequests from "./ProjectChangeRequests";
import ProjectScope from "./ProjectScope";
import ProjectRelations from "./ProjectRelations";

export type ProjectStatus =
  | "Pendiente"
  | "Activo"
  | "Pausado"
  | "Entregado"
  | "Completado";

export type MilestoneStatus =
  | "pendiente"
  | "en_curso"
  | "completado";

export interface Project {
  id: string;
  nombre: string;
  descripcion: string | null;
  estado: ProjectStatus;
  fecha_inicio: string;
  fecha_fin: string | null;
  company_id: string | null;
  client_id: string | null;
  user_id: string | null;
  created_at: string;
  updated_at?: string | null;
  cliente_nombre: string;
  cliente_email: string;
  empresa_nombre: string;
}

export interface ProjectProgress {
  project_id: string;
  total_milestones: number;
  completed_milestones: number;
  progress_percentage: number;
}

export interface ProjectMilestone {
  id: string;
  project_id: string;
  nombre: string;
  descripcion: string | null;
  fecha_prevista: string;
  orden: number;
  estado: MilestoneStatus;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectDocument {
  id: string;
  project_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectUpdate {
  id: string;
  project_id: string;
  titulo: string;
  contenido: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectChangeRequest {
  id: string;
  project_id: string;
  user_id: string | null;
  company_id: string | null;
  client_id: string | null;
  description: string;
  status:
    | "pending"
    | "in_review"
    | "accepted"
    | "rejected"
    | "completed";
  requested_at: string;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes?: string | null;
}

export interface RelatedBilling {
  id: string;
  numero_factura: string | null;
  estado: string | null;
  monto: number | null;
  importe_a_pagar: number | null;
  fecha_vencimiento: string | null;
}

export interface RelatedQuotation {
  id: string;
  numero_presupuesto: string | null;
  titulo: string | null;
  estado: string | null;
  precio_total: number | null;
}

export interface RelatedTicket {
  id: string;
  asunto: string;
  estado: string;
  prioridad: string;
  created_at: string;
}

async function hasPermission(code: string) {
  const { data, error } = await supabase.rpc(
    "current_worker_has_permission",
    {
      p_permission_code: code,
    }
  );

  if (error) return false;

  return Boolean(data);
}

interface Props {
  projectId: string;
  onBack: () => void;
  onNavigate?: (path: string) => void;
}

type Section =
  | "resumen"
  | "hitos"
  | "actualizaciones"
  | "documentos"
  | "cambios"
  | "finanzas"
  | "soporte"
  | "alcance";

export default function ProjectDetail({
  projectId,
  onBack,
  onNavigate,
}: Props) {
  const [project, setProject] = useState<Project | null>(null);
  const [progress, setProgress] =
    useState<ProjectProgress | null>(null);

  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [updates, setUpdates] = useState<ProjectUpdate[]>([]);
  const [requests, setRequests] =
    useState<ProjectChangeRequest[]>([]);

  const [quotations, setQuotations] =
    useState<RelatedQuotation[]>([]);
  const [billing, setBilling] = useState<RelatedBilling[]>([]);
  const [tickets, setTickets] = useState<RelatedTicket[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [canManage, setCanManage] = useState(false);

  const [activeSection, setActiveSection] =
    useState<Section>("resumen");

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [description,setDescription]=useState("");
  const [saving, setSaving] = useState(false);

  const [status, setStatus] =
    useState<ProjectStatus>("Pendiente");

  const [reviewNotes, setReviewNotes] = useState<
    Record<string, string>
  >({});

  const load = useCallback(
    async (silent = false) => {
      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError(null);

        const [
          projectsResult,
          milestonesResult,
          progressResult,
          documentsResult,
          updatesResult,
          requestsResult,
          quotationsResult,
          billingResult,
          ticketsResult,
        ] = await Promise.all([
          supabase.rpc("get_worker_projects"),

          supabase
            .from("project_milestones")
            .select("*")
            .eq("project_id", projectId)
            .order("orden", { ascending: true })
            .order("fecha_prevista", { ascending: true }),

          supabase
            .from("project_progress")
            .select("*")
            .eq("project_id", projectId)
            .maybeSingle(),

          supabase
            .from("project_documents")
            .select("*")
            .eq("project_id", projectId)
            .order("created_at", { ascending: false }),

          supabase
            .from("project_updates")
            .select("*")
            .eq("project_id", projectId)
            .order("created_at", { ascending: false }),

          supabase
            .from("project_change_requests")
            .select("*")
            .eq("project_id", projectId)
            .order("requested_at", { ascending: false }),

          supabase
            .from("quotations")
            .select(
              "id,numero_presupuesto,titulo,estado,precio_total"
            )
            .eq("project_id", projectId)
            .order("created_at", { ascending: false }),

          supabase
            .from("invoices")
            .select(
              "id,numero_factura,estado,monto,importe_a_pagar,fecha_vencimiento"
            )
            .eq("project_id", projectId)
            .order("created_at", { ascending: false }),

          supabase
            .from("support_tickets")
            .select(
              "id,asunto,estado,prioridad,created_at"
            )
            .eq("project_id", projectId)
            .order("created_at", { ascending: false }),
        ]);

        if (projectsResult.error) {
          throw projectsResult.error;
        }

        const found = (projectsResult.data || []).find(
          (item: any) => item.id === projectId
        ) as Project | undefined;

        if (!found) {
          throw new Error(
            "No tienes acceso a este proyecto."
          );
        }

        setProject(found);
setName(found.nombre);
setDescription(found.descripcion || "");
setStatus(found.estado);

        const resolvedMilestones =
          (milestonesResult.data || []) as ProjectMilestone[];

        setMilestones(resolvedMilestones);

        let resolvedProgress =
          progressResult.error
            ? null
            : ((progressResult.data || null) as ProjectProgress | null);

        if (!resolvedProgress) {
          const total = resolvedMilestones.length;

          const completed =
            resolvedMilestones.filter(
              (item) => item.estado === "completado"
            ).length;

          resolvedProgress = {
            project_id: projectId,
            total_milestones: total,
            completed_milestones: completed,
            progress_percentage: total
              ? Math.round((completed / total) * 100)
              : 0,
          };
        }

        setProgress(resolvedProgress);

        setDocuments(
          documentsResult.error
            ? []
            : ((documentsResult.data || []) as ProjectDocument[])
        );

        setUpdates(
          updatesResult.error
            ? []
            : ((updatesResult.data || []) as ProjectUpdate[])
        );

        if (!requestsResult.error) {
          setRequests(
            (requestsResult.data || []) as ProjectChangeRequest[]
          );
        } else {
          const { data: workerRequests } =
            await supabase.rpc(
              "get_worker_project_change_requests"
            );

          setRequests(
            ((workerRequests || []) as ProjectChangeRequest[]).filter(
              (item) => item.project_id === projectId
            )
          );
        }

        setQuotations(
          quotationsResult.error
            ? []
            : ((quotationsResult.data || []) as RelatedQuotation[])
        );

        setBilling(
          billingResult.error
            ? []
            : ((billingResult.data || []) as RelatedBilling[])
        );

        setTickets(
          ticketsResult.error
            ? []
            : ((ticketsResult.data || []) as RelatedTicket[])
        );

        setCanManage(
          await hasPermission("projects.update")
        );
      } catch (e: any) {
        console.error(
          "[ProjectDetail] Error loading project:",
          e
        );

        setError(
          e?.message ||
            "No se pudo cargar el proyecto."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    void load();
  }, [load]);

const saveProjectInfo = async () => {
  if (!project || !name.trim()) return;

  try {
    setSaving(true);

    const { error: rpcError } = await supabase.rpc(
      "update_project_by_worker",
      {
        p_project_id: project.id,
        p_nombre: name.trim(),
        p_estado: null,
        p_descripcion: description.trim() || null,
      }
    );

    if (rpcError) throw rpcError;

    setEditingName(false);

    await load(true);

    toast.success(
      "Información del proyecto actualizada."
    );
  } catch (e: any) {
    toast.error(
      e?.message ||
        "No se pudo actualizar la información del proyecto."
    );
  } finally {
    setSaving(false);
  }
};

  const saveStatus = async (
    value: ProjectStatus
  ) => {
    if (!project) return;

    try {
      setStatus(value);

      const { error: rpcError } =
        await supabase.rpc(
          "update_project_by_worker",
          {
            p_project_id: project.id,
            p_nombre: null,
            p_estado: value,
          }
        );

      if (rpcError) throw rpcError;

      await load(true);

      toast.success(
        "Estado actualizado."
      );
    } catch (e: any) {
      toast.error(
        e?.message ||
          "No se pudo actualizar el estado."
      );

      setStatus(project.estado);
    }
  };

  const resolve = async (
    request: ProjectChangeRequest,
    action:
      | "in_review"
      | "accepted"
      | "rejected"
      | "completed"
  ) => {
    try {
      const { error: rpcError } =
        await supabase.rpc(
          "resolve_project_change_request",
          {
            p_request_id: request.id,
            p_action: action,
            p_review_notes:
              reviewNotes[request.id]?.trim() ||
              null,
          }
        );

      if (rpcError) throw rpcError;

      await load(true);

      toast.success(
        "Solicitud actualizada."
      );
    } catch (e: any) {
      toast.error(
        e?.message ||
          "No se pudo resolver la solicitud."
      );
    }
  };

  const effectiveProgress =
    progress?.progress_percentage ??
    (milestones.length
      ? Math.round(
          (milestones.filter(
            (item) =>
              item.estado === "completado"
          ).length /
            milestones.length) *
            100
        )
      : 0);

  const completedMilestones =
    progress?.completed_milestones ??
    milestones.filter(
      (item) =>
        item.estado === "completado"
    ).length;

  const totalMilestones =
    progress?.total_milestones ??
    milestones.length;

  const pendingChangeRequests =
    requests.filter((request) =>
      ["pending", "in_review"].includes(
        request.status
      )
    ).length;

  const overdue =
    Boolean(project?.fecha_fin) &&
    new Date(project!.fecha_fin as string).getTime() <
      Date.now() &&
    !["Completado", "Entregado"].includes(
      project!.estado
    );

  const nextMilestone =
    milestones.find(
      (item) =>
        item.estado !== "completado"
    ) || null;

  const sections: Array<{
    id: Section;
    label: string;
  }> = [
    {
      id: "resumen",
      label: "Resumen",
    },
    {
      id: "hitos",
      label: "Hitos",
    },
    {
      id: "actualizaciones",
      label: "Actualizaciones",
    },
    {
      id: "documentos",
      label: "Documentos",
    },
    {
      id: "cambios",
      label: "Cambios",
    },
    {
      id: "finanzas",
      label: "Finanzas",
    },
    {
      id: "soporte",
      label: "Soporte",
    },
    {
  id: "alcance",
  label: "Alcance",
},
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-8">
        <Card className="mx-auto flex min-h-[420px] max-w-[1540px] items-center justify-center border border-slate-200 bg-white shadow-none">
          <Loader2 className="h-7 w-7 animate-spin text-[#1E3A8A]" />
        </Card>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-8">
        <Card className="mx-auto max-w-[1540px] border border-slate-200 bg-white p-12 text-center shadow-none">
          <AlertCircle className="mx-auto mb-4 h-9 w-9 text-red-500" />

          <p className="text-sm text-slate-600">
            {error ||
              "Proyecto no encontrado."}
          </p>

          <Button
            className="mt-5 bg-[#1E3A8A] hover:bg-[#162D6B]"
            onClick={onBack}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a proyectos
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-8">
      <div className="mx-auto max-w-[1540px] space-y-6">

        {/* ============================================================
            CABECERA DEL PROYECTO
        ============================================================ */}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

          <Button
            variant="ghost"
            onClick={onBack}
            className="-ml-2 text-slate-500 hover:bg-white hover:text-slate-800"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Proyectos
          </Button>

          <div className="flex flex-wrap items-center gap-2">

            {canManage ? (
              <Select
                value={status}
                onValueChange={(value) =>
                  void saveStatus(
                    value as ProjectStatus
                  )
                }
              >
                <SelectTrigger className="h-10 w-[165px] border-slate-200 bg-white">
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="Pendiente">
                    Pendiente
                  </SelectItem>

                  <SelectItem value="Activo">
                    Activo
                  </SelectItem>

                  <SelectItem value="Pausado">
                    Pausado
                  </SelectItem>

                  <SelectItem value="Entregado">
                    Entregado
                  </SelectItem>

                  <SelectItem value="Completado">
                    Completado
                  </SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge
                variant="outline"
                className="h-10 rounded-lg border-slate-200 bg-white px-4 text-slate-700"
              >
                {project.estado}
              </Badge>
            )}

            <Button
              variant="outline"
              onClick={() =>
                void load(true)
              }
              disabled={refreshing}
              className="h-10 border-slate-200 bg-white"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* ============================================================
            IDENTIDAD DEL PROYECTO
        ============================================================ */}

        <Card className="border border-slate-200 bg-white shadow-none">
          <div className="p-6 md:p-7">

            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">

              <div className="flex min-w-0 gap-4">

                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#1E3A8A]">
                  <FolderKanban className="h-6 w-6" />
                </div>

                <div className="min-w-0">

                {editingName ? (
  <div className="space-y-4">
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        Nombre del proyecto
      </label>

      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={saving}
      />
    </div>

    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        Descripción
      </label>

      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Descripción del proyecto..."
        rows={5}
        disabled={saving}
        className="resize-none"
      />
    </div>

    <div className="flex gap-2">
      <Button
        size="sm"
        onClick={saveProjectInfo}
        disabled={saving}
      >
        {saving ? "Guardando..." : "Guardar"}
      </Button>

      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setEditingName(false);
          setName(project.nombre);
          setDescription(project.descripcion || "");
        }}
        disabled={saving}
      >
        Cancelar
      </Button>
    </div>
  </div>
) : (
  <div>
    <div className="flex items-start justify-between gap-3">
      <h3 className="text-base font-semibold text-slate-900">
        {project.nombre}
      </h3>

      {canManage && (
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            setName(project.nombre);
            setDescription(project.descripcion || "");
            setEditingName(true);
          }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      )}
    </div>

    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
      {project.descripcion || "Sin descripción."}
    </p>
  </div>
)}

                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">

                    <span className="inline-flex items-center gap-1.5">
                      <Building2 className="h-4 w-4 text-slate-400" />
                      {project.empresa_nombre ||
                        "Sin empresa"}
                    </span>

                    <span className="inline-flex items-center gap-1.5">
                      <User className="h-4 w-4 text-slate-400" />
                      {project.cliente_nombre ||
                        "Sin cliente"}
                    </span>

                    {project.cliente_email && (
                      <span>
                        {project.cliente_email}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center">
                {canManage ? (
                  <Select
                    value={status}
                    onValueChange={(value) =>
                      void saveStatus(
                        value as ProjectStatus
                      )
                    }
                  >
                    <SelectTrigger className="h-10 w-[165px] border-slate-200 bg-white">
                      <SelectValue />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="Pendiente">
                        Pendiente
                      </SelectItem>
                      <SelectItem value="Activo">
                        Activo
                      </SelectItem>
                      <SelectItem value="Pausado">
                        Pausado
                      </SelectItem>
                      <SelectItem value="Entregado">
                        Entregado
                      </SelectItem>
                      <SelectItem value="Completado">
                        Completado
                      </SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-600"
                  >
                    {project.estado}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* ============================================================
            HERO / MÉTRICAS
        ============================================================ */}

        <Card className="border border-slate-200 bg-white shadow-none">
          <div className="grid gap-0 lg:grid-cols-[1.3fr_.7fr_.7fr_.7fr]">

            <div className="p-6 lg:border-r lg:border-slate-100">

              <div className="flex items-center justify-between gap-4">

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Progreso del proyecto
                  </p>

                  <p className="mt-2 text-4xl font-bold tracking-tight text-slate-900">
                    {effectiveProgress}%
                  </p>
                </div>

                <div className="hidden h-20 w-20 items-center justify-center rounded-full border-[8px] border-slate-100 sm:flex">
                  <span className="text-sm font-bold text-[#1E3A8A]">
                    {effectiveProgress}%
                  </span>
                </div>
              </div>

              <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[#1E3A8A] transition-all"
                  style={{
                    width: `${effectiveProgress}%`,
                  }}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>
                  {completedMilestones} de{" "}
                  {totalMilestones} hitos completados
                </span>

                {nextMilestone && (
                  <span className="hidden sm:inline">
                    Próximo:{" "}
                    {nextMilestone.nombre}
                  </span>
                )}
              </div>
            </div>

            <MetricBlock
              icon={
                <CalendarDays className="h-5 w-5" />
              }
              label="Inicio"
              value={formatDate(
                project.fecha_inicio
              )}
            />

            <MetricBlock
              icon={
                <Clock3 className="h-5 w-5" />
              }
              label="Fecha fin"
              value={formatDate(
                project.fecha_fin
              )}
              danger={overdue}
              detail={
                overdue
                  ? "Plazo vencido"
                  : undefined
              }
            />

            <MetricBlock
              icon={
                <BellRing className="h-5 w-5" />
              }
              label="Solicitudes abiertas"
              value={pendingChangeRequests}
              detail={
                pendingChangeRequests
                  ? "Requieren seguimiento"
                  : "Sin solicitudes pendientes"
              }
            />
          </div>
        </Card>

        {/* ============================================================
            NAVEGACIÓN
        ============================================================ */}

        <div className="sticky top-0 z-20 -mx-1 overflow-x-auto bg-[#F8FAFC]/95 px-1 py-1 backdrop-blur">

          <div className="flex min-w-max gap-1 rounded-xl border border-slate-200 bg-white p-1">

            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() =>
                  setActiveSection(
                    section.id
                  )
                }
                className={[
                  "rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                  activeSection ===
                  section.id
                    ? "bg-[#1E3A8A] text-white"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
                ].join(" ")}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>

        {/* ============================================================
            ERROR
        ============================================================ */}

        {error && (
          <Card className="border border-red-200 bg-red-50 p-4 shadow-none">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />

              <p className="text-sm text-red-700">
                {error}
              </p>
            </div>
          </Card>
        )}

        {/* ============================================================
            RESUMEN
        ============================================================ */}

        {activeSection === "resumen" && (
          <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">

            <div className="space-y-6">

              <Card className="border border-slate-200 bg-white shadow-none">

                <SectionHeader
  icon={<FolderKanban className="h-5 w-5" />}
  title="Información del proyecto"
/>

                <div className="grid gap-5 p-6 md:grid-cols-2">

                  <InfoField label="Descripción">
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">
                      {project.descripcion ||
                        "Sin descripción."}
                    </p>
                  </InfoField>

                  <InfoField label="Estado">
                    <StatusBadge
                      status={project.estado}
                    />
                  </InfoField>

                  <InfoField label="Empresa">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <Building2 className="h-4 w-4 text-slate-400" />
                      {project.empresa_nombre ||
                        "Sin empresa"}
                    </div>
                  </InfoField>

                  <InfoField label="Usuario / cliente">
                    <div className="text-sm font-medium text-slate-700">
                      {project.cliente_nombre ||
                        "Sin nombre"}

                      {project.cliente_email && (
                        <span className="mt-1 block text-xs font-normal text-slate-400">
                          {project.cliente_email}
                        </span>
                      )}
                    </div>
                  </InfoField>

                  <InfoField label="Fecha de inicio">
                    <p className="text-sm text-slate-700">
                      {formatDate(
                        project.fecha_inicio
                      )}
                    </p>
                  </InfoField>

                  <InfoField label="Fecha de fin">
                    <p
                      className={[
                        "text-sm",
                        overdue
                          ? "font-semibold text-red-600"
                          : "text-slate-700",
                      ].join(" ")}
                    >
                      {formatDate(
                        project.fecha_fin
                      )}
                    </p>
                  </InfoField>
                </div>
              </Card>

              <Card className="border border-slate-200 bg-white shadow-none">

                <SectionHeader
                  icon={
                    <CircleDot className="h-5 w-5" />
                  }
                  title="Próximos hitos"
                  action={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setActiveSection(
                          "hitos"
                        )
                      }
                      className="text-[#1E3A8A]"
                    >
                      Ver todos
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  }
                />

                <div className="divide-y divide-slate-100">

                  {milestones
                    .filter(
                      (item) =>
                        item.estado !==
                        "completado"
                    )
                    .slice(0, 4)
                    .map((milestone) => (
                      <div
                        key={milestone.id}
                        className="flex items-start gap-4 p-5"
                      >
                        <div
                          className={[
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                            milestone.estado ===
                            "en_curso"
                              ? "border-blue-200 bg-blue-50 text-[#1E3A8A]"
                              : "border-slate-200 bg-slate-50 text-slate-400",
                          ].join(" ")}
                        >
                          <CircleDot className="h-4 w-4" />
                        </div>

                        <div className="min-w-0 flex-1">

                          <p className="font-semibold text-slate-800">
                            {milestone.nombre}
                          </p>

                          {milestone.descripcion && (
                            <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm leading-6 text-slate-500">
                              {milestone.descripcion}
                            </p>
                          )}

                          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {formatDate(
                              milestone.fecha_prevista
                            )}
                          </div>
                        </div>

                        <Badge
                          variant="outline"
                          className={
                            milestone.estado ===
                            "en_curso"
                              ? "border-blue-200 bg-blue-50 text-blue-700"
                              : "border-slate-200 bg-slate-50 text-slate-500"
                          }
                        >
                          {milestone.estado ===
                          "en_curso"
                            ? "En curso"
                            : "Pendiente"}
                        </Badge>
                      </div>
                    ))}

                  {!milestones.some(
                    (item) =>
                      item.estado !==
                      "completado"
                  ) && (
                    <div className="p-8">
                      <EmptyInline
                        icon={
                          <CheckCircle2 className="h-5 w-5" />
                        }
                        text="No hay hitos pendientes."
                      />
                    </div>
                  )}
                </div>
              </Card>
            </div>

            <div className="space-y-6">

              <Card className="border border-slate-200 bg-white shadow-none">

                <SectionHeader
                  icon={
                    <AlertCircle className="h-5 w-5" />
                  }
                  title="Atención"
                />

                <div className="space-y-3 p-5">

                  <AttentionRow
                    label="Solicitudes de cambio"
                    value={pendingChangeRequests}
                    tone={
                      pendingChangeRequests
                        ? "warning"
                        : "neutral"
                    }
                    onClick={() =>
                      setActiveSection(
                        "cambios"
                      )
                    }
                  />

                  <AttentionRow
                    label="Documentos"
                    value={documents.length}
                    tone="neutral"
                    onClick={() =>
                      setActiveSection(
                        "documentos"
                      )
                    }
                  />

                  <AttentionRow
                    label="Tickets"
                    value={
                      tickets.filter(
                        (ticket) =>
                          ![
                            "cerrado",
                            "resuelto",
                          ].includes(
                            String(
                              ticket.estado ||
                                ""
                            ).toLowerCase()
                          )
                      ).length
                    }
                    tone="neutral"
                    onClick={() =>
                      setActiveSection(
                        "soporte"
                      )
                    }
                  />

                  <AttentionRow
                    label="Facturas"
                    value={billing.length}
                    tone="neutral"
                    onClick={() =>
                      setActiveSection(
                        "finanzas"
                      )
                    }
                  />
                </div>
              </Card>

              <Card className="border border-slate-200 bg-white shadow-none">

                <SectionHeader
                  icon={
                    <MessageSquare className="h-5 w-5" />
                  }
                  title="Última actualización"
                  action={
                    updates.length ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setActiveSection(
                            "actualizaciones"
                          )
                        }
                        className="text-[#1E3A8A]"
                      >
                        Ver todas
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    ) : undefined
                  }
                />

                <div className="p-5">

                  {updates[0] ? (
                    <>
                      <p className="font-semibold text-slate-800">
                        {updates[0].titulo}
                      </p>

                      <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-slate-500">
                        {updates[0].contenido}
                      </p>

                      <p className="mt-4 text-xs text-slate-400">
                        {formatDateTime(
                          updates[0].created_at
                        )}
                      </p>
                    </>
                  ) : (
                    <EmptyInline
                      icon={
                        <MessageSquare className="h-5 w-5" />
                      }
                      text="Todavía no hay actualizaciones."
                    />
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ============================================================
            HITOS
        ============================================================ */}

        {activeSection === "hitos" && (
          <ProjectMilestones
            projectId={projectId}
            milestones={milestones}
            canManage={canManage}
            onRefresh={() =>
               load(true)
            }
          />
        )}

        {/* ============================================================
            ACTUALIZACIONES
        ============================================================ */}

        {activeSection ===
          "actualizaciones" && (
          <ProjectUpdates
            projectId={projectId}
            updates={updates}
            canManage={canManage}
            onRefresh={() =>
               load(true)
            }
          />
        )}

        {/* ============================================================
            DOCUMENTOS
        ============================================================ */}

        {activeSection ===
          "documentos" && (
          <ProjectDocuments
            projectId={projectId}
            documents={documents}
            canManage={canManage}
            onRefresh={() =>
               load(true)
            }
          />
        )}

        {/* ============================================================
            CAMBIOS
        ============================================================ */}

        {activeSection === "cambios" && (
          <ProjectChangeRequests
            requests={requests}
            canManage={canManage}
            reviewNotes={reviewNotes}
            onNotes={(id, value) =>
              setReviewNotes(
                (current) => ({
                  ...current,
                  [id]: value,
                })
              )
            }
            onResolve={resolve}
          />
        )}

        {/* ============================================================
            FINANZAS
        ============================================================ */}

        {activeSection === "finanzas" && (
          <ProjectRelations
            projectId={projectId}
            quotations={quotations}
            billing={billing}
            tickets={[]}
            onNavigate={onNavigate}
          />
        )}

        {/* ============================================================
            SOPORTE
        ============================================================ */}

        {activeSection === "soporte" && (
          <ProjectRelations
            projectId={projectId}
            quotations={[]}
            billing={[]}
            tickets={tickets}
            onNavigate={onNavigate}
          />
        )}

       {/* ============================================================
    ALCANCE DEL PROYECTO
============================================================ */}

{activeSection === "alcance" && (
  <ProjectScope
    projectId={projectId}
    canManage={canManage}
    onRefreshProject={() => void load(true)}
  />
)}
      </div>
    </div>
  );
}

/* ============================================================================
   UI HELPERS
============================================================================ */

function MetricBlock({
  icon,
  label,
  value,
  detail,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  detail?: string;
  danger?: boolean;
}) {
  return (
    <div className="p-6 lg:border-r lg:border-slate-100 last:border-r-0">

      <div className="flex items-center gap-3">

        <div
          className={[
            "flex h-10 w-10 items-center justify-center rounded-xl",
            danger
              ? "bg-red-50 text-red-600"
              : "bg-slate-50 text-slate-500",
          ].join(" ")}
        >
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {label}
          </p>

          <p
            className={[
              "mt-1 font-semibold",
              danger
                ? "text-red-600"
                : "text-slate-800",
            ].join(" ")}
          >
            {value}
          </p>

          {detail && (
            <p
              className={[
                "mt-1 text-xs",
                danger
                  ? "text-red-500"
                  : "text-slate-400",
              ].join(" ")}
            >
              {detail}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 lg:p-6">

      <div className="flex min-w-0 items-start gap-3">

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A]">
          {icon}
        </div>

        <div className="min-w-0">

          <h2 className="font-semibold text-slate-800">
            {title}
          </h2>

          {description && (
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {description}
            </p>
          )}
        </div>
      </div>

      {action && (
        <div className="shrink-0">
          {action}
        </div>
      )}
    </div>
  );
}

function InfoField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      {children}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: ProjectStatus;
}) {
  const classes: Record<
    ProjectStatus,
    string
  > = {
    Pendiente:
      "border-amber-200 bg-amber-50 text-amber-700",
    Activo:
      "border-blue-200 bg-blue-50 text-blue-700",
    Pausado:
      "border-slate-200 bg-slate-50 text-slate-600",
    Entregado:
      "border-violet-200 bg-violet-50 text-violet-700",
    Completado:
      "border-emerald-200 bg-emerald-50 text-emerald-700",
  };

  return (
    <Badge
      variant="outline"
      className={classes[status]}
    >
      {status}
    </Badge>
  );
}

function AttentionRow({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  tone: "warning" | "neutral";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-3 text-left transition-colors hover:border-slate-200 hover:bg-slate-50"
    >
      <span className="text-sm text-slate-600">
        {label}
      </span>

      <span
        className={[
          "min-w-[32px] rounded-lg px-2 py-1 text-center text-xs font-semibold",
          tone === "warning"
            ? "bg-amber-50 text-amber-700"
            : "bg-slate-100 text-slate-600",
        ].join(" ")}
      >
        {value}
      </span>
    </button>
  );
}

function EmptyInline({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div className="flex items-center gap-3 text-sm text-slate-400">
      {icon}
      <span>{text}</span>
    </div>
  );
}

function formatDate(
  value: string | null | undefined
) {
  if (!value) return "Sin fecha";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }

  return date.toLocaleDateString(
    "es-ES",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }
  );
}

function formatDateTime(
  value: string | null | undefined
) {
  if (!value) return "Sin fecha";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }

  return date.toLocaleString(
    "es-ES",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

