(() => {
  'use strict';

  const SESSION_KEY='hfk-admin-session';
  const token=()=>sessionStorage.getItem(SESSION_KEY)||'';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safe=s=>String(s||'look').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'look';

  async function uploadPhoto(file,id='look'){
    if(!file)return;
    if(!/^image\/(jpeg|png|webp|gif)$/.test(file.type))throw Error('Please choose a JPG, PNG, WebP or GIF image.');
    if(file.size>8*1024*1024)throw Error('Please keep look photos under 8 MB.');
    const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
    const path='src/_img/looks/'+safe(id)+'-'+Date.now()+'.'+ext;
    const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});
    const content=String(dataUrl).split(',')[1];
    const r=await fetch('/.netlify/functions/hfk',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token()},body:JSON.stringify({op:'save',path,content,message:'Add fashion look photo'})});
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

  const originalEdit=window.hfkEditUpdate;
  if(typeof originalEdit==='function'){
    window.hfkEditUpdate=id=>{
      originalEdit(id);
      setTimeout(()=>{
        const field=document.querySelector('#eacc');
        if(field&&/^\$\{ESC\(ACCESSORIESTEXT\(U\.ACCESSORIES\)\)\}$/.test(field.value.trim()))field.value='';
        addPhotoControl('#ue','#eimg',()=>id);
      },30);
    };
  }

  const originalGo=window.hfkGo;
  if(typeof originalGo==='function'){
    window.hfkGo=v=>{
      originalGo(v);
      if(v==='capture')setTimeout(()=>addPhotoControl('#uf','#uimg',()=>document.querySelector('#uc')?.value||'look'),30);
    };
  }
})();
