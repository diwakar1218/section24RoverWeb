import type { QueryClient } from "@tanstack/react-query";
import { request, ApiError } from "./api";
import type { Profile, GeographyOptions, RoverView, Summary, District } from "@/types";
import type { MobileSurvey, MobileSurveyDetail } from "@/types/mobile-surveys";

export type SurveyRow=MobileSurvey&{displayDistrictId:string};
async function key(text:string){
  const input=new TextEncoder().encode("android:"+text);
  let bytes:Uint8Array;
  if(globalThis.crypto?.subtle)bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",input));
  else{
    // Display row identifiers also work when a web server is accessed over HTTP.
    // These identifiers never grant access; the API enforces authorization.
    bytes=new Uint8Array(16);const view=new DataView(bytes.buffer);
    for(let i=0;i<4;i++){let hash=0x811c9dc5^(i*0x9e3779b9);for(const value of input)hash=Math.imul(hash^value,0x01000193);view.setUint32(i*4,hash>>>0);}
  }
  const hex=(indexes:number[])=>indexes.map(i=>bytes[i].toString(16).padStart(2,"0")).join("");
  return `${hex([3,2,1,0])}-${hex([5,4])}-${hex([7,6])}-${hex([8,9])}-${hex([10,11,12,13,14,15])}`;
}
export const districtKey=(code:string)=>key("district:"+code);
export async function mobileHistory(client:QueryClient):Promise<SurveyRow[]>{
  return client.fetchQuery({queryKey:["monitoring","mobile-history"],staleTime:4000,queryFn:async()=>{
    const [sessions,geo]=await Promise.all([request<MobileSurvey[]>("/mobile/survey/history"),request<GeographyOptions>("/geography")]);
    return Promise.all(sessions.filter(s=>s.provenance!=="legacy_device_import_unverified").map(async s=>({...s,displayDistrictId:geo.districts.find(d=>d.name===s.district)?.id??await key("district:"+(s.districtCode||s.district.trim().toLowerCase()))})));
  }});
}
export async function legacyMobileHistory(client:QueryClient,profile:Profile|null){
  if(!profile?.grants.some(g=>g.permission==="surveys.read"))return null;
  const integrated=await client.fetchQuery({queryKey:["monitoring","mobile-capabilities"],staleTime:60000,retry:false,queryFn:async()=>{
    try{return (await request<{integratedDashboard:boolean}>("/mobile/monitoring/capabilities")).integratedDashboard===true;}
    catch(error){
      if(!(error instanceof ApiError)||error.status!==404)throw error;
      // The earlier integrated API predates the capability endpoint. Its device
      // endpoint still distinguishes it from the original mobile-only dashboard.
      try{await request("/mobile/monitoring/devices");return true;}
      catch(probe){if(probe instanceof ApiError&&probe.status===403)return true;if(probe instanceof ApiError&&probe.status===404)return false;throw probe;}
    }
  }});
  return integrated?null:mobileHistory(client);
}
export function latestDevices(sessions:SurveyRow[]){const devices=new Map<string,SurveyRow>();for(const s of sessions){const id=s.deviceId||s.userId||s.id;if(!devices.has(id))devices.set(id,s);}return [...devices.values()];}
export async function savedRovers(client:QueryClient,sessions:SurveyRow[],profile:Profile):Promise<RoverView[]>{
  const rows: RoverView[]=[];
  // Bounded requests: only the latest survey for each installation is needed.
  const devices=latestDevices(sessions);
  for(let start=0;start<devices.length;start+=4){rows.push(...await Promise.all(devices.slice(start,start+4).map(async s=>{
    const detail=await client.fetchQuery({queryKey:["mobile-survey",s.id],staleTime:10000,queryFn:()=>request<MobileSurveyDetail>(`/mobile/survey/${s.id}`)});
    const point=[...detail.points,...detail.track].sort((a,b)=>Date.parse(b.capturedAt)-Date.parse(a.capturedAt))[0];
    const id=await key("device:"+(s.deviceId||s.userId||s.id));
    return {connectionStatus:"Unknown",receivingGnss:false,activeSurvey:false,data:{id,organizationId:profile.organizationId,name:s.roverSerial?`DA2 ${s.roverSerial}`:"Android survey connection",serialNumber:s.roverSerial||"Not reported",model:"Trimble DA2 / Android",source:"android",telemetryAvailable:false,mobileDeviceId:s.deviceId||null,surveyorId:s.userId||null,surveyorName:s.surveyorName||null,stateId:null,districtId:s.displayDistrictId,district:s.district,tehsilId:null,villageId:null,tehsil:s.tehsil,village:s.village,jobId:s.id,jobName:s.project,surveyStatus:s.status==="completed"?"Completed":s.status==="active"?"InProgress":"Paused",gataNo:s.gataNo,caseNo:s.caseNo,address:point?.address||s.address,lastHeartbeat:null,observedAt:point?.capturedAt||null,receivedAt:null,latitude:point?.latitude??null,longitude:point?.longitude??null,height:point?.altitude??null,fixType:point?.fixType==="RTK_FIX"?"RtkFixed":"Unknown",horizontalPrecision:point?.horizontalAccuracy??null,verticalPrecision:point?.verticalAccuracy??null,lastSyncAt:null,isDemo:false,controllerStatus:"Unknown"}} as RoverView;
  })));}
  return rows;
}
export function addSavedSummary(core:Summary,sessions:SurveyRow[]):Summary{return {...core,telemetryAvailable:false,rovers:core.rovers+latestDevices(sessions).length,activeJobs:core.activeJobs+sessions.filter(s=>s.status==="active").length,completedSurveys:core.completedSurveys+sessions.filter(s=>s.status==="completed").length,points:core.points+sessions.reduce((n,s)=>n+s.totalPoints,0),areaM2:core.areaM2+sessions.reduce((n,s)=>n+s.totalArea,0)};}
export function addSavedDistricts(core:District[],sessions:SurveyRow[]):District[]{
  const rows=new Map(core.map(d=>[d.districtId,{...d}]));
  for(const s of sessions){const d=rows.get(s.displayDistrictId)??{districtId:s.displayDistrictId,name:s.district,total:0,completed:0,active:0,points:0,areaM2:0};d.total++;d.completed+=Number(s.status==="completed");d.active+=Number(s.status==="active");d.points+=s.totalPoints;d.areaM2+=s.totalArea;rows.set(d.districtId,d);}return [...rows.values()];
}
