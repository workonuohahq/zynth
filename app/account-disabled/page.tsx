import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default function AccountDisabledPage(){
 return <main className="account-status-page"><div className="account-status-card"><span className="account-status-icon"><ShieldAlert size={24}/></span><span className="eyebrow">ZYNTH / ACCOUNT</span><h1>Account access is unavailable.</h1><p>Your account has been suspended or deactivated by an administrator. Your financial history is retained. Contact support if you need a review.</p><Link href="/login" className="fund-btn">Return to sign in</Link></div></main>;
}