import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import ReferralPage from "@/components/referral-page";
export default async function ReferralsPage(){
 const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect("/login");
 const {data:roles}=await s.rpc("zynth_get_my_roles",{p_user_id:user.id});
 if(Array.isArray(roles)&&roles.includes("zpa")) redirect("/dashboard/zpa");
 return <ReferralPage/>;
}