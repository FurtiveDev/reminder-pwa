(function() {
  'use strict';

  const STORAGE_KEY = 'reminder_tasks';
  const DAY_NAMES = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
  const MONTH_NAMES = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

  let tasks = [];
  let notificationTimers = [];
  let swipeState = { active: false, card: null, startX: 0, currentX: 0 };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      tasks = raw ? JSON.parse(raw) : [];
    } catch (e) {
      tasks = [];
    }
  }

  function saveTasks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dStr = d.toISOString().split('T')[0];
    const tStr = today.toISOString().split('T')[0];
    const tmStr = tomorrow.toISOString().split('T')[0];

    if (dStr === tStr) return 'сегодня';
    if (dStr === tmStr) return 'завтра';
    return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
  }

  function formatTime(timeStr) {
    return timeStr;
  }

  function getDeadlineStatus(task) {
    if (task.completed) return 'completed';
    const now = new Date();
    const deadline = new Date(`${task.date}T${task.time}`);
    const diff = deadline - now;
    if (diff < 0) return 'overdue';
    if (diff < 3600000) return 'soon';
    return 'normal';
  }

  function updateDateDisplay() {
    const now = new Date();
    const day = DAY_NAMES[now.getDay()];
    const date = now.getDate();
    const month = MONTH_NAMES[now.getMonth()];
    $('#dateDisplay').textContent = `${date} ${month}, ${day}`;
  }

  function sortTasks(arr) {
    const priorityOrder = { high: 0, medium: 1, none: 2 };
    return [...arr].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const pa = priorityOrder[a.priority] ?? 2;
      const pb = priorityOrder[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      const da = new Date(`${a.date}T${a.time}`);
      const db = new Date(`${b.date}T${b.time}`);
      return da - db;
    });
  }

  function renderTasks() {
    const list = $('#taskList');
    const sorted = sortTasks(tasks);

    if (sorted.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <p>Нет задач</p>
          <p style="font-size:14px;margin-top:8px;">Нажмите + чтобы добавить</p>
        </div>`;
      updateStats();
      return;
    }

    list.innerHTML = sorted.map(task => {
      const status = getDeadlineStatus(task);
      const deadlineClass = status === 'overdue' && !task.completed ? 'overdue' : status === 'soon' && !task.completed ? 'soon' : '';
      const priorityEmoji = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '';

      return `
        <div class="task-card ${task.completed ? 'completed' : ''}" data-id="${task.id}">
          <button class="task-checkbox" data-id="${task.id}" aria-label="Выполнить задачу">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
          <div class="task-content">
            <div class="task-title">${escapeHtml(task.title)}</div>
            <div class="task-meta">
              <span class="task-deadline ${deadlineClass}">${formatDate(task.date)}, ${formatTime(task.time)}</span>
              ${task.repeat ? '<span class="task-repeat-icon">🔄</span>' : ''}
              ${priorityEmoji ? `<span class="task-priority">${priorityEmoji}</span>` : ''}
            </div>
          </div>
          <button class="task-delete" data-id="${task.id}" aria-label="Удалить задачу">🗑</button>
        </div>`;
    }).join('');

    attachSwipeHandlers();
    updateStats();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function updateStats() {
    const stats = $('#stats');
    const today = new Date().toISOString().split('T')[0];
    const todayTasks = tasks.filter(t => t.date === today);
    const completedToday = todayTasks.filter(t => t.completed);

    if (todayTasks.length === 0) {
      stats.innerHTML = '';
      return;
    }

    if (completedToday.length === todayTasks.length && todayTasks.length > 0) {
      stats.innerHTML = '<span class="congrats">Все задачи выполнены! 🎉</span>';
    } else {
      stats.textContent = `Выполнено: ${completedToday.length}/${todayTasks.length} задач сегодня`;
    }
  }

  function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const card = document.querySelector(`.task-card[data-id="${id}"]`);

    if (!task.completed) {
      task.completed = true;
      task.completedAt = new Date().toISOString();
      if (card) card.classList.add('completing');

      if (task.repeat) {
        const nextDate = new Date(`${task.date}T${task.time}`);
        nextDate.setDate(nextDate.getDate() + 1);
        const newTask = {
          ...task,
          id: generateId(),
          date: nextDate.toISOString().split('T')[0],
          completed: false,
          completedAt: null,
          createdAt: new Date().toISOString()
        };
        tasks.push(newTask);
      }
    } else {
      task.completed = false;
      task.completedAt = null;
    }

    saveTasks();
    setTimeout(() => renderTasks(), 300);
  }

  function deleteTask(id) {
    const card = document.querySelector(`.task-card[data-id="${id}"]`);
    if (card) {
      card.classList.add('removing');
      setTimeout(() => {
        tasks = tasks.filter(t => t.id !== id);
        saveTasks();
        renderTasks();
      }, 300);
    }
  }

  function attachSwipeHandlers() {
    $$('.task-card').forEach(card => {
      card.addEventListener('touchstart', handleSwipeStart, { passive: true });
      card.addEventListener('touchmove', handleSwipeMove, { passive: false });
      card.addEventListener('touchend', handleSwipeEnd);
    });

    $$('.task-checkbox').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTask(btn.dataset.id);
      });
    });

    $$('.task-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTask(btn.dataset.id);
      });
    });
  }

  function handleSwipeStart(e) {
    const touch = e.touches[0];
    swipeState.startX = touch.clientX;
    swipeState.card = this;
    swipeState.active = false;
  }

  function handleSwipeMove(e) {
    if (!swipeState.card) return;
    const touch = e.touches[0];
    swipeState.currentX = touch.clientX;
    const diff = swipeState.startX - swipeState.currentX;

    if (diff > 10) {
      swipeState.active = true;
      e.preventDefault();
      const translate = Math.min(diff, 80);
      swipeState.card.querySelector('.task-content').style.transform = `translateX(-${translate}px)`;
      swipeState.card.querySelector('.task-checkbox').style.transform = `translateX(-${translate}px)`;
      if (diff > 40) {
        swipeState.card.classList.add('swiped');
      } else {
        swipeState.card.classList.remove('swiped');
      }
    }
  }

  function handleSwipeEnd() {
    if (!swipeState.card) return;
    const diff = swipeState.startX - swipeState.currentX;
    if (diff <= 40) {
      swipeState.card.querySelector('.task-content').style.transform = '';
      swipeState.card.querySelector('.task-checkbox').style.transform = '';
      swipeState.card.classList.remove('swiped');
    }
    swipeState.card = null;
    swipeState.active = false;
  }

  // Modal
  function openModal() {
    const overlay = $('#modalOverlay');
    overlay.classList.add('active');
    const dateInput = $('#taskDate');
    dateInput.value = new Date().toISOString().split('T')[0];
    const timeInput = $('#taskTime');
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    timeInput.value = now.toTimeString().slice(0, 5);
    $('#taskTitle').focus();

    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  function closeModal() {
    $('#modalOverlay').classList.remove('active');
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

    const task = {
      id: generateId(),
      title,
      date,
      time,
      priority,
      repeat,
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString()
    };

    tasks.push(task);
    saveTasks();
    closeModal();
    renderTasks();
    scheduleNotifications();
  }

  // Notifications
  function scheduleNotifications() {
    notificationTimers.forEach(t => clearTimeout(t));
    notificationTimers = [];

    tasks.forEach(task => {
      if (task.completed) return;

      const deadline = new Date(`${task.date}T${task.time}`);
      const now = new Date();
      const diff = deadline - now;

      const offsets = [
        { ms: diff - 3600000, title: '⏰ Через час дедлайн!', body: `Задача: ${task.title}`, tag: `${task.id}-1h` },
        { ms: diff - 900000, title: '⏰ Через 15 минут дедлайн!', body: `Задача: ${task.title}`, tag: `${task.id}-15m` },
        { ms: diff, title: '🔔 Дедлайн!', body: `Задача: ${task.title}`, tag: `${task.id}-now` },
      ];

      offsets.forEach(({ ms, title, body, tag }) => {
        if (ms > 0) {
          const timer = setTimeout(() => {
            sendNotification(title, body, tag);
          }, ms);
          notificationTimers.push(timer);
        }
      });

      // Repeating notifications every 30 min after deadline
      if (diff < 0) {
        const overdueMs = Math.abs(diff);
        const startOffset = overdueMs % 1800000;
        for (let i = 0; i < 12; i++) {
          const timer = setTimeout(() => {
            sendNotification('⚠️ Просроченная задача!', `Задача: ${task.title}`, `${task.id}-overdue-${i}`);
          }, startOffset + i * 1800000);
          notificationTimers.push(timer);
        }
      } else {
        // Schedule repeating after deadline passes
        const timer = setTimeout(() => {
          for (let i = 0; i < 12; i++) {
            const t = setTimeout(() => {
              sendNotification('⚠️ Просроченная задача!', `Задача: ${task.title}`, `${task.id}-overdue-${i}`);
            }, i * 1800000);
            notificationTimers.push(t);
          }
        }, diff);
        notificationTimers.push(timer);
      }
    });
  }

  function sendNotification(title, body, tag) {
    if (Notification.permission !== 'granted') return;
    try {
      new Notification(title, {
        body,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag,
        requireInteraction: true,
        silent: false
      });
    } catch (e) {
      console.warn('Notification error:', e);
    }
  }

  // Service Worker
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('SW registered:', reg.scope))
        .catch(err => console.warn('SW registration failed:', err));
    }
  }

  // Events
  function bindEvents() {
    $('#addBtn').addEventListener('click', openModal);
    $('#cancelBtn').addEventListener('click', closeModal);
    $('#taskForm').addEventListener('submit', addTask);

    $('#modalOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        loadTasks();
        renderTasks();
        scheduleNotifications();
      }
    });
  }

  // Init
  function init() {
    loadTasks();
    updateDateDisplay();
    renderTasks();
    bindEvents();
    registerSW();
    scheduleNotifications();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
