process.env.HFK_ADMIN_PASSWORD='correct-horse';process.env.HFK_GITHUB_TOKEN='x';
const calls=[];
global.fetch=async(url,opt)=>{calls.push({url,method:opt&&opt.method||'GET'});
  return {ok:true,status:200,text:async()=>JSON.stringify({sha:'a'.repeat(40),content:'e30=',commit:{sha:'b'.repeat(40)}})}};
const {handler,_internals}=require('../netlify/functions/hfk.js');
const H=(pw,ip='1.1.1.1')=>({authorization:'Bearer '+pw,'x-nf-client-connection-ip':ip});
let pass=0,fail=0;const t=(name,cond)=>{cond?pass++:fail++;console.log((cond?'PASS ':'FAIL ')+name)};
(async()=>{
 for(const p of ['src/blog/../../netlify/functions/hfk.js','src/blog/x.md/../../../.eleventy.js','src/blog/sub/x.md','src/blog/UP.md','src/blog/x.js','src/_img/looks/a.svg','src/_img/looks/../../x.png','.github/workflows/x.yml','src/_data/hfk.json/../x','src/blog/x.md?ref=evil','src/blog/x%2e%2e.md'])
   t('rejects '+p,!_internals.allowed(p));
 for(const p of ['src/_data/hfk.json','src/blog/my-post-2026.md','src/_img/looks/virat-123.jpg','src/_img/looks/a-1.webp'])
   t('allows '+p,_internals.allowed(p));
 let r=await handler({httpMethod:'GET',headers:{'x-nf-client-connection-ip':'9.9.9.9'},queryStringParameters:{op:'state'}});t('no auth -> 401',r.statusCode===401);
 r=await handler({httpMethod:'GET',headers:H('correct-horse'),queryStringParameters:{op:'state'}});t('good auth state -> 200',r.statusCode===200);
 r=await handler({httpMethod:'GET',headers:H('correct-horse'),queryStringParameters:{op:'file',path:'src/blog/../../.eleventy.js'}});t('file traversal -> 400',r.statusCode===400);
 r=await handler({httpMethod:'GET',headers:H('correct-horse'),queryStringParameters:{op:'file',path:'src/blog/%2e%2e/x.md'}});t('double-encoded traversal -> 400',r.statusCode===400);
 const n=calls.length;
 r=await handler({httpMethod:'POST',headers:H('correct-horse'),body:JSON.stringify({op:'save',path:'src/blog/../../netlify/functions/hfk.js',content:'e30='})});t('save traversal -> 400, no GitHub call',r.statusCode===400&&calls.length===n);
 r=await handler({httpMethod:'POST',headers:H('correct-horse'),body:JSON.stringify({op:'save',path:'src/blog/ok.md',content:'not base64!!'})});t('bad base64 -> 400',r.statusCode===400);
 r=await handler({httpMethod:'POST',headers:H('correct-horse'),body:JSON.stringify({op:'save',path:'src/blog/ok.md',content:'e30=',sha:'zzz'})});t('bad sha -> 400',r.statusCode===400);
 r=await handler({httpMethod:'POST',headers:H('correct-horse'),body:'{bad'});t('bad json -> 400',r.statusCode===400);
 r=await handler({httpMethod:'POST',headers:H('correct-horse'),body:JSON.stringify({op:'save',path:'src/blog/ok.md',content:'e30=',message:'a\nb'.repeat(300)})});
 t('valid save -> 200',r.statusCode===200);
 const put=calls[calls.length-1];t('save hits encoded contents URL',put.url.endsWith('/contents/src/blog/ok.md')&&put.method==='PUT');
 r=await handler({httpMethod:'POST',headers:H('correct-horse'),body:JSON.stringify({op:'delete',path:'src/_data/hfk.json',sha:'a'.repeat(40)})});t('delete data file blocked',r.statusCode===400);
 r=await handler({httpMethod:'POST',headers:H('correct-horse'),body:JSON.stringify({op:'delete',path:'src/blog/ok.md'})});t('delete w/o sha -> 400',r.statusCode===400);
 r=await handler({httpMethod:'POST',headers:H('correct-horse'),body:JSON.stringify({op:'delete',path:'src/blog/ok.md',sha:'a'.repeat(40)})});t('valid delete -> 200',r.statusCode===200);
 r=await handler({httpMethod:'PUT',headers:H('correct-horse')});t('PUT method -> 405',r.statusCode===405);
 for(let i=0;i<5;i++)await handler({httpMethod:'GET',headers:H('wrong','2.2.2.2'),queryStringParameters:{op:'state'}});
 r=await handler({httpMethod:'GET',headers:H('correct-horse','2.2.2.2'),queryStringParameters:{op:'state'}});t('5 failures -> 429 even w/ right password',r.statusCode===429);
 r=await handler({httpMethod:'GET',headers:H('correct-horse','3.3.3.3'),queryStringParameters:{op:'state'}});t('other IP unaffected',r.statusCode===200);
 console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);
})();
