import { NextRequest, NextResponse } from "next/server";
import {apiBaseUrl} from "@/lib/server/api-base-url";

export async function GET(request:NextRequest,context:{params:Promise<{action:string}>}) {
  const {action}=await context.params;
  if(action!=="me")return NextResponse.json({title:"Not found"},{status:404});
  try {
    const upstream=apiBaseUrl();
    const headers=new Headers();const authorization=request.headers.get("authorization");if(authorization)headers.set("Authorization",authorization);
    const response=await fetch(`${upstream}/api/v1/auth/me`,{headers,cache:"no-store",redirect:"error"});
    return new NextResponse(response.body,{status:response.status,headers:{"Content-Type":response.headers.get("Content-Type")??"application/json","Cache-Control":"no-store"}});
  } catch {return NextResponse.json({title:"The API is temporarily unavailable. Please retry; your session is retained."},{status:502});}
}

export async function POST(request:NextRequest,context:{params:Promise<{action:string}>}) {
  const {action}=await context.params;
  if(!["login","refresh","logout"].includes(action))return NextResponse.json({title:"Not found"},{status:404});
  const origin=request.headers.get("origin");
  if(origin&&new URL(origin).host!==request.headers.get("host"))return NextResponse.json({title:"Request origin is not allowed."},{status:403});
  const secure=request.nextUrl.protocol==="https:"||request.headers.get("x-forwarded-proto")?.split(",")[0].trim()==="https";
  const options={httpOnly:true,secure,sameSite:"strict" as const,path:"/api/v1/auth"};
  let response:NextResponse;
  try {
    const upstream=apiBaseUrl();
    const headers=new Headers({"Content-Type":"application/json","Origin":origin??request.nextUrl.origin});
    for(const name of ["cookie","authorization"]) {const value=request.headers.get(name);if(value)headers.set(name,value);}
    const result=await fetch(`${upstream}/api/v1/auth/${action}`,{method:"POST",headers,body:action==="login"?await request.text():undefined,cache:"no-store",redirect:"error"});
    response=new NextResponse(result.body,{status:result.status,headers:{"Content-Type":result.headers.get("Content-Type")??"application/json","Cache-Control":"no-store"}});
    const cookie=result.headers.getSetCookie().find(value=>value.startsWith("survey_refresh="));
    if(cookie&&action!=="logout"&&result.ok) {
      const encoded=cookie.split(";",1)[0].slice("survey_refresh=".length);
      response.cookies.set("survey_refresh",decodeURIComponent(encoded),options);
    }
    if(result.status===401&&action==="refresh")response.cookies.set("survey_refresh","",{...options,maxAge:0});
  } catch {
    response=NextResponse.json({title:"The API is temporarily unavailable. Please retry; your session is retained."},{status:502});
  }
  if(action==="logout")response.cookies.set("survey_refresh","",{...options,maxAge:0});
  response.headers.set("Cache-Control","no-store");
  return response;
}
