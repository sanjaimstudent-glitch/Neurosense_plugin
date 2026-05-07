// NeuroSense Task Breakdown: dedicated gamified task bar with vertical progress

(function () {
  const NS = window.neurosense;
  if (!NS) return;

  const GROQ_API_KEY = 'your_api_key';
  const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
  const MESSAGE_SELECTOR = '[data-qa="message_content"]';
  const MAX_MESSAGES = 60;
  const STREAK_KEY = 'neurosense_task_breakdown_stats';
  const DAY_MS = 24 * 60 * 60 * 1000;

  let enabled = false;
  let mentionHandle = '';
  let panel = null;
  let tasks = [];
  let completed = new Set();
  let completionCelebrated = false;

  chrome.storage.sync.get({ mentionHandle: '' }, (stored) => {
    mentionHandle = (stored.mentionHandle || '').trim();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.mentionHandle) mentionHandle = (changes.mentionHandle.newValue || '').trim();
  });

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function yesterdayKey() {
    return new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
  }

  function getDefaultTaskStats() {
    return { streak: 0, lastCompletedDate: '', totalBoardsCleared: 0 };
  }

  function collectThreads() {
    return Array.from(document.querySelectorAll(MESSAGE_SELECTOR))
      .map((message) => (message.textContent || '').trim())
      .filter((text) => text.length > 24)
      .slice(-MAX_MESSAGES);
  }

  function normalizeTask(task) {
    if (!task || typeof task !== 'object') return null;
    const priority = String(task.priority || 'COLD').toUpperCase();
    const safePriority = ['HOT', 'WARM', 'COLD'].includes(priority) ? priority : 'COLD';
    return {
      priority: safePriority,
      title: String(task.title || 'Untitled task').trim().slice(0, 80),
      due: String(task.due || 'No date').trim().slice(0, 40),
      from: String(task.from || 'Team').trim().slice(0, 40),
      snippet: String(task.snippet || '').trim().slice(0, 90),
      why: String(task.why || '').trim().slice(0, 120)
    };
  }

  async function callGroq(threads, handle) {
    const combined = threads.map((thread, index) => `[MSG ${index + 1}] ${thread}`).join('\n');
    const prompt = `You are an executive task breakdown assistant for Slack.
User handle: "${handle || 'unknown'}"
Messages:
${combined}

Extract the most important actionable tasks from these messages.
For each task return:
- priority: HOT, WARM, or COLD
- title: short and clear, max 8 words
- due: due date or timing, otherwise "No date"
- from: person or team name if clear, otherwise "Team"
- snippet: short supporting quote, max 60 chars
- why: one short sentence explaining why this matters

Rules:
- HOT = direct mention, urgent words, production issue, deadline today/tomorrow/EOD/ASAP
- WARM = decision pending, review needed, deadline within a week
- COLD = useful follow-up or lower-pressure item
- Return only a valid JSON array
- Maximum 8 tasks
- If there are no actionable tasks, return []`;

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 900
      })
    });

    if (!response.ok) {
      let message = 'Groq API error';
      try {
        const error = await response.json();
        message = error && error.error && error.error.message ? error.error.message : message;
      } catch (_) {}
      throw new Error(message);
    }

    const data = await response.json();
    const raw = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content || '[]' : '[]';
    const clean = raw.replace(/```json|```/g, '').trim();

    try {
      const parsed = JSON.parse(clean);
      return Array.isArray(parsed) ? parsed.map(normalizeTask).filter(Boolean).slice(0, 8) : [];
    } catch (_) {
      return [];
    }
  }

  function createPanel() {
    if (panel) return;

    panel = document.createElement('div');
    panel.id = 'ns-task-breakdown-panel';
    panel.innerHTML = `
      <style>
        #ns-task-breakdown-panel {
          position: fixed;
          top: 58px;
          right: 18px;
          width: 372px;
          max-height: calc(100vh - 86px);
          display: flex;
          background: linear-gradient(180deg, #0d1220 0%, #0a0f18 100%);
          border: 1px solid #1e2940;
          border-radius: 20px;
          box-shadow: 0 28px 70px rgba(3, 8, 20, 0.58);
          overflow: hidden;
          z-index: 100000;
          color: #e7eff9;
          font-family: 'Segoe UI', system-ui, sans-serif;
          animation: ns-task-bar-in 0.24s ease;
        }
        @keyframes ns-task-bar-in {
          from { transform: translateX(24px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        #ns-task-breakdown-panel * { box-sizing: border-box; }
        .ns-track-rail {
          width: 56px;
          padding: 18px 10px;
          border-right: 1px solid #162033;
          background: linear-gradient(180deg, rgba(22, 31, 49, 0.94), rgba(13, 18, 32, 0.98));
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          gap: 14px;
          position: relative;
        }
        .ns-track-stars {
          font-size: 14px;
          color: #ffe58f;
          letter-spacing: 1px;
          text-shadow: 0 0 10px rgba(255, 229, 143, 0.6);
          animation: ns-star-spark 1.8s ease-in-out infinite;
        }
        @keyframes ns-star-spark {
          0%, 100% { opacity: 0.45; transform: scale(0.95); }
          50% { opacity: 1; transform: scale(1.08); }
        }
        .ns-track-shell {
          position: relative;
          width: 16px;
          flex: 1;
          min-height: 280px;
          border-radius: 999px;
          background: rgba(255,255,255,0.06);
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.06);
        }
        .ns-track-fill {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 0%;
          background: linear-gradient(180deg, #8b5cf6 0%, #22d3ee 58%, #4ade80 100%);
          transition: height 0.5s ease;
          box-shadow: 0 0 18px rgba(34, 211, 238, 0.28);
        }
        .ns-track-head {
          position: absolute;
          left: 50%;
          bottom: 0;
          width: 28px;
          height: 28px;
          margin-left: -14px;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #ffffff, #fde68a 42%, #f59e0b 100%);
          box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.14), 0 0 20px rgba(250, 204, 21, 0.55);
          transition: bottom 0.5s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #402400;
          font-size: 13px;
          font-weight: 900;
        }
        .ns-track-head::after {
          content: '';
          position: absolute;
          inset: -7px;
          border-radius: 50%;
          border: 1px solid rgba(250, 204, 21, 0.2);
          animation: ns-track-ping 1.4s ease-out infinite;
        }
        @keyframes ns-track-ping {
          0% { opacity: 0.7; transform: scale(0.8); }
          100% { opacity: 0; transform: scale(1.55); }
        }
        .ns-track-note {
          font-size: 10px;
          line-height: 1.4;
          text-align: center;
          color: #9ab1ce;
        }
        .ns-task-main {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }
        .ns-task-head {
          padding: 16px 16px 12px;
          border-bottom: 1px solid #162133;
          background: linear-gradient(135deg, rgba(86, 120, 255, 0.14), rgba(30, 182, 141, 0.08));
        }
        .ns-task-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
        }
        .ns-task-title-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ns-task-mark {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #6f7dff, #34d399);
          color: #08111f;
          font-weight: 800;
          font-size: 13px;
        }
        .ns-task-title {
          font-size: 14px;
          font-weight: 700;
          color: #f8fbff;
        }
        .ns-task-subtitle {
          font-size: 11px;
          color: #b4c3d8;
          margin-top: 2px;
        }
        .ns-task-close {
          width: 30px;
          height: 30px;
          border-radius: 9px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.05);
          color: #9db0ca;
          cursor: pointer;
        }
        .ns-task-close:hover { background: rgba(255,255,255,0.1); color: #f1f5fb; }
        .ns-task-progress-row {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          font-size: 11px;
          color: #b4c3d8;
        }
        .ns-task-progress-row strong {
          color: #f8fbff;
          font-size: 12px;
        }
        .ns-task-complete-banner {
          margin-top: 10px;
          padding: 10px 12px;
          border-radius: 12px;
          background: rgba(74, 222, 128, 0.12);
          border: 1px solid rgba(74, 222, 128, 0.18);
          color: #dcffe9;
          font-size: 12px;
          line-height: 1.5;
          display: none;
        }
        .ns-task-complete-banner.visible { display: block; }
        .ns-task-body {
          padding: 12px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .ns-task-body::-webkit-scrollbar { width: 5px; }
        .ns-task-body::-webkit-scrollbar-thumb { background: #21314d; border-radius: 999px; }
        .ns-task-card {
          position: relative;
          border: 1px solid #162133;
          border-left-width: 4px;
          border-radius: 14px;
          background: rgba(255,255,255,0.03);
          padding: 12px 12px 12px 14px;
          transition: transform 0.16s ease, opacity 0.16s ease, border-color 0.16s ease;
        }
        .ns-task-card:hover { transform: translateX(-2px); border-color: #2b3d5d; }
        .ns-task-card.hot { border-left-color: #ff5d5d; }
        .ns-task-card.warm { border-left-color: #ffbf47; }
        .ns-task-card.cold { border-left-color: #4ade80; }
        .ns-task-card.done { opacity: 0.55; background: rgba(255,255,255,0.02); }
        .ns-task-card.done .ns-task-card-title { text-decoration: line-through; color: #8ea1bb; }
        .ns-task-card-head { display: flex; align-items: flex-start; gap: 10px; }
        .ns-task-check {
          width: 18px;
          height: 18px;
          margin-top: 1px;
          border-radius: 6px;
          border: 2px solid #35507c;
          background: transparent;
          cursor: pointer;
          flex-shrink: 0;
          position: relative;
        }
        .ns-task-check.checked { border-color: #34d399; background: rgba(52, 211, 153, 0.12); }
        .ns-task-check.checked::after {
          content: '';
          position: absolute;
          left: 4px;
          top: 1px;
          width: 4px;
          height: 8px;
          border-right: 2px solid #34d399;
          border-bottom: 2px solid #34d399;
          transform: rotate(45deg);
        }
        .ns-task-card-main { flex: 1; min-width: 0; }
        .ns-task-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
        .ns-task-card-title { font-size: 13px; font-weight: 700; color: #eff5ff; line-height: 1.4; }
        .ns-task-badge {
          padding: 3px 7px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.04em;
          flex-shrink: 0;
          border: 1px solid rgba(255,255,255,0.08);
        }
        .ns-task-badge.hot { color: #ffd7d7; background: rgba(255,93,93,0.14); }
        .ns-task-badge.warm { color: #ffefc5; background: rgba(255,191,71,0.14); }
        .ns-task-badge.cold { color: #d6ffe8; background: rgba(74,222,128,0.14); }
        .ns-task-meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; color: #9db0ca; margin-bottom: 6px; }
        .ns-task-why { font-size: 11px; color: #b8c9de; line-height: 1.45; margin-bottom: 6px; }
        .ns-task-snippet { font-size: 11px; color: #8ea1bb; line-height: 1.45; border-top: 1px solid #162133; padding-top: 6px; }
        .ns-task-loading, .ns-task-empty {
          padding: 40px 22px;
          text-align: center;
          color: #9db0ca;
          font-size: 13px;
          line-height: 1.6;
        }
        .ns-task-spinner {
          width: 30px;
          height: 30px;
          border: 2px solid #1a2740;
          border-top-color: #6f7dff;
          border-radius: 50%;
          margin: 0 auto 14px;
          animation: ns-task-spin 0.8s linear infinite;
        }
        @keyframes ns-task-spin { to { transform: rotate(360deg); } }
        .ns-task-snake {
          position: absolute;
          left: 42px;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #ffffff, #93c5fd 42%, #22d3ee 100%);
          box-shadow: 0 0 14px rgba(34, 211, 238, 0.55);
          animation: ns-snake-travel 0.7s ease-out forwards;
          pointer-events: none;
        }
        @keyframes ns-snake-travel {
          0% { opacity: 0; transform: translateY(18px) scale(0.5); }
          30% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-36px) scale(0.65); }
        }
        .ns-task-footer {
          padding: 12px;
          border-top: 1px solid #162133;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .ns-task-footer-copy { font-size: 11px; color: #93a6bf; }
        .ns-task-refresh {
          padding: 8px 12px;
          border: none;
          border-radius: 10px;
          background: linear-gradient(135deg, #6f7dff, #4b59e8);
          color: white;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .ns-task-refresh:disabled { opacity: 0.45; cursor: not-allowed; }
      </style>
      <div class="ns-track-rail">
        <div class="ns-track-stars">***</div>
        <div class="ns-track-shell">
          <div class="ns-track-fill" id="ns-track-fill"></div>
          <div class="ns-track-head" id="ns-track-head">*</div>
        </div>
        <div class="ns-track-note" id="ns-track-note">Ready to climb</div>
      </div>
      <div class="ns-task-main">
        <div class="ns-task-head">
          <div class="ns-task-title-row">
            <div class="ns-task-title-wrap">
              <div class="ns-task-mark">TB</div>
              <div>
                <div class="ns-task-title">AI Task Breakdown</div>
                <div class="ns-task-subtitle">One focused task lane with calm rewards</div>
              </div>
            </div>
            <button class="ns-task-close" id="ns-task-close" type="button">x</button>
          </div>
          <div class="ns-task-progress-row">
            <span id="ns-task-progress-copy">0 of 0 tasks complete</span>
            <strong id="ns-task-streak-copy">0 streak</strong>
          </div>
          <div class="ns-task-complete-banner" id="ns-task-complete-banner"></div>
        </div>
        <div class="ns-task-body" id="ns-task-body"></div>
        <div class="ns-task-footer">
          <div class="ns-task-footer-copy" id="ns-task-footer-copy">Ready to scan this channel</div>
          <button class="ns-task-refresh" id="ns-task-refresh" type="button">Re-scan</button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    panel.querySelector('#ns-task-close').onclick = () => {
      if (NS.settings) NS.settings.threadPrioritizer = false;
      try { chrome.storage.sync.set({ threadPrioritizer: false }); } catch (_) {}
      setEnabled(false);
    };
    panel.querySelector('#ns-task-refresh').onclick = runPrioritizer;
  }

  function hidePanel() {
    if (!panel) return;
    panel.remove();
    panel = null;
    tasks = [];
    completed = new Set();
    completionCelebrated = false;
  }

  function ensureSummaryMinimized() {
    if (NS.summarizer && NS.summarizer.minimizePanel) NS.summarizer.minimizePanel();
  }

  function setFooter(text) {
    const node = document.getElementById('ns-task-footer-copy');
    if (node) node.textContent = text;
  }

  function setLoading(text) {
    createPanel();
    const body = document.getElementById('ns-task-body');
    if (body) body.innerHTML = `<div class="ns-task-loading"><div class="ns-task-spinner"></div>${text}</div>`;
    setFooter('Reading the most recent conversation context');
  }

  function spawnSnakePulse() {
    if (!panel) return;
    const shell = panel.querySelector('.ns-track-rail');
    if (!shell) return;
    const pulse = document.createElement('div');
    pulse.className = 'ns-task-snake';
    pulse.style.top = '120px';
    shell.appendChild(pulse);
    setTimeout(() => pulse.remove(), 760);
  }

  function updateProgressVisuals() {
    if (!panel) return;
    const total = tasks.length;
    const done = completed.size;
    const percent = total ? Math.round((done / total) * 100) : 0;
    const fill = panel.querySelector('#ns-track-fill');
    const head = panel.querySelector('#ns-track-head');
    const copy = panel.querySelector('#ns-task-progress-copy');
    const note = panel.querySelector('#ns-track-note');
    const banner = panel.querySelector('#ns-task-complete-banner');

    if (fill) fill.style.height = `${percent}%`;
    if (head) head.style.bottom = `calc(${percent}% - 14px)`;
    if (copy) copy.textContent = `${done} of ${total} tasks complete`;
    if (note) note.textContent = total === 0 ? 'Ready to climb' : percent === 100 ? 'Trail complete' : `${percent}% climbed`;

    if (banner && total > 0 && done === total) {
      banner.classList.add('visible');
    } else if (banner) {
      banner.classList.remove('visible');
    }
  }

  function updateStreakLabel(streak) {
    const node = document.getElementById('ns-task-streak-copy');
    if (node) node.textContent = `${streak} streak`;
  }

  function awardCompletionStreak() {
    if (completionCelebrated) return;
    completionCelebrated = true;
    chrome.storage.local.get({ [STREAK_KEY]: getDefaultTaskStats() }, (stored) => {
      const stats = stored[STREAK_KEY] || getDefaultTaskStats();
      const today = todayKey();
      const yesterday = yesterdayKey();
      let streak = stats.streak || 0;
      if (stats.lastCompletedDate === today) streak = Math.max(1, streak);
      else if (stats.lastCompletedDate === yesterday) streak += 1;
      else streak = 1;
      const nextStats = {
        streak,
        lastCompletedDate: today,
        totalBoardsCleared: (stats.totalBoardsCleared || 0) + 1
      };
      chrome.storage.local.set({ [STREAK_KEY]: nextStats });
      updateStreakLabel(streak);
      const banner = document.getElementById('ns-task-complete-banner');
      if (banner) {
        banner.textContent = `All tasks completed. Take a short rest. You are on a ${streak}-board streak.`;
        banner.classList.add('visible');
      }
    });
  }

  function toggleTask(index) {
    if (completed.has(index)) completed.delete(index);
    else completed.add(index);

    const card = panel.querySelector(`.ns-task-card[data-id="${index}"]`);
    const check = panel.querySelector(`.ns-task-check[data-id="${index}"]`);
    if (card) card.classList.toggle('done', completed.has(index));
    if (check) check.classList.toggle('checked', completed.has(index));

    spawnSnakePulse();
    updateProgressVisuals();
    if (tasks.length > 0 && completed.size === tasks.length) awardCompletionStreak();
    else completionCelebrated = false;
  }

  function renderTasks(list) {
    createPanel();
    tasks = list;
    completed = new Set();
    completionCelebrated = false;
    const body = document.getElementById('ns-task-body');
    if (!body) return;

    if (!list.length) {
      body.innerHTML = '<div class="ns-task-empty">No clear tasks found in the recent Slack messages. Scroll a bit and run the breakdown again.</div>';
      setFooter('No actionable tasks found yet');
      updateProgressVisuals();
      return;
    }

    const order = { HOT: 0, WARM: 1, COLD: 2 };
    const sorted = list.slice().sort((a, b) => (order[a.priority] || 9) - (order[b.priority] || 9));
    body.innerHTML = sorted.map((task, index) => {
      const tone = task.priority.toLowerCase();
      return `
        <div class="ns-task-card ${tone}" data-id="${index}">
          <div class="ns-task-card-head">
            <button class="ns-task-check" type="button" data-id="${index}" aria-label="Mark task complete"></button>
            <div class="ns-task-card-main">
              <div class="ns-task-card-top">
                <div class="ns-task-card-title">${escapeHtml(task.title)}</div>
                <div class="ns-task-badge ${tone}">${escapeHtml(task.priority)}</div>
              </div>
              <div class="ns-task-meta">
                <span>Due: ${escapeHtml(task.due)}</span>
                <span>From: ${escapeHtml(task.from)}</span>
              </div>
              ${task.why ? `<div class="ns-task-why">${escapeHtml(task.why)}</div>` : ''}
              ${task.snippet ? `<div class="ns-task-snippet">${escapeHtml(task.snippet)}</div>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');

    body.querySelectorAll('.ns-task-check').forEach((button) => {
      button.addEventListener('click', () => toggleTask(button.dataset.id));
    });

    setFooter(`${list.length} task${list.length === 1 ? '' : 's'} extracted from recent messages`);
    chrome.storage.local.get({ [STREAK_KEY]: getDefaultTaskStats() }, (stored) => {
      updateStreakLabel((stored[STREAK_KEY] || getDefaultTaskStats()).streak || 0);
    });
    updateProgressVisuals();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function runPrioritizer() {
    createPanel();
    ensureSummaryMinimized();
    setLoading('Analyzing recent Slack messages...');
    const refresh = document.getElementById('ns-task-refresh');
    if (refresh) refresh.disabled = true;

    const threads = collectThreads();
    if (!threads.length) {
      renderTasks([]);
      setFooter('Open a Slack channel before scanning');
      if (refresh) refresh.disabled = false;
      return;
    }

    try {
      const list = await callGroq(threads, mentionHandle);
      renderTasks(list);
    } catch (error) {
      const body = document.getElementById('ns-task-body');
      if (body) body.innerHTML = `<div class="ns-task-empty">Task breakdown error: ${escapeHtml(error.message)}</div>`;
      setFooter('The AI scan could not finish this time');
    }

    if (refresh) refresh.disabled = false;
  }

  function setEnabled(on) {
    enabled = !!on;
    if (enabled) runPrioritizer();
    else hidePanel();
  }

  NS.threadPrioritizer = { setEnabled, runPrioritizer, hidePanel };
  NS.modules.push((settings) => {
    enabled = !!settings.threadPrioritizer;
    if (enabled) runPrioritizer();
  });
})();