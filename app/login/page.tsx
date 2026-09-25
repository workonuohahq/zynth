"use client";

import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup">(searchParams.get("mode") === "signup" ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      // Create the browser client only in the browser event handler.
      // This keeps Next.js static prerendering from requiring Supabase
      // environment variables during the build step.
      const supabase = createSupabaseBrowserClient();

      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setMessage(error.message);
        else router.push("/dashboard");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } }
        });

        if (error) {
          setMessage(error.message);
        } else if (data.session) {
          router.push("/dashboard");
        } else {
          setMessage("Account created. Check your email to confirm your account.");
        }
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
        <span className="eyebrow">SECURE ACCESS</span>
        <h1>{mode === "login" ? "Welcome back." : "Create your account."}</h1>
        <p className="auth-copy">Your wealth dashboard, built around focused saving cycles.</p>

        <form onSubmit={submit}>
          {mode === "signup" && (
            <input
              placeholder="Full name"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          )}
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            minLength={8}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <button className="primary auth-submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        {message && <div className="auth-message">{message}</div>}

        <button
          className="switch"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setMessage("");
          }}
        >
          {mode === "login" ? "New to ZYNTH? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
