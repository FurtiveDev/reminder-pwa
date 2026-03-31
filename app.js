(function() {
  'use strict';

  const STORAGE_KEY = 'reminder_tasks';
  const DAY_NAMES = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
  const MONTH_NAMES = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

  let tasks = [];
  let timers = [];

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  function load() { try { tasks = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch(e) { tasks = []; } }
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
  function id() { return Date.now().toString(36) + Math.random().toString(36).substr(2,5); }
  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function fmtDate(ds) {
    const d = new Date(ds), t = new Date(), tm = new Date(t);
    tm.setDate(tm.getDate() + 1);
    const a = d.toISOString().split('T')[0];
    if (a === t.toISOString().split('T')[0]) return 'сегодня';
    if (a === tm.toISOString().split('T')[0]) return 'завтра';
    return d.getDate() + ' ' + MONTH_NAMES[d.getMonth()];
  }

  function status(task) {
    if (task.completed) return 'done';
    const diff = new Date(task.date+'T'+task.time) - new Date();
    if (diff < 0) return 'overdue';
    if (diff < 3600000) return 'soon';
    return 'ok';
  }

  function header() {
    const n = new Date();
    $('#dateDisplay').textContent = n.getDate() + ' ' + MONTH_NAMES[n.getMonth()] + ', ' + DAY_NAMES[n.getDay()];
  }

  function sort(a) {
    const p = { high:0, medium:1, none:2 };
    return [...a].sort((x,y) => {
      if (x.completed !== y.completed) return x.completed ? 1 : -1;
      const px = p[x.priority]??2, py = p[y.priority]??2;
      if (px !== py) return px - py;
      return new Date(x.date+'T'+x.time) - new Date(y.date+'T'+y.time);
    });
  }

  function render() {
    const el = $('#taskList');
    const s = sort(tasks);

    if (!s.length) {
      el.innerHTML = '<div class="empty"><div class="empty-box">📋</div><div class="empty-title">Нет задач</div><div class="empty-hint">Нажмите + чтобы добавить</div></div>';
      stats();
      return;
    }

    el.innerHTML = s.map(t => {
      const st = status(t);
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
    }).join('');

    bind();
    stats();
  }

  function stats() {
    const el = $('#stats');
    const today = new Date().toISOString().split('T')[0];
    const tt = tasks.filter(t => t.date === today);
    const done = tt.filter(t => t.completed);
    if (!tt.length) { el.innerHTML = ''; return; }
    if (done.length === tt.length) { el.innerHTML = '<span class="done">Все задачи выполнены! 🎉</span>'; return; }
    el.textContent = 'Выполнено: ' + done.length + '/' + tt.length + ' задач сегодня';
  }

  function toggle(id) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const card = document.querySelector('.task-card[data-id="'+id+'"]');
    if (!t.completed) {
      t.completed = true; t.completedAt = new Date().toISOString();
      if (card) card.classList.add('completing');
      if (t.repeat) {
        const nd = new Date(t.date+'T'+t.time); nd.setDate(nd.getDate()+1);
        tasks.push({...t, id: id(), date: nd.toISOString().split('T')[0], completed: false, completedAt: null, createdAt: new Date().toISOString()});
      }
    } else {
      t.completed = false; t.completedAt = null;
    }
    save();
    setTimeout(render, 300);
  }

  function del(id) {
    const card = document.querySelector('.task-card[data-id="'+id+'"]');
    if (card) {
      card.classList.add('removing');
      setTimeout(() => { tasks = tasks.filter(t => t.id !== id); save(); render(); }, 250);
    }
  }

  function bind() {
    $$('.task-card').forEach(c => {
      c.addEventListener('touchstart', function(e) {
        this._sx = e.touches[0].clientX;
      }, {passive:true});
      c.addEventListener('touchmove', function(e) {
        if (!this._sx) return;
        const d = this._sx - e.touches[0].clientX;
        if (d > 40) this.classList.add('swiped');
        else this.classList.remove('swiped');
      }, {passive:true});
      c.addEventListener('touchend', function() { this._sx = null; });
    });

    $$('.task-check').forEach(b => b.onclick = e => { e.stopPropagation(); toggle(b.dataset.id); });
    $$('.task-del').forEach(b => b.onclick = e => { e.stopPropagation(); del(b.dataset.id); });
  }

  function open() {
    $('#modalOverlay').classList.add('on');
    const d = new Date(); d.setMinutes(d.getMinutes()+30);
    $('#taskDate').value = new Date().toISOString().split('T')[0];
    $('#taskTime').value = d.toTimeString().slice(0,5);
    setTimeout(() => $('#taskTitle').focus(), 350);
    if (Notification.permission === 'default') Notification.requestPermission();
  }

  function close() {
    $('#modalOverlay').classList.remove('on');
    $('#taskForm').reset();
  }

  function add(e) {
    e.preventDefault();
    const title = $('#taskTitle').value.trim();
    const date = $('#taskDate').value;
    const time = $('#taskTime').value;
    const priority = document.querySelector('input[name="priority"]:checked').value;
    const repeat = $('#taskRepeat').checked;
    if (!title || !date || !time) return;
    tasks.push({ id: id(), title, date, time, priority, repeat, completed: false, completedAt: null, createdAt: new Date().toISOString() });
    save(); close(); render(); notify();
  }

  function notify() {
    timers.forEach(t => clearTimeout(t)); timers = [];
    tasks.forEach(t => {
      if (t.completed) return;
      const dl = new Date(t.date+'T'+t.time);
      const diff = dl - new Date();
      [{ms:diff-3600000,title:'⏰ Через час дедлайн!',body:'Задача: '+t.title,tag:t.id+'-1h'},
       {ms:diff-900000,title:'⏰ Через 15 минут!',body:'Задача: '+t.title,tag:t.id+'-15m'},
       {ms:diff,title:'🔔 Дедлайн!',body:'Задача: '+t.title,tag:t.id+'-now'}
      ].forEach(o => { if (o.ms > 0) timers.push(setTimeout(() => { if (Notification.permission==='granted') try { new Notification(o.title,{body:o.body,icon:'icons/icon-192.png',tag:o.tag,requireInteraction:true}); } catch(e){} }, o.ms)); });
    });
  }

  function sw() { if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{}); }

  function events() {
    $('#addBtn').addEventListener('click', open);
    $('#cancelBtn').addEventListener('click', close);
    $('#taskForm').addEventListener('submit', add);
    $('#modalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) close(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { load(); render(); notify(); } });
  }

  function init() { load(); header(); render(); events(); sw(); notify(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
