"""Bounded HTTP reads. Pin a validated address while preserving Host and TLS SNI."""
import http.client
import ipaddress
import socket
import ssl
import time
from urllib.parse import urlsplit, urljoin, urldefrag, quote

class AnalysisError(Exception):
    def __init__(self,message,status=400):self.message,self.status=message,status


def parse_url(value):
    if not isinstance(value,str) or len(value)>3000:raise AnalysisError('網址格式不正確')
    value=urldefrag(value.strip())[0]
    try:
        parts=urlsplit(value);port=parts.port or (443 if parts.scheme=='https' else 80)
    except ValueError:raise AnalysisError('網址或埠號格式不正確')
    if parts.scheme not in ('http','https') or not parts.hostname or parts.username or parts.password:
        raise AnalysisError('請使用不含帳號密碼的 http:// 或 https:// 網址')
    if any(ord(char)<32 for char in value) or not 1<=port<=65535:raise AnalysisError('網址包含不合法字元')
    return value,parts,port


def origin(url):
    _,parts,port=parse_url(url)
    return parts.scheme,parts.hostname.lower(),port


def address_for(host,port):
    try:addresses=socket.getaddrinfo(host,port,type=socket.SOCK_STREAM)
    except OSError:raise AnalysisError('找不到網址的主機，請檢查網址或網路',502)
    validated=[]
    for family,kind,proto,_,address in addresses:
        ip=ipaddress.ip_address(address[0].split('%')[0])
        if not ip.is_global and not ip.is_loopback:
            raise AnalysisError('不讀取區域網路、link-local 或雲端 metadata 位址；可分析公開網址或本機 loopback 網址',403)
        # Only explicit loopback hostnames/literals may resolve to loopback.
        if ip.is_loopback:
            try:explicit=ipaddress.ip_address(host).is_loopback
            except ValueError:explicit=host.lower()=='localhost'
            if not explicit:raise AnalysisError('公開主機名稱解析到本機位址，已停止讀取',403)
        validated.append((family,kind,proto,address))
    if not validated:raise AnalysisError('主機沒有可用位址',502)
    return next((item for item in validated if item[0]==socket.AF_INET),validated[0])


class PinnedHTTP(http.client.HTTPConnection):
    def __init__(self,host,port,address,timeout):
        super().__init__(host,port=port,timeout=timeout);self.address=address
    def connect(self):
        family,kind,proto,address=self.address
        sock=socket.socket(family,kind,proto);sock.settimeout(self.timeout)
        try:sock.connect(address)
        except Exception:sock.close();raise
        self.sock=sock


class PinnedHTTPS(PinnedHTTP):
    def connect(self):
        super().connect()
        self.sock=ssl.create_default_context().wrap_socket(self.sock,server_hostname=self.host)


def fetch(url,limit=2*1024*1024,deadline=None,same_origin=None):
    for _ in range(5):
        url,parts,port=parse_url(url)
        if same_origin is not None and origin(url)!=same_origin:raise AnalysisError('資源重新導向至其他來源，未讀取',403)
        if deadline and time.monotonic()>deadline:raise AnalysisError('讀取時間額度已用完，未繼續下載',504)
        address=address_for(parts.hostname,port)
        timeout=min(6,max(.2,deadline-time.monotonic())) if deadline else 6
        cls=PinnedHTTPS if parts.scheme=='https' else PinnedHTTP
        connection=cls(parts.hostname,port,address,timeout)
        path=quote(parts.path or '/',safe="/%:@!$&'()*+,;=-._~")
        if parts.query:path+='?'+quote(parts.query,safe="%=&/:?@!$'()*+,;~-._")
        try:
            connection.request('GET',path,headers={'User-Agent':'Local-Web-Analyzer/1.0','Accept':'text/html,text/css,application/javascript,text/javascript,*/*;q=0.3','Accept-Encoding':'identity'})
            response=connection.getresponse()
            if response.status in (301,302,303,307,308):
                location=response.getheader('Location')
                if not location:raise AnalysisError('重新導向缺少網址',502)
                url=urljoin(url,location);continue
            if response.status!=200:raise AnalysisError('來源回傳 HTTP '+str(response.status)+'；可能需要登入或拒絕讀取',502)
            encoding=response.getheader('Content-Encoding','identity').lower()
            if encoding not in ('','identity'):raise AnalysisError('來源回傳未支援的壓縮內容',502)
            data=bytearray()
            while True:
                if deadline and time.monotonic()>deadline:raise AnalysisError('讀取逾時，已停止下載',504)
                chunk=response.read(min(65536,limit+1-len(data)))
                if not chunk:break
                data.extend(chunk)
                if len(data)>limit:raise AnalysisError('資源超過 '+str(limit//1024)+' KB 限制',413)
            content_type=response.getheader('Content-Type','')
            charset=response.headers.get_content_charset() or 'utf-8'
            try:text=bytes(data).decode(charset,errors='replace')
            except LookupError:text=bytes(data).decode('utf-8',errors='replace')
            return {'url':url,'text':text,'content_type':content_type,'bytes':len(data)}
        except AnalysisError:raise
        except (OSError,ssl.SSLError,http.client.HTTPException) as error:raise AnalysisError('無法讀取來源：'+str(error)[:180],502)
        finally:connection.close()
    raise AnalysisError('重新導向次數過多',502)
