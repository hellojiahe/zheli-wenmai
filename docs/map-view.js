/* The same lon/lat transform is used for vector paths, points and raster bounds. */
(() => {
  'use strict';
  const W = 720, H = 540, KM_PER_DEG = 111.195;
  const byId = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const fixed = x => x.toFixed(2);
  const features = value => Array.isArray(value) ? value : value?.features || [];
  const name = f => f.properties.name;
  const idOf = f => f.properties.id ?? f.id;
  const same = (a, b) => a != null && b != null && String(a) === String(b);
  const categories = [
    ['古建筑', '#ab6543'], ['古遗址', '#467c63'], ['古墓葬', '#967b43'],
    ['石窟', '#81719e'], ['近现代', '#407e96'], ['其他', '#997c68']
  ];
  const typeColor = type => (categories.find(([key]) => type?.includes(key)) || categories[5])[1];

  function lineParts(geometry) {
    if (!geometry) return [];
    switch (geometry.type) {
      case 'LineString': return [geometry.coordinates];
      case 'MultiLineString': case 'Polygon': return geometry.coordinates;
      case 'MultiPolygon': return geometry.coordinates.flat();
      default: return [];
    }
  }

  function projection(bounds, frame) {
    const [west,south,east,north] = bounds, [x,y,width,height] = frame;
    const cos = Math.cos((south+north)*Math.PI/360);
    const s = Math.min(width/((east-west)*cos), height/(north-south));
    const left = x+(width-(east-west)*cos*s)/2, top = y+(height-(north-south)*s)/2;
    const project = ([lon,lat]) => [left+(lon-west)*cos*s, top+(north-lat)*s];
    project.unitsPerKm = s/KM_PER_DEG;
    return project;
  }

  function pathOf(geometry, project) {
    const closed = geometry.type.endsWith('Polygon');
    return lineParts(geometry).map(part => {
      let path = '';
      for (let i=0; i<part.length; i++) {
        const [x,y] = project(part[i]);
        path += (i ? 'L' : 'M')+fixed(x)+' '+fixed(y);
      }
      return path+(closed ? 'Z' : '');
    }).join('');
  }

  // Fixed local metric around the selected river, consistent with the displayed buffer.
  function riverDistanceKm(lon, lat, feature) {
    if (!feature) return Infinity;
    const kx = KM_PER_DEG*Math.cos(29.16*Math.PI/180), ky = KM_PER_DEG;
    let shortestSquared = Infinity;
    for (const part of lineParts(feature.geometry)) for (let i=1; i<part.length; i++) {
      const [ax,ay] = part[i-1], [bx,by] = part[i];
      const dx = (bx-ax)*kx, dy = (by-ay)*ky, x=(lon-ax)*kx, y=(lat-ay)*ky;
      const norm = dx*dx+dy*dy;
      const t = norm ? Math.max(0, Math.min(1, (x*dx+y*dy)/norm)) : 0;
      shortestSquared = Math.min(shortestSquared, (x-t*dx)**2+(y-t*dy)**2);
    }
    return Math.sqrt(shortestSquared);
  }
  window.atlasRiverDistanceKm = riverDistanceKm;

  const mainChina = [72,17.2,136,54.5];
  const zhejiang = [117.72,26.75,123.25,31.57];
  const southSea = [104,2.8,124.4,24.5];
  const camera = {mode:null, zoom:1, cx:W/2, cy:H/2};
  let spec, svg, tooltip, legend, drag=null, suppressedClick=false, lookup;

  function rasterImage(dataset, project, clipId) {
    if (!dataset?.bounds || !dataset.image) return '';
    const [w,s,e,n] = dataset.bounds, [l,t]=project([w,n]), [r,b]=project([e,s]);
    return '<image href="'+escape(window.ATLAS_RASTER_IMAGES?.[dataset.image] || dataset.image)+'" x="'+fixed(l)+'" y="'+fixed(t)+
      '" width="'+fixed(r-l)+'" height="'+fixed(b-t)+'" preserveAspectRatio="none" pointer-events="none"'+
      (clipId ? ' clip-path="url(#'+clipId+')"' : '')+'/>';
  }

  function grid(bounds, project, step) {
    const [w,s,e,n] = bounds;
    let d = '';
    for (let x=Math.ceil(w/step)*step; x<=e; x+=step) d += pathOf({type:'LineString', coordinates:[[x,n],[x,s]]}, project);
    for (let y=Math.ceil(s/step)*step; y<=n; y+=step) d += pathOf({type:'LineString', coordinates:[[w,y],[e,y]]}, project);
    return '<path d="'+d+'" fill="none" stroke="#678f951f" stroke-width="0.7" pointer-events="none"/>';
  }

  const scopedPaths = new WeakMap();
  function regionPaths(regions, project, key) {
    return regions.map((f, i) => {
      let cache=scopedPaths.get(f);
      if (!cache) {cache = new Map(); scopedPaths.set(f, cache);}
      if (!cache.has(key)) cache.set(key, pathOf(f.geometry, project));
      return '<path id="atlas-shape-'+i+'" d="'+cache.get(key)+'" fill-rule="evenodd" clip-rule="evenodd"/>';
    }).join('');
  }
  function regionUse(i, attrs='') { return '<use href="#atlas-shape-'+i+'" '+attrs+'/>'; }

  function regionCount(f) {
    const n=name(f), overrides=spec.regionCounts;
    return overrides instanceof Map ? (overrides.get(n) ?? 0) :
      (overrides?.[n] ?? (spec.mode==='national' ? f.properties.count :
        spec.points.filter(p=>p.city===n).length) ?? 0);
  }

  function register(kind, id, title, note) {
    const key = String(lookup.length);
    lookup.push({kind, id, title, note});
    return 'data-map-key="'+key+'"';
  }

  const shortLabel = v => v.replace('壮族自治区','').replace('回族自治区','')
    .replace('维吾尔自治区','').replace('特别行政区','').replace(/自治区$|省$|市$/,'');
  const labelOffsets = {
    北京市:[-13,-10],天津市:[18,0],上海市:[17,-3],重庆市:[0,-2],河北省:[-6,4],
    香港特别行政区:[23,16],澳门特别行政区:[-26,20],台湾省:[11,-2],江苏省:[2,-3]
  };
  function regionLabel(feature, project, key, national) {
    const n=name(feature), c=feature.properties.center;
    if (!c || c.length<2) return '';
    // For Taiwan and the two SARs the province shape includes outlying islands.
    const anchor = ({
      '台湾省':[120.98,23.73], '香港特别行政区':[114.16,22.31], '澳门特别行政区':[113.55,22.19]
    })[n] || c;
    const [x,y]=project(anchor), [dx,initialDy]=national ? (labelOffsets[n] || [0,0]) : [0,0];
    const count=spec.provinceStats?.find(p=>p.name===n)?.count||0;
    const dy=national && spec.nationalView==='choropleth' && count>0 ? initialDy-10-Math.sqrt(count/531)*9 : initialDy;
    const tiny=national && ['香港特别行政区','澳门特别行政区','上海市','北京市','天津市'].includes(n);
    const line=tiny ? '<path d="M'+fixed(x)+' '+fixed(y)+'l'+dx+' '+(dy-1)+'" stroke="#73867d" fill="none" stroke-width=".7" pointer-events="none"/>' : '';
    const chosen=feature.properties.name===spec.selectedRegion;
    return line+'<text '+key+' x="'+fixed(x+dx)+'" y="'+fixed(y+dy)+'" text-anchor="middle" dominant-baseline="middle" style="cursor:pointer" font-size="'+
      (national ? '10' : '12')+'" font-weight="'+(chosen?'700':'500')+'" fill="#344d45" stroke="#fffdf3" stroke-opacity=".92" stroke-width="2.8" stroke-linejoin="round" paint-order="stroke">'+escape(shortLabel(n))+'</text>';
  }

  function inset(regions, sea) {
    const x=555,y=374,width=145,height=155;
    const mapBox=[x+3,y+18,width-6,height-22], project=projection(southSea,mapBox);
    // Include the input provincial polygons and supplied maritime features at their actual coordinates.
    const relevant=regions.filter(f=>['海南省','台湾省','广东省','广西壮族自治区','福建省'].includes(name(f)));
    const polygons=relevant.map(f=>'<path d="'+pathOf(f.geometry,project)+'" fill="#e4e9dd" fill-rule="evenodd" stroke="#687f72" stroke-width=".65"/>').join('');
    return '<g aria-label="南海诸岛附图"><defs><clipPath id="south-window"><rect x="'+mapBox[0]+'" y="'+mapBox[1]+'" width="'+mapBox[2]+'" height="'+mapBox[3]+'"/></clipPath></defs>'+
      '<rect x="'+x+'" y="'+y+'" width="'+width+'" height="'+height+'" rx="3" fill="#f8fbf7" stroke="#96aaa2"/>'+
      '<text x="'+(x+width/2)+'" y="'+(y+13)+'" font-size="10" text-anchor="middle" fill="#3c574b">南海诸岛</text><g clip-path="url(#south-window)">'+
      '<rect x="'+mapBox[0]+'" y="'+mapBox[1]+'" width="'+mapBox[2]+'" height="'+mapBox[3]+'" fill="#e8f1f0"/>'+polygons+maritime(sea,project)+'</g></g>';
  }

  function maritime(sea, project) {
    return sea.map(f=>'<path d="'+pathOf(f.geometry,project)+'" fill="'+(f.geometry.type.endsWith('Polygon')?'#7b8b7a':'none')+'" stroke="#647c70" stroke-width="1" stroke-linecap="round" fill-rule="evenodd" pointer-events="none"/>').join('');
  }

  function riverLayers(project) {
    const rivers=features(spec.rivers), lakes=features(spec.lakes);
    let water='', buffer='', lines='', hit='';
    for (const lake of lakes) water += '<path d="'+pathOf(lake.geometry,project)+'" fill="#b6d9e0" fill-rule="evenodd" stroke="#8eb9c1" stroke-width=".6" pointer-events="none"/>';
    for (const r of rivers) {
      const d=pathOf(r.geometry,project), id=idOf(r), selected=same(id,spec.selectedRiver);
      const key=register('river',id,name(r)||'无名河段',selected?'当前选中河流':'点击查看缓冲区');
      if (selected && spec.bufferKm>0) buffer+='<path d="'+d+'" stroke="#4b9fac" opacity=".36" stroke-width="'+fixed(2*spec.bufferKm*project.unitsPerKm)+'" stroke-linecap="round" stroke-linejoin="round" fill="none" pointer-events="none"/>';
      lines+='<path d="'+d+'" stroke="'+(selected?'#1d6878':'#78a9b3')+'" stroke-width="'+(selected?'2.5':'1.5')+'" fill="none" stroke-linejoin="round" pointer-events="none"/>';
      hit+='<path '+key+' tabindex="0" role="button" aria-label="'+escape(name(r)||'河段')+'" d="'+d+'" fill="none" stroke="transparent" stroke-width="9" style="cursor:pointer"/>';
    }
    return water+buffer+lines+hit;
  }

  function pointLayers(project) {
    if ((spec.mode==='national' && spec.nationalView!=='points') || (spec.mode==='heritage' && spec.selection==='city')) return '';
    const terrain=spec.mode==='terrain', hydro=spec.mode==='river';
    let river=hydro ? features(spec.rivers).find(f=>same(idOf(f),spec.selectedRiver)) : null;
    let circles='', halo='', chosen='';
    for (const p of spec.points) {
      if (!Number.isFinite(p.lon) || !Number.isFinite(p.lat)) continue;
      const [x,y]=project([p.lon,p.lat]), selected=same(p.id,spec.selectedPoint);
      const inBuffer=river && riverDistanceKm(p.lon,p.lat,river)<=spec.bufferKm;
      const color=spec.mode==='chronology'||terrain?p.periodColor||'#818b87':hydro?(inBuffer?'#d6653e':'#7d8677'):typeColor(p.type);
      const note=[p.city,p.type,(spec.mode==='chronology'||terrain)?'年代分类：'+p.period:'',terrain?(p.elevation==null?'高程缺失':p.elevation+' 米'):''].filter(Boolean).join(' · ');
      const key=register('point',p.id,p.name,note);
      const dot='<circle '+key+(selected?' data-selected-site=""':'')+' tabindex="0" role="button" aria-label="'+escape(p.name)+'" cx="'+fixed(x)+'" cy="'+fixed(y)+'" r="'+(spec.mode==='national'?2:terrain?4.4:4)+'" fill="'+color+'" stroke="'+(terrain||spec.mode==='chronology'?'#46594c':'#fff')+'" stroke-width=".65" style="cursor:pointer"/>';
      if (selected) {
        halo='<circle cx="'+fixed(x)+'" cy="'+fixed(y)+'" r="7.4" fill="none" stroke="#683d20" stroke-width="1.8" pointer-events="none"/>';
        chosen=dot;
      } else circles+=dot;
    }
    return circles+halo+chosen;
  }


  function provinceFill(f){const p=spec.provinceStats?.find(p=>p.name===name(f));if(!p||!p.count)return '#eeeae2';return p.count<=94?'#fbd0bd':p.count<=174?'#fa7154':p.count<=288?'#bd171d':'#740714';}
  function provincePies(regions,project){
    return regions.map(f=>{const p=spec.provinceStats?.find(p=>p.name===name(f));if(!p||!p.count||!f.properties.center)return '';
      const [x,y]=project(f.properties.center),r=4+Math.sqrt(p.count/531)*9,a=p.share/100*2*Math.PI;
      const ex=x+r*Math.sin(a),ey=y-r*Math.cos(a),key=register('region',p.name,p.name,p.count+'处 · 第'+p.rank+'名 · 全国占比'+p.share.toFixed(2)+'%');
      return '<g '+key+' tabindex="0" role="button" aria-label="'+escape(p.name+' '+p.count+'处 全国第'+p.rank+'名 占比'+p.share.toFixed(2)+'%')+'" style="cursor:pointer"><title>'+escape(p.name+'：'+p.count+'处；第'+p.rank+'名；'+p.share.toFixed(2)+'%')+'</title><circle cx="'+fixed(x)+'" cy="'+fixed(y)+'" r="'+fixed(r)+'" fill="#f2e4d2" stroke="#554438" stroke-width=".6"/><path d="M'+fixed(x)+' '+fixed(y)+'L'+fixed(x)+' '+fixed(y-r)+'A'+fixed(r)+' '+fixed(r)+' 0 '+(a>Math.PI?1:0)+' 1 '+fixed(ex)+' '+fixed(ey)+'Z" fill="#d6aa21"/><text x="'+fixed(x)+'" y="'+fixed(y+r+8)+'" text-anchor="middle" font-size="7.5" fill="#233d33" stroke="#fff" stroke-width="2" paint-order="stroke">'+p.count+'处</text></g>';
    }).join('');
  }

  function drawLegend() {
    const terrain=spec.mode==='terrain', national=spec.mode==='national', river=spec.mode==='river';
    const title=national?(spec.nationalView==='heat'?'文保热力栅格值':spec.nationalView==='points'?'文保点类型':'省域文保数量（处）'):terrain?'海拔分带（底图）':spec.mode==='chronology'?'文保点年代（颜色）':river?'水系与文保点':'文保点类型';
    let entries;
    if(national && spec.nationalView==='choropleth') entries=[['≤94','#fbd0bd'],['95–174','#fa7154'],['175–288','#bd171d'],['289–531','#740714'],['饼图：本省份额','#ebc94b'],['全国其余地区','#f2e4d2']];
    else if(national && spec.nationalView==='points') entries=categories;
    else if (national || terrain) entries=(spec.rasters?.[national?'heat':'dem']?.classes||[]).map(c=>[c.label,c.color]);
    else if (river) entries=[['河流','#78a9b3'],['缓冲区','#a2cccf'],['区内文保点','#d6653e'],['其他文保点','#7d8677'],['湖泊','#b6d9e0']];
    else entries=[...new Set(spec.points.map(p=>p.type).filter(Boolean))].sort().map(t=>[t,typeColor(t)]);
    if (spec.mode==='chronology') entries=[];
    const swatches=(items,round=false)=>items.map(([label,color])=>'<span><i style="width:10px;height:10px;border-radius:'+(round?'50%':'2px')+';background:'+escape(color)+(round?';border:1px solid #546454':'')+'"></i>'+escape(label)+'</span>').join('');
    const periodEntries=(spec.periodCategories||[]).map(c=>[c.name+' · '+spec.points.filter(p=>p.period===c.name).length,c.color]);
    legend.innerHTML='<b>'+escape(title)+'</b>'+swatches(entries)+(terrain?'<b class="legend-section">文保点年代（颜色）</b>':'')+((terrain||spec.mode==='chronology')?swatches(periodEntries,true):'');
  }

  function draw() {
    lookup=[];
    const national=spec.mode==='national', terrain=spec.mode==='terrain', hydro=spec.mode==='river';
    const dem=spec.rasters?.dem, heat=spec.rasters?.heat;
    const bounds=national?mainChina:terrain&&dem?.bounds ? [
      dem.bounds[0]-.21,dem.bounds[1]-.19,dem.bounds[2]+.21,dem.bounds[3]+.19] : zhejiang;
    const frame=national?[18,28,W-48,H-90]:[24,28,W-48,H-66];
    const project=projection(bounds,frame), regions=features(national?spec.provinces:spec.cities), sea=features(spec.sea);
    const cacheKey=spec.mode+':'+bounds.join(',');
    const defs=regionPaths(regions,project,cacheKey);
    const keys=regions.map(f=>register('region',name(f),name(f),regionCount(f)+' 处文保点'));
    const shapes=regions.map((f,i)=>regionUse(i,'fill="'+(national?(spec.nationalView==='choropleth'?provinceFill(regions[i]):'#f3f1e9'):terrain?(name(f)==='杭州市'?'#ebe8de':'#e2e9dc'):name(f)===spec.selectedRegion?'#c8dfc9':['#e0ead9','#d5e4d7','#dfe8ce','#e7e9d6'][i%4])+'"')).join('');
    const borders=regions.map((f,i)=>regionUse(i,keys[i]+' tabindex="0" role="button" aria-label="'+escape(name(f)+'，'+regionCount(f)+'处')+'" fill="transparent" stroke="'+(name(f)===spec.selectedRegion?'#2d6e50':'#7c897f')+'" stroke-width="'+(name(f)===spec.selectedRegion?'2':national?'.8':'1')+'" vector-effect="non-scaling-stroke" style="cursor:pointer"')).join('');
    let labels='';
    for (let i=0;i<regions.length;i++) {
      if (terrain && name(regions[i])==='杭州市') continue;
      labels+=regionLabel(regions[i],project,keys[i],national);
    }
    const clipping=regions.map((_,i)=>regionUse(i)).join('');
    const overlay=national&&spec.nationalView==='heat'?rasterImage(heat,project,'atlas-land') : terrain?rasterImage(dem,project):'';
    const researchBuffer=spec.bufferGeometry?'<path d="'+pathOf(spec.bufferGeometry,project)+'" fill="#4296b5" fill-opacity=".32" stroke="#2d839d" stroke-width=".5" fill-rule="evenodd" pointer-events="none"/>':'';
    const insetContent=national?inset(regions,sea):'';
    svg.innerHTML='<title>'+escape(national?'全国文保单位分布':terrain?'杭州市高程与文保点':hydro?'浙江水系与文保点':'浙江省文保单位分布')+'</title>'+
      '<defs>'+defs+'<clipPath id="atlas-land">'+clipping+'</clipPath></defs>'+
      '<rect width="100%" height="100%" fill="#eaf1ec"/><g id="atlas-camera">'+grid(bounds,project,national ? 10 : terrain ? 0.5 : 1)+shapes+overlay+researchBuffer+borders+
      (national?maritime(sea,project):'')+(hydro?riverLayers(project):'')+labels+pointLayers(project)+(national&&spec.nationalView==='choropleth'?provincePies(regions,project):'')+'</g>'+insetContent;
    const selected=spec.points.find(p=>same(p.id,spec.selectedPoint));
    byId('pointName').textContent=selected?.name || '';
    byId('pointEra').textContent=selected?.era || '未记录';
    setCamera();
    drawLegend();
  }

  function placePointCard() {
    const card=byId('pointCard'), marker=svg.querySelector('[data-selected-site]');
    if (!marker) {card.hidden=true;return;}
    const box=byId('mapCanvas').getBoundingClientRect(), dot=marker.getBoundingClientRect();
    const x=dot.left+dot.width/2-box.left, y=dot.top+dot.height/2-box.top;
    card.hidden=x<0 || y<0 || x>box.width || y>box.height;
    if (card.hidden) return;
    const w=card.offsetWidth,h=card.offsetHeight;
    card.style.left=Math.max(6,Math.min(x+12+w<=box.width?x+12:x-w-12,box.width-w-6))+'px';
    card.style.top=Math.max(6,Math.min(y-h/2,box.height-h-6))+'px';
  }

  function setCamera() {
    const group=svg.querySelector('#atlas-camera');
    if (group) group.setAttribute('transform','translate('+W/2+' '+H/2+') scale('+camera.zoom+') translate('+(-camera.cx)+' '+(-camera.cy)+')');
    byId('zoomIn').disabled=camera.zoom>=12;
    byId('zoomOut').disabled=camera.zoom<=1;
    svg.style.cursor=camera.zoom>1?'grab':'default';
    svg.style.touchAction=camera.zoom>1?'none':'pan-y';
    placePointCard();
  }
  function adjustZoom(factor, anchor=[W/2,H/2]) {
    const next=Math.min(12,Math.max(1,camera.zoom*factor));
    const x=anchor[0]-W/2, y=anchor[1]-H/2;
    camera.cx+=x*(1/camera.zoom-1/next);
    camera.cy+=y*(1/camera.zoom-1/next);
    camera.zoom=next;
    if (next===1) {camera.cx=W/2;camera.cy=H/2;}
    setCamera();
  }
  function svgPosition(event) {
    const p=svg.createSVGPoint();
    p.x=event.clientX; p.y=event.clientY;
    const pos=p.matrixTransform(svg.getScreenCTM().inverse());
    return [pos.x,pos.y];
  }
  function item(event) {
    const node=event.target.closest?.('[data-map-key]');
    return node ? lookup[Number(node.dataset.mapKey)] : null;
  }
  function showTooltip(event, entry) {
    if (!entry || drag?.moved || !byId('pointCard').hidden) {tooltip.hidden=true;return;}
    const canvas=byId('mapCanvas').getBoundingClientRect();
    const target=event.target.getBoundingClientRect();
    const x=event.clientX ?? target.x+target.width/2, y=event.clientY ?? target.y+target.height/2;
    tooltip.innerHTML='<strong>'+escape(entry.title)+'</strong><small>'+escape(entry.note)+'</small>';
    tooltip.hidden=false;
    tooltip.style.left=Math.max(5,Math.min(x-canvas.left+12,canvas.width-tooltip.offsetWidth-6))+'px';
    tooltip.style.top=Math.max(5,Math.min(y-canvas.top+12,canvas.height-tooltip.offsetHeight-6))+'px';
  }
  function activate(event) {
    const entry=item(event);
    if (!entry || suppressedClick) return;
    tooltip.hidden=true;
    const action={region:spec.onRegion,river:spec.onRiver,point:spec.onPoint}[entry.kind];
    action?.(entry.id);
  }
  function attach() {
    svg=byId('map'); tooltip=byId('mapTooltip');legend=byId('mapLegend');
    svg.setAttribute('viewBox','0 0 '+W+' '+H);
    new ResizeObserver(placePointCard).observe(byId('mapCanvas'));
    svg.style.touchAction='pan-y';
    byId('zoomIn').onclick=()=>adjustZoom(1.5);
    byId('zoomOut').onclick=()=>adjustZoom(1/1.5);
    byId('fitMap').onclick=()=>adjustZoom(1/camera.zoom);
    svg.addEventListener('click', activate);
    svg.addEventListener('keydown',e=>{if (e.key==='Enter'||e.key===' ') {e.preventDefault();activate(e);}});
    svg.addEventListener('focusin',e=>showTooltip(e,item(e)));
    svg.addEventListener('focusout',()=>{tooltip.hidden=true;});
    svg.addEventListener('pointerleave',()=>{tooltip.hidden=true;});
    svg.addEventListener('pointerdown',e=>{
      suppressedClick=false;
      if (e.button!==0 || camera.zoom<=1) return;
      drag={start:svgPosition(e),cx:camera.cx,cy:camera.cy,moved:false,identifier:e.pointerId};
    });
    svg.addEventListener('pointermove',e=>{
      if (drag && e.pointerId===drag.identifier) {
        const [x,y]=svgPosition(e), dx=x-drag.start[0], dy=y-drag.start[1];
        if (!drag.moved && Math.hypot(dx,dy)>4) {drag.moved=true;svg.setPointerCapture(e.pointerId);}
        if (drag.moved) {
          camera.cx=Math.max(0,Math.min(W,drag.cx-dx/camera.zoom));
          camera.cy=Math.max(0,Math.min(H,drag.cy-dy/camera.zoom));
          setCamera(); svg.style.cursor='grabbing';
        }
      }
      showTooltip(e,item(e));
    });
    const stopDrag=e=>{
      if (!drag || drag.identifier!==e.pointerId) return;
      suppressedClick=drag.moved;
      if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
      drag=null;setCamera();
    };
    window.addEventListener('pointerup',stopDrag);
    window.addEventListener('pointercancel',stopDrag);
    svg.addEventListener('wheel',e=>{
      if (!e.ctrlKey) return;
      e.preventDefault();
      adjustZoom(e.deltaY<0?1.24:1/1.24,svgPosition(e));
    },{passive:false});
  }
  window.drawAtlasMap = config => {
    if (!svg) attach();
    if (camera.mode!==config.mode) {
      Object.assign(camera,{mode:config.mode,zoom:1,cx:W/2,cy:H/2});
    }
    spec={points:[],...config};
    tooltip.hidden=true;
    draw();
  };
})();
