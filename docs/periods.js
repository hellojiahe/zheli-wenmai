/* One chronology and palette for the time map and Hangzhou terrain filters. */
(() => {
  'use strict';
  const categories = [
    ['旧石器时代', '#d25425'], ['新石器时代', '#c8d45a'],
    ['商', '#c96a89'], ['春秋战国', '#26c6d0'],
    ['汉', '#20d442'], ['魏晋南北朝', '#d4971c'],
    ['唐', '#df7adb'], ['五代十国', '#e93c99'],
    ['宋', '#b5e96d'], ['元', '#a66bc7'],
    ['明', '#20c99e'], ['清', '#7fa8be'],
    ['民国', '#80ce6c'], ['新中国成立以来', '#4d24df']
  ].map(([name, color]) => ({name, color}));
  const unknown = {name: '待核对', color: '#818b87'};
  window.buildAtlasPeriods = (sites, chronology) => {
    const assignments = new Map(chronology.assignments.map(a => [String(a.id), a]));
    const names = new Set(categories.map(c => c.name));
    const classified = sites.map(p => {
      const source = assignments.get(String(p.id));
      // Keep the audited earliest-period convention, including cross-period records.
      let period = source?.era === p.era && names.has(source.period) ? source.period : null;
      // This explicit decade belongs unambiguously to the post-1949 category.
      if (!period && p.era === '20世纪50年代') period = '新中国成立以来';
      const category = categories.find(c => c.name === period) || unknown;
      return {...p, period: category.name, periodColor: category.color,
        periodNote: category === unknown ? '原始年代未细分到本图的朝代类别，保留待核对。' : '跨期记录按最早所属时期归组。'};
    });
    const counts = new Map();
    for (const p of classified) counts.set(p.period, (counts.get(p.period) || 0) + 1);
    return {
      sites: classified,
      categories: [...categories, unknown].map(c => ({...c, count: counts.get(c.name) || 0})),
      groups: chronology.groups.map(g => {
        const siteIds = classified.filter(p => g.periods.includes(p.period)).map(p => p.id);
        return {...g, siteIds, count: siteIds.length};
      }),
      classifiedTotal: classified.filter(p => p.period !== unknown.name).length,
      pendingTotal: counts.get(unknown.name) || 0
    };
  };
})();
