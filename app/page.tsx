import Link from "next/link";
import { ArrowRight, LockKeyhole, ShieldCheck, Zap } from "lucide-react";

export default function Home({ searchParams }: { searchParams?: { error?: string; error_code?: string; error_description?: string } }) {
  if (searchParams?.error || searchParams?.error_code) {
    const expired = searchParams.error_code === "otp_expired";
    return (
      <main className="auth-shell auth-result-shell">
        <div className="auth-card auth-result-card">
          <div className="brand"><span className="brand-mark">Z</span><span>ZYNTH</span></div>
          <span className="eyebrow">{expired ? "EMAIL CONFIRMATION" : "SECURE ACCESS"}</span>
          <div className="auth-result-icon">{expired ? "!" : "×"}</div>
          <h1>{expired ? "That confirmation link has expired." : "We couldn't complete that request."}</h1>
          <p className="auth-copy">{expired ? "For your security, ZYNTH confirmation links can only be used for a limited time and only once. Request a fresh confirmation email and use the newest link." : "The link you followed is no longer valid. Please return to ZYNTH and request a fresh confirmation email."}</p>
          <div className="auth-result-note"><b>Nothing is wrong with your ZYNTH account.</b><span>You can safely return to sign in or create a fresh confirmation request.</span></div>
          <div className="auth-result-actions">
            <Link href="/login?mode=signup" className="primary auth-submit">Return to ZYNTH</Link>
            <Link href="/login" className="switch">Sign in instead</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="landing">
      <header className="landing-nav">
        <Link href="/" className="brand landing-brand"><span className="brand-mark">Z</span><span>ZYNTH</span></Link>
        <div className="landing-actions">
          <Link href="/login" className="text-link">Sign in</Link>
          <Link href="/login?mode=signup" className="landing-cta">Create account <ArrowRight size={15}/></Link>
        </div>
      </header>
      <section className="landing-hero">
        <div className="hero-copy">
          <span className="eyebrow">FOCUSED WEALTH BUILDING</span>
          <h1>Build wealth.<br/><em>In focused cycles.</em></h1>
          <p>Put idle cash into structured 5-day saving cycles, track every position from one secure dashboard, and build your financial discipline one cycle at a time.</p>
          <div className="hero-actions">
            <Link href="/login?mode=signup" className="primary landing-primary">Start building <ArrowRight size={16}/></Link>
            <Link href="/login" className="secondary-cta">I already have an account</Link>
          </div>
          <div className="trust-row">
            <span><ShieldCheck size={15}/> Secure account</span><span><LockKeyhole size={15}/> Protected access</span><span><Zap size={15}/> 5-day cycles</span>
          </div>
        </div>
        <div className="landing-visual"><div className="visual-glow"/><div className="vault-preview">
          <div className="preview-top"><span>YOUR PORTFOLIO</span><span className="preview-dot"/></div><strong>₦0.00</strong><div className="preview-line"/>
          <div className="preview-grid"><div><small>AVAILABLE</small><b>₦0.00</b></div><div><small>LOCKED</small><b>₦0.00</b></div></div>
          <div className="preview-cycle"><span>5-DAY YIELD VAULT</span><b>READY</b></div>
        </div></div>
      </section>
      <section className="landing-features">
        <div><span>01</span><h3>Start with structure.</h3><p>Choose a cycle from your wallet and know exactly when it matures.</p></div>
        <div><span>02</span><h3>Track everything.</h3><p>Your balances, vaults and transactions stay visible in one place.</p></div>
        <div><span>03</span><h3>Keep building.</h3><p>Repeat disciplined cycles as your ZYNTH journey grows.</p></div>
      </section>
      <footer className="landing-footer"><span>© 2026 ZYNTH</span><span>BUILD BEYOND.</span></footer>
    </main>
  );
}
