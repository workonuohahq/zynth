const url=process.env.ZYNTH_PUSH_WORKER_URL;
const secret=process.env.ZYNTH_PUSH_WORKER_SECRET;
if(!url||!secret)throw new Error("ZYNTH_PUSH_WORKER_URL and ZYNTH_PUSH_WORKER_SECRET are required");
const response=await fetch(url,{method:"POST",headers:{"x-zynth-push-secret":secret}});
const body=await response.text();
if(!response.ok)throw new Error("Push worker failed ("+response.status+"): "+body);
console.log(body);
