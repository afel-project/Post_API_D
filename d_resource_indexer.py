from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer
import SocketServer
import cgi
import json
import simplejson
import config
import hashlib
import requests
import html2text
from textstat.textstat import textstat

conf = config.getConfig()

# what is the short nme for natural science games??

class S(BaseHTTPRequestHandler):
    def _set_headers(self, code=200):
        self.send_response(code)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        
    def do_GET(self):
        self._set_headers(501)
        self.wfile.write('{"status": "error", "message": "method not implemented"}')
            
    def do_HEAD(self):
        self._set_headers(200)
                
    def do_POST(self):
#        ctype, pdict = cgi.parse_header(self.headers.getheader('content-type'))
#        if ctype == 'multipart/form-data':
#            postvars = cgi.parse_multipart(self.rfile, pdict)
#        elif ctype == 'application/x-www-form-urlencoded':
        length = int(self.headers.getheader('content-length'))
        postvars = cgi.parse_qs(self.rfile.read(length), keep_blank_values=1)
#        elif ctype == "application/json":
#            length = int(self.headers.getheader('content-length'))
#            postvars = cgi.parse_qs(self.rfile.read(length), keep_blank_values=1)
#        else:
#            postvars = {}
        data = postvars
        if postvars != {}:
            if "rid" in data and 'id' in data and "index" in data:
                self._set_headers(200)
                self.wfile.write('{"status": "ok", "message": "fine"}')
                print "processing resource "+data["rid"][0]
                self.processData(data["rid"][0], data['id'][0], data['index'][0])                
            else:
                self._set_headers(400)
                self.wfile.write('{"status": "error", "message": "missing attribute(s) in data"}')
        else:
            self._set_headers(400)
            self.wfile.write('{"status": "error", "message": "no data sent"}')

    def processData(self, orid, oid, index):
        # check if resource exist
        rid = hashlib.md5(orid.encode('utf-8')).hexdigest();
        r = requests.get(conf["es_base"]+conf["resource_index"]+'/resource/'+rid);
        res = r.json()
        # if not
        if "error" in res or "_source" not in res:
            print "not found" 
            #    get text -> change to get didactalia description
            resdesc = self.getResourceDescription(orid)
            if "error" not in resdesc:
                headers = {'Accept': 'text/html'}
                resdesc["smog"]=-1
                if 'link' in resdesc or 'resource_url' in resdesc:
                    url =''
                    if 'resource_url' in resdesc:
                        url = resdesc['resource_url']
                    if 'link' in resdesc:
                        url = resdesc['link']                        
                    OK = False
                    try:
                        response = requests.get(url, headers=headers)
                        OK = True
                    except requests.exceptions.ConnectionError:
                        self.indexError(rid, "Cannot connect to the page")
                    if OK:
                        try:
                            h =  html2text.HTML2Text()
                            h.ignore_links = True
                            text = h.handle(response.text)
                            resdesc["smog"] = textstat.smog_index(text)
                            resdesc["sig"] = hashlib.sha1(text.encode('utf-8')).hexdigest()
                            self.indexResource(rid, resdesc)
                        except html2text.HTMLParser.HTMLParseError:
                            self.indexError(rid, "Cannot parse page as HTML")
                else:
                    self.indexError(rid, "no url for resource")
            else:
                self.indexError(rid, "could not retrieve resource")
        if "_source" in res:
            resdesc = res["_source"]
        self.reindexActivity(resdesc,oid,index)

    # if it fails, try other community short codes    
    def getResourceDescription(self, rid, cid="materialeducativo"):
        udate = '1970-01-01T14:01:54.9571247Z';
        r = requests.get('https://servicios.didactalia.net/api/v3/resource/get-resource-novelties?resource_id='+rid+'&community_short_name='+cid+'&search_date='+udate)
        # print (str(r.status_code)+" "+r.reason)
        rdesc = json.loads(r.text)        
        if "description" in rdesc:
            del rdesc["description"]
        if "_type" in rdesc:
            del rdesc["_type"]
        if "title" in rdesc:
            return rdesc
        else:
            if cid == 'materialeducativo':
                print "not found in 1st community, trying second"
                return self.getResourceDescription(rid, cid='mapasflashinteractivos')
            elif cid == 'mapasflashinteractivos':
                print "not found in 2nd community, trying third"
                return self.getResourceDescription(rid, cid='juegosnaturales')            
            else: 
                return {"error": "didn't find title in resource - what's wrong? "+rid}
                                
    def indexError(self, rid, message):
        print "should index error "+message

    def indexResource(self, rid, res):
        r = requests.put(conf["es_base"]+conf["resource_index"]+"/resource/"+rid,
                         data=json.dumps(res))
        if r.status_code != 200:
            print r.text

    def reindexActivity(self, res, oid, index):
        r = requests.get(conf["es_base"]+index+'/activity/'+oid+"?parent=noresource");
        r = r.json()
        if "_source" in r:
            print "found activity "+index+"/activity/"+oid+" "+r["_source"]["user_id"]
            r = r["_source"]
            r["resource"] = res
            re = requests.put(conf["es_base"]+index+"/activity/"+oid+"?parent=noresource", data=json.dumps(r))
            if re.status_code != 200:
                print re.text
        else:
            print "Error getting activity "+index+"/activity/"+oid
            print r
            
def run(server_class=HTTPServer, handler_class=S, port=80):
        server_address = ('', port)
        httpd = server_class(server_address, handler_class)
        print 'Starting httpd...'
        httpd.serve_forever()
        
run(port=8086)
