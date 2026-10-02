"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const ZYNTH_PUBLIC_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://zynthhq.vercel.app";

export default function ConfirmedClient({ email }: { email: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "waiting" | "confirmed">("checking");
  const [message, setMessage] = useState("");

  async function applyStoredAttribution(sessionUser?: any) {
    const metadata = sessionUser?.user_metadata || {};
    const referral = localStorage.getItem("zynth_referral_code") || metadata.zynth_referral_code || "";
    const zpa = localStorage.getItem("zynth_zpa_code") || metadata.zynth_zpa_code || "";
    if (referral) {
      const r = await fetch("/api/referral", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({code:referral}) }).catch(() => null);
      if (r?.ok) localStorage.removeItem("zynth_referral_code");
    }
    if (zpa) {
      const r = await fetch("/api/zpa/claim", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({code:zpa}) }).catch(() => null);
      if (r?.ok) localStorage.removeItem("zynth_zpa_code");
    }
  }

  useEffect(() => {
    let mounted = true;
    const supabase = createSupabaseBrowserClient();

    async function finish(session: any) {
      if (!mounted || !session) return;
      await applyStoredAttribution(session.user);
      if (!mounted) return;
      setStatus("confirmed");
      router.replace("/dashboard");
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const errorCode = params.get("error_code");
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const hashErrorCode = hash.get("error_code");

    async function handleConfirmation() {
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setStatus("waiting");
          setMessage("This confirmation link is no longer valid. Please request a new confirmation email.");
          return;
        }
        if (data.session) {
          await finish(data.session);
          return;
        }
      }
      if (errorCode || hashErrorCode) {
        setStatus("waiting");
        setMessage("This confirmation link has expired or is no longer valid. Please request a new confirmation email.");
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (data.session) void finish(data.session);
      else setStatus("waiting");
    }

    void handleConfirmation();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && mounted) void finish(session);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  async function resend() {
    if (!email) {
      setMessage("Return to sign up and enter your email address again.");
      return;
    }
    setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${ZYNTH_PUBLIC_ORIGIN}/auth/confirmed` }
    });
    setMessage(error ? error.message : "A new confirmation email has been sent.");
  }

  if (status === "checking" || status === "confirmed") {
    return (
      <main className="auth-shell"><div className="auth-card">
        <div className="brand"><span className="brand-mark">Z</span><span>ZYNTH</span></div>
        <span className="eyebrow">EMAIL CONFIRMATION</span>
        <h1>{status === "confirmed" ? "Email confirmed." : "Checking your email…"}</h1>
        <p className="auth-copy">{status === "confirmed" ? "Your account is confirmed. Taking you to your dashboard." : "Please wait while ZYNTH checks your confirmation status."}</p>
      </div></main>
    );
  }

  return (
    <main className="auth-shell"><div className="auth-card">
      <div className="brand"><span className="brand-mark">Z</span><span>ZYNTH</span></div>
      <span className="eyebrow">EMAIL CONFIRMATION</span>
      <h1>Check your inbox.</h1>
      <p className="auth-copy">We sent a confirmation link to <strong>{email || "your email address"}</strong>. Open it to activate your ZYNTH account.</p>
      <div className="auth-message">The confirmation link will return you to ZYNTH automatically.</div>
      <button className="primary auth-submit" onClick={resend}>Resend confirmation email</button>
      {message && <div className="auth-message">{message}</div>}
      <button className="switch" onClick={() => router.push("/login")}>Back to sign in</button>
    </div></main>
  );
}
