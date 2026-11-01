const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("../frontend/vendor/babel.js");
const context = { self: {}, importScripts() {} };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "../frontend/analysis-worker.js"), "utf8") +
    "\nself.inspectForTest=inspect;",
  context,
);
async function inspect(source) {
  return context.self.inspectForTest(await babel.parsers.babel.parse(source, {}), source);
}
(async () => {
  const stable = await inspect(
    "const button=document.querySelector('#one');button.addEventListener('click',()=>{});",
  );
  assert.equal(stable.events[0].target, "#one");
  for (const source of [
    "let button=document.querySelector('#one');button=document.querySelector('#two');button.addEventListener('click',()=>{});",
    "let button=document.querySelector('#one');if(flag)button=document.querySelector('#two');button.addEventListener('click',()=>{});",
    "let button=document.querySelector('#one');function change(){button=document.querySelector('#two')}button.addEventListener('click',()=>{});",
    "let button=document.querySelector('#one');button.addEventListener('click',()=>{});function change(){button=null}",
    "let button=document.querySelector('#one');[button]=unknown;button.addEventListener('click',()=>{});",
    "let button=document.querySelector('#one');for(button of others){}button.addEventListener('click',()=>{});",
    "var button=document.querySelector('#one');var button=document.querySelector('#two');button.addEventListener('click',()=>{});",
  ]) {
    const r = await inspect(source);
    assert.equal(r.events[0].target, null, source);
    assert.ok(!r.events[0].relatedTargets.includes("#one"), source);
  }
  const shadow = await inspect(
    "const button=document.querySelector('#one');{let button=document.querySelector('#two');button=null;button?.addEventListener('click',()=>{});}button.addEventListener('click',()=>{});",
  );
  assert.equal(shadow.events[0].target, null);
  assert.equal(shadow.events[1].target, "#one");
  const param = await inspect(
    "const button=document.querySelector('#one');function run(button){button=null;button?.addEventListener('click',()=>{});}button.addEventListener('click',()=>{});",
  );
  assert.equal(param.events[0].target, null);
  assert.equal(param.events[1].target, "#one");
  for (const code of [
    "function run({button}){button.addEventListener('click',()=>{});}",
    "try{}catch(button){button.addEventListener('click',()=>{});}",
    "const fn=function button(){button.addEventListener('click',()=>{});};",
  ]) {
    const r = await inspect(
      "const button=document.querySelector('#one');" +
        code +
        "button.addEventListener('click',()=>{});",
    );
    assert.equal(r.events[0].target, null, code);
    assert.equal(r.events[1].target, "#one", code);
  }
  const loopShadow = await inspect(
    "const button=document.querySelector('#one');for(let button of buttons){button.addEventListener('click',()=>{});}button.addEventListener('click',()=>{});",
  );
  assert.equal(loopShadow.events[0].target, null);
  assert.equal(loopShadow.events[1].target, "#one");
  for (const code of [
    "{const {button}=unknown;button.addEventListener('click',()=>{});}",
    "{button.addEventListener('click',()=>{});const button=unknown;}",
    "function run(){button.addEventListener('click',()=>{});if(flag){var button=unknown;}}",
  ]) {
    const r = await inspect(
      "const button=document.querySelector('#one');" +
        code +
        "button.addEventListener('click',()=>{});",
    );
    assert.equal(r.events[0].target, null, code);
    assert.equal(r.events[1].target, "#one", code);
  }
  const optional = await inspect(
    "document.querySelector?.('#optional')?.addEventListener('click',()=>{});",
  );
  assert.equal(optional.events[0].target, "#optional");
  const related = await inspect(
    "const one=document.querySelector('#one');function save(){fetch('/notes')}one.addEventListener('click',save);",
  );
  assert.ok(related.network[0].relatedTargets.includes("#one"));
  console.log(
    "PASS immutable DOM targets, conservative reassignment/branch/closure/destructuring/loop handling, block/parameter shadowing, optional selectors and handler association",
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
