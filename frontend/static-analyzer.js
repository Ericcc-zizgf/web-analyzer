/* GitHub Pages adapter: parse user-supplied files locally; never execute source scripts. */
"use strict";
(() => {
  const cache = new Map();
  const bytes = text => new TextEncoder().encode(text).length;
  function requireSize(text, limit, message) { if (bytes(text) > limit) throw Error(message); }
  function parseCSS(source, file, initialConditions, warnings) {
    const rules = [];
    if (/@import\b/i.test(source)) warnings.push("CSS @import 不會自動讀取，請附加依賴檔案。");
    const sheet = new CSSStyleSheet();
    try { sheet.replaceSync(source); } catch (error) { warnings.push('CSS 無法解析：' + error.message); return rules; }
    // CSSOM may silently discard malformed declarations. Source remains available.
    function visit(items, conditions) {
      for (const rule of items) {
        if (rule.type === CSSRule.IMPORT_RULE) { warnings.push('CSS @import 不會自動讀取，請附加依賴檔案。'); continue; }
        if (rule.selectorText && rule.style) {
          if (rules.length >= 1800) continue;
          const declarations = Array.from(rule.style).map(property => ({
            property, value: rule.style.getPropertyValue(property).trim(),
            important: rule.style.getPropertyPriority(property) === 'important', line: null
          }));
          const offset = source.indexOf(rule.selectorText);
          rules.push({ selector: rule.selectorText, declarations, conditions, file,
            line: offset < 0 ? null : source.slice(0, offset).split('\n').length });
        }
        if (rule.cssRules) {
          const prefix = rule.cssText.trim().match(/^@([\w-]+)/)?.[1] || 'nested';
          const condition = rule.conditionText || rule.name || '';
          visit(rule.cssRules, [...conditions, { type: prefix, condition }]);
        }
      }
    }
    visit(sheet.cssRules, initialConditions);
    if (rules.length >= 1800) warnings.push('CSS 規則清單最多顯示 1800 筆。');
    return rules;
  }
  function parseHTML(html) {
    // A detached template keeps source content inert, including resource elements.
    const template = document.createElement('template');
    template.innerHTML = html;
    // Parse as a full document without activating or fetching original source URLs.
    // DOMParser may fetch resource URLs in some engines; first remove URL-bearing attrs
    // using inert nodes, then parse the inert serialization. Preserve original attrs separately.
    const originals = new Map();
    let serial = 0;
    function inertTree(fragment) {
      for (const tag of fragment.querySelectorAll('*')) {
        const marker = 'source-' + (++serial);
        originals.set(marker, Object.fromEntries(Array.from(tag.attributes, a => [a.name, a.value])));
        tag.setAttribute('data-static-source-key', marker);
        for (const attr of [...tag.attributes]) {
          if (/^(src|srcdoc|srcset|href|action|formaction|poster|background|ping|data|codebase|manifest)$/i.test(attr.name) || /^on/i.test(attr.name)) tag.removeAttribute(attr.name);
        }
        if (tag.localName === 'template') inertTree(tag.content);
      }
    }
    inertTree(template.content);
    const doc = new DOMParser().parseFromString(template.innerHTML, 'text/html');
    // Fragment parsing discards wrapper attrs. Recover only real start tags,
    // ignoring comments and raw script/style text via the shared tokenizer.
    const wrappers = SourceUtils.htmlTags(html);
    for (const tag of [doc.documentElement, doc.head, doc.body]) {
      const source = wrappers.find(token => token.name === tag.localName && token.templateDepth === 0);
      if (source) {
        const marker = 'source-' + (++serial);
        originals.set(marker, source.attrs);
        tag.setAttribute('data-static-source-key', marker);
      }
    }
    return { doc, originals };
  }
  function sanitizePreview(doc, filesByNode) {
    const safe = doc.cloneNode(true);
    const blocked = new Set(['script', 'iframe', 'object', 'embed', 'base', 'meta', 'link', 'template', 'noscript', 'svg', 'math', 'audio', 'video', 'source', 'track', 'portal']);
    const allowedAttrs = new Set(['id','class','style','title','lang','dir','role','type','placeholder','value','checked','disabled','selected','multiple','rows','cols','colspan','rowspan','width','height','alt','hidden','open','for','data-web-analyzer-node']);
    for (const tag of [...safe.querySelectorAll('*')]) {
      if (!tag.parentNode) continue;
      if (tag.localName === 'link') {
        const file = filesByNode.get(tag.getAttribute('data-web-analyzer-node'));
        if (file?.kind === 'css' && file.loaded) {
          const style = safe.createElement('style'); style.textContent = (file.preview_source ?? file.source).replace(/</g, '\\3c ');
          style.setAttribute('data-web-analyzer-node', tag.getAttribute('data-web-analyzer-node'));
          const media = file.media; if (media) style.setAttribute('media', media);
          tag.replaceWith(style);
        } else tag.remove();
        continue;
      }
      if (blocked.has(tag.localName) || tag.namespaceURI !== 'http://www.w3.org/1999/xhtml') { tag.remove(); continue; }
      for (const attr of [...tag.attributes]) {
        if (!allowedAttrs.has(attr.name) && !attr.name.startsWith('aria-')) tag.removeAttribute(attr.name);
      }
      if (tag.localName === 'style') { const file=filesByNode.get(tag.getAttribute('data-web-analyzer-node')); tag.textContent = (file?.preview_source ?? tag.textContent).replace(/</g, '\\3c '); }
      if (tag.localName === 'img' && !tag.getAttribute('alt')) tag.setAttribute('alt','圖片（安全預覽不載入外部資源）');
    }
    const csp = safe.createElement('meta');
    csp.httpEquiv = 'Content-Security-Policy';
    csp.content = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; object-src 'none'";
    safe.head.prepend(csp);
    return '<!doctype html>\n' + safe.documentElement.outerHTML;
  }
  async function analyze(options) {
    if (options.signal?.aborted) throw new DOMException('已取消', 'AbortError');
    const input = options.body;
    if (!(input instanceof FormData)) throw Error('Pages 版請貼上或上傳 HTML；網址讀取需要 Python 本機版。');
    const project = options.project ? ProjectPage.create(options.project) : null;
    const companions = new Map();
    const assets = input.getAll('assets');
    if (assets.length > 12) throw Error('附加 CSS／JS 最多 12 份。');
    let total = 0;
    for (const file of assets) {
      if (!(file instanceof File) || !/\.(css|js|mjs|jsx|ts|tsx)$/i.test(file.name)) throw Error('附加檔案僅接受 CSS／JavaScript。');
      if (file.size > 768*1024) throw Error('單一附加檔案最多 768 KB。');
      if (companions.has(file.name)) throw Error('附加檔案同名：' + file.name);
      total += file.size; companions.set(file.name, await file.text());
    }
    let html = project ? project.html : String(input.get('html') || ''), label = project ? project.entry : '貼上的 HTML';
    const main = project ? null : input.get('html_file');
    if (main instanceof File) {
      if (main.size > 2*1024*1024) throw Error('HTML 限制 2 MB。');
      html = await main.text(); label = main.name;
    }
    if (!html.trim()) throw Error('請輸入或上傳 HTML。');
    requireSize(html,2*1024*1024,'HTML 限制 2 MB。');
    if (total + bytes(html) > 8*1024*1024) throw Error('HTML 與附加檔案合計最多 8 MB。');
    if (options.signal?.aborted) throw new DOMException('已取消','AbortError');
    if (SourceUtils.htmlTags(html).length > 4000) throw Error('HTML 最多 4000 個元素。');
    const { doc, originals } = parseHTML(html);
    const tags = [...doc.querySelectorAll('*')];
    if (tags.length > 4000) throw Error('HTML 最多 4000 個元素。');
    const ids = new Map(tags.map((tag,index)=>[tag,'n'+(index+1)]));
    const nodes = [], inlineEvents = [], attrsByTag = new Map();
    const warnings = ['Pages 瀏覽器版：使用瀏覽器 HTML/CSS 解析，沒有執行 Python 或來源腳本。', 'DOM 行號不提供；CSS 行號僅估算第一次出現的位置。瀏覽器可能略過無效 CSS，與 Python 解析結果不完全相同。', '安全預覽不載入圖片或外部資源；請附加 HTML 引用的 CSS／JS。'];
    for (const tag of tags) {
      const attrs = originals.get(tag.getAttribute('data-static-source-key')) || {};
      attrsByTag.set(tag, attrs);
      const id = ids.get(tag);
      let depth=0;
      for (let parent=tag.parentElement;parent;parent=parent.parentElement) depth++;
      if (depth > 90) throw Error('HTML 巢狀最多 90 層。');
      const text=[...tag.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent.trim()).join(' ').slice(0,180);
      nodes.push({ id,tag:tag.localName,attrs,text,parent:ids.get(tag.parentElement)||null,children:[...tag.children].map(c=>ids.get(c)),depth,line:null });
      for (const [key,code] of Object.entries(attrs)) if (/^on./i.test(key)) inlineEvents.push({event:key.slice(2),target_node:id,target:attrs.id?'#'+attrs.id:tag.localName,code,line:null,kind:'HTML 事件屬性'});
    }
    const files=[],rules=[],filesByNode=new Map();
    const baseHref = nodes.find(n=>n.tag==='base')?.attrs.href;
    const scriptRoots = [];
    let analysisBytes = bytes(html);
    function account(file) {
      const source = file.preview_source ?? file.source;
      analysisBytes += bytes(file.kind === 'css' ? source.replace(/</g, '\\3c ') : source);
      if (analysisBytes > 8*1024*1024) throw Error('HTML 與展開來源合計最多 8 MB。');
    }

    if(project) { warnings.splice(0,1,'資料夾網頁分析：直接使用已選取的 HTML／CSS／JS，不需再次上傳。'); warnings[2]='安全預覽不載入圖片或外部資源；CSS／JS 已自動從所選資料夾對應。'; warnings.push('JS 模組只做靜態解析，不執行 React／Vue 等框架；動態產生的畫面無法由 HTML 還原。'); }
    for (let index=0; index<nodes.length; index++) {
      const node=nodes[index], tag=tags[index], attrs=node.attrs;
      const kind=node.tag==='style'||(node.tag==='link'&&/\bstylesheet\b/i.test(attrs.rel||''))?'css':node.tag==='script'?'js':null;
      if (!kind) continue;
      if (files.length >= 60) throw Error('樣式／腳本區塊最多 60 份。');
      const ref=node.tag==='link'?attrs.href:attrs.src;
      const id='f'+(files.length+1);
      let source=tag.textContent, error=null, projectPath=null;
      if (ref) {
        let name=ref.split(/[?#]/)[0].split('/').pop();
        try { name=decodeURIComponent(name); } catch (_) { /* malformed URL stays unavailable */ }
        if(project) { const asset=project.asset(ref,baseHref); source=asset.source; projectPath=asset.path; }
        else source=companions.get(name);
        if (source===undefined) error=project?'資料夾中沒有可載入的對應檔案，或已超出分析限制。':'未附加此檔案；Pages 版不自動讀取外部資源。';
      }
      const type=(attrs.type||'').toLowerCase();
      const dataScript=kind==='js'&&!['','module','text/javascript','application/javascript','text/ecmascript','application/ecmascript'].includes(type);
      const file={id,kind:dataScript?'data':kind,label:projectPath||ref||`內嵌 ${kind==='css'?'CSS':'JavaScript'} #${files.length+1}`,url:null,source:source||'',loaded:source!==undefined,error,node:node.id,line:null,inline:!ref,module:type==='module',type,media:attrs.media||''};
      if(project && kind==='css' && file.loaded) file.preview_source=project.expandCSS(file.source,projectPath||project.entry);
      if(project && kind==='js' && projectPath && file.loaded) {scriptRoots.push(projectPath);project.loadedScripts.add(projectPath);}
      account(file);
      files.push(file); filesByNode.set(node.id,file);
      if (error) warnings.push(file.label+'：'+error);
      if (kind==='css'&&file.loaded) rules.push(...parseCSS(file.preview_source ?? file.source,id,attrs.media&&attrs.media!=='all'?[{type:'media',condition:attrs.media}]:[],warnings));
    }
    if(project) {
      for(const dependency of project.scripts(scriptRoots)) {
        const id='f'+(files.length+1);
        if(files.length>=60){project.warnings.push('樣式／腳本分析最多 60 份，部分模組未加入。');break;}
        const file={id,kind:dependency.kind,label:dependency.path,url:null,source:dependency.source,loaded:true,error:null,node:null,line:null,inline:false,module:dependency.kind==='js',type:'module',dependency:true};
        account(file);
        files.push(file);
        if(file.kind==='css') {
          // Imports in JS are listed for source inspection. Bundler-specific CSS order is unknown.
          warnings.push(file.label+'：由 JS 匯入的樣式只列出來源；預覽不猜測打包器的套用順序。');
        }
      }
      warnings.push(...project.warnings);
      if(files.some(f=>f.preview_source!==undefined && f.preview_source!==f.source)) warnings.push('CSS @import 已從資料夾展開；匯入規則的行號以合併樣式估算，原檔可在專案地圖查看。');
    }
    if (options.summaryOnly) return {
      path:label, status:'done', elements:nodes.length, css_rules:rules.length,
      scripts:files.filter(f=>f.kind==='js').length,
      loaded:files.filter(f=>f.loaded).length, missing:files.filter(f=>!f.loaded).map(f=>f.label),
      warnings:[...new Set(warnings)].slice(0,80)
    };
    // Keep inert DOM nodes; never eagerly duplicate every ancestor's subtree.
    const nodesById = new Map(tags.map(tag => [ids.get(tag), tag]));
    const escapeAttr = value => String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
    const voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
    function snippet(root) {
      const chunks=[], limit=200000; let length=0;
      function append(value) {
        if (length > limit) return;
        const remaining=limit+1-length;
        chunks.push(value.slice(0,remaining)); length+=Math.min(value.length,remaining);
      }
      function visit(tag, depth=0) {
        if (length > limit) return;
        if (depth > 90) { append('<!-- 片段巢狀超過 90 層 -->'); return; }
        const attrs=attrsByTag.get(tag)||originals.get(tag.getAttribute('data-static-source-key'))||{};
        append('<'+tag.localName+Object.entries(attrs).map(([k,v])=>' '+k+'="'+escapeAttr(v)+'"').join('')+'>');
        if(voidTags.has(tag.localName)) return;
        for (const child of (tag.localName==='template' ? tag.content.childNodes : tag.childNodes)) {
          if (length > limit) break;
          if (child.nodeType===Node.ELEMENT_NODE) visit(child,depth+1);
          else if (child.nodeType===Node.TEXT_NODE) append(tag.localName==='style'||tag.localName==='script'?child.textContent:child.textContent.replace(/&/g,'&amp;').replace(/</g,'&lt;'));
          else if (child.nodeType===Node.COMMENT_NODE) append('<!--'+child.textContent+'-->');
        }
        append('</'+tag.localName+'>');
      }
      visit(root);
      return {source:chunks.join('').slice(0,limit),truncated:length>limit,normalized:true};
    }
    const previewAttrs=new Set(['id','class','style','title','lang','dir','role','type','placeholder','value','checked','disabled','selected','multiple','rows','cols','colspan','rowspan','width','height','alt','hidden','open','for']);
    for (const tag of tags) {
      const attrs=originals.get(tag.getAttribute('data-static-source-key'))||{};
      for(const [key,value] of Object.entries(attrs)) if(previewAttrs.has(key)||key.startsWith('aria-'))tag.setAttribute(key,value);
      tag.removeAttribute('data-static-source-key');
      tag.setAttribute('data-web-analyzer-node',ids.get(tag));
    }
    const preview=sanitizePreview(doc,filesByNode);
    const id=crypto.randomUUID(); cache.set(id,{nodesById,snippet}); while(cache.size>3)cache.delete(cache.keys().next().value);
    return {id,project:!!project,source_label:label,base_url:null,html,nodes,files,css_rules:rules,inline_events:inlineEvents,warnings:[...new Set(warnings)].slice(0,80),preview,stats:{elements:nodes.length,css_rules:rules.length,scripts:files.filter(f=>f.kind==='js').length,stylesheets:files.filter(f=>f.kind==='css').length,inline_styles:nodes.filter(n=>n.attrs.style).length}};
  }
  window.StaticAnalyzer = { async route(path,options={}) {
    if (path==='/api/analyze') return analyze(options);
    const match=path.match(/^\/api\/analysis\/([^/]+)\/node\/([^/]+)$/);
    if (match) {
      const cached=cache.get(match[1]), tag=cached?.nodesById.get(match[2]);
      if (!tag) throw Error('分析內容已過期，請重新分析。');
      return cached.snippet(tag);
    }
    throw Error('Pages 版沒有這個後端接口。');
  }};
})();
