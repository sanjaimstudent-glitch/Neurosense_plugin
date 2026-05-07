// NeuroSense AI Text Simplifier: rule-based, dual display, MutationObserver for new messages

(function () {
  const NS = window.neurosense;
  if (!NS) return;

  const MESSAGE_SELECTOR = '[data-qa="message_content"]';
  const MIN_LENGTH = 100;
  let enabled = false;
  let observer = null;

  function simplify(text) {
    if (!text || text.length < MIN_LENGTH) return null;
    let s = text
      .replace(/\bCould you please\b/gi, '• Do')
      .replace(/\bCan you please\b/gi, '• Do')
      .replace(/\bplease\s+(coordinate|send|review|check)\b/gi, '• $1')
      .replace(/\bby EOD\b/gi, '[URGENT]')
      .replace(/\bby end of day\b/gi, '[URGENT]')
      .replace(/\btomorrow(?:'s)?\s+(review|meeting|deadline)?/gi, '[URGENT] $1')
      .replace(/\bASAP\b/gi, '[URGENT]')
      .replace(/\burgent\b/gi, '[URGENT]');
    const sentences = s.split(/(?<=[.!?])\s+/).filter(Boolean);
    const bullets = sentences.slice(0, 3).map((x) => (x.startsWith('•') ? x : '• ' + x));
    return bullets.join('\n') || '• ' + s.slice(0, 120);
  }

  function processMessage(node) {
    if (node.dataset.neurosenseSimplified === '1') return;
    const text = (node.textContent || '').trim();
    const simplified = simplify(text);
    if (!simplified) return;
    node.dataset.neurosenseSimplified = '1';
    node.dataset.neurosenseOriginal = text;
    const wrap = document.createElement('div');
    wrap.className = 'neurosense-simplified-wrap';
    wrap.style.cssText = 'margin-top:4px;';
    const origDiv = document.createElement('div');
    origDiv.className = 'neurosense-original';
    origDiv.style.cssText = 'opacity:0.6;font-size:0.9em;';
    origDiv.textContent = text;
    const simpleDiv = document.createElement('div');
    simpleDiv.className = 'neurosense-simplified';
    simpleDiv.style.cssText = 'background:#e8f4f8;padding:6px 8px;border-radius:4px;white-space:pre-wrap;';
    simpleDiv.textContent = simplified;
    wrap.appendChild(origDiv);
    wrap.appendChild(simpleDiv);
    node.appendChild(wrap);
  }

  function unprocessMessage(node) {
    const wrap = node.querySelector('.neurosense-simplified-wrap');
    if (wrap) wrap.remove();
    delete node.dataset.neurosenseSimplified;
    delete node.dataset.neurosenseOriginal;
  }

  function scan() {
    if (!enabled) return;
    document.querySelectorAll(MESSAGE_SELECTOR).forEach(processMessage);
  }

  function unscan() {
    document.querySelectorAll(MESSAGE_SELECTOR).forEach(unprocessMessage);
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      if (!enabled) return;
      mutations.forEach((m) => {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          if (n.matches && n.matches(MESSAGE_SELECTOR)) processMessage(n);
          n.querySelectorAll && n.querySelectorAll(MESSAGE_SELECTOR).forEach(processMessage);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    unscan();
  }

  function setEnabled(on) {
    enabled = !!on;
    if (enabled) {
      scan();
      startObserver();
    } else {
      stopObserver();
    }
  }

  NS.simplifier = { setEnabled };
  NS.modules.push((settings) => setEnabled(!!settings.textSimplifier));
})();
