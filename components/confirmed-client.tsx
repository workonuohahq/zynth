"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function ConfirmedClient({ email }: { email: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "waiting" | "confirmed">("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    const supabase = createSupabaseBrowserClient();

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) {
        setStatus("confirmed");
        router.replace("/dashboard");
      } else {
        setStatus("waiting");
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && mounted) {
        setStatus("confirmed");
        router.replace("/dashboard");
      }
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
      options: { emailRedirectTo: `${window.location.origin}/auth/confirmed` }
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
