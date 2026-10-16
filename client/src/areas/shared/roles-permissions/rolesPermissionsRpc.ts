import { supabase } from "@/lib/supabase";
import type {
  WorkerPermission,
  WorkerRole,
  WorkerRoleAssignment,
  WorkerRoleInfo,
} from "./rolesPermissionsTypes";

type RpcResult<T> = { data: T; error: null } | { data: null; error: Error };

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "object" && error && "message" in error) {
    return new Error(String((error as { message: unknown }).message));
  }
  return new Error("Se ha producido un error inesperado.");
}

async function callRpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw normalizeError(error);
  return data as T;
}

export const rolesPermissionsRpc = {
    getRoles: async () => {
    const data = await callRpc<
      Array<{
        role_id: string;
        role_code: string;
        role_name: string;
        role_description: string | null;
        is_system_role: boolean;
        is_active: boolean;
        worker_count: number;
        permission_count: number;
      }>
    >("get_worker_role_catalog");

    return data.map((role) => ({
      id: role.role_id,
      code: role.role_code,
      name: role.role_name,
      description: role.role_description,
      is_system_role: role.is_system_role,
      is_active: role.is_active,
      worker_count: Number(role.worker_count),
      permission_count: Number(role.permission_count),
    }));
  },

  getPermissions: async () => {
    const data = await callRpc<
      Array<{
        permission_id: string;
        permission_code: string;
        resource: string;
        action: string;
        permission_description: string | null;
        role_count: number;
        role_codes: string[] | null;
        role_names: string[] | null;
      }>
    >("get_worker_permission_catalog");

    return data.map((permission) => ({
      id: permission.permission_id,
      code: permission.permission_code,
      resource: permission.resource,
      action: permission.action,
      description: permission.permission_description,
      active_role_count: Number(permission.role_count),
      role_codes: permission.role_codes,
      role_names: permission.role_names,
    }));
  },
  getWorkers: () =>
    callRpc<WorkerRoleAssignment[]>("get_all_worker_role_assignments"),
  getWorkerRoles: (workerAuthUserId: string) =>
    callRpc<WorkerRoleInfo[]>("get_worker_roles", {
      p_worker_auth_user_id: workerAuthUserId,
    }),

  createCustomRole: (code: string, name: string, description: string) =>
    callRpc<string>("create_worker_custom_role", {
      p_code: code,
      p_name: name,
      p_description: description.trim() || null,
    }),

  updateCustomRole: (roleId: string, name: string, description: string) =>
    callRpc<void>("update_worker_custom_role", {
      p_role_id: roleId,
      p_name: name,
      p_description: description.trim() || null,
    }),

  replaceCustomRolePermissions: (roleCode: string, permissionCodes: string[]) =>
    callRpc<void>("replace_worker_custom_role_permissions", {
      p_role_code: roleCode,
      p_permission_codes: permissionCodes,
    }),

  assignRole: (workerAuthUserId: string, roleCode: string) =>
    callRpc<void>("assign_worker_role", {
      p_worker_auth_user_id: workerAuthUserId,
      p_role_code: roleCode,
    }),

  removeRole: (workerAuthUserId: string, roleCode: string) =>
    callRpc<void>("remove_worker_role", {
      p_worker_auth_user_id: workerAuthUserId,
      p_role_code: roleCode,
    }),
};
