import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  History,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

type ScopeVersionStatus =
  "draft" | "pending_client" | "changes_requested" | "accepted" | "superseded";

type ScopeChangeStatus = "pending" | "in_review" | "rejected" | "addressed";

type ScopeItem = {
  nombre: string;
  descripcion: string;
};

/**
 * The Edge Function renders these Spanish keys first and preserves any extra
 * keys already stored in an existing snapshot. Do not rename them casually:
 * they are part of the document format stored in published versions.
 */
export type ProjectScopeSnapshot = Record<string, unknown> & {
  schema_version: number;
  resumen: string;
  objetivos: string[];
  alcance_incluido: string[];
  alcance_excluido: string[];
  fases: ScopeItem[];
  entregables: ScopeItem[];
  criterios_aceptacion: string[];
  dependencias: string[];
  condiciones: string[];
  responsabilidades_cliente: string[];
  responsabilidades_modira: string[];
  notas: string;
};

type ScopeVersion = {
  id: string;
  project_id: string;
  version_number: number;
  status: ScopeVersionStatus;
  content_snapshot: ProjectScopeSnapshot;
  document_path: string | null;
  document_sha256: string | null;
  is_current: boolean;
  created_by: string;
  created_at: string;
  published_by: string | null;
  published_at: string | null;
};

type ScopeAcceptance = {
  id: string;
  project_id: string;
  scope_version_id: string;
  user_id: string;
  accepted_at: string;
  pdf_sha256: string;
  content_snapshot_sha256: string;
  acknowledged: boolean;
};

type ScopeChangeRequest = {
  id: string;
  project_id: string;
  scope_version_id: string;
  comments: string;
  status: ScopeChangeStatus;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  resolved_at: string | null;
};

type Props = {
  projectId: string;
  canManage: boolean;
  /** Refreshes the parent ProjectDetail after publication pauses an active project. */
  onRefreshProject?: () => void;
  /** null means that the migration is unavailable or the check could not run. */
  onActivationEligibilityChange?: (eligible: boolean | null) => void;
};

const BUCKET = "project-scope-documents";

const versionStatusLabel: Record<ScopeVersionStatus, string> = {
  draft: "Borrador",
  pending_client: "Pendiente de cliente",
  changes_requested: "Cambios solicitados",
  accepted: "Aceptado",
  superseded: "Histórica",
};

const versionStatusClass: Record<ScopeVersionStatus, string> = {
  draft: "border-slate-200 bg-slate-50 text-slate-700",
  pending_client: "border-amber-200 bg-amber-50 text-amber-700",
  changes_requested: "border-orange-200 bg-orange-50 text-orange-700",
  accepted: "border-emerald-200 bg-emerald-50 text-emerald-700",
  superseded: "border-slate-200 bg-slate-50 text-slate-500",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function textList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => text(item).trim()).filter(Boolean)
    : [];
}

function itemList(value: unknown): ScopeItem[] {
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    if (!isRecord(item)) {
      return { nombre: text(item), descripcion: "" };
    }

    return {
      nombre: text(item.nombre ?? item.titulo ?? item.name),
      descripcion: text(item.descripcion ?? item.description),
    };
  });
}

function emptySnapshot(): ProjectScopeSnapshot {
  return {
    schema_version: 1,
    resumen: "",
    objetivos: [],
    alcance_incluido: [],
    alcance_excluido: [],
    fases: [],
    entregables: [],
    criterios_aceptacion: [],
    dependencias: [],
    condiciones: [],
    responsabilidades_cliente: [],
    responsabilidades_modira: [],
    notas: "",
  };
}

