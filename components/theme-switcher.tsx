"use client";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export default function ThemeSwitcher(){
 const [light,setLight]=useState(false); const [show,setShow]=useState(false);
 useEffect(()=>{const saved=localStorage.getItem("zynth-theme"); const isLight=saved==="light"; setLight(isLight); document.documentElement.dataset.theme=isLight?"light":"dark";},[]);
 const toggle=()=>{const next=!light; setLight(next); localStorage.setItem("zynth-theme",next?"light":"dark"); document.documentElement.dataset.theme=next?"light":"dark"; setShow(true); window.setTimeout(()=>setShow(false),3200);};
 return <><button className="theme-switch" onClick={toggle} aria-label={light?"Switch to dark mode":"Switch to light mode"} title={light?"Switch to dark mode":"Switch to light mode"}><span className="theme-switch-icon">{light?<Sun size={15}/>:<Moon size={15}/>}</span><span className="theme-switch-label">{light?"LIGHT":"DARK"}</span><span className="theme-switch-knob"/></button>{show&&<div className="theme-switch-toast" role="status"><strong>{light?"Daylight unlocked.":"Back to the vault."}</strong><span>{light?"ZYNTH just opened the curtains — same discipline, brighter room.":"The vault doors are closing — quiet compounding looks good in the dark."}</span></div>}</>;
}
