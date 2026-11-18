// Preserve the audited source; defer the large buffer polygons until requested.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../docs/data');
const research = JSON.parse(fs.readFileSync(path.join(root, 'research.json'), 'utf8'));
const buffers = research.river.groups.map(({id, geometry}) => ({id, geometry}));
const core = {...research, river: {...research.river, groups: research.river.groups.map(({geometry, ...stats}) => stats)}};
fs.writeFileSync(path.join(root, 'research-core.json'), JSON.stringify(core));
fs.writeFileSync(path.join(root, 'river-buffers.json'), JSON.stringify(buffers));
console.log('Prepared research-core.json (' + fs.statSync(path.join(root, 'research-core.json')).size + ' bytes); river polygons load on demand.');
