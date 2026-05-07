// NeuroSense popup: Focus Mode (theme + notify only me), other toggles

const KEYS = ['focusMode', 'deepFocus', 'textSimplifier', 'dataVault', 'theme', 'focusTheme', 'mentionHandle', 'ttsRate', 'ttsPitch', 'ttsVolume', 'summarizer', 'ttsEnabled'];

function setToggleState(id, on) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('on', !!on);
  el.setAttribute('aria-checked', !!on);
}

function loadSettings() {
  chrome.storage.sync.get(KEYS, (stored) => {
    setToggleState('focusMode', stored.focusMode);
    setToggleState('deepFocus', stored.deepFocus !== false);
    document.getElementById('focusSection').classList.toggle('hidden', !stored.focusMode);
    const themeEl = document.getElementById('focusTheme');
    if (stored.focusTheme) themeEl.value = stored.focusTheme;
    else if (stored.theme) themeEl.value = stored.theme;
    const handleEl = document.getElementById('mentionHandle');
    if (stored.mentionHandle != null) handleEl.value = stored.mentionHandle || '';
    setToggleState('dataVault', stored.dataVault);
    setToggleState('summarizer', stored.summarizer);
    setToggleState('ttsEnabled', stored.ttsEnabled);
  });
}

function sendToTab(payload) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url && tabs[0].url.includes('slack.com')) {
      chrome.tabs.sendMessage(tabs[0].id, payload).catch(() => {});
    }
  });
}

function focusPayload(enabled, deepFocusOverride) {
  const deepFocusOn = deepFocusOverride !== undefined ? deepFocusOverride : document.getElementById('deepFocus').classList.contains('on');
  return {
    action: 'toggleFocus',
    enabled,
    theme: document.getElementById('focusTheme').value,
    mentionHandle: document.getElementById('mentionHandle').value.trim(),
    deepFocus: deepFocusOn
  };
}

function toggle(elId, storageKey) {
  const el = document.getElementById(elId);
  el.addEventListener('click', () => {
    let on = !el.classList.contains('on');

    if (storageKey === 'focusMode' && on) {
      setToggleState('deepFocus', true);
      chrome.storage.sync.set({ focusMode: true, deepFocus: true }, () => {
        setToggleState('focusMode', true);
        document.getElementById('focusSection').classList.toggle('hidden', false);
        sendToTab(focusPayload(true, true));
      });
      return;
    }

    setToggleState(elId, on);
    if (storageKey === 'focusMode') {
      document.getElementById('focusSection').classList.toggle('hidden', !on);
    }

    chrome.storage.sync.set({ [storageKey]: on }, () => {
      if (storageKey === 'focusMode') {
        sendToTab(focusPayload(on));
        return;
      }
      if (storageKey === 'deepFocus') {
        sendToTab({ action: 'toggleDeepFocus', enabled: on });
        return;
      }
      const action = storageKey === 'dataVault' ? 'toggleDataVault'
        : storageKey === 'summarizer' ? 'toggleSummarizer'
        : storageKey === 'ttsEnabled' ? 'toggleTTS'
        : 'toggleSimplifier';
      sendToTab({ action, enabled: on });
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  toggle('focusMode', 'focusMode');
  toggle('deepFocus', 'deepFocus');
  toggle('dataVault', 'dataVault');
  toggle('summarizer', 'summarizer');
  toggle('ttsEnabled', 'ttsEnabled');

  document.getElementById('focusTheme').addEventListener('change', (e) => {
    const theme = e.target.value;
    chrome.storage.sync.set({ focusTheme: theme, theme }, () => {
      sendToTab({ action: 'setFocusOptions', theme, mentionHandle: document.getElementById('mentionHandle').value.trim(), deepFocus: document.getElementById('deepFocus').classList.contains('on') });
    });
  });

  document.getElementById('mentionHandle').addEventListener('input', (e) => {
    const mentionHandle = e.target.value.trim();
    chrome.storage.sync.set({ mentionHandle }, () => {
      sendToTab({ action: 'setFocusOptions', theme: document.getElementById('focusTheme').value, mentionHandle, deepFocus: document.getElementById('deepFocus').classList.contains('on') });
    });
  });

  document.getElementById('mentionHandle').addEventListener('blur', (e) => {
    chrome.storage.sync.set({ mentionHandle: e.target.value.trim() });
  });

  document.getElementById('analyzeThreads').addEventListener('click', () => {
    sendToTab({ action: 'analyzeThreads' });
  });
});