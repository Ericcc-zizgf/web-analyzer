import io
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from app import create_app
from analyzer import analyze,css_rules
from fetcher import AnalysisError,parse_url,address_for,fetch,origin

HTML='''<!doctype html><html><head><style>#box {color:red!important} @media (max-width:600px){#box{display:none}}</style></head><body><main><div id="box" class="card" style="padding:20px">Hello<button onclick="alert(1)">Go</button><img src="https://example.com/tracker.png"><iframe src="https://example.com/"></iframe></div></main><script>window.__unsafe=true;</script></body></html>'''

class ApiTests(unittest.TestCase):
 def setUp(self):
  self.app=create_app({'TESTING':True});self.client=self.app.test_client();self.token=self.client.get('/api/session').json['token'];self.headers={'X-Analyzer-Token':self.token}
 def post(self,value):return self.client.post('/api/analyze',json=value,headers=self.headers)
 def test_home_and_token(self):
  with self.client.get('/') as response:self.assertEqual(response.status_code,200);self.assertIn('網頁分析器',response.text)
  self.assertEqual(self.client.post('/api/analyze',json={'html':'<p>x</p>'}).status_code,403)
 def test_origin_and_host(self):
  self.assertEqual(self.client.post('/api/analyze',json={'html':'x'},headers={**self.headers,'Origin':'https://unrelated.test'}).status_code,403)
  self.assertEqual(self.client.get('/api/session',headers={'Host':'unrelated.test'}).status_code,403)
 def test_html_tree_css_events_and_inert_preview(self):
  response=self.post({'mode':'html','html':HTML});self.assertEqual(response.status_code,200,response.text);data=response.json
  box=next(n for n in data['nodes'] if n['attrs'].get('id')=='box');self.assertEqual(box['tag'],'div');self.assertEqual(len(box['children']),3);self.assertGreater(data['stats']['elements'],8)
  self.assertEqual(data['stats']['css_rules'],2);self.assertTrue(data['css_rules'][0]['declarations'][0]['important']);self.assertEqual(data['css_rules'][1]['conditions'][0]['type'],'media');self.assertEqual(data['inline_events'][0]['event'],'click')
  self.assertNotIn('<script',data['preview']);self.assertNotIn('onclick=',data['preview']);self.assertNotIn('https://example.com',data['preview']);self.assertNotIn('<iframe',data['preview']);self.assertIn("script-src 'none'",data['preview'])
 def test_node_source_has_real_subtree(self):
  data=self.post({'mode':'html','html':HTML}).json;node=next(n for n in data['nodes'] if n['attrs'].get('id')=='box');result=self.client.get('/api/analysis/'+data['id']+'/node/'+node['id']);self.assertEqual(result.status_code,200);self.assertIn('onclick="alert(1)"',result.json['source']);self.assertNotIn('data-web-analyzer-node',result.json['source'])
 def test_html5_repair_and_snippets(self):
  data=self.post({'mode':'html','html':'<table><tr><td>資料</td></tr></table>'}).json;self.assertTrue(any(n['tag']=='tbody' for n in data['nodes']));self.assertTrue(any(n['tag']=='head' for n in data['nodes']))
 def test_external_missing_is_visible(self):
  data=self.post({'mode':'html','html':'<link rel="stylesheet" href="styles.css"><script src="app.js"></script>'}).json;self.assertEqual(len(data['files']),2);self.assertTrue(all(not f['loaded'] for f in data['files']));self.assertTrue(data['warnings'])
 def test_uploaded_html_and_companions(self):
  response=self.client.post('/api/analyze',data={'mode':'file','html_file':(io.BytesIO(b'<link rel="stylesheet" href="./styles.css"><p>Hi</p><script src="app.js"></script>'),'index.html'),'assets':[(io.BytesIO(b'p {color:green}'),'styles.css'),(io.BytesIO(b'function realFunction() {return 3;}'),'app.js')]},headers=self.headers)
  self.assertEqual(response.status_code,200,response.text);self.assertTrue(all(f['loaded'] for f in response.json['files']));self.assertEqual(response.json['stats']['css_rules'],1)
 def test_duplicate_companion_names_rejected(self):
  r=self.client.post('/api/analyze',data={'mode':'file','html_file':(io.BytesIO(b'<p>x</p>'),'a.html'),'assets':[(io.BytesIO(b'x'),'a.js'),(io.BytesIO(b'y'),'a.js')]},headers=self.headers);self.assertEqual(r.status_code,400)
 def test_empty_and_bad_input(self):
  for value in [{'mode':'html','html':''},{'mode':'unknown','html':'x'},['bad']]:self.assertEqual(self.post(value).status_code,400)
 def test_size_limit(self):self.assertEqual(self.post({'mode':'html','html':'a'*(2*1024*1024+1)}).status_code,413)
 def test_element_limit(self):self.assertEqual(self.post({'mode':'html','html':'<div></div>'*4001}).status_code,413)
 def test_css_import_and_parse_errors_reported(self):
  rules,notes=css_rules('@import "other.css"; a {color: red; bad}', 'f1');self.assertEqual(len(rules),1);self.assertTrue(any('@import' in note for note in notes));self.assertTrue(any('語法' in note for note in notes))
 def test_data_scripts_not_marked_javascript(self):
  data=self.post({'mode':'html','html':'<script type="application/ld+json">{"name":"test"}</script>'}).json;self.assertEqual(data['files'][0]['kind'],'data');self.assertEqual(data['stats']['scripts'],0)
 def test_base_tag_does_not_bypass_origin(self):
  with patch('analyzer.fetch') as fake:
   data,_=analyze('<base href="https://other.test/"><link rel="stylesheet" href="a.css">',base_url='https://example.com/',load_assets=True)
   fake.assert_not_called();self.assertFalse(data['files'][0]['loaded']);self.assertIn('跨來源',data['files'][0]['error'])
 def test_paste_base_does_not_trigger_implicit_network(self):
  with patch('analyzer.fetch') as fake:
   self.post({'mode':'html','html':'<base href="https://example.com/"><script src="x.js"></script>','load_assets':True});fake.assert_not_called()
 def test_unsafe_schemes_and_credentials(self):
  for url in ['file:///etc/passwd','javascript:alert(1)','https://user:pass@example.com','http://example.com:999999']:
   with self.assertRaises(AnalysisError):parse_url(url)
 def test_private_addresses_blocked_before_connection(self):
  import socket
  for address in ['169.254.169.254','192.168.1.1','10.0.0.1']:
   with patch('fetcher.socket.getaddrinfo',return_value=[(socket.AF_INET,socket.SOCK_STREAM,6,'',(address,80))]):
    with self.assertRaises(AnalysisError):address_for(address,80)
 def test_dns_loopback_rebinding_blocked(self):
  import socket
  with patch('fetcher.socket.getaddrinfo',return_value=[(socket.AF_INET,socket.SOCK_STREAM,6,'',('127.0.0.1',80))]):
   with self.assertRaises(AnalysisError):address_for('public.test',80)
   self.assertEqual(address_for('localhost',80)[3][0],'127.0.0.1')
 def test_unknown_cache_entry(self):self.assertEqual(self.client.get('/api/analysis/not-found/node/n1').status_code,404)

if __name__=='__main__':unittest.main()
