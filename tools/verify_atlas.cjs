// Offline checks for data integrity, asset references, rendered SVG and UI state transitions.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../docs'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const vectors=read('data/vectors.json'),research=read('data/research.json'),rasters=read('data/rasters.json'),assets=read('research-figures/research-assets-manifest.json');
assert.equal(vectors.sites.length,5066);assert.equal(vectors.provinces.features.length,34);
assert.equal(research.national.provinces.reduce((s,p)=>s+p.count,0),5058);
assert.equal(research.chronology.groups.reduce((s,g)=>s+g.siteIds.length,0),273);
assert.equal(new Set(research.chronology.groups.flatMap(g=>g.siteIds)).size,273);
const known=new Set(vectors.sites.map(p=>String(p.id)));
for(const g of research.chronology.groups)for(const id of g.siteIds)assert(known.has(String(id)));
assert.equal(vectors.sites.filter(p=>p.city==='杭州市'&&p.elevation!=null).length,46);
for(const p of research.national.provinces)assert(Math.abs(p.share-100*p.count/5058)<1e-8);
for(const a of assets){assert(fs.existsSync(path.join(root,'research-figures',a.file)));assert(fs.existsSync(path.join(root,'research-figures',a.thumbnail)));}
const nodes=new Map(),events={};let interval,intervalMs,drawn;
class Element{
  constructor(id){this.id=id;this.innerHTML='';this.textContent='';this.hidden=false;this.style={};this.dataset={};this.events={};this.classList={toggle(){}};}
  setAttribute(k,v){this[k]=v;} addEventListener(k,f){this.events[k]=f;}
  querySelector(s){return s==='#atlas-camera'?get('atlas-camera'):null;}
  getBoundingClientRect(){return {left:0,top:0,width:720,height:540};}
  showModal(){this.open=true;}close(){this.open=false;}click(){this.onclick?.();}
}
function get(id){if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);}
const doc={getElementById:get,querySelectorAll(){return [];},addEventListener(k,f){events['doc:'+k]=f;}};
const context=vm.createContext({document:doc,console,Map,Set,WeakMap,ResizeObserver:class{observe(){}},
  fetch:async f=>({ok:true,json:async()=>read(f)}),
  setInterval(f,ms){interval=f;intervalMs=ms;return 1;},clearInterval(){interval=null;}});
