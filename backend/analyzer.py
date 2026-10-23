"""HTML5 tree and CSS syntax analysis; scripts are never evaluated."""
import re
import time
from urllib.parse import urljoin,urlsplit,unquote
from bs4 import BeautifulSoup,Tag
import tinycss2
from fetcher import AnalysisError,fetch,origin,parse_url

MAX_HTML=2*1024*1024
MAX_ASSETS=12


def css_rules(text,file_id,conditions=None):
    rules=[];notes=[]
    def visit(items,groups):
        for item in items:
            if item.type=='error':notes.append('CSS 語法：'+item.message+'（第 '+str(item.source_line)+' 行）')
            elif item.type=='qualified-rule':
                selector=tinycss2.serialize(item.prelude).strip()
                declarations=[]
                for d in tinycss2.parse_declaration_list(item.content,skip_comments=True,skip_whitespace=True):
                    if d.type=='declaration':declarations.append({'property':d.name,'value':tinycss2.serialize(d.value).strip(),'important':d.important,'line':d.source_line})
                    elif d.type=='error':notes.append('CSS 宣告語法：'+d.message)
                if len(rules)<1800:rules.append({'selector':selector,'declarations':declarations,'conditions':groups,'file':file_id,'line':item.source_line})
            elif item.type=='at-rule':
                name=item.lower_at_keyword;condition=tinycss2.serialize(item.prelude).strip()
                if name=='import':notes.append('發現 @import：'+condition+'；此版本不展開匯入依賴')
                if item.content is not None and name in ('media','supports','layer','container','scope','document'):
                    visit(tinycss2.parse_rule_list(item.content,skip_comments=True,skip_whitespace=True),groups+[{'type':name,'condition':condition}])
    visit(tinycss2.parse_stylesheet(text,skip_comments=True,skip_whitespace=True),conditions or [])
    if len(rules)>=1800:notes.append('CSS 規則清單最多顯示 1800 筆；安全預覽仍使用取得的完整 CSS')
    return rules,notes


