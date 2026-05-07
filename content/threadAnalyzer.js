// NeuroSense Task Breakdown + Thread Analyzer: extract actions, inject dashboard

(function () {
  const NS = window.neurosense;
  if (!NS) return;

  const THREAD_SELECTOR = '[data-qa="thread"]';
  const MESSAGE_SELECTOR = '[data-qa="message_content"]';
  const HIGH_WORDS = /\b(urgent|asap|today|eod|as soon as)\b/i;
  const MEDIUM_WORDS = /\b(tomorrow|this week|soon)\b/i;

  function priority(text) {
    if (HIGH_WORDS.test(text)) return 'high';
    if (MEDIUM_WORDS.test(text)) return 'medium';
    return 'low';
  }

  function extractTasks(threadEl) {
    const messages = threadEl.querySelectorAll(MESSAGE_SELECTOR);
    const tasks = [];
    const text = Array.from(messages).map((m) => m.textContent || '').join(' ');
    const yourAction = /@\w+/g;
    const teamAction = /\/(?:todo|task)|needs to|@\w+/gi;
    let m;
    while ((m = yourAction.exec(text)) !== null) {
      const slice = text.slice(Math.max(0, m.index - 40), m.index + 60);
      tasks.push({ text: slice.trim(), priority: priority(slice), type: 'mine' });
    }
    if (tasks.length === 0) {
      while ((m = teamAction.exec(text)) !== null) {
        const slice = text.slice(Math.max(0, m.index - 30), m.index + 80);
        tasks.push({ text: slice.trim(), priority: priority(slice), type: 'team' });
      }
    }
    return tasks;
  }

  function run() {
    const existing = document.getElementById('neurosense-dashboard');
    if (existing) existing.remove();

    const threads = document.querySelectorAll(THREAD_SELECTOR);
    const allTasks = [];
    threads.forEach((t) => {
      extractTasks(t).forEach((task) => allTasks.push(task));
    });
    if (allTasks.length === 0) {
      const main = document.querySelector('[data-qa="message_content"]') && document.body;
      if (main) {
        document.querySelectorAll(MESSAGE_SELECTOR).forEach((el) => {
          const text = el.textContent || '';
          if (HIGH_WORDS.test(text) || MEDIUM_WORDS.test(text) || /@\w+/.test(text)) {
            allTasks.push({ text: text.slice(0, 100), priority: priority(text), type: 'team' });
          }
        });
      }
    }

    const dedup = new Map();
    allTasks.forEach((t) => {
      const key = t.text.slice(0, 50);
      if (!dedup.has(key) || t.priority === 'high') dedup.set(key, t);
    });
    const tasks = Array.from(dedup.values()).slice(0, 15);

    const dash = document.createElement('div');
    dash.id = 'neurosense-dashboard';
    dash.innerHTML = '<h3>📋 MY TASKS (' + tasks.length + ')</h3><span class="close-btn" aria-label="Close">×</span><ul></ul>';
    const ul = dash.querySelector('ul');
    tasks.forEach((t) => {
      const li = document.createElement('li');
      li.className = t.priority;
      li.textContent = (t.priority === 'high' ? '🔴 ' : t.priority === 'medium' ? '🟡 ' : '🟢 ') + t.text.slice(0, 80);
      ul.appendChild(li);
    });
    dash.querySelector('.close-btn').addEventListener('click', () => dash.remove());
    document.body.appendChild(dash);
    setTimeout(() => dash.remove(), 10000);
  }

  NS.threadAnalyzer = { run };
  NS.modules.push(() => {});
})();
