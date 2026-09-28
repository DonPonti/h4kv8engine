const fs=require('fs'),path=require('path');
const ROOT=__dirname,DATA=path.join(ROOT,'src/_data/hfk.json'),BLOG=path.join(ROOT,'src/blog');
const d=JSON.parse(fs.readFileSync(DATA,'utf8')),errors=[],warnings=[];
const arr=(k)=>Array.isArray(d[k])?d[k]:[];
for(const k of ['celebrities','shoes','brands','updates'])if(!Array.isArray(d[k]))errors.push('Missing array: '+k);
const seen=(items,label,key='slug')=>{const m=new Map();for(const x of items){const v=x&&x[key];if(!v)errors.push(label+' missing '+key);else if(m.has(v))errors.push('Duplicate '+label+' '+key+': '+v);else m.set(v,x)}};
seen(arr('celebrities'),'Celebrity');seen(arr('shoes'),'Shoe');seen(arr('brands'),'Brand');seen(arr('updates'),'Update','id');
const celeb=new Set(arr('celebrities').map(x=>x.slug)),shoe=new Set(arr('shoes').map(x=>x.slug)),brand=new Set(arr('brands').map(x=>x.slug)),ig=new Map();
for(const u of arr('updates')){
 if(!celeb.has(u.celebritySlug))errors.push('Update '+u.id+' references missing celebrity: '+u.celebritySlug);
 if(u.shoeSlug&&!shoe.has(u.shoeSlug))errors.push('Update '+u.id+' references missing shoe: '+u.shoeSlug);
 if(!/^https:\/\/(www\.)?instagram\.com\/(p|reel|tv)\//i.test(String(u.instagramUrl||'')))errors.push('Update '+u.id+' has invalid Instagram URL');
 const n=String(u.instagramUrl||'').trim().replace(/\/$/,'').toLowerCase();if(n){if(ig.has(n))errors.push('Duplicate Instagram URL in updates: '+n);else ig.set(n,u.id)}
}
for(const s of arr('shoes')){
 if(s.brandSlug&&!brand.has(s.brandSlug))errors.push('Shoe '+s.slug+' references missing brand: '+s.brandSlug);
 if(!Array.isArray(s.affiliates))warnings.push('Shoe '+s.slug+' has no affiliates array');
 for(const a of Array.isArray(s.affiliates)?s.affiliates:[]){
  if(!a.url)errors.push('Shoe '+s.slug+' has affiliate with no URL');
  else if(!/^https?:\/\//i.test(a.url))errors.push('Shoe '+s.slug+' has invalid affiliate URL');
  if(!a.retailer)warnings.push('Shoe '+s.slug+' has affiliate without retailer');
 }
}
for(const c of arr('celebrities'))if(!c.name||!c.slug)errors.push('Celebrity has missing name/slug: '+JSON.stringify(c));
if(!fs.existsSync(BLOG))warnings.push('Blog directory missing: src/blog');
else for(const f of fs.readdirSync(BLOG).filter(x=>x.endsWith('.md'))){
 const raw=fs.readFileSync(path.join(BLOG,f),'utf8');
 if(!/^---[\s\S]*?---/m.test(raw))errors.push('Blog post missing front matter: '+f);
 if(!/^title:\s*.+/m.test(raw))warnings.push('Blog post missing title: '+f);
 if(!/^description:\s*.+/m.test(raw))warnings.push('Blog post missing description: '+f);
}
const summary='HFK DATA CHECK\n'+errors.length+' error(s), '+warnings.length+' warning(s)\n';
if(errors.length){console.error(summary);for(const x of errors)console.error('ERROR: '+x)}
if(warnings.length){for(const x of warnings)console.warn('WARN: '+x)}
if(!errors.length)console.log(summary+'No blocking integrity errors found.');
process.exitCode=errors.length?1:0;