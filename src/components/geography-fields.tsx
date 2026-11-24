"use client";
import { SearchableSelect, type SelectOption } from "./searchable-select";
import { useLandRecords } from "@/hooks/use-land-records";
import { request, ApiError } from "@/services/api";
import type { GeographyOptions, GeographyItem } from "@/types";
export type GeographyValue={stateId:string;districtId:string;tehsilId:string;villageId:string;landRecord?:{districtCode:string;tehsilCode?:string;villageCode?:string}};
const prefix="bhulekh:";
export async function resolveGeography(value:GeographyValue){
  if(!value.landRecord)return {stateId:value.stateId||null,districtId:value.districtId||null,tehsilId:value.tehsilId||null,villageId:value.villageId||null};
  try{return await request<{stateId:string;districtId:string;tehsilId:string|null;villageId:string|null}>("/geography/resolve",{method:"POST",body:JSON.stringify(value.landRecord)});}
  catch(error){if(error instanceof ApiError&&error.status===404)throw new Error("Update the hosted API to save the selected Bhulekh jurisdiction. Your user changes have not been saved.");throw error;}
}
export function GeographyFields({data,value,onChange,requireDistrict=false}:{data:GeographyOptions;value:GeographyValue;onChange:(value:GeographyValue)=>void;requireDistrict?:boolean}){
  const land=value.landRecord,districts=useLandRecords("district");
  function infer(options:SelectOption[]|undefined,row:GeographyItem|undefined){const matches=(options??[]).filter(o=>row&&[o.name,o.englishName].some(name=>name?.trim().toLocaleLowerCase()===row.name.trim().toLocaleLowerCase()));return matches.length===1?matches[0].code:"";}
  const district=land?.districtCode??infer(districts.data,data.districts.find(d=>d.id===value.districtId));
  const tehsils=useLandRecords("tehsil",district);
  const tehsil=land?land.tehsilCode??"":infer(tehsils.data,data.tehsils.find(t=>t.id===value.tehsilId));
  const villages=useLandRecords("village",district,tehsil);
  const village=land?land.villageCode??"":infer(villages.data,data.villages.find(v=>v.id===value.villageId));
  function choices(remote:SelectOption[]|undefined,internal:GeographyItem[]){return [...(remote??[]).map(o=>({...o,code:prefix+o.code})),...internal.filter(i=>!infer(remote,i)).map(i=>({code:i.id,name:i.name}))];}
  return <div className="geography-fields">
    <SearchableSelect label="District" value={district?prefix+district:value.districtId} options={choices(districts.data,data.districts)} allLabel={requireDistrict?"Select district":"No assigned district"} allowAll={!requireDistrict} loading={districts.isPending&&!data.districts.length} error={districts.isError} retry={()=>void districts.refetch()} onChange={o=>onChange(o?.code.startsWith(prefix)?{stateId:"",districtId:"",tehsilId:"",villageId:"",landRecord:{districtCode:o.code.slice(prefix.length)}}:{stateId:data.districts.find(d=>d.id===o?.code)?.parentId??"",districtId:o?.code??"",tehsilId:"",villageId:""})}/>
    <SearchableSelect label="Tehsil" value={tehsil?prefix+tehsil:value.tehsilId} disabled={!district&&!value.districtId} options={choices(tehsils.data,data.tehsils.filter(i=>i.parentId===value.districtId))} allLabel="All / unspecified" loading={!!district&&tehsils.isPending} error={tehsils.isError} retry={()=>void tehsils.refetch()} onChange={o=>onChange(o?.code.startsWith(prefix)||(!o&&land)?{...value,tehsilId:"",villageId:"",landRecord:{districtCode:district,tehsilCode:o?.code.slice(prefix.length)}}:{...value,tehsilId:o?.code??"",villageId:"",landRecord:undefined})}/>
    <SearchableSelect label="Village" value={village?prefix+village:value.villageId} disabled={!tehsil&&!value.tehsilId} options={choices(villages.data,data.villages.filter(i=>i.parentId===value.tehsilId))} allLabel="All / unspecified" loading={!!tehsil&&villages.isPending} error={villages.isError} retry={()=>void villages.refetch()} onChange={o=>onChange(o?.code.startsWith(prefix)||(!o&&land)?{...value,villageId:"",landRecord:{districtCode:district,tehsilCode:tehsil,villageCode:o?.code.slice(prefix.length)}}:{...value,villageId:o?.code??"",landRecord:undefined})}/>
  </div>;
}
