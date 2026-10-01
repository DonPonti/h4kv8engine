const OWNER='DonPonti';
const REPO='h4kv8engine';
const BRANCH='main';
const API='https://api.github.com/repos/'+OWNER+'/'+REPO;
const json=(status,body)=>({statusCode:status,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
const allowed=p=>p==='src/_data/hfk.json'||p.startsWith('src/blog/')||p.startsWith('src/_img/looks/');
async function gh(path,options={}){
  const r=await fetch(API+path,{...options,headers:{accept:'application/vnd.github+json','authorization':'Bearer '+process.env.HFK_GITHUB_TOKEN,'x-github-api-version':'2026-03-10',...(options.headers||{})}});
  const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{}
  if(!r.ok)throw new Error(d.message||'GitHub request failed');
  return d;
}
exports.handler=async function(event){
  const password=String(event.headers?.authorization||'').replace(/^Bearer\s+/i,'');
  if(!process.env.HFK_ADMIN_PASSWORD||password!==process.env.HFK_ADMIN_PASSWORD)return json(401,{error:'Unauthorized'});
  if(!process.env.HFK_GITHUB_TOKEN)return json(500,{error:'HFK_GITHUB_TOKEN is not configured'});
  try{
    const q=event.queryStringParameters||{};
    if(event.httpMethod==='GET'&&q.op==='state'){
      const r=await gh('/contents/src/_data/hfk.json?ref='+BRANCH);
      return json(200,{sha:r.sha,content:r.content});
    }
    if(event.httpMethod==='GET'&&q.op==='posts'){
      const r=await gh('/contents/src/blog?ref='+BRANCH);
      return json(200,Array.isArray(r)?r.filter(x=>x.type==='file'&&x.name.endsWith('.md')):[]);
    }
    if(event.httpMethod==='GET'&&q.op==='file'){
      const p=decodeURIComponent(q.path||'');if(!allowed(p))return json(400,{error:'Path not allowed'});
      return json(200,await gh('/contents/'+p+'?ref='+BRANCH));
    }
    if(event.httpMethod==='POST'){
      const x=JSON.parse(event.body||'{}'),p=String(x.path||'');
      if(x.op==='save'){
        if(!allowed(p))return json(400,{error:'Path not allowed'});
        const body={message:String(x.message||'HFK Studio update'),content:String(x.content||''),branch:BRANCH};
        if(x.sha)body.sha=x.sha;
        const r=await gh('/contents/'+p,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
        return json(200,{sha:r.content?.sha,commit:r.commit?.sha,path:p});
      }
      if(x.op==='delete'){if(!allowed(p)||!x.sha)return json(400,{error:'Invalid delete request'});const r=await gh('/contents/'+p,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({message:String(x.message||'Delete from HFK Studio'),sha:x.sha,branch:BRANCH})});return json(200,{commit:r.commit?.sha})}
      return json(400,{error:'Unknown operation'});
    }
    return json(400,{error:'Unknown request'});
  }catch(e){return json(500,{error:e.message||'HFK server error'});}
};
