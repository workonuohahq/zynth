"use client";

import { FormEvent, useCallback, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import HumanCheck from "@/components/human-check";

export default function LoginForm({ initialMode = "login", referralCode = "", zpaCode = "" }: { initialMode?: "login" | "signup"; referralCode?: string; zpaCode?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [challengeId, setChallengeId] = useState("");
  const [answer, setAnswer] = useState("");
  const [refCode] = useState(referralCode || "");
  const [partnerCode] = useState(zpaCode || "");
  const onChallengeAnswer = useCallback((id: string, value: string) => { setChallengeId(id); setAnswer(value); }, []);

  async function applyAttribution(sessionUser?: any) {
    const metadata = sessionUser?.user_metadata || {};
    const code = refCode || localStorage.getItem("zynth_referral_code") || metadata.zynth_referral_code || "";
    if (code) {
      const r = await fetch("/api/referral", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({code}) }).catch(() => null);
      if (r?.ok) localStorage.removeItem("zynth_referral_code");
    }
  }

  async function applyZpaAttribution(sessionUser?: any) {
    const metadata = sessionUser?.user_metadata || {};
    const code = partnerCode || localStorage.getItem("zynth_zpa_code") || metadata.zynth_zpa_code || "";
    if (code) {
      const r = await fetch("/api/zpa/claim", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({code}) }).catch(() => null);
      if (r?.ok) localStorage.removeItem("zynth_zpa_code");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      if (refCode) localStorage.setItem("zynth_referral_code", refCode);
      if (partnerCode) localStorage.setItem("zynth_zpa_code", partnerCode);
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setMessage(error.message);
        else { await applyAttribution(data.user); await applyZpaAttribution(data.user); router.push("/dashboard"); }
      } else {
        const response = await fetch("/api/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, fullName: name, referralCode: refCode || localStorage.getItem("zynth_referral_code") || "", zpaCode: partnerCode, challengeId, answer })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          setMessage(result.error || "We could not create your account. Please try again.");
          if (result.code === "HUMAN_CHECK_FAILED" || result.code === "HUMAN_CHECK_REQUIRED") onChallengeAnswer("", "");
          return;
        }
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setMessage("Your account has been created. Sign in with your email and password to continue.");
          setMode("login");
          return;
        }
        await applyAttribution(data.user);
        await applyZpaAttribution(data.user);
        router.push("/dashboard");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to connect to ZYNTH right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="brand"><span className="brand-mark">Z</span><span>ZYNTH</span></div>
        <span className="eyebrow">{mode === "login" ? "SECURE ACCESS" : "CREATE YOUR ZYNTH ACCOUNT"}</span>
        <h1>{mode === "login" ? "Welcome back." : "Your next chapter starts here."}</h1>
        <p className="auth-copy">{mode === "login" ? "Sign in to access your ZYNTH workspace." : "One account. Clear visibility. Capital managed with structure."}</p>
        <form onSubmit={submit}>
          {mode === "signup" && <input autoComplete="name" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} required maxLength={120} />}
          <input autoComplete="email" type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} />
          <input autoComplete={mode === "login" ? "current-password" : "new-password"} type="password" placeholder="Password (minimum 8 characters)" minLength={8} value={password} onChange={e => setPassword(e.target.value)} required />
          {mode === "signup" && <HumanCheck onAnswer={onChallengeAnswer} />}
          <button className="primary auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create secure account"}</button>
        </form>
        {message && <div className="auth-message" role="alert">{message}</div>}
        <button className="switch" type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); setChallengeId(""); setAnswer(""); }}>
          {mode === "login" ? "New to ZYNTH? Create an account" : "Already have an account? Sign in"}
        </button>
        {mode === "signup" && <p className="auth-copy" style={{fontSize:10,marginTop:14}}>By creating an account, you agree to use ZYNTH responsibly. Email confirmation is not required; keep your login details secure.</p>}
      </div>
    </main>
  );
}
