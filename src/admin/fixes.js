(() => {
  'use strict';

  const SESSION_KEY='hfk-admin-session';
  const token=()=>sessionStorage.getItem(SESSION_KEY)||'';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safe=s=>String(s||'look').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'look';

  const b64=s=>{const bytes=new TextEncoder().encode(s);let bin='';bytes.forEach(x=>bin+=String.fromCharCode(x));return btoa(bin)};
  const fromB64=s=>{const bin=atob(String(s).replace(/\n/g,''));const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));return new TextDecoder().decode(bytes)};

  function normalizeInstagramPreserveCase(value){
    try{
      const u=new URL(String(value||'').trim());
      const host=u.hostname.toLowerCase();
      if(host!=='instagram.com'&&host!=='www.instagram.com')return '';
      const parts=u.pathname.split('/').filter(Boolean);
      const index=parts.findIndex(p=>['p','reel','reels','tv'].includes(p.toLowerCase()));
      if(index<0||!parts[index+1])return '';
      let type=parts[index].toLowerCase();
      if(type==='reels')type='reel';
      const code=parts[index+1];
      if(!/^[A-Za-z0-9_-]+$/.test(code))return '';
      return 'https://www.instagram.com/'+type+'/'+code+'/';
    }catch{return ''}
  }

  function parseAccessories(text){
    return String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(line=>{
      const parts=line.split('|').map(x=>x.trim());
      return {category:parts[0]||'Accessory',brand:parts[1]||'',name:parts[2]||parts[1]||'Item'};
    }).filter(x=>x.name&&x.name!=='${ESC(ACCESSORIESTEXT(U.ACCESSORIES))}');
  }

  function cleanAccessories(items){
    if(!Array.isArray(items))return [];
    return items.filter(item=>{
      if(!item||typeof item!=='object')return false;
      const text=[item.category,item.brand,item.name].filter(Boolean).join(' ');
      return !/\$\{\s*ESC\s*\(\s*ACCESSORIESTEXT\s*\(\s*U\.ACCESSORIES\s*\)\s*\)\s*\}/i.test(text);
    });
  }

  async function getState(){
    const r=await fetch('/.netlify/functions/hfk?op=state',{headers:{Authorization:'Bearer '+token()}});
    const d=await r.json();
    if(!r.ok)throw Error(d.error||'Could not load HFK data');
    return {sha:d.sha,state:JSON.parse(fromB64(d.content))};
  }

  async function saveState(state,sha,message){
    const content=JSON.stringify(state,null,2)+'\n';
    const r=await fetch('/.netlify/functions/hfk',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},body:JSON.stringify({op:'save',path:'src/_data/hfk.json',content:b64(content),sha,message})});
    const d=await r.json();
    if(!r.ok)throw Error(d.error||'Could not save HFK data');
    return d;
  }

  async function uploadPhoto(file,id='look'){
    if(!file)return;
    if(!/^image\/(jpeg|png|webp|gif)$/.test(file.type))throw Error('Please choose a JPG, PNG, WebP or GIF image.');
    if(file.size>3.5*1024*1024)throw Error('Please keep look photos under 3.5 MB (the hosting function limit). Compress the image and try again.');
    const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'}[file.type]||'jpg';
    const path='src/_img/looks/'+safe(id)+'-'+Date.now()+'.'+ext;
    const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});
    const content=String(dataUrl).split(',')[1];
    const r=await fetch('/.netlify/functions/hfk',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},body:JSON.stringify({op:'save',path,content,message:'Add fashion look photo'})});
    const d=await r.json();if(!r.ok)throw Error(d.error||'Photo upload failed');
    return '/'+path;
  }

  function addPhotoControl(formSelector,imageSelector,slugSource){
    const form=document.querySelector(formSelector),image=document.querySelector(imageSelector);
    if(!form||!image||form.querySelector('.hfk-photo-upload'))return;
    const wrap=document.createElement('div');
    wrap.className='hfk-photo-upload panel';
    wrap.innerHTML='<div class="sectionTitle"><h2>Look photo</h2><span class="hint">Stored in GitHub</span></div><p class="hint">Upload the actual fashion photo here. The Instagram URL remains the source link; this photo is what HFK displays reliably on the page.</p><input class="hfk-photo-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif"><div class="hfk-photo-status"></div>';
    image.parentElement.insertAdjacentElement('afterend',wrap);
    const input=wrap.querySelector('.hfk-photo-file'),status=wrap.querySelector('.hfk-photo-status');
    input.onchange=async()=>{
      const file=input.files?.[0];if(!file)return;
      status.innerHTML='<span class="hint">Uploading photo…</span>';
      try{
        const url=await uploadPhoto(file,slugSource());
        image.value=url;
        image.dispatchEvent(new Event('input',{bubbles:true}));
        status.innerHTML='<div class="notice success">Photo uploaded and attached to this look. Save the look to finish.</div>';
      }catch(e){status.innerHTML='<div class="notice error">'+esc(e.message)+'</div>'}
    };
  }

  function flash(form,text,type='success'){
    let el=form.querySelector('.hfk-fix-message');
    if(!el){el=document.createElement('div');el.className='hfk-fix-message';form.appendChild(el)}
    el.innerHTML='<div class="notice '+type+'">'+esc(text)+'</div>';
  }

  function readLookForm(form){
    return {
      celebritySlug:form.querySelector('#uc,#ec')?.value.trim()||'',
      date:form.querySelector('#ud,#ed')?.value.trim()||'',
      sourceType:form.querySelector('#ust,#est')?.value.trim()||'instagram',
      instagramUrl:normalizeInstagramPreserveCase(form.querySelector('#ui,#ei')?.value||''),
      sourceUrl:form.querySelector('#usrc,#esrc')?.value.trim()||'',
      occasion:form.querySelector('#uo,#eo')?.value.trim()||'',
      sourceName:form.querySelector('#usn,#esn')?.value.trim()||'',
      image:form.querySelector('#uimg,#eimg')?.value.trim()||'',
      imageCredit:form.querySelector('#ucr,#ecr')?.value.trim()||'',
      description:form.querySelector('#udesc,#edesc')?.value.trim()||'',
      confidence:form.querySelector('#uconf,#econf')?.value.trim()||'unidentified',
      identificationNotes:form.querySelector('#unotes,#enotes')?.value.trim()||'',
      accessories:parseAccessories(form.querySelector('#uacc,#eacc')?.value||''),
      shoeSlug:form.querySelector('#us,#es')?.value.trim()||''
    };
  }

  async function saveNewLook(form){
    const values=readLookForm(form);
    if(!values.celebritySlug)throw Error('Choose a celebrity first.');
    if(values.sourceType==='instagram'&&!values.instagramUrl)throw Error('Enter a valid Instagram post/reel URL.');
    const loaded=await getState(),state=loaded.state;
    const celebrity=(state.celebrities||[]).find(c=>c.slug===values.celebritySlug);
    if(!celebrity)throw Error('The selected celebrity no longer exists.');
    if(values.instagramUrl&&state.updates.some(u=>normalizeInstagramPreserveCase(u.instagramUrl)===values.instagramUrl))throw Error('This Instagram look is already tracked.');
    const shoe=(state.shoes||[]).find(s=>s.slug===values.shoeSlug);
    const id=crypto.randomUUID?crypto.randomUUID():('look-'+Date.now().toString(36));
    const update={id,celebritySlug:celebrity.slug,celebrityName:celebrity.name,date:values.date||new Date().toISOString().slice(0,10),sourceType:values.sourceType,instagramUrl:values.instagramUrl,sourceUrl:values.sourceUrl,occasion:values.occasion,sourceName:values.sourceName,image:values.image,imageCredit:values.imageCredit,description:values.description,confidence:values.confidence,identificationNotes:values.identificationNotes,accessories:values.accessories,shoeSlug:shoe?.slug||'',shoeName:shoe?shoe.name:''};
    state.updates=Array.isArray(state.updates)?state.updates:[];
    state.updates.unshift(update);
    celebrity.updateCount=(Number(celebrity.updateCount)||0)+1;
    await saveState(state,loaded.sha,'Add fashion look: '+celebrity.name);
    flash(form,'Saved. The Instagram URL was stored without changing its case.','success');
    setTimeout(()=>{if(typeof window.hfkGo==='function')window.hfkGo('updates')},500);
  }

  async function saveEditedLook(form,id){
    const values=readLookForm(form);
    const loaded=await getState(),state=loaded.state;
    const update=(state.updates||[]).find(u=>u.id===id);
    if(!update)throw Error('This fashion look could not be found.');
    if(values.sourceType==='instagram'&&!values.instagramUrl)throw Error('Enter a valid Instagram post/reel URL.');
    const oldSlug=update.celebritySlug;
    const celebrity=(state.celebrities||[]).find(c=>c.slug===values.celebritySlug);
    if(!celebrity)throw Error('The selected celebrity no longer exists.');
    if(values.instagramUrl&&state.updates.some(u=>u.id!==id&&normalizeInstagramPreserveCase(u.instagramUrl)===values.instagramUrl))throw Error('Another look already uses this Instagram URL.');
    const shoe=(state.shoes||[]).find(s=>s.slug===values.shoeSlug);
    Object.assign(update,values,{celebritySlug:celebrity.slug,celebrityName:celebrity.name,shoeName:shoe?shoe.name:'',shoeSlug:shoe?.slug||''});
    if(oldSlug!==celebrity.slug){
      const oldCelebrity=(state.celebrities||[]).find(c=>c.slug===oldSlug);
      if(oldCelebrity)oldCelebrity.updateCount=Math.max(0,(Number(oldCelebrity.updateCount)||0)-1);
      celebrity.updateCount=(Number(celebrity.updateCount)||0)+1;
    }
    await saveState(state,loaded.sha,'Update fashion look: '+celebrity.name);
    flash(form,'Saved. The Instagram URL was stored exactly as entered.','success');
    setTimeout(()=>{if(typeof window.hfkGo==='function')window.hfkGo('updates')},500);
  }

  function bindCaptureSave(){
    const form=document.querySelector('#uf');
    if(!form||form.dataset.hfkSaveBound)return;
    form.dataset.hfkSaveBound='1';
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      const button=form.querySelector('button[type="submit"],button.btn:not(.secondary)');
      if(button)button.disabled=true;
      try{await saveNewLook(form)}catch(e){flash(form,e.message,'error');if(button)button.disabled=false}
    },true);
  }

  function bindEditSave(){
    const form=document.querySelector('#ue');
    if(!form||form.dataset.hfkSaveBound)return;
    const id=form.dataset.lookId||window.__hfkEditingLookId;
    if(!id)return;
    form.dataset.hfkSaveBound='1';
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      const button=form.querySelector('button[type="submit"],button.btn:not(.secondary)');
      if(button)button.disabled=true;
      try{await saveEditedLook(form,id)}catch(e){flash(form,e.message,'error');if(button)button.disabled=false}
    },true);
  }

  function bindForms(){bindCaptureSave();bindEditSave()}

  const originalEdit=window.hfkEditUpdate;
  if(typeof originalEdit==='function'){
    window.hfkEditUpdate=id=>{
      window.__hfkEditingLookId=id;
      originalEdit(id);
      setTimeout(()=>{
        const field=document.querySelector('#eacc');
        if(field&&/^\$\{ESC\(ACCESSORIESTEXT\(U\.ACCESSORIES\)\)\}$/.test(field.value.trim()))field.value='';
        const form=document.querySelector('#ue');
        if(form)form.dataset.lookId=id;
        addPhotoControl('#ue','#eimg',()=>id);
        bindForms();
      },60);
    };
  }

  const originalGo=window.hfkGo;
  if(typeof originalGo==='function'){
    window.hfkGo=v=>{
      originalGo(v);
      if(v==='capture')setTimeout(()=>{addPhotoControl('#uf','#uimg',()=>document.querySelector('#uc')?.value||'look');bindForms()},60);
    };
  }

  const observer=new MutationObserver(()=>bindForms());
  observer.observe(document.body,{childList:true,subtree:true});

  // One-time repair for the exact Instagram URL supplied from Instagram's share/embed code.
  // The old admin normalised the shortcode to lowercase, which can turn a valid shortcode into a different post.
  (async()=>{
    try{
      const loaded=await getState(),state=loaded.state;
      let changed=false;
      const knownCaseFixes={
        'https://www.instagram.com/p/dc37-g4dzag/':'https://www.instagram.com/p/Dc37-G4DZag/'
      };
      for(const update of state.updates||[]){
        const current=String(update.instagramUrl||'').trim();
        const fixed=knownCaseFixes[current];
        if(fixed){update.instagramUrl=fixed;changed=true}
        if(Array.isArray(update.accessories)){
          const cleaned=cleanAccessories(update.accessories);
          if(cleaned.length!==update.accessories.length){update.accessories=cleaned;changed=true}
        }
      }
      if(changed)await saveState(state,loaded.sha,'Repair Instagram URLs and accessory data');
    }catch{}
  })();
})();
