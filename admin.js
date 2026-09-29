const app=document.getElementById('app');
const navs=[...document.querySelectorAll('.nav')];
let state={};

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Date().toISOString().slice(0,10);
const api=async(u,o={})=>{
  const r=await fetch(u,{headers:{'Content-Type':'application/json'},...o});
  const d=await r.json();
  if(!r.ok)throw Error(d.error||'Request failed');
  return d;
};
const load=()=>api('/api/state').then(x=>{state=x;return x});
const shell=(title,body,sub='')=>{
  app.innerHTML='<div class="page-head"><div><h1>'+esc(title)+'</h1>'+(sub?'<p class="muted">'+esc(sub)+'</p>':'')+'</div></div>'+body;
};
const options=(arr,sel='')=>(arr||[]).map(x=>'<option value="'+esc(x.slug)+'" '+(x.slug===sel?'selected':'')+'>'+esc(x.name||((x.brand||'')+' '+(x.name||'')))+'</option>').join('');
const notice=(id,msg,error=false)=>{const el=document.getElementById(id);if(el)el.innerHTML='<div class="notice'+(error?' error':'')+'">'+esc(msg)+'</div>'};

function render(view){
  navs.forEach(n=>n.classList.toggle('active',n.dataset.view===view));
  const fn={dashboard,command,updates,posts,celebrities,shoes,brands,affiliates}[view];
  if(fn)fn();
}

function dashboard(){
  const missingShoes=state.updates.filter(x=>!x.shoeSlug).length;
  const missingAff=state.shoes.filter(x=>!(x.affiliates||[]).length).length;
  const untouched=state.celebrities.filter(c=>!state.updates.some(u=>u.celebritySlug===c.slug)).length;
  const recent=state.updates.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,8);
  shell('Dashboard','<div class="grid">'+
    stat(state.celebrities.length,'Celebrities')+stat(state.shoes.length,'Shoes')+stat(state.brands.length,'Brands')+stat(state.updates.length,'Fashion updates')+
    '</div><div class="panel"><h2>What needs attention</h2><div class="grid">'+
    stat(untouched,'Celebrities with no looks','command')+stat(missingShoes,'Looks missing shoe ID','updates')+stat(missingAff,'Shoes missing affiliates','affiliates')+
    '</div></div><div class="panel"><h2>Recent looks</h2><div class="list">'+
    (recent.map(u=>'<div class="row"><div><h3>'+esc(u.celebrityName||u.celebritySlug)+'</h3><small>'+esc(u.shoeName||'Shoe not identified')+' · '+esc(u.date||'')+'</small></div><a class="btn secondary" target="_blank" rel="noopener" href="'+esc(u.instagramUrl)+'">Instagram</a></div>').join('')||'<p class="muted">No looks captured yet.</p>')+
    '</div></div><div class="panel"><h2>Start here</h2><div class="actions"><button class="btn" onclick="render(\'command\')">Open Celebrity HQ</button><button class="btn secondary" onclick="hfkCapture()">Capture a Look</button><button class="btn secondary" onclick="render(\'shoes\')">Build Shoe Catalog</button><button class="btn secondary" onclick="render(\'posts\')">Create Blog Post</button></div></div>');
}
function stat(n,label,view=''){return '<div class="stat '+(view?'clickable':'')+'" '+(view?'onclick="render(&quot;'+view+'&quot;)"':'')+'><strong>'+n+'</strong><span>'+esc(label)+'</span></div>'}

