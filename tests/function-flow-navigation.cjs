const assert=require('node:assert/strict'),Core=require('../frontend/locator-core.js'),Flow=require('../frontend/function-flow.js'),babel=require('../frontend/vendor/babel.js'),postcss=require('../frontend/vendor/postcss.js');
const parsers={js:(s,ts)=>babel.parsers[ts?'babel-ts':'babel'].parse(s,{}),css:s=>postcss.parsers.css.parse(s,{})};
(async()=>{
const files=[{path:'main.js',source:'import {save} from "./barrel.js";\nconst button=document.querySelector("#save");\nbutton.addEventListener("click",save);\nfunction irrelevant(){return 0;}'},{path:'barrel.js',source:'export {save} from "./actions.js";'},{path:'actions.js',source:'import {validate,submit} from "./helpers.js";\nexport function save(){\n validate();\n submit();\n}'},{path:'helpers.js',source:'import {shared} from "./shared.js";\nexport function validate(){shared();}\nexport function submit(){shared();}\nfunction unused(){}'},{path:'shared.js',source:'export function shared(){return 1;}'}];
// More than a thousand source lines spread across files, with unrelated same-name methods.
for(let i=0;i<5;i++)files.push({path:`unrelated${i}.js`,source:Array.from({length:260},(_,j)=>`function unrelated${i}_${j}(){return ${j};}`).join('\n')});
const index=await Core.build(files,parsers),query=Core.query(index,{file:'main.js',activeFiles:files.map(f=>f.path),selectorMatches:index.records.filter(r=>r.selector?.value==='#save').map(r=>r.id)}),graph=Flow.project(index,query);
const fn=n=>graph.nodes.find(r=>r.name===n),names=v=>v.nodes.map(n=>n.name),save=fn('save'),validate=fn('validate'),submit=fn('submit'),shared=fn('shared');
assert.ok(save&&validate&&submit&&shared);assert.ok(!names(graph).some(n=>/unused|irrelevant|unrelated/.test(n)));
assert.ok(names(Flow.view(graph)).includes('save'));assert.ok(!names(Flow.view(graph)).includes('validate'));
let expanded=new Set([save.id]);assert.ok(names(Flow.view(graph,expanded)).includes('validate'));assert.ok(!names(Flow.view(graph,expanded)).includes('shared'));
expanded.add(validate.id);expanded.add(submit.id);let view=Flow.view(graph,expanded);assert.equal(view.nodes.filter(n=>n.id===shared.id).length,1);
expanded.delete(validate.id);assert.ok(names(Flow.view(graph,expanded)).includes('shared'));expanded.delete(submit.id);assert.ok(!names(Flow.view(graph,expanded)).includes('shared'));
const full=Flow.view(graph,new Set(),true);assert.equal(full.nodes.length,graph.nodes.length);
assert.equal(Flow.view(graph,new Set(),true,2).remaining,graph.nodes.length-2);
const edge=graph.edges.find(e=>e.from===save.id&&e.to===validate.id);assert.ok(edge.evidence.some(r=>r.type==='call'&&r.file==='actions.js'&&r.line===3));
for(const e of graph.edges)for(const r of e.evidence){const raw=files.find(f=>f.path===r.file).source;assert.ok(raw.slice(r.start,r.end));assert.equal(Core.position(Core.lineTable(raw),r.start).line,r.line);}
const event=graph.nodes.find(n=>n.type==='event'),handler=graph.edges.find(e=>e.from===event.id&&e.to===save.id);assert.ok(handler.evidence.some(r=>r.type==='event'&&r.line===3));assert.ok(handler.evidence.some(r=>r.file==='barrel.js'));
const special=[{path:'a.html',source:'<button id="x" onclick="save()">x</button><script>function save(){helper()}function helper(){}</script>'}];const si=await Core.build(special,parsers);const sg=Flow.project(si,Core.query(si,{file:'a.html',htmlStarts:[0],activeFiles:['a.html']}));assert.ok(sg.edges.some(e=>e.certainty==='possible'&&sg.nodes.find(n=>n.id===e.from)?.type==='inline-event'));
const dynamic=await Core.build([{path:'dynamic.js',source:'const b=document.querySelector("#x");b.addEventListener("click",()=>handlers[action]());const handlers={};'}],parsers);assert.ok(dynamic.gaps.length>0,'dynamic member dispatch must expose a gap');
const shadow=await Core.build([{path:'shadow.js',source:'const b=document.querySelector("#x");function run(){function helper(){return 1;}helper();}function helper(){return 2;}b.addEventListener("click",run);'}],parsers);const sf=Flow.project(shadow,Core.query(shadow,{file:'shadow.js',activeFiles:['shadow.js'],selectorMatches:shadow.records.filter(r=>r.selector?.value==='#x').map(r=>r.id)}));assert.equal(sf.nodes.filter(n=>n.name==='helper').length,1);
console.log('PASS 1,300+ lines: progressive expansion/collapse, shared downstream deduplication, all/limit, call/event/re-export evidence positions, inline uncertainty, dynamic gaps and lexical shadowing');
})().catch(e=>{console.error(e);process.exit(1)});
