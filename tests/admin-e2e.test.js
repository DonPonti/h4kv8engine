const {JSDOM}=require('jsdom'),fs=require('fs');
const R=require('path').join(__dirname,'..')+'/';
let pass=0,fail=0;const t=(n,c,extra)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(c||!extra?'':'  -> '+extra))};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,ms=3000)=>{const s=Date.now();while(Date.now()-s<ms){try{if(fn())return true}catch(e){}await sleep(15)}return false};

// ---- in-memory "GitHub + Netlify function" with real sha semantics
const crypto=require('crypto');
const sha=s=>crypto.createHash('sha1').update(s).digest('hex');
const FIXTURE={celebrities:[{name:'Virat Kohli',slug:'virat-kohli',instagram:'virat.kohli',top100Rank:1,updateCount:2},{name:'Priyanka Chopra',slug:'priyanka-chopra',instagram:'priyankachopra',top100Rank:3,updateCount:1},{name:'Shraddha Kapoor',slug:'shraddha-kapoor',top100Rank:2}],shoes:[],brands:[{name:'adidas Originals',slug:'adidas-originals',description:''}],affiliates:[],
 updates:[{id:'v1',celebritySlug:'virat-kohli',celebrityName:'Virat Kohli',instagramUrl:'https://www.instagram.com/p/DaDJji0DY_x/',shoeSlug:'',date:'2026-10-05',confidence:'unidentified',accessories:[]},{id:'v2',celebritySlug:'virat-kohli',celebrityName:'Virat Kohli',instagramUrl:'https://www.instagram.com/reel/DZZ8lRptve1/',shoeSlug:'',date:'2026-10-05',confidence:'unidentified',accessories:[]},{id:'p1',celebritySlug:'priyanka-chopra',celebrityName:'Priyanka Chopra',instagramUrl:'https://www.instagram.com/p/Dc37-G4DZag/',shoeSlug:'',date:'2026-10-01',confidence:'unidentified',accessories:[]}]};
const repo={text:JSON.stringify(FIXTURE,null,2)+'\n'};repo.sha=sha(repo.text);
const log={saves:0,conflicts:0,messages:[]};let conflictOnce=null;
const otherDevice=()=>{const d=JSON.parse(repo.text);d.updates.unshift({id:'from-other-device',celebritySlug:'virat-kohli',celebrityName:'Virat Kohli',instagramUrl:'https://www.instagram.com/p/OTHERDEV1/',shoeSlug:'',date:'2026-10-05',confidence:'unidentified',accessories:[]});repo.text=JSON.stringify(d,null,2)+'\n';repo.sha=sha(repo.text)};
const json=(s,b)=>({ok:s<400,status:s,text:async()=>JSON.stringify(b)});
async function fakeFetch(url,opt={}){
  const auth=(opt.headers&&(opt.headers.Authorization||opt.headers.authorization))||'';
  if(auth!=='Bearer pw')return json(401,{error:'Unauthorized'});
  const u=new URL(url,'https://x.test');
  if(opt.method==='POST'){
    const b=JSON.parse(opt.body);
    if(b.path!=='src/_data/hfk.json')return json(400,{error:'Path not allowed'});
    if(conflictOnce){const f=conflictOnce;conflictOnce=null;f()}
    if(b.sha!==repo.sha){log.conflicts++;return json(409,{error:'src/_data/hfk.json does not match '+repo.sha})}
    repo.text=Buffer.from(b.content,'base64').toString('utf8');repo.sha=sha(repo.text);log.saves++;log.messages.push(b.message);
    return json(200,{sha:repo.sha});
  }
  if(u.searchParams.get('op')==='state')return json(200,{sha:repo.sha,content:Buffer.from(repo.text).toString('base64')});
  return json(404,{error:'nope'});
}

