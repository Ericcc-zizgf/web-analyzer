from functools import partial
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import json,os,subprocess,sys,threading,time,urllib.request

ROOT=Path(__file__).resolve().parents[1]
calls=[]
class Fixture(BaseHTTPRequestHandler):
 def do_GET(self):
  calls.append(self.path)
  if self.path=='/page':
   text='''<!doctype html><html><head><title>真實網址測試</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="http://127.0.0.1:OTHER/other.css"></head><body><main id="box" class="card"><h1>分析測試</h1><p id="value">尚未執行</p><button id="go" onclick="window.parent.__unsafe=true">Go</button><img src="/image-canary" onerror="fetch('/executed')"></main><script src="/main.js"></script><script type="module">import thing from './unloaded.js'; export const value = 1;</script><script>function broken( {</script><script type="application/ld+json">{"name":"資料"}</script></body></html>'''.replace('OTHER',str(other.server_port));kind='text/html; charset=utf-8'
  elif self.path=='/style.css':text='@import "/not-expanded.css"; #box { display: flex; gap: 12px; color: #23452e; } .card { padding: 14px; } @media(max-width:600px) { #box { flex-direction: column; } }';kind='text/css'
  elif self.path=='/main.js':text="const button = document.getElementById('go'); function updateView() { document.querySelector('#value').textContent = '執行了'; } button.addEventListener('click', updateView); async function readAPI() { const r=await fetch('/api/notes', {method:'POST'}); return r.json(); } localStorage.getItem('example');";kind='application/javascript'
  elif self.path=='/redirect':self.send_response(302);self.send_header('Location','/page');self.end_headers();return
  elif self.path=='/large':text='x'*(2*1024*1024+1);kind='text/html'
  elif self.path=='/login':self.send_response(401);self.end_headers();return
  elif self.path=='/cross-redirect.js':self.send_response(302);self.send_header('Location','http://127.0.0.1:'+str(other.server_port)+'/other.js');self.end_headers();return
  elif self.path=='/test/calls':text=json.dumps(calls);kind='application/json'
  else:self.send_response(404);self.end_headers();return
  raw=text.encode();self.send_response(200);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
 def log_message(self,*args):pass

other=ThreadingHTTPServer(('127.0.0.1',0),Fixture);fixture=ThreadingHTTPServer(('127.0.0.1',0),Fixture)
for server in [other,fixture]:threading.Thread(target=server.serve_forever,daemon=True).start()
sys.path.insert(0,str(ROOT/'backend'));from app import create_app
from werkzeug.serving import make_server
server=make_server('127.0.0.1',0,create_app(),threaded=True);threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 env=dict(os.environ,ANALYZER_URL='http://127.0.0.1:'+str(server.server_port),FIXTURE_URL='http://127.0.0.1:'+str(fixture.server_port))
 command=[os.environ.get('NODE_BINARY','node'),str(ROOT/'tests/browser.cjs')]
 result=subprocess.run(command,env=env,timeout=100)
 assert '/image-canary' not in calls and '/executed' not in calls and '/not-expanded.css' not in calls and '/unloaded.js' not in calls,'Untrusted resources/scripts executed: '+repr(calls)
 # Fetcher itself must handle redirects/errors and same-origin redirect confinement.
 from fetcher import fetch,origin,AnalysisError
 assert '真實網址測試' in fetch(env['FIXTURE_URL']+'/redirect')['text']
 for path in ['/login','/large']:
  try:fetch(env['FIXTURE_URL']+path);raise AssertionError('expected rejection')
  except AnalysisError:pass
 try:fetch(env['FIXTURE_URL']+'/cross-redirect.js',same_origin=origin(env['FIXTURE_URL']));raise AssertionError('cross-origin redirect was accepted')
 except AnalysisError:pass
 print('PASS actual URL reads, redirect validation, size/auth errors, no external preview requests or script execution')
 sys.exit(result.returncode)
finally:
 for item in [server,fixture,other]:item.shutdown();item.server_close()
