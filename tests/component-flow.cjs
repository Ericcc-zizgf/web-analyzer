const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const babel=require('../frontend/vendor/babel.js'),Flow=require('../frontend/component-flow.js');
const ctx={self:{},importScripts(){}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../frontend/analysis-worker.js'),'utf8')+'\nself.inspect=inspect;',ctx);
(async()=>{
const source=`const button=document.querySelector('#save');
function save(){persist();}
function persist(){fetch('/save');save();}
function unrelated(){fetch('/unrelated');}
button.addEventListener('click',save);
function shadow(save){save();}
`;
const parsed=ctx.self.inspect(await babel.parsers.babel.parse(source,{}),source);parsed.id='f';
const graph=Flow.build({files:[{id:'f',kind:'js',loaded:true,label:'main.js',source}],inline_events:[]},[parsed],s=>s==='#save');
assert.ok(graph.nodes.some(n=>n.title==='save()'));
assert.ok(graph.nodes.some(n=>n.kind==='bindings' && n.source.startsWith('const button')));
assert.ok(graph.nodes.some(n=>n.kind==='functions'&&n.title==='persist()'));
assert.ok(graph.nodes.some(n=>n.source.includes("fetch('/save')")));
assert.ok(!graph.nodes.some(n=>n.source.includes('/unrelated')));
assert.ok(graph.edges.some(e=>e.label==='事件回呼'));
assert.ok(graph.edges.some(e=>e.label==='函式定義'));
const shadowCall=parsed.calls.find(c=>c.line===6);assert.equal(shadowCall.resolvedStart,undefined);
const uncertain=`let run=()=>fetch('/wrong');run=unknown;document.querySelector('#save').addEventListener('click',run);`;
const q=ctx.self.inspect(await babel.parsers.babel.parse(uncertain,{}),uncertain);assert.equal(q.events[0].resolvedHandlerStart,undefined);
const empty=Flow.build({files:[],inline_events:[]},[],()=>true);assert.equal(empty.nodes.length,0);
const inline=Flow.build({files:[],inline_events:[{target_node:'n',event:'click',code:'save()'}]},[],(s,id)=>id==='n');assert.equal(inline.nodes[0].source,'save()');
const broken=Flow.build({files:[{id:'bad',kind:'js',label:'bad.js',loaded:true}]},[{id:'bad',error:'bad syntax'}],()=>true);assert.equal(broken.warnings.length,1);
console.log('PASS component event → callback → transitive calls/effects, cycles, unrelated exclusion, lexical shadowing/reassignment, inline and parse-error states');
})().catch(e=>{console.error(e);process.exit(1)});
