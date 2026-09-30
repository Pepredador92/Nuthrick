export const useAuth=()=>({user:{id:'synthetic-professional'}});
export const supabase={rpc:async(_name:string,data:unknown)=>({data:await fetch('/__support',{method:'POST',body:JSON.stringify(data)}).then(r=>r.json()),error:null}),channel:()=>({on(){return this;},subscribe(){return this;}}),removeChannel:async()=>{}};
export function Heading({title,text}:{title:string;text:string}){return <header className="mb-6"><h1 className="text-2xl font-semibold">{title}</h1><p className="mt-2 text-sm">{text}</p></header>;}
