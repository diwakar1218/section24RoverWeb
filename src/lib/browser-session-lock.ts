const prefix="survey.auth.lock.";
type Ticket={number:number;choosing:boolean;expires:number};
const pause=()=>new Promise<void>(resolve=>setTimeout(resolve,30));

// Web Locks needs a secure origin. The fallback also coordinates HTTP LAN sites;
// storage contains only temporary lock tickets, never credentials or tokens.
async function storageLock<T>(operation:()=>Promise<T>):Promise<T> {
  let storage:Storage;
  try {storage=window.localStorage;const probe=prefix+"probe";storage.setItem(probe,"1");storage.removeItem(probe);} catch {return operation();}
  const id=`${Date.now()}_${Math.random().toString(36).slice(2)}`,key=prefix+id;
  const read=():[string,Ticket][]=>{
    const records:[string,Ticket][]=[];
    for(let i=0;i<storage.length;i++) {
      const name=storage.key(i);if(!name?.startsWith(prefix)||name===prefix+"probe")continue;
      try {const value=JSON.parse(storage.getItem(name)??"null") as Ticket|null;if(value&&value.expires>Date.now())records.push([name,value]);} catch {/* Ignore unrelated/corrupt lock metadata. */}
    }
    return records;
  };
  const mine:Ticket={choosing:true,number:0,expires:Date.now()+60000};
  let heartbeat:ReturnType<typeof setInterval>|undefined;
  storage.setItem(key,JSON.stringify(mine));
  try {
    mine.number=1+Math.max(0,...read().map(([,ticket])=>ticket.number));mine.choosing=false;storage.setItem(key,JSON.stringify(mine));
    while(read().some(([name,ticket])=>name!==key&&(ticket.choosing||(ticket.number>0&&(ticket.number<mine.number||(ticket.number===mine.number&&name<key)))))) {
      if(Date.now()>=mine.expires) {storage.removeItem(key);return storageLock(operation);}
      await pause();
    }
    heartbeat=setInterval(()=>{mine.expires=Date.now()+60000;storage.setItem(key,JSON.stringify(mine));},10000);
    return await operation();
  } finally {if(heartbeat)clearInterval(heartbeat);storage.removeItem(key);}
}
export async function withBrowserSessionLock<T>(operation:()=>Promise<T>):Promise<T> {
  if(typeof navigator!=="undefined"&&navigator.locks)return await navigator.locks.request("survey-auth-refresh",operation);
  return typeof window==="undefined"?operation():storageLock(operation);
}