(async()=>{
  const html=fs.readFileSync(R+'src/admin/index.html','utf8').replace(/<script[^>]*><\/script>/g,'').replace(/<link[^>]*>/g,'');
  const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://huntingforkicks.com/admin/',pretendToBeVisual:true});
  const w=dom.window,D=w.document;
  w.fetch=fakeFetch;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.confirm=()=>true;
  w.IntersectionObserver=function(){this.observe=()=>{};this.unobserve=()=>{}};
  for(const f of ['src/_js/instagram.js','src/admin/app-secure.js','src/admin/fixes.js','src/admin/quick.js'])w.eval(fs.readFileSync(R+f,'utf8'));
  const type=(el,v)=>{el.value=v;el.dispatchEvent(new w.Event('input',{bubbles:true}))};
  const $=s=>D.querySelector(s);

  // ---- login
  await until(()=>$('#token'));
  t('login screen shown',!!$('#token'));
  type($('#token'),'wrong');$('#loginForm').dispatchEvent(new w.Event('submit',{cancelable:true}));
  await until(()=>/Unauthorized/.test($('#loginMsg').textContent));
  t('wrong password rejected with message',/Unauthorized/.test($('#loginMsg').textContent));
  type($('#token'),'pw');$('#loginForm').dispatchEvent(new w.Event('submit',{cancelable:true}));
  t('lands on Quick Capture after login',await until(()=>$('#qc')));
  t('Quick Capture is the first nav item',/Quick Capture/.test($('.nav').textContent));
  t('celebrity datalist has all celebrities',D.querySelectorAll('#qcCelebList option').length===3);
  t('publish disabled initially',$('#qcPublish').disabled);

  // ---- choose celebrity + paste messy text
  type($('#qcCeleb'),'priyanka');
  t('celebrity resolves by partial name',/Priyanka Chopra/.test($('#qcCelebState').textContent),$('#qcCelebState').textContent);
  const messy='Look at these!! https://www.instagram.com/p/Dc37-G4DZag/?igsh=zzz (already have it)\nand https://www.instagram.com/p/NewLook1AB/?utm_source=ig_web_copy_link, plus https://www.instagram.com/reel/NewReel2cD/ thanks';
  type($('#qcText'),messy);
  t('3 links parsed',D.querySelectorAll('#qcRows .qc-row').length===3);
  t('existing one flagged already tracked + no inputs',/already tracked/.test(D.querySelectorAll('.qc-row')[0].textContent)&&!D.querySelectorAll('.qc-row')[0].querySelector('.qc-shoe'));
  t('button says Publish 2 looks',$('#qcPublish').textContent==='Publish 2 looks'&&!$('#qcPublish').disabled,$('#qcPublish').textContent);
  const shoeInput=D.querySelectorAll('.qc-row')[2].querySelector('.qc-shoe');
  type(shoeInput,'Adidas | Samba OG');
  t('confidence selector appears when shoe typed',!!D.querySelectorAll('.qc-row')[2].querySelector('.qc-conf'));
  t('typing in shoe keeps focus-safe DOM (same input node)',D.querySelectorAll('.qc-row')[2].querySelector('.qc-shoe')===shoeInput);
  D.querySelectorAll('.qc-row')[1].querySelector('[data-act=preview]').click();
  const ig=D.querySelector('.qc-row .qc-prev .ig-embed');
  t('Preview mounts embed with exact shortcode case',!!ig&&ig.dataset.igCode==='NewLook1AB');
  t('...and creates an instagram iframe',await until(()=>D.querySelector('.qc-prev iframe.ig-frame')));
  D.querySelectorAll('.qc-row')[1].querySelector('[data-act=preview]').click();
  t('Preview toggles off',!D.querySelector('.qc-row .qc-prev iframe'));

  // ---- publish with a concurrent edit from another device mid-save
  conflictOnce=otherDevice;
  $('#qcPublish').click();
  t('publish completes',await until(()=>/Published 2 looks/.test($('#qcMsg').textContent),4000),$('#qcMsg').textContent);
  const data=JSON.parse(repo.text);
  t('conflict happened and was retried',log.conflicts===1,'conflicts='+log.conflicts);
  t("other device's look NOT erased",data.updates.some(u=>u.id==='from-other-device'));
  t('both new looks saved',data.updates.filter(u=>/NewLook1AB|NewReel2cD/.test(u.instagramUrl)).length===2);
  t('already-tracked link not duplicated',data.updates.filter(u=>u.instagramUrl.includes('Dc37-G4DZag')).length===1);
  t('exactly one commit for the batch',log.saves===1&&log.messages[0]==='Quick capture: 2 looks for Priyanka Chopra',log.messages.join('|'));
  t('shoe + brand created w/ schema',data.shoes.some(s=>s.slug==='adidas-samba-og'&&s.brandSlug==='adidas')&&data.brands.some(b=>b.slug==='adidas'));
  const withShoe=data.updates.find(u=>u.instagramUrl.includes('NewReel2cD'));
  t('shoe attached to the right look',withShoe.shoeSlug==='adidas-samba-og'&&withShoe.confidence==='medium'&&data.updates.find(u=>u.instagramUrl.includes('NewLook1AB')).confidence==='unidentified');
  t('celebrity count recomputed',data.celebrities.find(c=>c.slug==='priyanka-chopra').updateCount===3);
  t('other top-level data preserved',JSON.stringify(Object.keys(data))===JSON.stringify(Object.keys(FIXTURE)));
  t('form reset + celebrity remembered for next batch',$('#qcText').value===''&&$('#qcCeleb').value==='Priyanka Chopra');
  t('recent chip offered',!!$('#qcChips .chip'));
  t('undo panel shown',!!$('#qcUndo'));

  // ---- identify queue
  await until(()=>$('#qcIdent .qc-row'));
  const idRow=[...D.querySelectorAll('#qcIdent .qc-row')].find(r=>/Priyanka/.test(r.textContent));
  t('identify queue lists looks without shoes',!!idRow);
  type(idRow.querySelector('.qc-shoe'),'adidas samba og');
  $('#qcIdentSave').click();
  t('identify saved',await until(()=>/Identified 1 look/.test($('#qcMsg').textContent),4000),$('#qcMsg').textContent+' | '+($('#qcIdentMsg')||{}).textContent);
  t('identify wrote shoe to that look, no new shoe',JSON.parse(repo.text).shoes.filter(s=>s.slug==='adidas-samba-og').length===1&&JSON.parse(repo.text).updates.filter(u=>u.shoeSlug==='adidas-samba-og').length===2);

  // ---- undo
  $('#qcUndo')&&$('#qcUndo').click();
  t('undo removes the batch',await until(()=>/Undone/.test(($('#qcMsg')||{}).textContent||'')),($('#qcMsg')||{}).textContent);
  const after=JSON.parse(repo.text);
  t('undo removed exactly those looks, kept others',!after.updates.some(u=>/NewLook1AB|NewReel2cD/.test(u.instagramUrl))&&after.updates.some(u=>u.id==='from-other-device')&&after.celebrities.find(c=>c.slug==='priyanka-chopra').updateCount===1);

  // ---- stale-write guard on the OLD forms (writeData)
  w.hfkEditShoe();  // opens "New Shoe" form
  await until(()=>$('#shoeForm'));
  type($('#sb'),'Puma');type($('#sn'),'Speedcat');
  const otherDevice2=()=>{const d=JSON.parse(repo.text);d.updates.unshift({id:'sneaky',celebritySlug:'virat-kohli',celebrityName:'Virat Kohli',instagramUrl:'https://www.instagram.com/p/SNEAKY99/',date:'2026-10-05',accessories:[]});repo.text=JSON.stringify(d,null,2)+'\n';repo.sha=sha(repo.text)};
  otherDevice2();   // someone else saved after this tab loaded
  $('#shoeForm').dispatchEvent(new w.Event('submit',{cancelable:true}));
  await until(()=>/changed elsewhere/.test($('#shoeMsg').textContent));
  t('old form refuses to overwrite newer data',/changed elsewhere/.test($('#shoeMsg').textContent)&&!JSON.parse(repo.text).shoes.some(s=>s.slug==='puma-speedcat'),$('#shoeMsg').textContent);
  t("...and the other device's look survives",JSON.parse(repo.text).updates.some(u=>u.id==='sneaky'));

  console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);
})().catch(e=>{console.error('TEST CRASH',e);process.exit(2)});
