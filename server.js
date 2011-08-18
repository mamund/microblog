/* 2001-07-25 (mca) : XHTML+Microblog */
/* Designing Hypermedia APIs by Mike Amundsen (2011) */

/**
 * Module dependencies.
 */

// for express
var express = require('express');
var app = module.exports = express.createServer();

// for couch
var cradle = require('cradle');
var host = 'https://mamund.cloudant.com';
var port = 443;
var credentials = {username: 'mamund', password: 'M1cr0Bl0g' };
var local=false;
var db;
if(local===true) {
  db = new(cradle.Connection)().database('html5-microblog');
}
else {
  db = new(cradle.Connection)(host, port, {auth: credentials}).database('html5-microblog');
}

// global data
var contentType = 'text/html'; //'application/xhtml+xml';
var baseUrl = 'http://64.30.143.38/microblog/';

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.errorHandler()); 
});

/* validate user (from  db) via HTTP Basic Auth */
function validateUser(req, res, next) {

  var parts, auth, scheme, credentials; 
  var view, options;
  
  // handle auth stuff
  auth = req.headers["authorization"];
  if (!auth){
    return authRequired(res, 'Microblog');
  }  
  
  parts = auth.split(' ');
  scheme = parts[0];
  credentials = new Buffer(parts[1], 'base64').toString().split(':');
  
  if ('Basic' != scheme) {
    return badRequest(res);
  } 
  req.credentials = credentials;

  // ok, let's look this user up
  view = '/_design/microblog/_view/users_by_id';
  
  options = {};
  options.descending='true';
  options.key=String.fromCharCode(34)+req.credentials[0]+String.fromCharCode(34);
  
  db.get(view, options, function(err, doc) {
    try {
      if(doc[0].value.password===req.credentials[1]) {
        next(req,res);
      }
      else {
        throw new Error('Invalid User');
      } 
    }
    catch (ex) {
      return authRequired(res, 'Microblog');
    }
  });
}

// Routes

/* starting page */
app.get('/microblog/', function(req, res){

  var view = '/_design/microblog/_view/posts_all';
  var ctype;
  
  ctype = contentType;
  if(req.header["accept"].toLowercase()==='text/xml') {
    ctype = 'text/xml';
  }
  
  var options = {};
  options.descending = 'true';

  db.get(view, options, function(err, doc) {
    res.header('content-type',ctype);
    res.render('index', {
      title: 'Home',
      site: baseUrl,
      items: doc
    });  
  });
});

/* single message page */
app.get('/microblog/messages/:i', function(req, res){

  var view, options, id;
  id = req.params.i;
  
  view = '/_design/microblog/_view/posts_by_id';
  options = {};
  options.descending='true';
  options.key=String.fromCharCode(34)+id+String.fromCharCode(34);
  
  db.get(view, options, function(err, doc) {
    res.header('content-type',contentType);
    res.render('message', {
      title: id,
      site: baseUrl,
      items: doc
    });  
  });
});

// add a message
app.post('/microblog/messages/', function(req, res) {
  
  validateUser(req, res, function(req,res) {
  
    var text;
    
    // get data array
    text = req.body.message;
    if(text!=='') {
      item = {};
      item.type='post';
      item.text = text;
      item.user = req.credentials[0];
      item.dateCreated = now();
      
      // write to DB
      db.save(item, function(err, doc) {
        if(err) {
          res.status=400;
          res.send(err);
        }
        else {
          res.redirect('/microblog/', 302);
        }
      });  
    }
    else {
      return badReqest(res);
    }
  });
});

/* single user profile page */
app.get('/microblog/users/:i', function(req, res){

  var view, options, id;
  id = req.params.i;
  
  view = '/_design/microblog/_view/users_by_id';
  options = {};
  options.descending='true';
  options.key=String.fromCharCode(34)+id+String.fromCharCode(34);
  
  db.get(view, options, function(err, doc) {
    res.header('content-type',contentType);
    res.render('user', {
      title: id,
      site: baseUrl,
      items: doc
    });  
  });
});

