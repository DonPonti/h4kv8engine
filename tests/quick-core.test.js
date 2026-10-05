const q=require('../src/admin/quick.js');
let pass=0,fail=0;const t=(n,c)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n)};
const base=()=>({celebrities:[{name:'Virat Kohli',slug:'virat-kohli',instagram:'virat.kohli',top100Rank:1,updateCount:1},{name:'Priyanka Chopra',slug:'priyanka-chopra',instagram:'priyankachopra'},{name:'Priya Prakash',slug:'priya-prakash'}],
 shoes:[{brand:'Nike',name:'Air Max 90',slug:'nike-air-max-90',brandSlug:'nike',affiliates:[]}],brands:[{name:'Nike',slug:'nike',description:''}],
 updates:[{id:'old1',celebritySlug:'virat-kohli',celebrityName:'Virat Kohli',instagramUrl:'https://www.instagram.com/p/DaDJji0DY_x/',shoeSlug:'',date:'2026-10-01'}]});

// --- link extraction
let r=q.extractInstagram('Check this https://www.instagram.com/p/Dc37-G4DZag/?utm_source=ig_web_copy_link&igsh=abc, and (https://instagram.com/reel/DZZ8lRptve1/). also https://www.instagram.com/reels/AbC_123/ junk https://example.com/p/xx and https://www.instagram.com/p/Dc37-G4DZag/ again');
t('extracts 3 unique valid links',r.length===3);
t('keeps shortcode case',r[0].code==='Dc37-G4DZag');
t('strips tracking params, normalises URL',r[0].url==='https://www.instagram.com/p/Dc37-G4DZag/');
t('handles trailing punctuation + bare domain',r[1].url==='https://www.instagram.com/reel/DZZ8lRptve1/');
t('reels -> reel',r[2].kind==='reel'&&r[2].code==='AbC_123');
t('username-prefixed path works',q.parseIg('https://www.instagram.com/virat.kohli/p/Xy12/?hl=en').code==='Xy12');
t('rejects profile URLs / non-instagram',q.parseIg('https://www.instagram.com/virat.kohli/')===null&&q.parseIg('https://evil.com/p/abc/')===null&&q.parseIg('javascript:alert(1)')===null);
t('rejects host spoof',q.parseIg('https://instagram.com.evil.com/p/abc/')===null);

// --- celebrity lookup
const d0=base();
t('find by exact name (case-insens)',q.findCelebrity(d0,'virat kohli').slug==='virat-kohli');
t('find by @handle',q.findCelebrity(d0,'@priyankachopra').slug==='priyanka-chopra');
t('unique partial match',q.findCelebrity(d0,'kohli').slug==='virat-kohli');
t('ambiguous partial => null',q.findCelebrity(d0,'priya')===null);
t('empty => null',q.findCelebrity(d0,'  ')===null);

// --- shoe resolution
t('existing by "Brand Model"',q.resolveShoe(d0,'nike air max 90').shoe.slug==='nike-air-max-90');
t('Brand | Model create',q.resolveShoe(d0,'New Balance | 550').action==='create');
t('Brand | Model matching existing reuses',q.resolveShoe(d0,'Nike | Air Max 90').action==='existing');
t('unknown shoe w/o pipe => error',!!q.resolveShoe(d0,'Jordan 1').error);
t('half-filled pipe => error',!!q.resolveShoe(d0,'Nike |').error);

// --- batch
let d=base();
let res=q.applyBatch(d,{celebrity:'priyanka-chopra',date:'2026-10-05',occasion:'Airport',rows:[
  {url:'https://www.instagram.com/p/NEWone1/',shoeText:'',confidence:'medium'},
  {url:'https://www.instagram.com/reel/NEWtwo2/',shoeText:'New Balance | 550',confidence:'high'},
  {url:'https://www.instagram.com/p/DaDJji0DY_x/',shoeText:''},   // dup of old1
  {url:'not a url'}]});
t('adds 2, skips dup+invalid',res.added.length===2&&res.skipped.length===2);
t('new looks at top in paste order',d.updates[0].instagramUrl.endsWith('NEWone1/')&&d.updates[1].instagramUrl.endsWith('NEWtwo2/')&&d.updates[2].id==='old1');
t('no shoe => unidentified',d.updates[0].confidence==='unidentified'&&d.updates[0].shoeSlug==='');
t('shoe => keeps chosen confidence + names',d.updates[1].confidence==='high'&&d.updates[1].shoeName==='New Balance 550'&&d.updates[1].shoeSlug==='new-balance-550');
t('created shoe + brand with correct schema',d.shoes.some(s=>s.slug==='new-balance-550'&&s.brandSlug==='new-balance'&&Array.isArray(s.affiliates))&&d.brands.some(b=>b.slug==='new-balance'));
t('reports created shoes',res.createdShoes[0]==='New Balance 550');
t('celeb updateCount recomputed',d.celebrities[1].updateCount===2&&d.celebrities[0].updateCount===1);
t('fields match site schema',['id','celebritySlug','celebrityName','instagramUrl','date','occasion','sourceType','accessories','confidence','image'].every(k=>k in d.updates[0])&&d.updates[0].sourceType==='instagram'&&d.updates[0].date==='2026-10-05'&&d.updates[0].occasion==='Airport');
t('ids unique',new Set(d.updates.map(u=>u.id)).size===d.updates.length);

// atomicity: a bad shoe in row 2 must not partially mutate
d=base();const snap=JSON.stringify(d);
let threw=false;try{q.applyBatch(d,{celebrity:'virat-kohli',rows:[{url:'https://www.instagram.com/p/A1/'},{url:'https://www.instagram.com/p/B2/',shoeText:'Jordan 1'}]})}catch(e){threw=/catalog/.test(e.message)}
t('bad shoe aborts with no partial changes',threw&&JSON.stringify(d)===snap);
threw=false;try{q.applyBatch(d,{celebrity:'virat-kohli',rows:[{url:'https://www.instagram.com/p/DaDJji0DY_x/'}]})}catch(e){threw=/Nothing new/.test(e.message)}
t('all-duplicates => clear error',threw);
threw=false;try{q.applyBatch(d,{celebrity:'nobody',rows:[{url:'https://www.instagram.com/p/Q/'}]})}catch(e){threw=/Celebrity not found/.test(e.message)}
t('unknown celebrity => error',threw);

// --- identify + undo
d=base();
let ri=q.applyIdentify(d,[{id:'old1',shoeText:'Nike | Air Max 90',confidence:'high'},{id:'ghost',shoeText:'x'},{id:'old1',shoeText:''}]);
t('identify sets shoe on existing look',ri.changed===1&&d.updates[0].shoeSlug==='nike-air-max-90'&&d.updates[0].confidence==='high'&&d.shoes.length===1);
threw=false;try{q.applyIdentify(d,[{id:'old1',shoeText:''}])}catch(e){threw=true}
t('identify with nothing filled => error',threw);
d=base();res=q.applyBatch(d,{celebrity:'virat-kohli',rows:[{url:'https://www.instagram.com/p/U1/'},{url:'https://www.instagram.com/p/U2/'}]});
t('count after add',d.celebrities[0].updateCount===3);
t('undo removes exactly the batch',q.undoBatch(d,res.added)===2&&d.updates.length===1&&d.updates[0].id==='old1'&&d.celebrities[0].updateCount===1);

console.log(`
${pass} passed, ${fail} failed`);process.exit(fail?1:0);
