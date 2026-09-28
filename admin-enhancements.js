// HFK Studio productivity layer. Loaded after admin.js so it can extend the local UI without changing the content engine.
const hfkOriginalDashboard=dashboard;
const hfkOriginalCommand=command;
function hfkStats(){
  const missingShoes=state.updates.filter(v=>!v.shoeSlug).length;
  const missingAff=state.shoes.filter(s=>!(s.affiliates||[]).length).length;
  const untouched=state.celebrities.filter(c=>!state.updates.some(v=>v.celebritySlug===c.slug)).length;
  const shopReady=state.updates.filter(v=>v.shoeSlug&&state.shoes.find(s=>s.slug===v.shoeSlug)?.affiliates?.length).length;
  return {missingShoes,missingAff,untouched,shopReady};
}
function dashboard(){
  const x=hfkStats();
  shell('Dashboard',
    '<div class="grid">'+
    '<div class="stat"><strong>'+state.posts.length+'</strong><span>Blog posts</span></div>'+
    '<div class="stat"><strong>'+state.celebrities.length+'</strong><span>Celebrities</span></div>'+
    '<div class="stat"><strong>'+state.shoes.length+'</strong><span>Shoes</span></div>'+
    '<div class="stat"><strong>'+state.updates.length+'</strong><span>Fashion updates</span></div>'+
    '</div>'+\
    '<div class="panel"><h2>Content opportunities</h2><div class="grid">'+
    '<div class="stat"><strong>'+x.untouched+'</strong><span>Celebrities with no looks</span></div>'+\
    '<div class="stat"><strong>'+x.missingShoes+'</strong><span>Looks missing shoe ID</span></div>'+\
    '<div class="stat"><strong>'+x.missingAff+'</strong><span>Shoes missing affiliates</span></div>'+\
    '<div class="stat"><strong>'+x.shopReady+'</strong><span>Shop-ready looks</span></div>'+\
    '</div></div>'+\
    '<div class="panel"><h2>Fast actions</h2><div class="actions"><button class="btn" onclick="render(\'command\')">Celebrity HQ</button><button class="btn secondary" onclick="render(\'updates\')">Batch Update</button><button class="btn secondary" onclick="render(\'posts\')">New Blog Post</button><button class="btn secondary" onclick="render(\'shoes\')">Add Shoe</button></div></div>'+\
    '<div class="panel"><h2>Keyboard shortcuts</h2><p class="muted">Alt+1 Dashboard · Alt+2 Celebrity HQ · Alt+3 Update Desk · Alt+4 Blog Posts</p></div>'
  );
}
window.addEventListener('keydown',e=>{
  if(!e.altKey)return;
  const map={'1':'dashboard','2':'command','3':'updates','4':'posts','5':'celebrities','6':'shoes','7':'affiliates'};
  if(map[e.key]){e.preventDefault();render(map[e.key]);}
});
function hfkExport(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='hfk-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
