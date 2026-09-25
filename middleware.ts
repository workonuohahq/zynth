import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
export async function middleware(request: NextRequest) {
 let response=NextResponse.next({request});
 const supabase=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{cookies:{getAll:()=>request.cookies.getAll(),setAll(values){values.forEach(({name,value,options})=>{request.cookies.set(name,value);response.cookies.set(name,value,options);});}}});
 const {data:{user}}=await supabase.auth.getUser();
 const path=request.nextUrl.pathname;
 if(!user&&(path.startsWith("/dashboard")||path.startsWith("/admin"))) return NextResponse.redirect(new URL("/login",request.url));
 if(user&&path==="/login") return NextResponse.redirect(new URL("/dashboard",request.url));
 return response;
}
export const config={matcher:["/dashboard/:path*","/admin/:path*","/login"]};