/* user messages page */
app.get('/microblog/user-messages/:i', function(req, res){

  var view, options, id;
 
  id = req.params.i;
  
  view = '/_design/microblog/_view/posts_by_user';
  options = {};
  options.descending='true';
  options.key=String.fromCharCode(34)+id+String.fromCharCode(34);
  
  db.get(view, options, function(err, doc) {
    res.header('content-type',contentType);
    res.render('user-messages', {
      title: id,
      site: baseUrl,
      items: doc
    });  
  });
});

/* get user list page */
app.get('/microblog/users/', function(req, res){

  var view = '/_design/microblog/_view/users_by_id';
  
  db.get(view, function(err, doc) {
    res.header('content-type',contentType);
    res.render('users', {
      title: 'User List',
      site: baseUrl,
      items: doc
    });  
  });
});


/* post to user list page */
app.post('/microblog/users/', function(req, res) {

  var item,id,view; 
  view = '/_design/microblog/_view/users_by_id';

  id = req.body.user;
  if(id==='') {
    res.status=400;
    res.send('missing user');  
  }
  else {  
    view = '/_design/microblog/_view/users_by_id';
    options = {};
    options.descending='true';
    options.key=String.fromCharCode(34)+id+String.fromCharCode(34);
    
    db.get(view, options, function(err, doc) {
      if(doc.rows.length!==0) {
        return badRequest(res);//, 'User Already Exists');
      }
      else {
        item = {};
        item.type='user';
        item.password = req.body.password;
        item.name = req.body.name;
        item.email = req.body.email;
        item.description = req.body.description;
        item.imageUrl = req.body.image;
        item.websiteUrl = req.body.website;
        item.dateCreated = today();
        
        // write to DB
        db.save(req.body.user, item, function(err, doc) {
          if(err) {
            res.status=400;
            res.send(err);
          }
          else {
            res.redirect('/microblog/users/', 302);
          }
        });    
      }
    });
  }
});

/* get user register page */
app.get('/microblog/register/', function(req, res){

  res.header('content-type',contentType);
  res.render('register', {
    title: 'Register',
    site: baseUrl
  });
});

function acceptsXml(req) {
  var ctype;
  var ua = req.headers["user-agent"];
  
  if(req.accepts('application/xhtml+xml')) {
    ctype = 'application/xhtml+xml';
  }
  
  if(ua.indexOf('WebKit')!==-1 
    || 
    ua.indexOf('IE')!==-1) {
    ctype = 'text/html';
  }
  
  return ctype;
}

function today() {

  var y, m, d, dt;
  
  dt = new Date();

  y = String(dt.getFullYear());
  
  m = String(dt.getMonth()+1);
  if(m.length===1) {
    m = '0'+m;
  }

  d = String(dt.getDate());
  if(d.length===1) {
    d = '0'+d.toString();
  }

  return y+'-'+m+'-'+d;
}

function now() {
  var y, m, d, h, i, s, dt;
  
  dt = new Date();
  
  y = String(dt.getFullYear());
  
  m = String(dt.getMonth()+1);
  if(m.length===1) {
    m = '0'+m;
  }

  d = String(dt.getDate());
  if(d.length===1) {
    d = '0'+d.toString();
  }
  
  h = String(dt.getHours()+1);
  if(h.length===1) {
    h = '0'+h;
  }
  
  i = String(dt.getMinutes()+1);
  if(i.length===1) {
    i = '0'+i;
  }
  
  s = String(dt.getSeconds()+1);
  if(s.length===1) {
    s = '0'+s;
  }
  return y+'-'+m+'-'+d+' '+h+':'+i+':'+s;
}

function forbidden(res) {

  var body = 'Forbidden';

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Length', body.length);
  res.statusCode = 403;
  res.end(body);
}

function authRequired(res,realm) {
  var r = (realm||'Authentication Required');
  res.statusCode = 401;
  res.setHeader('WWW-Authenticate', 'Basic realm="' + r + '"');
  res.end('Unauthorized');
}

function badRequest(res) {
  res.statusCode = 400;
  res.end('Bad Request');
}

// Only listen on $ node app.js
if (!module.parent) {
  app.listen(process.env.PORT || 80);
  console.log("Express server listening on port %d", app.address().port);
}
