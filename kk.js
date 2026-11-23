// =====================================================================
//  Kwazy Korndog HR — shared settings & helpers
// =====================================================================
//  Paste your Google Apps Script web-app URL below (it ends in /exec).
//  While it's blank, the app runs in DEMO MODE: the real backend (Code.gs) runs in your browser with sample data.
var HR_API = 'https://script.google.com/macros/s/AKfycbyDNm-stPDl7i8gQTg51yUJ0YUH8d_M7bXC6D5Oyl4Arx3rjEWyAeZ11loKWBfU4GlL/exec';
// =====================================================================

var KK = (function(){
  var api = HR_API;
  try{ var ov = new URLSearchParams(location.search).get('api'); if(ov) api = ov; }catch(e){}   // ?api=<test /exec URL>
  var DEMO = !api;

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function mem(k,v){
    try{ if(v===undefined) return localStorage.getItem('hr_'+k)||''; if(v===null) localStorage.removeItem('hr_'+k); else localStorage.setItem('hr_'+k,v); }catch(e){ return ''; }
  }
  var memStore = {};   // fallback when the browser blocks storage
  function store(k,v){ if(v===undefined){ var x = mem(k); return x || memStore[k] || ''; } memStore[k] = v; mem(k, v); }
  function money(n){ n = Number(n)||0; return (n<0?'−$':'$') + Math.abs(n).toLocaleString('en-SG',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function ymd(d){ d = d||new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }

  var demoReady = null;
  function demo(){
    if(!demoReady) demoReady = new Promise(function(ok, fail){
      if(window.HRDemo) return ok(window.HRDemo);
      var s = document.createElement('script'); s.src = 'demo.js'; s.onload = function(){ ok(window.HRDemo); }; s.onerror = fail;
      document.head.appendChild(s);
    });
    return demoReady;
  }

  function session(){ try{ return JSON.parse(store('session')||'null'); }catch(e){ return null; } }
  function setSession(token, user){ store('session', JSON.stringify({token:token, user:user})); }
  function user(){ var s = session(); return s ? s.user : null; }
  function logout(){ store('session', null); memStore = {}; location.hash = 'login'; }

  function post(action, data){
    var s = session(), body = Object.assign({action:action, token: s ? s.token : ''}, data||{});
    var p = DEMO ? demo().then(function(d){ return d.post(body); })
                 : fetch(api,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body)}).then(function(r){ return r.json(); });
    return p.then(function(res){
      if(res && res.auth && action !== 'login'){ logout(); }
      if(res && res.token && res.user) setSession(res.token, res.user);
      return res || {ok:false, error:'No answer from the server.'};
    }, function(){ return {ok:false, error:'No connection. Check your internet and try again.'}; });
  }

  // Shrink a camera photo on the phone before upload (JPEG data URL, ~1280px, about 200 KB).
  function shrink(file, max, q){
    max = max || 1280;
    return new Promise(function(ok, fail){
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function(){
        var k = Math.min(1, max/Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.round(img.width*k); cv.height = Math.round(img.height*k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url); ok(cv.toDataURL('image/jpeg', q || 0.72));
      };
      img.onerror = function(){ fail(new Error('bad image')); };
      img.src = url;
    });
  }

  // Where is this phone? Resolves {lat,lng,acc} or rejects with a message people can act on.
  // Demo mode can pretend (the preview frame may block real location).
  function locate(){
    if(DEMO && window.HRDemo && HRDemo.fakeLocation()) return Promise.resolve(HRDemo.fakeLocation());
    return new Promise(function(ok, fail){
      if(!navigator.geolocation) return fail('This phone can\'t share its location.');
      navigator.geolocation.getCurrentPosition(function(p){ ok({lat:p.coords.latitude, lng:p.coords.longitude, acc:p.coords.accuracy}); },
        function(e){
          fail(e.code === 1 ? 'Location is blocked. Allow location for this site in your browser settings, then try again.'
             : e.code === 3 ? 'Finding your location took too long. Step near a window and try again.'
             : 'Couldn\'t find your location. Turn on Location (and Precise Location) and try again.');
        }, {enableHighAccuracy:true, timeout:20000, maximumAge:0});
    });
  }

  return { DEMO:DEMO, esc:esc, store:store, money:money, ymd:ymd, post:post, user:user, logout:logout, setSession:setSession, shrink:shrink, locate:locate, demo:demo };
})();
