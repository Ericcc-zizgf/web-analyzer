"""Local HTML/CSS/JavaScript analysis workbench. Source text is data, never instructions."""
import argparse
from collections import OrderedDict
import json
import hashlib
from pathlib import Path
import secrets
import threading
import time
from flask import Flask,jsonify,request,send_from_directory,redirect
from werkzeug.exceptions import HTTPException
from analyzer import analyze,MAX_HTML
from fetcher import AnalysisError,fetch

ROOT=Path(__file__).resolve().parents[1]


def create_app(config=None):
    app=Flask(__name__,static_folder=str(ROOT/'frontend'),static_url_path='/static')
    app.config.update(MAX_CONTENT_LENGTH=8*1024*1024)
    if config:app.config.update(config)
    token=secrets.token_urlsafe(32);cache=OrderedDict();lock=threading.Lock()
    @app.before_request
    def local():
        if request.host.split(':')[0] not in ('127.0.0.1','localhost'):raise AnalysisError('僅供本機使用',403)
        if request.method=='POST':
            if request.headers.get('Origin') not in (None,request.host_url.rstrip('/')) or not secrets.compare_digest(request.headers.get('X-Analyzer-Token',''),token):raise AnalysisError('請從本機分析器頁面操作',403)
    @app.after_request
    def headers(response):
        response.headers['Cache-Control']='no-store';response.headers['X-Content-Type-Options']='nosniff';response.headers['Referrer-Policy']='no-referrer'
        response.headers['Content-Security-Policy']="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; worker-src 'self'; frame-src 'self' about:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
        return response
    @app.get('/')
    def home():return send_from_directory(ROOT/'frontend','index.html')
    @app.get('/hub')
    def hub():
        workspace=ROOT.parent
        key=hashlib.sha256(str(workspace).encode()).hexdigest()[:20]
        state=workspace/'launcher/.runtime'/(key+'.json')
        if not state.exists():return '請先雙擊最外層專案資料夾的 start.command，再開啟總覽。',409
        url=json.loads(state.read_text()).get('url','')
        if not url.startswith('http://127.0.0.1:'):raise AnalysisError('找不到有效的本機總覽網址')
        return redirect(url)

    @app.get('/api/session')
    def session():return jsonify(token=token,service='網頁分析器')
    @app.post('/api/analyze')
    def run_analysis():
        companions={}
        if request.is_json:
            data=request.get_json()
            if not isinstance(data,dict):raise AnalysisError('JSON 必須是物件')
        else:
            data=request.form.to_dict();main=request.files.get('html_file')
            if main:
                raw=main.read(MAX_HTML+1)
                if len(raw)>MAX_HTML:raise AnalysisError('HTML 限制 2 MB',413)
                data['html']=raw.decode('utf-8-sig',errors='replace');data['filename']=main.filename
            assets=request.files.getlist('assets')
            if len(assets)>12:raise AnalysisError('附加 CSS／JavaScript 最多 12 份')
            for file in assets:
                name=Path(file.filename or '').name
                if not name.lower().endswith(('.css','.js','.mjs','.jsx','.ts','.tsx')):raise AnalysisError('附加檔案僅接受 CSS／JavaScript 原始碼')
                if name in companions:raise AnalysisError('附加檔案同名，請重新命名：'+name)
                raw=file.read(768*1024+1)
                if len(raw)>768*1024:raise AnalysisError('單一附加檔案限制 768 KB',413)
                companions[name]=raw.decode('utf-8-sig',errors='replace')
        mode=data.get('mode','html');base=data.get('base_url') or None
        load=data.get('load_assets') in (True,'true','1')
        if mode=='url':
            result=fetch(data.get('url'),limit=MAX_HTML,deadline=time.monotonic()+12)
            content_type=result['content_type'].lower()
            if content_type and not any(kind in content_type for kind in ('text/html','application/xhtml+xml','text/plain')):raise AnalysisError('來源不是 HTML 頁面（'+content_type[:100]+'）')
            html=result['text'];base=result['url'];label=base
        elif mode in ('html','file'):html=data.get('html','');label=data.get('filename') or '貼上的 HTML'
        else:raise AnalysisError('不支援的輸入方式')
        report,tags=analyze(html,label,base,companions,load and bool(base))
        analysis_id=secrets.token_hex(16);report['id']=analysis_id
        with lock:
            now=time.monotonic()
            for key in list(cache):
                if now-cache[key]['created']>1800:del cache[key]
            cache[analysis_id]={'created':now,'tags':tags}
            while len(cache)>3:cache.popitem(last=False)
        return jsonify(report)
    @app.get('/api/analysis/<analysis_id>/node/<node_id>')
    def node_source(analysis_id,node_id):
        with lock:
            entry=cache.get(analysis_id)
            if not entry or time.monotonic()-entry['created']>1800:raise AnalysisError('分析內容已過期，請重新分析',404)
            node=entry['tags'].get(node_id)
            if node is None:raise AnalysisError('找不到元素',404)
            source=node.prettify()
        truncated=len(source)>200000
        return jsonify(source=source[:200000],truncated=truncated,normalized=True)
    @app.errorhandler(AnalysisError)
    def expected(error):return jsonify(error=error.message),error.status
    @app.errorhandler(HTTPException)
    def http_error(error):return jsonify(error=error.description),error.code
    @app.errorhandler(Exception)
    def unexpected(error):
        app.logger.exception('分析失敗');return jsonify(error='分析程序發生錯誤，請查看啟動終端機'),500
    return app

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=5240);args=parser.parse_args()
    create_app().run(host='127.0.0.1',port=args.port,debug=False,threaded=True)
