
import { useLocation } from "wouter";
import Quotations from "./Quotations";
import QuotationCreate from "./QuotationCreate";
import QuotationDetail from "./QuotationDetail";

export default function QuotationsArea({basePath="/employee/quotations"}:{basePath?:string}) {
  const [location,setLocation]=useLocation();
  const base=basePath.replace(/\/+$/,"");
  const normalized=location.split("?")[0].replace(/\/+$/,"");
  if(normalized===`${base}/new`)return <QuotationCreate onBack={()=>setLocation(base)} onCreated={id=>setLocation(`${base}/${id}`)} onDraftCreated={id=>setLocation(`${base}/draft/${id}`)}/>;
  if(normalized.startsWith(`${base}/draft/`)){const draftId=normalized.slice(`${base}/draft/`.length);if(draftId&&!draftId.includes("/"))return <QuotationCreate draftId={draftId} onBack={()=>setLocation(base)} onCreated={id=>setLocation(`${base}/${id}`)} onDraftCreated={id=>{if(draftId!==id)setLocation(`${base}/draft/${id}`)}}/>;}
  if(normalized.startsWith(`${base}/`)){
    const id=normalized.slice(base.length+1);
    if(id&&!id.includes("/"))return <QuotationDetail quotationId={id} onBack={()=>setLocation(base)} onEditDraft={draftId=>setLocation(`${base}/draft/${draftId}`)}/>;
  }
  return <Quotations onCreate={()=>setLocation(`${base}/new`)} onOpen={q=>setLocation(`${base}/${q.id}`)} onOpenDraft={id=>setLocation(`${base}/draft/${id}`)}/>;
}
