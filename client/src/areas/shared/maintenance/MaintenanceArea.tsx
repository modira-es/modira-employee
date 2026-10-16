import { useLocation } from "wouter";
import Maintenance from "./Maintenance";
export default function MaintenanceArea({basePath="/employee/maintenance",onMenuNavigate}:{basePath?:string;onMenuNavigate?:(id:string)=>void}){
  const [,setLocation]=useLocation();
  return <Maintenance basePath={basePath} onMenuNavigate={onMenuNavigate} onNavigate={setLocation}/>;
}
