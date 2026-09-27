"use client";

import {
  ArrowRight,
  CheckCircle2,
  LockKeyhole,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function getNextPath() {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export default function InstallPage() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [nextPath, setNextPath] = useState("/dashboard");

  useEffect(() => {
    setNextPath(getNextPath());

    if (isStandalone()) {
      setInstalled(true);
      setChecking(false);
      return;
    }

    const onPrompt = (event: BeforeInstallPromptEvent) => {
      event.preventDefault();
      setInstallPrompt(event);
      setChecking(false);
    };

    const onInstalled = () => {
      setInstalled(true);
      setInstalling(false);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    const timer = window.setTimeout(() => setChecking(false), 900);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const destinationLabel = useMemo(
    () => (nextPath.startsWith("/trader") ? "Trader Desk" : "Investor Dashboard"),
    [nextPath]
  );

  async function install() {
    if (!installPrompt) return;

    setInstalling(true);
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;

    if (choice.outcome === "dismissed") {
      setInstalling(false);
      return;
    }

    setInstallPrompt(null);
    setInstalling(false);
  }

  return (
    <main className="pwa-gate">
      <div className="pwa-gate-glow" aria-hidden="true" />

      <section className="pwa-gate-card pwa-install-premium" aria-labelledby="pwa-install-title">
        <div className="pwa-premium-topline">
          <div className="pwa-brand">
            <span className="pwa-brand-mark">Z</span>
            <span>ZYNTH</span>
          </div>
          <span className="pwa-secure-status">
            <span className="pwa-status-dot" />
            PRIVATE ACCESS
          </span>
        </div>

        <div className="pwa-hero-mark">
          <div className="pwa-hero-ring pwa-ring-one" />
          <div className="pwa-hero-ring pwa-ring-two" />
          <div className="pwa-hero-icon">
            <Smartphone size={30} strokeWidth={1.5} />
          </div>
        </div>

        <span className="pwa-eyebrow">
          <ShieldCheck size={13} />
          SECURE WORKSPACE
        </span>

        <h1 id="pwa-install-title">
          ZYNTH belongs
          <br />
          on your device.
        </h1>

        <p className="pwa-copy">
          Your {destinationLabel.toLowerCase()} is a private workspace. Install ZYNTH once,
          then open it from your home screen for a focused, app-like experience.
        </p>

        <div className="pwa-benefits pwa-benefits-premium">
          <div>
            <span className="pwa-benefit-icon"><LockKeyhole size={15} /></span>
            <span><b>Private workspace</b><small>Protected access to your ZYNTH environment</small></span>
            <CheckCircle2 size={15} />
          </div>
          <div>
            <span className="pwa-benefit-icon"><Zap size={15} /></span>
            <span><b>Faster access</b><small>Launch directly from your home screen</small></span>
            <CheckCircle2 size={15} />
          </div>
          <div>
            <span className="pwa-benefit-icon"><Sparkles size={15} /></span>
            <span><b>Built for focus</b><small>A clean, dedicated ZYNTH experience</small></span>
            <CheckCircle2 size={15} />
          </div>
        </div>

        {checking ? (
          <div className="pwa-checking" aria-live="polite">
            <span />
            Preparing your secure installation…
          </div>
        ) : installed ? (
          <div className="pwa-ios-guide pwa-success-guide">
            <div className="pwa-guide-icon"><CheckCircle2 size={17} /></div>
            <div>
              <b>ZYNTH is installed</b>
              <p>Open ZYNTH from your home screen or app launcher to continue to your workspace.</p>
            </div>
          </div>
        ) : installPrompt ? (
          <button
            className="pwa-install-btn pwa-install-premium-btn"
            onClick={install}
            disabled={installing}
          >
            <span className="pwa-install-btn-label">{installing ? "Opening installation…" : "Install ZYNTH App"}</span>
            {!installing && <ArrowRight size={16} />}
          </button>
        ) : (
          <div className="pwa-ios-guide pwa-manual-guide">
            <div className="pwa-guide-icon"><Smartphone size={17} /></div>
            <div>
              <b>Install from your browser</b>
              <p>
                Chrome or Edge: open the browser menu and choose <strong>Install app</strong> or
                <strong> Add to Home screen</strong>. On iPhone/iPad Safari: Share → Add to Home Screen.
              </p>
            </div>
          </div>
        )}

        <Link href={nextPath} className="pwa-secondary-link">
          Continue in browser
          <ArrowRight size={14} />
        </Link>

        <div className="pwa-trust-footer">
          <span><ShieldCheck size={12} /> ZYNTH secure access</span>
          <span>•</span>
          <span>One-time installation</span>
        </div>

        <small className="pwa-footnote">
          For security, protected workspace access is available through the installed ZYNTH app.
        </small>
      </section>
    </main>
  );
}