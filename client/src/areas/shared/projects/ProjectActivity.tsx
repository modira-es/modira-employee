import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Activity, AlertCircle, ArrowLeft, Building2, CalendarDays, Check, CheckCircle2,
  ChevronRight, CircleDollarSign, CircleDot, Clock3, ExternalLink, FileText,
  FolderKanban, Loader2, MessageSquare, Paperclip, Pencil, Plus, RefreshCw,
  Send, Ticket, Trash2, Upload, User, X
} from "lucide-react";
import { toast } from "sonner";

interface Log { id:string; action?:string|null; event_type?:string|null; description?:string|null; created_at:string; user_id?:string|null; }
interface Props { projectId:string; }
export default function ProjectActivity({projectId}:Props){
 const [rows,setRows]=useState<Log[]>([]); const [loading,setLoading]=useState(true);
 const load=useCallback(async()=>{setLoading(true);const{data,error}=await supabase.from("activity_log").select("id,action,event_type,description,created_at,user_id").eq("resource_id",projectId).order("created_at",{ascending:false}).limit(50);if(error)toast.error(error.message);setRows((data||[]) as Log[]);setLoading(false)},[projectId]);
 useEffect(()=>{void load()},[load]);
 return <div className="space-y-4"><div className="flex items-center justify-between"><div><h3 className="text-lg font-semibold text-[#172033]">Actividad</h3><p className="text-sm text-slate-500">Últimos eventos registrados para este proyecto.</p></div><Button variant="outline" size="sm" onClick={()=>void load()}><RefreshCw className="mr-2 h-4 w-4"/>Actualizar</Button></div>
 {loading?<Card className="rounded-2xl p-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-[#1E3A8A]"/></Card>:!rows.length?<Card className="rounded-2xl border-dashed p-10 text-center text-slate-500">No hay actividad registrada.</Card>:<Card className="rounded-2xl border-slate-200 divide-y">{rows.map(x=><div key={x.id} className="flex gap-3 p-4"><div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600"><Activity className="h-4 w-4"/></div><div><p className="text-sm text-[#172033]">{x.description||x.action||x.event_type||"Actividad registrada"}</p><p className="mt-1 text-xs text-slate-400">{new Date(x.created_at).toLocaleString("es-ES")}</p></div></div>)}</Card>}</div>;
}
