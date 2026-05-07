// NeuroSense Data Vault: hash visible message text, audit log, toggle restore

(function () {
  const NS = window.neurosense;
  if (!NS) return;

  const MESSAGE_SELECTOR = '[data-qa="message_content"]';
  const ATTR_HASH = 'data-neurosense-vault-hash';
  const ATTR_PLAIN = 'data-neurosense-vault-plain';
  let enabled = false;
  const memoryMap = new Map();

  function shortHash(hex) {
    return hex.slice(0, 8);
  }

  function sha256(str) {
    const enc = new TextEncoder();
    return crypto.subtle.digest('SHA-256', enc.encode(str)).then((buf) => {
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    });
  }

  function auditEntry(short) {
    return {
      action: 'HIDE_DATA',
      hash: short,
      timestamp: Date.now(),
      user: 'anonymous'
    };
  }

  function appendAudit(entry) {
    chrome.storage.local.get(['neurosense_audit'], (data) => {
      const list = data.neurosense_audit || [];
      list.push(entry);
      chrome.storage.local.set({ neurosense_audit: list });
    });
  }

  function hideNode(node) {
    const wrap = node.querySelector('.neurosense-simplified-wrap');
    let text = (node.textContent || '').trim();
    if (wrap) {
      const orig = node.querySelector('.neurosense-original');
      text = (orig && orig.textContent) ? orig.textContent.trim() : text;
    }
    if (!text || node.getAttribute(ATTR_HASH)) return;
    sha256(text).then((hex) => {
      const short = shortHash(hex);
      node.setAttribute(ATTR_HASH, short);
      node.setAttribute(ATTR_PLAIN, text);
      memoryMap.set(short, text);
      const placeholder = document.createElement('span');
      placeholder.className = 'neurosense-vault-placeholder';
      placeholder.textContent = '🔒 [SECURE: ' + short + '...]';
      placeholder.style.cssText = 'color:#666;';
      node.innerHTML = '';
      node.appendChild(placeholder);
      appendAudit(auditEntry(short));
    });
  }

  function showNode(node) {
    const short = node.getAttribute(ATTR_HASH);
    if (!short) return;
    const text = node.getAttribute(ATTR_PLAIN) || memoryMap.get(short);
    if (!text) return;
    node.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = text;
    node.appendChild(span);
    node.removeAttribute(ATTR_HASH);
    node.removeAttribute(ATTR_PLAIN);
  }

  function apply() {
    document.querySelectorAll(MESSAGE_SELECTOR).forEach(enabled ? hideNode : showNode);
  }

  let observer = null;
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(() => {
      if (!enabled) return;
      document.querySelectorAll(MESSAGE_SELECTOR).forEach((node) => {
        if (!node.getAttribute(ATTR_HASH)) hideNode(node);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  function stopObserver() {
    if (observer) { observer.disconnect(); observer = null; }
  }

  function setEnabled(on) {
    enabled = !!on;
    if (enabled) { apply(); startObserver(); } else { stopObserver(); apply(); }
  }

  NS.dataVault = { setEnabled };
  NS.modules.push((settings) => setEnabled(!!settings.dataVault));
})();
