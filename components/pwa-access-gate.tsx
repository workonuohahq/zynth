"use client";

import { useEffect, useState } from "react";
import { Download, ExternalLink, ShieldCheck, Smartphone, Sparkles } from "lucide-react";

type InstallState = "checking" | "installable" | "ios" | "installed" | "unsupported";

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  }
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function PwaAccessGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<InstallState>("checking");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const standalone = isStandalone();
    if (standalone) {
      setState("installed");
      return;
    }

    const onBeforeInstallPrompt = (event: BeforeInstallPromptEvent) => {
      event.preventDefault();
      setInstallPrompt(event);
      setState("installable");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    const timer = window.setTimeout(() => {
      if (isStandalone()) setState("installed");
      else if (isIOS()) setState("ios");
      else setState("unsupported");
    }, 1200);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }

    const onVisibility = () => {
      if (isStandalone()) setState("installed");
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    setBusy(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setState("checking");
        window.setTimeout(() => {
          if (isStandalone()) setState("installed");
          else setState("checking");
        }, 700);
      }
    } finally {
      setBusy(false);
    }
  }

  if (state === "installed") return <>{children}</>;

  return (
    <div className="pwa-gate">
      <div className="pwa-gate-glow" />
      <div className="pwa-gate-card">
        <div className="pwa-brand"><span className="pwa-brand-mark">Z</span><span>ZYNTH</span></div>
        <div className="pwa-icon"><Smartphone size={28} strokeWidth={1.7} /></div>
        <span className="pwa-eyebrow"><ShieldCheck size={13} /> SECURE APP ACCESS</span>
        <h1>Install ZYNTH to continue.</h1>
        <p className="pwa-copy">Your investment dashboard is designed to run from the installed ZYNTH app for a focused, app-like experience.</p>

        <div className="pwa-benefits">
          <div><Sparkles size={16} /><span>Faster access to your portfolio</span></div>
          <div><ShieldCheck size={16} /><span>Dedicated app environment</span></div>
          <div><ExternalLink size={16} /><span>Ready for account notifications</span></div>
        </div>

        {state === "installable" && (
          <button className="pwa-install-btn" onClick={install} disabled={busy}>
            <Download size={18} />
            {busy ? "Opening installer…" : "Install ZYNTH"}
          </button>
        )}

        {state === "ios" && (
          <div className="pwa-ios-guide">
            <b>Install on iPhone or iPad</b>
            <p>Tap <strong>Share</strong> in Safari, choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</p>
          </div>
        )}

        {state === "unsupported" && (
          <div className="pwa-ios-guide">
            <b>Use an install-capable browser</b>
            <p>Open ZYNTH in the latest Chrome, Edge or Safari, then install it from the browser's app menu.</p>
          </div>
        )}

        {state === "checking" && <div className="pwa-checking"><span /> Preparing your secure app access…</div>}

        <small className="pwa-footnote">You can reinstall ZYNTH at any time if the app is removed from your device.</small>
      </div>
    </div>
  );
}