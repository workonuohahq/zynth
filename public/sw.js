const CACHE_NAME="zynth-shell-v1";
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
self.addEventListener("push",event=>{
  let data={};
  try{data=event.data?event.data.json():{body:event.data?event.data.text():""}}catch{data={}};
  const title=data.title||"ZYNTH";
  const options={body:data.body||"You have a new ZYNTH notification.",icon:data.icon||"/icons/zynth-icon.svg",badge:data.badge||"/icons/zynth-icon.svg",tag:data.tag||"zynth-notification",renotify:true,data:{url:data.url||"/dashboard/notifications"}};
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const target=event.notification.data?.url||"/dashboard/notifications";
  event.waitUntil((async()=>{
    const list=await clients.matchAll({type:"window",includeUncontrolled:true});
    for(const client of list){if("focus" in client){await client.focus();if("navigate" in client)await client.navigate(target);return;}}
    if(clients.openWindow)await clients.openWindow(target);
  })());
});