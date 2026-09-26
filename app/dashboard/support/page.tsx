import {createSupabaseServerClient} from "@/lib/supabase/server";
import {redirect} from "next/navigation";
import SupportCenter from "@/components/support-center";
export default async function SupportPage(){const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect("/login");return <SupportCenter/>}