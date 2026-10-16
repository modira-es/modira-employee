import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  CircleHelp,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { rolesPermissionsRpc } from "./rolesPermissionsRpc";
import type {
  WorkerPermission,
  WorkerRole,
  WorkerRoleAssignment,
} from "./rolesPermissionsTypes";

type TabKey = "roles" | "workers" | "matrix" | "permissions";

const cx = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

function readableError(error: unknown) {
  return error instanceof Error ? error.message : "No se han podido cargar los datos.";
}

function roleLabel(role: WorkerRole) {
  return role.name || role.code;
}

export default function RolesPermissions() {
  const [roles, setRoles] = useState<WorkerRole[]>([]);
  const [permissions, setPermissions] = useState<WorkerPermission[]>([]);
  const [workers, setWorkers] = useState<WorkerRoleAssignment[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("roles");
  const [selectedRoleCode, setSelectedRoleCode] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [roleModal, setRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<WorkerRole | null>(null);
  const [roleCode, setRoleCode] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [draftPermissionCodes, setDraftPermissionCodes] = useState<string[]>([]);

  const [selectedWorker, setSelectedWorker] = useState<WorkerRoleAssignment | null>(null);
  const [workerRoleToAdd, setWorkerRoleToAdd] = useState("");

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const [nextRoles, nextPermissions, nextWorkers] = await Promise.all([
        rolesPermissionsRpc.getRoles(),
        rolesPermissionsRpc.getPermissions(),
        rolesPermissionsRpc.getWorkers(),
      ]);
      setRoles(nextRoles ?? []);
      setPermissions(nextPermissions ?? []);
      setWorkers(nextWorkers ?? []);
      setSelectedRoleCode((current) =>
        current && (nextRoles ?? []).some((role) => role.code === current)
          ? current
          : (nextRoles ?? [])[0]?.code ?? "",
      );
    } catch (e) {
      setError(readableError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedRole = roles.find((role) => role.code === selectedRoleCode) ?? null;
  const selectedRolePermissions = permissions.filter((permission) =>
    (permission.role_codes ?? []).includes(selectedRoleCode),
  );

  const filteredRoles = roles.filter((role) =>
    `${role.name} ${role.code} ${role.description ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredWorkers = workers.filter((worker) =>
    `${worker.worker_name ?? ""} ${(worker.role_names ?? []).join(" ")} ${(worker.role_codes ?? []).join(" ")}`
      .toLowerCase().includes(search.toLowerCase()),
  );
  const filteredPermissions = permissions.filter((permission) =>
    `${permission.code} ${permission.resource} ${permission.action} ${permission.description ?? ""}`
      .toLowerCase().includes(search.toLowerCase()),
  );

  function openCreateRole() {
    setEditingRole(null);
    setRoleCode("");
    setRoleName("");
    setRoleDescription("");
    setDraftPermissionCodes([]);
    setRoleModal(true);
  }

  function openEditRole(role: WorkerRole) {
    setEditingRole(role);
    setRoleCode(role.code);
    setRoleName(role.name);
    setRoleDescription(role.description ?? "");
    setDraftPermissionCodes(
      permissions.filter((permission) => (permission.role_codes ?? []).includes(role.code))
        .map((permission) => permission.code),
    );
    setRoleModal(true);
  }

  async function saveRole() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (editingRole) {
        await rolesPermissionsRpc.updateCustomRole(editingRole.id, roleName.trim(), roleDescription);
        await rolesPermissionsRpc.replaceCustomRolePermissions(editingRole.code, draftPermissionCodes);
        setNotice("Rol actualizado correctamente.");
      } else {
        const code = roleCode.trim().toLowerCase().replace(/\s+/g, "_");
        await rolesPermissionsRpc.createCustomRole(code, roleName.trim(), roleDescription);
        if (draftPermissionCodes.length) {
          await rolesPermissionsRpc.replaceCustomRolePermissions(code, draftPermissionCodes);
        }
        setSelectedRoleCode(code);
        setNotice("Rol creado correctamente.");
      }
      setRoleModal(false);
      await loadData(true);
    } catch (e) {
      setError(readableError(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleWorkerRole(worker: WorkerRoleAssignment, roleCodeValue: string, currentlyAssigned: boolean) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (currentlyAssigned) {
        await rolesPermissionsRpc.removeRole(worker.auth_user_id, roleCodeValue);
      } else {
        await rolesPermissionsRpc.assignRole(worker.auth_user_id, roleCodeValue);
      }
      setNotice("Asignación actualizada.");
      await loadData(true);
      setSelectedWorker((current) => current?.auth_user_id === worker.auth_user_id
        ? workers.find((item) => item.auth_user_id === worker.auth_user_id) ?? worker
        : current);
    } catch (e) {
      setError(readableError(e));
    } finally {
      setSaving(false);
    }
  }

  const tabs: Array<{ key: TabKey; label: string; icon: typeof ShieldCheck }> = [
    { key: "roles", label: "Roles", icon: ShieldCheck },
    { key: "workers", label: "Trabajadores", icon: Users },
    { key: "matrix", label: "Matriz de permisos", icon: Check },
    { key: "permissions", label: "Catálogo de permisos", icon: LockKeyhole },
  ];

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#6C7890]">
            <ShieldCheck className="h-4 w-4" /> Administración del sistema
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#172033]">Roles y permisos</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#687386]">
            Gestiona los roles de trabajo y sus permisos. Los trabajadores pueden tener varios roles;
            sus permisos efectivos son la unión de los permisos de todos ellos.
          </p>
        </div>
        <button onClick={() => void loadData()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E7EE] bg-white px-4 py-2.5 text-sm font-medium text-[#344054] shadow-sm hover:bg-[#F8FAFC]">
          <RefreshCw className={cx("h-4 w-4", loading && "animate-spin")} /> Actualizar
        </button>
      </div>

      {(error || notice) && (
        <div className={cx("mb-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>
          {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="min-w-0 flex-1">{error || notice}</span>
          <button onClick={() => { setError(""); setNotice(""); }} aria-label="Cerrar aviso"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Roles configurados" value={roles.length} detail={`${roles.filter((r) => r.is_system_role).length} del sistema`} />
        <StatCard label="Permisos disponibles" value={permissions.length} detail="Catálogo de permisos RBAC" />
        <StatCard label="Trabajadores" value={workers.length} detail={`${workers.filter((w) => w.is_active).length} activos`} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#E5E9F0] bg-white shadow-[0_4px_24px_rgba(20,32,55,0.04)]">
        <div className="flex flex-col gap-3 border-b border-[#EEF1F5] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1 rounded-xl bg-[#F4F6F8] p-1">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => { setActiveTab(key); setSearch(""); }}
                className={cx("inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition", activeTab === key ? "bg-white font-semibold text-[#172033] shadow-sm" : "text-[#697586] hover:text-[#172033]")}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[210px] flex-1 lg:flex-none">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="w-full rounded-xl border border-[#E2E7EE] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#8EA0BC] focus:ring-2 focus:ring-[#E8EDF5]" />
            </label>
            {activeTab === "roles" && (
              <button onClick={openCreateRole} className="inline-flex items-center gap-2 rounded-xl bg-[#172033] px-3.5 py-2.5 text-sm font-medium text-white hover:bg-[#26344D]">
                <Plus className="h-4 w-4" /> Nuevo rol
              </button>
            )}
          </div>
        </div>

        {loading ? <Loading /> : (
          <div className="p-4 sm:p-5">
            {activeTab === "roles" && (
              <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.5fr)]">
                <section className="space-y-2">
                  <SectionHeading title="Roles disponibles" subtitle="Selecciona un rol para consultar su configuración." />
                  {filteredRoles.map((role) => (
                    <button key={role.id} onClick={() => setSelectedRoleCode(role.code)}
                      className={cx("w-full rounded-xl border p-4 text-left transition", selectedRoleCode === role.code ? "border-[#9BAAC0] bg-[#F7F9FC] ring-1 ring-[#DDE4EE]" : "border-[#E8ECF2] hover:border-[#CCD5E2]")}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-[#202B3C]">{roleLabel(role)}</div>
                          <div className="mt-1 text-xs text-[#7B8798]">{role.code}</div>
                        </div>
                        <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", role.is_system_role ? "bg-[#EEF1F5] text-[#5E6878]" : "bg-[#E8F4EE] text-[#24724A]")}>
                          {role.is_system_role ? "Sistema" : "Personalizado"}
                        </span>
                      </div>
                      <div className="mt-3 flex gap-4 text-xs text-[#687386]">
                        <span>{role.permission_count} permisos</span><span>{role.worker_count} trabajadores</span>
                      </div>
                    </button>
                  ))}
                  {filteredRoles.length === 0 && <Empty text="No hay roles que coincidan con la búsqueda." />}
                </section>
                <section className="rounded-xl border border-[#E8ECF2] p-5">
                  {selectedRole ? <>
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-xl font-semibold text-[#172033]">{roleLabel(selectedRole)}</h2>
                          {selectedRole.is_system_role && <span className="rounded-full bg-[#EEF1F5] px-2.5 py-1 text-xs text-[#5E6878]">Rol protegido</span>}
                        </div>
                        <p className="mt-1 text-sm text-[#7B8798]">{selectedRole.code}</p>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#687386]">{selectedRole.description || "Este rol no tiene descripción."}</p>
                      </div>
                      {!selectedRole.is_system_role && <button onClick={() => openEditRole(selectedRole)} className="rounded-xl border border-[#DDE3EC] px-3.5 py-2 text-sm font-medium text-[#344054] hover:bg-[#F8FAFC]">Editar rol</button>}
                    </div>
                    <div className="mt-6 grid grid-cols-2 gap-3">
                      <MiniStat label="Permisos asignados" value={selectedRolePermissions.length} />
                      <MiniStat label="Trabajadores asignados" value={selectedRole.worker_count} />
                    </div>
                    <h3 className="mb-3 mt-6 text-sm font-semibold text-[#273449]">Permisos incluidos</h3>
                    <div className="space-y-2">
                      {selectedRolePermissions.slice(0, 12).map((permission) => <PermissionLine key={permission.code} permission={permission} />)}
                      {selectedRolePermissions.length > 12 && <p className="pt-1 text-xs text-[#7B8798]">Y {selectedRolePermissions.length - 12} permisos más. Consulta la matriz completa.</p>}
                      {selectedRolePermissions.length === 0 && <Empty text="Este rol no tiene permisos asignados en el catálogo." />}
                    </div>
                  </> : <Empty text="Selecciona un rol." />}
                </section>
              </div>
            )}

            {activeTab === "workers" && (
              <section>
                <SectionHeading title="Asignación de roles a trabajadores" subtitle="Cada trabajador puede tener más de un rol. La asignación se realiza mediante RPC del backend." />
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-left">
                    <thead><tr className="border-b border-[#E8ECF2] text-xs uppercase tracking-wide text-[#7B8798]">
                      <th className="px-3 py-3 font-semibold">Trabajador</th><th className="px-3 py-3 font-semibold">Estado</th><th className="px-3 py-3 font-semibold">Roles actuales</th><th className="px-3 py-3 font-semibold">Gestionar roles</th>
                    </tr></thead>
                    <tbody>
                      {filteredWorkers.map((worker) => (
                        <tr key={worker.auth_user_id} className="border-b border-[#F0F2F6] last:border-0">
                          <td className="px-3 py-4"><div className="font-medium text-[#273449]">{worker.worker_name || "Trabajador sin nombre"}</div><div className="mt-1 max-w-[250px] truncate text-xs text-[#8993A2]">{worker.auth_user_id}</div></td>
                          <td className="px-3 py-4"><span className={cx("rounded-full px-2.5 py-1 text-xs font-medium", worker.is_active ? "bg-emerald-50 text-emerald-700" : "bg-[#F2F4F7] text-[#667085]")}>{worker.is_active ? "Activo" : "Inactivo"}</span></td>
                          <td className="px-3 py-4"><div className="flex max-w-[320px] flex-wrap gap-1.5">{(worker.role_names ?? []).length ? worker.role_names!.map((name) => <span key={name} className="rounded-lg bg-[#F2F4F7] px-2.5 py-1 text-xs text-[#475467]">{name}</span>) : <span className="text-xs text-[#98A2B3]">Sin roles</span>}</div></td>
                          <td className="px-3 py-4"><button onClick={() => { setSelectedWorker(worker); setWorkerRoleToAdd(""); }} className="rounded-lg border border-[#DDE3EC] px-3 py-2 text-xs font-semibold text-[#344054] hover:bg-[#F8FAFC]">Gestionar</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredWorkers.length === 0 && <Empty text="No hay trabajadores que coincidan con la búsqueda." />}
                </div>
              </section>
            )}

            {activeTab === "matrix" && (
              <section>
                <SectionHeading title="Matriz de permisos" subtitle="Comparativa de permisos por rol según las relaciones almacenadas en Supabase." />
                <div className="mt-4 overflow-x-auto rounded-xl border border-[#E8ECF2]">
                  <table className="w-full min-w-[800px] border-collapse text-left">
                    <thead><tr className="bg-[#F8FAFC]"><th className="sticky left-0 z-10 min-w-[280px] border-b border-[#E8ECF2] bg-[#F8FAFC] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#667085]">Permiso</th>{roles.map((role) => <th key={role.id} className="min-w-[130px] border-b border-[#E8ECF2] px-3 py-3 text-center text-xs font-semibold text-[#475467]">{role.name}</th>)}</tr></thead>
                    <tbody>{permissions.filter((p) => `${p.code} ${p.resource} ${p.action}`.toLowerCase().includes(search.toLowerCase())).map((permission) => (
                      <tr key={permission.id} className="border-b border-[#F0F2F6] last:border-0">
                        <td className="sticky left-0 bg-white px-4 py-3"><div className="text-sm font-medium text-[#344054]">{permission.code}</div><div className="mt-0.5 text-xs text-[#98A2B3]">{permission.description || `${permission.resource} · ${permission.action}`}</div></td>
                        {roles.map((role) => <td key={role.id} className="px-3 py-3 text-center">{(permission.role_codes ?? []).includes(role.code) ? <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Check className="h-4 w-4" /></span> : <span className="text-[#D0D5DD]">—</span>}</td>)}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </section>
            )}

            {activeTab === "permissions" && (
              <section>
                <SectionHeading title="Catálogo de permisos" subtitle="Permisos disponibles y roles que los tienen asociados. Este catálogo es de consulta." />
                <div className="mt-4 space-y-2">
                  {filteredPermissions.map((permission) => <div key={permission.id} className="flex flex-col justify-between gap-3 rounded-xl border border-[#E8ECF2] p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0"><div className="break-all text-sm font-semibold text-[#344054]">{permission.code}</div><div className="mt-1 text-sm text-[#7B8798]">{permission.description || `${permission.resource} · ${permission.action}`}</div><div className="mt-2 flex flex-wrap gap-1.5">{(permission.role_names ?? []).length ? permission.role_names!.map((name) => <span key={name} className="rounded-lg bg-[#F2F4F7] px-2 py-1 text-xs text-[#475467]">{name}</span>) : <span className="text-xs text-[#98A2B3]">Sin roles asociados</span>}</div></div>
                    <div className="shrink-0 text-xs text-[#7B8798]">{permission.active_role_count} roles asociados</div>
                  </div>)}
                  {filteredPermissions.length === 0 && <Empty text="No hay permisos que coincidan con la búsqueda." />}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#F7F9FC] px-4 py-3 text-xs leading-5 text-[#6B7789]">
        <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" />
        <p>La interfaz no concede acceso por sí misma. Las operaciones se envían a las RPC de Supabase, que aplican las comprobaciones de permisos del backend. Los roles del sistema se muestran protegidos y no se permite editar sus permisos desde esta pantalla.</p>
      </div>

      {roleModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#101828]/45 p-4">
          <div className="my-8 max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-[#E8ECF2] px-6 py-5">
              <div><h2 className="text-xl font-semibold text-[#172033]">{editingRole ? "Editar rol personalizado" : "Crear rol personalizado"}</h2><p className="mt-1 text-sm text-[#7B8798]">Define el nombre y selecciona los permisos que tendrá.</p></div>
              <button onClick={() => setRoleModal(false)} className="rounded-lg p-2 text-[#7B8798] hover:bg-[#F2F4F7]" aria-label="Cerrar"><X className="h-5 w-5" /></button>
            </div>
            <div className="max-h-[calc(92vh-150px)] space-y-5 overflow-y-auto px-6 py-5">
              {!editingRole && <Field label="Código del rol"><input value={roleCode} onChange={(e) => setRoleCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} placeholder="ej. project_manager" className={inputClass} /></Field>}
              <Field label="Nombre"><input value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder="Nombre visible del rol" className={inputClass} /></Field>
              <Field label="Descripción (opcional)"><textarea value={roleDescription} onChange={(e) => setRoleDescription(e.target.value)} rows={2} placeholder="Describe para qué se utiliza este rol" className={inputClass} /></Field>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-[#344054]">Permisos</h3><span className="text-xs text-[#7B8798]">{draftPermissionCodes.length} seleccionados</span></div>
                <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-[#E8ECF2] p-2">
                  {permissions.map((permission) => {
                    const checked = draftPermissionCodes.includes(permission.code);
                    return <label key={permission.id} className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-[#F8FAFC]">
                      <input type="checkbox" checked={checked} onChange={(e) => setDraftPermissionCodes((current) => e.target.checked ? [...current, permission.code] : current.filter((code) => code !== permission.code))} className="mt-1 h-4 w-4 rounded border-[#CBD5E1] accent-[#172033]" />
                      <span className="min-w-0"><span className="block break-all text-sm font-medium text-[#344054]">{permission.code}</span><span className="mt-0.5 block text-xs text-[#7B8798]">{permission.description || `${permission.resource} · ${permission.action}`}</span></span>
                    </label>;
                  })}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#E8ECF2] px-6 py-4">
              <button onClick={() => setRoleModal(false)} className="rounded-xl border border-[#DDE3EC] px-4 py-2.5 text-sm font-medium text-[#475467]">Cancelar</button>
              <button disabled={saving || !roleName.trim() || (!editingRole && !/^[a-z][a-z0-9_]{1,62}$/.test(roleCode))} onClick={() => void saveRole()} className="rounded-xl bg-[#172033] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Guardando..." : "Guardar cambios"}</button>
            </div>
          </div>
        </div>
      )}

      {selectedWorker && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#101828]/45 p-4">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-[#E8ECF2] px-6 py-5">
              <div><h2 className="text-xl font-semibold text-[#172033]">Roles del trabajador</h2><p className="mt-1 text-sm text-[#7B8798]">{selectedWorker.worker_name || "Trabajador sin nombre"}</p></div>
              <button onClick={() => setSelectedWorker(null)} className="rounded-lg p-2 text-[#7B8798] hover:bg-[#F2F4F7]" aria-label="Cerrar"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-5 px-6 py-5">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-[#344054]">Roles asignados</h3>
                {(selectedWorker.role_codes ?? []).length ? selectedWorker.role_codes!.map((code, index) => {
                  const role = roles.find((r) => r.code === code);
                  return <div key={code} className="flex items-center justify-between gap-3 rounded-xl border border-[#E8ECF2] px-3.5 py-3"><div><div className="text-sm font-medium text-[#344054]">{role?.name || (selectedWorker.role_names ?? [])[index] || code}</div><div className="mt-0.5 text-xs text-[#98A2B3]">{code}</div></div><button disabled={saving} onClick={() => void toggleWorkerRole(selectedWorker, code, true)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Retirar</button></div>;
                }) : <Empty text="Este trabajador no tiene roles asignados." />}
              </div>
              <div><h3 className="mb-2 text-sm font-semibold text-[#344054]">Añadir rol</h3><div className="flex gap-2"><div className="relative min-w-0 flex-1"><select value={workerRoleToAdd} onChange={(e) => setWorkerRoleToAdd(e.target.value)} className={cx(inputClass, "appearance-none pr-9")}><option value="">Selecciona un rol</option>{roles.filter((role) => !(selectedWorker.role_codes ?? []).includes(role.code)).map((role) => <option key={role.id} value={role.code}>{role.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" /></div><button disabled={!workerRoleToAdd || saving} onClick={() => { const role = roles.find((r) => r.code === workerRoleToAdd); if (role) void toggleWorkerRole(selectedWorker, role.code, false); }} className="rounded-xl bg-[#172033] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Añadir</button></div></div>
              <p className="text-xs leading-5 text-[#7B8798]">El backend validará si tienes permiso para modificar asignaciones y si la operación está permitida.</p>
            </div>
            <div className="flex justify-end border-t border-[#E8ECF2] px-6 py-4"><button onClick={() => setSelectedWorker(null)} className="rounded-xl border border-[#DDE3EC] px-4 py-2.5 text-sm font-medium text-[#475467]">Cerrar</button></div>
          </div>
        </div>
      )}
    </main>
  );
}

const inputClass = "w-full rounded-xl border border-[#DDE3EC] bg-white px-3.5 py-2.5 text-sm text-[#344054] outline-none placeholder:text-[#98A2B3] focus:border-[#8EA0BC] focus:ring-2 focus:ring-[#E8EDF5]";

function StatCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="rounded-2xl border border-[#E5E9F0] bg-white p-5 shadow-[0_4px_24px_rgba(20,32,55,0.03)]"><p className="text-sm text-[#7B8798]">{label}</p><div className="mt-2 flex items-end justify-between gap-3"><span className="text-3xl font-semibold tracking-tight text-[#172033]">{value}</span><span className="text-right text-xs text-[#98A2B3]">{detail}</span></div></div>;
}
function MiniStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-[#F7F9FC] p-4"><p className="text-xs text-[#7B8798]">{label}</p><p className="mt-1 text-2xl font-semibold text-[#172033]">{value}</p></div>;
}
function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <div><h2 className="text-base font-semibold text-[#273449]">{title}</h2><p className="mt-1 text-sm leading-5 text-[#7B8798]">{subtitle}</p></div>;
}
function PermissionLine({ permission }: { permission: WorkerPermission }) {
  return <div className="flex items-start gap-2 rounded-lg bg-[#F8FAFC] px-3 py-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><div className="min-w-0"><p className="break-all text-xs font-medium text-[#344054]">{permission.code}</p><p className="mt-0.5 text-xs text-[#7B8798]">{permission.description || `${permission.resource} · ${permission.action}`}</p></div></div>;
}
function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-[#DDE3EC] px-4 py-8 text-center text-sm text-[#7B8798]">{text}</div>;
}
function Loading() {
  return <div className="flex items-center justify-center gap-2 py-20 text-sm text-[#7B8798]"><RefreshCw className="h-4 w-4 animate-spin" />Cargando configuración de roles...</div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-[#344054]">{label}</span>{children}</label>;
}
