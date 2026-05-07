// NeuroSense AI Content Summarizer: Gemini-powered workspace summary

(function () {
  const NS = window.neurosense;
  if (!NS) return;

  const MESSAGE_SELECTOR = '[data-qa="message_content"]';
  const MIN_WORDS = 5;
  const GROQ_API_KEY = 'Your_api_key'; 
  const GROQ_URL = `https://api.groq.com/openai/v1/chat/completions`;

  let enabled = false;
  let summaryBar = null;

  // --- Collect messages from DOM ---
  function collectMessages() {
    return Array.from(document.querySelectorAll(MESSAGE_SELECTOR))
      .map((m) => (m.textContent || '').trim())
      .filter((t) => t.split(/\s+/).length >= MIN_WORDS);
  }

  // --- Call Gemini API ---
  async function callGemini(messages) {
  const combined = messages.map((m, i) => `Message ${i + 1}: ${m}`).join('\n');
  const prompt = `You are a workplace assistant analyzing a Slack workspace conversation.

Here are the messages:
${combined}

Provide a concise summary with:
1. 📋 Overview (1-2 sentences)
2. 🚨 Urgent Items (deadlines, ASAP — bullet each)
3. ✅ Action Items (things to do — bullet each)
4. ❓ Open Questions (unanswered questions — bullet each)
5. 💡 Key Decisions (conclusions reached — bullet each)

If a section has nothing, write "None". Keep under 200 words.`;

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile', // free, fast, very capable
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

  // --- Parse Gemini response into sections ---
  function parseSections(text) {
    const sections = [];
    const lines = text.split('\n').filter(Boolean);
    let current = null;

    for (const line of lines) {
      if (/^[1-5]?\s*[📋🚨✅❓💡]/.test(line)) {
        if (current) sections.push(current);
        current = { heading: line.replace(/^[1-5]\.\s*/, ''), bullets: [] };
      } else if (line.startsWith('-') || line.startsWith('•') || line.startsWith('*')) {
        if (current) current.bullets.push(line.replace(/^[-•*]\s*/, ''));
      } else if (current) {
        if (current.bullets.length === 0) current.heading += ' ' + line;
        else current.bullets.push(line);
      }
    }
    if (current) sections.push(current);
    return sections;
  }

  // --- Build the floating UI ---
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
          width: 360px;
          background: #0f1117;
          border: 1px solid #2a2d3a;
          border-radius: 14px;
          box-shadow: 0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
          font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
          overflow: hidden;
          transition: all 0.3s ease;
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
          width: 8px; height: 8px;
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
          border-radius: 6px;
          color: #94a3b8;
          font-size: 13px;
          cursor: pointer;
          width: 28px; height: 28px;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        .ns-icon-btn:hover { background: rgba(255,255,255,0.12); color: #e2e8f0; }
        #ns-bar-body {
          padding: 14px 16px;
          max-height: 420px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: #2a2d3a transparent;
        }
        #ns-bar-body::-webkit-scrollbar { width: 4px; }
        #ns-bar-body::-webkit-scrollbar-track { background: transparent; }
        #ns-bar-body::-webkit-scrollbar-thumb { background: #2a2d3a; border-radius: 4px; }
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
          width: 28px; height: 28px;
          border: 2px solid #1e2130;
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: ns-spin 0.8s linear infinite;
        }
        @keyframes ns-spin { to { transform: rotate(360deg); } }
        .ns-section {
          margin-bottom: 14px;
        }
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
          content: '›';
          color: #6366f1;
          font-weight: 700;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .ns-none {
          font-size: 12px;
          color: #334155;
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
          color: #334155;
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
      <div id="ns-bar-header">
        <div id="ns-bar-title">
          <span class="dot"></span>
          NeuroSense · AI Summary
        </div>
        <div id="ns-bar-actions">
          <button class="ns-icon-btn" id="ns-close-btn" title="Close">✕</button>
        </div>
      </div>
      <div id="ns-bar-body">
        <div class="ns-loading">
          <div class="ns-spinner"></div>
          <span>Analyzing workspace...</span>
        </div>
      </div>
      <div id="ns-bar-footer">
        <span id="ns-msg-count"></span>
        <button id="ns-refresh-btn">↻ Refresh</button>
      </div>
    `;

    document.body.appendChild(summaryBar);

    document.getElementById('ns-close-btn').onclick = removeSummaryBar;
    document.getElementById('ns-refresh-btn').onclick = runSummary;
  }

  function removeSummaryBar() {
    if (summaryBar) { summaryBar.remove(); summaryBar = null; }
  }

  function setBodyContent(html) {
    const body = document.getElementById('ns-bar-body');
    if (body) body.innerHTML = html;
  }

  function renderSummary(text, msgCount) {
    const countEl = document.getElementById('ns-msg-count');
    if (countEl) countEl.textContent = `${msgCount} message${msgCount !== 1 ? 's' : ''} analyzed`;

    const sections = parseSections(text);

    if (!sections.length) {
      setBodyContent(`<div class="ns-section"><div class="ns-section-text">${text}</div></div>`);
      return;
    }

    const html = sections.map(({ heading, bullets }) => `
      <div class="ns-section">
        <div class="ns-section-heading">${heading}</div>
        ${bullets.length === 0
          ? `<div class="ns-none">None</div>`
          : bullets.map(b => b.toLowerCase() === 'none'
              ? `<div class="ns-none">None</div>`
              : `<div class="ns-bullet">${b}</div>`
            ).join('')
        }
      </div>
    `).join('');

    setBodyContent(html);
  }

  async function runSummary() {
    createSummaryBar();

    const refreshBtn = document.getElementById('ns-refresh-btn');
    if (refreshBtn) refreshBtn.disabled = true;

    setBodyContent(`
      <div class="ns-loading">
        <div class="ns-spinner"></div>
        <span>Analyzing with Gemini...</span>
      </div>
    `);

    const messages = collectMessages();

    if (messages.length === 0) {
      setBodyContent(`<div class="ns-error">⚠️ No messages found to summarize.</div>`);
      if (refreshBtn) refreshBtn.disabled = false;
      return;
    }

    try {
      const summary = await callGemini(messages);
      renderSummary(summary, messages.length);
    } catch (err) {
      setBodyContent(`<div class="ns-error">❌ Gemini error: ${err.message}</div>`);
    }

    if (refreshBtn) refreshBtn.disabled = false;
  }

  function setEnabled(on) {
    enabled = !!on;
    if (enabled) runSummary();
    else removeSummaryBar();
  }

  NS.summarizer = { setEnabled, runSummary };
  NS.modules.push((settings) => setEnabled(!!settings.summarizer));
})();