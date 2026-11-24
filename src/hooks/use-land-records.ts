import { useQuery } from "@tanstack/react-query";
import { request } from "@/services/api";
import type { SelectOption } from "@/components/searchable-select";
export function useLandRecords(level:"district"|"tehsil"|"village",district="",tehsil="",enabled=true) {
  const params=new URLSearchParams();if(district)params.set("dcc",district);if(tehsil)params.set("tcc",tehsil);
  return useQuery({queryKey:["land-records",level,district,tehsil],queryFn:()=>request<SelectOption[]>(`/mobile/land-records/${level}?${params}`),enabled:enabled&&(level==="district"||/^\d+$/.test(district))&&(level!=="village"||/^\d+$/.test(tehsil)),staleTime:3600000});
}
export function matchesLandRecord(code:string|undefined,name:string,selected:SelectOption|null){return !selected||code===selected.code||[selected.name,selected.englishName].some(value=>value?.trim().toLocaleLowerCase()===name.trim().toLocaleLowerCase());}
export function mergeLandOptions(remote:SelectOption[]|undefined,saved:SelectOption[]){const values=[...(remote??[])];for(const option of saved)if(!values.some(o=>o.code===option.code||o.name===option.name||o.englishName===option.name))values.push(option);return values;}
