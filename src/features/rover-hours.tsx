"use client";
import {useEffect,useRef} from "react";
import Link from "next/link";
import {useQuery} from "@tanstack/react-query";
import {Clock3,ArrowUpRight,ArrowDownToLine,X,Radio} from "lucide-react";
import {useAuth} from "@/components/providers";
import {Button} from "@/components/ui/button";
import {request,ApiError} from "@/services/api";
import {workDuration} from "@/lib/rover-activity";
import type {RoverView} from "@/types";
import {exportCsv} from "./directory";
import {ErrorState,Status} from "./dashboard";

type Row={rover:RoverView;totalSeconds:number;todaySeconds:number;surveyCount:number};
type Totals={totalSeconds:number;todaySeconds:number;rovers:Row[]};
export function RoverHours({district,open,select,close}:{district:string;open:boolean;select:()=>void;close:()=>void}) {
  const {profile,demo}=useAuth(),root=useRef<HTMLElement>(null);
  const query=useQuery({queryKey:["monitoring","rover-hours",district],enabled:!demo&&!!profile?.grants.some(g=>g.permission==="dashboard.read"),refetchInterval:10000,
    queryFn:async()=>{try{
      const totals=await request<Totals>(`/dashboard/rover-hours${district?`?districtId=${encodeURIComponent(district)}`:""}`);
      if(!Array.isArray(totals.rovers)||!Number.isFinite(totals.totalSeconds)||!Number.isFinite(totals.todaySeconds))throw new Error("The API did not return valid rover working-hour totals.");
      return totals;
    }catch(error){if(error instanceof ApiError&&error.status===404)return null;throw error;}}});
  const data=query.data;
  useEffect(()=>{if(open){root.current?.scrollIntoView({behavior:"smooth",block:"start"});root.current?.focus({preventScroll:true});}},[open]);
  function download() {
    exportCsv("rover_working_hours.csv",["Rover","Serial","Surveyor","District","Total hours","Today hours","Total duration","Today duration","Survey sessions","Status"],(data?.rovers??[]).map(row=>[
      row.rover.data.name,row.rover.data.serialNumber,row.rover.data.surveyorName,row.rover.data.district,Number((row.totalSeconds/3600).toFixed(6)),Number((row.todaySeconds/3600).toFixed(6)),workDuration(row.totalSeconds),workDuration(row.todaySeconds),row.surveyCount,row.rover.connectionStatus,
    ]));
  }
  return <>
    <button type="button" className={`rover-hours-card ${open?"selected":""}`} aria-label="Show details: Total rover hours" aria-expanded={open} aria-controls="rover-hours-records" onClick={select}>
      <span className="rover-hours-icon"><Clock3 size={26}/></span>
      <span className="rover-hours-heading"><strong>Total rover hours</strong><small>Recorded survey-session time · All registered rovers</small></span>
      <span className="rover-hours-value"><strong>{data?(data.totalSeconds/3600).toLocaleString("en-IN",{maximumFractionDigits:2}):query.isPending?"…":"—"}<small>h</small></strong><small>{data?workDuration(data.totalSeconds):query.error?"Working hours unavailable · Click to retry":"Update the hosted API to load working hours"}</small></span>
      <span className="rover-hours-today"><small>Today · IST</small><strong>{data?workDuration(data.todaySeconds):"—"}</strong><small>{data?`${data.rovers.length} registered rovers`:"Rover-wise totals available below"}</small></span>
      <ArrowUpRight size={20}/>
    </button>
    {open&&<section id="rover-hours-records" className="panel metric-records" aria-label="Rover working hours detailed records" ref={root} tabIndex={-1}>
      <div className="panel-heading"><div><h2>Rover-wise working hours</h2><p>All-time and today's recorded survey duration. Overlapping sessions for one rover are counted once.</p></div>
        <div className="heading-actions"><Button size="sm" variant="outline" disabled={!data} onClick={download}><ArrowDownToLine size={14}/>Export CSV / Excel</Button><Button size="sm" variant="ghost" aria-label="Close rover hours" onClick={close}><X size={16}/></Button></div>
      </div>
      {query.error?<ErrorState error={query.error} retry={()=>void query.refetch()}/>:query.isPending?<div className="empty-state">Loading rover working hours…</div>:!data?<div className="empty-state">Install the latest API build to calculate rover working hours from saved survey sessions.</div>:<>
        <div className="table-overflow"><table><thead><tr>{["Rover / serial","Surveyor","District","Total working time","Today (IST)","Survey sessions","Status",""].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
          {data.rovers.map(row=><tr key={row.rover.data.id}><td><Link href={`/dashboard/rovers/${encodeURIComponent(row.rover.data.id)}`}><Radio size={13}/> {row.rover.data.name}</Link><small>{row.rover.data.serialNumber}</small></td><td>{row.rover.data.surveyorName??"Unassigned"}</td><td>{row.rover.data.district}</td><td><strong>{workDuration(row.totalSeconds)}</strong><small>{(row.totalSeconds/3600).toFixed(2)} hours</small></td><td>{workDuration(row.todaySeconds)}</td><td>{row.surveyCount}</td><td><Status value={row.rover.connectionStatus}/></td><td><Link className="text-link" href={`/dashboard/rovers/${encodeURIComponent(row.rover.data.id)}`}>View <ArrowUpRight size={14}/></Link></td></tr>)}
        </tbody></table></div>
        {!data.rovers.length&&<div className="empty-state">No registered rovers match this district.</div>}
      </>}
    </section>}
  </>;
}
