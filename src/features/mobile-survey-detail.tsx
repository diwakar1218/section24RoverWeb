"use client";
import { useState } from "react";
import { notify, errorMessage } from "@/lib/notifications";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowDownToLine, Printer, RefreshCw, MapPinned } from "lucide-react";
import { useAuth } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { request } from "@/services/api";
import { time } from "@/lib/utils";
import { useLive } from "@/hooks/use-monitoring";
import { distance } from "@/lib/survey-distance";
import type { MobileSurveyDetail as Detail } from "@/types/mobile-surveys";
import { ErrorState, Status } from "./dashboard";
import { exportCsv } from "./directory";

const SurveyMap = dynamic(() => import("@/components/survey-map"), {
  ssr: false,
  loading: () => <div className="survey-map-loading-placeholder" role="status">Loading survey map…</div>,
});

function PointView({data}:{data:Detail}) {
  const [from,setFrom]=useState(""),[to,setTo]=useState(""),[target,setTarget]=useState<"from"|"to">("to");
  const s=data.session,points=[...data.points,...data.track],trackIds=new Set(data.track.map(p=>p.id));
  const a=points.find(p=>p.id===from)??points[0],b=points.find(p=>p.id===to)??points.at(-1);
  const latitude=points.reduce((sum,p)=>sum+p.latitude,0)/Math.max(1,points.length);
  const xy=points.map(p=>[(p.longitude-(points[0]?.longitude??0))*Math.cos(latitude*Math.PI/180),-(p.latitude-(points[0]?.latitude??0))]);
  const xs=xy.map(p=>p[0]),ys=xy.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const scale=Math.min(720/Math.max(maxX-minX,1e-9),220/Math.max(maxY-minY,1e-9));
  const plot=xy.map(([x,y])=>[400+(x-(minX+maxX)/2)*scale,140+(y-(minY+maxY)/2)*scale]);
  function choose(id:string){if(target==="from"){setFrom(id);setTarget("to");}else setTo(id);}
  function downloadJson(){try{const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));const el=document.createElement("a");el.href=url;el.download=`survey_${s.id}.json`;el.click();URL.revokeObjectURL(url);notify("JSON export is ready.","success");}catch(error){notify(errorMessage(error));}}
  return <div className="survey-detail">
    <div className="survey-detail-actions"><Link href="/dashboard/mobile-surveys" className="back-link"><ArrowLeft size={14}/>Survey list</Link><div><Button size="sm" variant="outline" onClick={()=>exportCsv(`survey_${s.id}.csv`,["Project","Job","Plot","District","Tehsil","Village","Gata no","Case no","Point","Type","Name","Latitude","Longitude","Altitude m","H accuracy m","V accuracy m","Fix","Address","Captured at","Remark"],points.map(p=>[s.project,s.jobName??"",s.plotName??s.project,s.district,s.tehsil,s.village,s.gataNo??"",s.caseNo??"",p.pointNumber,trackIds.has(p.id)?"Track":p.pointType??"Point",p.name,p.latitude,p.longitude,p.altitude??null,p.horizontalAccuracy??null,p.verticalAccuracy??null,p.fixType??"",p.address??"",p.capturedAt,p.remark??""]))}><ArrowDownToLine size={14}/>CSV / Excel</Button><Button size="sm" variant="outline" onClick={downloadJson}>JSON</Button><Button size="sm" variant="outline" onClick={()=>window.print()}><Printer size={14}/>Print / PDF</Button></div></div>
    <div className="page-heading"><div><span className="eyebrow">SURVEY DETAIL</span><h1>{s.plotName||s.project}<span className="heading-dot">.</span></h1><p>{s.surveyorName||"Field survey"} · {time(s.startedAt)} IST</p></div><Status value={s.status}/></div>
    <section className="survey-stats" aria-label="Survey measurements">{[{label:"Saved points",value:data.points.length},{label:"Track positions",value:data.track.length},{label:"Area",value:s.totalArea.toFixed(2),unit:"sq m"},{label:s.mode==="polygon"?"Boundary perimeter":"Distance",value:s.totalDistance.toFixed(3),unit:"m"}].map(m=><article className="kpi-card" key={m.label}><div className="kpi-label">{m.label}</div><div className="kpi-value">{m.value}<small>{m.unit}</small></div>{m.label==="Area"&&<div className="kpi-note">{(s.totalArea/10000).toFixed(4)} hectares</div>}</article>)}</section>
    <section className="panel survey-information"><div className="panel-heading"><h2><MapPinned size={18}/>Location & survey information</h2></div><dl className="survey-metadata">{[["Project",s.project],["Job",s.jobName],["Plot",s.plotName||s.project],["District",s.district],["Tehsil",s.tehsil],["Village",s.village],["Gata number",s.gataNo],["Case number",s.caseNo],["Surveyor",s.surveyorName],["Survey mode",s.mode],["Rover serial",s.roverSerial],["Started at",time(s.startedAt)],["Completed at",s.endedAt?time(s.endedAt):"—"],["Address",s.address]].map(([label,value])=><div key={label} className={label==="Address"?"survey-address":""}><dt>{label}</dt><dd>{value||"Unavailable at capture"}</dd></div>)}</dl>
      {s.provenance==="legacy_device_import_unverified"&&<div className="detail-notice">Imported device survey: unverified legacy record</div>}
      {s.landRecordSource==="manual-or-legacy"&&<div className="detail-notice">Older location record: Bhulekh codes unavailable.</div>}
    </section>
    <section className="panel survey-point-layout"><div className="panel-heading"><div><h2>Survey map & distance</h2><p>All saved points, boundary and track. Select two points to measure their distance on WGS84.</p></div></div>
      {points.length>0?<><SurveyMap key={s.id} points={data.points} track={data.track} polygon={s.mode==="polygon"} fromId={a?.id} toId={b?.id} onSelect={choose} onFromChange={id=>{setFrom(id);setTarget("to");}} onToChange={id=>{setTo(id);setTarget("to");}}/>
      <div className="survey-distance-controls"><label>From point<select value={a?.id} onFocus={()=>setTarget("from")} onChange={e=>{setFrom(e.target.value);setTarget("to");}}>{points.map((p,i)=><option key={p.id} value={p.id}>{p.pointNumber||`Track ${i+1}`}</option>)}</select></label><label>To point<select value={b?.id} onFocus={()=>setTarget("to")} onChange={e=>setTo(e.target.value)}>{points.map((p,i)=><option key={p.id} value={p.id}>{p.pointNumber||`Track ${i+1}`}</option>)}</select></label>{a&&b&&<div className="survey-distance-result"><small>{a.pointNumber||"From"} → {b.pointNumber||"To"}</small><strong>{distance(a,b).toFixed(3)} m</strong><small>WGS84 surface distance</small></div>}</div>
      <div className="survey-diagram-heading"><h3>Point diagram</h3><p>Layout from saved coordinates</p></div>
      <svg viewBox="0 0 800 280" role="group" aria-label="Saved survey point layout">
        {s.mode==="polygon"&&data.points.length>=3?<polygon points={plot.slice(0,data.points.length).map(p=>p.join(",")).join(" ")} fill="#d9ebe7" stroke="#317565" strokeWidth="2"/>:<polyline points={plot.map(p=>p.join(",")).join(" ")} fill="none" stroke="#637b91" strokeWidth="2"/>}
        {a&&b&&<line x1={plot[points.indexOf(a)][0]} y1={plot[points.indexOf(a)][1]} x2={plot[points.indexOf(b)][0]} y2={plot[points.indexOf(b)][1]} stroke="#d88829" strokeWidth="2" strokeDasharray="5 4"/>}
        {points.map((p,i)=><g key={p.id} role="button" tabIndex={0} aria-label={`Choose ${p.pointNumber||i+1} as ${target} point`} onClick={()=>choose(p.id)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();choose(p.id);}}}><rect x={plot[i][0]-14} y={plot[i][1]-25} width="60" height="40" fill="transparent" pointerEvents="all"/><circle cx={plot[i][0]} cy={plot[i][1]} r={p.id===a?.id||p.id===b?.id?7:5} fill={p.id===a?.id?"#d88829":"#167764"}/><text x={plot[i][0]+10} y={plot[i][1]-9} fontSize="12">{p.pointNumber||i+1}</text></g>)}
      </svg><p className="survey-layout-note">Choose a point on the map or diagram to change the {target} point. The map uses the saved latitude and longitude of every point.</p></>:<div className="empty-state">No points have uploaded yet.</div>}
    </section>
    <section className="panel survey-point-table"><div className="panel-heading"><div><h2>Saved coordinates <span className="tiny-badge">{points.length}</span></h2><p>Latitude, longitude, accuracy, capture address and point remarks</p></div></div><div className="table-overflow"><table><thead><tr>{["Point / name","Latitude","Longitude","H / V accuracy (m)","Fix / captured","Address / remark","Previous edge"] .map(title=><th key={title}>{title}</th>)}</tr></thead><tbody>{points.map((p,i)=>{const previous=i===data.points.length?null:points[i-1];return <tr key={p.id}><td><strong>{p.pointNumber||`Track ${i-data.points.length+1}`}</strong><small>{p.name}</small><small>{trackIds.has(p.id)?"Track":p.pointType||"Survey point"}</small></td><td>{p.latitude.toFixed(8)}</td><td>{p.longitude.toFixed(8)}</td><td>{p.horizontalAccuracy??"—"} / {p.verticalAccuracy??"—"}</td><td>{p.fixType||"—"}<small>{time(p.capturedAt)}</small></td><td>{p.address||"Unavailable at capture"}{p.remark&&<small>{p.remark}</small>}</td><td>{previous?`${distance(previous,p).toFixed(3)} m`:"—"}</td></tr>;})}</tbody></table></div></section>
    <section className="panel survey-remark"><h2>Remark</h2><p>{s.remark||"No survey remark recorded."}</p></section>
  </div>;
}

export function MobileSurveyDetail({id}:{id:string}) {
  useLive();
  const {profile,demo}=useAuth(),permitted=profile?.grants.some(g=>g.permission==="surveys.read")??false;
  const query=useQuery({queryKey:["mobile-survey",id],queryFn:()=>request<Detail>(`/mobile/survey/${encodeURIComponent(id)}`),enabled:permitted&&!demo,refetchInterval:10000});
  if(!permitted)return <ErrorState error={new Error("Survey read permission required.")}/>;
  if(demo)return <div className="panel empty-state">Sign in to view saved field surveys.</div>;
  if(query.error)return <ErrorState error={query.error} retry={()=>void query.refetch()}/>;
  if(!query.data)return <div className="empty-state"><RefreshCw size={18}/>Loading survey details…</div>;
  return <PointView data={query.data}/>;
}
