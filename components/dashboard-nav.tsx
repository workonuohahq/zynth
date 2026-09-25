"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, Home, LogOut, ShieldCheck, UserRound, Vault } from "lucide-react";
const links=[{href:"/dashboard",label:"Overview",icon:Home},{href:"/dashboard/vaults",label:"Vaults",icon:Vault},{href:"/dashboard/transactions",label:"Transactions",icon:CreditCard}];
export default function DashboardNav(){
 const pathname=usePathname();
 return <><aside className="dashboard-sidebar"><Link href="/dashboard" className="brand"><span className="brand-mark">Z</span><span>ZYNTH</span></Link><div className="side-label">PERSONAL</div><nav className="dashboard-links">{links.map(({href,label,icon:Icon})=><Link key={href} href={href} className={"nav-item "+(pathname===href?"active":"")}><Icon size={17}/><span>{label}</span></Link>)}</nav><div className="side-bottom"><div className="secure"><ShieldCheck size={15}/><span>Protected session</span></div><form action="/auth/signout" method="post"><button className="profile-mini"><span className="avatar"><UserRound size={14}/></span><span><b>My account</b><small>Sign out</small></span><LogOut size={14}/></button></form></div></aside><nav className="mobile-nav">{links.map(({href,label,icon:Icon})=><Link key={href} href={href} className={pathname===href?"active":""}><Icon size={19}/><span>{label}</span></Link>)}</nav></>;
}