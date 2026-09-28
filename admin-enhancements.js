// HFK Studio productivity layer: global search, opportunity queues, shortcuts and backup.
function hfkStats(){
  const missingShoes=state.updates.filter(v=>!v.shoeSlug).length;
  const missingAff=state.shoes.filter(s=>!(s.affiliates||[]).length).length;
  const untouched=state.celebrities.filter(c=>!state.updates.some(v=>v.celebritySlug===c.slug)).length;
  const shopReady=state.updates.filter(v=>v.shoeSlug&&state.shoes.find(s=>s.slug===v.shoeSlug)?.affiliates?.length).length;
  return {missingShoes,missingAff,untouched,shopReady};
}
function dashboard(){const now=Date.now(),staleDays=30;const x=hfkStats();const stale=state.celebrities.filter(c=>{const a=state.updates.filter(v=>v.celebritySlug===c.slug).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))[0];return !a||!a.date||(now-new Date(a.date).getTime()>staleDays*86400000)}).length;const recent=state.updates.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,8);shell('Dashboard','<div class="grid"><div class="stat"><strong>'+state.posts.length+'</strong><span>Blog posts</span></div><div class="stat"><strong>'+state.celebrities.length+'</strong><span>Celebrities</span></div><div class="stat"><strong>'+state.shoes.length+'</strong><span>Shoes</span></div><div class="stat"><strong>'+state.updates.length+'</strong><span>Fashion updates</span></div></div><div class="panel"><h2>Content opportunities</h2><div class="grid"><div class="stat clickable" data-action="untouched"><strong>'+x.untouched+'</strong><span>Celebrities with no looks</span></div><div class="stat clickable" data-action="missing-shoes"><strong>'+x.missingShoes+'</strong><span>Looks missing shoe ID</span></div><div class="stat clickable" data-action="missing-aff"><strong>'+x.missingAff+'</strong><span>Shoes missing affiliates</span></div><div class="stat"><strong>'+stale+'</strong><span>Profiles stale 30+ days</span></div></div></div><div class="panel"><h2>Recent looks</h2><div class="list">'+recent.map(v=>'<div class="row"><div><b>'+esc(v.celebrityName||v.celebritySlug||'Unknown')+'</b><span>'+esc(v.shoeName||'Shoe not identified')+'</span></div><small>'+esc(v.date||'No date')+'</small></div>').join('')+'</div></div><div class="panel"><h2>Fast actions</h2><div class="actions"><button class="btn" onclick="render('command')">Celebrity HQ</button><button class="btn secondary" onclick="render('updates')">Batch Update</button><button class="btn secondary" onclick="render('posts')">New Blog Post</button><button class="btn secondary" onclick="render('shoes')">Add Shoe</button><button class="btn secondary" onclick="hfkExport()">Backup JSON</button></div></div><div class="panel"><h2>Shortcuts</h2><p class="muted">Alt+1–7 switches sections · Ctrl+K opens global search</p></div>');document.querySelectorAll('[data-action]').forEach(el=>el.onclick=()=>hfkQueue(el.dataset.action));}
function hfkQueue(type){
  let title='',items=[];
  if(type==='untouched'){title='Celebrities with no looks';items=state.celebrities.filter(c=>!state.updates.some(v=>v.celebritySlug===c.slug)).map(c=>'<div class="row"><div><h3>'+esc(c.name)+'</h3><small>No fashion updates tracked yet</small></div><button class="btn secondary" onclick="hq(\''+esc(c.slug)+'\')">Open HQ</button></div>')}
  if(type==='missing-shoes'){title='Looks missing shoe identification';items=state.updates.filter(v=>!v.shoeSlug).map(v=>'<div class="row"><div><h3>'+esc(v.celebrityName)+'</h3><small>'+esc(v.date)+' · '+esc(v.instagramUrl)+'</small></div><a class="btn secondary" target="_blank" rel="noopener" href="'+esc(v.instagramUrl)+'">Open Instagram</a></div>')}
  if(type==='missing-aff'){title='Shoes missing affiliate offers';items=state.shoes.filter(s=>!(s.affiliates||[]).length).map(s=>'<div class="row"><div><h3>'+esc(s.brand+' '+s.name)+'</h3></div><button class="btn secondary" onclick="editAff(\''+esc(s.slug)+'\')">Add affiliate</button></div>')}
  shell(title,'<div class="panel"><button class="btn secondary" onclick="render(\'dashboard\')">← Dashboard</button></div><div class="list">'+(items.join('')||'<div class="panel">Nothing in this queue.</div>')+'</div>');
}
function hfkSearch(){
  const input=document.getElementById('hfk-global-search');if(!input)return;
  const q=input.value.trim().toLowerCase();
  if(!q){render('dashboard');return}
  const cs=state.celebrities.filter(x=>(x.name+' '+x.instagram).toLowerCase().includes(q));
  const ss=state.shoes.filter(x=>(x.brand+' '+x.name).toLowerCase().includes(q));
  const us=state.updates.filter(x=>(x.celebrityName+' '+x.shoeName+' '+x.occasion+' '+x.instagramUrl).toLowerCase().includes(q));
  shell('Search','<div class="panel"><p class="muted">'+(cs.length+ss.length+us.length)+' result(s)</p></div><div class="panel"><h2>Celebrities</h2>'+(cs.map(x=>'<div class="row"><div><h3>'+esc(x.name)+'</h3></div><button class="btn secondary" onclick="hq(\''+esc(x.slug)+'\')">Open HQ</button></div>').join('')||'<p class="muted">No matches.</p>')+'</div><div class="panel"><h2>Shoes</h2>'+(ss.map(x=>'<div class="row"><div><h3>'+esc(x.brand+' '+x.name)+'</h3></div><button class="btn secondary" onclick="editAff(\''+esc(x.slug)+'\')">Affiliates</button></div>').join('')||'<p class="muted">No matches.</p>')+'</div><div class="panel"><h2>Updates</h2>'+(us.slice(0,30).map(x=>'<div class="row"><div><h3>'+esc(x.celebrityName)+' · '+esc(x.shoeName||'Unknown shoe')+'</h3><small>'+esc(x.date)+' · '+esc(x.occasion||'')+'</small></div><a class="btn secondary" target="_blank" rel="noopener" href="'+esc(x.instagramUrl)+'">Instagram</a></div>').join('')||'<p class="muted">No matches.</p>')+'</div>');
}
function hfkExport(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='hfk-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
(function(){
  const bar=document.createElement('div');bar.className='quickbar';
  bar.innerHTML='<button onclick="render(\'command\')">HQ</button><button onclick="render(\'updates\')">Quick Update</button><button onclick="render(\'posts\')">New Post</button><button onclick="hfkExport()">Backup</button><input id="hfk-global-search" aria-label="Search HFK" placeholder="Search celebrity, shoe, update...">';
  const main=document.querySelector('main');main.parentNode.insertBefore(bar,main);
  bar.querySelector('input').addEventListener('input',hfkSearch);
  window.addEventListener('keydown',e=>{if(e.altKey&&/^[1-7]$/.test(e.key)){e.preventDefault();render(['dashboard','command','updates','posts','celebrities','shoes','affiliates'][Number(e.key)-1])}if(e.ctrlKey&&e.key.toLowerCase()==='k'){e.preventDefault();bar.querySelector('input').focus()}});
})();
