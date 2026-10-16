import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { ErrorBox, SupportTicketIcon } from "./SupportUI";
import {
  SUPPORT_PERMISSIONS,
  type Company,
  type SupportTicket,
  type TicketPriority,
  type TicketStatus,
} from "./supportTypes";
import SupportTicketList from "./Support";
import SupportTicketDetail from "./SupportTicketDetail";

export interface SupportAreaProps {
  basePath?: string;
  ticketId?: string;
}

export default function SupportArea({
  basePath = "/employee/support",
  ticketId,
}: SupportAreaProps) {
  const { user, hasPermission } = useAuth();
  const [, setLocation] = useLocation();

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<"all" | TicketStatus>("all");
  const [priorityFilter, setPriorityFilter] =
    useState<"all" | TicketPriority>("all");

  const loadTickets = useCallback(
    async (silent = false) => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        if (silent) setRefreshing(true);
        else setLoading(true);

        setError(null);

        const { data: workerData, error: workerError } =
          await supabase.rpc("current_user_is_worker");

        if (workerError) throw workerError;

        if (workerData !== true) {
          throw new Error(
            "La sesión actual no corresponde a un trabajador activo de Modira.",
          );
        }

        const [ticketResult, companyResult] = await Promise.all([
          supabase
            .from("support_tickets")
            .select("*")
            .order("updated_at", { ascending: false }),
          supabase
            .from("companies")
            .select("id, company_name")
            .order("company_name", { ascending: true }),
        ]);

        if (ticketResult.error) throw ticketResult.error;

        setTickets((ticketResult.data || []) as SupportTicket[]);

        if (!companyResult.error) {
          setCompanies((companyResult.data || []) as Company[]);
        } else {
          setCompanies([]);
        }
      } catch (err: any) {
        console.error("[Support] List load error:", err);
        setError(
          err?.message || "No se pudieron cargar los tickets de soporte.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user],
  );

  useEffect(() => {
    if (!ticketId) {
      void loadTickets();
    }
  }, [ticketId, loadTickets]);

  if (!hasPermission(SUPPORT_PERMISSIONS.read)) {
    return (
      <div className="min-h-screen bg-white text-[#172033]">
        <div className="mx-auto w-full max-w-[1500px] p-5 sm:p-6 lg:p-8">
          <ErrorBox message="No tienes permiso para consultar los tickets de soporte." />
        </div>
      </div>
    );
  }

  const normalizedBase = basePath.replace(/\/+$/, "") || "/employee/support";

  if (ticketId) {
    return (
      <SupportTicketDetail
        ticketId={ticketId}
        onBack={() => setLocation(normalizedBase)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-white text-[#172033]">
      <div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-[#64748B]">
              <SupportTicketIcon />
              <span>Gestión de soporte</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1E3A8A]">
              Tickets
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Gestiona las solicitudes de soporte, su prioridad, estado y
              seguimiento desde un único espacio.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => void loadTickets(true)}
            disabled={refreshing}
            className="h-10 border-gray-200 bg-white shadow-none"
          >
            {refreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Actualizar
          </Button>
        </div>

        {error ? <ErrorBox message={error} /> : null}

        <SupportTicketList
          tickets={tickets}
          companies={companies}
          loading={loading}
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          priorityFilter={priorityFilter}
          setPriorityFilter={setPriorityFilter}
          onOpen={(ticket) => {
            const path = `${normalizedBase}/${ticket.id}`;
            const opened = window.open(path, "_blank", "noopener,noreferrer");

            if (!opened) {
              setLocation(path);
            }
          }}
        />
      </div>
    </div>
  );
}
