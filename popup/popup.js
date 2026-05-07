// NeuroSense popup: focus controls + gamified progress

const KEYS = ['focusMode', 'deepFocus', 'textSimplifier', 'dataVault', 'theme', 'focusTheme', 'mentionHandle', 'ttsRate', 'ttsPitch', 'ttsVolume', 'summarizer', 'ttsEnabled', 'threadPrioritizer'];
const FOCUS_STATS_KEY = 'neurosense_focus_stats';
const BADGE_LABELS = {
  'first-glow': 'First Glow',
  'deep-diver': 'Deep Diver',
  'signal-shield': 'Signal Shield',
  'calm-sprint': 'Calm Sprint',
  'triple-lock': 'Triple Lock',
  'steady-orbit': 'Steady Orbit',
  'rhythm-keeper': 'Rhythm Keeper',
  'mind-garden': 'Mind Garden'
};

function setToggleState(id, on) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('on', !!on);
  el.setAttribute('aria-checked', !!on);
}

function getDefaultStats() {
  return {
    daily: {},
    monthly: {},
    streak: 0,
    lastActiveDate: '',
    totalPoints: 0,
    badges: [],
    lastSession: null
  };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function sumMinutes(entries) {
  return Object.values(entries || {}).reduce((total, entry) => total + (entry.minutes || 0), 0);
}

function getDerivedStats(stats) {
  const today = (stats.daily && stats.daily[todayKey()]) || { minutes: 0, sessions: 0, distractionsHidden: 0, points: 0 };
  const totalPoints = stats.totalPoints || 0;
  const level = Math.max(1, Math.floor(totalPoints / 120) + 1);
  const levelFloor = (level - 1) * 120;
  const pointsIntoLevel = totalPoints - levelFloor;
  const nextLevelPoints = 120;
  const questTitle = today.minutes >= 45 ? 'Deep Focus Bloom'
    : today.minutes >= 20 ? 'Calm Signal Run'
    : stats.streak >= 3 ? 'Steady Orbit'
    : 'Signal Garden';
  const questSubtitle = today.minutes > 0
    ? `You protected ${today.distractionsHidden || 0} distractions today and earned ${today.points || 0} points.`
    : 'Your calm workspace stats will bloom here once you finish a focus session.';

  return {
    today,
    totalPoints,
    level,
    pointsIntoLevel,
    nextLevelPoints,
    questTitle,
    questSubtitle
  };
}

function renderBadges(badges) {
  const badgeList = document.getElementById('focusBadgeList');
  if (!badgeList) return;
  if (!badges || !badges.length) {
    badgeList.innerHTML = '<span class="badge-empty">No badges yet</span>';
    return;
  }
  badgeList.innerHTML = badges.slice(-4).reverse().map((badge) => `<span class="badge-pill">${BADGE_LABELS[badge] || badge}</span>`).join('');
}

function renderStats(stats) {
  const safeStats = stats || getDefaultStats();
  const derived = getDerivedStats(safeStats);
  document.getElementById('focusQuestTitle').textContent = derived.questTitle;
  document.getElementById('focusQuestSubtitle').textContent = derived.questSubtitle;
  document.getElementById('focusLevel').textContent = String(derived.level);
  document.getElementById('focusProgressLabel').textContent = `${derived.pointsIntoLevel} / ${derived.nextLevelPoints} points to next level`;
  document.getElementById('focusStreak').textContent = `${safeStats.streak || 0} day streak`;
  document.getElementById('focusProgressBar').style.width = `${Math.min(100, (derived.pointsIntoLevel / derived.nextLevelPoints) * 100)}%`;
  document.getElementById('todayMinutes').textContent = `${derived.today.minutes || 0}m`;
  document.getElementById('todaySessions').textContent = String(derived.today.sessions || 0);
  document.getElementById('todayShield').textContent = String(derived.today.distractionsHidden || 0);
  renderBadges(safeStats.badges || []);
}

function loadStats() {
  chrome.storage.local.get({ [FOCUS_STATS_KEY]: getDefaultStats() }, (stored) => {
    renderStats(stored[FOCUS_STATS_KEY]);
  });
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
    setToggleState('threadPrioritizer', stored.threadPrioritizer);
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

function actionForKey(storageKey) {
  if (storageKey === 'dataVault') return 'toggleDataVault';
  if (storageKey === 'summarizer') return 'toggleSummarizer';
  if (storageKey === 'ttsEnabled') return 'toggleTTS';
  if (storageKey === 'threadPrioritizer') return 'toggleThreadPrioritizer';
  return 'toggleSimplifier';
}

function toggle(elId, storageKey) {
  const el = document.getElementById(elId);
  if (!el) return;

  el.addEventListener('click', () => {
    const on = !el.classList.contains('on');

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
      sendToTab({ action: actionForKey(storageKey), enabled: on });
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadStats();
  toggle('focusMode', 'focusMode');
  toggle('deepFocus', 'deepFocus');
  toggle('dataVault', 'dataVault');
  toggle('summarizer', 'summarizer');
  toggle('ttsEnabled', 'ttsEnabled');
  toggle('threadPrioritizer', 'threadPrioritizer');

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

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[FOCUS_STATS_KEY]) renderStats(changes[FOCUS_STATS_KEY].newValue || getDefaultStats());
    if (area === 'sync') loadSettings();
  });

  document.getElementById('openTaskBreakdown').addEventListener('click', () => {
    chrome.storage.sync.set({ threadPrioritizer: true }, () => {
      setToggleState('threadPrioritizer', true);
      sendToTab({ action: 'runThreadPrioritizer' });
    });
  });

  document.getElementById('analyzeThreads').addEventListener('click', () => {
    sendToTab({ action: 'analyzeThreads' });
  });
});