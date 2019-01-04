var elasticsearch=require('elasticsearch');
var http = require('http');
var url = require('url');
var request = require('request');
var json2csv = require('json2csv');
var config = require('./config.js');
var md5 = require('md5');
var qs = require('querystring');

var client = new elasticsearch.Client({
host:'localhost:9200',
  log: 'error'
});

// POST API based on the PHP version
http.createServer((req, res) => {   
    var queryData = url.parse(req.url, true).query;        
    var key = queryData.key;
    if (key == "2cc81fb8810d4f24f4ed94c625cfbb78"){
	jsondata=queryData.rdf;
	if (!jsondata){
	    jsondata = '';
	    req.on('data', function (data) {
		jsondata += data;
	    });
	    req.on('end', function () {
		data = qs.parse(jsondata);
		processData(data.rdf, res, key, "");
	    });
	} else {
	    processData(jsondata, res, key, "");
	}
    } else {
	result={status: 'error', message: 'Wrong Key'};
	res.writeHead(401, {'Content-Type': 'application/json'});    
	res.end(JSON.stringify(result));
    }    
}).listen(8085, 'localhost');

console.log('POST Server running at http://localhost:8085/');

function processData(data, res, username, password){
    if (!data || data == ''){
	result={status: 'error', message: 'No Data Sent'};
	res.writeHead(200, {'Content-Type': 'application/json'});    
	console.log("Got no data");
	res.end(JSON.stringify(result));
	return;
    }
    var fn = new Date().getTime() + parseInt(Math.random() * 10000.0);
    //    console.log("Got data for id "+fn+" :: "+data);
    if (data.indexOf("ffffffff-ffff-ffff-ffff-ffffffffffff")==-1){
	data = rdfToObject(data)
	var indexname = 'didactalia-activity-game';
	if (data.actionType){
	    indexname = 'didactalia-activity-game';
	    console.log("Game: "+data.actionType+" "+data.user_id+" "+data.resource_id);
	}
	else {
	    indexname = 'didactalia-activity-base';
	    console.log("Base: "+data.type+" "+data.user_id+" "+data.Item);	    
	}
	if (IndexActivity(fn, data, indexname)) {
	    // reco ...
	    var id = data.Item
	    if (data.resource_id) id = data.resource_id
	    var type = data.actionType
	    if (data.type) type = data.type
	    var recobody = {date: new Date(data.date).getTime(), itemId: id, type: type, userId: data.user_id}	
	    // console.log(recobody)
	    request.post("http://afel-rec.know-center.tugraz.at/afel/data/interaction",
			 {json: true, body: recobody,
		      function(err, res, body) {			  
			  console.log ("Resource sent I think "+body);
		      },
		      // check that this works...
		      auth: {
			  user: "reco1",
			  password: ":eN9@L+Bl4l~29#?5",
			  sendImmediately: true
		      }}).on('response', function(response, body) {
			  if (response.statusCode !=200){
			      console.log("error updating the recommender")
			      response.on('data', function(data){
				  console.log(data.toString())
			      })
			  }
		      }).on('error', function(err) {
			  console.log(err)
		      });	    
	    var headers = {
		'User-Agent':       'DidactaliaPostAPI',
		'Content-Type':     'application/x-www-form-urlencoded'
	    }
	    var rid = '';
	    if (data.resource_id) rid = data.resource_id
	    if (data.Item) rid = data.Item
	    var options = {
		url: 'http://localhost:8086',
		method: 'POST',
		headers: headers,
		form: {'id': fn, 'rid': rid, 'index': indexname}
	    }
	    request(options, function (error, response, body) {
		if (error!="null" || response.statuscode != 200){
		    console.log(error)
		}
		if (!error && response.statusCode == 200) {
		    console.log(body)		    
		}
	    })	
	    result={status: 'wrote', id: fn};
	    res.writeHead(200, {'Content-Type': 'application/json'});    
	    // logger.info("Wrote");
	    res.end(JSON.stringify(result));
	    return;    
	    // call reco record
	    // console.log("should index");
	} else {
	    result={status: 'error', message: 'Problem indexing.'};
	    res.writeHead(200, {'Content-Type': 'application/json'});    
	    res.end(JSON.stringify(result));	
	}
    } else {
	result={status: 'ignored', message: 'Anonymous user activity not stored.'};
	res.writeHead(200, {'Content-Type': 'application/json'});    
	res.end(JSON.stringify(result));	
    }
    return;    
}

function rdfToObject(data){
    var o =  {};
    var lines = data.split(/\r?\n/);
    for (var line in lines){
	var comps = lines[line].split(' ');
	if (comps.length >= 3) {
	    var prop = fragment(trimValue(comps[1]));
	    var value = trimValue(comps[2]);
	    // console.log(prop+" = "+value);
	    if (prop == "date"){
		value = value.substring(0, value.length-5)+"Z";
		var valued = new Date(value);
		var year = valued.getFullYear();
		var month = valued.getMonth();
		var day = valued.getDate();
		var hour = valued.getHours();
		var min = valued.getMinutes();
		var sec = valued.getSeconds();
		var dow = valued.getDay();
		o.Year = year;
		o.Month = month;
		o.Day = day;
		o.Hour = hour;
		o.Minutes = min;
		o.Seconds = sec;
		o["Day of Week"] = dow;
		//		    error_log($day_of_week." ".$day."/".$month.'/'.$year.' '
			// .$hour.':'.$min.':'.$sec);
	    }
	    o[prop] = value;
	}	    	    
    }
    o.indexed_by = "API v0.3";
    return o;
}

function fragment(s){
	if (s.indexOf("#")!=-1){
	    return s.substring(s.lastIndexOf('#')+1);
	}
	if (s.indexOf('/')!=-1){
	    return s.substring(s.lastIndexOf('/')+1);
	}
        return s;	
}

function trimValue(s){
    return s.replace(/\.$/, "").replace(/>/g, "").replace(/</g, "").replace(/"/g, "");
}

function IndexActivity(id, object, indexname){
    var params = {
	index: indexname,
	type: 'activity',
	id: id,
	body: object
    };
    // params.parent = "noresource";
    client.create(params, function (error, response) {
	if (error){
	    console.log("Error when indexing "+error);
	    console.log("Error when indexing "+JSON.stringify(response));
	    console.log(JSON.stringify(object));
	}
 	// console.log(JSON.stringify(response));
    });
    return true;
}
