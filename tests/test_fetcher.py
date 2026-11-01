from pathlib import Path
import sys,unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from fetcher import parse_url,AnalysisError

class UrlRegressionTests(unittest.TestCase):
 def test_zero_port_is_not_replaced_with_default(self):
  for url in ['http://example.com:0/','https://example.com:0/#fragment']:
   with self.assertRaises(AnalysisError):parse_url(url)
 def test_control_characters_rejected_before_url_normalization(self):
  for value in ['http://example.com/a\nb','http://exa\tmple.com/','\nhttp://example.com/','http://example.com/#a\nb','http://example.com/\x7f']:
   with self.assertRaises(AnalysisError):parse_url(value)
 def test_fragment_parse_errors_report_as_analysis_error(self):
  for url in ['http://[#x','http://[broken]#x']:
   with self.assertRaises(AnalysisError):parse_url(url)
 def test_defaults_and_explicit_ports_preserved(self):
  self.assertEqual(parse_url('http://example.com/')[2],80)
  self.assertEqual(parse_url('https://example.com/')[2],443)
  self.assertEqual(parse_url('http://localhost:5240/path#part')[2],5240)

if __name__=='__main__':unittest.main()
