(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const num=v=>Number.isFinite(Number(v))?Number(v).toLocaleString('zh-CN'):String(v??'—'), pct=(v,d=1)=>Number(v).toFixed(d)+'%';
  const html=(id,v)=>$(id).innerHTML=v;
  const button=(a,v,t)=>'<button class="view-chip" data-action="'+a+'" data-value="'+esc(v)+'">'+esc(t)+'</button>';
  const stat=(label,n,unit)=>'<div><span>'+esc(label)+'</span><strong>'+num(n)+'</strong><small>'+esc(unit)+'</small></div>';
  const list=items=>'<ul class="detail-list">'+items.map(([a,b])=>'<li><span>'+esc(a)+'</span><b>'+esc(b??'未记录')+'</b></li>').join('')+'</ul>';
  const intro=(k,t,d)=>'<p class="eyebrow">'+k+'</p><h2 class="detail-title">'+esc(t)+'</h2><p class="detail-subtitle">'+esc(d)+'</p>';
  const chapters={
    national:['NATIONAL ATLAS','全国 · 数量与空间集聚','第一至第八批全国重点文物保护单位 · 比较省域数量、全国份额与热力分布'],
    heritage:['ZHEJIANG SITES','浙江 · 文保单位图谱','十一座城市，六类遗产。点击点位，阅读名称、原始年代与保护批次。'],
    chronology:['HISTORICAL ATLAS','时间中的浙江文脉','从史前到近现代，按已整理的年代字段探索现存文保样本的分布。'],
    terrain:['HANGZHOU TERRAIN','山水之间 · 杭州高程','将点位高程与海拔带面积相比较，认识文保单位的低海拔集聚特征。'],
    river:['ZHEJIANG WATERS','沿水而生 · 浙江河网','查看已制作的分类缓冲范围，并探索单条河流附近的文保点。'],
    culture:['LIVING HERITAGE','村落与非遗 · 数据观察','保留已提供的省域非遗汇总，明确点位分析所需的数据。'],
    poi:['NEARBY SERVICES','文保点周边服务','为交通接驳、停车与公共服务分析准备统一的设施点位。']
  };
  let data,raster,research,local,hz,periods,timer=null;
  const state={mode:'national',region:'',point:null,type:'',era:'',query:'',band:'',riverGroup:'rivers',river:null,km:5,selection:'point',nationalView:'choropleth',period:'',buffer:'',playing:false};
  const countBy=(rows,field)=>{const m=new Map();for(const p of rows)m.set(p[field]||'未记录',(m.get(p[field]||'未记录')||0)+1);return [...m].sort((a,b)=>b[1]-a[1]);};
  const select=(id,label,opts,value)=>'<label class="field-label" for="'+id+'">'+label+'</label><select id="'+id+'">'+opts.map(([v,t])=>'<option value="'+esc(v)+'" '+(String(v)===String(value)?'selected':'')+'>'+esc(t)+'</option>').join('')+'</select>';
  const national=()=>state.mode==='national', terrain=()=>state.mode==='terrain', chronological=()=>state.mode==='chronology';
  const province=n=>research.national.provinces.find(p=>p.name===n);
  const periodGroup=()=>periods.groups.find(g=>g.id===state.period);
  const nationalPoints=()=>data.sites.filter(p=>!state.type||p.type===state.type);
  const currentRiver=()=>data[state.riverGroup].features.find(f=>String(f.properties.id)===String(state.river));
  const defaultRiver=()=>{const fs=data[state.riverGroup].features;return (fs.find(f=>f.properties.name==='钱塘江')||fs.find(f=>f.properties.name!=='未命名河段')||fs[0])?.properties.id;};
  function groupRivers(collection){const groups=new Map();for(const f of collection.features){const key=f.properties.name==='未命名河段'?f.properties.id:f.properties.name;if(!groups.has(key))groups.set(key,{type:'Feature',properties:{...f.properties,id:key,segments:0},geometry:{type:'MultiLineString',coordinates:[]}});const g=groups.get(key);g.properties.segments++;g.geometry.coordinates.push(...(f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates));}return {type:'FeatureCollection',features:[...groups.values()]};}
  function rows(){
    if(national())return nationalPoints().filter(p=>!state.region||p.province===state.region);
    const group=periodGroup(), ids=group?new Set(group.siteIds.map(String)):null;
    return (terrain()?hz:local).filter(p=>(!state.region||p.city===state.region)&&(!state.type||p.type===state.type)&&(!state.era||(terrain()||chronological()?p.period:p.era)===state.era)&&(!state.query||[p.name,p.city,p.county,p.address,p.code].some(v=>v?.includes(state.query)))&&(!chronological()||!ids||ids.has(String(p.id)))&&(!terrain()||state.band===''||(state.band==='missing'?p.elevation==null:p.elevation!=null&&(raster.dem.classes[state.band].min==null||p.elevation>=raster.dem.classes[state.band].min)&&(raster.dem.classes[state.band].max==null||p.elevation<raster.dem.classes[state.band].max))));
  }
  function controls(){
    let out=national()?select('nationalView','全国地图视图',[['choropleth','省域数量与全国占比'],['heat','热力分布'],['points','文保点类型']],state.nationalView):'';
    if(chronological())out+=select('period','历史时期',[['','全部时期（含待核对）'],...periods.groups.map(g=>[g.id,g.name+' · '+g.count+'处'])],state.period)+'<div class="playback">'+button('play','',state.playing?'暂停播放':'▶ 按时期播放')+'<span>每期 1.2 秒</span></div>';
    if(!terrain())out+=select('region','行政区域',[['',national()?'全国 · 全部省级行政区':'浙江省 · 全部地级市'],...(national()?data.provinces:data.cities).features.map(f=>[f.properties.name,f.properties.name])],state.region);
    else out+='<p class="area-stamp">杭州市 · 全域</p>';
    if(national())out+=select('type','文保类型',[['','全部类型'],...countBy(data.sites,'type').map(([v,n])=>[v,v+' · '+n+'条'])],state.type)+'<p class="hint">选择类型后进入文保点视图，可与省份组合筛选。切换回数量图或热力图时恢复全部类型；这两张底图展示全类型统计。</p>';
    else{
      const base=terrain()?hz:local;
      out+='<form id="searchForm"><label class="field-label" for="query">查找文保点</label><div class="search-line"><input id="query" type="search" value="'+esc(state.query)+'" placeholder="名称、地址或编号"><button>搜索</button></div></form>';
      out+=select('type','文物类型',[['','全部类型'],...countBy(base,'type').map(([v])=>[v,v])],state.type);
      if(terrain()||chronological()){
        const counts=new Map(countBy(base,'period'));
        out+=select('era','年代分类',[['','全部年代'],...periods.categories.map(c=>[c.name,c.name+' · '+(counts.get(c.name)||0)+'处'])],state.era);
        out+='<p class="hint">按图例统一为14个年代类别；跨期记录归最早时期。“周”“近代”等无法细分的原始年代单列待核对。</p>';
      }else out+=select('era','原始年代',[['','全部年代'],...countBy(base,'era').map(([v])=>[v,v])],state.era);
    }
    if(terrain())out+=select('band','点位海拔',[['','全部海拔'],...raster.dem.classes.map((c,i)=>[i,c.label]),['missing','海拔缺失']],state.band);
    if(state.mode==='river'){
      out+=select('buffer','QGIS研究缓冲范围',[['','不叠加'],...research.river.groups.map(g=>[g.id,g.name+' · '+g.bufferKm+'千米'])],state.buffer);
      out+=select('riverGroup','交互水系',[['rivers','三级以上河流'],['majorRivers','一级河流']],state.riverGroup);
      out+=select('river','河流 / 河段',data[state.riverGroup].features.map(f=>[f.properties.id,f.properties.name]),state.river);
      out+='<label class="range-label" for="km">单河探索距离 <b>'+state.km+'千米</b></label><input id="km" type="range" min="0.8" max="15" step="0.2" value="'+state.km+'"><p class="hint">单河距离用于交互探索，与下方三类研究缓冲统计分别展示。</p>';
    }
    html('filterBody',out);$('selectionMode').hidden=state.mode!=='heritage';
    html('selectionMode',state.mode==='heritage'?['city','point'].map((v,i)=>'<button data-action="selection" data-value="'+v+'" class="'+(state.selection===v?'active':'')+'">'+['按城市','看点位'][i]+'</button>').join(''):'');
  }
  function pointIndex(rs){return rs.slice(0,10).map(p=>'<button class="site-row" data-action="point" data-value="'+p.id+'"><b>'+esc(p.name)+'</b><span>'+esc(p.type)+' ↗</span></button>').join('');}
  function detail(rs,buffered){
    const p=rs.find(p=>String(p.id)===String(state.point));
    if(p)return intro('SITE RECORD',p.name,'全国重点文物保护单位')+list([...(terrain()||chronological()?[['年代分类',p.period]]:[]),['原始年代',p.era],['保护批次',p.batch],['文物类型',p.type],['所属地区',[p.province,p.city,p.county].filter(Boolean).join(' · ')],['地址',p.address],['国保编号',p.code],...(terrain()?[['海拔',p.elevation==null?'缺少有效高程':p.elevation+'米']]:[])])+((terrain()||chronological())?'<p class="method-note">'+esc(p.periodNote)+'</p>':'')+button('back','','返回当前统计');
    if(national()){
      const p=province(state.region);
      if(state.nationalView==='points')return intro('NATIONAL SITE INDEX',state.region||'全国文保点',state.type||'全部文保类型')+list([['当前区域筛选结果',rs.length+'条'],['全国同类型记录',nationalPoints().length+'条'],['统计口径','名录归属点记录']])+'<p class="method-note">当前仅显示符合类型和区域条件的点位。数量底图的QGIS空间计数采用另一统计口径。</p>'+(!rs.length?'<p class="detail-copy">当前条件下没有收录的点位，可更换类型或行政区域。</p>':'<h3>文保点名录</h3>'+pointIndex(rs));
      if(p)return intro('PROVINCE PROFILE',p.name,'数量与全国比较')+list([['QGIS省域计数',p.count+'处'],['空间计数排名',p.rank?'第'+p.rank+'名':'不参与'],['占空间计数总量',pct(p.share,2)],['名录归属点记录',p.recordCount+'条']])+'<p class="method-note">'+esc(p.coverageNote)+'</p>'+list(countBy(rs,'type').map(([t,n])=>[t,n+'条']))+(p.name==='浙江省'?button('mode','heritage','进入浙江文物地图 ↗'):'')+button('region','','返回全国');
      return intro('NATIONAL OVERVIEW','读懂这张地图','省域统计与热力分布分开阅读')+'<p class="detail-copy">底色越深，QGIS计入该省的文保点越多。饼图的金色扇区表示本省占全国空间计数的份额，浅色部分为其余地区。</p><p class="method-note">空间计数5,058处，名录点记录5,066条。边界匹配与记录归属不同，查看省份时保留两种口径。港澳台行政区完整保留；未收录不等于没有文化遗产。</p><div class="province-index">'+data.provinces.features.map(f=>button('region',f.properties.name,f.properties.name)).join('')+'</div>';
    }
    if(state.mode==='river')return intro('RIVER EXPLORER',currentRiver()?.properties.name||'河流附近','当前单河交互探索')+list([['探索距离',state.km+'千米'],['筛选点位',rs.length+'处'],['距离范围内',buffered.length+'处']])+pointIndex(buffered.map(([p])=>p));
    return intro(chronological()?'HISTORICAL PERIOD':'SITE INDEX',chronological()?(periodGroup()?.name||'全部时期'):state.region||(terrain()?'杭州市':'浙江省'),rs.length+'个符合条件的文保点')+((chronological()||terrain())?'<p class="method-note">'+esc(state.era?'当前年代分类：'+state.era+'。':'')+'跨期记录按最早所属时期归组，原始年代在点位详情保留。灰色点为待核对年代。</p>':'')+list(countBy(rs,'type').map(([t,n])=>[t,n+'处']))+(!rs.length?'<p class="detail-copy">当前条件下没有点位，请调整筛选条件。</p>':'<h3>文保点名录</h3>'+pointIndex(rs));
  }
  function bars(items,unit='处'){const max=Math.max(1,...items.map(([,v])=>v));return '<div class="rank-bars">'+items.map(([k,v])=>'<div><span>'+esc(k)+'</span><i><em style="width:'+100*v/max+'%"></em></i><b>'+num(v)+' '+unit+'</b></div>').join('')+'</div>';}
  function chart(rs,buffered){
    let title,scope,body,note,copy;
    if(terrain()){
      title='海拔带面积与文保点占比';scope='全市基准 · 46处有效海拔样本';note='低海拔集聚：面积之外的比较';
      body='<div class="plot-key"><i></i>有效DEM面积占比<i></i>文保点占比</div><div class="compare">'+raster.dem.classes.map(c=>'<div class="comparison-row"><b>'+esc(c.label)+'</b><div><span style="width:'+c.areaShare+'%"></span><em>'+pct(c.areaShare)+'</em></div><div><span style="width:'+c.pointShare+'%"></span><em>'+pct(c.pointShare)+'</em></div></div>').join('')+'</div>';
      copy='低于50米的区域占有效DEM面积22.28%，集中了73.9%的有效文保点，点位密度约为研究区平均水平的3.32倍。200米以下集中了95.7%的有效样本。47条杭州记录中有1条缺少有效高程。该结果描述空间关联，不能单独证明高程的因果作用。';
    }else if(chronological()){
      title='各历史时期的文保样本数量';scope='按年代顺序 · 279处样本';note='现存样本的年代分布';
      body=bars(periods.categories.map(p=>[p.name,p.count]))+'<p class="method-note">全浙江样本基准，不随筛选变化。灰色为年代待核对；无记录不能解释为该时期没有遗产。</p>';
      copy='现有'+periods.classifiedTotal+'处归入14个年代类别，另'+periods.pendingTotal+'处待核对。各朝代使用固定颜色，六个历史阶段仍可按1.2秒循环播放。原始六时期图件与GIF保留在下方；交互地图按源字段独立筛选，不表示过去各时期实际存在的全部文物数量。';
    }else if(state.mode==='river'){
      title='不同等级河流缓冲范围的分布';scope='原QGIS研究统计 · 全浙江';note='邻水集聚的描述性证据';
      body='<div class="table-scroll"><table class="study-table"><thead><tr><th>研究范围</th><th>文保点</th><th>占全省</th><th>相对密度R*</th></tr></thead><tbody>'+research.river.groups.map(g=>'<tr><th>'+esc(g.name)+'<small>'+g.bufferKm+'千米缓冲</small></th><td>'+g.count+'</td><td>'+pct(g.pointShare,2)+'</td><td>'+g.relativeDensity.toFixed(2)+'</td></tr>').join('')+'</tbody></table></div>';
      copy='三类研究范围内的原始相对密度均大于1。其他小河流800米范围覆盖126处，占45.16%；三级以上河流8千米范围37处；一级河流15千米范围20处。*源面积采用EPSG:3857，相关密度与倍数保留为原研究结果，待等积投影复核。各组不能直接比较影响强弱，也不能直接相加。';
    }else if(national()&&state.nationalView==='points'){title=state.region?state.region+' · 当前类型构成':(state.type||'全部类型')+' · 省域名录数量';scope='当前筛选 · 名录归属点记录';body=bars(state.region?countBy(rs,'type'):countBy(rs,'province').slice(0,10));note='按文保类型探索全国点位';copy='类型条件与行政区域共同筛选点位，计数使用名录中的省份归属。全国数量底图和饼图采用QGIS空间计数，切换回这些视图时恢复全部类型。';
    }else if(national()&&!state.region){title='各省文保数量排行';scope='QGIS空间计数 · 前十位';body=bars(research.national.provinces.filter(p=>p.rank).slice(0,10).map(p=>[p.name,p.count]));note='从点位分布到省域份额';copy='全国文保点在中东部较密集，西部地区呈现局部集聚与分散分布并存。数量图按94、174、288分界，热力图按5、15、50、80分界。省域数量、核密度值和文化价值分别表达不同含义。';
    }else{title=(state.region||'浙江省')+' · 文保类型构成';scope='当前名录筛选';body=bars(countBy(rs,'type'));note='广泛分布，局部集聚';copy='浙江省名录收录279处文保点，分布于11个地级市。点击城市比较类型构成，点击文保点查看名称与年代。地图使用实际记录和提供的边界，不以点位多少判断文化价值。';}
    $('chartTitle').textContent=title;$('chartScope').textContent=scope;html('bars',body);$('analysisTitle').textContent=note;html('analysisContent','<p>'+esc(copy)+'</p><a class="figure-jump" href="#researchFigures">查看QGIS原始图件 ↓</a>');
  }
  function render(){
    const [k,t,d]=chapters[state.mode],index=Object.keys(chapters).indexOf(state.mode)+1;
    $('chapter').textContent=String(index).padStart(2,'0')+' / '+k;$('plateNumber').textContent=String(index).padStart(2,'0');$('pageTitle').textContent=t;$('pageSubtitle').textContent=d;
    document.querySelectorAll('nav [data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===state.mode);b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode));});
    const pending=['culture','poi'].includes(state.mode);for(const id of ['workspace','metrics','charts'])$(id).hidden=pending;$('pending').hidden=!pending;
    $('studyPanel').hidden=false; renderStudy();
    if(pending){const ich=state.mode==='culture';html('pending',intro('DATA OBSERVATORY',ich?'已有省域非遗汇总':'服务设施点位待接入',ich?'浙江省源表非遗汇总：'+research.ich.zhejiangCount+'条':'保持研究范围与数据覆盖一致')+'<p>'+(ich?'当前文件中有省级非遗计数，但没有非遗实践地点与村落坐标，因此暂不进行省内最近距离和重叠分析。':'本次指定目录尚未找到公交、地铁、停车场等可用设施点位。现有文保点可作为后续500米、1千米服务覆盖分析的对象。')+'</p>'+button('mode','heritage','查看浙江文保点'));return;}
    controls();const rs=rows(),r=currentRiver(),buffered=state.mode==='river'&&r?rs.map(p=>[p,window.atlasRiverDistanceKm(p.lon,p.lat,r)]).filter(([,d])=>d<=state.km).sort((a,b)=>a[1]-b[1]):[];
    let metrics;
    if(national()){const p=province(state.region);metrics=state.nationalView==='points'?stat('当前区域筛选点位',rs.length,'条')+stat('全国同类型记录',nationalPoints().length,'条')+stat('当前文保类别',countBy(rs,'type').length,'类'):p?stat('省域空间计数',p.count,'处')+stat('空间计数排名',p.rank||'—','名')+stat('全国份额',Number(p.share.toFixed(2)),'%'):stat('QGIS省域空间计数',research.national.spatialTotal,'处')+stat('原始名录点记录',data.sites.length,'条')+stat('图示省级行政区',data.provinces.features.length,'个');}
    else if(terrain())metrics=stat('当前杭州点位',rs.length,'处')+stat('全市有效高程样本',46,'处')+stat('全市低于50米占比',73.9,'%');
    else if(chronological())metrics=stat('当前时期点位',rs.length,'处')+stat('年代已分类',periods.classifiedTotal,'处')+stat('待核对年代',periods.pendingTotal,'处');
    else metrics=stat('当前浙江文保点',rs.length,'处')+stat(state.mode==='river'?'单河范围内点位':'图示地级市',state.mode==='river'?buffered.length:11,'个')+stat('当前文物类别',countBy(rs,'type').length,'类');
    html('metrics',metrics+'<div class="metric-note"><span>本次研究样本</span><b>第一至第八批全国重点文物保护单位</b><small>数据更新 2026.11 · 统计范围见说明</small></div>');
    $('mapHeading').textContent=national()?'全国':terrain()?'杭州市':'浙江省';$('mapCaption').textContent=national()?({choropleth:'省域数量与全国占比',heat:'热力分布',points:state.type||'全部文保类型'})[state.nationalView]:chronological()?[periodGroup()?.name||'全部时期',state.era].filter(Boolean).join(' · '):terrain()?'DEM高程 · '+(state.era||'全部年代'):'类型分布与空间探索';
    $('mapCredit').textContent=national()?(state.nationalView==='points'?'点位按文保类型着色，类型与省份共同筛选；数量采用名录归属点记录。全国34个省级行政区与南海诸岛完整保留。':'全国34个省级行政区完整保留，附南海诸岛。饼图金色为本省份额；数量与名录记录口径分别展示。'):terrain()?'底图按实际海拔分带，点位按年代着色；海拔统计为全市基准，年代与类型筛选只改变地图点位。':chronological()?'14个年代类别使用固定颜色，灰色为待核对。图例数量为当前筛选结果，原始年代保留在点位详情。':'底图、点位与研究统计来自本次收集的数据。';
    const regionCounts=new Map(national()?(state.nationalView==='points'?countBy(rs,'province'):research.national.provinces.map(p=>[p.name,p.count])):countBy(rs,'city'));
    const selectedBuffer=research.river.groups.find(g=>g.id===state.buffer);
    window.drawAtlasMap({mode:state.mode,nationalView:state.nationalView,periodCategories:periods.categories,provinceStats:research.national.provinces,nationalTotal:research.national.spatialTotal,provinces:data.provinces,cities:data.cities,sea:data.sea,rivers:data[state.riverGroup],lakes:data.lakes,points:national()?(state.nationalView==='points'?rs:[]):rs,rasters:raster,selectedRegion:state.region,selectedPoint:state.point,selectedRiver:state.river,bufferKm:state.km,bufferGeometry:state.mode==='river'?selectedBuffer?.geometry:null,selection:state.selection,regionCounts,onPoint:id=>{state.point=Number(id);render();},onRegion:n=>{if(!terrain()){state.region=n;state.point=null;render();}},onRiver:id=>{state.river=id;state.point=null;render();}});
    html('details',detail(rs,buffered));chart(rs,buffered);
  }
  const studies={
    national:{title:'从全国点位到省域比较',text:'全国点位分布、热力图与省域数量图相互补充。热力图观察局部集聚，分级底色与饼图比较同一统计口径下的数量和份额。',files:['national-province-share.jpg','national-heatmap-qgis.jpg','national-type-points.jpg']},
    heritage:{title:'浙江省：类型多样，局部集聚',text:'以279处名录点记录为研究样本，结合城市边界查看古建筑、古遗址等不同类型的空间分布。',files:['zhejiang-type-points.jpg','location-context.jpg']},
    chronology:{title:'14种年代颜色，六个历史阶段',text:'年代演变与杭州高程采用同一套年代分类和点位颜色。跨期记录按最早时期归组；原始年代未细分的记录单列待核对。下列原图和GIF保留原始成果。',files:['dynasty-periods-red.png','dynasty-evolution-1p2s.gif']},
    terrain:{title:'低海拔集聚，结合面积理解',text:'海拔低于50米的区域占有效DEM面积22.28%，集中了73.9%的有效文保点。海拔带不直接等同于平原、丘陵或高原等地貌类型。',files:['hangzhou-terrain-qgis.jpg','hangzhou-elevation-comparison.png']},
    river:{title:'不同等级河流的分类缓冲研究',text:'800米、8千米、15千米是不同河流类别所设的研究范围。原面积使用Web Mercator，密度结论待等积复核；不据此解释距离梯度或因果影响。',files:['zhejiang-river-buffers.jpg']},
    culture:{title:'把现有数据与下一步研究连接起来',text:'省域非遗汇总可作背景信息。村落与非遗实践地点的关联分析，需要同一范围、同一口径的可定位数据。',files:['location-context.jpg']},
    poi:{title:'从文保资源走向周边服务',text:'后续接入设施点位后，可比较每处文保单位周边公交、停车和公共服务覆盖，优先识别服务不足的点位。',files:['zhejiang-type-points.jpg']}
  };
  let manifest=[];
  function assetLink(file,large=false){const a=manifest.find(a=>a.file===file);if(!a)return '';return '<a class="study-figure" href="research-figures/'+file+'" target="_blank" rel="noopener"><img src="research-figures/'+(large||file.endsWith('.gif')?file:a.thumbnail)+'" loading="lazy" alt="'+esc(a.title)+'"><span>'+esc(a.title)+' · 查看原图 ↗</span></a>';}
  function renderStudy(){const s=studies[state.mode];html('studyPanel','<div class="study-heading"><div><span class="eyebrow">RESEARCH FINDINGS / 研究观察</span><h2>'+s.title+'</h2><p>'+s.text+'</p></div><a href="#researchFigures">全部图件 ↓</a></div><div class="study-figures">'+s.files.map(f=>assetLink(f)).join('')+'</div>');}
  function gallery(){html('researchGallery',manifest.filter(a=>a.file!=='dynasty-evolution-1p2s.gif').map((a,i)=>'<figure class="research-card">'+assetLink(a.file)+'<figcaption><span>PLATE '+String(i+1).padStart(2,'0')+'</span><h3>'+esc(a.title)+'</h3></figcaption></figure>').join(''));}
  function stop(){if(timer)clearInterval(timer);timer=null;state.playing=false;}
  function go(mode){if(!chapters[mode])return;stop();if(location.hash!=='#'+mode){location.hash=mode;return;}state.mode=mode;reset();render();}
  function reset(){Object.assign(state,{region:'',point:null,type:'',era:'',query:'',band:'',selection:'point',period:'',buffer:'',riverGroup:'rivers',km:5});state.river=defaultRiver();}
  document.addEventListener('click',e=>{const m=e.target.closest('[data-mode]');if(m){go(m.dataset.mode);return;}const b=e.target.closest('[data-action]');if(!b)return;const {action,value}=b.dataset;if(action==='mode')go(value);else if(action==='point'){stop();state.point=Number(value);render();}else if(action==='region'){state.region=value;state.point=null;render();}else if(action==='back'){state.point=null;render();}else if(action==='selection'){state.selection=value;render();}else if(action==='play'){if(timer)stop();else{state.region='';state.type='';state.era='';state.query='';state.point=null;state.playing=true;let i=Math.max(0,periods.groups.findIndex(g=>g.id===state.period));state.period=periods.groups[i].id;timer=setInterval(()=>{i=(i+1)%periods.groups.length;state.period=periods.groups[i].id;state.point=null;render();},1200);}render();}});
  $('filterBody').addEventListener('change',e=>{const {id,value}=e.target;if(id==='query')return;stop();if(id==='km')state.km=Number(value);else state[id]=value;if(national()&&id==='type')state.nationalView='points';if(national()&&id==='nationalView'&&value!=='points')state.type='';if(id==='riverGroup')state.river=defaultRiver();state.point=null;render();});
  $('filterBody').addEventListener('submit',e=>{e.preventDefault();stop();state.query=$('query').value.trim();state.point=null;render();});
  $('reset').onclick=()=>{stop();reset();render();$('fitMap').click();};$('aboutBtn').onclick=()=>$('aboutDialog').showModal();$('closeDialog').onclick=()=>$('aboutDialog').close();
  async function read(path){const r=await fetch(path);if(!r.ok)throw new Error(path+'加载失败');return r.json();}
  async function init(){
    [data,raster,research,manifest]=await Promise.all([read('data/vectors.json'),read('data/rasters.json'),read('data/research.json'),read('research-figures/research-assets-manifest.json')]);
    data.rivers=groupRivers(data.rivers);data.majorRivers=groupRivers(data.majorRivers);periods=window.buildAtlasPeriods(data.sites.filter(p=>p.province==='浙江省'),research.chronology);local=periods.sites;hz=local.filter(p=>p.city==='杭州市');
    html('sourceNotes','<p>本图集依据用户提供的QGIS成果与第一至第八批全国重点文物保护单位名录制作，非全部不可移动文物清单。</p><ul><li>名录共5,066条点记录，浙江279条、杭州47条；QGIS省域空间计数共5,058处。省域饼图和排名使用后者为分母，不混用两套口径。</li><li>全国34个省级行政区完整保留，南海诸岛与海上断续线沿用既有底图。港澳台的未收录不等于没有遗产，香港空间计数与名录归属的差异单独注明。</li><li>热力图使用原始栅格，5/15/50/80断点表达热力栅格值，不当作省域数量。</li><li>杭州46处有效高程样本；1处缺失。面积按WGS84椭球逐行计算有效DEM像元。网页只标海拔带，原QGIS图件保留供对照。</li><li>三组缓冲统计126/37/20处来自原GPKG。源面积采用EPSG:3857，原研究R值待等积投影复核，各组不能直接相加或比较因果影响。</li><li>年代按14类统一整理，274处已分类、5处待核对。其中“20世纪50年代”补归新中国成立以来；仅写“周”“近代”的记录不强行细分。跨期归入最早所属时期，保留原始年代。六时期原图前两幅点位相似，交互动画使用源字段独立筛选。</li><li>非遗仅有省级汇总；指定目录尚无可用村落和服务POI坐标。更新日期2026年11月17日。</li></ul>');
    state.mode=chapters[location.hash.slice(1)]?location.hash.slice(1):'national';reset();gallery();render();
    window.addEventListener('hashchange',()=>{const m=location.hash.slice(1);if(chapters[m]){stop();state.mode=m;reset();render();window.scrollTo(0,0);}});
  }
  init().catch(e=>{console.error(e);html('details','<h2>图层暂未加载</h2><p>'+esc(e.message)+'</p><button onclick="location.reload()">重新加载</button>');});
})();