/** Keeps unknown, previously saved keys so editing a draft never erases them. */
function normalizeSnapshot(value: unknown): ProjectScopeSnapshot {
  const raw = isRecord(value) ? value : {};

  return {
    ...raw,
    schema_version: Number(raw.schema_version) || 1,
    resumen: text(raw.resumen),
    objetivos: textList(raw.objetivos),
    alcance_incluido: textList(raw.alcance_incluido ?? raw.inclusiones),
    alcance_excluido: textList(raw.alcance_excluido ?? raw.exclusiones),
    fases: itemList(raw.fases),
    entregables: itemList(raw.entregables),
    criterios_aceptacion: textList(
      raw.criterios_aceptacion ?? raw.criterios_de_aceptacion,
    ),
    dependencias: textList(raw.dependencias),
    condiciones: textList(raw.condiciones ?? raw.supuestos),
    responsabilidades_cliente: textList(raw.responsabilidades_cliente),
    responsabilidades_modira: textList(
      raw.responsabilidades_modira ?? raw.responsabilidades_proveedor,
    ),
    notas: text(raw.notas ?? raw.observaciones),
  };
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Sin fecha"
    : date.toLocaleString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function readableError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String(
      (error as { message?: unknown }).message || "",
    ).trim();
    if (message) return message;
  }
  return fallback;
}

