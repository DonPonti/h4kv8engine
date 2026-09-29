/* HFK Studio reliability layer. Loaded after the main admin bundle. */
(function(){
  const boot=()=>{
    const app=document.getElementById('app');
    if(!app)return;
    window.addEventListener('error',function(e){
      let box=document.getElementById('hfk-runtime-error');
      if(!box){box=document.createElement('div');box.id='hfk-runtime-error';box.className='notice error';box.style.cssText='position:fixed;right:16px;bottom:16px;z-index:99999;max-width:520px;box-shadow:0 8px 30px rgba(0,0,0,.18)';document.body.appendChild(box)}
      box.textContent='HFK Studio error: '+(e.message||'Unknown JavaScript error');
    });
    document.addEventListener('click',function(e){
      const nav=e.target.closest('.nav[data-view]');
      if(nav){e.preventDefault();try{render(nav.dataset.view)}catch(err){console.error(err);alert(err.message)}}
    });
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
