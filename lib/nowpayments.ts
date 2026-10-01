import { createHmac } from "crypto";
import { decryptProviderSecret } from "@/lib/secure-provider-secrets";

export const NOWPAYMENTS_BASE="https://api.nowpayments.io/v1";
export const ZYNTH_FX_SOURCES=[
  "https://api.frankfurter.dev/v2/rate/usd/ngn?providers=cbn",
  "https://api.frankfurter.dev/v2/rates?base=usd&quotes=ngn&providers=cbn"
];

export async function getNowPaymentsSettings(adminClient:any){
  const {data,error}=await adminClient.from("zynth_payment_provider_settings").select("*").eq("provider","nowpayments").maybeSingle();
  if(error) throw error;
  if(!data) throw new Error("NOWPayments settings are not initialized.");
  return data;
}

export function requireApiKey(settings:any){
  if(!settings.api_key_ciphertext) throw new Error("NOWPayments API key is not configured.");
  return decryptProviderSecret(settings.api_key_ciphertext);
}

export function requireIpnSecret(settings:any){
  if(!settings.ipn_secret_ciphertext) throw new Error("NOWPayments IPN secret is not configured.");
  return decryptProviderSecret(settings.ipn_secret_ciphertext);
}

export async function nowRequest(path:string,apiKey:string,init:RequestInit={}){
  const headers=new Headers(init.headers);
  headers.set("x-api-key",apiKey);
  headers.set("accept","application/json");
  if(init.body) headers.set("content-type","application/json");
  const r=await fetch(NOWPAYMENTS_BASE+path,{...init,headers,cache:"no-store"});
  const body=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(String(body?.message||body?.error||`NOWPayments request failed (${r.status}).`));
  return body;
}

export function extractMerchantCurrencies(payload:any):string[]{
  const raw=Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.selectedCurrencies)
      ? payload.selectedCurrencies
      : Array.isArray(payload?.currencies)
        ? payload.currencies
        : Array.isArray(payload?.data)
          ? payload.data
          : [];
  return Array.from(new Set(raw.map((item:any)=>String(item?.currency||item?.code||item||"").trim().toLowerCase()).filter(Boolean)));
}

export function inferCurrencyName(code:string){
  const c=String(code||"").toLowerCase();
  const names:any={
    btc:"Bitcoin",eth:"Ethereum",trx:"TRON",sol:"Solana",ltc:"Litecoin",bch:"Bitcoin Cash",doge:"Dogecoin",xrp:"XRP",ada:"Cardano",xmr:"Monero",
    usdt:"Tether",usdttrc20:"Tether",usdtbsc:"Tether",usdterc20:"Tether",usdtsol:"Tether",usdtmatic:"Tether",
    usdc:"USD Coin",usdcspl:"USD Coin",usdcmatic:"USD Coin"
  };
  return names[c]||c.toUpperCase();
}

export function inferCurrencyNetwork(code:string){
  const c=String(code||"").toLowerCase();
  if(c.endsWith("trc20")) return "TRON";
  if(c.endsWith("bsc")) return "BNB Smart Chain";
  if(c.endsWith("erc20")) return "Ethereum";
  if(c.endsWith("sol")) return "Solana";
  if(c.endsWith("matic")) return "Polygon";
  if(c.endsWith("spl")) return "Solana";
  if(["btc","eth","trx","sol","ltc","bch","doge","xrp","ada","xmr","usdc","usdt"].includes(c)) return c==="eth"?"Ethereum":c==="btc"?"Bitcoin":c==="trx"?"TRON":c==="sol"?"Solana":c==="ltc"?"Litecoin":c==="bch"?"Bitcoin Cash":c==="doge"?"Dogecoin":c==="xrp"?"XRP":c==="ada"?"Cardano":c==="xmr"?"Monero":"Native";
  return "Network";
}

export function sortObject(value:any):any{
  if(Array.isArray(value)) return value.map(sortObject);
  if(value&&typeof value==="object") return Object.keys(value).sort().reduce((out,key)=>{out[key]=sortObject(value[key]);return out},{} as any);
  return value;
}

export function verifyNowPaymentsSignature(payload:any,signature:string,secret:string){
  const expected=createHmac("sha512",secret).update(JSON.stringify(sortObject(payload))).digest("hex");
  return expected===String(signature||"").trim();
}

export function normalizeNowStatus(status:string){
  const s=String(status||"").toLowerCase();
  if(["waiting","confirming","confirmed","finished","failed","expired","refunded","partially_paid","sending"].includes(s)) return s;
  return s||"unknown";
}

export async function getLiveUsdNgnRate(){
  for(const url of ZYNTH_FX_SOURCES){
    try{
      const r=await fetch(url,{cache:"no-store",headers:{accept:"application/json"}});
      if(!r.ok) continue;
      const body=await r.json();
      const rate=Number(
        body?.rate ??
        body?.rates?.NGN ??
        (Array.isArray(body) ? body.find((row:any)=>String(row?.quote||"").toUpperCase()==="NGN")?.rate : undefined)
      );
      if(Number.isFinite(rate)&&rate>0){
        return {rate,source:"frankfurter-cbn",capturedAt:new Date().toISOString()};
      }
    }catch{}
  }
  throw new Error("Live NGN/USD FX rate is temporarily unavailable.");
}

export async function getNowPaymentsMinAmount(apiKey:string,payCurrency:string,fixedRate=false,feePaidByUser=false){
  const q=new URLSearchParams({
    currency_from:"usd",
    currency_to:payCurrency,
    fiat_equivalent:"usd",
    is_fixed_rate:String(Boolean(fixedRate)),
    is_fee_paid_by_user:String(Boolean(feePaidByUser))
  });
  const result=await nowRequest("/min-amount?"+q.toString(),apiKey);
  const minimum=Number(result?.fiat_equivalent??result?.min_amount);
  if(!Number.isFinite(minimum)||minimum<0) throw new Error("Invalid NOWPayments minimum amount.");
  return {minimum,raw:result};
}