export default function ProjectScope({
  projectId,
  canManage,
  onRefreshProject,
  onActivationEligibilityChange,
}: Props) {
  const [versions, setVersions] = useState<ScopeVersion[]>([]);
  const [acceptances, setAcceptances] = useState<ScopeAcceptance[]>([]);
  const [requests, setRequests] = useState<ScopeChangeRequest[]>([]);
  const [draft, setDraft] = useState<ScopeVersion | null>(null);
  const [snapshot, setSnapshot] = useState<ProjectScopeSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);

      try {
        setIntegrationError(null);

        const [versionsResult, acceptancesResult, requestsResult] =
          await Promise.all([
            supabase
              .from("project_scope_versions")
              .select(
                "id,project_id,version_number,status,content_snapshot,document_path,document_sha256,is_current,created_by,created_at,published_by,published_at",
              )
              .eq("project_id", projectId)
              .order("version_number", { ascending: false }),
            supabase
              .from("project_scope_acceptances")
              .select(
                "id,project_id,scope_version_id,user_id,accepted_at,pdf_sha256,content_snapshot_sha256,acknowledged",
              )
              .eq("project_id", projectId)
              .order("accepted_at", { ascending: false }),
            supabase
              .from("project_scope_change_requests")
              .select(
                "id,project_id,scope_version_id,comments,status,created_at,reviewed_by,reviewed_at,review_notes,resolved_at",
              )
              .eq("project_id", projectId)
              .order("created_at", { ascending: false }),
          ]);

        const firstError =
          versionsResult.error ||
          acceptancesResult.error ||
          requestsResult.error;
        if (firstError) throw firstError;

        const nextVersions = (
          (versionsResult.data || []) as ScopeVersion[]
        ).map((version) => ({
          ...version,
          content_snapshot: normalizeSnapshot(version.content_snapshot),
        }));
        const nextAcceptances = (acceptancesResult.data ||
          []) as ScopeAcceptance[];
        const nextRequests = (requestsResult.data ||
          []) as ScopeChangeRequest[];
        const nextDraft =
          nextVersions.find((version) => version.status === "draft") || null;

        setVersions(nextVersions);
        setAcceptances(nextAcceptances);
        setRequests(nextRequests);
        setDraft(nextDraft);
        setSnapshot(
          nextDraft
            ? normalizeSnapshot(nextDraft.content_snapshot)
            : emptySnapshot(),
        );

        const current =
          nextVersions.find((version) => version.is_current) || null;
        const isAccepted = Boolean(
          current &&
          current.status === "accepted" &&
          nextAcceptances.some(
            (acceptance) => acceptance.scope_version_id === current.id,
          ),
        );
        onActivationEligibilityChange?.(isAccepted);
      } catch (error) {
        const message = readableError(
          error,
          "No se ha podido cargar el flujo de alcance.",
        );
        setIntegrationError(message);
        onActivationEligibilityChange?.(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [onActivationEligibilityChange, projectId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const currentVersion = useMemo(
    () => versions.find((version) => version.is_current) || null,
    [versions],
  );
  const currentAcceptance = useMemo(
    () =>
      currentVersion
        ? acceptances.find(
            (acceptance) => acceptance.scope_version_id === currentVersion.id,
          ) || null
        : null,
    [acceptances, currentVersion],
  );
  const canCreateDraft =
    canManage &&
    !draft &&
    (!currentVersion ||
      currentVersion.status === "accepted" ||
      currentVersion.status === "changes_requested");

  const createDraft = async () => {
    if (!canCreateDraft) return;

    const initialSnapshot = currentVersion
      ? normalizeSnapshot(currentVersion.content_snapshot)
      : emptySnapshot();

    try {
      setSaving(true);
      const { data, error } = await supabase.rpc("create_project_scope_draft", {
        p_project_id: projectId,
        p_content_snapshot: initialSnapshot,
      });
      if (error) throw error;

      const created = {
        ...(data as ScopeVersion),
        content_snapshot: normalizeSnapshot(
          (data as ScopeVersion).content_snapshot,
        ),
      };
      setDraft(created);
      setSnapshot(created.content_snapshot);
      toast.success(`Borrador V${created.version_number} creado.`);
      await load(true);
    } catch (error) {
      toast.error(readableError(error, "No se pudo crear el borrador."));
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async (): Promise<ScopeVersion | null> => {
    if (!draft) return null;

    try {
      setSaving(true);
      const { data, error } = await supabase.rpc("update_project_scope_draft", {
        p_version_id: draft.id,
        p_content_snapshot: snapshot,
      });
      if (error) throw error;

      const saved = {
        ...(data as ScopeVersion),
        content_snapshot: normalizeSnapshot(
          (data as ScopeVersion).content_snapshot,
        ),
      };
      setDraft(saved);
      setSnapshot(saved.content_snapshot);
      setVersions((current) =>
        current.map((version) => (version.id === saved.id ? saved : version)),
      );
      toast.success("Borrador de alcance guardado.");
      return saved;
    } catch (error) {
      toast.error(readableError(error, "No se pudo guardar el borrador."));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const publishDraft = async () => {
    if (!draft) return;

    const saved = await saveDraft();
    if (!saved) return;

    try {
      setPublishing(true);
      const { data, error } = await supabase.functions.invoke(
        "generate-project-scope-document",
        {
          body: {
            action: "generate_project_scope_document",
            version_id: saved.id,
          },
        },
      );

      if (error) throw error;
      if (!isRecord(data) || data.success !== true) {
        throw new Error(
          isRecord(data) && typeof data.error === "string"
            ? data.error
            : "La Edge Function no ha confirmado la publicación.",
        );
      }

      toast.success(
        data.already_published
          ? "La versión ya estaba publicada."
          : "PDF oficial generado y versión publicada.",
      );
      await load(true);
      onRefreshProject?.();
    } catch (error) {
      toast.error(
        readableError(
          error,
          "No se pudo generar o publicar el documento oficial.",
        ),
      );
    } finally {
      setPublishing(false);
    }
  };

  const openPdf = async (version: ScopeVersion) => {
    if (!version.document_path) return;

    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(version.document_path, 60);
      if (error) throw error;
      if (!data?.signedUrl)
        throw new Error("No se pudo obtener una URL segura.");

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(readableError(error, "No se pudo abrir el PDF oficial."));
    }
  };

  const reviewRequest = async (
    request: ScopeChangeRequest,
    action: "in_review" | "rejected",
  ) => {
    try {
      const { error } = await supabase.rpc(
        "resolve_project_scope_change_request",
        {
          p_request_id: request.id,
          p_action: action,
          p_review_notes: reviewNotes[request.id]?.trim() || null,
        },
      );
      if (error) throw error;

      toast.success(
        action === "in_review"
          ? "Solicitud marcada en revisión."
          : "Solicitud rechazada y alcance devuelto al cliente.",
      );
      await load(true);
    } catch (error) {
      toast.error(readableError(error, "No se pudo actualizar la solicitud."));
    }
  };

  if (loading) {
    return (
      <Card className="flex min-h-[320px] items-center justify-center border border-slate-200 bg-white shadow-none">
        <Loader2 className="h-6 w-6 animate-spin text-[#1E3A8A]" />
      </Card>
    );
  }

  if (integrationError) {
    return (
      <Card className="border border-amber-200 bg-amber-50 p-5 shadow-none">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <p className="font-semibold text-amber-900">
              El flujo de alcance no está disponible
            </p>
            <p className="mt-1 text-sm leading-6 text-amber-800">
              {integrationError}
            </p>
            <p className="mt-2 text-xs leading-5 text-amber-700">
              Comprueba que la migración 163 y la Edge Function
              <code className="mx-1">generate-project-scope-document</code>
              estén desplegadas antes de crear un alcance.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border border-slate-200 bg-white shadow-none">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between lg:p-6">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">
                Estado del alcance
              </h2>
              {currentVersion ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={versionStatusClass[currentVersion.status]}
                  >
                    V{currentVersion.version_number} ·{" "}
                    {versionStatusLabel[currentVersion.status]}
                  </Badge>
                  {currentVersion.published_at && (
                    <span className="text-xs text-slate-500">
                      Publicada {formatDateTime(currentVersion.published_at)}
                    </span>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-sm text-slate-500">
                  Todavía no existe un alcance para este proyecto.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load(true)}
              disabled={refreshing}
              className="border-slate-200"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2">Actualizar</span>
            </Button>
            {canCreateDraft && (
              <Button
                size="sm"
                onClick={() => void createDraft()}
                disabled={saving}
                className="bg-[#1E3A8A] hover:bg-[#162D6B]"
              >
                <Plus className="mr-2 h-4 w-4" />
                {currentVersion ? "Nueva versión" : "Crear borrador"}
              </Button>
            )}
          </div>
        </div>

        <div className="border-t border-slate-100 px-5 py-4 lg:px-6">
          {currentAcceptance ? (
            <div className="flex items-start gap-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">La versión vigente está aceptada.</p>
                <p className="mt-1 text-xs text-emerald-700">
                  Aceptación registrada el{" "}
                  {formatDateTime(currentAcceptance.accepted_at)}. El proyecto
                  ya puede activarse; PostgreSQL lo vuelve a comprobar.
                </p>
              </div>
            </div>
          ) : currentVersion ? (
            <div className="flex items-start gap-3 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">
                  El proyecto no puede activarse todavía.
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  Solo una aceptación registrada para la versión vigente permite
                  activar el proyecto.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      {draft && canManage && (
        <ScopeEditor
          version={draft}
          snapshot={snapshot}
          saving={saving}
          publishing={publishing}
          onChange={setSnapshot}
          onSave={() => void saveDraft()}
          onPublish={() => void publishDraft()}
        />
      )}

      {!draft && currentVersion?.document_path && (
        <Card className="border border-slate-200 bg-white shadow-none">
          <PanelHeading
            icon={<FileCheck2 className="h-5 w-5" />}
            title="Documento oficial vigente"
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => void openPdf(currentVersion)}
                className="border-slate-200"
              >
                <Download className="mr-2 h-4 w-4" />
                Ver o descargar PDF
              </Button>
            }
          />
          <div className="space-y-2 p-5 text-sm text-slate-600">
            <p>
              V{currentVersion.version_number} · publicada{" "}
              {formatDateTime(currentVersion.published_at)}
            </p>
            <p className="break-all font-mono text-xs text-slate-400">
              SHA-256: {currentVersion.document_sha256}
            </p>
          </div>
        </Card>
      )}

      <ChangeRequests
        requests={requests}
        canManage={canManage}
        reviewNotes={reviewNotes}
        onNotes={(id, value) =>
          setReviewNotes((current) => ({ ...current, [id]: value }))
        }
        onReview={reviewRequest}
      />

      <Card className="border border-slate-200 bg-white shadow-none">
        <PanelHeading
          icon={<History className="h-5 w-5" />}
          title="Historial de versiones"
          description="Las versiones publicadas, sus documentos y sus aceptaciones se conservan como historial."
        />
        {versions.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">
            No hay versiones de alcance.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {versions.map((version) => {
              const acceptance = acceptances.find(
                (item) => item.scope_version_id === version.id,
              );
              return (
                <div
                  key={version.id}
                  className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-800">
                        Versión {version.version_number}
                      </p>
                      <Badge
                        variant="outline"
                        className={versionStatusClass[version.status]}
                      >
                        {versionStatusLabel[version.status]}
                      </Badge>
                      {version.is_current && (
                        <Badge
                          variant="outline"
                          className="border-blue-200 bg-blue-50 text-blue-700"
                        >
                          Vigente
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Creada {formatDateTime(version.created_at)}
                      {version.published_at
                        ? ` · Publicada ${formatDateTime(version.published_at)}`
                        : ""}
                      {acceptance
                        ? ` · Aceptada ${formatDateTime(acceptance.accepted_at)}`
                        : ""}
                    </p>
                  </div>
                  {version.document_path && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void openPdf(version)}
                      className="border-slate-200"
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      PDF
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {canManage && !draft && currentVersion && !canCreateDraft && (
        <p className="text-xs leading-5 text-slate-500">
          {currentVersion.status === "pending_client"
            ? "El cliente debe aceptar el alcance o solicitar cambios antes de crear otra versión."
            : currentVersion.status === "changes_requested"
              ? "Crea una nueva versión para atender la solicitud de cambios."
              : "No hay acciones disponibles para la versión vigente."}
        </p>
      )}
    </div>
  );
}

function ScopeEditor({
  version,
  snapshot,
  saving,
  publishing,
  onChange,
  onSave,
  onPublish,
}: {
  version: ScopeVersion;
  snapshot: ProjectScopeSnapshot;
  saving: boolean;
  publishing: boolean;
  onChange: (snapshot: ProjectScopeSnapshot) => void;
  onSave: () => void;
  onPublish: () => void;
}) {
  const disabled = saving || publishing;
  const setText = (key: "resumen" | "notas", value: string) =>
    onChange({ ...snapshot, [key]: value });
  const setList = (
    key:
      | "objetivos"
      | "alcance_incluido"
      | "alcance_excluido"
      | "criterios_aceptacion"
      | "dependencias"
      | "condiciones"
      | "responsabilidades_cliente"
      | "responsabilidades_modira",
    value: string[],
  ) => onChange({ ...snapshot, [key]: value });
  const setItems = (key: "fases" | "entregables", value: ScopeItem[]) =>
    onChange({ ...snapshot, [key]: value });

  return (
    <Card className="border border-slate-200 bg-white shadow-none">
      <PanelHeading
        icon={<Pencil className="h-5 w-5" />}
        title={`Borrador de alcance · V${version.version_number}`}
        description="El contenido se guarda como snapshot. Al publicar, se vuelve inmutable y no podrá editarse."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onSave}
              disabled={disabled}
              className="border-slate-200"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar borrador
            </Button>
            <Button
              size="sm"
              onClick={onPublish}
              disabled={disabled}
              className="bg-[#1E3A8A] hover:bg-[#162D6B]"
            >
              {publishing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Generar PDF y publicar
            </Button>
          </div>
        }
      />

      <div className="space-y-7 p-5 lg:p-6">
        <Field
          label="Resumen del alcance"
          hint="Descripción general de lo acordado."
        >
          <Textarea
            value={snapshot.resumen}
            onChange={(event) => setText("resumen", event.target.value)}
            disabled={disabled}
            rows={4}
            className="resize-y"
          />
        </Field>

        <div className="grid gap-6 xl:grid-cols-2">
          <TextListEditor
            label="Objetivos"
            value={snapshot.objetivos}
            onChange={(value) => setList("objetivos", value)}
            disabled={disabled}
            placeholder="Objetivo del proyecto"
          />
          <TextListEditor
            label="Alcance incluido"
            value={snapshot.alcance_incluido}
            onChange={(value) => setList("alcance_incluido", value)}
            disabled={disabled}
            placeholder="Trabajo, servicio o resultado incluido"
          />
          <TextListEditor
            label="Fuera de alcance"
            value={snapshot.alcance_excluido}
            onChange={(value) => setList("alcance_excluido", value)}
            disabled={disabled}
            placeholder="Exclusión o límite del servicio"
          />
          <TextListEditor
            label="Criterios de aceptación"
            value={snapshot.criterios_aceptacion}
            onChange={(value) => setList("criterios_aceptacion", value)}
            disabled={disabled}
            placeholder="Condición verificable para considerar aceptado el resultado"
          />
        </div>

        <ItemListEditor
          label="Fases del proyecto"
          value={snapshot.fases}
          onChange={(value) => setItems("fases", value)}
          disabled={disabled}
          itemName="Fase"
        />
        <ItemListEditor
          label="Entregables"
          value={snapshot.entregables}
          onChange={(value) => setItems("entregables", value)}
          disabled={disabled}
          itemName="Entregable"
        />

        <div className="grid gap-6 xl:grid-cols-2">
          <TextListEditor
            label="Dependencias"
            value={snapshot.dependencias}
            onChange={(value) => setList("dependencias", value)}
            disabled={disabled}
            placeholder="Acceso, información o tercero necesario"
          />
          <TextListEditor
            label="Condiciones y supuestos"
            value={snapshot.condiciones}
            onChange={(value) => setList("condiciones", value)}
            disabled={disabled}
            placeholder="Condición comercial, técnica u operativa"
          />
          <TextListEditor
            label="Responsabilidades del cliente"
            value={snapshot.responsabilidades_cliente}
            onChange={(value) => setList("responsabilidades_cliente", value)}
            disabled={disabled}
            placeholder="Responsabilidad del cliente"
          />
          <TextListEditor
            label="Responsabilidades de Modira"
            value={snapshot.responsabilidades_modira}
            onChange={(value) => setList("responsabilidades_modira", value)}
            disabled={disabled}
            placeholder="Responsabilidad de Modira"
          />
        </div>

        <Field label="Notas adicionales">
          <Textarea
            value={snapshot.notas}
            onChange={(event) => setText("notas", event.target.value)}
            disabled={disabled}
            rows={4}
            className="resize-y"
          />
        </Field>
      </div>
    </Card>
  );
}

function ChangeRequests({
  requests,
  canManage,
  reviewNotes,
  onNotes,
  onReview,
}: {
  requests: ScopeChangeRequest[];
  canManage: boolean;
  reviewNotes: Record<string, string>;
  onNotes: (id: string, value: string) => void;
  onReview: (
    request: ScopeChangeRequest,
    action: "in_review" | "rejected",
  ) => void;
}) {
  return (
    <Card className="border border-slate-200 bg-white shadow-none">
      <PanelHeading
        icon={<AlertCircle className="h-5 w-5" />}
        title="Solicitudes de cambio del alcance"
        description="Son independientes de las solicitudes generales del proyecto y siempre se vinculan a una versión concreta."
      />
      {requests.length === 0 ? (
        <div className="p-6 text-sm text-slate-500">
          No hay solicitudes de cambio del alcance.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {requests.map((request) => {
            const actionable =
              canManage && ["pending", "in_review"].includes(request.status);
            return (
              <div key={request.id} className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-800">
                        Solicitud sobre una versión del alcance
                      </p>
                      <ChangeStatusBadge status={request.status} />
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                      {request.comments}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs text-slate-400">
                    {formatDateTime(request.created_at)}
                  </p>
                </div>
                {request.review_notes && (
                  <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Notas de revisión
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">
                      {request.review_notes}
                    </p>
                  </div>
                )}
                {actionable && (
                  <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                    <Textarea
                      value={reviewNotes[request.id] || ""}
                      onChange={(event) =>
                        onNotes(request.id, event.target.value)
                      }
                      rows={3}
                      maxLength={5000}
                      placeholder="Notas internas o respuesta para el cliente (opcional al poner en revisión)."
                      className="resize-y"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onReview(request, "in_review")}
                        className="border-slate-200"
                      >
                        Marcar en revisión
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onReview(request, "rejected")}
                        className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                      >
                        Rechazar solicitud
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ChangeStatusBadge({ status }: { status: ScopeChangeStatus }) {
  const labels: Record<ScopeChangeStatus, string> = {
    pending: "Pendiente",
    in_review: "En revisión",
    rejected: "Rechazada",
    addressed: "Atendida",
  };
  const classes: Record<ScopeChangeStatus, string> = {
    pending: "border-amber-200 bg-amber-50 text-amber-700",
    in_review: "border-blue-200 bg-blue-50 text-blue-700",
    rejected: "border-red-200 bg-red-50 text-red-700",
    addressed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
  return (
    <Badge variant="outline" className={classes[status]}>
      {labels[status]}
    </Badge>
  );
}

function PanelHeading({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-start sm:justify-between lg:p-6">
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A]">
          {icon}
        </div>
        <div>
          <h2 className="font-semibold text-slate-800">{title}</h2>
          {description && (
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              {description}
            </p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      {hint && (
        <span className="mt-1 block text-xs text-slate-400">{hint}</span>
      )}
      <div className="mt-2">{children}</div>
    </label>
  );
}

function TextListEditor({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  disabled: boolean;
  placeholder: string;
}) {
  const update = (index: number, next: string) => {
    const items = [...value];
    items[index] = next;
    onChange(items);
  };

  return (
    <div>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <div className="mt-2 space-y-2">
        {value.map((item, index) => (
          <div key={`${label}-${index}`} className="flex gap-2">
            <Input
              value={item}
              onChange={(event) => update(index, event.target.value)}
              disabled={disabled}
              placeholder={placeholder}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() =>
                onChange(value.filter((_, itemIndex) => itemIndex !== index))
              }
              className="border-slate-200 text-slate-500"
            >
              Quitar
            </Button>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange([...value, ""])}
          className="border-dashed border-slate-300 text-[#1E3A8A]"
        >
          <Plus className="mr-2 h-3.5 w-3.5" /> Añadir
        </Button>
      </div>
    </div>
  );
}

function ItemListEditor({
  label,
  value,
  onChange,
  disabled,
  itemName,
}: {
  label: string;
  value: ScopeItem[];
  onChange: (value: ScopeItem[]) => void;
  disabled: boolean;
  itemName: string;
}) {
  const update = (index: number, patch: Partial<ScopeItem>) => {
    const items = [...value];
    items[index] = { ...items[index], ...patch };
    onChange(items);
  };

  return (
    <div>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <div className="mt-2 space-y-3">
        {value.map((item, index) => (
          <div
            key={`${label}-${index}`}
            className="rounded-xl border border-slate-200 p-3"
          >
            <div className="flex gap-2">
              <Input
                value={item.nombre}
                onChange={(event) =>
                  update(index, { nombre: event.target.value })
                }
                disabled={disabled}
                placeholder={`Nombre de la ${itemName.toLowerCase()}`}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() =>
                  onChange(value.filter((_, itemIndex) => itemIndex !== index))
                }
                className="border-slate-200 text-slate-500"
              >
                Quitar
              </Button>
            </div>
            <Textarea
              value={item.descripcion}
              onChange={(event) =>
                update(index, { descripcion: event.target.value })
              }
              disabled={disabled}
              placeholder={`Descripción de la ${itemName.toLowerCase()}`}
              rows={3}
              className="mt-2 resize-y"
            />
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange([...value, { nombre: "", descripcion: "" }])}
          className="border-dashed border-slate-300 text-[#1E3A8A]"
        >
          <Plus className="mr-2 h-3.5 w-3.5" /> Añadir {itemName.toLowerCase()}
        </Button>
      </div>
    </div>
  );
}
