import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function key(){
  const raw=process.env.ZYNTH_PROVIDER_SETTINGS_ENCRYPTION_KEY;
  if(!raw) throw new Error("ZYNTH_PROVIDER_SETTINGS_ENCRYPTION_KEY is not configured.");
  return createHash("sha256").update(raw).digest();
}
export function encryptProviderSecret(value:string){
  const plaintext=String(value||"").trim(); if(!plaintext)return null;
  const iv=randomBytes(12); const cipher=createCipheriv("aes-256-gcm",key(),iv);
  const ciphertext=Buffer.concat([cipher.update(plaintext,"utf8"),cipher.final()]);
  return [iv,cipher.getAuthTag(),ciphertext].map(x=>x.toString("base64url")).join(".");
}
export function decryptProviderSecret(value:string){
  if(!value)return "";
  const [ivB64,tagB64,cipherB64]=String(value).split(".");
  if(!ivB64||!tagB64||!cipherB64)throw new Error("Invalid encrypted provider secret.");
  const decipher=createDecipheriv("aes-256-gcm",key(),Buffer.from(ivB64,"base64url"));
  decipher.setAuthTag(Buffer.from(tagB64,"base64url"));
  return Buffer.concat([decipher.update(Buffer.from(cipherB64,"base64url")),decipher.final()]).toString("utf8");
}
export function maskSecret(value:string|null|undefined){const v=String(value||"");return v?(v.length<=8?"••••••••":"••••••••"+v.slice(-4)):"";}