function command(){
  const cats=[...new Set(state.celebrities.map(x=>x.category).filter(Boolean))].sort();
  shell('Celebrity HQ','<div class="panel"><div class="two"><label>Search celebrity<input id="hqSearch" placeholder="Name or Instagram..." oninput="filterHQ()"></label><label>Category<select id="hqCategory" onchange="filterHQ()"><option value="">All categories</option>'+cats.map(x=>'<option>'+esc(x)+'</option>').join('')+'</select></label></div><p id="hqCount" class="muted"></p></div><div id="hqList" class="list"></div>');
  filterHQ();
}
function filterHQ(){
  const q=(document.getElementById('hqSearch')?.value||'').toLowerCase(),cat=document.getElementById('hqCategory')?.value||'';
  let list=state.celebrities.filter(c=>(!q||(c.name+' '+(c.instagram||'')+' '+(c.category||'')).toLowerCase().includes(q))&&(!cat||c.category===cat));
  list.sort((a,b)=>a.name.localeCompare(b.name));
  document.getElementById('hqList').innerHTML=list.map(c=>{
    const count=state.updates.filter(u=>u.celebritySlug===c.slug).length;
    return '<div class="row"><div><h3>'+esc(c.name)+'</h3><small>'+esc(c.category||'Celebrity')+' · '+count+' tracked looks</small></div><button class="btn secondary" onclick="hq(&quot;'+esc(c.slug)+'&quot;)">Open HQ</button></div>';
  }).join('')||'<div class="panel"><p>No celebrities match.</p></div>';
  document.getElementById('hqCount').textContent=list.length+' of '+state.celebrities.length+' celebrities';
}
function hq(slug){
  const c=state.celebrities.find(x=>x.slug===slug);if(!c)return render('command');
  const ups=state.updates.filter(x=>x.celebritySlug===slug).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  shell(c.name,'<div class="panel"><div class="hq-head"><div><p class="eyebrow">'+esc(c.category||'Celebrity')+'</p><h2>'+esc(c.name)+'</h2><p class="muted">'+esc(c.bio||'No bio yet.')+'</p></div><a class="btn secondary" target="_blank" rel="noopener" href="'+esc(c.instagram||'#')+'">Instagram</a></div></div>'+
    '<div class="grid">'+stat(ups.length,'Tracked looks')+stat(ups.filter(x=>x.shoeSlug).length,'Identified shoes')+stat([...new Set(ups.map(x=>x.shoeSlug).filter(Boolean))].length,'Unique shoes')+'</div>'+
    '<div class="panel"><h2>Capture latest look</h2><form id="hqf" class="form"><label>Instagram URL<input id="qi" type="url" required placeholder="https://www.instagram.com/p/..."></label><div class="two"><label>Date<input id="qd" type="date" value="'+today()+'"></label><label>Occasion<input id="qo" placeholder="Airport, event, street style..."></label></div><label>Shoe<select id="qs"><option value="">Unknown — identify later</option>'+options(state.shoes)+'</select></label><label>Description<textarea id="qx" placeholder="What is visible in the look?"></textarea></label><button class="btn">Capture look</button><div id="qn"></div></form></div>'+
    '<div class="panel"><div class="section-heading"><h2>Recent looks</h2><button class="btn secondary" onclick="hfkCaptureFor(&quot;'+esc(c.slug)+'&quot;)">+ Capture</button></div><div class="list">'+(ups.slice(0,20).map(u=>'<div class="row"><div><h3>'+esc(u.shoeName||'Shoe not identified')+'</h3><small>'+esc(u.date||'')+' · '+esc(u.occasion||'Fashion update')+'</small></div><div><a class="btn secondary" target="_blank" rel="noopener" href="'+esc(u.instagramUrl)+'">Instagram</a>'+(!u.shoeSlug?'<button class="btn secondary" style="margin-left:8px" onclick="hfkIdentify(&quot;'+esc(u.id)+'&quot;)">Identify Shoe</button>':'')+'</div></div>').join('')||'<p class="muted">No looks captured yet.</p>')+'</div></div>'+
    '<button class="btn secondary" onclick="render(&quot;command&quot;)">← All celebrities</button>');
  document.getElementById('hqf').onsubmit=async e=>{
    e.preventDefault();
    try{await api('/api/updates',{method:'POST',body:JSON.stringify({celebritySlug:c.slug,shoeSlug:qs.value,instagramUrl:qi.value,date:qd.value,occasion:qo.value,description:qx.value})});await load();hq(c.slug)}
    catch(e){notice('qn',e.message,true)}
  };
}
function hfkCaptureFor(slug){hfkCapture(slug)}
function hfkCapture(preselect=''){
  const sorted=state.celebrities.slice().sort((a,b)=>a.name.localeCompare(b.name));
  shell('Capture Look','<div class="panel"><p class="muted">Save the Instagram sighting first. You can identify the shoe immediately or later.</p><form id="capf" class="form"><label>Celebrity<select id="capCelebrity">'+sorted.map(c=>'<option value="'+esc(c.slug)+'" '+(c.slug===preselect?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></label><label>Instagram post / reel URL<input id="capUrl" type="url" required placeholder="https://www.instagram.com/p/..."></label><div class="two"><label>Date<input id="capDate" type="date" value="'+today()+'"></label><label>Occasion<input id="capOccasion" placeholder="Event, airport, street style..."></label></div><label>Optional shoe<select id="capShoe"><option value="">Unknown</option>'+options(state.shoes)+'</select></label><label>Notes<textarea id="capNote"></textarea></label><button class="btn">Capture Look</button><button type="button" class="btn secondary" onclick="render(&quot;dashboard&quot;)" style="margin-left:8px">Cancel</button><div id="capMsg"></div></form></div>');
  document.getElementById('capf').onsubmit=async e=>{e.preventDefault();try{await api('/api/updates',{method:'POST',body:JSON.stringify({celebritySlug:capCelebrity.value,shoeSlug:capShoe.value,instagramUrl:capUrl.value,date:capDate.value,occasion:capOccasion.value,description:capNote.value})});await load();notice('capMsg','Look captured.');setTimeout(()=>hq(capCelebrity.value),300)}catch(e){notice('capMsg',e.message,true)}};
  document.getElementById('capUrl').focus();
}

function updates(){
  shell('Quick Update','<div class="panel"><div class="section-heading"><div><h2>Capture fashion sightings</h2><p class="muted">Paste one Instagram URL per line for the same celebrity.</p></div><button class="btn secondary" onclick="hfkCapture()">Single Capture</button></div><div class="two"><label>Celebrity<select id="bc">'+options(state.celebrities)+'</select></label><label>Shoe<select id="bs"><option value="">Unknown</option>'+options(state.shoes)+'</select></label></div><label>Instagram URLs<textarea id="bu" placeholder="https://www.instagram.com/p/..."></textarea></label><div class="two"><label>Date<input id="bd" type="date" value="'+today()+'"></label><label>Occasion<input id="bo"></label></div><label>Description<textarea id="bx"></textarea></label><button class="btn" onclick="batch(event)">Publish batch</button><span id="bn" class="muted" style="margin-left:10px"></span></div><div class="panel"><input id="us" placeholder="Search captured looks..." oninput="filterUpdates()"><div id="ul" class="list"></div></div>');
  filterUpdates();
}
function filterUpdates(){
  const q=(document.getElementById('us')?.value||'').toLowerCase();
  const a=state.updates.filter(v=>(v.celebrityName+' '+v.shoeName+' '+v.occasion+' '+v.instagramUrl).toLowerCase().includes(q));
  document.getElementById('ul').innerHTML=a.map(v=>'<div class="row"><div><h3>'+esc(v.celebrityName||v.celebritySlug)+'</h3><small>'+esc(v.shoeName||'Shoe not identified')+' · '+esc(v.date||'')+'</small></div><div><a class="btn secondary" target="_blank" rel="noopener" href="'+esc(v.instagramUrl)+'">Instagram</a><button class="btn danger" style="margin-left:8px" onclick="delUpdate(&quot;'+esc(v.id)+'&quot;)">Delete</button></div></div>').join('')||'<p class="muted">No looks captured.</p>';
}
async function batch(e){
  e.preventDefault();const urls=bu.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);let ok=0,bad=0;
  for(const url of urls){try{await api('/api/updates',{method:'POST',body:JSON.stringify({celebritySlug:bc.value,shoeSlug:bs.value,instagramUrl:url,date:bd.value,occasion:bo.value,description:bx.value})});ok++}catch{bad++}}
  await load();bn.textContent=ok+' added, '+bad+' skipped';filterUpdates();
}
async function delUpdate(id){if(!confirm('Delete this fashion update?'))return;await api('/api/updates/'+encodeURIComponent(id),{method:'DELETE'});await load();render('updates')}

function celebrities(){
  shell('Celebrities','<div class="panel"><h2>Add celebrity</h2><form id="cf" class="form"><div class="two"><label>Name<input id="cn" required></label><label>Instagram profile<input id="ci" placeholder="https://www.instagram.com/..."></label></div><label>Category<input id="cc" placeholder="Actor, athlete, creator..."></label><label>Bio<textarea id="cb"></textarea></label><button class="btn">Add Celebrity</button><div id="cm"></div></form></div><div class="panel"><input id="cs" placeholder="Search celebrities..." oninput="filterCelebs()"></div><div id="cl" class="list"></div>');
  document.getElementById('cf').onsubmit=async e=>{e.preventDefault();try{await api('/api/celebrities',{method:'POST',body:JSON.stringify({name:cn.value,instagram:ci.value,bio:cb.value,category:cc.value})});await load();render('celebrities')}catch(e){notice('cm',e.message,true)}};
  filterCelebs();
}
function filterCelebs(){
  const q=(document.getElementById('cs')?.value||'').toLowerCase();
  const a=state.celebrities.filter(c=>(c.name+' '+(c.instagram||'')+' '+(c.category||'')).toLowerCase().includes(q));
  document.getElementById('cl').innerHTML=a.map(c=>'<div class="row"><div><h3>'+esc(c.name)+'</h3><small>'+esc(c.category||'Celebrity')+' · '+state.updates.filter(u=>u.celebritySlug===c.slug).length+' looks</small></div><button class="btn secondary" onclick="hq(&quot;'+esc(c.slug)+'&quot;)">Open HQ</button></div>').join('');
}

function shoes(){
  shell('Shoes','<div class="panel"><h2>Add shoe</h2><form id="sf" class="form"><div class="two"><label>Brand<input id="sb" required></label><label>Model<input id="sn" required></label></div><label>Description<textarea id="sd"></textarea></label><button class="btn">Add Shoe</button><div id="sm"></div></form></div><div class="panel"><input id="ss" placeholder="Search shoe catalog..." oninput="filterShoes()"></div><div id="sl" class="list"></div>');
  document.getElementById('sf').onsubmit=async e=>{e.preventDefault();try{await api('/api/shoes',{method:'POST',body:JSON.stringify({brand:sb.value,name:sn.value,description:sd.value})});await load();render('shoes')}catch(e){notice('sm',e.message,true)}};
  filterShoes();
}
function filterShoes(){
  const q=(document.getElementById('ss')?.value||'').toLowerCase();
  const a=state.shoes.filter(s=>(s.brand+' '+s.name).toLowerCase().includes(q));
  document.getElementById('sl').innerHTML=a.map(s=>'<div class="row"><div><h3>'+esc(s.brand+' '+s.name)+'</h3><small>'+((s.affiliates||[]).length)+' affiliate offers · '+state.updates.filter(u=>u.shoeSlug===s.slug).length+' sightings</small></div><div><button class="btn secondary" onclick="hfkShoeHQ(&quot;'+esc(s.slug)+'&quot;)">Shoe HQ</button><button class="btn secondary" style="margin-left:8px" onclick="editAff(&quot;'+esc(s.slug)+'&quot;)">Affiliates</button></div></div>').join('')||'<p class="muted">No shoes in the catalog yet.</p>';
}

function brands(){
  shell('Brands','<div class="panel"><h2>Add brand</h2><form id="brf" class="form"><div class="two"><label>Brand name<input id="brn" required></label><label>Description<input id="brd"></label></div><button class="btn">Add Brand</button><div id="brm"></div></form></div><div class="list">'+state.brands.map(b=>'<div class="row"><div><h3>'+esc(b.name)+'</h3><small>'+state.shoes.filter(s=>s.brandSlug===b.slug||(!s.brandSlug&&s.brand===b.name)).length+' shoe models</small></div><a class="btn secondary" target="_blank" rel="noopener" href="/brands/'+esc(b.slug)+'/">View public page</a></div>').join('')||'<div class="panel"><p>No brands yet. Adding the first shoe automatically creates its brand.</p></div>')+'</div>');
  document.getElementById('brf').onsubmit=async e=>{e.preventDefault();try{await api('/api/brands',{method:'POST',body:JSON.stringify({name:brn.value,description:brd.value})});await load();render('brands')}catch(e){notice('brm',e.message,true)}};
}

function affiliates(){
  const missingIN=state.shoes.filter(s=>!(s.affiliates||[]).some(a=>['IN','INDIA'].includes(String(a.country||'').toUpperCase()))).length;
  const missingUS=state.shoes.filter(s=>!(s.affiliates||[]).some(a=>['US','USA'].includes(String(a.country||'').toUpperCase()))).length;
  shell('Affiliate Links','<div class="grid">'+stat(missingIN,'Missing India offer')+stat(missingUS,'Missing US offer')+stat(state.shoes.filter(s=>(s.affiliates||[]).length).length,'Shoes with offers')+'</div><div class="panel"><input id="affSearch" placeholder="Search shoe..." oninput="filterAff()"></div><div id="affList" class="list"></div>');
  filterAff();
}
function filterAff(){
  const q=(document.getElementById('affSearch')?.value||'').toLowerCase();
  const a=state.shoes.filter(s=>(s.brand+' '+s.name).toLowerCase().includes(q));
  document.getElementById('affList').innerHTML=a.map(s=>'<div class="row"><div><h3>'+esc(s.brand+' '+s.name)+'</h3><small>'+((s.affiliates||[]).length)+' offer(s)</small></div><button class="btn secondary" onclick="editAff(&quot;'+esc(s.slug)+'&quot;)">Manage offers</button></div>').join('')||'<p class="muted">Create shoes first, then add their retailer offers.</p>';
}
function editAff(slug){
  const s=state.shoes.find(x=>x.slug===slug);if(!s)return render('affiliates');
  shell('Affiliate Offers','<div class="panel"><h2>'+esc(s.brand+' '+s.name)+'</h2><p class="muted">Use direct retailer/product URLs. One primary offer per market.</p><div id="arows">'+(s.affiliates||[]).map(affRow).join('')+'</div><button class="btn secondary" id="addAff">+ Add retailer</button><button class="btn" id="saveAff" style="margin-left:8px">Save offers</button><div id="affMsg"></div></div><button class="btn secondary" onclick="render(&quot;affiliates&quot;)">← Affiliate manager</button>');
  document.getElementById('addAff').onclick=()=>document.getElementById('arows').insertAdjacentHTML('beforeend',affRow());
  document.getElementById('saveAff').onclick=()=>saveAff(slug);
}
function affRow(a={}){
  return '<div class="affiliate-row panel"><div class="two"><label>Retailer<input class="ar" value="'+esc(a.retailer||'')+'" placeholder="Nike, Amazon..."></label><label>Market<input class="ac" value="'+esc(a.country||'IN')+'" placeholder="IN, US, GB"></label></div><label>Product URL<input class="au" type="url" value="'+esc(a.url||'')+'" placeholder="https://..."></label><div class="two"><label>Button label<input class="al" value="'+esc(a.label||'Check price')+'"></label><label>Status<select class="ast"><option value="active" '+((a.status||'active')==='active'?'selected':'')+'>Active</option><option value="paused" '+(a.status==='paused'?'selected':'')+'>Paused</option></select></label></div><label><input class="apr" type="checkbox" '+(a.primary?'checked':'')+'> Primary offer for this market</label></div>';
}
async function saveAff(slug){
  const offers=[...document.querySelectorAll('.affiliate-row')].map(r=>({retailer:r.querySelector('.ar').value.trim(),country:r.querySelector('.ac').value.trim()||'GLOBAL',url:r.querySelector('.au').value.trim(),label:r.querySelector('.al').value.trim()||'Check price',status:r.querySelector('.ast').value,primary:r.querySelector('.apr').checked})).filter(x=>x.retailer||x.url);
  try{await api('/api/shoes/'+encodeURIComponent(slug)+'/affiliates',{method:'PUT',body:JSON.stringify({affiliates:offers})});await load();render('affiliates')}catch(e){notice('affMsg',e.message,true)}
}

function posts(){
  shell('Blog Posts','<div class="panel"><h2>Create post</h2><form id="pf" class="form"><label>Title<input id="pt" required></label><div class="two"><label>Slug<input id="ps" placeholder="auto-generated"></label><label>Category<input id="pc" value="Sneakers"></label></div><label>SEO description<input id="pd"></label><label>Markdown<textarea id="px" style="min-height:320px"></textarea></label><button class="btn">Create Post</button><div id="pm"></div></form></div><div class="panel"><h2>Existing posts</h2><div class="list">'+(state.posts.map(p=>'<div class="row"><div><h3>'+esc(p.title)+'</h3><small>'+esc(p.date||'')+' · '+esc(p.file)+'</small></div></div>').join('')||'<p class="muted">No blog posts yet.</p>')+'</div></div>');
  document.getElementById('pf').onsubmit=async e=>{e.preventDefault();try{await api('/api/posts',{method:'POST',body:JSON.stringify({title:pt.value,slug:ps.value,category:pc.value,seoDescription:pd.value,content:px.value})});await load();render('posts')}catch(e){notice('pm',e.message,true)}};
}

window.render=render;
window.hq=hq;
window.hfkCapture=hfkCapture;
window.hfkCaptureFor=hfkCaptureFor;
window.batch=batch;
window.delUpdate=delUpdate;
window.hfkShoeHQ=window.hfkShoeHQ||function(slug){ if(typeof hfkShoeHQ==='function') hfkShoeHQ(slug); };
window.editAff=editAff;
navs.forEach(n=>n.addEventListener('click',()=>render(n.dataset.view)));

load().then(()=>render('dashboard')).catch(e=>{app.innerHTML='<div class="panel"><h2>HFK Studio could not load</h2><p class="notice error">'+esc(e.message)+'</p></div>'});
