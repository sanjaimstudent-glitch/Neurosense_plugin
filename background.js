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
  ttsEnabled: false,
  threadPrioritizer: false
};

const LOCAL_DEFAULTS = {
  neurosense_focus_stats: {
    daily: {},
    monthly: {},
    streak: 0,
    lastActiveDate: '',
    totalPoints: 0,
    badges: [],
    lastSession: null
  }
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(Object.keys(DEFAULTS), (stored) => {
    const toSet = {};
    for (const key of Object.keys(DEFAULTS)) {
      if (stored[key] === undefined) toSet[key] = DEFAULTS[key];
    }
    if (Object.keys(toSet).length) chrome.storage.sync.set(toSet);
  });

  chrome.storage.local.get(Object.keys(LOCAL_DEFAULTS), (stored) => {
    const toSet = {};
    for (const key of Object.keys(LOCAL_DEFAULTS)) {
      if (stored[key] === undefined) toSet[key] = LOCAL_DEFAULTS[key];
    }
    if (Object.keys(toSet).length) chrome.storage.local.set(toSet);
  });
});