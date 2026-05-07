// NeuroSense: Smart Thread Prioritizer — AI tags threads 🔴🟡🟢 by urgency + due date

(function () {
  const NS = window.neurosense;
  if (!NS) return;

  const GROQ_API_KEY = 'Your_api_key';
  const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
  const MESSAGE_SELECTOR = '[data-qa="message_content"]';

  let enabled = false;
  let panel = null;
  let mentionHandle = '';

  chrome.storage.sync.get({ mentionHandle: '' }, (s) => { mentionHandle = s.mentionHandle || ''; });

  function collectThreads() {
    return Array.from(document.querySelectorAll(MESSAGE_SELECTOR))
      .map(m => (m.textContent || '').trim())
      .filter(t => t.length > 20)
      .slice(-40);
  }

  async function callGroq(threads, handle) {
    const combined = threads.map((t, i) => `[MSG ${i + 1}]: ${t}`).join('\n');
    const prompt = `You are a workplace productivity assistant analyzing Slack messages.
User's name/handle: "${handle || 'unknown'}"
Messages:
${combined}
Analyze each message and extract TASKS that need attention. For each task:
- Assign priority: HOT, WARM, or COLD
  HOT = mentions the user by name OR has urgent deadline (today/ASAP/EOD/tomorrow)
  WARM = team decision pending, needs input, has a deadline within a week
  COLD = FYI only, no action needed, informational
- Extract due date if mentioned (or write "No date")
- Write a short task title (max 8 words)
- Write who assigned it if clear (or "Team")
Return ONLY a valid JSON array, no explanation, no markdown:
[{"priority":"HOT","title":"Review Q3 report by EOD","due":"Today","from":"Sarah","snippet":"brief original message snippet max 60 chars"}]
Return maximum 8 most important tasks. If no tasks found, return empty array [].`;

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 800
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err?.error?.message || 'Groq API error');
    }
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '[]';
    const clean = text.replace(/```json|```/g, '').trim();
    try { return JSON.parse(clean); } catch { return []; }
  }

  const PRIORITY = {
    HOT:  { emoji: '🔴', label: 'HOT',  color: '#ff4444' },
    WARM: { emoji: '🟡', label: 'WARM', color: '#f59e0b' },
    COLD: { emoji: '🟢', label: 'COLD', color: '#22c55e' }
  };

  function createPanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = 'ns-prioritizer-panel';
    panel.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=DM+Sans:wght@400;500;600;700&display=swap');

        #ns-prioritizer-panel {
          position: fixed;
          top: 60px;
          right: 0;
          width: 332px;
          height: calc(100vh - 60px);
          background: #080b10;
          border-left: 1px solid #0e1420;
          z-index: 99998;
          display: flex;
          flex-direction: row;
          font-family: 'DM Sans', sans-serif;
          box-shadow: -8px 0 40px rgba(0,0,0,0.6);
          animation: ns-slide-in 0.25s cubic-bezier(0.16,1,0.3,1);
          overflow: hidden;
        }
        @keyframes ns-slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }

        /* ---- VERTICAL PROGRESS BAR ---- */
        #ns-vbar-wrap {
          width: 14px;
          height: 100%;
          background: #0a0d12;
          border-right: 1px solid #0e1420;
          flex-shrink: 0;
          position: relative;
          overflow: visible;
        }
        #ns-vbar-fill {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 0%;
          background: linear-gradient(to top, #4ade80 0%, #22d3ee 60%, #a78bfa 100%);
          transition: height 0.9s cubic-bezier(0.4,0,0.2,1);
          border-radius: 3px 3px 0 0;
        }
        #ns-vbar-fill.glowing {
          box-shadow: 2px 0 14px rgba(74,222,128,0.45),
                     -2px 0 14px rgba(74,222,128,0.2);
        }
        #ns-vbar-fill::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 30px;
          background: linear-gradient(to bottom, rgba(255,255,255,0.25), transparent);
          border-radius: 3px 3px 0 0;
          animation: ns-vbar-shimmer 2s ease-in-out infinite;
        }
        @keyframes ns-vbar-shimmer {
          0%, 100% { opacity: 0.3; }
          50%      { opacity: 1; }
        }

        /* ---- STAR AT PEEK ---- */
        #ns-vbar-star {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          width: 32px;
          height: 32px;
          pointer-events: none;
          display: none;
          z-index: 10;
          transition: bottom 0.9s cubic-bezier(0.4,0,0.2,1);
        }
        #ns-vbar-star.active { display: block; }

        #ns-vbar-star-inner {
          width: 26px;
          height: 26px;
          margin: 0;
          background: none;
          animation: ns-star-pulse 1.6s ease-in-out infinite;
          filter: drop-shadow(0 0 6px #4ade80)
                  drop-shadow(0 0 14px #22d3ee)
                  drop-shadow(0 0 22px rgba(74,222,128,0.6));
        }
        @keyframes ns-star-pulse {
          0%, 100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
          25% {
            transform: scale(1.3) rotate(15deg);
            opacity: 0.9;
          }
          50% {
            transform: scale(1.1) rotate(-10deg);
            opacity: 1;
          }
          75% {
            transform: scale(1.25) rotate(8deg);
            opacity: 0.85;
          }
        }

        #ns-vbar-star-rays {
          position: absolute;
          top: 50%; left: 50%;
          width: 28px; height: 28px;
          margin: -14px 0 0 -14px;
          animation: ns-star-rays-spin 3s linear infinite;
        }
        #ns-vbar-star-rays::before,
        #ns-vbar-star-rays::after {
          content: '';
          position: absolute;
          top: 50%; left: 50%;
          width: 2px; height: 10px;
          background: rgba(74,222,128,0.6);
          border-radius: 1px;
          transform-origin: 1px 0;
        }
        #ns-vbar-star-rays::before {
          transform: translate(-50%, -100%) rotate(0deg);
          box-shadow:
            0 0 0 0 transparent,
            14px 0 0 -0.5px rgba(74,222,128,0.4),
            -14px 0 0 -0.5px rgba(74,222,128,0.4),
            0 14px 0 -0.5px rgba(34,211,238,0.4),
            0 -14px 0 -0.5px rgba(34,211,238,0.4);
        }
        #ns-vbar-star-rays::after {
          transform: translate(-50%, -100%) rotate(45deg);
          background: rgba(167,139,250,0.5);
          box-shadow:
            10px 10px 0 -0.5px rgba(167,139,250,0.3),
            -10px 10px 0 -0.5px rgba(167,139,250,0.3),
            10px -10px 0 -0.5px rgba(167,139,250,0.3),
            -10px -10px 0 -0.5px rgba(167,139,250,0.3);
        }
        @keyframes ns-star-rays-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        /* ---- MAIN CONTENT ---- */
        #ns-panel-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-width: 0;
        }

        #ns-p-header {
          padding: 16px 16px 12px;
          border-bottom: 1px solid #0e1420;
          background: #080b10;
          flex-shrink: 0;
        }
        #ns-p-title-row {
          display: flex; align-items: center;
          justify-content: space-between; margin-bottom: 12px;
        }
        #ns-p-title {
          font-size: 13px; font-weight: 700; color: #f1f5f9;
          letter-spacing: 0.5px; display: flex; align-items: center; gap: 8px;
        }
        #ns-p-title .ns-logo {
          width: 20px; height: 20px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border-radius: 5px;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px;
        }
        #ns-p-close {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 6px; color: #64748b; font-size: 13px;
          cursor: pointer; width: 26px; height: 26px;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        #ns-p-close:hover { background: rgba(255,255,255,0.1); color: #e2e8f0; }

        #ns-p-counts { display: flex; gap: 8px; margin-bottom: 10px; }
        .ns-count-pill {
          display: flex; align-items: center; gap: 5px;
          padding: 4px 8px; border-radius: 20px; font-size: 11px;
          font-weight: 600; font-family: 'JetBrains Mono', monospace;
          border: 1px solid; transition: transform 0.15s;
        }
        .ns-count-pill:hover { transform: scale(1.05); }
        .ns-count-pill.hot  { color: #ff4444; background: rgba(255,68,68,0.08);  border-color: rgba(255,68,68,0.2); }
        .ns-count-pill.warm { color: #f59e0b; background: rgba(245,158,11,0.08); border-color: rgba(245,158,11,0.2); }
        .ns-count-pill.cold { color: #22c55e; background: rgba(34,197,94,0.08);  border-color: rgba(34,197,94,0.2); }

        #ns-p-filter { display: flex; gap: 4px; }
        .ns-filter-btn {
          flex: 1; padding: 5px 0;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 6px; color: #64748b; font-size: 11px;
          font-weight: 600; cursor: pointer; transition: all 0.15s;
          font-family: 'DM Sans', sans-serif; letter-spacing: 0.3px;
        }
        .ns-filter-btn:hover { background: rgba(255,255,255,0.08); color: #94a3b8; }
        .ns-filter-btn.active { background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.3); color: #a5b4fc; }

        /* ---- PROGRESS TEXT ROW ---- */
        #ns-progress-row {
          display: flex; align-items: center;
          justify-content: space-between;
          padding: 8px 16px;
          border-bottom: 1px solid #0e1420;
          flex-shrink: 0;
        }
        #ns-progress-label { font-size: 11px; color: #334155; font-family: 'JetBrains Mono', monospace; }
        #ns-progress-pct   { font-size: 12px; font-weight: 700; color: #94a3b8; font-family: 'JetBrains Mono', monospace; transition: color 0.4s ease; }

        #ns-done-msg {
          display: none; align-items: center; gap: 5px;
          font-size: 11px; color: #4ade80; font-family: 'DM Sans', sans-serif;
          font-weight: 500; padding: 6px 16px;
          background: rgba(74,222,128,0.06);
          border-bottom: 1px solid rgba(74,222,128,0.12);
          opacity: 0; transition: opacity 0.8s ease; flex-shrink: 0;
        }
        #ns-done-msg.visible { display: flex; opacity: 1; }

        /* ---- BODY ---- */
        #ns-p-body {
          flex: 1; overflow-y: auto; padding: 12px;
          scrollbar-width: thin; scrollbar-color: #1e2130 transparent;
        }
        #ns-p-body::-webkit-scrollbar { width: 3px; }
        #ns-p-body::-webkit-scrollbar-thumb { background: #1e2130; border-radius: 3px; }

        /* ---- TASK CARDS ---- */
        .ns-task-card {
          background: #0c1018; border: 1px solid #0e1420;
          border-radius: 10px; padding: 12px 13px; margin-bottom: 8px;
          cursor: pointer; position: relative; overflow: hidden;
          transition: all 0.5s ease, opacity 0.6s ease;
        }
        .ns-task-card::before {
          content: ''; position: absolute; left: 0; top: 0; bottom: 0;
          width: 3px; border-radius: 3px 0 0 3px;
        }
        .ns-task-card.hot::before  { background: #ff4444; box-shadow: 0 0 8px rgba(255,68,68,0.5); }
        .ns-task-card.warm::before { background: #f59e0b; box-shadow: 0 0 8px rgba(245,158,11,0.5); }
        .ns-task-card.cold::before { background: #22c55e; box-shadow: 0 0 8px rgba(34,197,94,0.3); }
        .ns-task-card:hover { transform: translateX(-2px); border-color: #1e2535; background: #0f1520; }
        .ns-task-card.hot:hover  { border-color: rgba(255,68,68,0.2); }
        .ns-task-card.warm:hover { border-color: rgba(245,158,11,0.2); }
        .ns-task-card.cold:hover { border-color: rgba(34,197,94,0.15); }
        .ns-task-card.done { opacity: 0.45; background: #0a0d12; }
        .ns-task-card.done .ns-task-title { text-decoration: line-through; color: #334155; }

        .ns-task-top {
          display: flex; align-items: flex-start;
          justify-content: space-between; gap: 8px; margin-bottom: 7px;
        }
        .ns-task-check {
          width: 18px; height: 18px; border-radius: 5px;
          border: 2px solid #1e2535; background: transparent;
          cursor: pointer; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.3s ease; position: relative; overflow: hidden;
        }
        .ns-task-check:hover { border-color: #4ade80; background: rgba(74,222,128,0.05); }
        .ns-task-check.checked { border-color: #4ade80; background: rgba(74,222,128,0.12); }
        .ns-task-check.checked::after {
          content: ''; position: absolute; width: 5px; height: 9px;
          border-right: 2px solid #4ade80; border-bottom: 2px solid #4ade80;
          transform: rotate(45deg) translate(-1px,-1px);
          animation: ns-check-draw 0.3s ease forwards;
        }
        @keyframes ns-check-draw {
          from { opacity: 0; transform: rotate(45deg) translate(-1px,-1px) scale(0.5); }
          to   { opacity: 1; transform: rotate(45deg) translate(-1px,-1px) scale(1); }
        }
        .ns-task-badge {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 7px; border-radius: 4px; font-size: 10px;
          font-weight: 700; font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.5px; flex-shrink: 0;
        }
        .ns-task-badge.hot  { background: rgba(255,68,68,0.12);  color: #ff6666; border: 1px solid rgba(255,68,68,0.2); }
        .ns-task-badge.warm { background: rgba(245,158,11,0.12); color: #fbbf24; border: 1px solid rgba(245,158,11,0.2); }
        .ns-task-badge.cold { background: rgba(34,197,94,0.1);   color: #4ade80; border: 1px solid rgba(34,197,94,0.15); }
        .ns-task-title { font-size: 13px; font-weight: 600; color: #e2e8f0; line-height: 1.4; flex: 1; }
        .ns-task-meta  { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
        .ns-task-due   { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #475569; font-family: 'JetBrains Mono', monospace; }
        .ns-task-due.urgent { color: #ff6666; }
        .ns-task-from  { font-size: 11px; color: #334155; }
        .ns-task-snippet {
          font-size: 11px; color: #334155; line-height: 1.5;
          border-top: 1px solid #0e1420; padding-top: 7px; margin-top: 4px;
          font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        /* ---- PARTICLE ---- */
        .ns-particle {
          position: absolute; width: 5px; height: 5px; border-radius: 50%;
          background: #4ade80; pointer-events: none;
          animation: ns-float-up 0.8s ease forwards; z-index: 10;
        }
        @keyframes ns-float-up {
          0%   { opacity: 0.8; transform: translateY(0) scale(1); }
          100% { opacity: 0;   transform: translateY(-28px) scale(0.3); }
        }

        /* ---- LOADING / EMPTY ---- */
        .ns-loading {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 14px; padding: 48px 24px;
          color: #334155; font-size: 13px; text-align: center;
        }
        .ns-spinner {
          width: 32px; height: 32px; border: 2px solid #0e1420;
          border-top-color: #6366f1; border-radius: 50%;
          animation: ns-spin 0.7s linear infinite;
        }
        @keyframes ns-spin { to { transform: rotate(360deg); } }
        .ns-empty {
          text-align: center; padding: 48px 24px;
          color: #1e2535; font-size: 13px; line-height: 1.8;
        }
        .ns-empty .ns-empty-icon { font-size: 32px; margin-bottom: 12px; display: block; }

        /* ---- FOOTER ---- */
        #ns-p-footer {
          padding: 10px 12px; border-top: 1px solid #0e1420;
          display: flex; gap: 8px; flex-shrink: 0;
        }
        #ns-scan-btn {
          flex: 1; padding: 8px;
          background: linear-gradient(135deg, #6366f1, #4f46e5);
          color: white; border: none; border-radius: 7px;
          font-size: 12px; font-weight: 600; cursor: pointer;
          font-family: 'DM Sans', sans-serif; transition: opacity 0.15s;
          display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        #ns-scan-btn:hover { opacity: 0.85; }
        #ns-scan-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        #ns-msg-info {
          font-size: 10px; color: #1e2535; text-align: center;
          padding: 0 4px; display: flex; align-items: center;
          font-family: 'JetBrains Mono', monospace;
        }
      </style>

      <div id="ns-vbar-wrap">
        <div id="ns-vbar-fill"></div>
        <div id="ns-vbar-star">
          <div id="ns-vbar-star-rays"></div>
          <svg id="ns-vbar-star-inner"
            width="26" height="26" viewBox="0 0 26 26"
            xmlns="http://www.w3.org/2000/svg"
            style="filter: drop-shadow(0 0 6px #4ade80) drop-shadow(0 0 14px #22d3ee) drop-shadow(0 0 22px rgba(74,222,128,0.6));">
            <polygon fill="#4ade80"
              points="13,1 16.09,9.26 25,9.26 17.95,14.74 20.55,23 13,18 5.45,23 8.05,14.74 1,9.26 9.91,9.26"/>
          </svg>
        </div>
      </div>

      <div id="ns-panel-content">
        <div id="ns-p-header">
          <div id="ns-p-title-row">
            <div id="ns-p-title">
              <div class="ns-logo">⚡</div>
              Thread Prioritizer
            </div>
            <button id="ns-p-close">✕</button>
          </div>
          <div id="ns-p-counts">
            <div class="ns-count-pill hot">🔴 <span id="ns-hot-count">0</span></div>
            <div class="ns-count-pill warm">🟡 <span id="ns-warm-count">0</span></div>
            <div class="ns-count-pill cold">🟢 <span id="ns-cold-count">0</span></div>
          </div>
          <div id="ns-p-filter">
            <button class="ns-filter-btn active" data-filter="ALL">ALL</button>
            <button class="ns-filter-btn" data-filter="HOT">🔴 HOT</button>
            <button class="ns-filter-btn" data-filter="WARM">🟡 WARM</button>
            <button class="ns-filter-btn" data-filter="COLD">🟢 COLD</button>
          </div>
        </div>

        <div id="ns-progress-row">
          <span id="ns-progress-label">0 of 0 tasks done</span>
          <span id="ns-progress-pct">0%</span>
        </div>

        <div id="ns-done-msg">🌿 You did it. Rest now.</div>

        <div id="ns-p-body">
          <div class="ns-loading">
            <div class="ns-spinner"></div>
            <span>Scanning threads...</span>
          </div>
        </div>

        <div id="ns-p-footer">
          <span id="ns-msg-info"></span>
          <button id="ns-scan-btn">⚡ Re-scan</button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    panel.querySelector('#ns-p-close').onclick = removePanel;
    panel.querySelector('#ns-scan-btn').onclick = runPrioritizer;
    panel.querySelectorAll('.ns-filter-btn').forEach(btn => {
      btn.onclick = () => {
        panel.querySelectorAll('.ns-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filterTasks(btn.dataset.filter);
      };
    });
  }

  // --- Progress tracking ---
  let allTasks = [];
  let completedIds = new Set();

  function updateProgress() {
    const total = allTasks.length;
    const done  = completedIds.size;
    const pct   = total === 0 ? 0 : Math.round((done / total) * 100);

    const vbar    = document.getElementById('ns-vbar-fill');
    const star    = document.getElementById('ns-vbar-star');
    const wrap    = document.getElementById('ns-vbar-wrap');
    const label   = document.getElementById('ns-progress-label');
    const pctEl   = document.getElementById('ns-progress-pct');
    const doneMsg = document.getElementById('ns-done-msg');

    if (vbar) {
      vbar.style.height = pct + '%';
      vbar.classList.toggle('glowing', done > 0);
    }

    if (star && wrap) {
      if (done > 0 && pct > 0) {
        star.classList.add('active');
        const wrapHeight = wrap.offsetHeight;
        const starBottomPx = (pct / 100) * wrapHeight;
        star.style.bottom = (starBottomPx - 10) + 'px';
      } else {
        star.classList.remove('active');
      }
    }

    if (label) label.textContent = `${done} of ${total} task${total !== 1 ? 's' : ''} done`;
    if (pctEl) {
      pctEl.textContent = pct + '%';
      pctEl.style.color = pct === 100 ? '#4ade80' : pct >= 50 ? '#22d3ee' : '#94a3b8';
    }

    if (doneMsg) {
      if (total > 0 && done === total) {
        doneMsg.style.display = 'flex';
        setTimeout(() => doneMsg.classList.add('visible'), 50);
      } else {
        doneMsg.classList.remove('visible');
        setTimeout(() => {
          if (!doneMsg.classList.contains('visible')) doneMsg.style.display = 'none';
        }, 900);
      }
    }
  }

  function spawnParticle(card) {
    const dot = document.createElement('div');
    dot.className = 'ns-particle';
    dot.style.left = '24px';
    dot.style.bottom = '12px';
    card.appendChild(dot);
    setTimeout(() => dot.remove(), 900);
  }

  function renderTasks(tasks) {
    allTasks = tasks;
    completedIds = new Set();
    updateCounts(tasks);
    updateProgress();

    const body = document.getElementById('ns-p-body');
    if (!body) return;

    if (tasks.length === 0) {
      body.innerHTML = `
        <div class="ns-empty">
          <span class="ns-empty-icon">🎉</span>
          No tasks found in current view.<br>
          <span style="color:#1e2535">Try scrolling through more messages then re-scan.</span>
        </div>`;
      return;
    }

    const order = { HOT: 0, WARM: 1, COLD: 2 };
    const sorted = [...tasks].sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3));

    body.innerHTML = sorted.map((task, i) => {
      const p = PRIORITY[task.priority] || PRIORITY.COLD;
      const pClass = task.priority.toLowerCase();
      const isUrgent = task.priority === 'HOT' || (task.due && /today|asap|eod/i.test(task.due));
      return `
        <div class="ns-task-card ${pClass}" data-priority="${task.priority}" data-id="${i}" style="animation-delay:${i * 0.05}s">
          <div class="ns-task-top">
            <div class="ns-task-check" data-id="${i}" title="Mark complete"></div>
            <div class="ns-task-title">${task.title}</div>
            <div class="ns-task-badge ${pClass}">${p.emoji} ${p.label}</div>
          </div>
          <div class="ns-task-meta">
            <div class="ns-task-due ${isUrgent ? 'urgent' : ''}">📅 ${task.due || 'No date'}</div>
            <div class="ns-task-from">👤 ${task.from || 'Team'}</div>
          </div>
          ${task.snippet ? `<div class="ns-task-snippet">"${task.snippet}"</div>` : ''}
        </div>`;
    }).join('');

    body.querySelectorAll('.ns-task-check').forEach(checkbox => {
      checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
        const id   = checkbox.dataset.id;
        const card = body.querySelector(`.ns-task-card[data-id="${id}"]`);
        if (!card) return;

        if (completedIds.has(id)) {
          completedIds.delete(id);
          checkbox.classList.remove('checked');
          card.classList.remove('done');
        } else {
          completedIds.add(id);
          checkbox.classList.add('checked');
          spawnParticle(card);
          setTimeout(() => card.classList.add('done'), 320);
        }
        updateProgress();
      });
    });
  }

  function filterTasks(filter) {
    document.querySelectorAll('.ns-task-card').forEach(card => {
      card.style.display = (filter === 'ALL' || card.dataset.priority === filter) ? 'block' : 'none';
    });
  }

  function updateCounts(tasks) {
    const hot  = tasks.filter(t => t.priority === 'HOT').length;
    const warm = tasks.filter(t => t.priority === 'WARM').length;
    const cold = tasks.filter(t => t.priority === 'COLD').length;
    const h = document.getElementById('ns-hot-count');
    const w = document.getElementById('ns-warm-count');
    const c = document.getElementById('ns-cold-count');
    if (h) h.textContent = hot;
    if (w) w.textContent = warm;
    if (c) c.textContent = cold;
  }

  function setBodyLoading(text = 'Analyzing with AI...') {
    const body = document.getElementById('ns-p-body');
    if (body) body.innerHTML = `<div class="ns-loading"><div class="ns-spinner"></div><span>${text}</span></div>`;
  }

  async function runPrioritizer() {
    createPanel();
    const btn = document.getElementById('ns-scan-btn');
    if (btn) btn.disabled = true;

    setBodyLoading('Analyzing threads with AI...');

    const threads = collectThreads();
    const info = document.getElementById('ns-msg-info');
    if (info) info.textContent = `${threads.length} msgs`;

    if (threads.length === 0) {
      const body = document.getElementById('ns-p-body');
      if (body) body.innerHTML = `<div class="ns-empty"><span class="ns-empty-icon">💬</span>No messages found.<br><span style="color:#1e2535">Open a Slack channel first.</span></div>`;
      if (btn) btn.disabled = false;
      return;
    }

    try {
      const tasks = await callGroq(threads, mentionHandle);
      renderTasks(tasks);
    } catch (err) {
      const body = document.getElementById('ns-p-body');
      if (body) body.innerHTML = `<div class="ns-empty" style="color:#ff6666">❌ ${err.message}</div>`;
    }

    if (btn) btn.disabled = false;
  }

  function removePanel() {
    if (panel) { panel.remove(); panel = null; }
  }

  function setEnabled(on) {
    enabled = !!on;
    if (enabled) runPrioritizer();
    else removePanel();
  }

  NS.threadPrioritizer = { setEnabled, runPrioritizer };
  NS.modules.push((settings) => setEnabled(!!settings.threadPrioritizer));
})();