context.window=context;context.scrollTo=()=>{};context.addEventListener=(k,f)=>events[k]=f;
let hash='#national';context.location={get hash(){return hash;},set hash(v){hash=v;events.hashchange?.();}};
vm.runInContext(fs.readFileSync(path.join(root,'raster-assets.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(root,'periods.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(root,'map-view.js'),'utf8'),context);
const actualDraw=context.drawAtlasMap;context.drawAtlasMap=s=>{drawn=s;actualDraw(s);};
vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),context);
const change=(id,value)=>get('filterBody').events.change({target:{id,value}});
const action=(a,v='')=>events['doc:click']({target:{closest(s){return s==='[data-action]'?{dataset:{action:a,value:v}}:null;}}});
(async()=>{
  for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));
  assert(get('pageTitle').textContent.includes('全国'));assert(get('metrics').innerHTML.includes('5,058'));
  assert(get('map').innerHTML.includes('南海诸岛'));assert(get('map').innerHTML.includes('531处'));
  assert(!/NaN|undefined/.test(get('map').innerHTML));
  change('region','浙江省');assert(get('details').innerHTML.includes('278处'));assert(get('details').innerHTML.includes('5.50%'));
  change('region','台湾省');assert(!get('metrics').innerHTML.includes('NaN'));
  change('region','');change('nationalView','heat');assert(get('map').innerHTML.includes('data:image/png;base64,'));
  change('nationalView','points');assert.equal(drawn.points.length,5066);assert.equal((get('map').innerHTML.match(/<circle /g)||[]).length,5066);
  assert(get('filterBody').innerHTML.includes('文保类型'));
  for(const type of new Set(vectors.sites.map(p=>p.type))){
    change('type',type);assert.equal(drawn.nationalView,'points');
    assert.equal(drawn.points.length,vectors.sites.filter(p=>p.type===type).length);
    assert(drawn.points.every(p=>p.type===type));
    change('region','浙江省');assert.equal(drawn.points.length,vectors.sites.filter(p=>p.province==='浙江省'&&p.type===type).length);
    assert(get('map').innerHTML.includes('aria-label="河北省，0处"'));
    change('region','');
  }
  change('region','澳门特别行政区');assert.equal(drawn.points.length,0);assert(get('details').innerHTML.includes('没有收录'));
  change('region','');change('nationalView','heat');assert.equal(drawn.points.length,0);assert(get('filterBody').innerHTML.includes('value="" selected'));
  change('nationalView','points');assert.equal(drawn.points.length,5066);
  context.location.hash='#chronology';assert.equal(drawn.points.length,279);
  const normalized=context.buildAtlasPeriods(vectors.sites.filter(p=>p.province==='浙江省'),research.chronology);
  assert.equal(normalized.classifiedTotal,274);assert.equal(normalized.pendingTotal,5);
  assert.equal(new Set(normalized.categories.map(c=>c.color)).size,15);
  assert.equal(normalized.sites.find(p=>p.name==='王店粮仓群').period,'新中国成立以来');
  assert.equal(normalized.sites.find(p=>p.name==='西泠印社').period,'待核对');
  const expectedGroups=[23,8,11,22,61,149];
  for(const [i,g] of research.chronology.groups.entries()){change('period',g.id);assert.equal(drawn.points.length,expectedGroups[i],g.name);}
  change('period','');
  const periodCounts=[3,20,2,6,6,5,13,9,45,16,57,69,19,4,5];
  for(const [i,c] of normalized.categories.entries()){
    change('era',c.name);assert.equal(drawn.points.length,periodCounts[i],c.name);
    assert(drawn.points.every(p=>p.period===c.name&&p.periodColor===c.color));
    assert(get('map').innerHTML.includes('fill="'+c.color+'"'));
    assert(get('mapLegend').innerHTML.includes(c.name+' · '+periodCounts[i]));
  }
  action('play');assert.equal(intervalMs,1200);const before=drawn.points.map(p=>p.id).join();interval();assert.notEqual(drawn.points.map(p=>p.id).join(),before);action('play');assert.equal(interval,null);
  context.location.hash='#terrain';assert.equal(drawn.points.length,47);assert(get('map').innerHTML.includes('data:image/png;base64,'));
  assert(get('filterBody').innerHTML.includes('年代分类'));assert(!get('filterBody').innerHTML.includes('value="南宋"'));
  change('era','宋');assert.equal(drawn.points.length,9);assert(drawn.points.some(p=>p.era==='宋至元'));assert(drawn.points.some(p=>p.era==='南宋'));
  change('type','古遗址');assert(drawn.points.length>0);assert(drawn.points.every(p=>p.type==='古遗址'&&p.period==='宋'));
  change('band','missing');assert.equal(drawn.points.length,0);assert(get('details').innerHTML.includes('没有点位'));
  change('type','');change('era','');change('band','');
  change('era','待核对');assert.equal(drawn.points.length,3);change('era','');
  change('band','missing');assert.equal(drawn.points.length,1);change('band','');
  action('point',String(drawn.points[0].id));assert(get('pointName').textContent);assert(get('pointEra').textContent);
  get('zoomIn').click();assert(get('atlas-camera').transform.includes('scale(1.5)'));get('fitMap').click();assert(get('atlas-camera').transform.includes('scale(1)'));
  context.location.hash='#river';for(const g of research.river.groups){change('buffer',g.id);assert(drawn.bufferGeometry);assert(get('map').innerHTML.includes('fill-opacity=".32"'));}
  assert(get('bars').innerHTML.includes('126'));assert(get('bars').innerHTML.includes('4.56'));
  context.location.hash='#culture';assert(get('pending').innerHTML.includes('225'));
  context.location.hash='#poi';assert(get('pending').innerHTML.includes('尚未找到'));
  assert.equal((get('researchGallery').innerHTML.match(/<figure /g)||[]).length,9);
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');for(const m of html.matchAll(/(?:src|href)="([^"#?]+)(?:\?[^"#]*)?"/g)){if(!m[1].startsWith('http'))assert(fs.existsSync(path.join(root,m[1])),m[1]);}
  console.log('PASS: national type + province filters; 14 distinct period colors and pending category; earliest-era and raw-era details; Hangzhou era + type + elevation filters; 1200ms playback; 34 regions; 5066 records / 5058 spatial counts; all assets; heat and DEM; popups; zoom; 3 source buffers.');
})().catch(e=>{console.error(e);process.exitCode=1;});
