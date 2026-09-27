import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase/config";
import { PWA_TOKEN_HEADER, validatePwaCredential } from "@/lib/pwa/server";

const PUBLIC_API_PREFIXES=["/api/health","/api/pwa","/api/webhooks"];
const PUSH_API_PREFIXES=["/api/push"];
function isPath(path:string,prefix:string){return path===prefix||path.startsWith(`${prefix}/`);}
function startsWithAny(path:string,prefixes:string[]){return prefixes.some(p=>isPath(path,p));}
function isInvestorPage(path:string){return isPath(path,"/dashboard");}
function isAdminPage(path:string){return isPath(path,"/admin");}
function isTraderPage(path:string){return isPath(path,"/trader");}
function isPublicApi(path:string){return startsWithAny(path,PUBLIC_API_PREFIXES);}
function isPushApi(path:string){return startsWithAny(path,PUSH_API_PREFIXES);}
function isProtectedApi(path:string){return path.startsWith("/api/")&&!isPublicApi(path)&&!isPushApi(path)&&!isPath(path,"/api/admin");}
function getRoleKeys(rows:unknown){if(!Array.isArray(rows))return new Set<string>();return new Set(rows.map((r:any)=>typeof r==="string"?r:r?.role_key).filter((r):r is string=>typeof r==="string"));}
function denied(code:string,message:string){return NextResponse.json({error:message,code,message},{status:403});}

export async function middleware(request:NextRequest){
  let response=NextResponse.next({request});
  const path=request.nextUrl.pathname;

  // The push worker authenticates itself inside the route handler with dedicated
  // server secrets. It must bypass both user-session and PWA workspace checks.
  if(path==="/api/internal/push/process")return response;

  response.headers.set("Cache-Control","private, no-store, max-age=0, must-revalidate");
  response.headers.set("Pragma","no-cache");
  response.headers.set("X-Content-Type-Options","nosniff");
  response.headers.set("Referrer-Policy","strict-origin-when-cross-origin");

  const supabase=createServerClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{cookies:{
    getAll:()=>request.cookies.getAll(),
    setAll(values){values.forEach(({name,value,options})=>{request.cookies.set(name,value);response.cookies.set(name,value,options);});}
  }});
  const {data:{user}}=await supabase.auth.getUser();
  const protectedPage=isInvestorPage(path)||isAdminPage(path)||isTraderPage(path);
  const protectedApi=isProtectedApi(path);

  if(!user){
    if(protectedApi||isPushApi(path))return denied("AUTH_REQUIRED","Authentication required.");
    if(protectedPage)return NextResponse.redirect(new URL("/login",request.url));
    return response;
  }
  if(path==="/login")return NextResponse.redirect(new URL("/dashboard",request.url));

  let roles=new Set<string>();
  if(protectedPage||protectedApi){
    const {data}=await supabase.rpc("zynth_get_my_roles",{p_user_id:user.id});
    roles=getRoleKeys(data);
  }
  const isAdmin=roles.has("admin"),isTrader=roles.has("trader"),isInvestor=roles.has("investor");
  if(isAdminPage(path)){if(!isAdmin)return NextResponse.redirect(new URL("/dashboard",request.url));return response;}
  if(isTraderPage(path)){if(!isTrader)return NextResponse.redirect(new URL("/dashboard",request.url));return response;}
  if(isInvestorPage(path)){
    if(!isInvestor){if(isAdmin)return NextResponse.redirect(new URL("/admin",request.url));if(isTrader)return NextResponse.redirect(new URL("/trader",request.url));return NextResponse.redirect(new URL("/login",request.url));}
    return response;
  }
  if(protectedApi){
    const valid=await validatePwaCredential(supabase,user.id,request.headers.get(PWA_TOKEN_HEADER));
    if(!valid)return denied("PWA_REQUIRED","Install and open ZYNTH as an app to access protected workspace features.");
    return response;
  }
  if(isPushApi(path))return response;
  return response;
}

export const config={matcher:["/dashboard/:path*","/admin/:path*","/trader/:path*","/api/:path*","/login"]};
