import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  Users,
  LogOut,
  Settings,
  BarChart3,
  AlertCircle,
  ChevronDown,
  CheckCircle,
} from "lucide-react";

type AdminProfile = {
  id: string;
  nombre: string | null;
  email: string | null;
  rol: string | null;
};

type AdminUser = {
  id: string;
  name: string | null;
  email: string | null;
  company: string | null;
  companyId: string | null;
  role: string | null;
  status: string;
  createdAt: string;
  lastSignedIn: string | null;
};

export default function AdminPanel() {
  const { user, signOut, loading } = useAuth();
  const [, setLocation] = useLocation();

  const [activeTab, setActiveTab] = useState("usuarios");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [filterRole, setFilterRole] = useState<
    "all" | "user" | "admin"
  >("all");

  const [filterStatus, setFilterStatus] = useState<
    "all" | "active" | "blocked"
  >("all");

  /**
   * ============================================================
   * PERFIL REAL DEL USUARIO
   * ============================================================
   *
   * IMPORTANTE:
   *
   * NO usamos:
   *
   * user.user_metadata.rol
   *
   * El rol real se obtiene desde:
   *
   * profiles.rol
   *
   * Esto mantiene la autorización coherente con el backend.
   */

  const [adminProfile, setAdminProfile] =
    useState<AdminProfile | null>(null);

  const [profileLoading, setProfileLoading] = useState(true);

  /**
   * ============================================================
   * CARGAR PERFIL DEL ADMINISTRADOR
   * ============================================================
   */

  useEffect(() => {
    const loadAdminProfile = async () => {
      if (!user) {
        setAdminProfile(null);
        setProfileLoading(false);
        return;
      }

      try {
        setProfileLoading(true);

        const { data, error } = await supabase
          .from("profiles")
          .select("id, nombre, email, rol")
          .eq("id", user.id)
          .single();

        if (error) {
          console.error(
            "[AdminPanel] Error cargando perfil:",
            error
          );

          setAdminProfile(null);
          return;
        }

        setAdminProfile(data as AdminProfile);
      } catch (error) {
        console.error(
          "[AdminPanel] Error inesperado cargando perfil:",
          error
        );

        setAdminProfile(null);
      } finally {
        setProfileLoading(false);
      }
    };

    loadAdminProfile();
  }, [user]);

  /**
   * ============================================================
   * COMPROBAR ADMINISTRADOR
   * ============================================================
   *
   * El rol procede de profiles.rol.
   *
   * NO de user_metadata.
   */

  const isAdmin = adminProfile?.rol === "admin";

  /**
   * ============================================================
   * QUERIES
   * ============================================================
   */

  const usersQuery = trpc.admin.getUsers.useQuery(undefined, {
    enabled: !!user && isAdmin,
  });

  const statsQuery = trpc.admin.getStatistics.useQuery(undefined, {
    enabled: !!user && isAdmin,
  });

  const adminUsers = (usersQuery.data ?? []) as AdminUser[];

  /**
   * ============================================================
   * MUTATIONS
   * ============================================================
   */

  const updateRoleMutation =
    trpc.admin.updateUserRole.useMutation({
      onSuccess: () => {
        usersQuery.refetch();
        statsQuery.refetch();
      },
    });

  const updateStatusMutation =
    trpc.admin.updateUserStatus.useMutation({
      onSuccess: () => {
        usersQuery.refetch();
        statsQuery.refetch();
      },
    });

  /**
   * ============================================================
   * REDIRECCIÓN SI NO ES ADMIN
   * ============================================================
   */

  useEffect(() => {
    if (
      !loading &&
      !profileLoading &&
      (!user || !isAdmin)
    ) {
      setLocation("/");
    }
  }, [
    user,
    loading,
    profileLoading,
    isAdmin,
    setLocation,
  ]);

  /**
   * ============================================================
   * LOADING
   * ============================================================
   */

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-[#F5F7FA] to-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#1E3A8A]"></div>

          <p className="mt-4 text-gray-600">
            Cargando...
          </p>
        </div>
      </div>
    );
  }

  /**
   * ============================================================
   * SEGURIDAD DE INTERFAZ
   * ============================================================
   */

  if (!user || !isAdmin) {
    return null;
  }

  /**
   * ============================================================
   * CERRAR SESIÓN
   * ============================================================
   */

  const handleLogout = async () => {
    try {
      await signOut();

      setLocation("/");
    } catch (error) {
      console.error(
        "Error al cerrar sesión:",
        error
      );
    }
  };

  /**
   * ============================================================
   * CAMBIAR ROL
   * ============================================================
   */

  const handleRoleChange = async (
    userId: string,
    newRole: "user" | "admin"
  ) => {
    try {
      await updateRoleMutation.mutateAsync({
        userId,
        role: newRole,
      });
    } catch (error) {
      console.error(
        "Error al cambiar rol:",
        error
      );
    }
  };

  /**
   * ============================================================
   * CAMBIAR ESTADO
   * ============================================================
   */

  const handleStatusChange = async (
    userId: string,
    newStatus: "active" | "blocked"
  ) => {
    try {
      await updateStatusMutation.mutateAsync({
        userId,
        status: newStatus,
      });
    } catch (error) {
      console.error(
        "Error al cambiar estado:",
        error
      );
    }
  };

  /**
   * ============================================================
   * COLORES DE ESTADO
   * ============================================================
   */

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-700";


      case "blocked":
        return "bg-red-100 text-red-700";

      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  /**
   * ============================================================
   * NOMBRE DE ESTADO
   * ============================================================
   */

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "active":
        return "Activo";


      case "blocked":
        return "Bloqueado";

      default:
        return status;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#F5F7FA] to-white">

      {/* ======================================================
          HEADER
          ====================================================== */}

      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="container mx-auto px-4 py-6 flex justify-between items-center">

          <div>
            <h1 className="text-3xl font-bold text-[#1E3A8A]">
              Panel de Administración
            </h1>

            <p className="text-gray-600 mt-1">
              Bienvenido,{" "}
              {adminProfile?.nombre ||
                adminProfile?.email ||
                user.email}
            </p>
          </div>

          <Button
            onClick={handleLogout}
            variant="outline"
            className="flex gap-2 items-center"
          >
            <LogOut className="h-4 w-4" />

            Cerrar sesión
          </Button>

        </div>
      </header>

      {/* ======================================================
          MAIN
          ====================================================== */}

      <main className="container mx-auto px-4 py-12">

        {/* ====================================================
            TABS
            ==================================================== */}

        <div className="flex gap-4 mb-8 border-b border-gray-200">

          <button
            onClick={() =>
              setActiveTab("usuarios")
            }
            className={`px-4 py-2 font-semibold border-b-2 transition-colors ${
              activeTab === "usuarios"
                ? "border-[#1E3A8A] text-[#1E3A8A]"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            <Users className="inline h-5 w-5 mr-2" />

            Usuarios
          </button>

          <button
            onClick={() =>
              setActiveTab("estadisticas")
            }
            className={`px-4 py-2 font-semibold border-b-2 transition-colors ${
              activeTab === "estadisticas"
                ? "border-[#1E3A8A] text-[#1E3A8A]"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            <BarChart3 className="inline h-5 w-5 mr-2" />

            Estadísticas
          </button>

          <button
            onClick={() =>
              setActiveTab("configuracion")
            }
            className={`px-4 py-2 font-semibold border-b-2 transition-colors ${
              activeTab === "configuracion"
                ? "border-[#1E3A8A] text-[#1E3A8A]"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            <Settings className="inline h-5 w-5 mr-2" />

            Configuración
          </button>

        </div>

        {/* ====================================================
            USUARIOS
            ==================================================== */}

        {activeTab === "usuarios" && (
          <div>

            <h2 className="text-2xl font-bold text-[#1E3A8A] mb-6">
              Gestión de Usuarios
            </h2>

            {usersQuery.isLoading ? (
              <div className="text-center py-12">

                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#1E3A8A]"></div>

                <p className="mt-4 text-gray-600">
                  Cargando usuarios...
                </p>

              </div>
            ) : usersQuery.error ? (
              <Card className="p-6 border-2 border-red-200 bg-red-50">

                <div className="flex gap-3">

                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />

                  <p className="text-red-700">
                    Error al cargar usuarios:{" "}
                    {usersQuery.error.message}
                  </p>

                </div>

              </Card>
            ) : (
              <div className="space-y-4">

                {/* BÚSQUEDA Y FILTROS */}

                <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-4">

                  <input
                    type="text"
                    placeholder="Buscar por nombre o email..."
                    value={searchTerm}
                    onChange={(e) =>
                      setSearchTerm(e.target.value)
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                  />

                  <div className="flex gap-4 flex-wrap">

                    <select
                      value={filterRole}
                      onChange={(e) =>
                        setFilterRole(
                          e.target.value as
                            | "all"
                            | "user"
                            | "admin"
                        )
                      }
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                    >
                      <option value="all">
                        Todos los roles
                      </option>

                      <option value="user">
                        Usuario
                      </option>

                      <option value="admin">
                        Administrador
                      </option>
                    </select>

                    <select
                      value={filterStatus}
                      onChange={(e) =>
                        setFilterStatus(
                          e.target.value as
                            | "all"
                            | "active"
                            | "blocked"
                        )
                      }
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                    >
                      <option value="all">
                        Todos los estados
                      </option>

                      <option value="active">
                        Activo
                      </option>


                      <option value="blocked">
                        Bloqueado
                      </option>
                    </select>

                  </div>

                </div>

                {/* LISTA */}

                {adminUsers
                  .filter((u: AdminUser) => {

                    const matchesSearch =
                      u.name
                        ?.toLowerCase()
                        .includes(
                          searchTerm.toLowerCase()
                        ) ||
                      u.email
                        ?.toLowerCase()
                        .includes(
                          searchTerm.toLowerCase()
                        );

                    const matchesRole =
                      filterRole === "all" ||
                      u.role === filterRole;

                    const matchesStatus =
                      filterStatus === "all" ||
                      u.status === filterStatus;

                    return (
                      matchesSearch &&
                      matchesRole &&
                      matchesStatus
                    );
                  })
                  .map((u: AdminUser) => (

                    <Card
                      key={u.id}
                      className="p-6 border-2 border-gray-200 hover:border-[#1E3A8A] transition-colors"
                    >

                      <div className="flex items-start justify-between">

                        <div className="flex-1">

                          <div className="flex items-center gap-3 mb-2">

                            <h3 className="text-lg font-bold text-[#1E3A8A]">
                              {u.name}
                            </h3>

                            <span
                              className={`text-xs font-semibold px-3 py-1 rounded-full ${getStatusColor(
                                u.status ||
                                  "active"
                              )}`}
                            >
                              {getStatusLabel(
                                u.status ||
                                  "active"
                              )}
                            </span>

                            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-100 text-blue-700">
                              {u.role === "admin"
                                ? "Administrador"
                                : "Usuario"}
                            </span>

                          </div>

                          <p className="text-sm text-gray-600">
                            {u.email}
                          </p>

                          {u.company && (
                            <p className="text-sm text-gray-600">
                              Empresa:{" "}
                              {u.company}
                            </p>
                          )}

                          <p className="text-xs text-gray-500 mt-2">
                            Registrado:{" "}
                            {new Date(
                              u.createdAt
                            ).toLocaleDateString(
                              "es-ES"
                            )}
                          </p>

                        </div>

                        <button
                          onClick={() =>
                            setExpandedUser(
                              expandedUser === u.id
                                ? null
                                : u.id
                            )
                          }
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <ChevronDown
                            className={`h-5 w-5 transition-transform ${
                              expandedUser ===
                              u.id
                                ? "rotate-180"
                                : ""
                            }`}
                          />
                        </button>

                      </div>

                      {/* PANEL EXPANDIDO */}

                      {expandedUser === u.id && (
                        <div className="mt-6 pt-6 border-t border-gray-200 space-y-4">

                          {/* ROL */}

                          <div>

                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                              Cambiar Rol
                            </label>

                            <div className="flex gap-2">

                              <Button
                                onClick={() =>
                                  handleRoleChange(
                                    u.id,
                                    "user"
                                  )
                                }
                                variant={
                                  u.role === "user"
                                    ? "default"
                                    : "outline"
                                }
                                className={
                                  u.role === "user"
                                    ? "bg-[#1E3A8A]"
                                    : ""
                                }
                                disabled={
                                  updateRoleMutation.isPending
                                }
                              >
                                Usuario
                              </Button>

                              <Button
                                onClick={() =>
                                  handleRoleChange(
                                    u.id,
                                    "admin"
                                  )
                                }
                                variant={
                                  u.role === "admin"
                                    ? "default"
                                    : "outline"
                                }
                                className={
                                  u.role === "admin"
                                    ? "bg-[#1E3A8A]"
                                    : ""
                                }
                                disabled={
                                  updateRoleMutation.isPending
                                }
                              >
                                Administrador
                              </Button>

                            </div>

                          </div>

                          {/* ESTADO */}

                          <div>

                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                              Cambiar Estado
                            </label>

                            <div className="flex gap-2 flex-wrap">

                              <Button
                                onClick={() =>
                                  handleStatusChange(
                                    u.id,
                                    "active"
                                  )
                                }
                                variant={
                                  u.status ===
                                  "active"
                                    ? "default"
                                    : "outline"
                                }
                                className={
                                  u.status ===
                                  "active"
                                    ? "bg-green-600"
                                    : ""
                                }
                                disabled={
                                  updateStatusMutation.isPending
                                }
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />

                                Activo
                              </Button>


                              <Button
                                onClick={() =>
                                  handleStatusChange(
                                    u.id,
                                    "blocked"
                                  )
                                }
                                variant={
                                  u.status ===
                                  "blocked"
                                    ? "default"
                                    : "outline"
                                }
                                className={
                                  u.status ===
                                  "blocked"
                                    ? "bg-red-600"
                                    : ""
                                }
                                disabled={
                                  updateStatusMutation.isPending
                                }
                              >
                                Bloqueado
                              </Button>

                            </div>

                          </div>

                        </div>
                      )}

                    </Card>

                  ))}

              </div>
            )}

          </div>
        )}

        {/* ====================================================
            ESTADÍSTICAS
            ==================================================== */}

        {activeTab === "estadisticas" && (
          <div>

            <h2 className="text-2xl font-bold text-[#1E3A8A] mb-6">
              Estadísticas de la Plataforma
            </h2>

            {statsQuery.isLoading ? (
              <div className="text-center py-12">

                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#1E3A8A]"></div>

                <p className="mt-4 text-gray-600">
                  Cargando estadísticas...
                </p>

              </div>
            ) : statsQuery.error ? (
              <Card className="p-6 border-2 border-red-200 bg-red-50">

                <div className="flex gap-3">

                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />

                  <p className="text-red-700">
                    Error al cargar estadísticas:{" "}
                    {statsQuery.error.message}
                  </p>

                </div>

              </Card>
            ) : (
              <div className="grid md:grid-cols-4 gap-6">

                <Card className="p-6 border-2 border-gray-200">

                  <p className="text-sm text-gray-600 font-semibold mb-1">
                    Total Usuarios
                  </p>

                  <p className="text-3xl font-bold text-[#1E3A8A]">
                    {statsQuery.data?.totalUsers}
                  </p>

                </Card>

                <Card className="p-6 border-2 border-gray-200">

                  <p className="text-sm text-gray-600 font-semibold mb-1">
                    Usuarios Activos
                  </p>

                  <p className="text-3xl font-bold text-green-600">
                    {statsQuery.data?.activeUsers}
                  </p>

                </Card>

                <Card className="p-6 border-2 border-gray-200">

                  <p className="text-sm text-gray-600 font-semibold mb-1">
                    Usuarios Bloqueados
                  </p>

                  <p className="text-3xl font-bold text-red-600">
                    {statsQuery.data?.blockedUsers}
                  </p>

                </Card>

                <Card className="p-6 border-2 border-gray-200">

                  <p className="text-sm text-gray-600 font-semibold mb-1">
                    Administradores
                  </p>

                  <p className="text-3xl font-bold text-blue-600">
                    {statsQuery.data?.adminUsers}
                  </p>

                </Card>

              </div>
            )}

          </div>
        )}

        {/* ====================================================
            CONFIGURACIÓN
            ==================================================== */}

        {activeTab === "configuracion" && (
          <div>

            <h2 className="text-2xl font-bold text-[#1E3A8A] mb-6">
              Configuración del Sistema
            </h2>

            <Card className="p-8 border-2 border-gray-200">

              <p className="text-gray-600">
                Aquí podrás gestionar la configuración
                global de la plataforma, claves de API,
                y otros parámetros del sistema.
              </p>

             <Card className="p-8 border-2 border-gray-200">
  <p className="text-gray-600">
    La configuración global del sistema se gestionará desde las
    herramientas internas correspondientes.
  </p>
</Card>

            </Card>

          </div>
        )}

      </main>
    </div>
  );
}