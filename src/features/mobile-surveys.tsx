"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpRight, RefreshCw, Search } from "lucide-react";
import { useAuth } from "@/components/providers";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";
import { Button } from "@/components/ui/button";
import { request } from "@/services/api";
import { time, number } from "@/lib/utils";
import { useLive } from "@/hooks/use-monitoring";
import { useLandRecords, matchesLandRecord, mergeLandOptions } from "@/hooks/use-land-records";
import type { MobileSurvey } from "@/types/mobile-surveys";
import { ErrorState, Status } from "./dashboard";
import { exportCsv } from "./directory";

export function MobileSurveys() {
  const {profile,demo}=useAuth();
  useLive();
  const [district,setDistrict]=useState<SelectOption|null>(null),[tehsil,setTehsil]=useState<SelectOption|null>(null),[village,setVillage]=useState<SelectOption|null>(null);
  const districts=useLandRecords("district","","",!demo&&!!profile),tehsils=useLandRecords("tehsil",district?.code,"",!demo&&!!profile),villages=useLandRecords("village",district?.code,tehsil?.code,!demo&&!!profile);
  const [search,setSearch]=useState(""),[status,setStatus]=useState(""),[page,setPage]=useState(1);
  const permitted=profile?.grants.some(g=>g.permission==="surveys.read")??false;
  const query=useQuery({queryKey:["mobile-surveys"],queryFn:()=>request<MobileSurvey[]>("/mobile/survey/history"),enabled:permitted&&!demo,refetchInterval:10000});
  const all=query.data??[];
  const options=(rows:MobileSurvey[],key:"district"|"tehsil"|"village")=>[...new Set(rows.map(s=>s[key]).filter(Boolean))].map(name=>({code:rows.find(s=>s[key]===name)?.[(key+"Code") as "districtCode"|"tehsilCode"|"villageCode"]||"saved:"+name,name}));
  const rows=all.filter(s=>matchesLandRecord(s.districtCode,s.district,district)&&matchesLandRecord(s.tehsilCode,s.tehsil,tehsil)&&matchesLandRecord(s.villageCode,s.village,village)&&(!status||s.status===status)&&[s.project,s.jobName,s.plotName,s.surveyorName,s.district,s.tehsil,s.village,s.gataNo,s.caseNo,s.roverSerial].join(" ").toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const pages=Math.max(1,Math.ceil(rows.length/25)),currentPage=Math.min(page,pages);
  const area=rows.reduce((sum,s)=>sum+s.totalArea,0);
  if(!permitted)return <ErrorState error={new Error("Survey read permission required.")}/>;
  if(demo)return <div className="panel empty-state">Sign in to your API to view uploaded field surveys.</div>;
  return <div className="survey-workspace">
    <div className="page-heading"><div><span className="eyebrow">FIELD SURVEYS</span><h1>Survey list<span className="heading-dot">.</span></h1><p>Browse uploaded surveys by district, tehsil and village. Open a survey to inspect its points and measurements.</p></div><div className="heading-actions"><Button variant="outline" size="sm" disabled={query.isFetching} onClick={()=>void query.refetch()}><RefreshCw size={14}/>Refresh surveys</Button><Button variant="outline" size="sm" disabled={!rows.length} onClick={()=>exportCsv("field-surveys.csv",["Project","Job","Plot","Surveyor","District","Tehsil","Village","Gata no","Case no","Rover","Started at","Status","Points","Area sq m","Distance m"],rows.map(s=>[s.project,s.jobName??"",s.plotName??s.project,s.surveyorName??"",s.district,s.tehsil,s.village,s.gataNo??"",s.caseNo??"",s.roverSerial??"",s.startedAt,s.status,s.totalPoints,s.totalArea,s.totalDistance]))}><ArrowDownToLine size={14}/>Export CSV / Excel</Button></div></div>
    {query.error&&<ErrorState error={query.error} retry={()=>void query.refetch()}/>}
    <section className="survey-stats" aria-label="Filtered survey totals">{[{label:"Surveys",value:rows.length},{label:"Completed",value:rows.filter(s=>s.status==="completed").length},{label:"Saved points",value:rows.reduce((sum,s)=>sum+s.totalPoints,0)},{label:"Surveyed area",value:area,unit:"sq m"}].map(m=><article className="kpi-card" key={m.label}><div className="kpi-label">{m.label}</div><div className="kpi-value">{number(m.value)}<small>{m.unit}</small></div>{m.unit&&<div className="kpi-note">{(area/10000).toFixed(4)} hectares</div>}</article>)}</section>
    <section className="panel survey-filters" aria-label="Survey filters"><div className="survey-location-filters">
      <SearchableSelect label="District" value={district?.code??""} options={mergeLandOptions(districts.data,options(all,"district"))} allLabel="All districts" loading={districts.isPending} error={districts.isError} retry={()=>void districts.refetch()} onChange={o=>{setDistrict(o);setTehsil(null);setVillage(null);setPage(1);}}/>
      <SearchableSelect label="Tehsil" value={tehsil?.code??""} disabled={!district} options={mergeLandOptions(tehsils.data,options(all.filter(s=>matchesLandRecord(s.districtCode,s.district,district)),"tehsil"))} allLabel="All tehsils" loading={!!district&&/^\d+$/.test(district.code)&&tehsils.isPending} error={tehsils.isError} retry={()=>void tehsils.refetch()} onChange={o=>{setTehsil(o);setVillage(null);setPage(1);}}/>
      <SearchableSelect label="Village" value={village?.code??""} disabled={!tehsil} options={mergeLandOptions(villages.data,options(all.filter(s=>matchesLandRecord(s.districtCode,s.district,district)&&matchesLandRecord(s.tehsilCode,s.tehsil,tehsil)),"village"))} allLabel="All villages" loading={!!tehsil&&/^\d+$/.test(tehsil.code)&&villages.isPending} error={villages.isError} retry={()=>void villages.refetch()} onChange={o=>{setVillage(o);setPage(1);}}/>
    </div><div className="survey-filter-search"><div className="search-field"><Search size={16}/><input aria-label="Search surveys" placeholder="Search survey, surveyor, gata, case or rover…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></div><select aria-label="Survey status" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="">All statuses</option><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option></select><Button variant="ghost" size="sm" onClick={()=>{setDistrict(null);setTehsil(null);setVillage(null);setSearch("");setStatus("");setPage(1);}}>Clear filters</Button></div></section>
    <section className="panel survey-list-panel" aria-label="Uploaded surveys"><div className="panel-heading"><div><h2>Uploaded surveys <span className="tiny-badge">{rows.length}</span></h2><p>Latest first · open a survey for its complete field record</p></div><Link className="text-link" href="/dashboard/surveys">Administrative jobs <ArrowUpRight size={14}/></Link></div>
      <div className="table-overflow"><table><thead><tr>{["Survey / surveyor","District","Tehsil","Village","Gata / case no","Points","Area (sq m)","Status",""] .map((title,i)=><th key={i}>{title}</th>)}</tr></thead><tbody>{rows.slice((currentPage-1)*25,currentPage*25).map(s=><tr key={s.id}><td><Link href={`/dashboard/mobile-surveys/${s.id}`}>{s.plotName||s.project}</Link>{s.jobName&&<small>{s.project} / {s.jobName}</small>}<small>{s.surveyorName||"Surveyor unavailable"}</small><small>{time(s.startedAt)}</small></td><td>{s.district||"—"}</td><td>{s.tehsil||"—"}</td><td>{s.village||"—"}</td><td>{s.gataNo||"—"}<small>Case {s.caseNo||"—"}</small></td><td>{s.totalPoints}</td><td className="survey-number">{s.totalArea.toFixed(2)}<small>{(s.totalArea/10000).toFixed(4)} ha</small></td><td><Status value={s.status}/></td><td><Link className="text-link" href={`/dashboard/mobile-surveys/${s.id}`} aria-label={`View ${s.plotName||s.project}`}>View details <ArrowUpRight size={14}/></Link></td></tr>)}</tbody></table></div>
      {query.isPending?<div className="empty-state">Loading field surveys…</div>:rows.length===0&&<div className="empty-state">{all.length?"No surveys match these filters.":"No uploaded surveys yet. Synced Android surveys will appear here."}</div>}
      <div className="table-footer"><span>{rows.length} surveys · Page {currentPage} of {pages}{all.length===500?" · Showing the latest 500 uploads":""}</span><div><Button variant="outline" size="sm" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>Previous</Button><Button variant="outline" size="sm" disabled={currentPage>=pages} onClick={()=>setPage(currentPage+1)}>Next</Button></div></div>
    </section>
  </div>;
}
