(function() {
  'use strict';

  const STORAGE_KEY = 'reminder_tasks';
  const TOKEN_KEY = 'fcm_token';
  const DAY_NAMES = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
  const MONTH_NAMES = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

  const firebaseConfig = {
    apiKey: "AIzaSyBdpgUAtBiGyJ2t5YGEPfTtaiZPkawwA8M",
    authDomain: "pwa-notif-25eea.firebaseapp.com",
    projectId: "pwa-notif-25eea",
    storageBucket: "pwa-notif-25eea.firebasestorage.app",
    messagingSenderId: "623374900657",
    appId: "1:623374900657:web:647e9a59e6062a01aef190"
  };

  let tasks = [];
  let timers = [];
  let messaging = null;

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  function load() { try { tasks = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch(e) { tasks = []; } }
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
  function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(-5); }
  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // FIX: use local date, not UTC
  function localDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function fmtDate(ds) {
    const today = localDateStr(new Date());
    const tomorrow = localDateStr(new Date(Date.now() + 86400000));
    if (ds === today) return 'сегодня';
    if (ds === tomorrow) return 'завтра';
    const d = new Date(ds + 'T00:00:00');
    return d.getDate() + ' ' + MONTH_NAMES[d.getMonth()];
  }

  function getDateGroup(ds) {
    const today = localDateStr(new Date());
    const tomorrow = localDateStr(new Date(Date.now() + 86400000));
    if (ds < today) return 'overdue';
    if (ds === today) return 'today';
    if (ds === tomorrow) return 'tomorrow';
    return 'later';
  }

  function getSt(task) {
    if (task.completed) return 'done';
    const diff = new Date(task.date+'T'+task.time) - new Date();
    if (diff < 0) return 'overdue';
    if (diff < 3600000) return 'soon';
    return 'ok';
  }

  function updateHeader() {
    const n = new Date();
    const dateStr = n.getDate() + ' ' + MONTH_NAMES[n.getMonth()] + ', ' + DAY_NAMES[n.getDay()];
    $('#dateDisplay').textContent = dateStr;

    const overdue = tasks.filter(t => !t.completed && new Date(t.date+'T'+t.time) < new Date()).length;
    const subtitle = $('.header-sub');
    if (overdue > 0) {
      subtitle.textContent = overdue + ' просрочено';
      subtitle.style.color = 'var(--red)';
    } else {
      subtitle.textContent = tasks.filter(t => !t.completed).length + ' задач';
      subtitle.style.color = '';
    }
  }

  function sortTasks(arr) {
    const p = { high:0, medium:1, none:2 };
    return [...arr].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const pa = p[a.priority]??2, pb = p[b.priority]??2;
      if (pa !== pb) return pa - pb;
      return new Date(a.date+'T'+a.time) - new Date(b.date+'T'+b.time);
    });
  }

  function renderCard(t) {
    const st = getSt(t);
    const mc = st==='overdue' ? 'overdue' : st==='soon' ? 'soon' : '';
    const ss = t.priority==='high' ? 's-h' : t.priority==='medium' ? 's-m' : 's-n';
    const meta = fmtDate(t.date) + ', ' + t.time;
    return '<div class="task-card'+(t.completed?' completed':'')+'" data-id="'+t.id+'">' +
      '<div class="task-del" data-id="'+t.id+'">🗑</div>' +
      '<div class="task-main">' +
        '<div class="task-strip '+ss+'"></div>' +
        '<button class="task-check" data-id="'+t.id+'"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></button>' +
        '<div class="task-info">' +
          '<div class="task-title">'+esc(t.title)+'</div>' +
          '<div class="task-meta '+mc+'">'+meta+
            (t.repeat ? '<span class="meta-sep"></span><span class="meta-repeat">ежедневно</span>' : '') +
          '</div>' +
        '</div>' +
      '</div></div>';
  }

  function render() {
    const el = $('#taskList');
    const sorted = sortTasks(tasks);

    if (!sorted.length) {
      el.innerHTML = '<div class="empty"><div class="empty-box">📋</div><div class="empty-title">Нет задач</div><div class="empty-hint">Нажмите + чтобы добавить</div></div>';
      updateStats();
      updateHeader();
      return;
    }

    // Group tasks by date
    const groups = { overdue: [], today: [], tomorrow: [], later: [] };
    sorted.forEach(t => {
      if (t.completed) return;
      const g = getDateGroup(t.date);
      if (groups[g]) groups[g].push(t);
    });

    let html = '';

    if (groups.overdue.length) {
      html += '<div class="section"><div class="section-title section-overdue">Просроченные</div>';
      groups.overdue.forEach(t => html += renderCard(t));
      html += '</div>';
    }

    if (groups.today.length) {
      html += '<div class="section"><div class="section-title">Сегодня</div>';
      groups.today.forEach(t => html += renderCard(t));
      html += '</div>';
    }

    if (groups.tomorrow.length) {
      html += '<div class="section"><div class="section-title">Завтра</div>';
      groups.tomorrow.forEach(t => html += renderCard(t));
      html += '</div>';
    }

    if (groups.later.length) {
      html += '<div class="section"><div class="section-title">Позже</div>';
      groups.later.forEach(t => html += renderCard(t));
      html += '</div>';
    }

    // Completed tasks at the bottom
    const completed = sorted.filter(t => t.completed);
    if (completed.length) {
      html += '<div class="section"><div class="section-title">Выполнено</div>';
      completed.forEach(t => html += renderCard(t));
      html += '</div>';
    }

    el.innerHTML = html;
    bindSwipe();
    updateStats();
    updateHeader();
  }

  function updateStats() {
    const el = $('#stats');
    const today = localDateStr(new Date());
    const tt = tasks.filter(t => t.date === today);
    const done = tt.filter(t => t.completed);
    if (!tt.length) { el.innerHTML = ''; return; }
    if (done.length === tt.length) { el.innerHTML = '<span class="done">Все задачи выполнены! 🎉</span>'; return; }
    el.textContent = 'Выполнено: ' + done.length + '/' + tt.length + ' задач сегодня';
  }

  function toggleTask(taskId) {
    const t = tasks.find(x => x.id === taskId);
    if (!t) return;
    const card = document.querySelector('.task-card[data-id="'+taskId+'"]');
    if (!t.completed) {
      t.completed = true; t.completedAt = new Date().toISOString();
      if (card) card.classList.add('completing');
      if (t.repeat) {
        const nd = new Date(t.date+'T'+t.time); nd.setDate(nd.getDate()+1);
        tasks.push({...t, id: genId(), date: localDateStr(nd), completed: false, completedAt: null, createdAt: new Date().toISOString()});
      }
    } else {
      t.completed = false; t.completedAt = null;
    }
    save();
    setTimeout(render, 300);
  }

  function deleteTask(taskId) {
    const card = document.querySelector('.task-card[data-id="'+taskId+'"]');
    if (card) {
      card.classList.add('removing');
      setTimeout(() => { tasks = tasks.filter(t => t.id !== taskId); save(); render(); }, 250);
    }
  }

  function bindSwipe() {
    $$('.task-card').forEach(c => {
      let startX = 0;
      c.addEventListener('touchstart', function(e) {
        startX = e.touches[0].clientX;
        this.classList.remove('swiped');
      }, {passive:true});
      c.addEventListener('touchmove', function(e) {
        if (!startX) return;
        const diff = startX - e.touches[0].clientX;
        if (diff > 40) this.classList.add('swiped');
        else this.classList.remove('swiped');
      }, {passive:true});
      c.addEventListener('touchend', function() { startX = 0; });
      c.addEventListener('touchcancel', function() { startX = 0; this.classList.remove('swiped'); });
    });
    $$('.task-check').forEach(b => b.onclick = e => { e.stopPropagation(); toggleTask(b.dataset.id); });
    $$('.task-del').forEach(b => b.onclick = e => { e.stopPropagation(); deleteTask(b.dataset.id); });
  }

  function openSheet() {
    $('#modalOverlay').classList.add('on');
    const d = new Date(); d.setMinutes(d.getMinutes()+30);
    $('#taskDate').value = localDateStr(new Date());
    $('#taskTime').value = d.toTimeString().slice(0,5);
    setTimeout(() => $('#taskTitle').focus(), 350);
    requestNotifPermission();
  }

  function closeSheet() {
    $('#modalOverlay').classList.remove('on');
    $('#taskForm').reset();
  }

  function addTask(e) {
    e.preventDefault();
    const title = $('#taskTitle').value.trim();
    const date = $('#taskDate').value;
    const time = $('#taskTime').value;
    const priority = document.querySelector('input[name="priority"]:checked').value;
    const repeat = $('#taskRepeat').checked;
    if (!title || !date || !time) return;
    tasks.push({ id: genId(), title, date, time, priority, repeat, completed: false, completedAt: null, createdAt: new Date().toISOString() });
    save(); closeSheet(); render(); scheduleLocalNotif();
  }

  // Firebase Cloud Messaging
  function initFCM() {
    if (typeof firebase === 'undefined') return;
    try {
      firebase.initializeApp(firebaseConfig);
      messaging = firebase.messaging();
    } catch(e) {
      console.warn('Firebase init error:', e);
    }
  }

  function requestNotifPermission() {
    if (Notification.permission === 'granted') { getFCMToken(); return; }
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(function(perm) {
        if (perm === 'granted') getFCMToken();
      });
    }
  }

  function getFCMToken() {
    if (!messaging) return;
    if (localStorage.getItem(TOKEN_KEY)) return;
    navigator.serviceWorker.ready.then(function(reg) {
      return messaging.getToken({
        vapidKey: 'BKQYaPfqw5pfmwASR3PeYpD2doRmXGNo2YmVJsO1436nFa8pUjH0cgBV3xTNwHhnLJkQ3NDMK5XFjm14lKM37ko',
        serviceWorkerRegistration: reg
      });
    }).then(function(token) {
      if (token) { localStorage.setItem(TOKEN_KEY, token); console.log('FCM Token:', token); }
    }).catch(function(err) { console.warn('FCM token error:', err); });
  }

  function onForegroundMessage() {
    if (!messaging) return;
    try {
      messaging.onMessage(function(payload) {
        const title = payload.notification?.title || 'Напоминалка';
        const body = payload.notification?.body || '';
        if (Notification.permission === 'granted') {
          try { new Notification(title, { body: body, icon: 'icons/icon-192.png', requireInteraction: true }); } catch(e) {}
        }
      });
    } catch(e) {}
  }

  // Local notifications
  function scheduleLocalNotif() {
    timers.forEach(t => clearTimeout(t)); timers = [];
    tasks.forEach(t => {
      if (t.completed) return;
      const dl = new Date(t.date+'T'+t.time);
      const diff = dl - new Date();
      [{ms:diff-3600000,title:'⏰ Через час дедлайн!',body:'Задача: '+t.title,tag:t.id+'-1h'},
       {ms:diff-900000,title:'⏰ Через 15 минут!',body:'Задача: '+t.title,tag:t.id+'-15m'},
       {ms:diff,title:'🔔 Дедлайн!',body:'Задача: '+t.title,tag:t.id+'-now'}
      ].forEach(o => {
        if (o.ms > 0) timers.push(setTimeout(function() {
          if (Notification.permission==='granted') try { new Notification(o.title,{body:o.body,icon:'icons/icon-192.png',tag:o.tag,requireInteraction:true}); } catch(e){}
        }, o.ms));
      });
    });
  }

  function registerSW() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function(){});
  }

  function bindEvents() {
    $('#addBtn').addEventListener('click', openSheet);
    $('#cancelBtn').addEventListener('click', closeSheet);
    $('#taskForm').addEventListener('submit', addTask);
    $('#modalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeSheet(); });
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) { load(); render(); scheduleLocalNotif(); }
    });
  }

  function init() {
    load();
    updateHeader();
    render();
    bindEvents();
    registerSW();
    initFCM();
    scheduleLocalNotif();
    onForegroundMessage();
    requestNotifPermission();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
