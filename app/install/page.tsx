"use client";

import { Download, ShieldCheck, Smartphone, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

declare global {
  interface WindowEventMap { beforeinstallprompt: BeforeInstallPromptEvent; }
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  }
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

export default function InstallPage() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone()) setInstalled(true);
    const onPrompt = (event: BeforeInstallPromptEvent) => { event.preventDefault(); setInstallPrompt(event); };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  return (
    <main className="pwa-install-page">
      <section className="pwa-install-card">
        <div className="pwa-brand"><span className="pwa-brand-mark">Z</span><span>ZYNTH</span></div>
        <div className="pwa-icon"><Smartphone size={28} strokeWidth={1.7} /></div>
        <span className="pwa-eyebrow"><ShieldCheck size={13} /> SECURE APP ACCESS</span>
        <h1>Install ZYNTH to access your dashboard.</h1>
        <p className="pwa-copy">Investor dashboard access is available through the installed ZYNTH app. Your normal browser remains available for account access and installation.</p>
        {installed ? (
          <div className="pwa-ios-guide"><b>ZYNTH is installed on this device.</b><p>Open ZYNTH from your home screen or app launcher, then continue to your dashboard.</p></div>
        ) : installPrompt ? (
          <button className="pwa-install-btn" onClick={install}><Download size={18} /> Install ZYNTH</button>
        ) : (
          <div className="pwa-ios-guide"><b>Install from your browser menu</b><p>On Chrome or Edge, use the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>. On iPhone/iPad Safari, use Share → Add to Home Screen.</p></div>
        )}
        <Link href="/login" className="pwa-secondary-link">Return to account access <ArrowRight size={14} /></Link>
        <small className="pwa-footnote">After installation, launch ZYNTH from the installed app to enter the protected dashboard.</small>
      </section>
    </main>
  );
}