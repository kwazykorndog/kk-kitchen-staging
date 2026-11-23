// =====================================================================
//  KK Kitchen — the production team's HR app (staff side + Jay/Hazel admin)
//  One page, one view per #route. All data comes from Code.gs through KK.post().
// =====================================================================
(function(){
  var app = document.getElementById('app');
  var e = KK.esc, money = KK.money;
  var state = { slipId: null, back: null, payPeriod: null, attPeriod: null };
  var TYPES = { annual: 'Annual leave', sick: 'Sick leave (MC)', hospital: 'Hospitalisation leave', unpaid: 'No-pay leave' };
  var DAYKIND = { rest: 'Rest day', off: 'Day off', ph: 'Public holiday', work: '', dayoff: 'Your off day' };

  // ---------------------------------------------------------------- helpers
  function me(){ return KK.user(); }
  function isAdmin(){ var u = me(); return !!u && u.role === 'admin'; }
  function isMgr(){ var u = me(); return !!u && (u.role === 'admin' || u.role === 'manager'); }
  function go(r){ if(location.hash === '#' + r) route(); else location.hash = r; }
  // Each screen gets a fresh container, so click handlers from the previous screen never linger.
  function set(html){ var n = document.createElement('div'); n.id = 'app'; n.innerHTML = html; app.replaceWith(n); app = n; window.scrollTo(0, 0); }
  function loading(){ set('<div class="loading">Loading…</div>'); }
  function fail(r){ set('<main class="wrap"><div class="msg bad">' + e(r && r.error || 'Something went wrong.') + '</div><button class="btn ghost" style="margin-top:12px" onclick="location.reload()">Try again</button></main>'); }
  function toast(msg, bad){
    document.querySelectorAll('.toast').forEach(function(x){ x.remove(); });
    var t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg; t.setAttribute('role', 'status');
    document.body.appendChild(t); setTimeout(function(){ t.remove(); }, bad ? 4200 : 2400);
  }
  function on(root, sel, ev, fn){ root.addEventListener(ev, function(x){ var t = x.target.closest(sel); if(t && root.contains(t)) fn(t, x); }); }
  function busy(btn, label){ var old = btn.innerHTML; btn.disabled = true; btn.textContent = label || 'Saving…'; return function(){ btn.disabled = false; btn.innerHTML = old; }; }
  function rich(text){
    var html = '', list = '';
    String(text||'').split('\n').forEach(function(line){
      var t = e(line).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      if(/^- /.test(line)){ if(list !== 'ul'){ html += (list ? '</'+list+'>' : '') + '<ul>'; list = 'ul'; } html += '<li>'+t.slice(2)+'</li>'; return; }
      if(list){ html += '</'+list+'>'; list = ''; }
      if(line.trim()) html += '<p>'+t+'</p>';
    });
    return html + (list ? '</'+list+'>' : '');
  }
  // Photos are shrunk on the phone; PDFs and videos are sent as they are.
  function readFile(file, maxMB){
    if(/^image\//.test(file.type) && !/svg/.test(file.type)) return KK.shrink(file, 1600, 0.8);
    if(maxMB && file.size > maxMB * 1048576) return Promise.reject(new Error('That file is over ' + maxMB + ' MB.'));
    return new Promise(function(ok, fail){ var r = new FileReader(); r.onload = function(){ ok(r.result); }; r.onerror = function(){ fail(new Error('Couldn\'t read that file.')); }; r.readAsDataURL(file); });
  }
  function media(m){
    var cap = m.caption ? '<div class="hint">' + e(m.caption) + '</div>' : '';
    if(m.type === 'image') return '<figure class="media"><img src="' + e(m.view) + '" alt="' + e(m.caption || 'SOP photo') + '" loading="lazy">' + cap + '</figure>';
    if(m.type === 'video') return '<figure class="media">' + (m.embed ? '<div class="vid"><iframe src="' + e(m.view) + '" title="' + e(m.caption || 'SOP video') + '" allow="fullscreen; picture-in-picture" allowfullscreen></iframe></div>' : '<video controls playsinline preload="metadata" src="' + e(m.view) + '"></video>') +
      cap + '<a class="hint" href="' + e(m.url) + '" target="_blank" rel="noopener">Open video ↗</a></figure>';
    return '<a class="row" href="' + e(m.url) + '" target="_blank" rel="noopener"><div class="rt"><b>' + e(m.caption || 'Link') + '</b><small>' + e(m.url) + '</small></div><span class="chev2">↗</span></a>';
  }
  function initial(n){ return e(String(n||'?').trim().charAt(0).toUpperCase()); }
  function nice(d){ if(!d) return ''; var x = new Date(d + 'T00:00:00'); return x.toLocaleDateString('en-SG', {weekday:'short', day:'numeric', month:'short'}); }
  function niceY(d){ if(!d) return ''; var x = new Date(d + 'T00:00:00'); return x.toLocaleDateString('en-SG', {day:'numeric', month:'short', year:'numeric'}); }
  function monthLabel(p){ var x = new Date(p + '-01T00:00:00'); return x.toLocaleDateString('en-SG', {month:'long', year:'numeric'}); }
  function addMonth(p, n){ var y = +p.slice(0,4), m = +p.slice(5,7) - 1 + n; var d = new Date(y, m, 1); return d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2); }
  function daysTo(d){ return Math.round((new Date(d + 'T00:00:00') - new Date(KK.ymd() + 'T00:00:00')) / 864e5); }
  function nd(n){ n = Number(n)||0; return (Math.round(n*100)/100).toString(); }
  function statusChip(s){ return '<span class="chip ' + ({approved:'ok', pending:'warn', rejected:'bad', cancelled:'', draft:'warn', published:'ok'}[s]||'') + '">' + e(s.charAt(0).toUpperCase() + s.slice(1)) + '</span>'; }

  function sheet(title, body, bind){
    var s = document.createElement('div'); s.className = 'scrim';
    s.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + e(title) + '"><button class="x" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button><h3>' + e(title) + '</h3>' + body + '</div>';
    document.body.appendChild(s);
    var close = function(){ s.remove(); document.removeEventListener('keydown', esc); };
    var esc = function(x){ if(x.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    s.addEventListener('click', function(x){ if(x.target === s || x.target.closest('.sheet > .x')) close(); });
    if(bind) bind(s.querySelector('.sheet'), close);
    var f = s.querySelector('input,select,textarea'); if(f && window.innerWidth > 700) f.focus();
    return close;
  }
  function confirmSheet(title, text, yes, fn, red){
    sheet(title, '<p style="margin:8px 0 4px">' + text + '</p><div class="btns"><button class="btn ghost" data-no>Back</button><button class="btn' + (red ? ' red' : '') + '" data-yes>' + e(yes) + '</button></div>',
      function(sh, close){ sh.querySelector('[data-no]').onclick = close; sh.querySelector('[data-yes]').onclick = function(){ close(); fn(); }; });
  }

  // bottom tabs
  var ICON = {
    today:  '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    leave:  '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/><path d="M9 15l2 2 4-4"/>',
    notices:'<path d="M4 10v4h3l6 4V6L7 10H4z"/><path d="M16.5 9a4 4 0 010 6"/>',
    me:     '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
    time:   '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    pay:    '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h4"/>',
    sop:    '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h7M9 16h5"/>',
    stock:  '<path d="M3.5 8L12 3.5 20.5 8v8.5L12 21l-8.5-4.5z"/><path d="M3.5 8L12 12.5 20.5 8M12 12.5V21"/>',
    more:   '<circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/>'
  };
  function tabs(active, badges){
    var u = me(); if(!u) return '';
    var items = u.role === 'admin' ? [['today','admin','Home'],['leave','leave-admin','Leave'],['time','attendance','Time'],['pay','payroll','Pay'],['stock','stock','Stock'],['more','more','More']]
      : u.role === 'manager' ? [['today','admin','Home'],['time','attendance','Time'],['stock','stock','Stock'],['notices','notices','Notices'],['me','me','Me']]
      : [['today','home','Today'],['leave','leave','Leave'],['sop','sops','SOPs'],['notices','notices','Notices'],['me','me','Me']];
    badges = badges || {};
    document.body.classList.add('has-tabbar');
    return '<nav class="tabbar" aria-label="Main">' + items.map(function(it){
      var b = badges[it[1]];
      return '<a href="#' + it[1] + '" class="' + (it[1] === active ? 'on' : '') + '"' + (it[1] === active ? ' aria-current="page"' : '') + '><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        ICON[it[0]] + '</svg><span class="nb" style="display:' + (b ? 'flex' : 'none') + '">' + (b > 9 ? '9+' : (b || '')) + '</span></span>' + it[2] + '</a>';
    }).join('') + '</nav>';
  }
  var badgeCache = {};
  function page(active, html, wide){ set('<main class="wrap' + (wide ? ' wide' : '') + '">' + html + '</main>' + tabs(active, badgeCache)); }
  function demoBar(){
    if(!KK.DEMO) return '';
    return '<div class="demo">Demo with your staff · clock-ins, leave, photos and pay history are sample data · <a href="#" id="demoReset">Reset demo</a></div>';
  }

  // ---------------------------------------------------------------- login
  function viewLogin(){
    document.body.classList.remove('has-tabbar');
    var u = me(), change = u && u.mustChange;
    set(demoBar() + '<main class="wrap"><div class="loginbox"><img class="logo" src="logo.png" alt="Kwazy Korndog"><div class="ttl">Kitchen staff app</div>' +
      '<form class="card" id="f" autocomplete="on">' + (change ?
        '<h2>Set your own password</h2><p class="hint" style="margin-bottom:6px">Use the temporary password Jay or Hazel gave you, then pick a new one.</p>' +
        '<label class="f" for="old">Temporary password</label><input id="old" type="password" autocomplete="current-password" required>' +
        '<label class="f" for="pw">New password (6+ characters)</label><input id="pw" type="password" autocomplete="new-password" minlength="6" required>' +
        '<label class="f" for="pw2">New password again</label><input id="pw2" type="password" autocomplete="new-password" required>'
      : '<label class="f" for="un">Username</label><input id="un" autocapitalize="none" autocomplete="username" required>' +
        '<label class="f" for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required>') +
      '<div id="m"></div><button class="btn" style="margin-top:16px">' + (change ? 'Save password' : 'Log in') + '</button>' +
      (change ? '<button type="button" class="linkbtn" id="out">Log out</button>' : '') + '</form>' +
      (KK.DEMO && !change ? '<div class="card"><h2>Try it as…</h2><p class="hint">Every demo password is <b>demo123</b>.</p><div class="demopick">' +
        [['jay','Jay (admin)'],['hazel','Hazel (admin)'],['siti','Siti Aisyah'],['hariharan','Hariharan Manimaran'],['deng','Deng Chao'],['hoang','Hoang Dinh Chien'],['dia','Dia (manager)']]
          .map(function(x){ return '<button type="button" data-u="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div></div>' : '') +
      '</div></main>');
    bindDemo();
    var f = document.getElementById('f'), m = document.getElementById('m');
    on(app, '[data-u]', 'click', function(b){ document.getElementById('un').value = b.dataset.u; document.getElementById('pw').value = 'demo123'; f.requestSubmit(); });
    if(change) document.getElementById('out').onclick = KK.logout;
    f.onsubmit = function(x){
      x.preventDefault(); var b = f.querySelector('.btn'), done = busy(b, change ? 'Saving…' : 'Logging in…');
      var p = change ? (function(){
          if(f.pw.value !== f.pw2.value) return Promise.resolve({ok:false, error:'The two new passwords don\'t match.'});
          return KK.post('changePassword', {old: f.old.value, password: f.pw.value});
        })() : KK.post('login', {username: f.un.value, password: f.pw.value});
      p.then(function(r){
        done();
        if(!r.ok){ m.innerHTML = '<div class="msg bad">' + e(r.error) + '</div>'; return; }
        if(r.user && r.user.mustChange) return viewLogin();
        go(r.user.role === 'staff' ? 'home' : 'admin');
      });
    };
  }

  function bindDemo(){
    var r = document.getElementById('demoReset');
    if(r) r.onclick = function(x){ x.preventDefault(); KK.demo().then(function(d){ d.reset(); KK.logout(); location.reload(); }); };
  }

  // ---------------------------------------------------------------- staff: today
  function viewHome(){
    loading();
    KK.post('me').then(function(r){
      if(!r.ok) return fail(r);
      badgeCache = { notices: r.unreadNotices, sops: r.sopUnread };
      var u = r.user, first = u.name.split(' ')[0], kind = DAYKIND[r.dayKind] || '';
      var html = demoBar() + '<div class="bar"><img class="logo" src="logo.png" alt="Kwazy Korndog"><a class="avatar" href="#me" aria-label="My details">' + initial(u.name) + '</a></div>' +
        '<div class="hello">Hi ' + e(first) + '</div><div class="sub2">' + e(r.dateLabel) + (r.holiday ? ' · ' + e(r.holiday) : kind ? ' · ' + kind : '') + '</div>';
      r.todayNotices.forEach(function(n){
        html += '<div class="today"><div class="k">Today</div><h3>' + e(n.title) + '</h3><div class="rich">' + rich(n.body) + '</div>' +
          (n.mustAck ? (n.acked ? '<span class="chip ok">✓ You\'ve read this</span>' : '<button class="btn sm" data-ack="' + e(n.id) + '">Got it</button>') : '') + '</div>';
      });
      var unackW = r.warnings.filter(function(w){ return !w.acked; });
      unackW.forEach(function(w){
        html += '<div class="warncard"><div class="k">Warning letter ' + (r.warnings.indexOf(w) + 1) + ' of ' + r.maxWarnings + '</div><h3>' + e(w.label) + '</h3><p>' + e(w.reason) + '</p>' +
          '<p class="hint" style="color:inherit;opacity:.85">After ' + r.maxWarnings + ' warning letters, another offence can lead to dismissal. Talk to Jay or Hazel if you have questions.</p>' +
          '<button class="btn sm" data-wack="' + e(w.id) + '">I\'ve read this</button></div>';
      });
      if(r.cleaning && r.cleaning.mine && r.cleaning.status !== 'done') html += '<a class="row clean" href="#cleaning"><div class="rt"><b>You\'re on cleaning today</b><small>' + r.cleaning.count + ' of ' + r.cleaning.total + ' photos · finish before you clock out</small>' +
        '<div class="bar2"><i style="width:' + Math.round(100 * r.cleaning.count / Math.max(1, r.cleaning.total)) + '%"></i></div></div><span class="chev2">›</span></a>';
      if(r.stock) html += '<a class="row' + (r.stock.today && !r.stock.done ? ' clean' : '') + '" href="#stock"><div class="rt"><b>' + (r.stock.today && !r.stock.done ? 'Stock take due today' : 'Stock & deliveries') + '</b><small>' +
        (r.stock.done ? '✓ Counted today by ' + e(r.stock.doneBy) : r.stock.today ? 'Count every item before you go home' : 'Stock take ' + e(r.stock.days) + ' · record deliveries here') + '</small></div><span class="chev2">›</span></a>';
      if(r.clockIn) html += clockCard(r);
      else if(r.user.team === 'production') html += '<div class="hero quiet"><div class="tag">' + e(r.schedule) + '</div><div class="tt" style="font-size:26px">' + (r.dayKind === 'dayoff' ? 'Your off day' : r.onLeave ? 'On ' + e(r.onLeave.toLowerCase()) : 'No clock-in needed') + '</div><div class="ds">Use the app for your leave' + (r.offdays ? ' and off days' : '') + '.</div></div>';
      if(r.production) html += prodCard(r.production);
      if(r.offdays) html += '<a class="row" href="#offdays"><div class="rt"><b>Off days this month: ' + r.offdays.picked + ' of ' + r.offdays.perMonth + ' picked</b><small>' + (r.offdays.next.length ? 'Next: ' + e(r.offdays.next.join(', ')) : 'Pick your off days') + '</small></div><span class="chev2">›</span></a>';
      if(r.balances){
        var b = r.balances;
        html += '<div class="tiles"><a class="tile" href="#leave"><b>' + nd(b.annual.left) + '</b><span>Annual leave left</span></a>' +
          '<a class="tile" href="#leave"><b>' + nd(b.sick.left) + '</b><span>Sick days left</span></a>' +
          '<a class="tile" href="#leave" style="background:var(--pink-soft);border-color:#f3c9d9"><b style="font-size:24px;color:var(--pink-d)">＋</b><span style="color:var(--pink-d)">Apply for leave</span></a></div>';
      }
      if(r.unreadNotices) html += '<a class="row" href="#notices"><div class="rt"><b>' + r.unreadNotices + ' notice' + (r.unreadNotices > 1 ? 's' : '') + ' to read</b><small>Tap Got it on each so Jay and Hazel know you\'ve seen it</small></div><span class="chev2">›</span></a>';
      if(r.sopUnread) html += '<a class="row" href="#sops"><div class="rt"><b>' + r.sopUnread + ' SOP' + (r.sopUnread > 1 ? 's' : '') + ' to read</b><small>New or updated kitchen instructions</small></div><span class="chev2">›</span></a>';
      var ackW = r.warnings.filter(function(w){ return w.acked; });
      if(ackW.length && !unackW.length) html += '<div class="row"><div class="rt"><b>Warning letters: ' + r.warnings.length + ' of ' + r.maxWarnings + '</b><small>' + ackW.map(function(w){ return e(w.label) + ': ' + e(w.reason); }).join('<br>') + '</small></div></div>';
      if(r.lastPayslip) html += '<a class="row" href="#payslips"><div class="rt"><b>Latest payslip</b><small>' + e(monthLabel(r.lastPayslip.period)) + '</small></div><span class="amt">' + money(r.lastPayslip.net) + '</span><span class="chev2">›</span></a>';
      page('home', html);
      bindDemo(); bindClock(r);
      on(app, '[data-ack]', 'click', function(btn){ var d = busy(btn, '…'); KK.post('noticeAck', {id: btn.dataset.ack}).then(function(x){ d(); if(x.ok) viewHome(); else toast(x.error, true); }); });
      on(app, '[data-wack]', 'click', function(btn){ var d = busy(btn, '…'); KK.post('warningAck', {id: btn.dataset.wack}).then(function(x){ d(); if(x.ok) viewHome(); else toast(x.error, true); }); });
    });
  }
  function clockCard(r){
    var where = e(r.kitchen);
    if(!r.locationSet) return '<div class="hero quiet"><div class="tag">Clock-in</div><div class="tt" style="font-size:24px">Not set up yet</div><div class="ds">Jay or Hazel need to set the kitchen location first.</div></div>';
    if(r.onLeave && !r.clockedIn) return '<div class="hero quiet"><div class="tag">Today</div><div class="tt" style="font-size:26px">You\'re on ' + e(r.onLeave.toLowerCase()) + '</div><div class="ds">No need to clock in. Enjoy your day.</div></div>';
    if(r.clockedOut) return '<div class="hero done"><div class="tag">Done for today ✓</div><div class="tt">' + nd(r.hours) + ' hours</div><div class="ds">In ' + e(r.clockedIn) + ' · Out ' + e(r.clockedOut) + ' · ' + where + '</div></div>';
    var notWork = r.dayKind !== 'work';
    var inNow = !!r.clockedIn;
    return '<div class="hero" id="clock"><div class="tag">' + (inNow ? 'You\'re clocked in' : notWork ? (r.holiday ? e(r.holiday) : DAYKIND[r.dayKind]) : 'Start ' + e(r.start) + ' · ' + where) + '</div>' +
      '<div class="tt">' + (inNow ? 'Since ' + e(r.clockedIn) : 'Not clocked in') + '</div>' +
      (notWork && !inNow ? '<div class="ds">Only clock in if Jay or Hazel asked you to work today.</div>' : '<div class="ds">Works only when you\'re at ' + where + '.</div>') +
      '<button class="go" id="clockBtn" data-mode="' + (inNow ? 'out' : 'in') + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>' + (inNow ? 'Clock out' : 'Clock in') + '</button>' +
      '<div id="clockMsg" role="alert"></div></div>' +
      (KK.DEMO ? '<div class="demoloc">Demo only: pretend this phone is…</div><div class="seg" id="where"><button data-w="kitchen">At the kitchen</button><button data-w="away">2 km away</button><button data-w="">Use real GPS</button></div>' : '');
  }
  function bindClock(r){
    var btn = document.getElementById('clockBtn');
    if(KK.DEMO){
      KK.demo().then(function(d){
        var mark = function(){ document.querySelectorAll('#where button').forEach(function(b){ b.classList.toggle('on', b.dataset.w === d.where()); }); };
        mark(); on(app, '#where button', 'click', function(b){ d.where(b.dataset.w); mark(); });
      });
    }
    if(!btn) return;
    btn.onclick = function(){
      var mode = btn.dataset.mode, msg = document.getElementById('clockMsg'), done = busy(btn, 'Checking you\'re at the kitchen…');
      msg.innerHTML = '';
      (KK.DEMO ? KK.demo() : Promise.resolve()).then(function(){ return KK.locate(); }).then(function(loc){
        return KK.post('clock', {mode: mode, lat: loc.lat, lng: loc.lng, acc: loc.acc});
      }).then(function(x){
        done();
        if(!x.ok){ msg.innerHTML = '<div class="err">' + e(x.error) + (x.needChecklist ? '<a class="go" style="margin-top:10px;text-decoration:none" href="#cleaning">Open cleaning checklist</a>' : '') + '</div>'; return; }
        toast(mode === 'in' ? 'Clocked in at ' + x.time + (x.veryLate ? '. Over an hour late: Jay and Hazel are told.' : x.late ? ' (' + x.late + ' min late)' : '') : 'Clocked out at ' + x.time + ' · ' + x.hours + ' h', x.veryLate);
        if(isMgr()) viewAdmin(); else viewHome();
      }, function(err){ done(); msg.innerHTML = '<div class="err">' + e(typeof err === 'string' ? err : 'Couldn\'t get your location.') + '</div>'; });
    };
  }

  // ---------------------------------------------------------------- staff: leave
  function viewLeave(){
    loading();
    KK.post('myLeave').then(function(r){
      if(!r.ok) return fail(r);
      var b = r.balances;
      var dv = r.dayValues || {};
      var tile = function(v, label, sub){ return '<div class="tile"><b>' + nd(v) + '</b><span>' + label + '</span><small>' + sub + '</small></div>'; };
      var html = '<div class="ptitle">Leave</div><div class="sub2">Leave year ' + e(b.year) + '</div><div class="tiles">' +
        tile(b.annual.left, 'Annual left', 'of ' + nd(b.annual.entitled) + (b.annual.pending ? ' · ' + nd(b.annual.pending) + ' pending' : '')) +
        tile(b.sick.left, 'Sick left', 'of ' + nd(b.sick.entitled)) + tile(b.hospital.left, 'Hospital left', 'of ' + nd(b.hospital.entitled)) + '</div>' +
        (b.note ? '<div class="note">' + e(b.note) + '</div>' : '') +
        '<form class="card" id="f"><h2>Apply for leave</h2>' +
        '<label class="f" for="type">Type</label><select id="type">' + Object.keys(TYPES).map(function(k){ return '<option value="' + k + '">' + TYPES[k] + '</option>'; }).join('') + '</select>' +
        '<div class="row2"><div><label class="f" for="start">From</label><input id="start" type="date" required value="' + r.today + '"></div><div><label class="f" for="end">To</label><input id="end" type="date" required value="' + r.today + '"></div></div>' +
        '<label class="check" id="halfWrap"><input type="checkbox" id="half"> Half day only</label>' +
        '<label class="f" for="reason">Reason (optional)</label><input id="reason" maxlength="300" placeholder="e.g. family visit">' +
        '<div id="mcWrap" hidden><label class="f" for="mc">Photo of your MC</label><input id="mc" type="file" accept="image/*" capture="environment"><div class="hint">You can apply now and Jay or Hazel will ask for it, but please add it if you have it.</div></div>' +
        '<div id="calc" class="hint" style="font-weight:700;margin-top:10px"></div><div id="m" role="alert"></div><button class="btn" style="margin-top:14px">Send to Jay & Hazel</button></form>';
      if(r.blackouts.length) html += '<div class="h2">No leave on these dates</div>' + r.blackouts.map(function(x){
        return '<div class="row"><div class="rt"><b>' + e(x.start === x.end ? nice(x.start) : nice(x.start) + ' – ' + nice(x.end)) + '</b><small>' + e(x.reason) + '</small></div><span class="chip bad">Blackout</span></div>'; }).join('');
      html += '<div class="h2">My requests</div>' + (r.requests.length ? r.requests.map(function(x){
        var canCancel = x.status === 'pending' || (x.status === 'approved' && x.start > r.today);
        return '<div class="row"><div class="rt"><b>' + e(x.typeLabel) + ' · ' + nd(x.days) + ' day' + (x.days === 1 ? '' : 's') + '</b><small>' + e(x.start === x.end ? x.startLabel : x.startLabel + ' – ' + x.endLabel) +
          (x.note ? ' · "' + e(x.note) + '"' : '') + (x.decidedBy && x.status !== 'cancelled' ? ' · ' + e(x.decidedBy) : '') + '</small>' + (canCancel ? '<button class="linkbtn" data-cancel="' + e(x.id) + '">Cancel request</button>' : '') +
          '</div>' + statusChip(x.status) + '</div>'; }).join('') : '<div class="empty">No leave requests yet.</div>');
      page('leave', html);
      var f = document.getElementById('f'), calc = document.getElementById('calc');
      function days(){
        var s = f.start.value, en = f.end.value; if(!s || !en || en < s) return -1;
        var n = 0, d = new Date(s + 'T00:00:00'), last = new Date(en + 'T00:00:00');
        for(; d <= last; d.setDate(d.getDate() + 1)){ var ds = KK.ymd(d); n += dv[ds] !== undefined ? dv[ds] : ((d.getDay() + 6) % 7 < 5 ? 1 : 0); }
        if(f.half.checked && s === en && n > 0.5) n = 0.5;
        return n;
      }
      function update(){
        if(f.end.value < f.start.value) f.end.value = f.start.value;
        document.getElementById('halfWrap').style.display = f.start.value === f.end.value ? '' : 'none';
        if(f.start.value !== f.end.value) f.half.checked = false;
        var t = f.type.value, n = days(), warn = '';
        document.getElementById('mcWrap').hidden = !(t === 'sick' || t === 'hospital');
        var hit = (t === 'annual' || t === 'unpaid') && r.blackouts.filter(function(x){ return x.start <= f.end.value && x.end >= f.start.value; })[0];
        if(hit) warn = '<span style="color:var(--red)">These dates are blocked: ' + e(hit.reason || 'no leave allowed') + '.</span>';
        else if(t === 'annual' && n > b.annual.left) warn = '<span style="color:var(--red)">' + (b.annual.entitled === 0 && b.note ? e(b.note) : 'You only have ' + nd(b.annual.left) + ' annual leave days left.') + '</span>';
        else if((t === 'sick' || t === 'hospital') && n > (t === 'sick' ? b.sick.left : b.hospital.left)) warn = '<span style="color:var(--amber)">' + nd(n - (t === 'sick' ? b.sick.left : b.hospital.left)) + ' of these days will be unpaid (no paid ' + (t === 'sick' ? 'sick' : 'hospitalisation') + ' leave left).</span>';
        calc.innerHTML = n < 0 ? '' : n === 0 ? 'You\'re not working on those days, so no leave is needed.' : 'That\'s ' + nd(n) + ' working day' + (n === 1 ? '' : 's') + '. ' + warn;
      }
      ['type','start','end','half'].forEach(function(id){ f[id].addEventListener('change', update); });
      update();
      f.onsubmit = function(x){
        x.preventDefault();
        var btn = f.querySelector('.btn'), done = busy(btn, 'Sending…'), m = document.getElementById('m'), file = f.mc.files[0];
        (file ? KK.shrink(file) : Promise.resolve('')).then(function(mc){
          return KK.post('leaveApply', {type: f.type.value, start: f.start.value, end: f.end.value, half: f.half.checked, reason: f.reason.value, mc: mc});
        }).then(function(res){
          done();
          if(!res.ok){ m.innerHTML = '<div class="msg bad">' + e(res.error) + '</div>'; return; }
          toast(res.unpaidDays ? 'Sent. ' + res.unpaidDays + ' day' + (res.unpaidDays > 1 ? 's are' : ' is') + ' unpaid.' : 'Sent. Jay or Hazel will approve it here.'); viewLeave();
        }, function(){ done(); m.innerHTML = '<div class="msg bad">That photo didn\'t work. Try another.</div>'; });
      };
      on(app, '[data-cancel]', 'click', function(btn){
        confirmSheet('Cancel this request?', 'Your leave days go back to your balance.', 'Cancel request', function(){
          KK.post('leaveCancel', {id: btn.dataset.cancel}).then(function(x){ if(x.ok){ toast('Cancelled'); viewLeave(); } else toast(x.error, true); });
        }, true);
      });
    });
  }

  // ---------------------------------------------------------------- payslips
  function slipHtml(p, admin){
    var line = function(l, i, neg){ return '<div class="ln"><span>' + e(l.label) + (admin && l.manualIndex !== undefined && p.status === 'draft' ? ' <button class="x" title="Remove" aria-label="Remove line" data-rm="' + l.manualIndex + '">✕</button>' : '') + '</span><b>' + (neg ? '−' : '') + money(l.amount) + '</b></div>'; };
    var mi = 0;
    p.manual.forEach(function(m){ var list = m.kind === 'ded' ? p.ded : p.earn; for(var i = list.length - 1; i >= 0; i--){ if(list[i].label === m.label && list[i].amount === m.amount && list[i].manualIndex === undefined && !list[i].auto){ list[i].manualIndex = mi; break; } } mi++; });
    var basic = p.earn.filter(function(l){ return l.label === 'Basic salary'; }), ot = p.earn.filter(function(l){ return l.ot; }), other = p.earn.filter(function(l){ return l.label !== 'Basic salary' && !l.ot; });
    if(p.otMode === 'none') return slipNoOt(p, line, basic, other);
    return '<div class="slip"><h2>Payslip · ' + e(p.label) + '</h2>' +
      '<div class="kv"><span>Employer</span><b>' + e(p.company) + '</b><span>Employee</span><b>' + e(p.name) + '</b>' + (p.jobTitle ? '<span>Job title</span><b>' + e(p.jobTitle) + '</b>' : '') +
      '<span>Salary period</span><b>' + e(p.fromLabel) + ' – ' + e(p.toLabel) + '</b><span>Date of payment</span><b>' + (p.payDateLabel ? e(p.payDateLabel) : '<i>not paid yet</i>') + '</b>' +
      (p.bank ? '<span>Paid to</span><b>' + e(p.bank) + '</b>' : '') + '<span>Days worked</span><b>' + nd(p.worked) + ' of ' + nd(p.workingDays) + '</b></div>' +
      '<div class="sl">Earnings</div>' + basic.map(function(l, i){ return line(l, i); }).join('') +
      other.map(function(l, i){ return line(l, i); }).join('') +
      '<div class="sl">Overtime (same period as salary)</div><div class="ln"><span>' + (p.otMode === 'weekend' ? 'Approved weekend overtime hours' : 'Overtime hours') + '</span><b>' + nd(p.otH) + ' h</b></div>' +
      '<div class="ln"><span>Overtime pay' + (p.otMode === 'weekend' ? ' (approved weekend work' + (p.otH ? ', ' + nd(p.otH) + 'h × ' + money(p.otRate) : '') + ')' : p.otMode === 'fixed' ? ' (fixed in contract' + (ot[0] && /rest-day/.test(ot[0].label) ? ', includes rest-day work' : '') + ')' : p.otH ? ' (' + nd(p.otH) + 'h × ' + money(p.otRate) + ')' : '') + '</span><b>' + money(ot.reduce(function(s, l){ return s + l.amount; }, 0)) + '</b></div>' +
      '<div class="ln sum"><span>Gross pay</span><b>' + money(p.gross) + '</b></div>' +
      '<div class="sl">Deductions</div>' + (p.ded.length ? p.ded.map(function(l, i){ return line(l, i, true); }).join('') : '<div class="ln"><span>None</span><b>$0.00</b></div>') +
      '<div class="ln sum"><span>Total deductions</span><b>−' + money(p.deductions) + '</b></div>' +
      '<div class="ln grand"><span>Net pay</span><b>' + money(p.net) + '</b></div>' +
      (admin && p.notes ? '<div class="note">' + e(p.notes) + '</div>' : '') +
      '<div class="fine">Itemised payslip under the Employment Act. Keep it for your records.</div></div>';
  }
  // Managers (not covered by Part 4 of the Employment Act): no overtime section.
  function slipNoOt(p, line, basic, other){
    return '<div class="slip"><h2>Payslip · ' + e(p.label) + '</h2><div class="kv"><span>Employer</span><b>' + e(p.company) + '</b><span>Employee</span><b>' + e(p.name) + '</b>' + (p.jobTitle ? '<span>Job title</span><b>' + e(p.jobTitle) + '</b>' : '') +
      '<span>Salary period</span><b>' + e(p.fromLabel) + ' – ' + e(p.toLabel) + '</b><span>Date of payment</span><b>' + (p.payDateLabel ? e(p.payDateLabel) : '<i>not paid yet</i>') + '</b>' + (p.bank ? '<span>Paid to</span><b>' + e(p.bank) + '</b>' : '') + '</div>' +
      '<div class="sl">Earnings</div>' + basic.concat(other).map(function(l, i){ return line(l, i); }).join('') + '<div class="ln sum"><span>Gross pay</span><b>' + money(p.gross) + '</b></div>' +
      '<div class="sl">Deductions</div>' + (p.ded.length ? p.ded.map(function(l, i){ return line(l, i, true); }).join('') : '<div class="ln"><span>None</span><b>$0.00</b></div>') +
      '<div class="ln sum"><span>Total deductions</span><b>−' + money(p.deductions) + '</b></div><div class="ln grand"><span>Net pay</span><b>' + money(p.net) + '</b></div>' +
      '<div class="fine">Itemised payslip under the Employment Act. Keep it for your records.</div></div>';
  }
  function viewPayslips(){
    loading();
    KK.post('myPayslips').then(function(r){
      if(!r.ok) return fail(r);
      var html = '<a class="back" href="#me">‹ Me</a><div class="ptitle">Payslips</div>' + (r.payslips.length ? r.payslips.map(function(p, i){
        return '<a class="row" href="#payslip" data-i="' + i + '"><div class="rt"><b>' + e(p.label) + '</b><small>Paid ' + e(p.payDateLabel) + '</small></div><span class="amt">' + money(p.net) + '</span><span class="chev2">›</span></a>'; }).join('')
        : '<div class="card"><p class="hint" style="margin:0">No payslips yet. They appear here once a month is paid.</p></div>');
      page('me', html);
      on(app, '[data-i]', 'click', function(a, x){ x.preventDefault(); state.slip = r.payslips[+a.dataset.i]; state.back = 'payslips'; go('payslip'); });
    });
  }
  function viewPayslip(){
    var p = state.slip; if(!p) return go(isAdmin() ? 'payroll' : 'payslips');
    var admin = isAdmin() && state.back === 'payroll';
    var html = '<a class="back noprint" href="#' + (state.back || 'payslips') + '">‹ Back</a>' + slipHtml(JSON.parse(JSON.stringify(p)), admin) +
      (admin && p.status === 'draft' ? '<form class="card noprint" id="adj"><h2>Add a one-off line</h2><p class="hint">Bonus, advance, damage deduction… It stays when you refresh the drafts.</p>' +
        '<div class="seg" style="margin-top:10px"><button type="button" data-k="earn" class="on">Add pay</button><button type="button" data-k="ded">Deduct</button></div>' +
        '<label class="f" for="lb">What it is</label><input id="lb" maxlength="80" placeholder="e.g. Performance bonus">' +
        '<label class="f" for="am">Amount ($)</label><input id="am" type="number" step="0.01" min="0" inputmode="decimal"><div id="m"></div><button class="btn" style="margin-top:12px">Add line</button></form>' : '') +
      (admin && p.costs && p.costs.total !== undefined ? '<div class="card noprint"><h2>Employer cost</h2><p class="hint">Not on their payslip.</p><div class="ln"><span>Wages (after unpaid days)</span><b>' + money(p.costs.wages !== undefined ? p.costs.wages : p.gross) + '</b></div>' +
        (p.costs.levy ? '<div class="ln"><span>' + e(p.costs.levyLabel) + '</span><b>' + money(p.costs.levy) + '</b></div>' : '') + '<div class="ln"><span>Skills Development Levy (0.25%)</span><b>' + money(p.costs.sdl) + '</b></div>' +
        '<div class="ln sum"><span>Total cost to the company</span><b>' + money(p.cost) + '</b></div></div>' : '') +
      '<button class="btn ghost noprint" style="margin-top:12px" id="print">Save as PDF / print</button>';
    page(admin ? 'payroll' : 'me', html);
    document.getElementById('print').onclick = function(){ try{ window.print(); }catch(x){ toast('Printing isn\'t available here. Open the app in your browser.', true); } };
    if(!admin) return;
    var kind = 'earn', f = document.getElementById('adj');
    on(app, '[data-k]', 'click', function(b){ kind = b.dataset.k; app.querySelectorAll('[data-k]').forEach(function(x){ x.classList.toggle('on', x === b); }); });
    on(app, '[data-rm]', 'click', function(b){ KK.post('payslipAdjust', {id: p.id, remove: +b.dataset.rm}).then(function(x){ if(!x.ok) return toast(x.error, true); state.slip = x.slip; viewPayslip(); }); });
    if(f) f.onsubmit = function(x){
      x.preventDefault(); var done = busy(f.querySelector('.btn'));
      KK.post('payslipAdjust', {id: p.id, kind: kind, label: f.lb.value, amount: f.am.value}).then(function(res){
        done(); if(!res.ok){ document.getElementById('m').innerHTML = '<div class="msg bad">' + e(res.error) + '</div>'; return; }
        state.slip = res.slip; toast('Added'); viewPayslip();
      });
    };
  }

  // ---------------------------------------------------------------- notices
  function viewNotices(){
    loading();
    KK.post('notices').then(function(r){
      if(!r.ok) return fail(r);
      badgeCache.notices = r.notices.filter(function(n){ return n.mustAck && !n.acked; }).length;
      var html = '<div class="ptitle">Notices</div>' + (r.canPost ? '<button class="btn" style="margin-top:12px" id="new">＋ New notice</button>' : '') +
        (r.notices.length ? r.notices.map(function(n){
          return '<div class="card"' + (n.today ? ' style="background:var(--mustard-soft);border-color:#f6dc95"' : '') + '><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
            (n.today ? '<span class="chip warn">Today</span>' : '') + (n.pinned ? '<span class="chip pink">Pinned</span>' : '') + (r.canPost ? '<span class="chip">' + e(n.team === 'all' ? 'Everyone' : n.team) + '</span>' : '') + '</div>' +
            '<h2 style="margin-top:6px">' + e(n.title) + '</h2><div class="rich">' + rich(n.body) + '</div><div class="hint">' + e(n.by) + ' · ' + e(nice(n.created)) + (n.until ? ' · until ' + e(nice(n.until)) : '') + '</div>' +
            (n.mustAck ? (n.acked ? '<div style="margin-top:10px"><span class="chip ok">✓ Read</span></div>' : '<button class="btn sm" style="margin-top:10px" data-ack="' + e(n.id) + '">Got it</button>') : '') +
            (r.canPost ? '<div><button class="linkbtn" data-edit="' + e(n.id) + '">Edit</button> · <button class="linkbtn" data-who="' + e(n.id) + '">Who\'s read it</button></div>' : '') + '</div>';
        }).join('') : '<div class="empty">No notices right now.</div>');
      page(isMgr() ? (isAdmin() ? 'more' : 'notices') : 'notices', (isAdmin() ? '<a class="back" href="#more">‹ More</a>' : '') + html);
      on(app, '[data-ack]', 'click', function(b){ var d = busy(b, '…'); KK.post('noticeAck', {id: b.dataset.ack}).then(function(x){ d(); if(x.ok) viewNotices(); else toast(x.error, true); }); });
      on(app, '[data-who]', 'click', function(b){
        KK.post('noticeAcks', {id: b.dataset.who}).then(function(x){
          if(!x.ok) return toast(x.error, true);
          sheet('Who\'s read it', '<div class="h2">Read (' + x.read.length + ')</div>' + (x.read.map(function(p){ return '<div class="row"><div class="rt"><b>' + e(p.name) + '</b></div><small>' + e(p.at) + '</small></div>'; }).join('') || '<div class="empty">Nobody yet.</div>') +
            '<div class="h2">Not yet (' + x.notRead.length + ')</div>' + (x.notRead.map(function(n){ return '<div class="row"><div class="rt"><b>' + e(n) + '</b></div></div>'; }).join('') || '<div class="empty">Everyone has read it.</div>'));
        });
      });
      var edit = function(n){
        n = n || {team: 'production', mustAck: true};
        sheet(n.id ? 'Edit notice' : 'New notice', '<form id="nf"><label class="f" for="t">Title</label><input id="t" maxlength="120" required value="' + e(n.title||'') + '" placeholder="e.g. Today is stock take day">' +
          '<label class="f" for="b">Message</label><textarea id="b" placeholder="**bold** and - bullet lines work">' + e(n.body||'') + '</textarea>' +
          '<label class="f" for="tm">Who sees it</label><select id="tm"><option value="production">Kitchen staff</option><option value="all">Everyone</option><option value="events">Event crew</option></select>' +
          '<div class="row2"><div><label class="f" for="fr">Show from</label><input id="fr" type="date" value="' + e(n.from||'') + '"></div><div><label class="f" for="un">Show until</label><input id="un" type="date" value="' + e(n.until||'') + '"></div></div>' +
          '<div class="hint">For a one-day notice ("today is clean kitchen day"), set both dates to that day. It then shows at the top of everyone\'s home screen.</div>' +
          '<label class="check"><input type="checkbox" id="ma"' + (n.mustAck ? ' checked' : '') + '> Staff must tap "Got it"</label>' +
          '<label class="check"><input type="checkbox" id="pn"' + (n.pinned ? ' checked' : '') + '> Pin to the top</label>' +
          (n.id ? '<label class="check"><input type="checkbox" id="off"> Take it down</label>' : '') +
          '<div id="m"></div><button class="btn" style="margin-top:14px">' + (n.id ? 'Save' : 'Post notice') + '</button></form>',
          function(sh, close){
            var f = sh.querySelector('#nf'); f.tm.value = n.team || 'production';
            f.onsubmit = function(x){ x.preventDefault(); var d = busy(f.querySelector('.btn'));
              KK.post('noticeSave', {id: n.id, title: f.t.value, body: f.b.value, team: f.tm.value, from: f.fr.value, until: f.un.value, mustAck: f.ma.checked, pinned: f.pn.checked, active: !(f.off && f.off.checked)})
                .then(function(res){ d(); if(!res.ok){ sh.querySelector('#m').innerHTML = '<div class="msg bad">' + e(res.error) + '</div>'; return; } close(); toast('Saved'); viewNotices(); });
            };
          });
      };
      var nb = document.getElementById('new'); if(nb) nb.onclick = function(){ edit(); };
      on(app, '[data-edit]', 'click', function(b){ edit(r.notices.filter(function(n){ return n.id === b.dataset.edit; })[0]); });
    });
  }

  // ---------------------------------------------------------------- me
  function viewMe(){
    loading();
    Promise.all([KK.post('myDetails'), KK.post('myAttendance', {})]).then(function(rs){
      var r = rs[0], a = rs[1]; if(!r.ok) return fail(r);
      var d = r.details, pend = {}; r.pending.forEach(function(p){ pend[p.field] = p; });
      var html = demoBar() + '<div class="bar"><div class="avatar" style="margin-left:0">' + initial(d.name) + '</div><div><div style="font-weight:900;font-size:18px">' + e(d.name) + '</div><div class="sub2" style="margin:0">' + e(d.jobTitle || '') + (d.team !== 'office' ? ' · ' + (d.team === 'production' ? 'Mandai kitchen' : e(d.team)) : '') + '</div></div></div>';
      if(d.team !== 'office') html += '<a class="row" href="#payslips"><div class="rt"><b>Payslips</b><small>Every month\'s itemised payslip</small></div><span class="chev2">›</span></a>';
      if(a.ok && a.rows.length){
        var tot = a.rows.reduce(function(s, x){ return s + x.hours; }, 0);
        html += '<div class="sec" id="hrs"><div class="sec-head" tabindex="0" role="button"><span class="sec-name">My hours in ' + e(monthLabel(a.period)) + '</span><span class="sec-count">' + nd(tot) + ' h</span><span class="chev">›</span></div><div class="sec-body" style="padding:4px 14px 10px"><table class="tbl"><tr><th>Day</th><th>In</th><th>Out</th><th class="r">Hours</th></tr>' +
          a.rows.map(function(x){ return '<tr><td>' + e(x.label) + (x.late ? ' <span class="chip warn">late</span>' : '') + '</td><td>' + e(x.in || '–') + '</td><td>' + e(x.out || '–') + '</td><td class="r">' + (x.type === 'excused' ? 'paid' : nd(x.hours)) + '</td></tr>'; }).join('') + '</table></div></div>';
      }
      html += '<form class="card" id="cf"><h2>Contact</h2><label class="f" for="phone">Phone</label><input id="phone" type="tel" value="' + e(d.phone) + '">' +
        '<label class="f" for="address">Address</label><input id="address" value="' + e(d.address) + '">' +
        '<div class="row2"><div><label class="f" for="ec">Emergency contact</label><input id="ec" value="' + e(d.emergencyContact) + '"></div><div><label class="f" for="ep">Their phone</label><input id="ep" type="tel" value="' + e(d.emergencyPhone) + '"></div></div>' +
        '<div id="m1"></div><button class="btn" style="margin-top:14px">Save contact</button></form>';
      if(d.team !== 'office') html += '<form class="card" id="bf"><h2>Bank account for salary</h2><p class="hint">Jay or Hazel confirm bank changes before payroll uses them.</p>' +
        '<label class="f" for="bn">Bank</label><input id="bn" value="' + e(d.bankName) + '" placeholder="e.g. POSB">' + (pend['Bank name'] ? '<div class="hint" style="color:var(--amber);font-weight:700">Waiting for approval: ' + e(pend['Bank name'].value) + '</div>' : '') +
        '<label class="f" for="ba">Account number</label><input id="ba" inputmode="numeric" value="' + e(d.bankAccount) + '">' + (pend['Bank account'] ? '<div class="hint" style="color:var(--amber);font-weight:700">Waiting for approval: ' + e(pend['Bank account'].value) + '</div>' : '') +
        '<label class="f" for="an">Name on account</label><input id="an" value="' + e(d.accountName) + '">' + (pend['Account name'] ? '<div class="hint" style="color:var(--amber);font-weight:700">Waiting for approval: ' + e(pend['Account name'].value) + '</div>' : '') +
        '<div id="m2"></div><button class="btn ghost" style="margin-top:14px">Ask to change bank details</button></form>' +
        '<div class="card"><h2>My documents</h2><div class="kv"><span>Pass</span><b>' + e(d.passType || '–') + (d.passExpiry ? ' · expires ' + e(niceY(d.passExpiry)) : '') + '</b><span>Passport expires</span><b>' + e(niceY(d.passportExpiry) || '–') + '</b><span>Food hygiene cert</span><b>' + e(niceY(d.hygieneExpiry) || '–') + '</b></div><div class="hint">Something wrong? Tell Jay or Hazel.</div></div>';
      html += '<form class="card" id="pf"><h2>Change password</h2><label class="f" for="op">Current password</label><input id="op" type="password" autocomplete="current-password"><label class="f" for="np">New password</label><input id="np" type="password" autocomplete="new-password" minlength="6"><div id="m3"></div><button class="btn ghost" style="margin-top:14px">Change password</button></form>' +
        '<button class="btn ghost" style="margin-top:14px" id="out">Log out</button>';
      page(isAdmin() ? 'more' : 'me', (isAdmin() ? '<a class="back" href="#more">‹ More</a>' : '') + html);
      bindDemo();
      var h = document.querySelector('#hrs .sec-head'); if(h) h.onclick = function(){ document.getElementById('hrs').classList.toggle('open'); };
      document.getElementById('out').onclick = KK.logout;
      var cf = document.getElementById('cf');
      cf.onsubmit = function(x){ x.preventDefault(); var dn = busy(cf.querySelector('.btn'));
        KK.post('detailsSave', {phone: cf.phone.value, address: cf.address.value, emergencyContact: cf.ec.value, emergencyPhone: cf.ep.value}).then(function(res){ dn();
          document.getElementById('m1').innerHTML = res.ok ? '<div class="msg ok">' + (res.saved ? 'Saved.' : 'Nothing changed.') + '</div>' : '<div class="msg bad">' + e(res.error) + '</div>'; }); };
      var bf = document.getElementById('bf');
      if(bf) bf.onsubmit = function(x){ x.preventDefault(); var dn = busy(bf.querySelector('.btn'));
        KK.post('detailsSave', {bankName: bf.bn.value, bankAccount: bf.ba.value, accountName: bf.an.value}).then(function(res){ dn();
          if(!res.ok){ document.getElementById('m2').innerHTML = '<div class="msg bad">' + e(res.error) + '</div>'; return; }
          if(res.queued){ toast('Sent to Jay & Hazel to confirm'); viewMe(); } else document.getElementById('m2').innerHTML = '<div class="msg ok">Nothing changed.</div>'; }); };
      var pf = document.getElementById('pf');
      pf.onsubmit = function(x){ x.preventDefault(); var dn = busy(pf.querySelector('.btn'));
        KK.post('changePassword', {old: pf.op.value, password: pf.np.value}).then(function(res){ dn();
          document.getElementById('m3').innerHTML = res.ok ? '<div class="msg ok">Password changed.</div>' : '<div class="msg bad">' + e(res.error) + '</div>'; if(res.ok) pf.reset(); }); };
    });
  }

  // ---------------------------------------------------------------- admin: home (what needs you)
  function viewAdmin(){
    loading();
    // A manager who clocks in (e.g. the weekend manager) also gets her clock-in card and cleaning duty here
    Promise.all([KK.post('attention'), isAdmin() ? Promise.resolve(null) : KK.post('me')]).then(function(rs){
      var r = rs[0], mine = rs[1] && rs[1].ok ? rs[1] : null;
      if(!r.ok) return fail(r);
      var u = me(), hr = new Date().getHours(), greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
      badgeCache = { admin: r.act.length, 'leave-admin': r.pendingLeave };
      var html = demoBar() + '<div class="bar"><img class="logo" src="logo.png" alt="Kwazy Korndog"><a class="avatar" href="#' + (isAdmin() ? 'more' : 'me') + '" aria-label="Menu">' + initial(u.name) + '</a></div>' +
        '<div class="hello">' + greet + ', ' + e(u.name.split(' ')[0]) + '</div><div class="sub2">' + e(r.dateLabel) + ' · Kitchen HR' + (r.holiday ? ' · ' + e(r.holiday) : DAYKIND[r.dayKind] ? ' · ' + DAYKIND[r.dayKind] : '') + '</div>' +
        (mine && mine.cleaning && mine.cleaning.mine && mine.cleaning.status !== 'done' ? '<a class="row clean" href="#cleaning"><div class="rt"><b>You\'re on cleaning today</b><small>' + mine.cleaning.count + ' of ' + mine.cleaning.total + ' photos · finish before you clock out</small></div><span class="chev2">›</span></a>' : '') +
        (mine && mine.clockIn ? clockCard(mine) : '') +
        '<div class="h2">Needs you' + (r.act.length ? ' <span class="n">' + (r.act.length + r.more) + '</span>' : '') + '</div>' +
        (r.act.length ? r.act.map(function(a){ return '<a class="act ' + a.level + '" href="#' + a.link + '"><span class="dot" aria-hidden="true"></span><div><b>' + e(a.title) + '</b><small>' + e(a.detail) + '</small></div><span class="chev2" style="margin-left:auto">›</span></a>'; }).join('') +
          (r.more ? '<div class="empty">+' + r.more + ' more, in their sections.</div>' : '')
          : '<div class="clear">✓ All clear. Nothing needs you right now.</div>') +
        '<div class="h2">Good to know</div><div class="know">' + r.know.map(function(k){ return '<a href="#' + k.link + '"><b>' + e(k.value) + '</b><span>' + e(k.label) + '</span></a>'; }).join('') + '</div>' +
        (r.production ? prodCard(r.production) : '') +
        '<p class="fine">Only things that need a decision show up here. Everything else stays in its tab.</p>';
      page('admin', html);
      bindDemo(); if(mine && mine.clockIn) bindClock(mine);
    });
  }

  // ---------------------------------------------------------------- admin: leave
  function viewLeaveAdmin(){
    loading();
    KK.post('leaveAll').then(function(r){
      if(!r.ok) return fail(r);
      badgeCache['leave-admin'] = r.pending.length;
      var card = function(o){
        var after = o.type === 'annual' ? 'Annual leave left if approved: ' + nd(o.balance.annual.left) + ' of ' + nd(o.balance.annual.entitled) + ' days' : o.type === 'sick' ? 'Sick leave left after this: ' + nd(o.balance.sick.left) : o.type === 'hospital' ? 'Hospitalisation left after this: ' + nd(o.balance.hospital.left) : 'Unpaid: deducted from salary';
        var cov = o.coverage ? (o.short ? '<div class="cov bad">Kitchen on ' + e(o.coverage.label) + ': only ' + o.coverage.left + ' of ' + o.coverage.total + ' working. Your minimum is ' + r.minStaff + '.</div>'
          : '<div class="cov">Kitchen on ' + e(o.coverage.label) + ': ' + o.coverage.left + ' of ' + o.coverage.total + ' working</div>') : '';
        return '<div class="lcard' + (o.short ? ' short' : '') + '"><div class="top2"><b>' + e(o.name) + '</b><span class="chip pink">' + e(o.typeLabel) + '</span>' + (o.urgent ? '<span class="chip bad">Starts in ' + Math.max(0, daysTo(o.start)) + ' days</span>' : '') + (o.blackout ? '<span class="chip bad">Blackout dates</span>' : '') + '</div>' +
          '<div class="dates">' + e(o.start === o.end ? o.startLabel : o.startLabel + ' – ' + o.endLabel) + ' · ' + nd(o.days) + ' day' + (o.days === 1 ? '' : 's') + (o.half ? ' (half)' : '') + '</div>' +
          (o.unpaid ? '<div class="cov bad">' + nd(o.unpaid) + ' day' + (o.unpaid === 1 ? '' : 's') + ' unpaid: no paid ' + (o.type === 'hospital' ? 'hospitalisation' : 'sick') + ' leave left' + (o.balance && o.balance.note ? ' (' + e(o.balance.note) + ')' : '') + '</div>' : '') +
          '<div class="meta">' + (o.reason ? '"' + e(o.reason) + '" · ' : '') + 'asked ' + e(nice(o.submitted)) + '<br>' + e(after) + '</div>' + cov +
          (o.type === 'sick' || o.type === 'hospital' ? (o.mc ? '<a href="' + e(o.mc) + '" target="_blank" rel="noopener"><img class="mc" src="' + e(o.mc) + '" alt="MC photo"></a>' : '<div class="cov">No MC photo attached</div>') : '') +
          '<div class="btns"><button class="btn ghost" data-no="' + e(o.id) + '">Reject</button><button class="btn" data-yes="' + e(o.id) + '">Approve</button></div></div>';
      };
      var html = '<div class="ptitle">Leave</div><div class="h2">To decide' + (r.pending.length ? ' <span class="n">' + r.pending.length + '</span>' : '') + '</div>' +
        (r.pending.length ? r.pending.map(card).join('') : '<div class="clear" style="font-size:15px">Nothing waiting for you.</div>') +
        '<div class="h2">Coming up</div>' + (r.upcoming.length ? r.upcoming.map(function(o){
          return '<div class="row"><div class="rt"><b>' + e(o.name) + ' · ' + e(o.start === o.end ? o.startLabel : o.startLabel + ' – ' + o.endLabel) + '</b><small>' + e(o.typeLabel) + ' · ' + nd(o.days) + ' day' + (o.days === 1 ? '' : 's') + (o.decidedBy ? ' · approved by ' + e(o.decidedBy) : '') + '</small>' +
            (o.start > r.today ? '<button class="linkbtn" data-cancel="' + e(o.id) + '">Cancel this leave</button>' : '') + '</div></div>'; }).join('') : '<div class="empty">No approved leave coming up.</div>') +
        '<div class="h2">Blackout dates</div><p class="hint">Nobody can apply for annual or no-pay leave on these days. Sick leave still works.</p>' +
        r.blackouts.map(function(b){ return '<div class="row"><div class="rt"><b>' + e(b.start === b.end ? b.startLabel : b.startLabel + ' – ' + b.endLabel) + '</b><small>' + e(b.reason || 'No reason given') + ' · ' + e(b.team === 'all' ? 'everyone' : b.team) + '</small></div><button class="btn ghost sm" data-del="' + e(b.id) + '">Remove</button></div>'; }).join('') +
        '<form class="card" id="bf"><h2>Block dates</h2><div class="row2"><div><label class="f" for="bs">From</label><input id="bs" type="date" required></div><div><label class="f" for="be">To</label><input id="be" type="date" required></div></div>' +
        '<label class="f" for="br">Why</label><input id="br" maxlength="120" placeholder="e.g. Waystar production run">' +
        (isAdmin() ? '<label class="f" for="bt">For</label><select id="bt"><option value="production">Kitchen staff</option><option value="all">Everyone</option><option value="events">Event crew</option></select>' : '') +
        '<div id="m"></div><button class="btn" style="margin-top:14px">Block these dates</button></form>' +
        (r.past.length ? '<div class="sec" id="past"><div class="sec-head" role="button" tabindex="0"><span class="sec-name">Past requests</span><span class="sec-count">' + r.past.length + '</span><span class="chev">›</span></div><div class="sec-body" style="padding:0 14px 10px">' +
          r.past.map(function(o){ return '<div class="ln"><span>' + e(o.name) + ' · ' + e(o.startLabel) + (o.end !== o.start ? '–' + e(o.endLabel) : '') + ' · ' + e(o.typeLabel) + '</span>' + statusChip(o.status) + '</div>'; }).join('') + '</div></div>' : '');
      page('leave-admin', html);
      var ps = document.querySelector('#past .sec-head'); if(ps) ps.onclick = function(){ document.getElementById('past').classList.toggle('open'); };
      var find = function(id){ return r.pending.filter(function(o){ return o.id === id; })[0]; };
      var decide = function(id, decision, note){ return KK.post('leaveDecide', {id: id, decision: decision, note: note || ''}).then(function(x){ if(!x.ok){ toast(x.error, true); return x; } toast(decision === 'approve' ? 'Approved' : 'Rejected'); viewLeaveAdmin(); return x; }); };
      on(app, '[data-yes]', 'click', function(b){
        var o = find(b.dataset.yes);
        if(o.short || o.blackout) confirmSheet('Approve anyway?', o.short ? 'This leaves only <b>' + o.coverage.left + ' people</b> in the kitchen on ' + e(o.coverage.label) + ' (your minimum is ' + r.minStaff + ').' : 'These dates are blocked for leave.', 'Approve anyway', function(){ decide(o.id, 'approve'); });
        else { busy(b, '…'); decide(o.id, 'approve'); }
      });
      on(app, '[data-no]', 'click', function(b){
        var o = find(b.dataset.no);
        sheet('Reject ' + o.name.split(' ')[0] + '\'s leave', '<form id="rf"><label class="f" for="nt">Reason they\'ll see</label><input id="nt" required maxlength="300" placeholder="e.g. Waystar order that week"><div id="m"></div><button class="btn red" style="margin-top:14px">Reject</button></form>', function(sh, close){
          var f = sh.querySelector('#rf'); f.onsubmit = function(x){ x.preventDefault(); decide(o.id, 'reject', f.nt.value).then(function(res){ if(res.ok) close(); }); };
        });
      });
      on(app, '[data-cancel]', 'click', function(b){ confirmSheet('Cancel this approved leave?', 'They\'ll see it as cancelled and the days go back to their balance. Tell them first.', 'Cancel leave', function(){ KK.post('leaveCancel', {id: b.dataset.cancel}).then(function(x){ if(x.ok){ toast('Cancelled'); viewLeaveAdmin(); } else toast(x.error, true); }); }, true); });
      on(app, '[data-del]', 'click', function(b){ KK.post('blackoutDelete', {id: b.dataset.del}).then(function(x){ if(x.ok){ toast('Removed'); viewLeaveAdmin(); } else toast(x.error, true); }); });
      var bf = document.getElementById('bf');
      bf.bs.addEventListener('change', function(){ if(!bf.be.value || bf.be.value < bf.bs.value) bf.be.value = bf.bs.value; });
      bf.onsubmit = function(x){ x.preventDefault(); var dn = busy(bf.querySelector('.btn'));
        KK.post('blackoutSave', {start: bf.bs.value, end: bf.be.value, reason: bf.br.value, team: bf.bt ? bf.bt.value : me().team}).then(function(res){ dn();
          if(!res.ok){ document.getElementById('m').innerHTML = '<div class="msg bad">' + e(res.error) + '</div>'; return; } toast('Dates blocked'); viewLeaveAdmin(); }); };
    });
  }

  // ---------------------------------------------------------------- admin: attendance
  function timeTabs(active, counts){
    counts = counts || {};
    return '<div class="ptitle">Time</div><div class="seg" role="tablist" style="margin-top:12px">' + [['grid','Attendance'],['inc','Incidents'],['clean','Cleaning']].map(function(t){
      return '<button role="tab" aria-selected="' + (t[0] === active) + '" class="' + (t[0] === active ? 'on' : '') + '" data-tt="' + t[0] + '">' + t[1] + (counts[t[0]] ? ' <span class="badge">' + counts[t[0]] + '</span>' : '') + '</button>'; }).join('') + '</div>';
  }
  function bindTimeTabs(){ on(app, '[data-tt]', 'click', function(b){ state.timeTab = b.dataset.tt; viewAttendance(); }); }
  function viewAttendance(){
    var p = state.attPeriod || KK.ymd().slice(0, 7), tab = state.timeTab || 'grid';
    loading();
    if(tab === 'inc') return KK.post('incidents').then(function(r){
      if(!r.ok) return fail(r);
      var open = r.incidents.filter(function(i){ return !i.reviewed; }).length;
      page('attendance', timeTabs('inc', {inc: open}) + incidentsHtml(r.incidents)); bindTimeTabs();
      var dn = document.querySelector('#dn .sec-head'); if(dn) dn.onclick = function(){ document.getElementById('dn').classList.toggle('open'); };
      on(app, '[data-note]', 'click', function(b){ var i = r.incidents.filter(function(x){ return x.key === b.dataset.note; })[0];
        KK.post('incidentReview', {key: i.key, kind: i.kind, outcome: 'Noted'}).then(function(x){ if(!x.ok) return toast(x.error, true); toast('Marked as dealt with'); viewAttendance(); }); });
      on(app, '[data-warn]', 'click', function(b){ var i = r.incidents.filter(function(x){ return x.key === b.dataset.warn; })[0];
        warningForm({username: i.username, name: i.name, warnings: new Array(i.warnings)}, i.key, viewAttendance); });
    });
    if(tab === 'clean') return KK.post('cleaningLog', {period: p}).then(function(r){
      if(!r.ok) return fail(r);
      page('attendance', timeTabs('clean') + '<div class="mnav"><button id="prev" aria-label="Previous month">‹</button><b>' + e(monthLabel(r.period)) + '</b><button id="next" aria-label="Next month">›</button></div>' +
        '<a class="row" href="#cleaning"><div class="rt"><b>Today\'s checklist</b><small>See progress or fill it in yourself</small></div><span class="chev2">›</span></a>' + cleaningHtml(r)); bindTimeTabs();
      document.getElementById('prev').onclick = function(){ state.attPeriod = addMonth(r.period, -1); viewAttendance(); };
      document.getElementById('next').onclick = function(){ state.attPeriod = addMonth(r.period, 1); viewAttendance(); };
      on(app, '[data-cd]', 'click', function(a, x){ x.preventDefault(); var d = r.days[+a.dataset.cd];
        sheet('Cleaning · ' + d.label, (d.reason ? '<div class="msg warn">Closed early: "' + e(d.reason) + '"</div>' : '') + '<p class="hint">' + d.count + ' of ' + d.total + ' photos' + (d.by ? ' · ' + e(d.by) : '') + '</p><div class="gallery">' +
          d.photos.map(function(p){ return '<figure><a href="' + e(p.photo) + '" target="_blank" rel="noopener"><img src="' + e(p.photo) + '" alt="' + e(p.item) + '" loading="lazy"></a><figcaption><b>' + e(p.item) + '</b><br>' + e(p.area) + ' · ' + e(p.at) + '</figcaption></figure>'; }).join('') + '</div>' +
          (d.status !== 'done' && d.date < KK.ymd() ? '<button class="btn ghost" style="margin-top:14px" id="ok">Mark as dealt with</button>' : ''), function(sh, close){
            var ok = sh.querySelector('#ok'); if(ok) ok.onclick = function(){ KK.post('incidentReview', {key: 'cleaning|' + d.date, outcome: 'Noted'}).then(function(){ close(); toast('Noted'); }); };
          });
      });
    });
    KK.post('attendanceMonth', {period: p, team: 'production'}).then(function(r){
      if(!r.ok) return fail(r);
      var SYM = { worked: '✓', leave: 'L', absent: 'A', excused: 'P', rest: '·', off: '·', ph: 'PH', future: '', today: '?', na: '', dayoff: 'O', nc: '–' };
      var html = timeTabs('grid') + '<div class="mnav"><button id="prev" aria-label="Previous month">‹</button><b>' + e(monthLabel(r.period)) + '</b><button id="next" aria-label="Next month">›</button></div>' +
        '<div class="gridwrap"><table class="grid"><thead><tr><th class="nm">Staff</th>' + r.days.map(function(d){ return '<th class="' + (d.kind !== 'work' ? 'we' : '') + '" title="' + e(d.holiday || '') + '">' + d.dow + '<br>' + d.d + '</th>'; }).join('') +
        '<th class="tot">Hours</th><th class="tot">OT</th><th class="tot">Late</th><th class="tot">Absent</th></tr></thead><tbody>' +
        r.rows.map(function(row){
          return '<tr><td class="nm" title="' + e(row.schedule + (row.clockIn ? ' · normal ' + row.normal + 'h a day' : ' · no clock-in')) + '">' + e(row.name) + '</td>' + row.cells.map(function(c, i){
            var d = r.days[i], cls = 'c-' + c.s + (c.late ? ' late' : '') + (c.s === 'worked' && !c.out && d.date < r.today ? ' open' : '') + (c.weekend && !c.otOk && !c.otNo ? ' pend' : '') + (c.weekend && c.otOk ? ' otok' : '');
            var label = c.s === 'worked' ? (c.out ? nd(Math.round(c.h * 10) / 10) : d.date < r.today ? '!' : 'in') : (SYM[c.s] || '');
            var t = d.date + ': ' + (c.s === 'worked' ? 'in ' + c.in + (c.out ? ', out ' + c.out + ', ' + c.h + 'h' : ', no clock-out') + (c.late ? ', ' + c.late + ' min late' : '') : c.s);
            return '<td><button class="cell ' + cls + '" data-u="' + e(row.username) + '" data-d="' + d.date + '" title="' + e(t) + '" aria-label="' + e(row.name + ' ' + t) + '"' + (c.s === 'na' ? ' disabled' : '') + ' style="' + (c.s === 'worked' && c.out ? 'font-size:9.5px' : '') + '">' + label + '</button></td>';
          }).join('') + '<td class="tot">' + nd(row.worked) + '</td><td class="tot">' + nd(row.ot) + '</td><td class="tot">' + row.late + '</td><td class="tot"' + (row.absent ? ' style="color:var(--red);font-weight:900"' : '') + '>' + nd(row.absent) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<div class="legend"><span><i class="c-worked"></i>Worked (hours)</span><span><i class="c-worked open"></i>No clock-out</span><span><i class="c-worked late"></i>Late</span><span><i class="c-leave"></i>Leave</span><span><i class="c-absent"></i>Absent</span><span><i class="c-excused"></i>Paid absence</span><span><i class="c-ph"></i>Public holiday</span><span><i class="c-dayoff"></i>Picked off day</span><span><i class="c-worked pend"></i>Weekend shift to approve</span></div>' +
        '<p class="hint">Tap a day to fix times (forgot to clock out), add a missed day, or mark an absence as paid. Absent days are unpaid in payroll unless you fix them.</p>';
      page('attendance', html, true); bindTimeTabs();
      var gw = app.querySelector('.gridwrap'), th = gw && gw.querySelectorAll('thead th')[r.days.map(function(d){ return d.date; }).indexOf(r.today) + 1];
      if(th && gw.scrollWidth > gw.clientWidth) gw.scrollLeft = Math.max(0, th.offsetLeft - gw.querySelector('.nm').offsetWidth - 4 * 30);
      document.getElementById('prev').onclick = function(){ state.attPeriod = addMonth(r.period, -1); viewAttendance(); };
      document.getElementById('next').onclick = function(){ state.attPeriod = addMonth(r.period, 1); viewAttendance(); };
      on(app, '.cell', 'click', function(b){
        var row = r.rows.filter(function(x){ return x.username === b.dataset.u; })[0], i = r.days.map(function(d){ return d.date; }).indexOf(b.dataset.d), c = row.cells[i], d = r.days[i];
        sheet(row.name.split(' ')[0] + ' · ' + nice(d.date), '<p class="hint" style="margin-bottom:6px">' + (c.s === 'worked' ? 'Clocked in ' + e(c.in) + (c.out ? ', out ' + e(c.out) + ' (' + nd(c.h) + ' paid hours)' : ', no clock-out') + (c.note ? ' · note: ' + e(c.note) : '') : 'Status: ' + e(c.s) + (d.holiday ? ' (' + e(d.holiday) + ')' : '')) + '</p>' +
          '<form id="af"><div class="row2"><div><label class="f" for="ti">Clock in</label><input id="ti" type="time" value="' + e(c.in || '09:00') + '"></div><div><label class="f" for="to">Clock out</label><input id="to" type="time" value="' + e(c.out || '') + '"></div></div>' +
          '<label class="f" for="nt">Note (required)</label><input id="nt" maxlength="200" placeholder="e.g. forgot to clock out, left at 6pm" value="">' +
          '<div id="m"></div><button class="btn" style="margin-top:14px" data-mode="times">Save times</button>' +
          (c.weekend ? '<div class="card" style="margin-top:12px"><b>Weekend overtime</b><p class="hint">' + (c.otOk ? '✓ Approved: paid as overtime.' : c.otNo ? 'Declined: not paid as overtime.' : 'Did you ask them to work this day? Approve to pay it as overtime.') + '</p><div class="btns"><button type="button" class="btn ghost" data-mode="declineOt">Not approved</button><button type="button" class="btn" data-mode="approveOt">Approve overtime</button></div></div>' : '') +
          '<div class="btns"><button type="button" class="btn ghost" data-mode="excused">Mark as paid absence</button>' + (c.s === 'worked' || c.s === 'excused' ? '<button type="button" class="btn ghost" data-mode="clear">Clear day</button>' : '') + '</div></form>',
          function(sh, close){
            var f = sh.querySelector('#af');
            var send = function(mode){ KK.post('attendanceFix', {username: row.username, date: d.date, mode: mode, in: f.ti.value, out: f.to.value, note: f.nt.value}).then(function(x){
              if(!x.ok){ sh.querySelector('#m').innerHTML = '<div class="msg bad">' + e(x.error) + '</div>'; return; } close(); toast('Saved'); viewAttendance(); }); };
            f.onsubmit = function(x){ x.preventDefault(); send('times'); };
            sh.querySelectorAll('button[type=button][data-mode]').forEach(function(btn){ btn.onclick = function(){ send(btn.dataset.mode); }; });
          });
      });
    });
  }

  // ---------------------------------------------------------------- admin: payroll
  function viewPayroll(){
    var p = state.payPeriod || addMonth(KK.ymd().slice(0, 7), -1);
    loading();
    KK.post('payrollList', {period: p}).then(function(r){
      if(!r.ok) return fail(r);
      var drafts = r.slips.filter(function(s){ return s.status === 'draft'; }).length, pub = r.slips.length - drafts;
      var html = '<div class="ptitle">Payroll</div><div class="mnav"><button id="prev" aria-label="Previous month">‹</button><b>' + e(r.label) + '</b><button id="next" aria-label="Next month">›</button></div>';
      if(!r.slips.length) html += '<div class="card"><h2>No payslips yet</h2><p class="hint">This works out each person\'s pay from their salary, clock-ins, leave and your work rules. You check the drafts before anyone sees them.</p><button class="btn" style="margin-top:14px" id="prep">Prepare ' + e(r.label) + ' payslips</button></div>';
      else {
        var T = r.totals, L = r.levy;
        html += '<div class="tiles" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="tile"><b>' + money(T.cost) + '</b><span>Employment cost</span><small>pay + levy + SDL</small></div><div class="tile"><b>' + money(r.total) + '</b><span>Net pay to staff</span><small>' + (drafts ? drafts + ' draft' + (drafts === 1 ? '' : 's') + ' to check' : 'published') + '</small></div></div>' +
          '<div class="card"><h2>What this month costs</h2><div class="ln"><span>Wages (after unpaid days)</span><b>' + money(T.wages) + '</b></div><div class="ln"><span>Foreign worker levy</span><b>' + money(T.levy) + '</b></div>' +
          '<div class="ln"><span>Skills Development Levy</span><b>' + money(T.sdl) + '</b></div><div class="ln sum"><span>Total employment cost</span><b>' + money(T.cost) + '</b></div>' +
          '<p class="hint">' + e(L.sector) + ' tier ' + L.tier + ': ' + L.foreign + ' work pass holder' + (L.foreign === 1 ? '' : 's') + ' of ' + nd(L.total) + ' staff (' + L.ratio + '%). Work Permit levy $' + L.wpBasic + ' (basic-skilled), S Pass $' + L.sPass + '. Not paid through this app: pay MOM and CPF (SDL) as usual.</p>' +
          (L.over ? '<div class="note">You\'re above the ' + e(L.sector) + ' quota for work pass holders. Check with MOM before hiring more.</div>' : '') + '</div>' +
          r.slips.map(function(s, i){ return '<a class="row" href="#payslip" data-i="' + i + '"><div class="rt"><b>' + e(s.name) + ' ' + statusChip(s.status) + '</b><small>' + nd(s.worked) + '/' + nd(s.workingDays) + ' days' + (s.otH ? ' · ' + nd(s.otH) + 'h OT' : '') + ' · gross ' + money(s.gross) + ' · costs you ' + money(s.cost) + '</small>' +
            (s.notes ? '<small style="color:var(--amber);font-weight:700">⚠ ' + e(s.notes) + '</small>' : '') + '</div><span class="amt">' + money(s.net) + '</span><span class="chev2">›</span></a>'; }).join('');
        if(drafts) html += '<form class="card" id="pubf"><h2>Publish</h2><p class="hint">Staff see their payslip in the app once you publish. MOM: pay salary within 7 days after the month ends, and give the payslip with it.</p>' +
          '<label class="f" for="pd">Payment date</label><input id="pd" type="date" required value="' + e(r.payDate) + '"><div id="m"></div>' +
          '<button class="btn" style="margin-top:14px">Publish ' + drafts + ' payslip' + (drafts === 1 ? '' : 's') + '</button><button type="button" class="btn ghost" id="prep">Refresh drafts from latest attendance</button></form>';
        else html += '<button class="btn ghost" style="margin-top:14px" id="reopen">Reopen to make changes</button>';
      }
      if(r.missing.length && r.slips.length) html += '<div class="note" style="margin-top:12px">Not in this payroll: ' + e(r.missing.join(', ')) + '. Set their basic salary in Staff, then prepare again.</div>';
      page('payroll', html);
      document.getElementById('prev').onclick = function(){ state.payPeriod = addMonth(r.period, -1); viewPayroll(); };
      document.getElementById('next').onclick = function(){ state.payPeriod = addMonth(r.period, 1); viewPayroll(); };
      var prep = document.getElementById('prep');
      if(prep) prep.onclick = function(){ var dn = busy(prep, 'Working it out…'); KK.post('payrollPrepare', {period: r.period}).then(function(x){ dn(); if(!x.ok) return toast(x.error, true); toast('Drafts ready'); viewPayroll(); }); };
      var pf = document.getElementById('pubf');
      if(pf) pf.onsubmit = function(x){ x.preventDefault();
        confirmSheet('Publish ' + r.label + '?', drafts + ' payslip' + (drafts === 1 ? '' : 's') + ' (' + money(r.total) + ' net) become visible to staff, dated ' + e(nice(pf.pd.value)) + '. Make the bank transfers yourself.', 'Publish', function(){
          KK.post('payrollPublish', {period: r.period, payDate: pf.pd.value}).then(function(res){ if(!res.ok) return toast(res.error, true); toast('Published'); viewPayroll(); }); }); };
      var ro = document.getElementById('reopen');
      if(ro) ro.onclick = function(){ confirmSheet('Reopen ' + r.label + '?', 'Payslips go back to draft and staff stop seeing them until you publish again.', 'Reopen', function(){ KK.post('payrollReopen', {period: r.period}).then(function(){ viewPayroll(); }); }, true); };
      on(app, '[data-i]', 'click', function(a, x){ x.preventDefault(); state.slip = r.slips[+a.dataset.i]; state.back = 'payroll'; go('payslip'); });
    });
  }

  // ---------------------------------------------------------------- admin: staff
  function viewStaff(){
    loading();
    Promise.all([KK.post('staff'), isAdmin() ? KK.post('changesList') : Promise.resolve({ok:true, changes:[]})]).then(function(rs){
      var r = rs[0], ch = rs[1]; if(!r.ok) return fail(r);
      var t = KK.ymd(), html = (isAdmin() ? '<a class="back" href="#more">‹ More</a>' : '') + '<div class="ptitle">Staff</div>';
      if(ch.changes.length) html += '<div class="h2">Bank details to confirm <span class="n">' + ch.changes.length + '</span></div>' + ch.changes.map(function(c){
        return '<div class="lcard"><div class="top2"><b>' + e(c.name) + '</b><span class="chip warn">' + e(c.field) + '</span></div><div class="meta">From <b>' + e(c.old || 'blank') + '</b> to <b>' + e(c.value) + '</b><br>Asked ' + e(c.at) + '. Check with them in person before you confirm.</div>' +
          '<div class="btns"><button class="btn ghost" data-cn="' + e(c.id) + '">Reject</button><button class="btn" data-cy="' + e(c.id) + '">Confirm</button></div></div>'; }).join('');
      html += '<button class="btn" style="margin-top:14px" id="add">＋ Add a staff member</button>';
      ['production', 'events', 'office'].forEach(function(team){
        var list = r.staff.filter(function(s){ return s.team === team; }); if(!list.length) return;
        html += '<div class="h2">' + ({production:'Mandai kitchen', events:'Event crew', office:'Admins'})[team] + '</div>' + list.map(function(s){
          var flags = [];
          [['passExpiry','Pass'],['passportExpiry','Passport'],['hygieneExpiry','Food hygiene']].forEach(function(f){ if(s[f[0]]){ var n = daysTo(s[f[0]]); if(n <= 60) flags.push('<span class="chip ' + (n < 0 ? 'bad' : 'warn') + '">' + f[1] + (n < 0 ? ' expired' : ' expires in ' + n + 'd') + '</span>'); } });
          if(s.warnings && s.warnings.length) flags.push('<span class="chip bad">Warnings ' + s.warnings.length + ' of 2' + (s.warnings.length >= 2 ? ' · final' : '') + '</span>');
          if(!s.active) flags.push('<span class="chip">Inactive</span>'); if(s.mustChange) flags.push('<span class="chip">Hasn\'t logged in yet</span>');
          return '<a class="row" href="#" data-s="' + e(s.username) + '"><div class="rt"><b>' + e(s.name) + (s.role !== 'staff' ? ' <span class="chip pink">' + e(s.role) + '</span>' : '') + '</b><small>' + e(s.jobTitle || s.username) + (s.team === 'production' ? ' · ' + e(s.schedule) : '') + (s.balances ? ' · ' + nd(s.balances.annual.left) + ' AL left' : '') + '</small>' + (flags.length ? '<div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">' + flags.join('') + '</div>' : '') + '</div><span class="chev2">›</span></a>';
        }).join('');
      });
      page(isAdmin() ? 'more' : 'admin', html);
      on(app, '[data-cy],[data-cn]', 'click', function(b){ KK.post('changeDecide', {id: b.dataset.cy || b.dataset.cn, decision: b.dataset.cy ? 'approve' : 'reject'}).then(function(x){ if(!x.ok) return toast(x.error, true); toast(b.dataset.cy ? 'Confirmed' : 'Rejected'); viewStaff(); }); });
      document.getElementById('add').onclick = function(){ staffForm(null, r); };
      on(app, '[data-s]', 'click', function(a, x){ x.preventDefault(); staffForm(r.staff.filter(function(s){ return s.username === a.dataset.s; })[0], r); });
    });
  }
  function momAl(start){ if(!start) return 7; var y = Math.floor((new Date() - new Date(start + 'T00:00:00')) / (365.25 * 864e5)); return Math.min(14, 7 + Math.max(0, y)); }
  function staffForm(s, r){
    var isNew = !s; s = s || {team: 'production', role: 'staff', active: true, al: 7, sl: 14, hl: 60, alCarried: 0, allowances: [], deductions: []};
    var admin = isAdmin();
    var lines = function(id, list){ return '<div class="lines" id="' + id + '">' + (list || []).map(function(l){ return lineRow(l); }).join('') + '</div><button type="button" class="linkbtn" data-addline="' + id + '">＋ Add</button>'; };
    var dt = function(id, label, v){ return '<div><label class="f" for="' + id + '">' + label + '</label><input id="' + id + '" type="date" value="' + e(v || '') + '"></div>'; };
    var tx = function(id, label, v, extra){ return '<label class="f" for="' + id + '">' + label + '</label><input id="' + id + '" value="' + e(v == null ? '' : v) + '"' + (extra || '') + '>'; };
    sheet(isNew ? 'Add staff member' : s.name, '<form id="sf">' +
      tx('nm', 'Full name (as on payslip)', s.name, ' required') + (isNew ? tx('un', 'Username for logging in', '', ' autocapitalize="none" placeholder="e.g. siti" required') : '<p class="hint">Username: <b>' + e(s.username) + '</b></p>') +
      '<div class="row2"><div><label class="f" for="tm">Team</label><select id="tm"' + (admin ? '' : ' disabled') + '><option value="production">Mandai kitchen</option><option value="events">Event crew</option><option value="office">Admin / office</option></select></div>' +
      '<div><label class="f" for="rl">Access</label><select id="rl"' + (admin ? '' : ' disabled') + '><option value="staff">Staff</option><option value="manager">Manager (own team)</option><option value="admin">Admin (Jay/Hazel)</option></select></div></div>' +
      tx('jt', 'Job title', s.jobTitle) + tx('ph', 'Phone', s.phone, ' type="tel"') +
      '<div class="row2">' + dt('st', 'Start date', s.start) + dt('en', 'Last day (if leaving)', s.end) + '</div>' +
      '<div class="h2">Schedule</div><label class="f" for="sk">Days</label><select id="sk"><option value="company">Usual kitchen week (Settings)</option><option value="week">Their own fixed week</option><option value="off">Every day, with off days they pick</option></select>' +
      '<div id="skWeek" class="weekpick">' + ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(function(d, i){ return '<div><label for="pw' + i + '">' + d + '</label><select id="pw' + i + '"><option value="1">Full</option><option value="0.5">Half</option><option value="0">Off</option></select></div>'; }).join('') + '</div>' +
      '<div id="skOff">' + tx('op', 'Off days a month', s.offPerMonth || 2, ' type="number" min="1" max="8"') + '<div class="hint">They pick these in the app each month.</div></div>' +
      '<label class="check"><input type="checkbox" id="ci"' + (s.clockIn !== false ? ' checked' : '') + '> Clocks in and out at the kitchen</label><div class="hint">Untick for staff who only use the app for leave (no lateness or absence tracking).</div>' +
      (admin ? '<div class="h2">Pay (monthly)</div>' + tx('bs', 'Basic salary ($)', s.basic, ' type="number" step="0.01" min="0" inputmode="decimal"') +
        '<label class="f" for="om">Overtime</label><select id="om"><option value="paid">Paid by the app from clock-in hours (MOM rate)</option><option value="fixed">Included in salary: fixed amount in the contract</option><option value="weekend">Weekdays included in salary; approved weekend work paid as overtime</option><option value="none">None: no overtime on the payslip</option></select>' +
        '<div id="omFixed">' + tx('fo', 'Fixed overtime pay in the contract ($)', s.fixedOt || 0, ' type="number" step="0.01" min="0" inputmode="decimal"') + '<div class="hint">Payslips show the real overtime hours with this amount. Each month the draft shows what MOM\'s formula would pay for those hours.</div></div>' +
        '<label class="f" for="pho">Public holiday on their day off</label><select id="pho"><option value="pay">Pay an extra day\'s salary</option><option value="lieu">Give a day off in lieu (no extra pay)</option></select>' +
        '<div class="hint">MOM requires one or the other. With a day off in lieu, the payslip notes the holiday so you remember to give the day.</div>' +
        '<label class="f">Fixed allowances</label>' + lines('alw', s.allowances) + '<label class="f">Fixed deductions</label>' + lines('ded', s.deductions) +
        '<p class="hint">Work permit holders don\'t pay CPF. Deductions like accommodation need their written consent and must stay within MOM\'s limits.</p>' : '') +
      '<div class="h2">Leave</div><label class="f" for="lp">Leave rule</label><select id="lp"><option value="mom">MOM minimum (starts after 3 months)</option><option value="monthly">Monthly: 1 day a month from month 3, up to a yearly number</option><option value="manual">Fixed numbers I type in</option></select>' +
      '<div class="row2"><div id="alWrap">' + tx('al', 'Annual leave days a year', s.al, ' type="number" step="0.5" min="0"') + '</div><div>' + tx('ac', 'Carried from last year', s.alCarried, ' type="number" step="0.5" min="0"') + '</div></div><div class="hint" id="alHint"></div>' +
      '<div class="row2" id="slWrap"><div>' + tx('sl', 'Sick leave days', s.sl, ' type="number" min="0"') + '</div><div>' + tx('hl', 'Hospitalisation days', s.hl, ' type="number" min="0"') + '</div></div>' +
      '<div class="h2">Work pass</div><div class="row2"><div><label class="f" for="pt">Pass type</label><select id="pt"><option value="">Singaporean / PR</option><option>Work Permit</option><option>S Pass</option><option>Employment Pass</option><option value="Other">Other pass (e.g. Letter of Consent)</option></select></div>' +
      '<div><label class="f" for="sk2">Skill level (levy)</label><select id="sk2"><option value="basic">Basic-skilled</option><option value="higher">Higher-skilled</option></select></div></div>' +
      dt('pi', 'Permit issued (levy starts)', s.permitIssued) + '<div class="hint">Leave blank to use their start date.</div>' +
      '<div class="row2">' + dt('pe', 'Pass expires', s.passExpiry) + dt('pp', 'Passport expires', s.passportExpiry) + '</div>' + dt('fh', 'Food hygiene cert expires', s.hygieneExpiry) +
      (admin ? '<div class="h2">Bank</div><div class="row2"><div>' + tx('bn', 'Bank', s.bankName) + '</div><div>' + tx('ba', 'Account number', s.bankAccount, ' inputmode="numeric"') + '</div></div>' + tx('an', 'Name on account', s.accountName) : '') +
      '<div class="h2">Other</div>' + tx('ad', 'Address', s.address) + '<div class="row2"><div>' + tx('ec', 'Emergency contact', s.emergencyContact) + '</div><div>' + tx('ep', 'Their phone', s.emergencyPhone, ' type="tel"') + '</div></div>' +
      (isNew ? '' : '<div class="h2">Warning letters (' + (s.warnings || []).length + ' of 2)</div>' + ((s.warnings || []).map(function(w){
        return '<div class="row"><div class="rt"><b>' + e(w.label) + '</b><small>' + e(w.reason) + '<br>' + (w.acked ? 'Acknowledged ' + e(w.acked) : 'Not acknowledged yet') + ' · by ' + e(w.by) + '</small>' +
          (admin ? '<div><a class="linkbtn" href="' + e(w.letter) + '" target="_blank" rel="noopener">View letter</a> · <button type="button" class="linkbtn" data-wd="' + e(w.id) + '">Withdraw</button></div>' : '') + '</div></div>'; }).join('') || '<div class="empty">None.</div>') +
        (admin ? '<button type="button" class="btn ghost sm" id="issue">＋ Issue a warning letter</button>' : '')) +
      tx('no', 'Private notes', s.notes) + (isNew ? '' : '<label class="check"><input type="checkbox" id="ac2"' + (s.active ? ' checked' : '') + '> Active (can log in, counted in rosters and payroll)</label>') +
      '<div id="m"></div><button class="btn" style="margin-top:16px">' + (isNew ? 'Add and get their password' : 'Save') + '</button>' +
      (isNew ? '' : '<button type="button" class="btn ghost" id="rs">Reset their password</button>') + '</form>',
      function(sh, close){
        var f = sh.querySelector('#sf'); f.tm.value = s.team; f.rl.value = s.role;
        var wk = (s.week || '').split(','); for(var i = 0; i < 7; i++) f['pw' + i].value = wk.length === 7 ? String(Number(wk[i])) : (i < 5 ? '1' : '0');
        f.sk.value = s.offPerMonth > 0 ? 'off' : s.week ? 'week' : 'company';
        f.pt.value = ['Work Permit', 'S Pass', 'Employment Pass', 'Other'].indexOf(s.passType) >= 0 ? s.passType : ''; f.sk2.value = s.skill || 'basic';
        if(f.om) f.om.value = s.ot || 'paid'; if(f.pho) f.pho.value = s.phOff || 'pay'; f.lp.value = s.leavePolicy || 'mom';
        var hint = function(){
          sh.querySelector('#skWeek').style.display = f.sk.value === 'week' ? '' : 'none'; sh.querySelector('#skOff').style.display = f.sk.value === 'off' ? '' : 'none';
          if(f.om) sh.querySelector('#omFixed').style.display = f.om.value === 'fixed' ? '' : 'none';
          var lp = f.lp.value; sh.querySelector('#alWrap').style.display = lp === 'mom' ? 'none' : ''; sh.querySelector('#slWrap').style.display = lp === 'manual' ? '' : 'none';
          sh.querySelector('#alHint').textContent = lp === 'mom' ? 'MOM: pro-rated in the first year (' + momAl(f.st.value) + ' days for their years of service), sick leave 5 → 14 days over months 3 to 6.' : lp === 'monthly' ? 'Nothing for 3 months, then 1 day per month of service up to the yearly number; sick leave follows MOM.' : 'These numbers apply every year.';
        };
        hint(); ['st', 'sk', 'om', 'lp'].forEach(function(id){ if(f[id]) f[id].addEventListener('change', hint); });
        sh.addEventListener('click', function(x){
          var a = x.target.closest('[data-addline]'); if(a){ var box = sh.querySelector('#' + a.dataset.addline); box.insertAdjacentHTML('beforeend', lineRow({})); box.lastChild.querySelector('input').focus(); }
          var rm = x.target.closest('[data-rmline]'); if(rm) rm.parentNode.remove();
        });
        var read = function(id){ var box = sh.querySelector('#' + id); return box ? Array.prototype.map.call(box.querySelectorAll('.lrow'), function(rw){ var i = rw.querySelectorAll('input'); return {label: i[0].value, amount: i[1].value}; }) : undefined; };
        f.onsubmit = function(x){ x.preventDefault(); var dn = busy(f.querySelector('.btn'));
          var o = {isNew: isNew, username: isNew ? f.un.value : s.username, name: f.nm.value, team: f.tm.value, role: f.rl.value, jobTitle: f.jt.value, phone: f.ph.value, start: f.st.value, end: f.en.value,
            al: f.al.value, alCarried: f.ac.value, sl: f.sl.value, hl: f.hl.value, passType: f.pt.value, skill: f.sk2.value, permitIssued: f.pi.value, passExpiry: f.pe.value, passportExpiry: f.pp.value, hygieneExpiry: f.fh.value,
            address: f.ad.value, emergencyContact: f.ec.value, emergencyPhone: f.ep.value, notes: f.no.value, active: isNew ? true : f.ac2.checked,
            clockIn: f.ci.checked, offPerMonth: f.sk.value === 'off' ? f.op.value : 0, week: f.sk.value === 'week' ? [0,1,2,3,4,5,6].map(function(i){ return f['pw' + i].value; }).join(',') : '', leavePolicy: f.lp.value};
          if(admin){ o.phOff = f.pho.value; o.ot = f.om.value; o.fixedOt = f.fo.value; o.basic = f.bs.value; o.allowances = read('alw'); o.deductions = read('ded'); o.bankName = f.bn.value; o.bankAccount = f.ba.value; o.accountName = f.an.value; }
          else { o.phOff = s.phOff; o.skill = s.skill; o.permitIssued = s.permitIssued; o.ot = s.ot; o.fixedOt = s.fixedOt; o.basic = s.basic; o.allowances = s.allowances; o.deductions = s.deductions; o.bankName = s.bankName; o.bankAccount = s.bankAccount; o.accountName = s.accountName; }
          KK.post('staffSave', o).then(function(res){ dn();
            if(!res.ok){ sh.querySelector('#m').innerHTML = '<div class="msg bad">' + e(res.error) + '</div>'; return; }
            close();
            if(res.temp) sheet('Give these to ' + o.name.split(' ')[0], '<div class="card"><div class="kv"><span>App link</span><b>' + e(location.origin + location.pathname) + '</b><span>Username</span><b>' + e(res.username) + '</b><span>Temporary password</span><b style="font-size:20px;letter-spacing:.05em">' + e(res.temp) + '</b></div></div><p class="hint">They\'ll pick their own password the first time they log in. This password isn\'t shown again.</p>');
            else toast('Saved');
            viewStaff();
          }); };
        var iw = sh.querySelector('#issue'); if(iw) iw.onclick = function(){ close(); warningForm(s, '', viewStaff); };
        sh.querySelectorAll('[data-wd]').forEach(function(b){ b.onclick = function(){ close(); confirmSheet('Withdraw this warning?', 'It no longer counts towards the 2 and disappears from their app. It stays in the activity log.', 'Withdraw', function(){
          KK.post('warningWithdraw', {id: b.dataset.wd}).then(function(x){ if(!x.ok) return toast(x.error, true); toast('Withdrawn'); viewStaff(); }); }, true); }; });
        var rs = sh.querySelector('#rs');
        if(rs) rs.onclick = function(){ KK.post('staffReset', {username: s.username}).then(function(x){ if(!x.ok) return toast(x.error, true); close(); sheet('New temporary password', '<div class="card"><div class="kv"><span>Username</span><b>' + e(s.username) + '</b><span>Password</span><b style="font-size:20px">' + e(x.temp) + '</b></div></div><p class="hint">They\'re logged out everywhere and must set a new password when they log in.</p>'); }); };
      });
  }
  function lineRow(l){ return '<div class="lrow"><input placeholder="e.g. Meal allowance" value="' + e(l.label || '') + '" aria-label="What it is"><input type="number" step="0.01" min="0" placeholder="$" value="' + e(l.amount || '') + '" aria-label="Amount"><button type="button" data-rmline aria-label="Remove">✕</button></div>'; }

  // ---------------------------------------------------------------- admin: settings
  function viewSettings(){
    loading();
    Promise.all([KK.post('settingsGet'), KK.post('staff'), KK.post('cleaning')]).then(function(rs){
      var r = rs[0], staff = rs[1].staff || [], ck = rs[2].items || [];
      if(!r.ok) return fail(r);
      var v = {}, help = {}; r.settings.forEach(function(s){ v[s.key] = s.value; help[s.key] = s.help; });
      var week = String(v['Work week']).split(','), D = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      var fld = function(k, type, extra){ return '<label class="f" for="s_' + k.replace(/\W/g, '') + '">' + e(k) + '</label><input id="s_' + k.replace(/\W/g, '') + '" data-k="' + e(k) + '" type="' + (type || 'text') + '" value="' + e(v[k]) + '"' + (extra || '') + '>' + (help[k] ? '<div class="hint">' + e(help[k]) + '</div>' : ''); };
      var set_ = v['Kitchen latitude'] !== '' && v['Kitchen latitude'] != null;
      var html = '<a class="back" href="#more">‹ More</a><div class="ptitle">Settings</div>' +
        '<div class="card"><h2>Kitchen location</h2>' + (set_ ? '<p><span class="chip ok">Set</span> ' + e(v['Kitchen latitude']) + ', ' + e(v['Kitchen longitude']) + ' · <a href="https://www.google.com/maps?q=' + encodeURIComponent(v['Kitchen latitude'] + ',' + v['Kitchen longitude']) + '" target="_blank" rel="noopener">check on Google Maps</a></p>' : '<p class="msg warn">Not set. Nobody can clock in yet.</p>') +
        '<p class="hint">Stand inside the Mandai kitchen with your phone and tap the button. Do it once; redo it only if the kitchen moves.</p><div id="lm"></div><button class="btn" style="margin-top:12px" id="here">Use my current location</button>' +
        fld('Clock-in radius (m)', 'number', ' min="30" max="1000"') + '</div>' +
        '<div class="card"><h2>Work rules</h2>' + fld('Start time', 'time') + fld('Late after (min)', 'number', ' min="0"') + fld('Absent after (min)', 'number', ' min="15"') +
        fld('Unpaid break (min)', 'number', ' min="0"') + fld('Overtime blocks (min)', 'number', ' min="0" max="60"') +
        '<label class="f">Work week</label><div class="weekpick">' + D.map(function(d, i){ return '<div><label for="w' + i + '">' + d + '</label><select id="w' + i + '" data-w="' + i + '"><option value="1">Full</option><option value="0.5">Half</option><option value="0">Off</option></select></div>'; }).join('') + '</div>' +
        '<div class="hint" id="wkh"></div><label class="f" for="rest">Rest day</label><select id="rest">' + D.map(function(d){ return '<option>' + d + '</option>'; }).join('') + '</select><div class="hint">' + e(help['Rest day']) + '</div></div>' +
        '<div class="card"><h2>Leave & payroll</h2>' + fld('Minimum kitchen staff', 'number', ' min="0"') + fld('Leave warning (days)', 'number', ' min="0"') + fld('Pay day', 'number', ' min="1" max="7"') +
        fld('Expiry warning (days)', 'number', ' min="0"') + fld('Company name') + fld('Kitchen name') + '</div>' +
        '<div class="card"><h2>Foreign worker levy</h2><p class="msg ok" style="margin-top:4px">Now: ' + e(r.levy.sector) + ' tier ' + r.levy.tier + ' · ' + r.levy.foreign + ' work pass holders of ' + nd(r.levy.total) + ' staff (' + r.levy.ratio + '%) · Work Permit $' + r.levy.wpBasic + ' basic / $' + r.levy.wpHigher + ' higher-skilled · S Pass $' + r.levy.sPass + '</p>' +
          '<label class="f" for="s_MOMsector">MOM sector</label><select id="s_MOMsector" data-k="MOM sector"><option>Manufacturing</option><option>Services</option></select><div class="hint">' + e(help['MOM sector']) + '</div>' +
          fld('Local employees', 'number', ' min="0" step="0.5"') + fld('Other work pass holders', 'number', ' min="0"') + fld('Levy override per Work Permit', 'number', ' min="0" step="1"') + '</div>' +
        '<div class="card"><h2>Production</h2><label class="f" for="s_Productionbackup">Production backup</label><select id="s_Productionbackup" data-k="Production backup"><option value="">Nobody (managers and admins only)</option>' +
          staff.filter(function(x){ return x.active && x.role === 'staff'; }).map(function(x){ return '<option value="' + e(x.username) + '"' + (String(v['Production backup']) === x.username ? ' selected' : '') + '>' + e(x.name) + '</option>'; }).join('') + '</select><div class="hint">' + e(help['Production backup']) + '</div>' +
          fld('Batch code prefix', 'text', ' maxlength="8"') + fld('Shelf life (days)', 'number', ' min="0"') + '</div>' +
        '<div class="card"><h2>Stock</h2>' + fld('Stock take days', 'text', ' placeholder="Mon, Wed, Fri"') +
          '<label class="f" for="s_Stocktakebackup">Stock take backup</label><select id="s_Stocktakebackup" data-k="Stock take backup"><option value="">Nobody</option>' +
          staff.filter(function(x){ return x.active && x.role === 'staff'; }).map(function(x){ return '<option value="' + e(x.username) + '"' + (String(v['Stock take backup']) === x.username ? ' selected' : '') + '>' + e(x.name) + '</option>'; }).join('') + '</select><div class="hint">' + e(help['Stock take backup']) + '</div>' +
          '<label class="f" for="s_Purchasingadmin">Purchasing admin</label><select id="s_Purchasingadmin" data-k="Purchasing admin"><option value="">Both</option>' +
          [['jay','Jay'],['hazel','Hazel']].concat(staff.filter(function(x){ return x.role === 'admin' && ['jay','hazel'].indexOf(x.username) < 0; }).map(function(x){ return [x.username, x.name]; })).map(function(x){ return '<option value="' + e(x[0]) + '"' + (String(v['Purchasing admin']) === x[0] ? ' selected' : '') + '>' + e(x[1]) + '</option>'; }).join('') + '</select><div class="hint">' + e(help['Purchasing admin']) + '</div>' +
          fld('Price tolerance (%)', 'number', ' min="0" step="0.5"') + fld('Order buffer (days)', 'number', ' min="0"') +
          '<label class="f" for="s_StockcostincludesGST">Stock cost includes GST</label><select id="s_StockcostincludesGST" data-k="Stock cost includes GST"><option>No</option><option>Yes</option></select><div class="hint">' + e(help['Stock cost includes GST']) + '</div>' +
          '<label class="f" for="akey">Claude API key (reads invoices)</label><div style="display:flex;gap:8px"><input id="akey" type="password" autocomplete="off" placeholder="' + (r.keySet ? '✓ Saved. Paste a new one to replace it' : 'sk-ant-…') + '"><button type="button" class="btn ghost sm" id="akeys" style="white-space:nowrap;width:auto;flex:0 0 auto">Save key</button></div>' +
          '<div class="hint">From console.anthropic.com → API keys. Stored on the server only; each invoice costs a few cents.</div></div>' +
        '<div class="card"><h2>Cleaning checklist</h2>' + ['Cleaning IC', 'Cleaning backup', 'Weekend cleaning IC'].map(function(k){
          return '<label class="f" for="s_' + k.replace(/\W/g, '') + '">' + k + '</label><select id="s_' + k.replace(/\W/g, '') + '" data-k="' + k + '"><option value="">Nobody</option>' +
            staff.filter(function(x){ return x.team === 'production' && x.active; }).map(function(x){ return '<option value="' + e(x.username) + '"' + (String(v[k]) === x.username ? ' selected' : '') + '>' + e(x.name) + '</option>'; }).join('') + '</select><div class="hint">' + e(help[k]) + '</div>'; }).join('') +
          '<button type="button" class="btn ghost sm" style="margin-top:12px" id="cked">Edit the ' + ck.length + ' cleaning spots</button></div>' +
        '<div id="m"></div><button class="btn" style="margin-top:14px" id="save">Save settings</button>' +
        '<div class="h2">Public holidays</div><p class="hint">Check MOM\'s list each year. Add the observed day when a holiday falls on a Sunday.</p>' +
        r.holidays.map(function(h){ return '<div class="row"><div class="rt"><b>' + e(h.name) + '</b><small>' + e(niceY(h.date)) + '</small></div><button class="btn ghost sm" data-hd="' + e(h.date) + '">Remove</button></div>'; }).join('') +
        '<form class="card" id="hf"><div class="row2"><div><label class="f" for="hd">Date</label><input id="hd" type="date" required></div><div><label class="f" for="hn">Holiday</label><input id="hn" required maxlength="60"></div></div><button class="btn ghost" style="margin-top:12px">Add holiday</button></form>';
      page('more', html);
      D.forEach(function(d, i){ document.getElementById('w' + i).value = String(Number(week[i]) || 0); });
      document.getElementById('rest').value = String(v['Rest day']).slice(0, 3);
      document.getElementById('s_MOMsector').value = v['MOM sector'] || 'Manufacturing';
      document.getElementById('s_StockcostincludesGST').value = /^y/i.test(String(v['Stock cost includes GST'])) ? 'Yes' : 'No';
      document.getElementById('akeys').onclick = function(){ var b = this, k = document.getElementById('akey').value.trim(); if(!k) return toast('Paste the key first.', true);
        var dn = busy(b); KK.post('stockKeySave', {key: k}).then(function(x){ dn(); if(!x.ok) return toast(x.error, true); toast('Key saved'); document.getElementById('akey').value = ''; document.getElementById('akey').placeholder = '✓ Saved. Paste a new one to replace it'; }); };
      var wk = function(){ var n = 0; for(var i = 0; i < 7; i++) n += Number(document.getElementById('w' + i).value);
        document.getElementById('wkh').innerHTML = nd(n) + ' working days a week. ' + e(help['Work week'] || ''); };
      app.querySelectorAll('[data-w]').forEach(function(x){ x.addEventListener('change', wk); }); wk();
      var collect = function(){ var o = {}; app.querySelectorAll('[data-k]').forEach(function(x){ o[x.dataset.k] = x.value; }); var w = []; for(var i = 0; i < 7; i++) w.push(document.getElementById('w' + i).value); o['Work week'] = w.join(','); o['Rest day'] = document.getElementById('rest').value; return o; };
      document.getElementById('save').onclick = function(){ var b = this, dn = busy(b); KK.post('settingsSave', {values: collect()}).then(function(x){ dn(); if(!x.ok){ document.getElementById('m').innerHTML = '<div class="msg bad">' + e(x.error) + '</div>'; return; } toast('Settings saved'); viewSettings(); }); };
      document.getElementById('here').onclick = function(){ var b = this, dn = busy(b, 'Finding you…');
        var get = KK.DEMO ? KK.demo().then(function(d){ return {lat: d.KITCHEN.lat, lng: d.KITCHEN.lng, acc: 10}; }) : KK.locate();
        get.then(function(loc){
          if(loc.acc > 60){ dn(); document.getElementById('lm').innerHTML = '<div class="msg warn">Your location is only accurate to ±' + Math.round(loc.acc) + 'm. Turn on Precise Location, wait a few seconds and try again.</div>'; return; }
          var o = collect(); o['Kitchen latitude'] = loc.lat.toFixed(6); o['Kitchen longitude'] = loc.lng.toFixed(6);
          KK.post('settingsSave', {values: o}).then(function(x){ dn(); if(!x.ok) return toast(x.error, true); toast('Kitchen location saved'); viewSettings(); });
        }, function(err){ dn(); document.getElementById('lm').innerHTML = '<div class="msg bad">' + e(err) + '</div>'; });
      };
      document.getElementById('cked').onclick = function(){ checklistEditor(ck); };
      on(app, '[data-hd]', 'click', function(b){ KK.post('holidayDelete', {date: b.dataset.hd}).then(function(){ viewSettings(); }); });
      var hf = document.getElementById('hf');
      hf.onsubmit = function(x){ x.preventDefault(); KK.post('holidaySave', {date: hf.hd.value, name: hf.hn.value}).then(function(res){ if(!res.ok) return toast(res.error, true); toast('Added'); viewSettings(); }); };
    });
  }

  function checklistEditor(items){
    var row = function(it){ return '<div class="ckrow" data-id="' + e(it.id || '') + '"><div class="row2"><input value="' + e(it.area || '') + '" placeholder="Room" aria-label="Room"><input value="' + e(it.item || '') + '" placeholder="Spot" aria-label="Spot"></div>' +
      '<input value="' + e(it.detail || '') + '" placeholder="What clean looks like" aria-label="What clean looks like" style="margin-top:6px"><div class="ckbtns"><button type="button" data-ckup aria-label="Move up">↑</button><button type="button" data-ckdn aria-label="Move down">↓</button><button type="button" data-ckrm aria-label="Remove">Remove</button></div></div>'; };
    sheet('Cleaning spots', '<p class="hint">One photo per spot at clock-out. Changes apply from the next photo taken.</p><div id="cl">' + items.map(row).join('') + '</div>' +
      '<button type="button" class="linkbtn" id="ckadd">＋ Add a spot</button><div id="m"></div><button class="btn" style="margin-top:12px" id="cksave">Save checklist</button>', function(sh, close){
      var cl = sh.querySelector('#cl');
      sh.querySelector('#ckadd').onclick = function(){ cl.insertAdjacentHTML('beforeend', row({})); cl.lastChild.querySelector('input').focus(); };
      cl.addEventListener('click', function(x){ var r = x.target.closest('.ckrow'); if(!r) return;
        if(x.target.closest('[data-ckrm]')) r.remove(); else if(x.target.closest('[data-ckup]') && r.previousElementSibling) cl.insertBefore(r, r.previousElementSibling);
        else if(x.target.closest('[data-ckdn]') && r.nextElementSibling) cl.insertBefore(r.nextElementSibling, r); });
      sh.querySelector('#cksave').onclick = function(){ var b = this, d = busy(b);
        var list = Array.prototype.map.call(cl.querySelectorAll('.ckrow'), function(r){ var i = r.querySelectorAll('input'); return {id: r.dataset.id, area: i[0].value, item: i[1].value, detail: i[2].value}; });
        KK.post('checklistSave', {items: list}).then(function(x){ d(); if(!x.ok){ sh.querySelector('#m').innerHTML = '<div class="msg bad">' + e(x.error) + '</div>'; return; } close(); toast('Checklist saved: ' + x.items.length + ' spots'); viewSettings(); }); };
    });
  }

  // ---------------------------------------------------------------- admin: more & audit
  function viewMore(){
    page('more', demoBar() + '<div class="ptitle">More</div><div class="menu">' +
      [['production','Production','Daily quota, what was made, orders & events'],['staff','Staff','Add people, pay, leave, documents, bank changes'],['notices','Notices','Post "today is stock take day" and more'],['sops','SOPs','Kitchen instructions with photos and videos'],['setup','Settings','Kitchen location, hours, holidays'],['audit','Activity log','Who changed what'],['me','My details','Password, log out']]
        .map(function(m){ return '<a href="#' + m[0] + '"><span>' + m[1] + '<small style="display:block;font-weight:600;color:var(--muted);font-size:13px;margin-top:2px">' + m[2] + '</small></span><span class="chev2">›</span></a>'; }).join('') + '</div>');
    bindDemo();
  }
  function viewAudit(){
    loading();
    KK.post('audit').then(function(r){
      if(!r.ok) return fail(r);
      page('more', '<a class="back" href="#more">‹ More</a><div class="ptitle">Activity log</div><div class="card" style="padding:6px 14px">' + r.rows.map(function(x){
        return '<div class="ln" style="display:block"><b style="font-weight:800">' + e(x.action) + '</b> · ' + e(x.by) + '<div class="hint" style="margin:2px 0 0">' + e(x.at.slice(0, 16)) + (x.details ? ' · ' + e(x.details) : '') + '</div></div>'; }).join('') + '</div>');
    });
  }

  // ---------------------------------------------------------------- cleaning checklist (staff on cleaning today)
  function viewCleaning(){
    loading();
    KK.post('cleaning').then(function(r){
      if(!r.ok) return fail(r);
      var who = r.mode === 'weekend' ? r.whoName + ' (weekend cleaning IC)' : r.mode === 'ic' ? r.whoName + ' (cleaning IC)' : r.mode === 'backup' ? r.whoName + ' (backup, IC is away)' : 'the last person to clock out';
      var html = '<a class="back" href="#' + (isMgr() ? 'attendance' : 'home') + '">‹ Back</a><div class="ptitle">Cleaning checklist</div><div class="sub2">' + e(r.dateLabel) + ' · done by ' + e(who) + '</div>' +
        '<div class="card"><div style="display:flex;align-items:baseline;gap:8px"><b style="font-family:\'Baloo 2\',sans-serif;font-size:30px">' + r.count + ' of ' + r.total + '</b><span class="hint" style="margin:0">photos</span></div>' +
        '<div class="bar2 big"><i style="width:' + Math.round(100 * r.count / Math.max(1, r.total)) + '%"></i></div>' +
        (r.status === 'done' ? '<div class="msg ok">All done ✓ by ' + e(r.doneBy) + ' at ' + e(r.at) + '. You can clock out.</div>' : r.status === 'skipped' ? '<div class="msg warn">Closed without finishing. Jay and Hazel have been told.</div>' : r.mine ? '<p class="hint">Take a photo of each spot after cleaning it. Show the whole spot, close enough to see it\'s clean.</p>' : '<p class="hint">Only the person on cleaning can add photos today.</p>') + '</div>';
      var area = '';
      r.items.forEach(function(it){
        if(it.area !== area){ area = it.area; html += '<div class="h2">' + e(area) + '</div>'; }
        html += '<div class="spot' + (it.photo ? ' done' : '') + '">' + (it.photo ? '<img src="' + e(it.photo) + '" alt="' + e(it.item) + '" loading="lazy">' : '<span class="num" aria-hidden="true">📷</span>') +
          '<div class="rt"><b>' + e(it.item) + '</b><small>' + e(it.detail) + (it.photo ? ' · ' + e(it.by) + ' ' + e(it.at) : '') + '</small></div>' +
          (r.mine && r.status !== 'done' && r.status !== 'skipped' ? '<label class="btn sm' + (it.photo ? ' ghost' : '') + '">' + (it.photo ? 'Retake' : 'Photo') + '<input type="file" accept="image/*" capture="environment" data-item="' + e(it.id) + '" hidden></label>' : '') + '</div>';
      });
      if(r.mine && !r.status) html += '<button class="btn ghost" style="margin-top:18px" id="skip">Can\'t finish it today?</button>';
      page(isMgr() ? 'attendance' : 'home', html);
      on(app, 'input[data-item]', 'change', function(inp){
        var f = inp.files[0]; if(!f) return;
        var lab = inp.parentNode; lab.firstChild.textContent = 'Uploading…';
        KK.shrink(f, 1280, 0.72).then(function(photo){ return KK.post('cleaningPhoto', {itemId: inp.dataset.item, photo: photo}); }).then(function(x){
          if(!x.ok){ toast(x.error, true); lab.firstChild.textContent = 'Photo'; return; }
          if(x.status === 'done') toast('All ' + x.total + ' done. You can clock out now.'); viewCleaning();
        }, function(){ toast('That photo didn\'t work. Try again.', true); lab.firstChild.textContent = 'Photo'; });
      });
      var sk = document.getElementById('skip');
      if(sk) sk.onclick = function(){
        sheet('Close without finishing', '<form id="kf"><p class="hint">Jay and Hazel will see this straight away.</p><label class="f" for="rs">What happened?</label><textarea id="rs" required maxlength="300" placeholder="e.g. Mop broke, packing room floor not done"></textarea><div id="m"></div><button class="btn red" style="margin-top:14px">Close checklist</button></form>', function(sh, close){
          var f = sh.querySelector('#kf'); f.onsubmit = function(x){ x.preventDefault(); KK.post('cleaningSkip', {reason: f.rs.value}).then(function(res){ if(!res.ok){ sh.querySelector('#m').innerHTML = '<div class="msg bad">' + e(res.error) + '</div>'; return; } close(); toast('Sent to Jay & Hazel'); viewCleaning(); }); };
        });
      };
    });
  }

  // ---------------------------------------------------------------- SOP library
  function viewSops(){
    loading();
    KK.post('sops').then(function(r){
      if(!r.ok) return fail(r);
      badgeCache.sops = r.unread;
      state.sops = r.sops;
      var html = (isAdmin() ? '<a class="back" href="#more">‹ More</a>' : '') + '<div class="ptitle">SOPs</div><div class="sub2">How we do things in the kitchen</div>' +
        (r.canEdit ? '<button class="btn" style="margin-top:12px" id="new">＋ New SOP</button>' : '');
      var cat = '';
      r.sops.forEach(function(s, i){
        if(s.category !== cat){ cat = s.category; html += '<div class="h2">' + e(cat) + '</div>'; }
        html += '<a class="row" href="#sop" data-i="' + i + '"' + (s.active ? '' : ' style="opacity:.55"') + '><div class="rt"><b>' + e(s.title) + '</b><small>' + (s.media.length ? s.media.length + ' photo/video · ' : '') + 'updated ' + e(nice(s.updated)) + '</small></div>' +
          (!s.active ? '<span class="chip">Archived</span>' : s.mustRead && !s.read ? '<span class="chip pink">' + (s.version > 1 ? 'Updated' : 'New') + '</span>' : s.read ? '<span class="chip ok">✓ Read</span>' : '') +
          (r.canEdit ? '<span class="mv"><button data-up="' + e(s.id) + '" aria-label="Move up">↑</button><button data-dn="' + e(s.id) + '" aria-label="Move down">↓</button></span>' : '') + '<span class="chev2">›</span></a>';
      });
      if(!r.sops.length) html += '<div class="empty">No SOPs yet.</div>';
      page(isAdmin() ? 'more' : 'sops', html);
      on(app, '[data-i]', 'click', function(a, x){ if(x.target.closest('.mv')) return; x.preventDefault(); state.sop = r.sops[+a.dataset.i]; go('sop'); });
      on(app, '[data-up],[data-dn]', 'click', function(b, x){ x.preventDefault(); x.stopPropagation(); KK.post('sopMove', {id: b.dataset.up || b.dataset.dn, dir: b.dataset.up ? 'up' : 'down'}).then(viewSops); });
      var nb = document.getElementById('new'); if(nb) nb.onclick = function(){ sopForm(null); };
    });
  }
  function viewSop(){
    var s = state.sop; if(!s) return go('sops');
    var html = '<a class="back" href="#sops">‹ SOPs</a><div class="sub2" style="margin-top:6px">' + e(s.category) + '</div><div class="ptitle" style="margin-top:2px">' + e(s.title) + '</div>' +
      '<div class="hint">Updated ' + e(nice(s.updated)) + ' by ' + e(s.by) + (s.version > 1 ? ' · version ' + s.version : '') + '</div>' +
      '<div class="card rich">' + (rich(s.body) || '<p class="hint">Nothing written yet.</p>') + '</div>' + s.media.map(media).join('') +
      (!isAdmin() && s.mustRead ? (s.read ? '<div class="msg ok">✓ You\'ve read this version</div>' : '<button class="btn" style="margin-top:14px" id="read">I\'ve read and understood this</button>') : '') +
      (isAdmin() ? '<div class="btns"><button class="btn ghost" id="who">Who\'s read it</button><button class="btn" id="edit">Edit</button></div>' : '');
    page(isAdmin() ? 'more' : 'sops', html);
    var rd = document.getElementById('read');
    if(rd) rd.onclick = function(){ var d = busy(rd, '…'); KK.post('sopRead', {id: s.id}).then(function(x){ d(); if(!x.ok) return toast(x.error, true); s.read = true; toast('Thanks'); viewSop(); }); };
    var ed = document.getElementById('edit'); if(ed) ed.onclick = function(){ sopForm(s); };
    var wh = document.getElementById('who');
    if(wh) wh.onclick = function(){ KK.post('sopReaders', {id: s.id}).then(function(x){ if(!x.ok) return toast(x.error, true);
      sheet('Who\'s read it', '<div class="h2">Read this version (' + x.read.length + ')</div>' + (x.read.map(function(p){ return '<div class="row"><div class="rt"><b>' + e(p.name) + '</b></div><small>' + e(p.at) + '</small></div>'; }).join('') || '<div class="empty">Nobody yet.</div>') +
        '<div class="h2">Not yet (' + x.notRead.length + ')</div>' + (x.notRead.map(function(n){ return '<div class="row"><div class="rt"><b>' + e(n) + '</b></div></div>'; }).join('') || '<div class="empty">Everyone has read it.</div>')); }); };
  }
  function sopForm(s){
    var isNew = !s; s = s || {category: '', title: '', body: '', mustRead: true, team: 'production', media: [], active: true};
    var cats = (state.sops || []).map(function(x){ return x.category; }).filter(function(c, i, a){ return a.indexOf(c) === i; });
    sheet(isNew ? 'New SOP' : 'Edit SOP', '<form id="sf"><label class="f" for="ti">Title</label><input id="ti" required maxlength="120" value="' + e(s.title) + '" placeholder="e.g. Fryer oil change">' +
      '<label class="f" for="ca">Category</label><input id="ca" list="cats" maxlength="40" value="' + e(s.category) + '" placeholder="e.g. Safety"><datalist id="cats">' + cats.map(function(c){ return '<option value="' + e(c) + '">'; }).join('') + '</datalist>' +
      '<label class="f" for="bo">Steps</label><textarea id="bo" style="min-height:180px" placeholder="Write each step on its own line starting with &quot;- &quot;. **Bold** for anything critical.">' + e(s.body) + '</textarea>' +
      '<label class="f" for="tm">Who sees it</label><select id="tm"><option value="production">Kitchen staff</option><option value="all">Everyone</option><option value="events">Event crew</option></select>' +
      '<label class="check"><input type="checkbox" id="mr"' + (s.mustRead ? ' checked' : '') + '> Staff must tap "I\'ve read this"</label>' +
      (isNew ? '' : '<label class="check"><input type="checkbox" id="rr"> I changed something important: everyone must read it again</label><label class="check"><input type="checkbox" id="ar"' + (s.active ? '' : ' checked') + '> Archive (hide from staff)</label>') +
      '<div id="m"></div><button class="btn" style="margin-top:14px">' + (isNew ? 'Save, then add photos & videos' : 'Save') + '</button></form>' +
      (isNew ? '' : '<div class="h2">Photos & videos</div><div id="ml">' + mediaList(s) + '</div>' +
        '<div class="card"><label class="btn ghost sm" style="display:block;text-align:center">＋ Upload photo or video<input type="file" id="up" accept="image/*,video/*" hidden></label>' +
        '<label class="f" for="cp">Caption (optional)</label><input id="cp" maxlength="120" placeholder="e.g. Correct hairnet position">' +
        '<div class="hint">Videos up to 25 MB. Longer ones: upload to Google Drive (Anyone with the link) or YouTube (Unlisted) and paste the link.</div>' +
        '<label class="f" for="ln">Or paste a link</label><div style="display:flex;gap:8px"><input id="ln" type="url" placeholder="https://"><button type="button" class="btn sm" id="addln">Add</button></div><div id="mm"></div></div>'),
      function(sh, close){
        var f = sh.querySelector('#sf'); f.tm.value = s.team || 'production';
        f.onsubmit = function(x){ x.preventDefault(); var d = busy(f.querySelector('.btn'));
          KK.post('sopSave', {id: s.id, title: f.ti.value, category: f.ca.value, body: f.bo.value, team: f.tm.value, mustRead: f.mr.checked, reread: f.rr && f.rr.checked, active: !(f.ar && f.ar.checked)}).then(function(res){ d();
            if(!res.ok){ sh.querySelector('#m').innerHTML = '<div class="msg bad">' + e(res.error) + '</div>'; return; }
            close(); toast('Saved');
            KK.post('sops').then(function(l){ state.sops = l.sops; var n = l.sops.filter(function(x){ return x.id === res.id; })[0]; state.sop = n; if(isNew) sopForm(n); if(location.hash === '#sop') viewSop(); else viewSops(); });
          });
        };
        if(isNew) return;
        var mm = sh.querySelector('#mm'), cap = sh.querySelector('#cp');
        var after = function(res){ if(!res.ok){ mm.innerHTML = '<div class="msg bad">' + e(res.error) + '</div>'; return; } mm.innerHTML = ''; s = res.sop; state.sop = s; cap.value = ''; sh.querySelector('#ml').innerHTML = mediaList(s); if(location.hash === '#sop') viewSopKeepSheet(); };
        sh.querySelector('#up').onchange = function(){ var file = this.files[0]; if(!file) return; mm.innerHTML = '<div class="msg warn">Uploading ' + e(file.name) + '…</div>';
          readFile(file, 25).then(function(data){ return KK.post('sopMediaAdd', {id: s.id, data: data, caption: cap.value}); }).then(after, function(err){ mm.innerHTML = '<div class="msg bad">' + e(err.message) + '</div>'; }); this.value = ''; };
        sh.querySelector('#addln').onclick = function(){ KK.post('sopMediaAdd', {id: s.id, link: sh.querySelector('#ln').value, caption: cap.value}).then(function(res){ if(res.ok) sh.querySelector('#ln').value = ''; after(res); }); };
        sh.addEventListener('click', function(x){ var b = x.target.closest('[data-rmm]'); if(b) KK.post('sopMediaRemove', {id: s.id, index: +b.dataset.rmm}).then(after); });
      });
  }
  function viewSopKeepSheet(){ var sc = document.querySelector('.scrim'); if(sc) sc.remove(); viewSop(); sopForm(state.sop); }
  function mediaList(s){ return s.media.length ? s.media.map(function(m, i){ return '<div class="row"><div class="rt"><b>' + e(m.type === 'image' ? 'Photo' : m.type === 'video' ? 'Video' : 'Link') + '</b><small>' + e(m.caption || m.url.slice(0, 60)) + '</small></div><button type="button" class="btn ghost sm" data-rmm="' + i + '">Remove</button></div>'; }).join('') : '<div class="empty">None yet.</div>'; }

  // ---------------------------------------------------------------- admin: incidents & cleaning log (inside Time)
  function incidentsHtml(list){
    var open = list.filter(function(i){ return !i.reviewed; }), done = list.filter(function(i){ return i.reviewed; });
    var row = function(i){
      var what = i.kind === 'absent' ? 'Absent: no clock-in, no leave' : i.kind === 'very late' ? i.minutes + ' min late (counts as absence; time missed is deducted)' : i.minutes + ' min late';
      return '<div class="lcard' + (i.kind !== 'late' ? ' short' : '') + '"><div class="top2"><b>' + e(i.name) + '</b><span class="chip ' + (i.kind === 'late' ? 'warn' : 'bad') + '">' + e(i.kind === 'very late' ? 'Over 1 hour late' : i.kind === 'absent' ? 'Absent' : 'Late') + '</span>' +
        (i.warnings ? '<span class="chip bad">' + i.warnings + ' warning' + (i.warnings > 1 ? 's' : '') + ' already</span>' : '') + '</div><div class="meta">' + e(i.label) + ' · ' + e(what) + '</div>' +
        (i.reviewed ? '<div class="meta">✓ ' + e(i.outcome) + ' · ' + e(i.reviewedBy) + '</div>' : '<div class="btns"><button class="btn ghost" data-note="' + e(i.key) + '">Noted</button>' + (isAdmin() ? '<button class="btn" data-warn="' + e(i.key) + '">Issue warning</button>' : '') + '</div>') + '</div>';
    };
    return '<p class="hint">Late more than the grace time, over an hour late, or absent without leave. Mark each one once you\'ve dealt with it.</p>' +
      (open.length ? open.map(row).join('') : '<div class="clear" style="font-size:15px">Nothing to deal with.</div>') +
      (done.length ? '<div class="sec" id="dn"><div class="sec-head" role="button" tabindex="0"><span class="sec-name">Dealt with (last 31 days)</span><span class="sec-count">' + done.length + '</span><span class="chev">›</span></div><div class="sec-body" style="padding:0 12px 10px">' + done.map(row).join('') + '</div></div>' : '');
  }
  function cleaningHtml(r){
    return r.days.map(function(d, i){
      var st = d.status === 'done' ? '<span class="chip ok">Done</span>' : d.status === 'skipped' ? '<span class="chip warn">Skipped</span>' : d.status === 'in progress' ? '<span class="chip">In progress</span>' : '<span class="chip bad">Not done</span>';
      return '<a class="row" href="#" data-cd="' + i + '"><div class="rt"><b>' + e(d.label) + ' ' + st + '</b><small>' + d.count + ' of ' + d.total + ' photos' + (d.by ? ' · ' + e(d.by) + (d.at ? ' ' + e(d.at) : '') : '') + (d.reason ? ' · "' + e(d.reason) + '"' : '') + '</small></div><span class="chev2">›</span></a>';
    }).join('') || '<div class="empty">No working days yet this month.</div>';
  }
  function warningForm(staff, incidentKey, done){
    sheet('Warning letter for ' + staff.name.split(' ')[0], '<form id="wf"><p class="hint">This will be warning ' + ((staff.warnings || []).length + 1) + '. They\'ll see it on their app and must tap "I\'ve read this".</p>' +
      '<label class="f" for="wd">Date on the letter</label><input id="wd" type="date" required value="' + KK.ymd() + '">' +
      '<label class="f" for="wr">Reason (as written on the letter)</label><textarea id="wr" required maxlength="600"></textarea>' +
      '<label class="f" for="wl">Signed letter (photo or PDF)</label><input id="wl" type="file" accept="image/*,application/pdf" required><div class="hint">The letter stays private in your Google Drive. Staff see the date and reason.</div>' +
      '<div id="m"></div><button class="btn red" style="margin-top:14px">Issue warning</button></form>', function(sh, close){
      var f = sh.querySelector('#wf');
      f.onsubmit = function(x){ x.preventDefault(); var d = busy(f.querySelector('.btn'), 'Uploading…'), file = f.wl.files[0];
        (file ? readFile(file, 8) : Promise.resolve('')).then(function(letter){ return KK.post('warningSave', {username: staff.username, date: f.wd.value, reason: f.wr.value, letter: letter, incident: incidentKey || ''}); })
          .then(function(res){ d(); if(!res.ok){ sh.querySelector('#m').innerHTML = '<div class="msg bad">' + e(res.error) + '</div>'; return; } close(); toast('Warning ' + res.count + ' issued'); if(done) done(); },
                function(err){ d(); sh.querySelector('#m').innerHTML = '<div class="msg bad">' + e(err.message) + '</div>'; });
      };
    });
  }


  // ---------------------------------------------------------------- off days (staff who pick their own)
  function viewOffdays(){
    loading();
    KK.post('myOffdays').then(function(r){
      if(!r.ok) return fail(r);
      if(!r.perMonth) return go('home');
      var html = '<a class="back" href="#home">‹ Today</a><div class="ptitle">My off days</div><div class="sub2">Pick ' + r.perMonth + ' days a month. Tap a day to pick it, tap again to remove it.</div>';
      r.months.forEach(function(m){
        var first = m.days[0].dow, cells = '';
        for(var i = 0; i < first; i++) cells += '<span></span>';
        m.days.forEach(function(d){
          var cls = d.picked ? 'pk' : d.leave ? 'lv' : r.holidays[d.date] ? 'ph' : '';
          cells += '<button class="cd ' + cls + '" data-d="' + d.date + '"' + (d.past || d.date === r.today || d.leave ? ' disabled' : '') + ' aria-pressed="' + d.picked + '" aria-label="' + e(nice(d.date)) + (d.picked ? ', off day' : d.leave ? ', leave' : '') + '">' + d.d + '</button>';
        });
        html += '<div class="card"><div style="display:flex;align-items:baseline;gap:8px"><h2 style="margin:0;flex:1">' + e(monthLabel(m.period)) + '</h2><span class="chip ' + (m.picked >= r.perMonth ? 'ok' : 'warn') + '">' + m.picked + ' of ' + r.perMonth + ' picked</span></div>' +
          '<div class="cal"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>' + cells + '</div></div>';
      });
      html += '<div class="legend"><span><i class="c-dayoff"></i>Your off day</span><span><i class="c-leave"></i>Leave</span><span><i class="c-ph"></i>Public holiday</span></div><p class="hint">Off days must be picked before the day. If too few people would be in the kitchen, the app asks you to pick another day.</p>';
      page('home', html);
      on(app, '.cd', 'click', function(b){ b.disabled = true; KK.post('offdayToggle', {date: b.dataset.d}).then(function(x){ if(!x.ok){ toast(x.error, true); b.disabled = false; return; } viewOffdays(); }); });
    });
  }

  // ---------------------------------------------------------------- router
  var ROUTES = { login: viewLogin, home: viewHome, leave: viewLeave, payslips: viewPayslips, payslip: viewPayslip, notices: viewNotices, me: viewMe,
    admin: viewAdmin, 'leave-admin': viewLeaveAdmin, stock: viewStock, count: viewCount, deliveries: viewDeliveries, delivery: viewDelivery, reorder: viewReorder, stockcost: viewStockCost, stockitems: viewStockItems, production: viewProduction, quota: viewQuota, porders: viewOrders, plan: viewPlan, attendance: viewAttendance, payroll: viewPayroll, staff: viewStaff, setup: viewSettings, cleaning: viewCleaning, sops: viewSops, sop: viewSop, offdays: viewOffdays, more: viewMore, audit: viewAudit };
  var MGR = ['admin', 'attendance', 'staff', 'quota', 'porders', 'plan'], ADMIN = ['leave-admin', 'payroll', 'setup', 'more', 'audit', 'stockcost', 'stockitems'];
  // ================================================================ PRODUCTION (daily quota, what was made, big orders)
  function fmtN(n){ return Number(n || 0).toLocaleString('en-SG'); }
  function bar(pct, cls){ return '<div class="pbar' + (cls ? ' ' + cls : '') + '" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + Math.min(100, Math.max(0, pct)) + '%"></i></div>'; }
  // Today's quota as a card, for the kitchen home and the admin home
  function prodCard(p, title, noBatch){
    if(!p || (!p.cats.length && !p.orders.length)) return '';
    var html = '<div class="card prod"><div class="ph"><h2>' + e(title || 'Today\'s production') + '</h2>' + (noBatch ? '' : '<span class="batch">Batch ' + e(p.batch) + '</span>') + '</div>' + (p.bestBefore ? '<div class="hint" style="margin:0 0 6px">Best before ' + e(p.bestBefore) + '</div>' : '');
    p.cats.forEach(function(c){
      var pct = c.target ? Math.round(c.made / c.target * 100) : 0;
      html += '<div class="pcat"><div class="pct"><b>' + e(c.label) + '</b><small>' + c.pcs + ' pc/pack</small><span>' + (p.recorded ? fmtN(c.made) + ' / ' : '') + fmtN(c.target) + ' packs</span></div>' + (p.recorded ? bar(pct, pct >= 100 ? 'ok' : '') : '') +
        c.items.map(function(i){ return '<div class="pln"><span>' + e(i.name) + (i.carry ? ' <em>+' + i.carry + ' from yesterday</em>' : '') + (i.parts || []).map(function(x){ return ' <em class="ord">' + (i.base || i.carry || i.parts.length > 1 ? x.packs + ' ' : '') + 'for ' + e(x.name) + '</em>'; }).join('') + '</span><b>' + (i.made !== null ? '<span class="' + (i.made >= i.target ? 'okc' : 'shortc') + '">' + fmtN(i.made) + '</span> / ' : '') + fmtN(i.target) + '</b></div>'; }).join('') + '</div>';
    });
    if(p.orders.length) html += '<div class="pcat">' + (p.cats.length ? '<div class="pct"><b>Orders & events</b></div>' : '') + p.orders.map(function(o){
      return '<a class="ordrow" href="#porders"><div class="pct"><b style="font-size:14px">' + e(o.customer) + '</b><span>needed ' + e(o.dueLabel) + '</span></div>' + bar(o.pct, o.pct >= 100 ? 'ok' : '') +
        '<small>' + fmtN(o.made) + ' of ' + fmtN(o.packs) + ' packs · ' + o.lines.map(function(l){ return e(l.cat + ' ' + l.name) + ' ' + fmtN(l.made) + '/' + fmtN(l.packs); }).join(' · ') + '</small></a>'; }).join('') + '</div>';
    if(p.canRecord) html += '<a class="btn' + (p.recorded ? ' ghost' : '') + '" style="margin-top:12px" href="#production">' + (p.recorded ? 'Change what was made' : 'Record what was made') + '</a>';
    else html += '<a class="hint" style="display:block;margin-top:8px" href="#production">Details ›</a>';
    return html + '</div>';
  }
  function viewProduction(){
    loading();
    var day = state.prodDay || KK.ymd();
    Promise.all([KK.post('prodDay', {date: day}), KK.post('prodHistory')]).then(function(rs){
      var r = rs[0], h = rs[1];
      if(!r.ok) return fail(r);
      var back = isMgr() ? '<a class="back" href="#admin">‹ Home</a>' : '<a class="back" href="#home">‹ Today</a>';
      var isToday = day === KK.ymd();
      var html = back + '<div class="ptitle">Production</div><div class="mnav"><button id="pd" aria-label="Previous day">‹</button><b>' + e(isToday ? 'Today · ' + r.label : r.label) + '</b><button id="nd" aria-label="Next day"' + (day >= KK.ymd() && !r.canSet ? ' disabled' : '') + '>›</button></div>' +
        '<div class="sub2" style="margin-top:4px">Batch <b>' + e(r.batch) + '</b>' + (r.bestBefore ? ' · best before ' + e(r.bestBefore) : '') + (r.recorded ? ' · recorded by ' + e(r.recordedBy) + ' at ' + e(r.recordedAt) : '') + '</div>';
      var cats = {}; r.all.forEach(function(i){ (cats[i.cat] = cats[i.cat] || { label: i.catLabel, pcs: i.pcs, items: [] }).items.push(i); });
      var rec = r.canRecord;
      html += Object.keys(cats).map(function(k){ var c = cats[k], tgt = c.items.reduce(function(s, i){ return s + i.target; }, 0), made = c.items.reduce(function(s, i){ return s + (i.made || 0); }, 0);
        if(!tgt && !made && !rec) return '';
        return '<div class="card"><h2>' + e(c.label) + ' <small class="hint" style="display:inline;font-weight:700">' + c.pcs + ' pc/pack · quota ' + fmtN(tgt) + ' packs</small></h2>' + c.items.filter(function(i){ return rec || i.target || i.made; }).map(function(i){
          return '<div class="ln" style="align-items:center;gap:10px"><span style="flex:1"><b style="display:block;font-weight:800">' + e(i.name) + '</b><small class="hint" style="margin:0">Quota ' + fmtN(i.target) +
            (i.carry ? ' · ' + i.carry + ' carried over' : '') + (i.parts || []).map(function(x){ return ' · ' + x.packs + ' for ' + e(x.name); }).join('') + (i.changed ? ' · changed for this day' : '') + '</small></span>' +
            (rec ? '<input class="qty" style="width:80px" inputmode="numeric" data-m="' + e(i.id) + '" value="' + (i.made === null ? '' : i.made) + '" aria-label="Packs of ' + e(c.label + ' ' + i.name) + ' made">' : '<b>' + (i.made === null ? '–' : fmtN(i.made)) + '</b>') + '</div>'; }).join('') + '</div>';
      }).join('');
      if(r.orders.length) html += prodCard({ cats: [], orders: r.orders, batch: r.batch }, 'Orders & events', true).replace('<a class="hint" style="display:block;margin-top:8px" href="#production">Details ›</a>', '');
      if(rec && day <= KK.ymd()) html += '<button class="btn" id="saveP" style="margin-top:14px">' + (r.recorded ? 'Save changes' : 'Save what was made') + '</button><p class="hint">Type what was made of each flavour; you don\'t need to split it by order. Packs beyond the everyday quota go to the orders, earliest needed-by first. Anything short is added to the next day.</p>';
      if(r.canSet) html += '<div class="btns" style="margin-top:10px"><button class="btn ghost sm" id="chq">Change this day\'s everyday quota</button><a class="btn ghost sm" href="#quota">Weekly quota</a></div>';
      if(r.canSet) html += '<a class="btn ghost sm" href="#porders" style="margin-top:8px">Orders & events</a>';
      if(h.ok && h.days.length) html += '<div class="h2">Last 2 weeks</div><div class="card"><table class="tbl"><tr><th>Day</th>' + ['TikTok', 'Events', 'Waystar'].map(function(x){ return '<th class="r">' + x + '</th>'; }).join('') + '</tr>' +
        h.days.map(function(d){ var by = {}; d.cats.forEach(function(c){ by[c.label] = c; });
          return '<tr><td>' + e(d.label) + '</td>' + ['TikTok', 'Events', 'Waystar'].map(function(x){ var c = by[x];
            return '<td class="r">' + (!d.recorded ? (c && c.target ? '<small class="hint">not recorded</small>' : '') : c ? '<span class="' + (c.made >= c.target ? 'okc' : 'shortc') + '">' + fmtN(c.made) + '</span>/' + fmtN(c.target) : '') + '</td>'; }).join('') + '</tr>'; }).join('') + '</table></div>';
      page(isMgr() ? 'admin' : 'home', html, true);
      document.getElementById('pd').onclick = function(){ state.prodDay = shiftDay(day, -1); viewProduction(); };
      document.getElementById('nd').onclick = function(){ state.prodDay = shiftDay(day, 1); viewProduction(); };
      var sp = document.getElementById('saveP');
      if(sp) sp.onclick = function(){
        var made = {}, any = false; app.querySelectorAll('[data-m]').forEach(function(x){ if(x.value.trim() !== ''){ made[x.dataset.m] = x.value.trim(); any = true; } });
        if(!any) return toast('Type how many packs were made (0 if none).', true);
        var dn = busy(sp); KK.post('prodRecord', {date: day, made: made}).then(function(x){ dn(); if(!x.ok) return toast(x.error, true); toast('Saved'); viewProduction(); });
      };
      var cq = document.getElementById('chq');
      if(cq) cq.onclick = function(){
        sheet('Everyday quota for ' + r.label, '<p class="hint">Packs for this day only, for the everyday quota (orders and events are planned separately). Leave a box blank to use the weekly quota. Carried-over packs are added on top unless you clear them.</p>' +
          Object.keys(cats).map(function(k){ var c = cats[k]; return '<div class="h2" style="font-size:15px">' + e(c.label) + '</div>' + c.items.filter(function(i){ return k !== 'waystar' || !i.order; }).map(function(i){
            return '<div class="ln" style="align-items:center"><span>' + e(i.name) + '<small class="hint" style="display:block;margin:0">weekly ' + (i.changed ? '' : fmtN(i.base)) + '</small></span><input class="qty" style="width:80px" inputmode="numeric" data-q="' + e(i.id) + '" value="' + (i.changed ? i.base : '') + '" placeholder="' + (i.changed ? '' : i.base) + '"></div>'; }).join(''); }).join('') +
          '<label class="check" style="margin-top:12px"><input type="checkbox" id="nc"> Clear carried-over packs for this day</label><button class="btn" id="qs" style="margin-top:12px">Save</button>', function(sh, close){
            sh.querySelector('#qs').onclick = function(){ var q = {}; sh.querySelectorAll('[data-q]').forEach(function(x){ q[x.dataset.q] = x.value.trim(); });
              KK.post('quotaDaySave', {date: day, packs: q, noCarry: sh.querySelector('#nc').checked}).then(function(x){ if(!x.ok) return toast(x.error, true); close(); toast('Quota changed for ' + r.label); viewProduction(); }); };
          });
      };
    });
  }
  function shiftDay(d, n){ var x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2) + '-' + ('0' + x.getDate()).slice(-2); }
  function viewQuota(){
    loading();
    KK.post('prodSetup').then(function(r){
      if(!r.ok) return fail(r);
      var D = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], di = state.quotaDow === undefined ? 0 : state.quotaDow, week = {};
      r.products.forEach(function(p){ week[p.id] = p.week.slice(); });
      var html = '<a class="back" href="#production">‹ Production</a><div class="ptitle">Weekly quota</div><p class="hint">Packs to make on a normal week. Change a single day from the Production screen. Waystar is worked out from its order.</p>' +
        '<div class="seg days" role="group" aria-label="Day">' + D.map(function(d, i){ return '<button data-dw="' + i + '" class="' + (i === di ? 'on' : '') + '">' + d + '</button>'; }).join('') + '</div><div id="qlist"></div>' +
        '<div class="btns" style="margin-top:12px"><button class="btn ghost" id="cpy">Same for Mon–Fri</button><button class="btn" id="qsave">Save</button></div>' +
        (r.admin ? '<div class="h2">Flavours</div><p class="hint">Add a new flavour or stop one.</p><button class="btn ghost sm" id="addF">+ Add a flavour</button>' + r.products.map(function(p){
          return '<button class="row" data-pf="' + e(p.id) + '"' + (p.active ? '' : ' style="opacity:.55"') + '><div class="rt"><b>' + e(p.catLabel + ' · ' + p.name) + (p.active ? '' : ' (stopped)') + '</b><small>' + p.pcs + ' pc/pack</small></div><span class="chev2">›</span></button>'; }).join('') : '');
      page('admin', html, true);
      var draw = function(){
        var cats = {}; r.products.filter(function(p){ return p.active && p.cat !== 'waystar'; }).forEach(function(p){ (cats[p.catLabel] = cats[p.catLabel] || []).push(p); });
        document.getElementById('qlist').innerHTML = Object.keys(cats).map(function(k){ var tot = cats[k].reduce(function(s, p){ return s + (Number(week[p.id][di]) || 0); }, 0);
          return '<div class="card"><h2>' + e(k) + ' <small class="hint" style="display:inline">' + D[di] + ' total ' + fmtN(tot) + ' packs</small></h2>' + cats[k].map(function(p){
            return '<div class="ln" style="align-items:center"><span>' + e(p.name) + '</span><input class="qty" style="width:80px" inputmode="numeric" data-w="' + e(p.id) + '" value="' + (week[p.id][di] || '') + '" placeholder="0" aria-label="' + e(k + ' ' + p.name + ' on ' + D[di]) + '"></div>'; }).join('') + '</div>'; }).join('');
      };
      draw();
      app.addEventListener('input', function(x){ var t = x.target; if(t.dataset && t.dataset.w){ week[t.dataset.w][di] = Number(t.value) || 0; } });
      on(app, '[data-dw]', 'click', function(b){ di = state.quotaDow = +b.dataset.dw; app.querySelectorAll('[data-dw]').forEach(function(x){ x.classList.toggle('on', x === b); }); draw(); });
      document.getElementById('cpy').onclick = function(){ Object.keys(week).forEach(function(id){ for(var k = 0; k < 5; k++) week[id][k] = week[id][di]; }); toast(D[di] + '\'s quota copied to Mon–Fri. Save to keep it'); };
      document.getElementById('qsave').onclick = function(){ var b = this, dn = busy(b); KK.post('quotaWeekSave', {week: week}).then(function(x){ dn(); if(!x.ok) return toast(x.error, true); toast('Weekly quota saved'); }); };
      var flav = function(p){
        sheet(p.id ? p.name : 'New flavour', '<label class="f" for="fc2">Category</label><select id="fc2">' + r.cats.map(function(c){ return '<option value="' + c.key + '"' + (c.key === p.cat ? ' selected' : '') + '>' + e(c.label) + ' (' + c.pcs + ' pc/pack)</option>'; }).join('') + '</select>' +
          '<label class="f" for="fn2">Flavour</label><input id="fn2" value="' + e(p.name) + '" maxlength="60"><label class="f" for="fpc">Pieces per pack</label><input id="fpc" inputmode="numeric" value="' + (p.pcs || '') + '">' +
          '<label class="check" style="margin-top:10px"><input type="checkbox" id="fact"' + (p.active !== false ? ' checked' : '') + '> We still make this</label><button class="btn" id="fsv" style="margin-top:12px">Save</button>', function(sh, close){
            sh.querySelector('#fc2').onchange = function(){ var c = r.cats.filter(function(x){ return x.key === this.value; }, this)[0]; if(c && !sh.querySelector('#fpc').value) sh.querySelector('#fpc').value = c.pcs; };
            sh.querySelector('#fsv').onclick = function(){ KK.post('productSave', {id: p.id, cat: sh.querySelector('#fc2').value, name: sh.querySelector('#fn2').value, pcs: sh.querySelector('#fpc').value, active: sh.querySelector('#fact').checked})
              .then(function(x){ if(!x.ok) return toast(x.error, true); close(); toast('Saved'); viewQuota(); }); };
          });
      };
      var af = document.getElementById('addF'); if(af) af.onclick = function(){ flav({ id: '', cat: 'tiktok', name: '', pcs: 5, active: true }); };
      on(app, '[data-pf]', 'click', function(b){ flav(r.products.filter(function(p){ return p.id === b.dataset.pf; })[0]); });
    });
  }
  function viewOrders(){
    loading();
    KK.post('prodSetup').then(function(r){
      if(!r.ok) return fail(r);
      var P = {}; r.products.forEach(function(p){ P[p.id] = p; });
      var chip = { open: ['In progress', 'warn'], done: ['Done', 'ok'] };
      var open = r.orders.filter(function(o){ return o.status === 'open'; }), done = r.orders.filter(function(o){ return o.status !== 'open'; }).slice(0, 10);
      var card = function(o){ var c = chip[o.status] || ['', ''];
        return '<div class="card"><div style="display:flex;gap:8px;align-items:center"><h2 style="flex:1;margin:0">' + e(o.customer) + '</h2><span class="chip ' + c[1] + '">' + c[0] + '</span></div>' +
          '<div class="hint" style="margin:2px 0 6px">Needed by <b>' + e(o.dueLabel) + '</b> · ' + fmtN(o.packs) + ' packs (' + fmtN(o.pcs) + ' pcs)' + (o.status === 'open' ? ' · ' + (o.planned ? 'planned' + (o.plannedBy ? ' by ' + e(o.plannedBy) : '') : '<b style="color:var(--amber)">not planned yet: spread evenly</b>') : '') + '</div>' +
          bar(o.pct, o.pct >= 100 ? 'ok' : '') + o.lines.map(function(l){ return '<div class="pln"><span>' + e(l.cat + ' · ' + l.name) + '</span><b><span class="' + (l.made >= l.packs ? 'okc' : '') + '">' + fmtN(l.made) + '</span> / ' + fmtN(l.packs) + '</b></div>'; }).join('') +
          (o.notes ? '<p class="hint">' + e(o.notes) + '</p>' : '') +
          (r.canSet ? '<div class="btns" style="margin-top:10px">' + (o.status === 'open' ? '<a class="btn sm" href="#plan" data-pl="' + e(o.id) + '">' + (o.planned ? 'Change the plan' : 'Plan the days') + '</a>' : '') + '<button class="btn ghost sm" data-eo="' + e(o.id) + '">Edit</button></div>' : '') + '</div>'; };
      var html = '<a class="back" href="#production">‹ Production</a><div class="ptitle">Orders & events</div>' +
        '<p class="hint">Anything extra on top of the everyday quota: an event, a customer like HKPC, or Waystar. Add the products and the date they\'re needed by, then plan which days to make them. In the evening the manager just records packs made per flavour; the app fills the orders, earliest needed-by first.</p>' +
        (r.canSet ? '<button class="btn" id="addO">+ New order or event</button>' : '') +
        (open.length ? open.map(card).join('') : '<div class="empty">Nothing extra to make right now.</div>') +
        (done.length ? '<div class="h2">Done</div>' + done.map(card).join('') : '');
      page('admin', html, true);
      on(app, '[data-pl]', 'click', function(a){ state.planId = a.dataset.pl; });
      var form = function(o){
        var lines = o.lines.length ? o.lines.map(function(l){ return { product: l.product, packs: l.packs }; }) : [{ product: '', packs: '' }];
        var opts = function(sel){ var g = {}; r.products.filter(function(p){ return p.active || p.id === sel; }).forEach(function(p){ (g[p.catLabel + ' (' + p.pcs + ' pc/pack)'] = g[p.catLabel + ' (' + p.pcs + ' pc/pack)'] || []).push(p); });
          return '<option value="">Pick a product</option>' + Object.keys(g).map(function(k){ return '<optgroup label="' + e(k) + '">' + g[k].map(function(p){ return '<option value="' + e(p.id) + '"' + (p.id === sel ? ' selected' : '') + '>' + e(p.name) + '</option>'; }).join('') + '</optgroup>'; }).join(''); };
        sheet(o.id ? 'Change ' + o.customer : 'New order or event', '<label class="f" for="oc">Customer or event</label><input id="oc" value="' + e(o.customer) + '" placeholder="e.g. HKPC, Christmas Wonderland weekend">' +
          '<div class="row2"><div><label class="f" for="od">Needed by</label><input id="od" type="date" value="' + e(o.due || '') + '"></div><div><label class="f" for="os">Start making from</label><input id="os" type="date" value="' + e(o.start || KK.ymd()) + '"></div></div>' +
          '<div class="h2" style="font-size:15px">Products</div><div id="olines"></div><button class="btn ghost sm" id="oadd" type="button">+ Add another product</button><div class="hint" id="otot"></div>' +
          '<label class="f" for="on">Notes</label><input id="on" value="' + e(o.notes || '') + '" maxlength="300" placeholder="e.g. Pack in cartons of 10">' +
          (o.id ? '<label class="f" for="ost">Status</label><select id="ost"><option value="open">In progress</option><option value="done">Done</option><option value="deleted">Remove</option></select>' : '') +
          '<button class="btn" id="osv" style="margin-top:12px">' + (o.id ? 'Save' : 'Save, then plan the days') + '</button>', function(sh, close){
            var draw = function(){
              sh.querySelector('#olines').innerHTML = lines.map(function(l, k){ return '<div class="oline"><select data-lp="' + k + '" aria-label="Product ' + (k + 1) + '">' + opts(l.product) + '</select><input class="qty" style="width:76px" inputmode="numeric" data-lq="' + k + '" value="' + (l.packs || '') + '" placeholder="packs" aria-label="Packs of product ' + (k + 1) + '">' +
                (lines.length > 1 ? '<button type="button" class="linkbtn" data-lr="' + k + '" aria-label="Remove product ' + (k + 1) + '">✕</button>' : '') + '</div>'; }).join('');
              var tp = 0, tc = 0; lines.forEach(function(l){ var p = P[l.product], n = Number(l.packs) || 0; tp += n; if(p) tc += n * p.pcs; });
              sh.querySelector('#otot').textContent = tp ? 'Total ' + fmtN(tp) + ' packs (' + fmtN(tc) + ' pcs)' : '';
            };
            draw();
            var box = sh.querySelector('#olines');
            box.addEventListener('change', function(x){ if(x.target.dataset.lp !== undefined){ lines[+x.target.dataset.lp].product = x.target.value; draw(); } });
            box.addEventListener('input', function(x){ if(x.target.dataset.lq !== undefined){ lines[+x.target.dataset.lq].packs = x.target.value; var tp = 0, tc = 0; lines.forEach(function(l){ var p = P[l.product], n = Number(l.packs) || 0; tp += n; if(p) tc += n * p.pcs; }); sh.querySelector('#otot').textContent = tp ? 'Total ' + fmtN(tp) + ' packs (' + fmtN(tc) + ' pcs)' : ''; } });
            box.addEventListener('click', function(x){ var b = x.target.closest('[data-lr]'); if(b){ lines.splice(+b.dataset.lr, 1); draw(); } });
            sh.querySelector('#oadd').onclick = function(){ lines.push({ product: '', packs: '' }); draw(); var s2 = box.querySelectorAll('select'); s2[s2.length - 1].focus(); };
            if(o.id) sh.querySelector('#ost').value = o.status;
            sh.querySelector('#osv').onclick = function(){ var b = this, dn = busy(b);
              KK.post('prodOrderSave', {id: o.id, customer: sh.querySelector('#oc').value, due: sh.querySelector('#od').value, start: sh.querySelector('#os').value, notes: sh.querySelector('#on').value,
                lines: lines, status: o.id ? sh.querySelector('#ost').value : 'open'}).then(function(x){ dn(); if(!x.ok) return toast(x.error, true); close(); toast('Saved');
                  if(!o.id){ state.planId = x.id; go('plan'); } else viewOrders(); }); };
          });
      };
      var ao = document.getElementById('addO'); if(ao) ao.onclick = function(){ form({ id: '', customer: '', lines: [], start: KK.ymd(), due: '' }); };
      on(app, '[data-eo]', 'click', function(b){ form(r.orders.filter(function(o){ return o.id === b.dataset.eo; })[0]); });
    });
  }
  // The manager spreads an order over the days before it's needed
  function viewPlan(){
    if(!state.planId) return go('porders');
    loading();
    KK.post('prodOrderGet', {id: state.planId}).then(function(r){
      if(!r.ok) return fail(r);
      var o = r.order, plan = {};
      r.days.forEach(function(d){ plan[d.date] = Object.assign({}, d.plan); });
      var html = '<a class="back" href="#porders">‹ Orders & events</a><div class="ptitle">Plan: ' + e(o.customer) + '</div><div class="sub2">Needed by ' + e(o.dueLabel) + ' · ' + fmtN(o.left) + ' packs left to make</div>' +
        '<p class="hint">Type how many packs to make on each day. These are added to that day\'s quota for the kitchen. Anything not made on its day is added to the next day.</p>' +
        '<div id="sumry"></div><button class="btn ghost sm" id="even">Spread evenly over the working days</button><div id="days"></div>' +
        (r.canPlan ? '<div class="btns" style="margin-top:14px">' + (o.planned ? '<button class="btn ghost" id="clr">Clear the plan</button>' : '') + '<button class="btn" id="psv">Save the plan</button></div>' : '');
      page('admin', html, true);
      var sum = function(){
        document.getElementById('sumry').innerHTML = '<div class="card">' + o.lines.filter(function(l){ return l.left > 0; }).map(function(l){
          var planned = 0; Object.keys(plan).forEach(function(d){ planned += Number(plan[d][l.product]) || 0; });
          var diff = planned - l.left;
          return '<div class="ln"><span>' + e(l.cat + ' · ' + l.name) + '</span><b' + (diff ? ' style="color:var(--' + (diff < 0 ? 'amber' : 'red') + ')"' : ' class="okc"') + '>' + fmtN(planned) + ' / ' + fmtN(l.left) + (diff < 0 ? ' (' + (-diff) + ' not planned)' : diff > 0 ? ' (' + diff + ' too many)' : ' ✓') + '</b></div>'; }).join('') + '</div>';
      };
      var draw = function(){
        document.getElementById('days').innerHTML = r.days.map(function(d){
          var tot = 0; o.lines.forEach(function(l){ tot += Number(plan[d.date][l.product]) || 0; });
          return '<div class="card' + (d.work ? '' : ' offday') + '"><div style="display:flex;align-items:baseline;gap:8px"><h2 style="margin:0;flex:1">' + e(d.label) + (d.work ? '' : ' <small class="hint" style="display:inline">not a usual working day</small>') + '</h2>' +
            '<small class="hint" style="margin:0">' + (d.everyday ? 'everyday quota ' + fmtN(d.everyday) + ' · ' : '') + 'this order ' + fmtN(tot) + '</small></div>' +
            o.lines.filter(function(l){ return l.left > 0; }).map(function(l){ return '<div class="ln" style="align-items:center"><span>' + e(l.cat + ' · ' + l.name) + '</span><input class="qty" style="width:76px" inputmode="numeric" data-d="' + d.date + '" data-p="' + e(l.product) + '" value="' + (plan[d.date][l.product] || '') + '" placeholder="0" aria-label="' + e(l.name + ' on ' + d.label) + '"></div>'; }).join('') + '</div>'; }).join('');
        sum();
      };
      draw();
      app.addEventListener('input', function(x){ var t = x.target; if(t.dataset && t.dataset.d){ var v = t.value.replace(/\D/g, ''); if(v !== t.value) t.value = v; if(v) plan[t.dataset.d][t.dataset.p] = Number(v); else delete plan[t.dataset.d][t.dataset.p]; sum(); } });
      document.getElementById('even').onclick = function(){ r.days.forEach(function(d){ plan[d.date] = Object.assign({}, r.suggest[d.date] || {}); }); draw(); toast('Spread evenly. Change any day, then save'); };
      var ps = document.getElementById('psv');
      if(ps) ps.onclick = function(){ var dn = busy(ps); KK.post('prodOrderPlan', {id: o.id, plan: plan}).then(function(x){ dn(); if(!x.ok) return toast(x.error, true); toast('Plan saved. It\'s on the kitchen\'s quota for those days'); go('porders'); }); };
      var cl = document.getElementById('clr');
      if(cl) cl.onclick = function(){ confirmSheet('Clear the plan?', 'The app goes back to spreading what\'s left evenly over the working days.', 'Clear', function(){ KK.post('prodOrderPlan', {id: o.id, clear: true}).then(function(x){ if(!x.ok) return toast(x.error, true); go('porders'); }); }); };
    });
  }
  // ================================================================ STOCK (stock take, deliveries, reorder, cost of goods)
  var IMP = { critical: 'Critical', medium: 'Medium', later: 'Can wait' }, IMP_ORDER = ['critical', 'medium', 'later'];
  var STATUS = { out: ['Out', 'bad'], low: ['Low', 'bad'], soon: ['Order soon', 'warn'], ok: ['OK', 'ok'], uncounted: ['Not counted', ''] };
  function q(n){ return n === null || n === undefined || n === '' ? '–' : nd(n); }
  function thumb(src, big){ return src ? '<img class="thumb' + (big ? ' big' : '') + '" src="' + e(src) + '" alt="" loading="lazy">' : '<span class="thumb' + (big ? ' big' : '') + ' none" aria-hidden="true">📦</span>'; }
  function groupItems(items, mode, sups){
    var g = {}, order = [];
    items.forEach(function(it){
      var k = mode === 'importance' ? IMP[it.importance] : mode === 'supplier' ? (it.supplier || 'No supplier set') : it.section;
      if(!g[k]){ g[k] = []; order.push(k); } g[k].push(it);
    });
    if(mode === 'importance') order = IMP_ORDER.map(function(x){ return IMP[x]; }).filter(function(k){ return g[k]; });
    if(mode === 'supplier') order.sort(function(a, b){ return (a === 'No supplier set') - (b === 'No supplier set') || a.localeCompare(b); });
    return order.map(function(k){
      var lead = mode === 'supplier' && sups ? (sups.filter(function(s){ return s.name === k; })[0] || {}).lead : null;
      return { title: k, sub: lead !== null && lead !== undefined ? lead + '-day lead time' : '', items: g[k] };
    });
  }
  function groupSeg(cur){ return '<div class="seg" role="group" aria-label="Group by">' + [['section','Section'],['importance','Importance'],['supplier','Supplier']].map(function(m){
    return '<button type="button" data-grp="' + m[0] + '" class="' + (cur === m[0] ? 'on' : '') + '" aria-pressed="' + (cur === m[0]) + '">' + m[1] + '</button>'; }).join('') + '</div>'; }
  function stockBack(){ return isMgr() ? '' : '<a class="back" href="#home">‹ Today</a>'; }

  function viewStock(){
    loading();
    KK.post('stock').then(function(r){
      if(!r.ok) return fail(r);
      state.stockGroup = state.stockGroup || 'section';
      var html = demoBar() + stockBack() + '<div class="ptitle">Stock</div>';
      if(r.empty){
        html += r.admin ? '<div class="card"><h2>Load the stock list</h2><p class="hint">Loads your saved stock setup (68 items with photos, suppliers, units and links to Hazel\'s prices) and Hazel\'s price list. You can change everything afterwards.</p><button class="btn" id="seed">Load the starting list</button>' +
          '<button class="btn ghost" id="pasteS" style="margin-top:10px">Paste a saved setup</button><label class="linkbtn" style="display:block;text-align:center">or load a saved file<input type="file" id="setupf" accept=".json,application/json" hidden></label>' +
          '<div class="hint">Use these for the setup you copied from the demo, with your suppliers, lead times and units.</div></div>'
          : '<div class="empty">Jay or Hazel haven\'t set up the stock list yet.</div>';
        page('stock', html);
        var sf = document.getElementById('setupf'); if(sf) sf.onchange = function(){ loadSetupFile(this.files[0], false); };
        var ps = document.getElementById('pasteS'); if(ps) ps.onclick = function(){ pasteSetup(false); };
        var sb = document.getElementById('seed');
        if(sb) sb.onclick = function(){ var dn = busy(sb, 'Loading…');
          fetch('stock-seed.json', {cache: 'no-store'}).then(function(x){ return x.json(); }).then(function(d){ return KK.post('stockImport', d); })
            .then(function(x){ dn(); if(!x.ok) return toast(x.error, true); toast(x.items + ' items loaded'); viewStock(); }, function(){ dn(); toast('Couldn\'t find stock-seed.json next to the app.', true); }); };
        return;
      }
      var due = r.due, low = r.items.filter(function(i){ return i.status === 'out' || i.status === 'low'; }).length;
      if(due.missed) html += '<div class="msg bad" style="margin-top:12px">The stock take on ' + e(nice(due.missed)) + ' was missed. Do one today.</div>';
      html += due.today && !due.done ? '<div class="hero"><div class="tag">Stock take day</div><div class="tt" style="font-size:26px">Count today</div><div class="ds">' + r.items.length + ' items · ' + e(due.days) + '</div><a class="go" href="#count" style="text-decoration:none;display:flex;align-items:center;justify-content:center">Start stock take</a></div>'
        : '<div class="row"><div class="rt"><b>' + (due.done ? '✓ Counted today by ' + e(due.doneBy) + ' at ' + e(due.doneAt) : 'Stock take: ' + e(due.days)) + '</b><small>' + (due.done ? 'Count again if something was wrong; it replaces today\'s count' : 'You can count on other days too') + '</small></div><a class="btn sm' + (due.done ? ' ghost' : '') + '" href="#count">Count</a></div>';
      html += '<div class="btns" style="margin-top:10px"><button class="btn ghost" id="dlv">Delivery arrived</button><button class="btn ghost" id="wst">Thrown away</button></div>';
      r.openDeliveries.forEach(function(d){ html += '<a class="row" href="#delivery" data-dv="' + e(d.id) + '"><div class="rt"><b>' + e(d.supplier || 'Delivery') + (d.status === 'flagged' ? ': ' + d.flags + ' problem' + (d.flags > 1 ? 's' : '') : ': not confirmed yet') + '</b><small>' + (d.status === 'flagged' ? 'Contact the supplier' : 'Count what arrived and confirm') + '</small></div><span class="chip ' + (d.status === 'flagged' ? 'bad' : 'warn') + '">' + (d.status === 'flagged' ? 'Problem' : 'Checking') + '</span></a>'; });
      html += '<div class="menu" style="margin-top:12px">' + [['reorder', 'Reorder list', low ? low + ' item' + (low > 1 ? 's' : '') + ' low or out' : 'What to order, by supplier'], ['deliveries', 'Deliveries', 'Invoices and what arrived']]
        .concat(r.admin ? [['stockcost', 'Cost of goods used', 'Stock value now ' + money(r.value)], ['stockitems', 'Items, prices & suppliers', 'Minimum levels, Hazel\'s prices, lead times']] : [])
        .map(function(m){ return '<a href="#' + m[0] + '"><span>' + m[1] + '<small style="display:block;font-weight:600;color:var(--muted);font-size:13px;margin-top:2px">' + e(m[2]) + '</small></span><span class="chev2">›</span></a>'; }).join('') + '</div>';
      html += '<div class="h2">All stock</div>' + groupSeg(state.stockGroup) +
        '<label class="check" style="margin-top:8px"><input type="checkbox" id="onlyLow"' + (state.stockLow ? ' checked' : '') + '> Only low, out or order soon</label><div id="list"></div>';
      page('stock', html, true);
      bindDemo();
      var draw = function(){
        var items = state.stockLow ? r.items.filter(function(i){ return i.status !== 'ok' && i.status !== 'uncounted'; }) : r.items;
        document.getElementById('list').innerHTML = items.length ? groupItems(items, state.stockGroup, r.suppliers).map(function(g){
          return '<div class="h2" style="font-size:15px">' + e(g.title) + ' <span class="n">' + g.items.length + '</span>' + (g.sub ? ' <small class="hint" style="display:inline">' + e(g.sub) + '</small>' : '') + '</div>' + g.items.map(function(i){
            var s = STATUS[i.status];
            return '<button class="row sitem" data-it="' + e(i.id) + '">' + thumb(i.photo) + '<div class="rt"><b>' + e(i.name) + '</b><small>' + (i.expected === null ? 'Not counted yet' : '~' + q(i.expected) + ' ' + e(i.unit) + ' left' +
              (i.daysLeft !== null ? ' · ' + (i.daysLeft > 60 ? '60+' : i.daysLeft) + ' days' : '')) + (i.min !== null ? ' · min ' + q(i.min) : '') + '</small></div><span class="chip ' + s[1] + '">' + s[0] + '</span></button>';
          }).join(''); }).join('') : '<div class="clear">✓ Nothing low right now.</div>';
      };
      draw();
      on(app, '[data-grp]', 'click', function(b){ state.stockGroup = b.dataset.grp; app.querySelectorAll('[data-grp]').forEach(function(x){ x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); draw(); });
      document.getElementById('onlyLow').onchange = function(){ state.stockLow = this.checked; draw(); };
      on(app, '[data-it]', 'click', function(b){ itemSheet(r.items.filter(function(i){ return i.id === b.dataset.it; })[0], r.admin, viewStock); });
      on(app, '[data-dv]', 'click', function(a){ state.delId = a.dataset.dv; });
      document.getElementById('dlv').onclick = newDelivery;
      document.getElementById('wst').onclick = function(){ wastageSheet(r.items); };
    });
  }
  function itemSheet(i, admin, back){
    var s = STATUS[i.status];
    sheet(i.name, '<div style="display:flex;gap:14px;align-items:center;margin-top:6px">' + thumb(i.photo, true) + '<div><b style="font-size:17px">' + e(i.name) + '</b><div class="hint" style="margin:2px 0">' + e(i.brand || '') + '</div><span class="chip ' + s[1] + '">' + s[0] + '</span> <span class="chip">' + IMP[i.importance] + '</span></div></div>' +
      '<div class="ln"><span>Left now (estimate)</span><b>' + q(i.expected) + ' ' + e(i.unit) + '</b></div><div class="ln"><span>Last counted</span><b>' + (i.lastDate ? q(i.last) + ' · ' + e(nice(i.lastDate)) : '–') + '</b></div>' +
      '<div class="ln"><span>Used per day (4-week average)</span><b>' + q(i.daily) + '</b></div>' + (i.orderPer !== 1 || i.orderQty ? '<div class="ln"><span>Ordered</span><b>in ' + e(i.orderUnit) + (i.orderPer !== 1 ? ' (' + (i.orderPer < 1 ? '1 ' + e(i.orderUnit) + ' = ' + nd(1 / i.orderPer) + ' ' + e(i.unit) : nd(i.orderPer) + ' ' + e(i.orderUnit) + ' = 1 ' + e(i.unit)) + ')' : '') + (i.orderQty ? ' · usually ' + nd(i.orderQty) + ' ' + e(i.orderUnit) : '') + '</b></div>' : '') +
      '<div class="ln"><span>Runs out</span><b>' + (i.runOut ? (i.daysLeft > 60 ? 'Not for 2+ months' : e(nice(i.runOut))) : '–') + '</b></div>' +
      '<div class="ln"><span>Supplier</span><b>' + e(i.supplier || 'Not set') + (i.lead !== null ? ' · ' + i.lead + ' days' : '') + '</b></div>' + (admin ? '<div class="ln"><span>Cost per ' + e(i.unit) + '</span><b>' + (i.cost !== null ? money(i.cost) : 'Not set') + '</b></div>' : '') +
      (admin ? '<div class="row2" style="margin-top:6px"><div><label class="f" for="lmin">Minimum (' + e(i.unit) + ')</label><input id="lmin" inputmode="decimal" value="' + (i.min === null ? '' : i.min) + '"></div><div><label class="f" for="lpar">Top up to</label><input id="lpar" inputmode="decimal" value="' + (i.par === null ? '' : i.par) + '"></div></div>' +
        '<label class="f" for="limp">Importance</label><select id="limp">' + IMP_ORDER.map(function(k){ return '<option value="' + k + '"' + (k === i.importance ? ' selected' : '') + '>' + IMP[k] + '</option>'; }).join('') + '</select>' +
        sugHint(i) + '<div class="hint">Below the minimum it goes on the reorder list. Top up to is how much the order brings you back to.</div><button class="btn" id="lsave" style="margin-top:10px">Save levels</button>'
        : '<div class="ln"><span>Minimum · top up to</span><b>' + q(i.min) + ' · ' + q(i.par) + '</b></div>') +
      '<div class="h2" style="font-size:15px">Counts</div><div id="hist" class="hint">Loading…</div>',
      function(sh, close){
        bindSug(sh, '#lmin', '#lpar');
        var lb = sh.querySelector('#lsave');
        if(lb) lb.onclick = function(){ var dn = busy(lb); KK.post('stockLevelsSave', {id: i.id, min: sh.querySelector('#lmin').value.trim(), par: sh.querySelector('#lpar').value.trim(), importance: sh.querySelector('#limp').value})
          .then(function(x){ dn(); if(!x.ok) return toast(x.error, true); toast('Saved'); close(); back(); }); };
        KK.post('stockItemHistory', {id: i.id}).then(function(h){
          var box = sh.querySelector('#hist'); if(!box) return;
          if(!h.ok || !h.rows.length){ box.textContent = 'No counts yet.'; return; }
          box.outerHTML = '<table class="tbl"><tr><th>Date</th><th class="r">Counted</th><th class="r">In</th><th class="r">Used</th>' + (admin ? '<th></th>' : '') + '</tr>' + h.rows.map(function(c){
            return '<tr><td>' + e(c.label) + '<br><small class="hint">' + e(c.by) + '</small></td><td class="r"><b>' + q(c.qty) + '</b></td><td class="r">' + (c.received ? '+' + q(c.received) : '') + (c.wasted ? '<br><small class="hint">−' + q(c.wasted) + ' thrown</small>' : '') + '</td><td class="r">' + q(c.used) + '</td>' +
              (admin ? '<td class="r"><button class="linkbtn" data-fix="' + e(c.id) + '" data-q="' + c.qty + '" data-l="' + e(c.label) + '">Fix</button></td>' : '') + '</tr>'; }).join('') + '</table>';
          sh.querySelectorAll('[data-fix]').forEach(function(b){ b.onclick = function(){
            sheet('Correct a count', '<p class="hint">' + e(i.name) + ' on ' + e(b.dataset.l) + '. The change is logged.</p><label class="f" for="fxq">Counted (' + e(i.unit) + ')</label><input id="fxq" inputmode="decimal" value="' + e(b.dataset.q) + '"><button class="btn" id="fxs" style="margin-top:12px">Save</button>', function(s2, close2){
              s2.querySelector('#fxs').onclick = function(){ var v = s2.querySelector('#fxq').value.trim(); if(v === '') return;
                KK.post('stockCountFix', {id: b.dataset.fix, item: i.id, qty: v}).then(function(x){ if(!x.ok) return toast(x.error, true); toast('Count corrected'); close2(); close(); back(); }); };
            });
          }; });
        });
      });
  }
  // Suggested minimum / top-up from the last weeks of counts (admin decides)
  function sugHint(i){ return i.suggestMin !== null && i.suggestMin !== undefined ? '<div class="msg ok" style="margin-top:8px;display:flex;gap:8px;align-items:center"><span style="flex:1">Suggested from recent use: minimum <b>' + nd(i.suggestMin) + '</b>, top up to <b>' + nd(i.suggestPar) + '</b> ' + e(i.unit) + '</span><button type="button" class="btn ghost sm" style="width:auto;flex:0 0 auto" data-sug="' + i.suggestMin + '|' + i.suggestPar + '">Use</button></div>' : ''; }
  function bindSug(sh, minSel, parSel){ var b = sh.querySelector('[data-sug]'); if(b) b.onclick = function(){ var v = b.dataset.sug.split('|'); sh.querySelector(minSel).value = v[0]; sh.querySelector(parSel).value = v[1]; toast('Filled in. Save to keep it'); }; }
  // A count that's far from what the app expects is probably a typo or a miscount
  function offCount(i, v){ return i.est !== null && i.est !== undefined && v !== undefined && v !== '' && !isNaN(Number(v)) && Math.abs(Number(v) - i.est) > Math.max(2, i.est * 0.5); }
  function wastageSheet(items){
    sheet('Thrown away', '<p class="hint">Log anything expired, dropped or damaged, so it isn\'t counted as used.</p><label class="f" for="wi">Item</label><select id="wi"><option value="">Pick the item</option>' +
      groupItems(items, 'section').map(function(g){ return '<optgroup label="' + e(g.title) + '">' + g.items.map(function(i){ return '<option value="' + e(i.id) + '" data-u="' + e(i.unit) + '">' + e(i.name) + '</option>'; }).join('') + '</optgroup>'; }).join('') + '</select>' +
      '<label class="f" for="wq">How much <span id="wu"></span></label><input id="wq" inputmode="decimal" placeholder="e.g. 0.5"><label class="f" for="wr">Why</label><input id="wr" maxlength="200" placeholder="e.g. Left out of the chiller overnight">' +
      '<button class="btn" id="ws" style="margin-top:14px">Log it</button>', function(sh, close){
        sh.querySelector('#wi').onchange = function(){ var o = this.selectedOptions[0]; sh.querySelector('#wu').textContent = o && o.dataset.u ? '(' + o.dataset.u + ')' : ''; };
        sh.querySelector('#ws').onclick = function(){ var b = this, dn = busy(b); KK.post('wastageAdd', {item: sh.querySelector('#wi').value, qty: sh.querySelector('#wq').value.trim(), reason: sh.querySelector('#wr').value})
          .then(function(x){ dn(); if(!x.ok) return toast(x.error, true); close(); toast('Logged'); }); };
      });
  }

  // ---------------------------------------------------------------- stock take
  function viewCount(){
    loading();
    KK.post('stockCountGet').then(function(r){
      if(!r.ok) return fail(r);
      var key = 'kk_count_' + r.date, draft = {}, parts = {}, byId = {};
      r.items.forEach(function(i){ byId[i.id] = i; });
      try{ parts = JSON.parse(localStorage.getItem(key + '_p') || '{}') || {}; }catch(x){ parts = {}; }
      try{ draft = JSON.parse(localStorage.getItem(key) || 'null') || (r.existing ? r.existing.lines : {}); }catch(x){ draft = r.existing ? r.existing.lines : {}; }
      state.countGroup = state.countGroup || 'section';
      var html = '<a class="back" href="#stock">‹ Stock</a><div class="ptitle">Stock take</div><div class="sub2">' + e(r.dateLabel) + ' · ' + r.items.length + ' items</div>' +
        (r.existing ? '<div class="msg warn" style="margin-top:10px">Already counted today by ' + e(r.existing.by) + ' at ' + e(r.existing.at) + '. Submitting again replaces it.</div>' : '') +
        (r.pendingDeliveries.length ? '<a class="msg bad" style="display:block;margin-top:10px;text-decoration:none" href="#deliveries">Confirm the ' + r.pendingDeliveries.map(function(d){ return e(d.supplier); }).join(', ') + ' delivery first, or the balances will be off. ›</a>' : '') +
        '<div class="note" style="margin-top:10px">Count at the <b>end of the day</b>, after production. If a delivery came today, record it under <b>Delivery arrived</b> before you count.</div>' +
        '<p class="hint">Look at the photo, count using the unit shown. Part of a carton or packet? Type it as a decimal, e.g. <b>2.5</b>, or use the loose box where there is one. Your count saves on this phone as you go.</p>' +
        groupSeg(state.countGroup) + '<div id="list"></div><div class="countbar"><span id="prog"></span><button class="btn" id="sub">Submit count</button></div>';
      page('stock', html, true);
      var save = function(){ try{ localStorage.setItem(key, JSON.stringify(draft)); localStorage.setItem(key + '_p', JSON.stringify(parts)); }catch(x){} };
      var prog = function(){ var n = r.items.filter(function(i){ return draft[i.id] !== undefined && draft[i.id] !== ''; }).length; document.getElementById('prog').innerHTML = '<b>' + n + '</b> of ' + r.items.length + ' counted'; return n; };
      var draw = function(){
        document.getElementById('list').innerHTML = groupItems(r.items, state.countGroup).map(function(g){
          return '<div class="h2" style="font-size:15px">' + e(g.title) + ' <span class="n">' + g.items.length + '</span></div>' + g.items.map(function(i){
            var v = draft[i.id];
            var pp = parts[i.id] || {}, off = offCount(i, v);
            if(i.loose && v !== undefined && v !== '' && pp.a === undefined && pp.b === undefined) pp = { a: v };
            var inputs = i.loose ? '<div class="loose"><label><input class="qty" inputmode="decimal" autocomplete="off" aria-label="' + e(i.name) + ': full ' + e(i.unit) + '" data-c="' + e(i.id) + '" data-part="a" value="' + (pp.a === undefined ? '' : e(String(pp.a))) + '"><span>' + e(i.unit) + '</span></label>' +
                '<label><input class="qty" inputmode="decimal" autocomplete="off" aria-label="' + e(i.name) + ': loose ' + e(i.looseUnit || 'pieces') + '" data-c="' + e(i.id) + '" data-part="b" value="' + (pp.b === undefined ? '' : e(String(pp.b))) + '"><span>+ loose ' + e(i.looseUnit || 'pcs') + '</span></label></div>'
              : '<input class="qty" inputmode="decimal" autocomplete="off" aria-label="' + e(i.name) + ' in ' + e(i.unit) + '" data-c="' + e(i.id) + '" value="' + (v === undefined ? '' : e(String(v))) + '">';
            return '<div class="row citem' + (v !== undefined && v !== '' ? ' done' : '') + (off ? ' off' : '') + '" id="c_' + e(i.id) + '">' + thumb(i.photo, true) + '<div class="rt"><b>' + e(i.name) + '</b><small>' + e(i.brand || '') + '</small>' +
              '<small>Count by: <b style="display:inline;font-size:13px">' + e(i.unit.toUpperCase()) + '</b>' + (i.loose ? ' (' + nd(i.loose) + ' ' + e(i.looseUnit || 'pcs') + ' each)' : '') + (i.last !== null ? ' · last time ' + q(i.last) : '') + '</small>' +
              '<small class="tot">' + (i.loose && v !== undefined && v !== '' ? '= ' + nd(v) + ' ' + e(i.unit) : '') + '</small><small class="offmsg">Very different from what we expect. Count again to be sure.</small></div>' + inputs + '</div>';
          }).join(''); }).join('');
        prog();
      };
      draw();
      on(app, '[data-grp]', 'click', function(b){ state.countGroup = b.dataset.grp; app.querySelectorAll('[data-grp]').forEach(function(x){ x.classList.toggle('on', x === b); }); draw(); });
      app.addEventListener('input', function(x){
        var t = x.target; if(!t.dataset || !t.dataset.c) return;
        var v = t.value.replace(',', '.').replace(/[^0-9.]/g, ''); if(v !== t.value) t.value = v;
        var id = t.dataset.c, it = byId[id], row = t.closest('.citem');
        if(t.dataset.part){
          var pp = parts[id] = parts[id] || {}; if(v === '') delete pp[t.dataset.part]; else pp[t.dataset.part] = v;
          v = pp.a === undefined && pp.b === undefined ? '' : String(Math.round(((Number(pp.a) || 0) + (Number(pp.b) || 0) / it.loose) * 1000) / 1000);
          row.querySelector('.tot').textContent = v === '' ? '' : '= ' + nd(v) + ' ' + it.unit;
        }
        if(v === '') delete draft[id]; else draft[id] = v;
        row.classList.toggle('done', v !== ''); row.classList.toggle('off', offCount(it, v)); save(); prog();
      });
      app.addEventListener('keydown', function(x){ if(x.key === 'Enter' && x.target.dataset && x.target.dataset.c){ x.preventDefault(); var all = Array.from(app.querySelectorAll('[data-c]')), n = all[all.indexOf(x.target) + 1]; if(n) n.focus(); else x.target.blur(); } });
      document.getElementById('sub').onclick = function(){
        var miss = r.items.filter(function(i){ return draft[i.id] === undefined || draft[i.id] === '' || isNaN(Number(draft[i.id])); });
        if(miss.length){ toast(miss.length + ' item' + (miss.length > 1 ? 's' : '') + ' not counted yet. Type 0 if there are none.', true); var el = document.getElementById('c_' + miss[0].id); if(el){ el.scrollIntoView({block: 'center'}); var inp = el.querySelector('input'); if(inp) inp.focus(); } return; }
        var odd = r.items.filter(function(i){ return offCount(i, draft[i.id]); });
        if(odd.length && !state.countOddOk){
          sheet(odd.length + ' count' + (odd.length > 1 ? 's look' : ' looks') + ' off', '<p class="hint">These are very different from what the app expects. A typo (20 instead of 2) or a missed shelf? Please count them again.</p>' +
            odd.map(function(i){ return '<div class="ln"><span>' + e(i.name) + '</span><b>' + nd(draft[i.id]) + ' ' + e(i.unit) + '</b></div>'; }).join('') +
            '<div class="btns"><button class="btn ghost" data-any>They\'re right</button><button class="btn" data-re>Recount</button></div>', function(sh, close){
              sh.querySelector('[data-re]').onclick = function(){ close(); var el = document.getElementById('c_' + odd[0].id); if(el){ el.scrollIntoView({block: 'center'}); var inp = el.querySelector('input'); if(inp) inp.focus(); } };
              sh.querySelector('[data-any]').onclick = function(){ close(); state.countOddOk = true; document.getElementById('sub').click(); state.countOddOk = false; };
            });
          return;
        }
        confirmSheet('Submit the stock take?', 'All ' + r.items.length + ' items counted. Jay and Hazel will see it straight away.', 'Submit', function(){
          var b = document.getElementById('sub'), dn = busy(b, 'Submitting…'), lines = {};
          r.items.forEach(function(i){ lines[i.id] = Number(draft[i.id]); });
          KK.post('stockCountSubmit', {lines: lines}).then(function(x){
            dn(); if(!x.ok) return toast(x.error, true);
            try{ localStorage.removeItem(key); }catch(err){}
            page('stock', '<div class="clear" style="margin-top:24px">✓ Stock take saved</div>' + (x.low.length ? '<div class="h2">Low or out <span class="n">' + x.low.length + '</span></div>' + x.low.map(function(l){
              return '<div class="row"><div class="rt"><b>' + e(l.name) + '</b><small>' + q(l.expected) + ' ' + e(l.unit) + ' left · minimum ' + q(l.min) + '</small></div>' + (l.importance === 'critical' ? '<span class="chip bad">Critical</span>' : '') + '</div>'; }).join('') +
              '<p class="hint">These are on Hazel\'s reorder list.</p>' : '') + '<a class="btn" style="margin-top:16px" href="#stock">Done</a>', true);
          });
        });
      };
    });
  }

  // ---------------------------------------------------------------- deliveries
  function newDelivery(){
    sheet('Delivery arrived', '<p class="hint">Take a clear photo of the invoice or delivery order (or pick the PDF). The app reads it, then you count what actually arrived.</p>' +
      '<label class="btn" style="margin-top:10px">📷 Photo or PDF of the invoice<input type="file" id="invf" accept="image/*,application/pdf" hidden></label>' +
      '<button class="btn ghost" id="byhand" style="margin-top:10px">No invoice: enter by hand</button><div id="im"></div>', function(sh, close){
        var go = function(file){
          var m = sh.querySelector('#im'); m.innerHTML = '<div class="msg ok" style="margin-top:12px">' + (file ? 'Reading the invoice… this takes about 20 seconds.' : 'Starting…') + '</div>';
          sh.querySelectorAll('button,label.btn').forEach(function(b){ b.style.pointerEvents = 'none'; b.style.opacity = '.5'; });
          (file ? readFile(file, 8) : Promise.resolve('')).then(function(data){ return KK.post('deliveryRead', data ? {file: data} : {}); }).then(function(x){
            if(!x.ok){ m.innerHTML = '<div class="msg bad" style="margin-top:12px">' + e(x.error) + '</div>'; sh.querySelectorAll('button,label.btn').forEach(function(b){ b.style.pointerEvents = ''; b.style.opacity = ''; }); return; }
            close(); state.delId = x.delivery.id; state.delNote = x.note || ''; go2();
          }, function(err){ m.innerHTML = '<div class="msg bad" style="margin-top:12px">' + e(err.message || err) + '</div>'; });
        };
        var go2 = function(){ if(location.hash === '#delivery') viewDelivery(); else location.hash = 'delivery'; };
        sh.querySelector('#invf').onchange = function(){ if(this.files[0]) go(this.files[0]); };
        sh.querySelector('#byhand').onclick = function(){ go(null); };
      });
  }
  function viewDeliveries(){
    loading();
    KK.post('deliveries').then(function(r){
      if(!r.ok) return fail(r);
      var chip = { checking: ['Checking', 'warn'], ok: ['OK', 'ok'], flagged: ['Problem', 'bad'], resolved: ['Sorted', ''] };
      page('stock', '<a class="back" href="#stock">‹ Stock</a><div class="ptitle">Deliveries</div><button class="btn" id="dlv" style="margin-top:8px">Delivery arrived</button>' +
        (r.deliveries.length ? r.deliveries.map(function(d){ var c = chip[d.status] || ['', ''];
          return '<a class="row" href="#delivery" data-dv="' + e(d.id) + '"><div class="rt"><b>' + e(d.supplier) + (d.invoiceNo ? ' · ' + e(d.invoiceNo) : '') + '</b><small>' + e(d.label) + ' · ' + d.lines + ' line' + (d.lines === 1 ? '' : 's') + ' · ' + e(d.by) +
            (d.flags ? ' · ' + d.flags + ' problem' + (d.flags > 1 ? 's' : '') : '') + '</small></div>' + (d.total !== null ? '<span class="amt" style="font-size:17px">' + money(d.total) + '</span>' : '') + '<span class="chip ' + c[1] + '">' + c[0] + '</span></a>'; }).join('')
          : '<div class="empty">No deliveries recorded yet.</div>'));
      document.getElementById('dlv').onclick = newDelivery;
      on(app, '[data-dv]', 'click', function(a){ state.delId = a.dataset.dv; state.delNote = ''; });
    });
  }
  function viewDelivery(){
    if(!state.delId) return go('deliveries');
    loading();
    KK.post('deliveryGet', {id: state.delId}).then(function(r){
      if(!r.ok) return fail(r);
      var d = r.delivery, editing = d.status === 'checking', lines = d.lines.map(function(l){ return Object.assign({}, l); }), itemById = {};
      r.items.forEach(function(i){ itemById[i.id] = i; });
      var head = '<a class="back" href="#deliveries">‹ Deliveries</a><div class="ptitle">' + e(d.supplier || 'Delivery') + '</div><div class="sub2">' + (d.invoiceNo ? 'Invoice ' + e(d.invoiceNo) + ' · ' : '') + e(nice(d.invoiceDate)) + ' · ' + e(d.byName) + '</div>' +
        (d.file ? '<a class="hint" href="' + e(d.file) + '" target="_blank" rel="noopener">View the invoice ↗</a>' : '');
      if(!editing){
        var chip = { ok: ['All matched', 'ok'], flagged: ['Problems: contact the supplier', 'bad'], resolved: ['Sorted', ''] }[d.status] || ['', ''];
        var html = head + '<div style="margin-top:10px"><span class="chip ' + chip[1] + '">' + chip[0] + '</span></div>' +
          (d.flags.length ? '<div class="card" style="border-color:#f3b3bf;background:#fff7f8"><h2>' + (d.status === 'resolved' ? 'What was wrong' : 'Tell ' + e(d.supplier || 'the supplier')) + '</h2>' + d.flags.map(function(f){ return '<div class="ln" style="display:block">' + (f.kind === 'qty' ? '📦 ' : '💲 ') + e(f.text) + '</div>'; }).join('') +
            (d.status === 'resolved' ? '<p class="hint">Sorted by ' + e(d.resolvedByName) + (d.resolution ? ': ' + e(d.resolution) : '') + '</p>' : '') + '</div>' : '') +
          '<div class="card"><h2>Lines</h2><table class="tbl"><tr><th>Item</th><th class="r">Invoice</th><th class="r">Arrived</th><th class="r">Price</th></tr>' + d.lines.map(function(l){
            return '<tr><td>' + e(l.stockName || l.description) + (l.stockName ? '' : '<br><small class="hint">not on stock list</small>') + '</td><td class="r">' + (l.countQty !== null && l.countQty !== undefined ? q(l.countQty) + ' ' + e(l.countUnit) : q(l.qty) + ' ' + e(l.unit)) + '</td>' +
              '<td class="r">' + (l.counted !== '' && l.counted !== undefined ? '<b' + (l.countQty !== null && Number(l.counted) !== Number(l.countQty) ? ' style="color:var(--red)"' : '') + '>' + q(l.counted) + '</b>' : '–') + '</td>' +
              '<td class="r">' + (l.unitPrice !== null ? money(l.unitPrice) : '–') + (l.priceFlag ? '<br><small style="color:var(--red);font-weight:800">' + (l.priceDiff > 0 ? '+' : '') + l.priceDiff + '%</small>' : '') + '</td></tr>'; }).join('') + '</table>' +
            (d.total !== null ? '<div class="ln sum"><span>Invoice total</span><b>' + money(d.total) + '</b></div>' : '') + '</div>';
        if(r.admin && d.status === 'flagged') html += '<div class="card"><h2>Sorted with the supplier?</h2><label class="f" for="rn">What happened</label><input id="rn" maxlength="300" placeholder="e.g. Credit note for the missing carton">' +
          (d.flags.some(function(f){ return f.kind === 'price'; }) ? '<label class="check" style="margin-top:10px"><input type="checkbox" id="up"> Update Hazel\'s price list to the invoice prices</label>' : '') + '<button class="btn" id="res" style="margin-top:12px">Mark as sorted</button></div>';
        if(r.admin) html += '<button class="linkbtn" id="del" style="margin-top:14px;color:var(--red)">Remove this delivery</button>';
        page('stock', html);
        var rb = document.getElementById('res');
        if(rb) rb.onclick = function(){ var dn = busy(rb); KK.post('deliveryResolve', {id: d.id, note: document.getElementById('rn').value, updatePrices: !!(document.getElementById('up') || {}).checked}).then(function(x){ dn(); if(!x.ok) return toast(x.error, true); toast('Marked as sorted'); viewDelivery(); }); };
        var db = document.getElementById('del');
        if(db) db.onclick = function(){ confirmSheet('Remove this delivery?', 'Its stock comes off the balances. This can\'t be undone.', 'Remove', function(){ KK.post('deliveryDelete', {id: d.id}).then(function(x){ if(!x.ok) return toast(x.error, true); go('deliveries'); }); }, true); };
        return;
      }
      var opts = '<option value="">Not on the stock list</option>' + groupItems(r.items, 'section').map(function(g){ return '<optgroup label="' + e(g.title) + '">' + g.items.map(function(i){ return '<option value="' + e(i.id) + '">' + e(i.name) + (i.brand ? ' · ' + e(i.brand) : '') + '</option>'; }).join('') + '</optgroup>'; }).join('');
      var html2 = head + (r.dup ? '<div class="msg bad" id="dupw" style="margin-top:10px">This invoice number from ' + e(d.supplier) + ' is already recorded (' + e(r.dup.date) + '). If it\'s the same delivery, remove this one.</div>' : '') + (state.delNote ? '<div class="msg warn" style="margin-top:10px">' + e(state.delNote) + '</div>' : d.readBy ? '<div class="msg ok" style="margin-top:10px">Read from the invoice. Check each line, then count what actually arrived.</div>' : '') +
        '<div class="card"><div class="row2"><div><label class="f" for="dsu">Supplier</label><input id="dsu" list="sups" value="' + e(d.supplier) + '"><datalist id="sups">' + r.suppliers.map(function(s){ return '<option value="' + e(s) + '">'; }).join('') + '</datalist></div>' +
        '<div><label class="f" for="dno">Invoice no.</label><input id="dno" value="' + e(d.invoiceNo) + '"></div></div><div class="row2"><div><label class="f" for="ddt">Invoice date</label><input id="ddt" type="date" value="' + e(d.invoiceDate) + '"></div>' +
        '<div><label class="f" for="dtot">Total (with GST)</label><input id="dtot" inputmode="decimal" value="' + (d.total === null ? '' : d.total) + '"></div></div></div>' +
        '<div id="lines"></div><button class="btn ghost" id="addl" style="margin-top:10px">+ Add a line</button>' +
        '<div class="btns" style="margin-top:16px"><button class="btn ghost" id="later">Save for later</button><button class="btn" id="conf">Confirm delivery</button></div>';
      page('stock', html2, true);
      var drawLines = function(){
        document.getElementById('lines').innerHTML = lines.map(function(l, k){
          var it = itemById[l.stockId], unit = it ? it.unit : '';
          var pc = l.priceDiff === null || l.priceDiff === undefined ? '' : l.priceFlag ? '<span class="chip bad">' + (l.priceDiff > 0 ? '+' : '') + l.priceDiff + '% vs Hazel\'s ' + money(l.listPrice) + '</span>' : '<span class="chip ok">Price matches list</span>';
          return '<div class="card dline"><div style="display:flex;gap:8px;align-items:center"><b style="flex:1">Line ' + (k + 1) + '</b>' + pc + '<button class="linkbtn" data-rm="' + k + '" aria-label="Remove line ' + (k + 1) + '">Remove</button></div>' +
            '<label class="f" for="ld' + k + '">On the invoice</label><input id="ld' + k + '" data-l="' + k + '" data-f="description" value="' + e(l.description) + '">' +
            '<div class="row3"><div><label class="f" for="lq' + k + '">Qty</label><input id="lq' + k + '" data-l="' + k + '" data-f="qty" inputmode="decimal" value="' + (l.qty === null ? '' : l.qty) + '"></div>' +
            '<div><label class="f" for="lu' + k + '">Unit</label><input id="lu' + k + '" data-l="' + k + '" data-f="unit" value="' + e(l.unit) + '"></div>' +
            '<div><label class="f" for="lp' + k + '">Price each</label><input id="lp' + k + '" data-l="' + k + '" data-f="unitPrice" inputmode="decimal" value="' + (l.unitPrice === null ? '' : l.unitPrice) + '"></div></div>' +
            '<label class="f" for="ls' + k + '">Stock item</label><select id="ls' + k + '" data-l="' + k + '" data-f="stockId">' + opts + '</select>' +
            (it ? '<div class="row2"><div><label class="f" for="lc' + k + '">Invoice says (' + e(unit) + ')</label><input id="lc' + k + '" data-l="' + k + '" data-f="countQty" inputmode="decimal" value="' + (l.countQty === null || l.countQty === undefined ? '' : l.countQty) + '"></div>' +
              '<div><label class="f" for="la' + k + '">Arrived: count it</label><div style="display:flex;gap:6px"><input id="la' + k + '" class="' + (l.counted === '' || l.counted === undefined ? 'need' : '') + '" data-l="' + k + '" data-f="counted" inputmode="decimal" value="' + (l.counted === '' || l.counted === undefined ? '' : l.counted) + '"><button class="btn ghost sm" data-same="' + k + '" title="Same as the invoice">✓ Same</button></div></div></div>' : '') + '</div>';
        }).join('') || '<div class="empty">No lines yet. Add each item on the invoice.</div>';
        lines.forEach(function(l, k){ var s = document.getElementById('ls' + k); if(s) s.value = l.stockId || ''; });
      };
      drawLines();
      var box = document.getElementById('lines');
      box.addEventListener('input', function(x){ var t = x.target; if(!t.dataset.l) return; var l = lines[+t.dataset.l], f = t.dataset.f;
        if(f === 'stockId') return; l[f] = ['qty', 'unitPrice', 'countQty', 'counted'].indexOf(f) >= 0 ? (t.value.trim() === '' ? (f === 'counted' ? '' : null) : Number(t.value.replace(',', '.'))) : t.value;
        if(f === 'counted') t.classList.toggle('need', t.value.trim() === ''); });
      box.addEventListener('change', function(x){ var t = x.target; if(t.dataset.f !== 'stockId') return; var l = lines[+t.dataset.l]; l.stockId = t.value; if(!t.value){ l.countQty = null; l.counted = ''; } else if(l.countQty === null || l.countQty === undefined) l.countQty = l.qty; drawLines(); });
      on(box, '[data-same]', 'click', function(b){ var l = lines[+b.dataset.same]; if(l.countQty === null || l.countQty === undefined) return toast('Fill in what the invoice says first.', true); l.counted = l.countQty; drawLines(); });
      on(box, '[data-rm]', 'click', function(b){ lines.splice(+b.dataset.rm, 1); drawLines(); });
      document.getElementById('dno').addEventListener('input', function(){ var w = document.getElementById('dupw'); if(w) w.remove(); });
      document.getElementById('addl').onclick = function(){ lines.push({ description: '', qty: null, unit: '', unitPrice: null, stockId: '', countQty: null, counted: '' }); drawLines(); };
      var send = function(confirm, btn, before){
        if(confirm && r.countToday && before === undefined){
          sheet('Before or after the stock take?', '<p>Today\'s stock take was done at <b>' + e(r.countToday.at) + '</b> by ' + e(r.countToday.by) + '. Did this delivery arrive before it was counted?</p>' +
            '<div class="btns"><button class="btn ghost" data-b="1">Before: it\'s in the count</button><button class="btn" data-b="0">After the count</button></div>', function(sh, close){
              sh.querySelectorAll('[data-b]').forEach(function(b){ b.onclick = function(){ close(); send(true, btn, b.dataset.b === '1'); }; }); });
          return;
        }
        var dn = busy(btn, confirm ? 'Checking…' : 'Saving…');
        lines.forEach(function(l){ if(l.amount === undefined || l.amount === null) l.amount = l.qty !== null && l.unitPrice !== null ? Math.round(l.qty * l.unitPrice * 100) / 100 : null; });
        KK.post('deliverySave', {id: d.id, supplier: document.getElementById('dsu').value, invoiceNo: document.getElementById('dno').value, invoiceDate: document.getElementById('ddt').value,
          total: document.getElementById('dtot').value.trim(), lines: lines, confirm: confirm, arrivedBefore: !!before}).then(function(x){
          dn(); if(!x.ok) return toast(x.error, true);
          state.delNote = ''; toast(confirm ? (x.delivery.flags.length ? 'Saved. ' + x.delivery.flags.length + ' problem' + (x.delivery.flags.length > 1 ? 's' : '') + ' flagged to Jay and Hazel' : 'Delivery confirmed') : 'Saved for later', confirm && x.delivery.flags.length);
          if(confirm) viewDelivery(); else go('deliveries');
        });
      };
      document.getElementById('later').onclick = function(){ send(false, this); };
      document.getElementById('conf').onclick = function(){ send(true, this); };
    });
  }

  // ---------------------------------------------------------------- reorder list (Hazel)
  function viewReorder(){
    loading();
    KK.post('reorder').then(function(r){
      if(!r.ok) return fail(r);
      var html = '<a class="back" href="#stock">‹ Stock</a><div class="ptitle">Reorder</div><p class="hint">Items at or under their minimum, or that run out before the supplier can deliver. Quantities top you back up; change them before ordering.</p>';
      if(!r.groups.length) html += '<div class="clear">✓ Nothing to order right now.</div>';
      r.groups.forEach(function(g, gi){
        html += '<div class="card" data-g="' + gi + '"><h2>' + e(g.supplier || 'No supplier set') + (g.critical ? ' <span class="chip bad">' + g.critical + ' critical</span>' : '') + '</h2><div class="hint" style="margin:0 0 6px">' +
          (g.supplier ? (g.lead !== null ? g.lead + '-day lead time · ' : 'Lead time not set · ') + 'order by <b>' + e(nice(g.orderBy)) + '</b>' + (g.estimate ? ' · about ' + money(g.estimate) : '') : 'Set a supplier for these items in Items, prices & suppliers') + '</div>' +
          g.items.map(function(i){ var s = STATUS[i.status];
            return '<div class="ln" style="align-items:center;gap:10px">' + thumb(i.photo) + '<span style="flex:1;min-width:0"><b style="display:block;font-weight:800">' + e(i.name) + '</b><small class="hint" style="margin:0">' + q(i.expected) + ' ' + e(i.unit) + ' left' + (i.min !== null ? ' · min ' + q(i.min) : '') +
              (i.runOut && i.daysLeft <= 30 ? ' · runs out ' + e(nice(i.runOut)) : '') + '</small> <span class="chip ' + s[1] + '">' + s[0] + '</span>' + (i.importance === 'critical' ? ' <span class="chip bad">Critical</span>' : '') + '</span>' +
              '<input class="qty" style="width:74px" inputmode="decimal" data-o="' + e(i.id) + '" value="' + i.order + '" aria-label="Order quantity of ' + e(i.name) + ' in ' + e(i.orderUnit) + '"><small class="hint" style="margin:0;width:48px">' + e(i.orderUnit) +
              (i.orderPer !== 1 ? '<br>= ' + nd(i.order / i.orderPer) + ' ' + e(i.unit) : '') + '</small></div>'; }).join('') +
          (g.supplier ? '<div class="btns" style="margin-top:10px"><button class="btn ghost sm" data-copy="' + gi + '">Copy order message</button>' + (g.phone ? '<a class="btn ghost sm" data-wa="' + gi + '" target="_blank" rel="noopener" href="#">WhatsApp</a>' : '') + '<button class="btn sm" data-ord="' + gi + '">Mark as ordered</button></div>' : '') + '</div>';
      });
      if(r.ordered.length) html += '<div class="h2">Already ordered</div>' + r.ordered.map(function(o){ return '<div class="row"><div class="rt"><b>' + e(o.name) + '</b><small>' + e(o.supplier) + ' · ordered ' + e(o.label) + ' · ' + q(o.expected) + ' ' + e(o.unit) + ' left</small></div></div>'; }).join('') +
        '<p class="hint">These come off the list when the delivery is confirmed.</p>';
      page('stock', html, true);
      var linesOf = function(gi){ return Array.from(app.querySelectorAll('[data-g="' + gi + '"] [data-o]')).map(function(x){ return { id: x.dataset.o, qty: Number(x.value) || 0 }; }).filter(function(l){ return l.qty > 0; }); };
      var msg = function(gi){ var g = r.groups[gi], ls = linesOf(gi), by = {}; g.items.forEach(function(i){ by[i.id] = i; });
        return 'Hi ' + g.supplier + ', Kwazy Korndog here. Order for our Mandai kitchen please:\n' + ls.map(function(l){ var i = by[l.id]; return '- ' + i.name + (i.brand ? ' (' + i.brand + ')' : '') + ': ' + l.qty + ' ' + i.orderUnit; }).join('\n') + '\nThank you!'; };
      on(app, '[data-copy]', 'click', function(b){ var t = msg(+b.dataset.copy);
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function(){ toast('Copied. Paste it into WhatsApp or email'); }, function(){ sheet('Order message', '<textarea rows="10" style="width:100%">' + e(t) + '</textarea>'); }); });
      on(app, '[data-wa]', 'click', function(a){ var g = r.groups[+a.dataset.wa]; a.href = 'https://wa.me/' + String(g.phone).replace(/\D/g, '').replace(/^(?!65)(\d{8})$/, '65$1') + '?text=' + encodeURIComponent(msg(+a.dataset.wa)); });
      on(app, '[data-ord]', 'click', function(b){ var gi = +b.dataset.ord, g = r.groups[gi], dn = busy(b);
        KK.post('orderMark', {supplier: g.supplier, lines: linesOf(gi)}).then(function(x){ dn(); if(!x.ok) return toast(x.error, true); toast('Marked as ordered from ' + g.supplier); viewReorder(); }); });
    });
  }

  // ---------------------------------------------------------------- cost of goods used (admin)
  function viewStockCost(){
    loading();
    var p = state.costPeriod || KK.ymd().slice(0, 7);
    KK.post('stockCost', {period: p}).then(function(r){
      if(!r.ok) return fail(r);
      var G = r.groups, waste = G.cogs.wasted + G.supplies.wasted;
      var html = '<a class="back" href="#stock">‹ Stock</a><div class="ptitle">Cost of goods used</div><div class="mnav"><button id="pm" aria-label="Previous month">‹</button><b>' + e(r.label) + '</b><button id="nm" aria-label="Next month">›</button></div>';
      if(r.notEnough) html += '<div class="empty">Needs at least two stock takes in or before ' + e(r.label) + '.</div>';
      else {
        html += '<div class="sub2" style="margin-top:6px">From the count on ' + e(r.from) + ' to ' + e(r.to) + (r.partial ? ' (first count of the month: earlier use isn\'t included)' : '') + '</div>' +
          '<div class="tiles" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="tile"><b>' + money(G.cogs.used) + '</b><span>Ingredients & packaging used</span><small>cost of goods</small></div>' +
          '<div class="tile"><b>' + money(G.supplies.used) + '</b><span>Supplies used</span><small>PPE, cleaning, kitchen</small></div>' +
          '<div class="tile"><b>' + money(waste) + '</b><span>Thrown away</span><small>expired, dropped, damaged</small></div>' +
          '<div class="tile"><b>' + money(r.purchases) + '</b><span>Bought (invoices)</span><small>' + r.invoices + ' deliver' + (r.invoices === 1 ? 'y' : 'ies') + ', before GST</small></div></div>' +
          '<div class="card"><h2>By section</h2>' + r.sections.map(function(s){ return '<div class="ln"><span>' + e(s.name) + '</span><b>' + money(s.value) + '</b></div>'; }).join('') + '</div>' +
          '<div class="card"><h2>Biggest costs</h2><table class="tbl"><tr><th>Item</th><th class="r">Used</th><th class="r">Cost</th></tr>' + r.items.slice(0, 12).map(function(i){
            return '<tr><td>' + e(i.name) + (i.group === 'supplies' ? ' <small class="hint">supplies</small>' : '') + '</td><td class="r">' + q(i.used) + ' ' + e(i.unit) + '</td><td class="r">' + money(i.value) + '</td></tr>'; }).join('') + '</table></div>' +
          (r.noCost.length ? '<div class="note">' + r.noCost.length + ' item' + (r.noCost.length > 1 ? 's were' : ' was') + ' used but ' + (r.noCost.length > 1 ? 'have' : 'has') + ' no cost yet, so ' + (r.noCost.length > 1 ? 'they\'re' : 'it\'s') + ' not in these totals: ' + e(r.noCost.join(', ')) + '. <a href="#stockitems">Link them to Hazel\'s prices</a>.</div>' : '');
      }
      html += '<p class="fine">Used = opening count + delivered − thrown away − closing count, valued at Hazel\'s prices ' + (r.gst ? 'with' : 'before') + ' GST. "Bought" is what the invoices charged.</p>';
      page('stock', html);
      document.getElementById('pm').onclick = function(){ state.costPeriod = addMonth(p, -1); viewStockCost(); };
      document.getElementById('nm').onclick = function(){ state.costPeriod = addMonth(p, 1); viewStockCost(); };
    });
  }

  // ---------------------------------------------------------------- items, prices, suppliers (admin)
  function viewStockItems(){
    loading();
    KK.post('stockSetup').then(function(r){
      if(!r.ok) return fail(r);
      state.setupTab = state.setupTab || 'items';
      var P = {}; r.prices.forEach(function(p){ P[p.id] = p; });
      var tabsH = '<div class="seg">' + [['items', 'Items (' + r.items.length + ')'], ['prices', 'Hazel\'s prices (' + r.prices.length + ')'], ['suppliers', 'Suppliers (' + r.suppliers.length + ')']].map(function(t){
        return '<button data-st="' + t[0] + '" class="' + (state.setupTab === t[0] ? 'on' : '') + '">' + e(t[1]) + '</button>'; }).join('') + '</div>';
      var html = '<a class="back" href="#stock">‹ Stock</a><div class="ptitle">Items, prices & suppliers</div>' +
        '<div class="btns" style="margin-top:4px"><button class="btn ghost sm" id="expS">Copy your stock setup</button>' + (KK.DEMO ? '' : '<button class="btn ghost sm" id="pasteS">Paste a saved setup</button>') + '</div>' + tabsH;
      if(state.setupTab === 'items'){
        var chk = r.items.filter(function(i){ return i.active && (i.check || i.cost === null); });
        html += '<p class="hint">Each item is counted in one unit (carton, packet…). Link it to a product on Hazel\'s list and say how many of that product make one unit, so it gets a cost.</p>' +
          '<label class="check"><input type="checkbox" id="onlyChk"' + (state.onlyChk ? ' checked' : '') + '> Only the ' + chk.length + ' that need checking</label><button class="btn ghost sm" id="addI" style="margin-top:8px">+ Add an item</button>';
        var list = state.onlyChk ? chk : r.items;
        html += groupItems(list, 'section').map(function(g){ return '<div class="h2" style="font-size:15px">' + e(g.title) + ' <span class="n">' + g.items.length + '</span></div>' + g.items.map(function(i){
          return '<button class="row sitem" data-ei="' + e(i.id) + '"' + (i.active ? '' : ' style="opacity:.55"') + '>' + thumb(i.photo) + '<div class="rt"><b>' + e(i.name) + (i.active ? '' : ' (not counted)') + '</b><small>' +
            (i.cost !== null ? '1 ' + e(i.unit) + ' = ' + nd(i.conv) + ' × ' + e(i.pack) + ' → <b style="display:inline;font-size:13px">' + money(i.cost) + '</b>' : i.pack ? 'Linked to ' + e(i.pack) + ' · how many per ' + e(i.unit) + '?' : 'No price linked') +
            ' · ' + e(i.supplier || 'no supplier') + ' · min ' + q(i.min) + '</small>' + (i.check ? '<small style="color:var(--amber);font-weight:800">⚠ ' + e(i.check) + '</small>' : '') + '</div><span class="chev2">›</span></button>'; }).join(''); }).join('');
      } else if(state.setupTab === 'prices'){
        html += '<p class="hint">Hazel\'s list of everything she buys. Update a price here, or import her spreadsheet again (save it as CSV first): changes are kept as price history.</p>' +
          '<div class="btns"><button class="btn ghost sm" id="addP">+ Add a product</button><label class="btn ghost sm">Import CSV<input type="file" id="csv" accept=".csv,text/csv" hidden></label></div>' +
          '<input id="psearch" placeholder="Search products or suppliers" style="margin-top:10px" value="' + e(state.psearch || '') + '"><div id="plist"></div>';
      } else {
        html += '<p class="hint">Lead time is how many days from ordering to delivery. It decides when items go on the reorder list.</p><button class="btn ghost sm" id="addS">+ Add a supplier</button>' +
          r.suppliers.map(function(s, k){ return '<button class="row" data-es="' + k + '"><div class="rt"><b>' + e(s.name) + '</b><small>' + (s.lead !== null ? s.lead + '-day lead time' : '⚠ Lead time not set') + (s.phone ? ' · ' + e(s.phone) : '') + (s.notes ? ' · ' + e(s.notes) : '') + '</small></div><span class="chev2">›</span></button>'; }).join('');
      }
      page('stock', html, true);
      on(app, '[data-st]', 'click', function(b){ state.setupTab = b.dataset.st; viewStockItems(); });
      document.getElementById('expS').onclick = exportSetup;
      var psb = document.getElementById('pasteS'); if(psb) psb.onclick = function(){ pasteSetup(true); };
      if(state.setupTab === 'items'){
        document.getElementById('onlyChk').onchange = function(){ state.onlyChk = this.checked; viewStockItems(); };
        document.getElementById('addI').onclick = function(){ itemForm({ id: '', name: '', brand: '', section: '', unit: 'packet', supplier: '', importance: 'medium', min: null, par: null, priceId: '', conv: null, group: 'cogs', active: true, check: '' }, r); };
        on(app, '[data-ei]', 'click', function(b){ itemForm(r.items.filter(function(i){ return i.id === b.dataset.ei; })[0], r); });
      } else if(state.setupTab === 'prices'){
        var drawP = function(){ var s = (state.psearch || '').toLowerCase();
          document.getElementById('plist').innerHTML = r.prices.filter(function(p){ return !s || (p.item + ' ' + p.brand + ' ' + p.supplier + ' ' + p.category).toLowerCase().indexOf(s) >= 0; }).map(function(p){
            return '<button class="row" data-ep="' + e(p.id) + '"><div class="rt"><b>' + e(p.item) + (p.brand ? ' · ' + e(p.brand) : '') + '</b><small>' + e(p.supplier || 'No supplier') + ' · ' + e(String(p.size)) + ' ' + e(p.unit) +
              (p.prev !== null && p.prev !== p.ex ? ' · was ' + money(p.prev) : '') + '</small></div><span class="amt" style="font-size:17px">' + (p.ex !== null ? money(p.ex) : '–') + '</span></button>'; }).join(''); };
        drawP();
        document.getElementById('psearch').oninput = function(){ state.psearch = this.value; drawP(); };
        on(app, '[data-ep]', 'click', function(b){ priceForm(P[b.dataset.ep], r); });
        document.getElementById('addP').onclick = function(){ priceForm({ id: '', item: '', brand: '', supplier: '', category: '', size: '', unit: 'g', ex: null, inc: null }, r); };
        document.getElementById('csv').onchange = function(){ var f = this.files[0]; if(!f) return; var rd = new FileReader();
          rd.onload = function(){ var rows = parseCsv(String(rd.result));
            confirmSheet('Import ' + Math.max(0, rows.length - 1) + ' rows?', 'Columns in Hazel\'s order: ingredient, brand, supplier, category, weight, unit, cost without GST, cost with GST. Existing products are matched by name, brand, supplier and size; changed prices are kept as history.', 'Import', function(){
              KK.post('pricesImport', {rows: rows}).then(function(x){ if(!x.ok) return toast(x.error, true); toast(x.added + ' added, ' + x.changed + ' price changes'); viewStockItems(); }); }); };
          rd.readAsText(f); };
      } else {
        on(app, '[data-es]', 'click', function(b){ supplierForm(r.suppliers[+b.dataset.es]); });
        document.getElementById('addS').onclick = function(){ supplierForm({ name: '', lead: null, phone: '', notes: '' }); };
      }
    });
  }
  // Carry the stock setup from the demo to the live app: items, units, suppliers, lead times, Hazel's prices.
  function exportSetup(){
    sheet('Copy your stock setup', '<p class="hint">Copies the items (names, units, photos, loose counts, links to Hazel\'s prices), Hazel\'s price list and the suppliers with lead times as text. Stock takes and deliveries aren\'t included.</p>' +
      '<label class="check"><input type="checkbox" id="xlv"' + (KK.DEMO ? '' : ' checked') + '> Include minimums, top-up levels and importance</label>' +
      (KK.DEMO ? '<div class="hint">The demo filled these in with made-up numbers. Tick only if you\'ve set the real ones.</div>' : '') +
      '<button class="btn" id="xcp" style="margin-top:14px">Copy setup</button><div id="xout"></div>' +
      '<button class="linkbtn" id="xgo">Or download it as a file (laptop)</button>', function(sh){
        var get = function(){ return KK.post('stockExport', {levels: sh.querySelector('#xlv').checked}); };
        sh.querySelector('#xcp').onclick = function(){ var b = this, dn = busy(b, 'Preparing…');
          get().then(function(x){ dn(); if(!x.ok) return toast(x.error, true);
            var txt = JSON.stringify(x), out = sh.querySelector('#xout');
            out.innerHTML = '<textarea rows="5" style="width:100%;font-size:11px;margin-top:10px" readonly aria-label="Stock setup text">' + e(txt) + '</textarea>' +
              '<p class="hint" id="xmsg"></p>';
            var ta = out.querySelector('textarea'), msg = out.querySelector('#xmsg'), done = function(ok){
              msg.innerHTML = ok ? '<b style="color:var(--ok)">✓ Copied (' + x.items.length + ' items, ' + x.suppliers.length + ' suppliers).</b> Paste it somewhere safe, e.g. a note or a WhatsApp message to yourself. When you go live, tap <b>Paste a saved setup</b> on the Stock screen.'
                : 'Your browser didn\'t allow copying. Tap in the box, choose <b>Select all</b>, then <b>Copy</b>.'; };
            ta.focus(); ta.select(); ta.setSelectionRange(0, txt.length);
            var ok = false; try{ ok = document.execCommand('copy'); }catch(err){ ok = false; }
            if(ok) return done(true);
            if(navigator.clipboard) navigator.clipboard.writeText(txt).then(function(){ done(true); }, function(){ done(false); }); else done(false);
          }); };
        sh.querySelector('#xgo').onclick = function(){ get().then(function(x){ if(!x.ok) return toast(x.error, true);
          try{ var blob = new Blob([JSON.stringify(x)], {type: 'application/json'}), a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = 'KK stock setup ' + KK.ymd() + '.json'; document.body.appendChild(a); a.click(); a.remove(); }catch(err){ toast('Downloads aren\'t allowed here. Use Copy setup.', true); } }); };
      });
  }
  function pasteSetup(replace){
    sheet('Paste a saved setup', '<p class="hint">Paste the text you copied from the demo (Stock → Items, prices & suppliers → Copy your stock setup).</p><textarea id="pst" rows="8" style="width:100%;font-size:12px" placeholder="Paste here"></textarea>' +
      '<button class="btn" id="pgo" style="margin-top:12px">Load it</button>', function(sh, close){
        sh.querySelector('#pgo').onclick = function(){ var t = sh.querySelector('#pst').value.trim(); if(!t) return toast('Paste the setup first.', true); close(); loadSetupText(t, replace); };
      });
  }
  function loadSetupFile(file, replace){
    if(!file) return;
    var rd = new FileReader();
    rd.onload = function(){ loadSetupText(String(rd.result), replace); };
    rd.readAsText(file);
  }
  function loadSetupText(text, replace){
    (function(){
      var d; try{ d = JSON.parse(text); }catch(err){ return toast('That isn\'t a saved stock setup. Copy it again from the demo.', true); }
      if(!d || !Array.isArray(d.items) || !d.items.length) return toast('That file has no stock items in it.', true);
      confirmSheet('Load this stock setup?', d.items.length + ' items, ' + (d.prices || []).length + ' prices and ' + (d.suppliers || []).length + ' suppliers' + (d.exported ? ', saved ' + e(String(d.exported).slice(0, 16)) : '') + '.' +
        (replace ? ' It replaces the current list. This only works before any stock take or delivery is recorded.' : '') + (d.levels === false ? ' Minimums and top-up levels aren\'t in this file; set them afterwards.' : ''), 'Load it', function(){
        d.replace = !!replace;
        KK.post('stockImport', d).then(function(x){ if(!x.ok) return toast(x.error, true); toast(x.items + ' items loaded'); if(location.hash === '#stockitems') viewStockItems(); else go('stockitems'); });
      }, !!replace);
    })();
  }
  function parseCsv(t){
    var rows = [], row = [], f = '', qd = false;
    for(var i = 0; i < t.length; i++){ var c = t[i];
      if(qd){ if(c === '"' && t[i + 1] === '"'){ f += '"'; i++; } else if(c === '"') qd = false; else f += c; }
      else if(c === '"') qd = true; else if(c === ',') { row.push(f); f = ''; } else if(c === '\n' || c === '\r'){ if(c === '\r' && t[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c; }
    if(f || row.length){ row.push(f); rows.push(row); }
    return rows.filter(function(r){ return r.some(function(x){ return String(x).trim(); }); });
  }
  function itemForm(i, r){
    var sections = {}; r.items.forEach(function(x){ sections[x.section] = 1; });
    var bySup = {}; r.prices.forEach(function(p){ (bySup[p.supplier || 'No supplier'] = bySup[p.supplier || 'No supplier'] || []).push(p); });
    var popts = '<option value="">Not linked</option>' + Object.keys(bySup).sort().map(function(s){ return '<optgroup label="' + e(s) + '">' + bySup[s].map(function(p){
      return '<option value="' + e(p.id) + '">' + e(p.item) + (p.brand ? ' · ' + e(p.brand) : '') + ' · ' + e(String(p.size)) + ' ' + e(p.unit) + ' · ' + (p.ex !== null ? money(p.ex) : '–') + '</option>'; }).join('') + '</optgroup>'; }).join('');
    sheet(i.id ? i.name : 'New item', (i.check ? '<div class="msg warn" style="margin-top:6px">⚠ ' + e(i.check) + '</div>' : '') +
      '<div style="display:flex;gap:12px;align-items:center;margin-top:8px">' + thumb(i.photo, true) + '<label class="btn ghost sm">Change photo<input type="file" id="fph" accept="image/*" hidden></label></div>' +
      '<label class="f" for="fn">Name</label><input id="fn" value="' + e(i.name) + '" maxlength="80"><label class="f" for="fb">Brand / how to spot it</label><input id="fb" value="' + e(i.brand) + '" maxlength="80">' +
      '<div class="row2"><div><label class="f" for="fs">Section</label><input id="fs" list="secs" value="' + e(i.section) + '"><datalist id="secs">' + Object.keys(sections).map(function(s){ return '<option value="' + e(s) + '">'; }).join('') + '</datalist></div>' +
      '<div><label class="f" for="fu">Count by</label><input id="fu" value="' + e(i.unit) + '" maxlength="20" placeholder="carton, packet…"></div></div>' +
      '<div class="row2"><div><label class="f" for="fsu">Supplier</label><select id="fsu"><option value="">Not set</option>' + r.suppliers.map(function(s){ return '<option' + (s.name === i.supplier ? ' selected' : '') + '>' + e(s.name) + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="f" for="fi">Importance</label><select id="fi">' + IMP_ORDER.map(function(k){ return '<option value="' + k + '"' + (k === i.importance ? ' selected' : '') + '>' + IMP[k] + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="row2"><div><label class="f" for="fmn">Minimum</label><input id="fmn" inputmode="decimal" value="' + (i.min === null ? '' : i.min) + '"></div><div><label class="f" for="fpr">Top up to</label><input id="fpr" inputmode="decimal" value="' + (i.par === null ? '' : i.par) + '"></div></div>' +
      sugHint(i) +
      '<label class="f" for="flo">Loose count (optional)</label><div class="row2"><div><input id="flo" inputmode="decimal" value="' + (i.loose ? i.loose : '') + '" placeholder="e.g. 12"><div class="hint">how many in 1 <span class="fuu2">' + e(i.unit) + '</span></div></div>' +
      '<div><input id="flu" value="' + e(i.looseUnit || '') + '" placeholder="e.g. packet" maxlength="20"><div class="hint">loose unit name</div></div></div><div class="hint">Gives the counter a second box for loose ones, e.g. 2 cartons + 7 packets.</div>' +
      (function(){ var has = i.orderUnit && i.orderPer, big = has && i.orderPer < 1, A = has ? (big ? 1 : +i.orderPer.toFixed(4)) : '', B = has ? (big ? +(1 / i.orderPer).toFixed(4) : 1) : '';
        return '<label class="f" for="fou">Order from the supplier in (optional)</label>' +
        '<div class="eq"><input id="foa" inputmode="decimal" value="' + A + '" placeholder="1" aria-label="Number of order units"><input id="fou" value="' + e(has ? i.orderUnit : '') + '" placeholder="e.g. ctn" maxlength="20" aria-label="Order unit">' +
        '<b>=</b><input id="fob" inputmode="decimal" value="' + B + '" placeholder="20" aria-label="Number of count units"><span class="fuu2">' + e(i.unit) + '</span></div>' +
        '<div class="hint">For example <b>2 kg = 1 block</b>, or <b>1 ctn = 20 packet</b>. Leave blank if you order in ' + e(i.unit || 'the same unit') + '.</div>' +
        '<label class="f" for="foq">Usual order size (optional)</label><div class="eq"><input id="foq" inputmode="decimal" value="' + (i.orderQty ? i.orderQty : '') + '" placeholder="e.g. 150"><span id="fqu">' + e(has ? i.orderUnit : i.unit) + '</span></div>' +
        '<div class="hint">If set, the reorder list always suggests this amount.</div>'; })() +
      '<label class="f" for="fp">Product on Hazel\'s list</label><select id="fp">' + popts + '</select>' +
      '<label class="f" for="fc">How many of that product make 1 <span id="fuu">' + e(i.unit) + '</span>?</label><input id="fc" inputmode="decimal" value="' + (i.conv === null ? '' : i.conv) + '" placeholder="e.g. 12 if a carton holds 12 packs">' +
      '<div class="hint" id="fcost"></div>' +
      '<label class="f" for="fg">Counts as</label><select id="fg"><option value="cogs">Cost of goods (ingredients, packaging)</option><option value="supplies">Supplies (PPE, cleaning, kitchen)</option></select>' +
      (i.check ? '<label class="check" style="margin-top:10px"><input type="checkbox" id="fck"> I\'ve checked this item</label>' : '') +
      '<label class="check" style="margin-top:10px"><input type="checkbox" id="fa"' + (i.active ? ' checked' : '') + '> Count this item at stock take</label>' +
      '<button class="btn" id="fsave" style="margin-top:14px">Save item</button>', function(sh, close){
        var P = {}; r.prices.forEach(function(p){ P[p.id] = p; });
        sh.querySelector('#fp').value = i.priceId || ''; sh.querySelector('#fg').value = i.group; bindSug(sh, '#fmn', '#fpr');
        sh.querySelector('#fou').addEventListener('input', function(){ sh.querySelector('#fqu').textContent = this.value.trim() || sh.querySelector('#fu').value || 'unit'; });
        var photo = null;
        var cost = function(){ var p = P[sh.querySelector('#fp').value], c = Number(sh.querySelector('#fc').value), u = sh.querySelector('#fu').value || 'unit';
          sh.querySelector('#fuu').textContent = u; sh.querySelectorAll('.fuu2').forEach(function(x){ x.textContent = u; });
          sh.querySelector('#fcost').innerHTML = p && c > 0 && p.ex !== null ? 'Cost per ' + e(u) + ': <b>' + money(p.ex * c) + '</b> (' + nd(c) + ' × ' + money(p.ex) + ' before GST)' : p ? 'Fill in how many to get a cost.' : 'Without a product, this item has no cost in the cost of goods.'; };
        ['#fp', '#fc', '#fu'].forEach(function(s){ sh.querySelector(s).addEventListener('input', cost); sh.querySelector(s).addEventListener('change', cost); }); cost();
        sh.querySelector('#fp').addEventListener('change', function(){ var p = P[this.value], su = sh.querySelector('#fsu'); if(p && p.supplier && !su.value) su.value = p.supplier; });
        sh.querySelector('#fph').onchange = function(){ var f = this.files[0]; if(f) KK.shrink(f, 600, 0.8).then(function(d){ photo = d; var t = sh.querySelector('.thumb'); if(t.tagName === 'IMG') t.src = d; else t.outerHTML = '<img class="thumb big" src="' + d + '" alt="">'; }); };
        sh.querySelector('#fsave').onclick = function(){ var b = this, dn = busy(b);
          KK.post('stockItemSave', {id: i.id, name: sh.querySelector('#fn').value, brand: sh.querySelector('#fb').value, section: sh.querySelector('#fs').value, unit: sh.querySelector('#fu').value,
            supplier: sh.querySelector('#fsu').value, importance: sh.querySelector('#fi').value, min: sh.querySelector('#fmn').value.trim(), par: sh.querySelector('#fpr').value.trim(),
            priceId: sh.querySelector('#fp').value, conv: sh.querySelector('#fc').value.trim(), loose: sh.querySelector('#flo').value.trim(), looseUnit: sh.querySelector('#flu').value,
            orderUnit: sh.querySelector('#fou').value.trim(), orderPer: (function(){ var x = Number(sh.querySelector('#foa').value) || 0, y = Number(sh.querySelector('#fob').value) || 0; return x > 0 && y > 0 ? Math.round(x / y * 1e6) / 1e6 : ''; })(), orderQty: sh.querySelector('#foq').value.trim(), group: sh.querySelector('#fg').value, checked: !!(sh.querySelector('#fck') || {}).checked,
            active: sh.querySelector('#fa').checked, photo: photo}).then(function(x){ dn(); if(!x.ok) return toast(x.error, true); close(); toast('Item saved'); viewStockItems(); }); };
      });
  }
  function priceForm(p, r){
    sheet(p.id ? p.item : 'New product', '<label class="f" for="pi">Product</label><input id="pi" value="' + e(p.item) + '"><div class="row2"><div><label class="f" for="pb">Brand</label><input id="pb" value="' + e(p.brand) + '"></div>' +
      '<div><label class="f" for="ps">Supplier</label><input id="ps" list="sl" value="' + e(p.supplier) + '"><datalist id="sl">' + r.suppliers.map(function(s){ return '<option value="' + e(s.name) + '">'; }).join('') + '</datalist></div></div>' +
      '<div class="row3"><div><label class="f" for="pz">Pack size</label><input id="pz" inputmode="decimal" value="' + e(String(p.size)) + '"></div><div><label class="f" for="pu">Unit</label><input id="pu" value="' + e(p.unit) + '" placeholder="g, ml, qty"></div>' +
      '<div><label class="f" for="pc">Category</label><input id="pc" value="' + e(p.category) + '"></div></div>' +
      '<div class="row2"><div><label class="f" for="px">Price before GST</label><input id="px" inputmode="decimal" value="' + (p.ex === null ? '' : p.ex) + '"></div><div><label class="f" for="pg">Price with GST</label><input id="pg" inputmode="decimal" value="' + (p.inc === null ? '' : p.inc) + '" placeholder="blank = +9%"></div></div>' +
      (p.prev !== null && p.prev !== undefined && p.prev !== p.ex ? '<p class="hint">Was ' + money(p.prev) + ' until ' + e(String(p.changed).slice(0, 10)) + '.</p>' : '') + '<button class="btn" id="psave" style="margin-top:14px">Save</button>', function(sh, close){
        sh.querySelector('#psave').onclick = function(){ var b = this, dn = busy(b);
          KK.post('priceSave', {id: p.id, item: sh.querySelector('#pi').value, brand: sh.querySelector('#pb').value, supplier: sh.querySelector('#ps').value, size: sh.querySelector('#pz').value, unit: sh.querySelector('#pu').value,
            category: sh.querySelector('#pc').value, ex: sh.querySelector('#px').value.trim(), inc: sh.querySelector('#pg').value.trim()}).then(function(x){ dn(); if(!x.ok) return toast(x.error, true); close(); toast('Saved'); viewStockItems(); }); };
      });
  }
  function supplierForm(s){
    sheet(s.name || 'New supplier', '<label class="f" for="sn">Name</label><input id="sn" value="' + e(s.name) + '"><div class="row2"><div><label class="f" for="sld">Lead time (days)</label><input id="sld" inputmode="numeric" value="' + (s.lead === null ? '' : s.lead) + '"></div>' +
      '<div><label class="f" for="sph">WhatsApp number</label><input id="sph" inputmode="tel" value="' + e(s.phone) + '"></div></div><label class="f" for="sno">Ordering notes</label><input id="sno" value="' + e(s.notes) + '" placeholder="e.g. Order by 3pm, minimum $150">' +
      '<button class="btn" id="ssave" style="margin-top:14px">Save</button>', function(sh, close){
        sh.querySelector('#ssave').onclick = function(){ var b = this, dn = busy(b);
          KK.post('supplierSave', {old: s.name, name: sh.querySelector('#sn').value, lead: sh.querySelector('#sld').value.trim(), phone: sh.querySelector('#sph').value, notes: sh.querySelector('#sno').value})
            .then(function(x){ dn(); if(!x.ok) return toast(x.error, true); close(); toast('Saved'); viewStockItems(); }); };
      });
  }

  function route(){
    var r = location.hash.slice(1), u = me();
    document.querySelectorAll('.scrim').forEach(function(s){ s.remove(); });
    if(!u || u.mustChange) return viewLogin();
    if(!ROUTES[r] || r === 'login') r = u.role === 'staff' ? 'home' : 'admin';
    if((MGR.indexOf(r) >= 0 && u.role === 'staff') || (ADMIN.indexOf(r) >= 0 && u.role !== 'admin')) r = u.role === 'staff' ? 'home' : 'admin';
    if(r === 'home' && u.role !== 'staff') r = 'admin';
    if(location.hash.slice(1) !== r) history.replaceState(null, '', '#' + r);
    ROUTES[r]();
  }
  window.addEventListener('hashchange', route);
  (KK.DEMO ? KK.demo().then(function(d){ return d.boot(); }) : Promise.resolve()).then(route, function(){ set('<main class="wrap"><div class="msg bad">The demo couldn\'t load (Code.gs is missing next to this page).</div></main>'); });
})();
