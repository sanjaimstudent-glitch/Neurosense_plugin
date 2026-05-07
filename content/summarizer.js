// NeuroSense AI Content Summarizer: workspace summary + fullscreen control center

(function () {
  const NS = window.neurosense;
  if (!NS) return;

  const MESSAGE_SELECTOR = '[data-qa="message_content"]';
  const MIN_WORDS = 5;
  const GROQ_API_KEY = 'Your api key';
  const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

  let enabled = false;
  let summaryBar = null;
  let drawerOpen = false;
  let minimized = false;

  function collectMessages() {
    return Array.from(document.querySelectorAll(MESSAGE_SELECTOR))
      .map((m) => (m.textContent || '').trim())
      .filter((t) => t.split(/\s+/).length >= MIN_WORDS);
  }

  async function callGemini(messages) {
    const combined = messages.map((m, i) => `Message ${i + 1}: ${m}`).join('\n');
    const prompt = `You are a workplace assistant analyzing a Slack workspace conversation.

Here are the messages:
${combined}

Provide a concise summary with:
1. Overview (1-2 sentences)
2. Urgent Items (deadlines, ASAP - bullet each)
3. Action Items (things to do - bullet each)
4. Open Questions (unanswered questions - bullet each)
5. Key Decisions (conclusions reached - bullet each)

If a section has nothing, write "None". Keep under 200 words.`;

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 512
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err?.error?.message || 'Groq API error');
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No summary generated.';
  }

  function parseSections(text) {
    const sections = [];
    const lines = text.split('\n').filter(Boolean);
    let current = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      const isHeading = /^(?:[1-5][.)]?\s*)?(overview|urgent items|action items|open questions|key decisions)\b/i.test(line);
      if (isHeading) {
        if (current) sections.push(current);
        current = { heading: line.replace(/^[1-5][.)]?\s*/, ''), bullets: [] };
      } else if (/^[-*]/.test(line)) {
        if (current) current.bullets.push(line.replace(/^[-*]\s*/, ''));
      } else if (current) {
        if (current.bullets.length === 0) current.heading += ' ' + line;
        else current.bullets.push(line);
      }
    }

    if (current) sections.push(current);
    return sections;
  }

  function getSetting(key, fallback) {
    return NS.settings && NS.settings[key] !== undefined ? NS.settings[key] : fallback;
  }

  function hasFocusContext() {
    return !!document.fullscreenElement || !!getSetting('focusMode', false) || document.body.classList.contains('neurosense-focus-mode');
  }

  function getPlaceholderContent() {
    return [
      '<div class="ns-section">',
      '  <div class="ns-section-heading">Focus Controls Ready</div>',
      '  <div class="ns-section-text">Tap the Focus Controls button to slide up the full control panel.</div>',
      '</div>'
    ].join('');
  }

  function createSummaryBar() {
    if (summaryBar) return;

    summaryBar = document.createElement('div');
    summaryBar.id = 'neurosense-summary-bar';
    summaryBar.innerHTML = `
      <style>
        #neurosense-summary-bar {
          position: fixed;
          bottom: 28px;
          right: 28px;
          z-index: 99999;
          width: 380px;
          background: #0f1117;
          border: 1px solid #2a2d3a;
          border-radius: 16px;
          box-shadow: 0 18px 50px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
          font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
          overflow: hidden;
          transition: width 0.28s ease, height 0.28s ease, transform 0.28s ease, opacity 0.28s ease, border-radius 0.28s ease;
          color: #e2e8f0;
        }
        #neurosense-summary-bar.ns-minimized {
          width: 68px;
          height: 68px;
          border-radius: 22px;
          overflow: visible;
          background: radial-gradient(circle at 30% 30%, #28365a 0%, #171d31 45%, #10141f 100%);
          border-color: rgba(121, 132, 255, 0.35);
          box-shadow: 0 14px 30px rgba(24, 28, 49, 0.45), 0 0 0 1px rgba(255,255,255,0.05);
        }
        #neurosense-summary-bar.ns-minimized #ns-bar-header,
        #neurosense-summary-bar.ns-minimized #ns-bar-body,
        #neurosense-summary-bar.ns-minimized #ns-bar-footer {
          display: none;
        }
        #ns-mini-launcher {
          display: none;
          position: absolute;
          inset: 0;
          border: none;
          border-radius: inherit;
          background: transparent;
          cursor: pointer;
          padding: 0;
        }
        #neurosense-summary-bar.ns-minimized #ns-mini-launcher {
          display: block;
        }
        .ns-mini-core {
          position: absolute;
          inset: 8px;
          border-radius: 18px;
          background: linear-gradient(160deg, rgba(117, 131, 255, 0.95), rgba(84, 214, 140, 0.85));
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.2), 0 8px 18px rgba(84, 214, 140, 0.18);
          display: flex;
          align-items: center;
          justify-content: center;
          animation: ns-mini-float 2.6s ease-in-out infinite;
        }
        .ns-mini-brain {
          width: 30px;
          height: 30px;
          filter: drop-shadow(0 3px 8px rgba(10, 14, 26, 0.3));
        }
        .ns-mini-brain path {
          fill: rgba(12, 17, 30, 0.95);
          stroke: #dce7ff;
          stroke-width: 1.5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .ns-mini-brain .brain-accent {
          stroke: #8ef5c0;
          stroke-width: 1.2;
        }
        .ns-mini-badge {
          position: absolute;
          right: 4px;
          top: 4px;
          min-width: 18px;
          height: 18px;
          padding: 0 4px;
          border-radius: 999px;
          background: #0f1117;
          color: #dce7ff;
          font-size: 10px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255,255,255,0.08);
        }
        @keyframes ns-mini-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        #neurosense-summary-bar.ns-context-only {
          width: 240px;
        }
        #ns-bar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: linear-gradient(135deg, #1a1f2e 0%, #0f1117 100%);
          border-bottom: 1px solid #1e2130;
        }
        #ns-bar-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: #e2e8f0;
          letter-spacing: 0.3px;
        }
        #ns-bar-title span.dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #4ade80;
          box-shadow: 0 0 6px #4ade80;
          animation: ns-pulse 2s infinite;
        }
        @keyframes ns-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        #ns-bar-actions {
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .ns-icon-btn {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          color: #94a3b8;
          font-size: 13px;
          cursor: pointer;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.18s;
        }
        .ns-icon-btn:hover {
          background: rgba(255,255,255,0.12);
          color: #e2e8f0;
        }
        #ns-bar-body {
          padding: 14px 16px 16px;
          max-height: 440px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: #2a2d3a transparent;
        }
        #ns-bar-body::-webkit-scrollbar { width: 4px; }
        #ns-bar-body::-webkit-scrollbar-track { background: transparent; }
        #ns-bar-body::-webkit-scrollbar-thumb { background: #2a2d3a; border-radius: 4px; }
        #ns-drawer-toggle {
          display: none;
          width: 100%;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
          padding: 12px 14px;
          border: 1px solid #2d3650;
          border-radius: 12px;
          background: linear-gradient(135deg, rgba(93, 97, 246, 0.22), rgba(34, 197, 94, 0.14));
          color: #eef2ff;
          cursor: pointer;
          transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
        }
        #ns-drawer-toggle:hover {
          transform: translateY(-1px);
          border-color: #5d61f6;
          box-shadow: 0 10px 24px rgba(93, 97, 246, 0.18);
        }
        .ns-drawer-toggle-copy {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          text-align: left;
        }
        .ns-drawer-label {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .ns-drawer-subtitle {
          font-size: 11px;
          color: #b8c3d9;
        }
        .ns-drawer-chevron {
          font-size: 18px;
          transition: transform 0.28s ease;
        }
        #neurosense-summary-bar.ns-controls-visible #ns-drawer-toggle {
          display: flex;
        }
        #neurosense-summary-bar.ns-drawer-open .ns-drawer-chevron {
          transform: rotate(180deg);
        }
        #ns-control-center {
          display: block;
          margin-bottom: 16px;
          padding: 12px;
          border: 1px solid #262b3a;
          border-radius: 14px;
          background: linear-gradient(180deg, rgba(37, 47, 72, 0.84), rgba(17, 24, 39, 0.94));
          transform-origin: bottom center;
          transform: translateY(18px) scale(0.96);
          opacity: 0;
          max-height: 0;
          overflow: hidden;
          pointer-events: none;
          transition: transform 0.32s ease, opacity 0.24s ease, max-height 0.32s ease, margin 0.32s ease, padding 0.32s ease;
        }
        #neurosense-summary-bar.ns-drawer-open #ns-control-center {
          transform: translateY(0) scale(1);
          opacity: 1;
          max-height: 260px;
          pointer-events: auto;
        }
        #neurosense-summary-bar:not(.ns-controls-visible) #ns-control-center {
          display: none;
        }
        .ns-control-label {
          margin-bottom: 10px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #8ea0bb;
        }
        .ns-control-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .ns-control-btn {
          border: 1px solid #30384d;
          border-radius: 10px;
          background: rgba(255,255,255,0.04);
          color: #d7e1ee;
          padding: 10px 8px;
          cursor: pointer;
          transform: translateY(14px);
          opacity: 0;
          transition: transform 0.24s ease, opacity 0.24s ease, border-color 0.18s ease, background 0.18s ease;
          text-align: left;
        }
        #neurosense-summary-bar.ns-drawer-open .ns-control-btn {
          transform: translateY(0);
          opacity: 1;
        }
        #neurosense-summary-bar.ns-drawer-open .ns-control-btn:nth-child(2) {
          transition-delay: 0.04s;
        }
        #neurosense-summary-bar.ns-drawer-open .ns-control-btn:nth-child(3) {
          transition-delay: 0.08s;
        }
        .ns-control-btn:hover {
          transform: translateY(-1px);
          border-color: #5565a6;
          background: rgba(99, 102, 241, 0.12);
        }
        .ns-control-btn.is-active {
          border-color: #4ade80;
          background: rgba(74, 222, 128, 0.12);
          box-shadow: inset 0 0 0 1px rgba(74, 222, 128, 0.2);
        }
        .ns-control-btn-title {
          display: block;
          font-size: 12px;
          font-weight: 700;
          margin-bottom: 4px;
          color: #f8fafc;
        }
        .ns-control-btn-state {
          display: block;
          font-size: 11px;
          color: #93a5bf;
        }
        .ns-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 24px 0;
          color: #64748b;
          font-size: 13px;
        }
        .ns-spinner {
          width: 28px;
          height: 28px;
          border: 2px solid #1e2130;
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: ns-spin 0.8s linear infinite;
        }
        @keyframes ns-spin { to { transform: rotate(360deg); } }
        .ns-section { margin-bottom: 14px; }
        .ns-section:last-child { margin-bottom: 0; }
        .ns-section-heading {
          font-size: 12px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          margin-bottom: 6px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .ns-section-heading::after {
          content: '';
          flex: 1;
          height: 1px;
          background: linear-gradient(to right, #1e2130, transparent);
        }
        .ns-section-text {
          font-size: 13px;
          color: #cbd5e1;
          line-height: 1.6;
        }
        .ns-bullet {
          display: flex;
          gap: 8px;
          margin-bottom: 5px;
          font-size: 13px;
          color: #cbd5e1;
          line-height: 1.5;
        }
        .ns-bullet::before {
          content: '>';
          color: #6366f1;
          font-weight: 700;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .ns-none {
          font-size: 12px;
          color: #53627a;
          font-style: italic;
        }
        .ns-error {
          color: #f87171;
          font-size: 13px;
          text-align: center;
          padding: 16px 0;
        }
        #ns-bar-footer {
          padding: 10px 16px;
          border-top: 1px solid #1e2130;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        #ns-msg-count {
          font-size: 11px;
          color: #53627a;
        }
        #ns-refresh-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          background: linear-gradient(135deg, #6366f1, #4f46e5);
          color: white;
          border: none;
          border-radius: 6px;
          padding: 5px 12px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        #ns-refresh-btn:hover { opacity: 0.85; }
        #ns-refresh-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      </style>
      <button id="ns-mini-launcher" type="button" aria-label="Open NeuroSense panel">
        <span class="ns-mini-core">
          <svg class="ns-mini-brain" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M12 6c-3.2 0-5.8 2.4-5.8 5.4 0 .6.1 1.2.3 1.8-1.8.9-3 2.7-3 4.8 0 2.9 2.4 5.2 5.4 5.2h4.1V6.8c-.3-.5-.7-.8-1-.8z"></path>
            <path d="M20 6c3.2 0 5.8 2.4 5.8 5.4 0 .6-.1 1.2-.3 1.8 1.8.9 3 2.7 3 4.8 0 2.9-2.4 5.2-5.4 5.2H19V6.8c.3-.5.7-.8 1-.8z"></path>
            <path class="brain-accent" d="M16 8.5v14"></path>
            <path class="brain-accent" d="M11.2 11.2c1 .2 1.8.8 2.2 1.7"></path>
            <path class="brain-accent" d="M20.8 11.2c-1 .2-1.8.8-2.2 1.7"></path>
            <path class="brain-accent" d="M10.8 17c1.4 0 2.4.5 3 1.6"></path>
            <path class="brain-accent" d="M21.2 17c-1.4 0-2.4.5-3 1.6"></path>
          </svg>
          <span class="ns-mini-badge">NS</span>
        </span>
      </button>
      <div id="ns-bar-header">
        <div id="ns-bar-title">
          <span class="dot"></span>
          NeuroSense - AI Summary
        </div>
        <div id="ns-bar-actions">
          <button class="ns-icon-btn" id="ns-close-btn" title="Minimize">-</button>
        </div>
      </div>
      <div id="ns-bar-body">
        <button id="ns-drawer-toggle" type="button" aria-expanded="false">
          <span class="ns-drawer-toggle-copy">
            <span class="ns-drawer-label">Focus Controls</span>
            <span class="ns-drawer-subtitle">Tap to slide up the full control panel</span>
          </span>
          <span class="ns-drawer-chevron">^</span>
        </button>
        <div id="ns-control-center">
          <div class="ns-control-label">Focus Control Center</div>
          <div class="ns-control-grid">
            <button class="ns-control-btn" id="ns-control-focus" type="button">
              <span class="ns-control-btn-title">Focus Mode</span>
              <span class="ns-control-btn-state"></span>
            </button>
            <button class="ns-control-btn" id="ns-control-tts" type="button">
              <span class="ns-control-btn-title">Text To Speech</span>
              <span class="ns-control-btn-state"></span>
            </button>
            <button class="ns-control-btn" id="ns-control-summary" type="button">
              <span class="ns-control-btn-title">Summarize Workspace</span>
              <span class="ns-control-btn-state"></span>
            </button>
          </div>
        </div>
        <div id="ns-summary-content"></div>
      </div>
      <div id="ns-bar-footer">
        <span id="ns-msg-count"></span>
        <button id="ns-refresh-btn">Refresh</button>
      </div>
    `;

    document.body.appendChild(summaryBar);
    document.getElementById('ns-close-btn').onclick = () => {
      minimized = true;
      refreshPanelForContext();
    };
    document.getElementById('ns-mini-launcher').onclick = () => {
      minimized = false;
      refreshPanelForContext();
    };
    document.getElementById('ns-refresh-btn').onclick = runSummary;
    document.getElementById('ns-control-focus').onclick = () => toggleSetting('focusMode');
    document.getElementById('ns-control-tts').onclick = () => toggleSetting('ttsEnabled');
    document.getElementById('ns-control-summary').onclick = () => {
      persistSetting('summarizer', true);
      runSummary();
    };
    document.getElementById('ns-drawer-toggle').onclick = () => {
      drawerOpen = !drawerOpen;
      refreshPanelForContext();
      const center = document.getElementById('ns-control-center');
      if (drawerOpen && center) {
        center.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    };
  }

  function removeSummaryBar() {
    enabled = false;
    drawerOpen = false;
    minimized = false;
    if (summaryBar) {
      summaryBar.remove();
      summaryBar = null;
    }
  }

  function ensureFocusLauncher() {
    if (!summaryBar) createSummaryBar();
    const body = document.getElementById('ns-summary-content');
    if (body && !body.innerHTML.trim()) {
      body.innerHTML = getPlaceholderContent();
    }
    const countEl = document.getElementById('ns-msg-count');
    if (countEl && !countEl.textContent.trim()) countEl.textContent = 'Control panel ready';
  }

  function setBodyContent(html) {
    createSummaryBar();
    const body = document.getElementById('ns-summary-content');
    if (body) body.innerHTML = html;
  }

  function updateControlButton(id, active, stateText) {
    const button = document.getElementById(id);
    if (!button) return;
    button.classList.toggle('is-active', !!active);
    const state = button.querySelector('.ns-control-btn-state');
    if (state) state.textContent = stateText;
  }

  function refreshPanelForContext() {
    const focusContext = hasFocusContext();
    const shouldStayVisible = focusContext || !!getSetting('summarizer', false) || enabled;
    if (!shouldStayVisible) {
      removeSummaryBar();
      return;
    }

    ensureFocusLauncher();
    if (!focusContext) drawerOpen = false;

    summaryBar.classList.toggle('ns-minimized', minimized);
    summaryBar.classList.toggle('ns-controls-visible', focusContext);
    summaryBar.classList.toggle('ns-drawer-open', focusContext && drawerOpen && !minimized);
    summaryBar.classList.toggle('ns-context-only', focusContext && !enabled && !getSetting('summarizer', false) && !minimized);

    const toggle = document.getElementById('ns-drawer-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', focusContext && drawerOpen && !minimized ? 'true' : 'false');

    if (!enabled && !getSetting('summarizer', false)) {
      setBodyContent(getPlaceholderContent());
      const countEl = document.getElementById('ns-msg-count');
      if (countEl) countEl.textContent = 'Control panel ready';
    }

    updateControlButton('ns-control-focus', !!getSetting('focusMode', false), getSetting('focusMode', false) ? 'Active' : 'Off');
    updateControlButton('ns-control-tts', !!getSetting('ttsEnabled', false), getSetting('ttsEnabled', false) ? 'Ready' : 'Off');
    updateControlButton('ns-control-summary', !!getSetting('summarizer', false), getSetting('summarizer', false) ? 'Refresh now' : 'Open summary');
  }

  function persistSetting(key, value) {
    if (NS.settings) NS.settings[key] = value;
    try {
      chrome.storage.sync.set({ [key]: value });
    } catch (_) {}
  }

  function toggleSetting(key) {
    const current = !!getSetting(key, false);
    const next = !current;

    if (key === 'focusMode' && NS.focusMode) {
      persistSetting('focusMode', next);
      NS.focusMode.setEnabled(next, {
        theme: getSetting('focusTheme', getSetting('theme', 'zen')),
        mentionHandle: getSetting('mentionHandle', ''),
        requestFullscreen: next
      });
      drawerOpen = next;
      minimized = false;
    }

    if (key === 'ttsEnabled' && NS.tts) {
      persistSetting('ttsEnabled', next);
      NS.tts.setEnabled(next);
      minimized = false;
    }

    refreshPanelForContext();
  }

  function renderSummary(text, msgCount) {
    const countEl = document.getElementById('ns-msg-count');
    if (countEl) countEl.textContent = `${msgCount} message${msgCount !== 1 ? 's' : ''} analyzed`;

    const sections = parseSections(text);
    if (!sections.length) {
      setBodyContent(`<div class="ns-section"><div class="ns-section-text">${text}</div></div>`);
      refreshPanelForContext();
      return;
    }

    const html = sections.map(({ heading, bullets }) => `
      <div class="ns-section">
        <div class="ns-section-heading">${heading}</div>
        ${bullets.length === 0
          ? `<div class="ns-none">None</div>`
          : bullets.map((b) => b.toLowerCase() === 'none'
              ? `<div class="ns-none">None</div>`
              : `<div class="ns-bullet">${b}</div>`
            ).join('')}
      </div>
    `).join('');

    setBodyContent(html);
    refreshPanelForContext();
  }

  async function runSummary() {
    createSummaryBar();
    enabled = true;
    minimized = false;
    persistSetting('summarizer', true);
    refreshPanelForContext();

    const refreshBtn = document.getElementById('ns-refresh-btn');
    if (refreshBtn) refreshBtn.disabled = true;

    setBodyContent(`
      <div class="ns-loading">
        <div class="ns-spinner"></div>
        <span>Analyzing workspace...</span>
      </div>
    `);

    const messages = collectMessages();
    if (messages.length === 0) {
      setBodyContent('<div class="ns-error">No messages found to summarize.</div>');
      if (refreshBtn) refreshBtn.disabled = false;
      refreshPanelForContext();
      return;
    }

    try {
      const summary = await callGemini(messages);
      renderSummary(summary, messages.length);
    } catch (err) {
      setBodyContent(`<div class="ns-error">Summary error: ${err.message}</div>`);
    }

    if (refreshBtn) refreshBtn.disabled = false;
    refreshPanelForContext();
  }

  function setEnabled(on) {
    enabled = !!on;
    if (enabled) runSummary();
    else {
      persistSetting('summarizer', false);
      enabled = false;
      refreshPanelForContext();
    }
  }

  document.addEventListener('fullscreenchange', refreshPanelForContext);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.focusMode && NS.settings) NS.settings.focusMode = changes.focusMode.newValue;
    if (changes.ttsEnabled && NS.settings) NS.settings.ttsEnabled = changes.ttsEnabled.newValue;
    if (changes.summarizer && NS.settings) NS.settings.summarizer = changes.summarizer.newValue;
    if (changes.summarizer) enabled = !!changes.summarizer.newValue;
    if (changes.focusMode && !changes.focusMode.newValue) drawerOpen = false;
    refreshPanelForContext();
  });

  NS.summarizer = { setEnabled, runSummary, refreshPanelForContext, ensureFocusLauncher };
  NS.modules.push((settings) => {
    enabled = !!settings.summarizer;
    refreshPanelForContext();
    if (enabled) runSummary();
  });
})();