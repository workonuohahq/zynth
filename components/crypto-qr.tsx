"use client";
import {QRCodeSVG} from "qrcode.react";
export default function CryptoQr({value}:{value:string}){return <div style={{background:"#fff",padding:10,borderRadius:12,display:"inline-block"}}><QRCodeSVG value={value||"ZYNTH"} size={210} marginSize={3}/></div>}