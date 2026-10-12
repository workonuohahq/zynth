"use client";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck, Eye, Type } from "lucide-react";

type SymbolOption={id:string;label:string;glyph:string};
type Challenge={enabled:boolean;id:string;type:string;prompt:string;sequence:SymbolOption[];options:SymbolOption[];expiresIn:number};
export default function HumanCheck({onAnswer}:{onAnswer:(challengeId:string,answer:string)=>void}) {
  const [challenge,setChallenge]=useState<Challenge|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [selected,setSelected]=useState("");
  const [textMode,setTextMode]=useState(false);
  const load=useCallback(async(mode=textMode?"text":"visual")=>{
    setLoading(true);setError("");setSelected("");onAnswer("","");
    try {
      const response=await fetch("/api/human-check/challenge?mode="+mode,{cache:"no-store"});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||"Human verification is unavailable.");
      if(data.enabled===false){setChallenge(null);return;}
      setChallenge(data);
    } catch(e) {setChallenge(null);setError(e instanceof Error?e.message:"Human verification is unavailable.");}
    finally {setLoading(false);}
  },[onAnswer,textMode]);
  useEffect(()=>{void load()},[load]);
  function choose(option:SymbolOption){setSelected(option.id);if(challenge)onAnswer(challenge.id,option.id)}
  return <section className="zhc-card" aria-label="ZYNTH Human Check">
    <div className="zhc-head"><span className="zhc-emblem"><ShieldCheck size={17}/></span><div><b>ZYNTH Human Check</b><small>HUMAN AUTHENTICATION PROTOCOL</small></div><span className="zhc-secure">SECURE</span></div>
    {loading?<div className="zhc-loading"><span className="zhc-spinner"/>Preparing your challenge…</div>:error?<div className="zhc-error" role="alert">{error}<button type="button" onClick={()=>void load()}><RefreshCw size={13}/> Try again</button></div>:challenge&&<>
      <p className="zhc-prompt">{challenge.prompt}</p>
      <div className="zhc-sequence" aria-label="Challenge sequence">{challenge.sequence.map((s,i)=><div className="zhc-symbol" key={i}><span aria-hidden="true">{s.glyph}</span><small>{textMode?s.label:""}</small></div>)}{challenge.type==="pattern"&&<div className="zhc-symbol zhc-unknown" aria-label="Missing next symbol">?</div>}</div>
      <div className="zhc-options" role="group" aria-label="Choose the correct answer">{challenge.options.map(s=><button type="button" key={s.id} className={"zhc-option"+(selected===s.id?" selected":"")} onClick={()=>choose(s)} aria-label={s.label} aria-pressed={selected===s.id}><span aria-hidden="true">{s.glyph}</span><small>{s.label}</small></button>)}</div>
      <div className="zhc-footer"><span>Challenge expires in 2 minutes · One use only</span><button type="button" onClick={()=>void load()} aria-label="Get a new challenge"><RefreshCw size={13}/> New challenge</button></div>
    </>}
    <button className="zhc-mode" type="button" onClick={()=>{setTextMode(v=>!v);}}><{textMode?"Eye":"Type"} size={13}/>{textMode?"Use visual challenge":"Prefer a text challenge?"}</button>
  </section>;
}
