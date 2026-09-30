import LoginForm from "@/components/login-form";
export default async function JoinZpaPage({params}:{params:Promise<{zpaId:string}>}){
 const {zpaId}=await params;
 const code=decodeURIComponent(zpaId).trim().toUpperCase();
 if(!/^ZPA-[A-Z0-9]{10}$/.test(code)) return <main className="auth-shell"><div className="auth-card"><div className="brand"><span className="brand-mark">Z</span><span>ZYNTH</span></div><span className="eyebrow">ZPA ACQUISITION</span><h1>Invalid partner link.</h1><p className="auth-copy">This ZPA acquisition link is not valid. Please request the current link from the ZYNTH partner who shared it.</p></div></main>;
 return <LoginForm initialMode="signup" zpaCode={code}/>;
}