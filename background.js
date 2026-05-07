// NeuroSense background service worker
// Sets default storage on install.

const DEFAULTS = {
  focusMode: false,
  deepFocus: true,
  textSimplifier: false,
  dataVault: false,
  theme: 'zen',
  focusTheme: 'zen',
  mentionHandle: '',
  ttsRate: 1.0,
  ttsPitch: 1.0,
  ttsVolume: 1.0,
  summarizer: false,
  ttsEnabled: false
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(Object.keys(DEFAULTS), (stored) => {
    const toSet = {};
    for (const key of Object.keys(DEFAULTS)) {
      if (stored[key] === undefined) toSet[key] = DEFAULTS[key];
    }
    if (Object.keys(toSet).length) chrome.storage.sync.set(toSet);
  });
});