"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, X } from "lucide-react";
import { useAuth } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { request } from "@/services/api";
import { mobileHistory } from "@/services/mobile-monitoring";
import { time } from "@/lib/utils";
import type { RoverView, Survey, Page } from "@/types";
import type { MobileSurveyDetail } from "@/types/mobile-surveys";
import { ErrorState, Status } from "./dashboard";
import { exportCsv } from "./directory";

export function DashboardRecords({metric,title,rovers,district,telemetryAvailable,close}:{metric:string;title:string;rovers:RoverView[];district:string;telemetryAvailable:boolean;close:()=>void}){
  const {profile}=useAuth(),client=useQueryClient(),root=useRef<HTMLElement>(null);
  const receiver=["rovers","online","offline","stale","workingSurveyors"].includes(metric);
  const permitted=!!profile?.grants.some(g=>g.permission==="surveys.read");
  const query=useQuery({queryKey:["monitoring","metric-records",metric,district],enabled:!receiver&&permitted,refetchInterval:10000,queryFn:async()=>{
    const jobs:Survey[]=[];for(let page=1;;page++){const result=await request<Page<Survey>>(`/surveys?page=${page}&pageSize=100${district?`&districtId=${district}`:""}`);jobs.push(...result.items);if(jobs.length>=result.total||!result.items.length)break;}
    const sessions=(await mobileHistory(client)).filter(s=>!district||s.displayDistrictId===district);
    const points:{detail:MobileSurveyDetail;point:MobileSurveyDetail["points"][number]}[]=[];
    if(metric==="points")for(let start=0;start<sessions.length;start+=4){const details=await Promise.all(sessions.slice(start,start+4).filter(s=>s.totalPoints>0).map(s=>client.fetchQuery({queryKey:["mobile-survey",s.id],staleTime:5000,queryFn:()=>request<MobileSurveyDetail>(`/mobile/survey/${s.id}`)})));for(const detail of details)for(const point of detail.points)points.push({detail,point});}
    return {jobs,sessions,points};
  }});
  useEffect(()=>{root.current?.scrollIntoView({behavior:"smooth",block:"start"});root.current?.focus({preventScroll:true});},[metric]);
  const records=rovers.filter(r=>metric==="rovers"||metric==="workingSurveyors"?metric==="rovers"||r.activeSurvey:r.connectionStatus.toLowerCase()===metric);
  const workers=[...new Map(records.filter(r=>r.data.surveyorId).map(r=>[r.data.surveyorId,r])).values()];
  const native=(query.data?.jobs??[]).filter(s=>metric==="activeJobs"?s.status==="InProgress":metric==="areaM2"?s.areaM2>0:s.pointCount>0);
  const sessions=(query.data?.sessions??[]).filter(s=>metric==="activeJobs"?s.status==="active":metric==="areaM2"?s.totalArea>0:s.totalPoints>0);
  function csv(){
    if(receiver){const data=metric==="workingSurveyors"?workers:records;exportCsv(`${metric}.csv`,["Rover","Surveyor","District","Tehsil","Village","Status","Latitude","Longitude","Observed at"],data.map(r=>[r.data.name,r.data.surveyorName,r.data.district,r.data.tehsil??"",r.data.village??"",r.connectionStatus,r.data.latitude,r.data.longitude,r.data.observedAt]));}
    else if(metric==="points")exportCsv("survey-points.csv",["Survey","District","Tehsil","Village","Gata","Case","Point","Latitude","Longitude","Address","Captured at"],(query.data?.points??[]).map(({detail,point})=>[detail.session.project,detail.session.district,detail.session.tehsil,detail.session.village,detail.session.gataNo??"",detail.session.caseNo??"",point.pointNumber,point.latitude,point.longitude,point.address??"",point.capturedAt]));
    else exportCsv(`${metric}.csv`,["Survey","Surveyor","District","Tehsil","Village","Gata","Case","Points","Area sq m"],[...native.map(s=>[s.name,s.surveyorName,s.district,"","","","",s.pointCount,s.areaM2]),...sessions.map(s=>[s.project,s.surveyorName??"",s.district,s.tehsil,s.village,s.gataNo??"",s.caseNo??"",s.totalPoints,s.totalArea])]);
  }
  return <section className="panel metric-records" aria-label={`${title} detailed records`} id="metric-records" ref={root} tabIndex={-1}>
    <div className="panel-heading"><div><h2>{title} · Detailed records</h2><p>{metric==="points"?"Saved survey points with their location and capture details":"Authorized records contributing to this metric"}</p></div><div className="heading-actions"><Button variant="outline" size="sm" onClick={csv} disabled={!receiver&&(!query.data||query.isFetching)}><ArrowDownToLine size={14}/>Export CSV / Excel</Button><Button variant="ghost" size="sm" aria-label="Close detailed records" onClick={close}><X size={16}/></Button></div></div>
    {!telemetryAvailable&&receiver&&<p className="metric-note">Saved connections are listed below. Fresh online/offline status requires the updated hosted API.</p>}
    {receiver?<div className="table-overflow"><table><thead><tr>{[metric==="workingSurveyors"?"Surveyor":"Rover / serial","Surveyor / survey","District","Tehsil","Village","Status","Latitude / longitude","Observed at"].map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{(metric==="workingSurveyors"?workers:records).map(r=><tr key={r.data.id}><td><Link href={`/dashboard/rovers/${r.data.id}`}>{metric==="workingSurveyors"?r.data.surveyorName:r.data.name}</Link><small>{r.data.serialNumber}</small></td><td>{r.data.surveyorName}<small>{r.data.jobName}</small></td><td>{r.data.district}</td><td>{r.data.tehsil||"—"}</td><td>{r.data.village||"—"}</td><td><Status value={r.connectionStatus}/></td><td>{r.data.latitude!=null&&r.data.longitude!=null?`${r.data.latitude.toFixed(8)}, ${r.data.longitude.toFixed(8)}`:"Not received"}</td><td>{time(r.data.observedAt)}</td></tr>)}</tbody></table>{records.length===0&&<div className="empty-state">{telemetryAvailable?"No matching records.":"No confirmed live status is available from the hosted API yet."}</div>}</div>:!permitted?<div className="empty-state">Survey read permission is required to view these records.</div>:query.error?<ErrorState error={query.error} retry={()=>void query.refetch()}/>:query.isPending?<div className="empty-state">Loading detailed records…</div>:metric==="points"?<>
      <div className="table-overflow"><table><thead><tr>{["Point / survey","District","Tehsil","Village","Gata / case","Latitude","Longitude","Address","Captured at"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{query.data?.points.map(({detail,point})=><tr key={point.id}><td><Link href={`/dashboard/mobile-surveys/${detail.session.id}`}>{point.pointNumber}</Link><small>{detail.session.project}</small><small>{point.name}</small></td><td>{detail.session.district}</td><td>{detail.session.tehsil}</td><td>{detail.session.village}</td><td>{detail.session.gataNo||"—"}<small>{detail.session.caseNo||"—"}</small></td><td>{point.latitude.toFixed(8)}</td><td>{point.longitude.toFixed(8)}</td><td>{point.address||"Unavailable at capture"}</td><td>{time(point.capturedAt)}</td></tr>)}</tbody></table>{!query.data?.points.length&&<div className="empty-state">No uploaded Android survey points match this district.</div>}</div>
      {native.length>0&&<div className="metric-note">Other survey job point totals: {native.map(s=><p key={s.id}><Link href={`/dashboard/surveys/${s.id}`}>{s.name}</Link> · {s.pointCount} points</p>)}</div>}
    </>:<div className="table-overflow"><table><thead><tr>{["Survey / surveyor","District","Tehsil","Village","Gata / case","Points","Area (sq m)","Status"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{native.map(s=><tr key={s.id}><td><Link href={`/dashboard/surveys/${s.id}`}>{s.name}</Link><small>{s.surveyorName}</small></td><td>{s.district}</td><td>—</td><td>—</td><td>—</td><td>{s.pointCount}</td><td>{s.areaM2.toFixed(2)}</td><td><Status value={s.status}/></td></tr>)}{sessions.map(s=><tr key={s.id}><td><Link href={`/dashboard/mobile-surveys/${s.id}`}>{s.project}</Link><small>{s.surveyorName}</small></td><td>{s.district}</td><td>{s.tehsil}</td><td>{s.village}</td><td>{s.gataNo||"—"}<small>{s.caseNo||"—"}</small></td><td>{s.totalPoints}</td><td>{s.totalArea.toFixed(2)}</td><td><Status value={s.status}/></td></tr>)}</tbody></table>{!native.length&&!sessions.length&&<div className="empty-state">No matching survey records.</div>}</div>}
  </section>;
}
