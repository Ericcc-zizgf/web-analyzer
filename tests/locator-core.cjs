const assert=require('node:assert/strict'),Core=require('../frontend/locator-core.js'),babel=require('../frontend/vendor/babel.js'),postcss=require('../frontend/vendor/postcss.js');
const parsers={js:(s,ts)=>babel.parsers[ts?'babel-ts':'babel'].parse(s,{}),css:s=>postcss.parsers.css.parse(s,{})};
(async()=>{
 const html='<!doctype html>\n<html><body>\n<button\n id="save"\n onclick="save()">Save</button>\n<script type="module">\nimport {save} from "./entry.js";\ndocument.querySelector("#save").addEventListener("click",save);\n</script>\n<style>\n#save {color:red}\n@media (min-width:1px){#save {color:blue}}\n</style></body></html>';
 const input=[{path:'Main.htm',source:html},{path:'entry.js',source:'export {save} from "./actions.js";'},{path:'actions.js',source:'import {format} from "./utils.js";\nexport function save(){return format("saved");}\nfunction unrelated(){return 123;}'},{path:'utils.js',source:'export function format(value){return value;}\nfunction another(){return 2;}'},{path:'other.js',source:'const same=document.querySelector("#save");same.addEventListener("click",()=>{});'},{path:'style.css',source:'/* #save fake */\n#save {padding:2px}\n#save {padding:3px}'}];
 const index=await Core.build(input,parsers);assert.ok(!index.gaps.some(g=>g.reason.includes('解析失敗')),JSON.stringify(index.gaps));
 const selectors=index.records.filter(r=>r.selector?.value==='#save');assert.equal(selectors[0].line,8);
 const htmlRecord=index.records.find(r=>r.type==='html'&&r.attrs.id==='save');assert.equal(htmlRecord.line,3);
 const onclick=index.records.find(r=>r.type==='inline-event');assert.equal(onclick.line,5);
 const css=index.records.filter(r=>r.file==='style.css'&&r.type==='css');assert.deepEqual(css.map(r=>r.line),[2,3]);
 const result=Core.query(index,{file:'Main.htm',htmlStarts:[htmlRecord.start],activeFiles:['Main.htm','entry.js','actions.js','utils.js'],selectorMatches:selectors.map(r=>r.id),tokens:['save']});
 assert.ok(result.results.some(r=>r.type==='function'&&r.name==='save'&&r.file==='actions.js'&&r.certainty==='confirmed'));
 assert.ok(result.results.some(r=>r.type==='function'&&r.name==='format'&&r.file==='utils.js'&&r.certainty==='confirmed'));
 assert.ok(result.results.some(r=>r.file==='entry.js'&&r.type==='export'&&r.certainty==='confirmed'));
 assert.ok(!result.results.some(r=>r.name==='unrelated'||r.name==='another'));
 assert.ok(result.results.some(r=>r.file==='other.js'&&r.certainty==='possible'));
 for(const r of index.records){assert.equal(Core.position(Core.lineTable(input.find(f=>f.path===r.file).source),r.start).line,r.line);assert.ok(r.end>=r.start);}
 const shadow=await Core.build([{path:'main.js',source:'const b=document.querySelector("#one");function f(document){document.querySelector("#fake");}function g(b){b.addEventListener("click",f);}b.addEventListener("click",()=>{});'}],parsers);assert.ok(!shadow.records.some(r=>r.selector?.value==='#fake'));
 const alias=await Core.build([{path:'a.js',source:'const a=document.querySelector("#x");const b=a;function handle(){}b.addEventListener("click",handle);'}],parsers);const ar=Core.query(alias,{file:'a.js',activeFiles:['a.js'],selectorMatches:alias.records.filter(r=>r.selector?.value==='#x').map(r=>r.id)});assert.ok(ar.results.some(r=>r.type==='function'&&r.name==='handle'));
 const ns=await Core.build([{path:'a.js',source:'export * as thing from "./b.js";'}, {path:'b.js',source:'export const x=1;'}],parsers);assert.ok(ns.coverage.records>0);
 const capped=await Core.build([{path:'large.js',source:Array.from({length:2200},(_,i)=>'const v'+i+'=document.querySelector("#n'+i+'");').join('\n')}],parsers);assert.ok(capped.gaps.some(g=>g.reason.includes('6,000')));
 const cssdeps=await Core.build([{path:'a.css',source:':root{--tone:red} .x{color:var(--tone);animation:spin 1s} @keyframes spin{to{opacity:0}}'}],parsers);const cr=Core.query(cssdeps,{activeFiles:['a.css'],cssMatches:cssdeps.records.filter(r=>r.type==='css'&&r.selector==='.x').map(r=>r.id)});assert.ok(cr.results.some(r=>r.type==='keyframes'));assert.ok(cr.results.some(r=>r.name==='--tone'));
 const bad=await Core.build([{path:'bad.js',source:'function {'}],parsers);assert.ok(bad.gaps.some(g=>g.reason.includes('解析失敗')));
 console.log('PASS original HTML/inline JS/CSS positions, repeated CSS selectors, named imports/re-export/calls, unrelated exclusion, inactive-file confidence, lexical shadowing, parse failure coverage');
})().catch(e=>{console.error(e);process.exit(1)});
