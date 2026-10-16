import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  User,
  Session,
} from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

/**
 * ============================================================
 * WORKER RBAC
 * ============================================================
 */

export type WorkerRoleCode =
  | "direction"
  | "commercial"
  | "developer"
  | "support"
  | "accounting";

export interface WorkerRole {
  role_id: string;
  role_code: WorkerRoleCode;
  role_name: string;
  role_description: string | null;
  is_system_role: boolean;
  is_active: boolean;
}

/**
 * Los permisos proceden de Supabase.
 */
export type WorkerPermission = string;

type Worker = {
  id: string;
  auth_user_id: string;
  is_active: boolean;
};

/**
 * ============================================================
 * AUTH CONTEXT TYPE
 * ============================================================
 */

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isRecoverySession: boolean;

  worker: Worker | null;

  roles: WorkerRole[];

  permissions: WorkerPermission[];

  hasPermission: (
    permission: WorkerPermission
  ) => boolean;

  signIn: (
    email: string,
    password: string,
    captchaToken?: string
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  signOut: () => Promise<{
    success: boolean;
    error?: string;
  }>;

  resetPassword: (
    email: string,
    captchaToken?: string
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  updatePassword: (
    newPassword: string
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;
}

export const AuthContext =
  createContext<AuthContextType | undefined>(
    undefined
  );

/**
 * ============================================================
 * AUTH PROVIDER
 * ============================================================
 */

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] =
    useState<User | null>(null);

  const [session, setSession] =
    useState<Session | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [isRecoverySession, setIsRecoverySession] =
    useState(false);

  const [worker, setWorker] =
    useState<Worker | null>(null);

  const [roles, setRoles] =
    useState<WorkerRole[]>([]);

  const [permissions, setPermissions] =
    useState<WorkerPermission[]>([]);

  /**
   * ==========================================================
   * CLEAR WORKER RBAC
   * ==========================================================
   */

  const clearWorkerRBAC = () => {
    setWorker(null);
    setRoles([]);
    setPermissions([]);
  };

  /**
   * ==========================================================
   * LOAD WORKER RBAC
   * ==========================================================
   *
   * Los roles y los permisos se consultan en Supabase.
   *
   * No se mantiene un catálogo de permisos por rol
   * duplicado en el frontend.
   */

  const loadWorkerRBAC = async (
    authUser: User | null
  ): Promise<void> => {
    if (!authUser) {
      clearWorkerRBAC();
      return;
    }

    try {
      /**
       * ------------------------------------------------------
       * 1. Obtener el trabajador autenticado
       * ------------------------------------------------------
       */

      const {
        data: workerData,
        error: workerError,
      } = await supabase
        .from("workers")
        .select(
          "id, auth_user_id, is_active"
        )
        .eq(
          "auth_user_id",
          authUser.id
        )
        .maybeSingle();

      if (workerError) {
        console.error(
          "[Auth] Error loading worker:",
          workerError
        );

        clearWorkerRBAC();
        return;
      }

      /**
       * Si no existe un trabajador activo,
       * no se habilita el área de empleados.
       */

      if (
        !workerData ||
        !workerData.is_active
      ) {
        clearWorkerRBAC();
        return;
      }

      setWorker({
        id: workerData.id,
        auth_user_id: workerData.auth_user_id,
        is_active: workerData.is_active,
      });

      /**
       * ------------------------------------------------------
       * 2. Obtener los roles mediante la RPC existente
       * ------------------------------------------------------
       */

      const {
        data: rolesData,
        error: rolesError,
      } = await supabase.rpc(
        "get_worker_roles",
        {
          p_worker_auth_user_id: authUser.id,
        }
      );

      if (rolesError) {
        console.error(
          "[Auth] Error loading worker roles:",
          rolesError
        );

        setRoles([]);
        setPermissions([]);

        return;
      }

      /**
       * Normalizamos los campos por compatibilidad
       * con las distintas formas de respuesta.
       */

      const activeRoles: WorkerRole[] =
        (rolesData ?? [])
          .filter(
            (role: any) =>
              role.is_active === true
          )
          .map(
            (role: any): WorkerRole => ({
              role_id:
                role.role_id ?? role.id,

              role_code:
                role.role_code ?? role.code,

              role_name:
                role.role_name ?? role.name,

              role_description:
                role.role_description ??
                role.description ??
                null,

              is_system_role:
                role.is_system_role ?? false,

              is_active:
                role.is_active === true,
            })
          )
          .filter(
            (role: WorkerRole) =>
              Boolean(role.role_id) &&
              Boolean(role.role_code) &&
              Boolean(role.role_name)
          );

      setRoles(activeRoles);

      /**
       * ------------------------------------------------------
       * 3. Obtener los permisos reales desde Supabase
       * ------------------------------------------------------
       *
       * Esta RPC ya existe en el backend.
       *
       * Devuelve los permisos efectivos del trabajador
       * autenticado a partir de sus roles y permisos.
       */

      const {
        data: permissionsData,
        error: permissionsError,
      } = await supabase.rpc(
        "get_current_worker_permissions"
      );

      if (permissionsError) {
        console.error(
          "[Auth] Error loading worker permissions:",
          permissionsError
        );

        /**
         * Si no podemos confirmar los permisos,
         * no concedemos permisos por defecto.
         */

        setPermissions([]);
        return;
      }

      /**
       * La RPC devuelve filas con permission_code.
       * También normalizamos el resultado por si
       * Supabase devuelve directamente valores de texto.
       */

      const permissionSet =
        new Set<WorkerPermission>();

      for (const item of permissionsData ?? []) {
        const permissionCode =
          typeof item === "string"
            ? item
            : item?.permission_code;

        if (
          typeof permissionCode === "string" &&
          permissionCode.trim() !== ""
        ) {
          permissionSet.add(permissionCode);
        }
      }

      setPermissions(
        Array.from(permissionSet)
      );
    } catch (error) {
      console.error(
        "[Auth] Error loading worker RBAC:",
        error
      );

      clearWorkerRBAC();
    }
  };

  /**
   * ==========================================================
   * PERMISSION CHECK
   * ==========================================================
   *
   * La autorización visual se basa en los permisos
   * obtenidos desde Supabase.
   *
   * La protección real de datos y operaciones debe seguir
   * estando en RLS y en las RPC del backend.
   */

  const hasPermission = (
    permission: WorkerPermission
  ): boolean => {
    return permissions.includes(permission);
  };

  /**
   * ==========================================================
   * INITIALIZE AUTH
   * ==========================================================
   */

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const {
          data: {
            session: currentSession,
          },
          error,
        } = await supabase.auth.getSession();

        if (!mounted) {
          return;
        }

        if (error) {
          console.error(
            "[Auth] Error getting session:",
            error
          );
        }

        setSession(currentSession);

        setUser(
          currentSession?.user ?? null
        );

        await loadWorkerRBAC(
          currentSession?.user ?? null
        );

        if (!mounted) {
          return;
        }

        /**
         * Detectar sesiones de recuperación de contraseña.
         */

        const hashParams =
          new URLSearchParams(
            window.location.hash.replace(
              /^#/,
              ""
            )
          );

        const recoveryType =
          hashParams.get("type") === "recovery";

        if (
          recoveryType &&
          currentSession
        ) {
          setIsRecoverySession(true);
        }
      } catch (error) {
        if (!mounted) {
          return;
        }

        console.error(
          "[Auth] Error initializing auth:",
          error
        );

        clearWorkerRBAC();
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    /**
     * Escuchar los cambios de autenticación.
     */

    const {
      data: {
        subscription,
      },
    } = supabase.auth.onAuthStateChange(
      async (
        event,
        currentSession
      ) => {
        if (!mounted) {
          return;
        }

        setSession(currentSession);

        setUser(
          currentSession?.user ?? null
        );

        if (
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "USER_UPDATED"
        ) {
          await loadWorkerRBAC(
            currentSession?.user ?? null
          );
        }

        if (
          event === "PASSWORD_RECOVERY"
        ) {
          setIsRecoverySession(true);
        }

        if (
          event === "SIGNED_OUT"
        ) {
          setIsRecoverySession(false);
          clearWorkerRBAC();
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  /**
   * ==========================================================
   * LOGIN
   * ==========================================================
   */

  const signIn = async (
    email: string,
    password: string,
    captchaToken?: string
  ): Promise<{
    success: boolean;
    error?: string;
  }> => {
    try {
      const cleanEmail = email.trim();

      if (!cleanEmail || !password) {
        return {
          success: false,
          error:
            "Introduce tu correo electrónico y contraseña.",
        };
      }

      const { error } =
        await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
          options: {
            ...(captchaToken
              ? { captchaToken }
              : {}),
          },
        });

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      return {
        success: true,
      };
    } catch (error) {
      console.error(
        "[Auth] Sign in error:",
        error
      );

      return {
        success: false,
        error: "Error al iniciar sesión.",
      };
    }
  };

  /**
   * ==========================================================
   * LOGOUT
   * ==========================================================
   */

  const signOut = async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    try {
      const { error } =
        await supabase.auth.signOut();

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      setUser(null);
      setSession(null);
      setIsRecoverySession(false);

      clearWorkerRBAC();

      return {
        success: true,
      };
    } catch (error) {
      console.error(
        "[Auth] Sign out error:",
        error
      );

      return {
        success: false,
        error: "Error al cerrar sesión.",
      };
    }
  };

  /**
   * ==========================================================
   * RECUPERACIÓN DE CONTRASEÑA
   * ==========================================================
   */

  const resetPassword = async (
    email: string,
    captchaToken?: string
  ): Promise<{
    success: boolean;
    error?: string;
  }> => {
    try {
      const cleanEmail = email.trim();

      if (!cleanEmail) {
        return {
          success: false,
          error:
            "Introduce tu correo electrónico.",
        };
      }

      const { error } =
        await supabase.auth.resetPasswordForEmail(
          cleanEmail,
          {
            redirectTo:
              `${window.location.origin}/reset-password`,

            ...(captchaToken
              ? { captchaToken }
              : {}),
          }
        );

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      return {
        success: true,
      };
    } catch (error) {
      console.error(
        "[Auth] Reset password error:",
        error
      );

      return {
        success: false,
        error:
          "Error al solicitar la recuperación de contraseña.",
      };
    }
  };

  /**
   * ==========================================================
   * ACTUALIZAR CONTRASEÑA
   * ==========================================================
   */

  const updatePassword = async (
    newPassword: string
  ): Promise<{
    success: boolean;
    error?: string;
  }> => {
    try {
      if (!newPassword) {
        return {
          success: false,
          error:
            "La nueva contraseña no puede estar vacía.",
        };
      }

      const { error } =
        await supabase.auth.updateUser({
          password: newPassword,
        });

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      setIsRecoverySession(false);

      return {
        success: true,
      };
    } catch (error) {
      console.error(
        "[Auth] Update password error:",
        error
      );

      return {
        success: false,
        error:
          "Error al actualizar la contraseña.",
      };
    }
  };

  /**
   * ==========================================================
   * PROVIDER
   * ==========================================================
   */

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isRecoverySession,

        worker,
        roles,
        permissions,
        hasPermission,

        signIn,
        signOut,
        resetPassword,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * ============================================================
 * useAuth
 * ============================================================
 */

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used within an AuthProvider"
    );
  }

  return context;
}