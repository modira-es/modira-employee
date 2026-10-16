import { useEffect } from "react";
import { useLocation } from "wouter";

import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import EmployeeSidebar from "./EmployeeSidebar";

interface EmployeeRouteProps {
  children: React.ReactNode;

  /**
   * Permiso necesario para acceder a esta ruta.
   *
   * Ejemplo:
   *
   * <EmployeeRoute requiredPermission="projects.read">
   *   ...
   * </EmployeeRoute>
   *
   * Si no se indica permiso, únicamente se comprueba
   * que el usuario sea un worker activo.
   */
  requiredPermission?: string;
}

export default function EmployeeRoute({
  children,
  requiredPermission,
}: EmployeeRouteProps) {
  const {
    user,
    worker,
    hasPermission,
    loading: authLoading,
  } = useAuth();

  const [, setLocation] =
    useLocation();

  /**
   * ============================================================
   * REDIRECCIÓN
   * ============================================================
   *
   * AuthContext ya se encarga de cargar:
   *
   * - usuario
   * - worker
   * - roles
   * - permisos
   *
   * EmployeeRoute solamente decide si puede acceder a la ruta.
   */

  useEffect(() => {
    if (authLoading) {
      return;
    }

    /**
     * ----------------------------------------------------------
     * 1. No existe sesión
     * ----------------------------------------------------------
     */
    if (!user) {
      setLocation("/login");
      return;
    }

    /**
     * ----------------------------------------------------------
     * 2. No es worker activo
     * ----------------------------------------------------------
     */
    if (!worker || worker.is_active !== true) {
      setLocation("/login");
      return;
    }

    /**
     * ----------------------------------------------------------
     * 3. Comprobar permiso de la ruta
     * ----------------------------------------------------------
     *
     * Si la ruta no requiere un permiso concreto,
     * basta con ser worker activo.
     */
    if (
      requiredPermission &&
      !hasPermission(requiredPermission)
    ) {
      setLocation("/");
      return;
    }
  }, [
    user,
    worker,
    authLoading,
    requiredPermission,
    hasPermission,
    setLocation,
  ]);

  /*
   * ============================================================
   * LOADING
   * ============================================================
   */

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-[#F5F7FA] to-white flex items-center justify-center">
        <Card className="p-8">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-[#1E3A8A]" />

            <p className="mt-4 text-gray-600">
              Verificando acceso...
            </p>
          </div>
        </Card>
      </div>
    );
  }

  /*
   * ============================================================
   * SIN SESIÓN
   * ============================================================
   */

  if (!user) {
    return null;
  }

  /*
   * ============================================================
   * NO ES WORKER ACTIVO
   * ============================================================
   */

  if (
    !worker ||
    worker.is_active !== true
  ) {
    return null;
  }

  /*
   * ============================================================
   * PERMISO INSUFICIENTE
   * ============================================================
   */

  if (
    requiredPermission &&
    !hasPermission(requiredPermission)
  ) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-[#F5F7FA] to-white flex items-center justify-center">
        <Card className="p-8 max-w-md">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <span className="text-xl text-red-600">
                !
              </span>
            </div>

            <h2 className="mt-4 text-lg font-semibold text-gray-900">
              Acceso no disponible
            </h2>

            <p className="mt-2 text-sm text-gray-600">
              No tienes permisos para acceder a
              esta sección.
            </p>

            <button
              type="button"
              onClick={() =>
                setLocation("/")
              }
              className="mt-6 inline-flex items-center justify-center rounded-lg bg-[#1E3A8A] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              Volver al inicio
            </button>
          </div>
        </Card>
      </div>
    );
  }

  /*
   * ============================================================
   * AUTORIZADO
   * ============================================================
   */

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <EmployeeSidebar />

      <main className="min-h-screen w-full">
        {children}
      </main>
    </div>
  );
}

