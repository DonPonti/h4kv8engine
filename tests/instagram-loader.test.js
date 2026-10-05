const {JSDOM}=require('jsdom'),fs=require('fs');
const root=require('path').join(__dirname,'..')+'/';
let pass=0,fail=0;const t=(n,c)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n)};
const html='<!doctype html><body><div class="ig-embed" data-ig-kind="p" data-ig-code="DaDJji0DY_x"><div class="ig-stage"></div><a class="ig-open" href="#">x</a></div><div class="ig-embed" data-ig-kind="reel" data-ig-code="DZZ8lRptve1"><div class="ig-stage"></div><a class="ig-open" href="#">x</a></div></body>';
const code=fs.readFileSync(root+'src/_js/instagram.js','utf8');

async function run({withIO}){
  const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://huntingforkicks.com/celebrities/virat-kohli/'});
  const w=dom.window;
  let observed=[];
  if(withIO){w.IntersectionObserver=function(cb){this.observe=el=>observed.push(el);this.unobserve=()=>{};this._cb=cb;w.__io=this}}
  w.eval(code);
  if(w.document.readyState!=='complete')await new Promise(r=>w.addEventListener('load',r));
  return {w,observed};
}
(async()=>{
// 1) no IntersectionObserver => mounts immediately
{
  const {w}=await run({withIO:false});
  const frames=w.document.querySelectorAll('iframe.ig-frame');
  t('mounts 2 iframes (no IO)',frames.length===2);
  const f=frames[0];
  t('src is captioned embed URL',/^https:\/\/www\.instagram\.com\/p\/DaDJji0DY_x\/embed\/captioned\/\?/.test(f.src));
  t('src preserves shortcode case exactly',f.src.includes('DaDJji0DY_x'));
  t('reel uses /reel/ path',frames[1].src.includes('/reel/DZZ8lRptve1/embed/captioned/'));
  t('src carries referrer domain',f.src.includes('rd='+encodeURIComponent('https://huntingforkicks.com')));
  t('starts with a sane height',f.style.height==='640px');
  t('host is in loading state',f.parentNode.classList.contains('ig-loading'));
  // MEASURE from the right frame (JSON string, like Instagram sends)
  const send=(src,origin,data)=>w.dispatchEvent(new w.MessageEvent('message',{origin,source:src,data}));
  send(f.contentWindow,'https://evil.example',JSON.stringify({type:'MEASURE',details:{height:910}}));
  t('ignores foreign origin',f.style.height==='640px');
  send(f.contentWindow,'https://www.instagram.com',JSON.stringify({type:'MEASURE',details:{height:910.4}}));
  t('resizes to reported height (ceil)',f.style.height==='911px');
  t('marks live, disables scrolling',f.parentNode.classList.contains('ig-live')&&f.getAttribute('scrolling')==='no');
  t('other frame untouched',frames[1].style.height==='640px');
  send(frames[1].contentWindow,'https://www.instagram.com',{type:'MEASURE',details:{height:99999}});
  t('accepts object payload and clamps max',frames[1].style.height==='2600px');
  send(frames[1].contentWindow,'https://www.instagram.com','not json');
  send(frames[1].contentWindow,'https://www.instagram.com',JSON.stringify({type:'OTHER'}));
  t('garbage messages do not throw',true);
}
// 2) with IntersectionObserver => lazy
{
  const {w,observed}=await run({withIO:true});
  t('lazy: nothing mounted before visible',w.document.querySelectorAll('iframe.ig-frame').length===0&&observed.length===2);
  w.__io._cb([{isIntersecting:false,target:observed[0]}]);
  t('lazy: not intersecting => still nothing',w.document.querySelectorAll('iframe.ig-frame').length===0);
  w.__io._cb([{isIntersecting:true,target:observed[0]}]);
  t('lazy: intersecting mounts only that embed',w.document.querySelectorAll('iframe.ig-frame').length===1);
  w.HFKInstagram.mount(observed[0]);
  t('mount is idempotent',w.document.querySelectorAll('iframe.ig-frame').length===1);
}
// 3) slow hint
{
  const {w}=await run({withIO:false});
  t('slow class not set immediately',!w.document.querySelector('.ig-embed').classList.contains('ig-slow'));
}
// 4) malicious attributes are not mounted
{
  const dom=new JSDOM('<div class="ig-embed" data-ig-kind="p" data-ig-code="x&quot; onload=&quot;alert(1)"><div class="ig-stage"></div></div><div class="ig-embed" data-ig-kind="evil" data-ig-code="abc"></div>',{runScripts:'outside-only'});
  dom.window.eval(code);await new Promise(r=>setTimeout(r,50));
  t('rejects bad code / bad kind',dom.window.document.querySelectorAll('iframe').length===0);
}
console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);
})();
