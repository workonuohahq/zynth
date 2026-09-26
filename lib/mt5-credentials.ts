import crypto from "node:crypto";

const getKey=()=>crypto.createHash("sha256").update(process.env.MT5_CREDENTIALS_ENCRYPTION_KEY||"").digest();

export function encryptMt5Secret(value:string){
  if(!process.env.MT5_CREDENTIALS_ENCRYPTION_KEY) throw new Error("MT5 credentials encryption is not configured.");
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv("aes-256-gcm",getKey(),iv);
  const ciphertext=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  const tag=cipher.getAuthTag();
  return ["v1",iv.toString("base64url"),tag.toString("base64url"),ciphertext.toString("base64url")].join(".");
}

export function decryptMt5Secret(payload:string){
  if(!process.env.MT5_CREDENTIALS_ENCRYPTION_KEY) throw new Error("MT5 credentials encryption is not configured.");
  const [version,ivRaw,tagRaw,dataRaw]=String(payload||"").split(".");
  if(version!=="v1"||!ivRaw||!tagRaw||!dataRaw) throw new Error("Invalid MT5 credential payload.");
  const decipher=crypto.createDecipheriv("aes-256-gcm",getKey(),Buffer.from(ivRaw,"base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw,"base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw,"base64url")),decipher.final()]).toString("utf8");
}
