// NeuroSense popup: Focus Mode (theme + notify only me), other toggles

const KEYS = ['focusMode', 'textSimplifier', 'dataVault', 'theme', 'focusTheme', 'mentionHandle', 'ttsRate', 'ttsPitch', 'ttsVolume', 'summarizer', 'ttsEnabled','threadPrioritizer'];

function loadSettings() {
  chrome.storage.sync.get(KEYS, (stored) => {
    document.getElementById('focusMode').classList.toggle('on', !!stored.focusMode);
    document.getElementById('focusMode').setAttribute('aria-checked', !!stored.focusMode);
    document.getElementById('focusSection').classList.toggle('hidden', !stored.focusMode);
    const themeEl = document.getElementById('focusTheme');
    if (stored.focusTheme) themeEl.value = stored.focusTheme;
    else if (stored.theme) themeEl.value = stored.theme;
    const handleEl = document.getElementById('mentionHandle');
    if (stored.mentionHandle != null) handleEl.value = stored.mentionHandle || '';
    document.getElementById('textSimplifier').classList.toggle('on', !!stored.textSimplifier);
    document.getElementById('textSimplifier').setAttribute('aria-checked', !!stored.textSimplifier);
    document.getElementById('dataVault').classList.toggle('on', !!stored.dataVault);
    document.getElementById('dataVault').setAttribute('aria-checked', !!stored.dataVault);
    document.getElementById('summarizer').classList.toggle('on', !!stored.summarizer);
    document.getElementById('summarizer').setAttribute('aria-checked', !!stored.summarizer);
    document.getElementById('ttsEnabled').classList.toggle('on', !!stored.ttsEnabled);
    document.getElementById('ttsEnabled').setAttribute('aria-checked', !!stored.ttsEnabled);
    document.getElementById('threadPrioritizer').classList.toggle('on', !!stored.threadPrioritizer);
    document.getElementById('threadPrioritizer').setAttribute('aria-checked', !!stored.threadPrioritizer);

  });
}

function sendToTab(payload) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url && tabs[0].url.includes('slack.com')) {
      chrome.tabs.sendMessage(tabs[0].id, payload).catch(() => {});
    }
  });
}

function toggle(elId, storageKey) {
  const el = document.getElementById(elId);
  el.addEventListener('click', () => {
    const on = el.classList.toggle('on');
    el.setAttribute('aria-checked', on);
    if (storageKey === 'focusMode') {
      document.getElementById('focusSection').classList.toggle('hidden', !on);
    }
    chrome.storage.sync.set({ [storageKey]: on }, () => {
      const action = storageKey === 'focusMode' ? 'toggleFocus'
      : storageKey === 'dataVault' ? 'toggleDataVault'
      : storageKey === 'summarizer' ? 'toggleSummarizer'
      : storageKey === 'ttsEnabled' ? 'toggleTTS'
      : storageKey === 'threadPrioritizer' ? 'toggleThreadPrioritizer'
      : 'toggleSimplifier';
      const payload = { action, enabled: on };
      if (storageKey === 'focusMode') {
        payload.theme = document.getElementById('focusTheme').value;
        payload.mentionHandle = document.getElementById('mentionHandle').value.trim();
      }
      sendToTab(payload);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  toggle('focusMode', 'focusMode');
  toggle('textSimplifier', 'textSimplifier');
  toggle('dataVault', 'dataVault');
  toggle('summarizer', 'summarizer');
  toggle('ttsEnabled', 'ttsEnabled');
  toggle('threadPrioritizer', 'threadPrioritizer');

  document.getElementById('focusTheme').addEventListener('change', (e) => {
    const theme = e.target.value;
    chrome.storage.sync.set({ focusTheme: theme, theme }, () => {
      sendToTab({ action: 'setFocusOptions', theme, mentionHandle: document.getElementById('mentionHandle').value.trim() });
    });
  });
  document.getElementById('mentionHandle').addEventListener('input', (e) => {
    const mentionHandle = e.target.value.trim();
    chrome.storage.sync.set({ mentionHandle }, () => {
      sendToTab({ action: 'setFocusOptions', theme: document.getElementById('focusTheme').value, mentionHandle });
    });
  });
  document.getElementById('mentionHandle').addEventListener('blur', (e) => {
    chrome.storage.sync.set({ mentionHandle: e.target.value.trim() });
  });

  document.getElementById('analyzeThreads').addEventListener('click', () => {
    sendToTab({ action: 'analyzeThreads' });
  });
});