def analyze(html,source_label='貼上的 HTML',base_url=None,companions=None,load_assets=False):
    if not isinstance(html,str) or not html.strip():raise AnalysisError('請輸入或上傳 HTML')
    if len(html.encode())>MAX_HTML:raise AnalysisError('HTML 限制 2 MB',413)
    if base_url:base_url=parse_url(base_url)[0]
    companions=companions or {};warnings=[];files=[];rules=[];events=[];deadline=time.monotonic()+24
    soup=BeautifulSoup(html,'html5lib');tags=soup.find_all(True)
    if len(tags)>4000:raise AnalysisError('HTML 超過 4000 個元素，請先提供較小的頁面片段',413)
    nodes=[];tag_map={};ids={id(tag):'n'+str(i+1) for i,tag in enumerate(tags)}
    for tag in tags:
        depth=0;parent=tag.parent
        while isinstance(parent,Tag):depth+=1;parent=parent.parent
        if depth>90:raise AnalysisError('HTML 巢狀超過 90 層，請提供較小片段',413)
        node_id=ids[id(tag)];attrs={k:' '.join(v) if isinstance(v,list) else str(v) for k,v in tag.attrs.items()}
        text=' '.join(str(child).strip() for child in tag.children if isinstance(child,str))[:180]
        children=[ids[id(child)] for child in tag.children if isinstance(child,Tag)]
        parent_id=ids.get(id(tag.parent));nodes.append({'id':node_id,'tag':tag.name,'attrs':attrs,'text':text,'parent':parent_id,'children':children,'depth':depth-1,'line':getattr(tag,'sourceline',None)})
        tag_map[node_id]=tag
        for key,value in attrs.items():
            if key.lower().startswith('on') and len(key)>2:events.append({'event':key[2:],'target_node':node_id,'target':('#'+attrs['id']) if attrs.get('id') else tag.name,'code':value,'line':getattr(tag,'sourceline',None),'kind':'HTML 事件屬性'})
    document_origin=origin(base_url) if base_url else None
    if soup.base and soup.base.get('href'):
        warnings.append('原頁有 <base>，資源讀取會使用該基準網址；安全預覽不保留 base。')
        candidate=urljoin(base_url or '',soup.base['href'])
        try:base_url=parse_url(candidate)[0]
        except AnalysisError:warnings.append('無法使用原頁的 base 網址')
    source_origin=document_origin or (origin(base_url) if base_url else None)
    seen={};assets_used=0;budget=4*1024*1024
    def external(reference,kind):
        nonlocal assets_used,budget
        label=reference[:300];key=unquote(urlsplit(reference).path).lstrip('./')
        content=None;url=urljoin(base_url,reference) if base_url else reference
        if key in companions:content=companions[key]
        elif key.split('/')[-1] in companions:content=companions[key.split('/')[-1]]
        elif load_assets and base_url:
            try:
                if origin(url)!=source_origin:raise AnalysisError('跨來源資源未自動讀取')
                if assets_used>=MAX_ASSETS:raise AnalysisError('外部資源最多讀取 '+str(MAX_ASSETS)+' 份')
                if budget<=0:raise AnalysisError('外部資源總額度已用完')
                assets_used+=1
                result=fetch(url,limit=min(768*1024,budget),deadline=deadline,same_origin=source_origin)
                if 'text/html' in result['content_type'].lower():raise AnalysisError('資源回傳 HTML，沒有當作 '+kind+' 分析')
                content=result['text'];url=result['url'];budget-=result['bytes']
            except AnalysisError as error:return None,url,error.message
        else:return None,url,'沒有附加此檔案，或尚未啟用網址資源讀取'
        if len(content.encode())>768*1024:return None,url,'單一 CSS／JS 檔案超過 768 KB'
        return content,url,None
    file_id=0;replacements={}
    for tag in tags:
        kind='css' if tag.name=='style' or tag.name=='link' and 'stylesheet' in tag.get('rel',[]) else 'js' if tag.name=='script' else None
        if not kind:continue
        file_id+=1;fid='f'+str(file_id);reference=tag.get('href') if tag.name=='link' else tag.get('src')
        if reference:
            dedup=(kind,reference)
            if dedup in seen:
                replacements[ids[id(tag)]]=seen[dedup];continue
            content,url,error=external(reference,kind);label=reference
        else:content=tag.string if tag.string is not None else tag.get_text();url=None;error=None;label=('內嵌 CSS' if kind=='css' else '內嵌 JavaScript')+' #'+str(file_id)
        script_type=tag.get('type','').lower()
        data_script=kind=='js' and script_type not in ('','module','text/javascript','application/javascript','text/ecmascript','application/ecmascript')
        if data_script and not reference:label='內嵌資料（'+script_type+'） #'+str(file_id)
        file={'id':fid,'kind':'data' if data_script else kind,'label':label,'url':url,'source':content or '', 'loaded':content is not None,'error':error,'node':ids[id(tag)],'line':getattr(tag,'sourceline',None),'inline':not bool(reference),'module':script_type=='module','type':script_type}
        files.append(file);seen[(kind,reference)]=fid if reference else None;replacements[ids[id(tag)]]=fid
        if error:warnings.append(label+'：'+error)
        if kind=='css' and content is not None:
            groups=[{'type':'media','condition':tag['media']}] if tag.get('media') and tag['media']!='all' else []
            parsed,notes=css_rules(content,fid,groups);rules.extend(parsed);warnings.extend(label+'：'+note for note in notes)
    if len(files)>60:raise AnalysisError('樣式／腳本區塊超過 60 份，請提供較小片段',413)
    if events:warnings.append('HTML 中的事件屬性已列出，但不會在安全預覽執行。')
    if any(not f['loaded'] for f in files):warnings.append('部分資源未取得；分析與預覽僅包含已取得內容。')
    if any(f['kind']=='js' and f['module'] for f in files):warnings.append('模組 import 與動態載入依賴不會自動展開。')
    # Same HTML5 normalization gives stable IDs; inert copy removes executable/network nodes.
    safe=BeautifulSoup(str(soup),'html5lib')
    for original,tag in zip(tags,safe.find_all(True)):tag['data-web-analyzer-node']=ids[id(original)]
    by_file={f['id']:f for f in files}
    for tag in list(safe.find_all(True)):
        if tag.parent is None:continue
        node_id=tag.get('data-web-analyzer-node')
        if tag.name in ('script','iframe','object','embed','base') or tag.name=='meta' and tag.has_attr('http-equiv'):
            tag.decompose();continue
        if tag.name=='link':
            fid=replacements.get(node_id);file=by_file.get(fid)
            if file and file['kind']=='css' and file['loaded']:
                style=safe.new_tag('style');style.string=file['source'];style['data-web-analyzer-node']=node_id
                if tag.get('media'):style['media']=tag['media']
                tag.replace_with(style)
            else:tag.decompose()
            continue
        for key in list(tag.attrs):
            if key.lower()=='src' and tag.name=='img' and re.match(r'^data:image/(png|jpeg|webp|gif)[;,]',str(tag.get(key,'')),re.I):continue
            if key.lower().startswith('on') or key.lower() in ('src','srcset','action','formaction','poster','background','ping','autofocus'):del tag.attrs[key]
        if tag.name=='img':tag['alt']=tag.get('alt','圖片（安全預覽不載入外部資源）')
    meta=safe.new_tag('meta');meta['http-equiv']='Content-Security-Policy';meta['content']="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; form-action 'none'; base-uri 'none'";safe.head.insert(0,meta)
    safe.html['lang']=safe.html.get('lang','zh-Hant')
    return {'source_label':source_label,'base_url':base_url,'html':html,'nodes':nodes,'files':files,'css_rules':rules,'inline_events':events,'warnings':list(dict.fromkeys(warnings))[:80],'preview':str(safe),'stats':{'elements':len(nodes),'css_rules':len(rules),'scripts':sum(f['kind']=='js' for f in files),'stylesheets':sum(f['kind']=='css' for f in files),'inline_styles':sum(bool(n['attrs'].get('style')) for n in nodes)}},tag_map
