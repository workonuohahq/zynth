"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Mail, RefreshCw, ShieldCheck } from "lucide-react";

const ZYNTH_PUBLIC_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://zynthhq.vercel.app";

export default function VerificationRequiredClient({ email }: { email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setCooldown(v => Math.max(0, v - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function checkVerification() {
    setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { data: status } = await supabase.rpc("zynth_get_email_verification_status");
    if (status?.verified) {
      router.replace("/dashboard");
    } else {
      setMessage("Your email is still awaiting verification. Open the newest ZYNTH email, then return here.");
    }
  }

  async function resend() {
    if (busy || cooldown) return;
    setBusy(true);
    setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    const target = user?.email || email;
    if (!target) {
      setMessage("We could not determine your email address. Please sign in again.");
      setBusy(false);
      return;
    }
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: target,
      options: { emailRedirectTo: `${ZYNTH_PUBLIC_ORIGIN}/auth/confirmed` }
    });
    setMessage(error ? error.message : "A fresh verification email has been sent. Check your inbox and spam folder.");
    if (!error) setCooldown(60);
    setBusy(false);
  }

  return (
    <main className="auth-shell">
      <div className="auth-card verification-required-card">
        <div className="brand"><span className="brand-mark">Z</span><span>ZYNTH</span></div>
        <span className="eyebrow">SECURE ACCESS</span>
        <div className="verification-required-icon"><Mail size={24}/></div>
        <h1>Verify your email to continue.</h1>
        <p className="auth-copy">Your ZYNTH workspace is temporarily locked until your email address is verified.</p>
        <div className="verification-required-address">
          <span>VERIFICATION EMAIL</span>
          <b>{email || "Your registered email address"}</b>
        </div>
        <div className="verification-required-note">
          <ShieldCheck size={16}/>
          <div><b>Why you're seeing this</b><span>ZYNTH requires a verified email before dashboard and trading workspace access is enabled.</span></div>
        </div>
        {message && <div className="auth-message">{message}</div>}
        <button className="primary auth-submit" onClick={resend} disabled={busy || cooldown > 0}>
          {busy ? "Sending…" : cooldown ? `Resend available in ${cooldown}s` : "Resend verification email"}
        </button>
        <button className="switch verification-check" onClick={checkVerification} disabled={busy}><RefreshCw size={13}/> I have verified my email</button>
        <form action="/auth/signout" method="post"><button className="switch" type="submit">Sign out</button></form>
      </div>
    </main>
  );
}
