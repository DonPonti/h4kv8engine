/* HFK Studio enhancements: tools only. Core screens live in admin.js. */

function hfkExport(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='hfk-backup-'+new Date().toISOString().slice(0,10)+'.json';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

async function hfkValidate(){
  try{
    const d=await api('/api/state');
    const errors=[],warnings=[],cs=new Set(d.celebrities.map(x=>x.slug)),ss=new Set(d.shoes.map(x=>x.slug)),bs=new Set(d.brands.map(x=>x.slug)),ids=new Set(),igs=new Set();
    for(const u of d.updates){
      if(ids.has(u.id))errors.push('Duplicate update ID: '+u.id); ids.add(u.id);
      if(!cs.has(u.celebritySlug))errors.push('Missing celebrity: '+u.celebritySlug);
      if(u.shoeSlug&&!ss.has(u.shoeSlug))errors.push('Missing shoe: '+u.shoeSlug);
      const ig=String(u.instagramUrl||'').trim().replace(/\/$/,'').toLowerCase();
      if(!/^https:\/\/(www\.)?instagram\.com\/(p|reel|tv)\//.test(ig))errors.push('Invalid Instagram URL: '+(u.instagramUrl||'(empty)'));
      if(igs.has(ig))errors.push('Duplicate Instagram URL: '+ig); igs.add(ig);
    }
    for(const s of d.shoes){
      if(s.brandSlug&&!bs.has(s.brandSlug))errors.push('Missing brand: '+s.brandSlug);
      if(!(s.affiliates||[]).length)warnings.push('No affiliate offers: '+s.brand+' '+s.name);
    }
    shell('Data Integrity','<div class="grid"><div class="stat"><strong>'+errors.length+'</strong><span>Errors</span></div><div class="stat"><strong>'+warnings.length+'</strong><span>Warnings</span></div></div><div class="panel"><h2>Errors</h2><div class="list">'+(errors.map(x=>'<div class="row"><b>ERROR</b><span>'+esc(x)+'</span></div>').join('')||'<p class="muted">No blocking errors found.</p>')+'</div></div><div class="panel"><h2>Warnings</h2><div class="list">'+(warnings.map(x=>'<div class="row"><b>WARN</b><span>'+esc(x)+'</span></div>').join('')||'<p class="muted">No warnings.</p>')+'</div></div><button class="btn secondary" onclick="render(\'dashboard\')">← Dashboard</button>');
  }catch(e){alert(e.message)}
}

function hfkShoeHQ(slug){
  const s=state.shoes.find(x=>x.slug===slug); if(!s)return render('shoes');
  const sightings=state.updates.filter(x=>x.shoeSlug===slug).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  const offers=s.affiliates||[];
  const india=offers.filter(a=>['IN','INDIA'].includes(String(a.country||'').toUpperCase()));
  const us=offers.filter(a=>['US','USA'].includes(String(a.country||'').toUpperCase()));
  const brand=state.brands.find(b=>b.slug===s.brandSlug)||state.brands.find(b=>b.name===s.brand);
  const health=[];
  if(!s.brand)health.push('Missing brand');
  if(!s.name)health.push('Missing model');
  if(!offers.length)health.push('No affiliate offers');
  if(!india.length)health.push('Missing India offer');
  if(!us.length)health.push('Missing US offer');
  shell('Shoe HQ','<div class="panel"><div class="hq-head"><div><p class="eyebrow">'+esc(brand?.name||s.brand||'Shoe')+'</p><h2>'+esc(s.name)+'</h2><p class="muted">'+esc(s.description||'No description yet.')+'</p></div><span class="badge">'+(health.length?'Needs attention':'Ready')+'</span></div><p class="muted">'+esc(health.join(' · ')||'Catalogued with current market coverage.')+'</p></div><div class="grid">'+
    stat(sightings.length,'Celebrity sightings')+stat(offers.length,'Affiliate offers')+stat(india.length,'India offers')+stat(us.length,'US offers')+
    '</div><div class="panel"><h2>Catalog</h2><div class="two"><label>Brand<input id="shBrand" value="'+esc(s.brand||'')+'"></label><label>Model<input id="shName" value="'+esc(s.name||'')+'"></label></div><label>Description<textarea id="shDesc" style="min-height:100px">'+esc(s.description||'')+'</textarea><button class="btn" id="shoeSave">Save shoe</button><span id="shoeMsg" class="muted" style="margin-left:10px"></span></div>'+
    '<div class="panel"><div class="section-heading"><h2>Affiliate offers</h2><button class="btn secondary" onclick="editAff(&quot;'+esc(slug)+'&quot;)">Manage</button></div>'+(offers.map(a=>'<div class="row"><div><h3>'+esc(a.retailer||'Retailer')+'</h3><small>'+esc(a.country||'GLOBAL')+' · '+esc(a.status||'active')+(a.primary?' · Primary':'')+'</small></div><a class="btn secondary" target="_blank" rel="sponsored nofollow noopener" href="'+esc(a.url)+'">Open</a></div>').join('')||'<p class="muted">No offers yet.</p>')+'</div>'+
    '<div class="panel"><h2>Celebrity sightings</h2>'+(sightings.map(u=>{const c=state.celebrities.find(x=>x.slug===u.celebritySlug);return '<div class="row"><div><h3>'+esc(c?.name||u.celebrityName||'Unknown')+'</h3><small>'+esc(u.date||'')+' · '+esc(u.occasion||'Fashion update')+'</small></div><a class="btn secondary" target="_blank" rel="noopener" href="'+esc(u.instagramUrl)+'">Instagram</a></div>'}).join('')||'<p class="muted">No sightings yet.</p>')+'</div><button class="btn secondary" onclick="render(\'shoes\')">← Shoe catalog</button>');
  document.getElementById('shoeSave').onclick=async()=>{
    try{
      await api('/api/shoes/'+encodeURIComponent(slug),{method:'PUT',body:JSON.stringify({brand:document.getElementById('shBrand').value.trim(),name:document.getElementById('shName').value.trim(),description:document.getElementById('shDesc').value})});
      await load(); const n=state.shoes.find(x=>x.brand===document.getElementById('shBrand').value.trim()&&x.name===document.getElementById('shName').value.trim()); if(n)hfkShoeHQ(n.slug); else render('shoes');
    }catch(e){document.getElementById('shoeMsg').textContent=e.message}
  };
}

function hfkIdentify(updateId){
  const u=state.updates.find(x=>x.id===updateId);if(!u)return;
  const c=state.celebrities.find(x=>x.slug===u.celebritySlug);
  const matches=()=>{const q=(document.getElementById('identifySearch')?.value||'').toLowerCase();const a=state.shoes.filter(s=>(s.brand+' '+s.name).toLowerCase().includes(q));document.getElementById('identifyResults').innerHTML=a.map(s=>'<div class="row"><div><h3>'+esc(s.brand+' '+s.name)+'</h3></div><button class="btn secondary" onclick="hfkAssignShoe(&quot;'+esc(s.slug)+'&quot;,&quot;'+esc(updateId)+'&quot;)">Use this shoe</button></div>').join('')||'<p class="muted">No matching shoes.</p>'};
  shell('Identify Shoe','<div class="panel"><h2>'+esc(c?.name||u.celebrityName||'Celebrity')+'</h2><p class="muted">'+esc(u.date||'')+' · '+esc(u.instagramUrl||'')+'</p><a class="btn secondary" target="_blank" rel="noopener" href="'+esc(u.instagramUrl)+'">Open Instagram</a></div><div class="panel"><h2>Find existing shoe</h2><input id="identifySearch" placeholder="Brand or model..." autofocus><div id="identifyResults" class="list"></div></div><div class="panel"><h2>Create new shoe</h2><form id="identifyNew" class="form"><div class="two"><label>Brand<input id="identifyBrand" required></label><label>Model<input id="identifyModel" required></label></div><label>Description<textarea id="identifyDesc"></textarea></label><button class="btn">Create & assign</button><div id="identifyMsg"></div></form></div><button class="btn secondary" onclick="hq(&quot;'+esc(u.celebritySlug)+'&quot;)">← Back</button>');
  document.getElementById('identifySearch').oninput=matches; matches();
  document.getElementById('identifyNew').onsubmit=async e=>{e.preventDefault();try{const brand=identifyBrand.value.trim(),name=identifyModel.value.trim();await api('/api/shoes',{method:'POST',body:JSON.stringify({brand,name,description:identifyDesc.value})});await load();const s=state.shoes.find(x=>x.slug===((brand+' '+name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')));if(!s)throw Error('Created shoe not found');await hfkAssignShoe(s.slug,updateId)}catch(e){notice('identifyMsg',e.message,true)}};
}
async function hfkAssignShoe(shoeSlug,updateId){
  try{await api('/api/updates/'+encodeURIComponent(updateId),{method:'PUT',body:JSON.stringify({celebritySlug:state.updates.find(x=>x.id===updateId).celebritySlug,shoeSlug})});await load();hq(state.updates.find(x=>x.id===updateId).celebritySlug)}catch(e){alert(e.message)}
}

(function(){
  const bar=document.createElement('div');bar.className='quickbar';
  bar.innerHTML='<button onclick="render(&quot;dashboard&quot;)">Home</button><button onclick="render(&quot;command&quot;)">Celebrity HQ</button><button onclick="hfkCapture()">Capture Look</button><button onclick="render(&quot;shoes&quot;)">Shoes</button><button onclick="hfkValidate()">Check</button><button onclick="hfkExport()">Backup</button><input id="hfk-global-search" aria-label="Search HFK" placeholder="Search celebrity or shoe...">';
  const main=document.querySelector('main');main.parentNode.insertBefore(bar,main);
  bar.querySelector('input').addEventListener('input',()=>{
    const q=bar.querySelector('input').value.trim().toLowerCase();
    if(!q)return render('dashboard');
    const cs=state.celebrities.filter(x=>(x.name+' '+(x.instagram||'')).toLowerCase().includes(q));
    const ss=state.shoes.filter(x=>(x.brand+' '+x.name).toLowerCase().includes(q));
    shell('Search','<div class="panel"><p class="muted">'+(cs.length+ss.length)+' result(s)</p></div><div class="panel"><h2>Celebrities</h2>'+(cs.map(x=>'<div class="row"><h3>'+esc(x.name)+'</h3><button class="btn secondary" onclick="hq(&quot;'+esc(x.slug)+'&quot;)">Open HQ</button></div>').join('')||'<p class="muted">No matches.</p>')+'</div><div class="panel"><h2>Shoes</h2>'+(ss.map(x=>'<div class="row"><h3>'+esc(x.brand+' '+x.name)+'</h3><button class="btn secondary" onclick="hfkShoeHQ(&quot;'+esc(x.slug)+'&quot;)">Shoe HQ</button></div>').join('')||'<p class="muted">No matches.</p>')+'</div>');
  });
  window.addEventListener('keydown',e=>{if(e.altKey&&/^[1-7]$/.test(e.key)){e.preventDefault();render(['dashboard','command','updates','posts','celebrities','shoes','affiliates'][Number(e.key)-1])}if(e.ctrlKey&&e.key.toLowerCase()==='k'){e.preventDefault();bar.querySelector('input').focus()}});
})();
window.hfkExport=hfkExport;window.hfkValidate=hfkValidate;window.hfkShoeHQ=hfkShoeHQ;window.hfkIdentify=hfkIdentify;window.hfkAssignShoe=hfkAssignShoe;
