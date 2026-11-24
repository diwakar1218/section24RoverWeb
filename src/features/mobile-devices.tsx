"use client";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Smartphone, RefreshCw } from "lucide-react";
import { request, ApiError } from "@/services/api";
import { useAuth } from "@/components/providers";
import { legacyMobileHistory,savedRovers } from "@/services/mobile-monitoring";
import { time } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ErrorState, Status } from "./dashboard";

type Device = {id:string;roverId:string;surveyorName:string;platform:string;osVersion:string;appVersion:string;controllerStatus:string;roverStatus:string;foreground:boolean|null;receivingGnss:boolean;roverReportedConnected:boolean|null;roverSerial:string|null;lastHeartbeat:string|null;observedAt:string|null;pendingSync:number|null;surveyId:string|null;project:string|null;district:string;tehsil:string;village:string;latitude:number|null;longitude:number|null};
export function MobileDevices() {
  const {profile}=useAuth(),client=useQueryClient();
  const query=useQuery({queryKey:["monitoring","mobile-devices"],queryFn:async()=>{
    try{return await request<Device[]>("/mobile/monitoring/devices");}
    catch(error){if(!(error instanceof ApiError)||error.status!==404)throw error;const sessions=await legacyMobileHistory(client,profile);if(sessions===null)throw error;return (await savedRovers(client,sessions,profile!)).map(r=>({id:r.data.mobileDeviceId??r.data.id,roverId:r.data.id,surveyorName:r.data.surveyorName??"",platform:"android",osVersion:"",appVersion:"Not reported",controllerStatus:"Unknown",roverStatus:"Unknown",foreground:null,receivingGnss:false,roverReportedConnected:null,roverSerial:r.data.serialNumber,lastHeartbeat:null,observedAt:r.data.observedAt,pendingSync:null,surveyId:r.data.jobId,project:r.data.jobName,district:r.data.district,tehsil:r.data.tehsil??"",village:r.data.village??"",latitude:r.data.latitude,longitude:r.data.longitude}) as Device);}
  },refetchInterval:5000});
  return <section className="panel mobile-device-panel" aria-label="Android app connections"><div className="panel-heading"><div><h2><Smartphone size={18}/>Android app connections <span className="tiny-badge">{query.data?.length ?? 0}</span></h2><p>App contact, reported rover status and last saved position</p></div><Button variant="outline" size="sm" disabled={query.isFetching} onClick={()=>void query.refetch()}><RefreshCw size={14}/>Refresh app devices</Button></div>
    {query.error?<ErrorState error={query.error}/>:query.isPending?<div className="empty-state">Loading app connections…</div>:<><div className="table-overflow"><table><thead><tr><th>Surveyor / device</th><th>App contact</th><th>Rover / GNSS</th><th>Last coordinates</th><th>Survey / location</th><th>Pending sync</th></tr></thead><tbody>{query.data?.map(d=><tr key={d.id}><td><strong>{d.surveyorName}</strong><small>{d.platform} {d.osVersion} · App {d.appVersion}</small><small>{d.id}</small></td><td><Status value={d.controllerStatus}/><small>{d.foreground==null?"Live status unavailable":d.foreground?"In foreground":"App not in foreground"}</small><small>{time(d.lastHeartbeat)}</small></td><td><Link href={`/dashboard/rovers/${d.roverId}`}>{d.roverSerial || "Serial not reported"}</Link><small><Status value={d.roverStatus}/></small><small>{d.roverReportedConnected==null?"Saved survey location":d.receivingGnss?"Fresh GNSS data":d.roverReportedConnected?"Waiting for fresh GNSS":"Rover reported disconnected"}</small></td><td>{d.latitude!=null&&d.longitude!=null?<>{d.latitude.toFixed(8)}<br/>{d.longitude.toFixed(8)}<small>Observed {time(d.observedAt)}</small></>:"Not received"}</td><td>{d.surveyId?<Link href={`/dashboard/mobile-surveys?session=${d.surveyId}`}>{d.project}</Link>:"No uploaded survey"}<small>{d.district} / {d.tehsil} / {d.village}</small></td><td>{d.pendingSync??"Unknown"}</td></tr>)}</tbody></table></div>{query.data?.length===0&&<div className="empty-state">No Android app has registered for this organization yet.</div>}</>}
  </section>;
}
