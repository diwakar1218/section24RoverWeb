import {NextRequest,NextResponse} from "next/server";
import {apiBaseUrl} from "@/lib/server/api-base-url";

export function proxy(request:NextRequest) {
  // Browser authentication must use the session-cookie route handlers.
  if(request.nextUrl.pathname.startsWith("/api/v1/auth/"))return NextResponse.next();
  try {
    // Resolve at request time so the same production build supports either API.
    return NextResponse.rewrite(`${apiBaseUrl()}${request.nextUrl.pathname}${request.nextUrl.search}`);
  }catch(error){
    return NextResponse.json({title:error instanceof Error?error.message:"Check api_base_url.json."},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}

export const config={matcher:["/api/v1/:path*","/hubs/:path*"]};
