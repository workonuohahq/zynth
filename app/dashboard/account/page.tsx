import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, ShieldCheck, UserRound, CheckCircle2 } from "lucide-react";
import LogoutButton from "@/components/logout-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AccountPage(){
 const supabase=await createSupabaseServerClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user)redirect("/login");
 const {data:profile}=await supabase.from("users").select("full_name,email,role,kyc_verified,created_at").eq("id",user.id).single();
 return <section className="dashboard-content">
  <header className="dashboard-header"><div><span className="eyebrow">ZYNTH / ACCOUNT</span><h1>Account settings.</h1><p>Your identity, access and account protection details.</p></div><Link className="fund-btn secondary-dark" href="/dashboard"><ArrowLeft size={16}/> Overview</Link></header>
  <div className="account-page-grid">
   <section className="panel profile-card"><div className="profile-avatar"><UserRound size={24}/></div><span className="muted">PROFILE</span><h2>{profile?.full_name||"ZYNTH user"}</h2><div className="profile-field"><Mail size={16}/><div><small>Email address</small><b>{profile?.email||user.email}</b></div></div><div className="profile-field"><ShieldCheck size={16}/><div><small>Account role</small><b>{profile?.role==="zpa"?"ZPA Agent":"Personal account"}</b></div></div><div className="profile-field"><CheckCircle2 size={16}/><div><small>Identity verification</small><b>{profile?.kyc_verified?"Verified":"Pending"}</b></div></div></section>
   <section className="panel"><span className="muted">SECURITY</span><h2>Account protection</h2><div className="security-item"><ShieldCheck size={18}/><div><b>Authenticated session</b><small>Your dashboard is protected by Supabase authentication.</small></div><span>Active</span></div><div className="security-item"><Mail size={18}/><div><b>Email access</b><small>Use your verified email address to sign in.</small></div><span>Enabled</span></div><div className="account-note">For security, sensitive balance operations are validated on the server rather than trusted to the browser.</div>
   <div className="account-logout-card">
    <div className="account-logout-copy">
      <div className="account-logout-icon"><ShieldCheck size={18}/></div>
      <div><span className="account-logout-kicker">SESSION CONTROL</span><b>Sign out of ZYNTH</b><small>Securely end this session on the device you're using.</small></div>
    </div>
    <LogoutButton />
   </div></section>
  </div>
 </section>
}