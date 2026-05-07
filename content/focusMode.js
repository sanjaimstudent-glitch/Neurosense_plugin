// NeuroSense Focus Mode: channels + theme + notify only about me + focus telemetry

(function () {
  const NS = window.neurosense;
  if (!NS) return;

  const SIDEBAR_SELECTOR = '[data-qa="channel_sidebar"]';
  const KEEP_COUNT = 3;
  const THEME_CLASS_PREFIX = 'neurosense-theme-';
  const THEMES = ['zen', 'night', 'high-contrast'];
  const LOCAL_STATS_KEY = 'neurosense_focus_stats';
  const MIN_SESSION_MS = 15000;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const NOTIFICATION_SELECTORS = [
    '[role="alert"]',
    '[class*="notification"]',
    '[class*="toast"]',
    '[data-qa*="notification"]',
    '.p-notification',
    '.c-toast'
  ];
  const CHANNEL_NAME_SELECTORS = ['[data-qa="channel_sidebar_name"]', '[data-qa="channel_sidebar_channel"]'];
  const FADE_SELECTORS = [
    '[data-qa="channel_header"]',
    '[data-qa="top_nav"]',
    '.p-view_header',
    '.p-message_pane__foreword',
    '.p-workspace__right_sidebar',
    '.p-workspace__secondary_view',
    '.p-message_pane .c-message_actions',
    '.c-message_kit__gutter__right',
    '.p-message_pane__floating_action_bar'
  ];
  const DEEP_HIDE_SELECTORS = [
    '[data-qa*="huddle"]',
    '[aria-label*="Huddle" i]',
    '[data-qa*="apps"]',
    '[aria-label*="Apps" i]',
    '.p-channel_sidebar__apps',
    '.p-huddle_sidebar',
    '[data-qa="message_actions"]',
    '.c-message_kit__gutter__right',
    '.p-view_header__toolbar',
    '.p-top_nav__right',
    '.p-message_pane__floating_action_bar'
  ];
  const DEEP_TEXT_MATCHES = ['huddles', 'apps'];

  let enabled = false;
  let deepFocus = true;
  let observer = null;
  let notificationObserver = null;
  let currentTheme = 'zen';
  let mentionHandle = '';
  let fullscreenRequestedByFocus = false;
  let sessionStartedAt = 0;
  let sessionMetrics = resetSessionMetrics();

  function resetSessionMetrics() {
    return {
      hiddenChannels: 0,
      fadedElements: 0,
      hiddenUiElements: 0
    };
  }

  function getDefaultFocusStats() {
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

  function normalizeStats(raw) {
    const base = getDefaultFocusStats();
    const stats = raw && typeof raw === 'object' ? raw : {};
    return {
      daily: stats.daily && typeof stats.daily === 'object' ? stats.daily : base.daily,
      monthly: stats.monthly && typeof stats.monthly === 'object' ? stats.monthly : base.monthly,
      streak: Number.isFinite(stats.streak) ? stats.streak : base.streak,
      lastActiveDate: typeof stats.lastActiveDate === 'string' ? stats.lastActiveDate : base.lastActiveDate,
      totalPoints: Number.isFinite(stats.totalPoints) ? stats.totalPoints : base.totalPoints,
      badges: Array.isArray(stats.badges) ? stats.badges : base.badges,
      lastSession: stats.lastSession && typeof stats.lastSession === 'object' ? stats.lastSession : base.lastSession
    };
  }

  function toDateKey(timestamp) {
    return new Date(timestamp).toISOString().slice(0, 10);
  }

  function toMonthKey(value) {
    const date = typeof value === 'string' ? new Date(value + 'T00:00:00') : new Date(value);
    return date.toISOString().slice(0, 7);
  }

  function dateFromKey(key) {
    return new Date(key + 'T00:00:00');
  }

  function dayAge(now, key) {
    const nowStart = dateFromKey(toDateKey(now)).getTime();
    return Math.floor((nowStart - dateFromKey(key).getTime()) / DAY_MS);
  }

  function mergeRollup(target, source) {
    target.minutes = (target.minutes || 0) + (source.minutes || 0);
    target.sessions = (target.sessions || 0) + (source.sessions || 0);
    target.deepMinutes = (target.deepMinutes || 0) + (source.deepMinutes || 0);
    target.distractionsHidden = (target.distractionsHidden || 0) + (source.distractionsHidden || 0);
    target.points = (target.points || 0) + (source.points || 0);
    return target;
  }

  function cleanupStats(stats, now) {
    Object.keys(stats.daily).forEach((dateKey) => {
      const age = dayAge(now, dateKey);
      const entry = stats.daily[dateKey];
      if (age > 90) {
        delete stats.daily[dateKey];
        return;
      }
      if (age > 30) {
        const monthKey = toMonthKey(dateKey);
        const monthlyEntry = stats.monthly[monthKey] || { minutes: 0, sessions: 0, deepMinutes: 0, distractionsHidden: 0, points: 0 };
        stats.monthly[monthKey] = mergeRollup(monthlyEntry, entry);
        delete stats.daily[dateKey];
      }
    });

    Object.keys(stats.monthly).forEach((monthKey) => {
      const age = dayAge(now, monthKey + '-01');
      if (age > 90) delete stats.monthly[monthKey];
    });

    return stats;
  }

  function buildSessionSummary(durationMs) {
    const minutes = Math.max(1, Math.round(durationMs / 60000));
    const distractionsHidden = sessionMetrics.hiddenChannels + sessionMetrics.fadedElements + sessionMetrics.hiddenUiElements;
    const points = (minutes * 5) + (deepFocus ? 18 : 8) + Math.min(45, distractionsHidden);
    return {
      minutes,
      sessions: 1,
      deepMinutes: deepFocus ? minutes : 0,
      distractionsHidden,
      points
    };
  }

  function getAllTimeMinutes(stats) {
    let total = 0;
    Object.values(stats.daily).forEach((entry) => {
      total += entry.minutes || 0;
    });
    Object.values(stats.monthly).forEach((entry) => {
      total += entry.minutes || 0;
    });
    return total;
  }

  function getTodayEntry(stats, dateKey) {
    return stats.daily[dateKey] || { minutes: 0, sessions: 0, deepMinutes: 0, distractionsHidden: 0, points: 0 };
  }

  function collectBadges(stats, session, dateKey) {
    const badges = new Set(stats.badges || []);
    const today = getTodayEntry(stats, dateKey);
    const allTimeMinutes = getAllTimeMinutes(stats);

    badges.add('first-glow');
    if (session.deepMinutes > 0) badges.add('deep-diver');
    if (session.distractionsHidden >= 20) badges.add('signal-shield');
    if (session.minutes >= 25) badges.add('calm-sprint');
    if (today.sessions >= 3) badges.add('triple-lock');
    if (stats.streak >= 3) badges.add('steady-orbit');
    if (stats.streak >= 7) badges.add('rhythm-keeper');
    if (allTimeMinutes >= 300) badges.add('mind-garden');

    return Array.from(badges).slice(-8);
  }

  function persistFocusStats(durationMs) {
    if (durationMs < MIN_SESSION_MS) return;
    const now = Date.now();
    const dateKey = toDateKey(now);
    const yesterdayKey = toDateKey(now - DAY_MS);
    const session = buildSessionSummary(durationMs);

    chrome.storage.local.get({ [LOCAL_STATS_KEY]: getDefaultFocusStats() }, (stored) => {
      const stats = cleanupStats(normalizeStats(stored[LOCAL_STATS_KEY]), now);
      const dailyEntry = stats.daily[dateKey] || { minutes: 0, sessions: 0, deepMinutes: 0, distractionsHidden: 0, points: 0 };
      stats.daily[dateKey] = mergeRollup(dailyEntry, session);

      if (stats.lastActiveDate === dateKey) {
        stats.streak = Math.max(1, stats.streak || 1);
      } else if (stats.lastActiveDate === yesterdayKey) {
        stats.streak = Math.max(1, stats.streak || 0) + 1;
      } else {
        stats.streak = 1;
      }

      stats.lastActiveDate = dateKey;
      stats.totalPoints = (stats.totalPoints || 0) + session.points;
      stats.lastSession = {
        date: dateKey,
        endedAt: new Date(now).toISOString(),
        minutes: session.minutes,
        deepFocus: deepFocus,
        distractionsHidden: session.distractionsHidden,
        points: session.points
      };
      stats.badges = collectBadges(stats, session, dateKey);
      cleanupStats(stats, now);
      chrome.storage.local.set({ [LOCAL_STATS_KEY]: stats });
    });
  }

  function startSession() {
    sessionStartedAt = Date.now();
    sessionMetrics = resetSessionMetrics();
  }

  function finishSession() {
    if (!sessionStartedAt) return;
    const durationMs = Date.now() - sessionStartedAt;
    sessionStartedAt = 0;
    persistFocusStats(durationMs);
    sessionMetrics = resetSessionMetrics();
  }

  function trackSessionVisibility() {
    if (!enabled) return;
    sessionMetrics.hiddenChannels = Math.max(sessionMetrics.hiddenChannels, document.querySelectorAll('.neurosense-focus-hidden').length);
    sessionMetrics.fadedElements = Math.max(sessionMetrics.fadedElements, document.querySelectorAll('.neurosense-ui-fade').length);
    sessionMetrics.hiddenUiElements = Math.max(sessionMetrics.hiddenUiElements, document.querySelectorAll('.neurosense-deep-hide').length);
  }

  function hasMention(node) {
    const unread = node.querySelector('[data-qa="channel_sidebar_channel_unread_icon"], .p-channel_sidebar__channel--unread');
    return !!unread || (node.textContent && node.textContent.includes('@'));
  }

  function findSidebarRow(node, sidebar) {
    let current = node;
    let candidate = node;
    while (current && current !== sidebar) {
      if (current.matches && current.matches('[role="treeitem"], a, button, li')) return current;
      candidate = current;
      if (current.parentElement === sidebar) return current;
      current = current.parentElement;
    }
    return candidate;
  }

  function getChannelItems() {
    const sidebar = document.querySelector(SIDEBAR_SELECTOR);
    if (!sidebar) return [];

    const rows = [];
    const seen = new Set();
    CHANNEL_NAME_SELECTORS.forEach((selector) => {
      sidebar.querySelectorAll(selector).forEach((label) => {
        const row = findSidebarRow(label, sidebar);
        if (!row) return;
        const text = (label.textContent || row.textContent || '').trim();
        if (!text || seen.has(row)) return;
        seen.add(row);
        rows.push(row);
      });
    });
    return rows;
  }

  function getActiveChannelButton() {
    const sidebar = document.querySelector(SIDEBAR_SELECTOR);
    if (!sidebar) return null;

    const active = sidebar.querySelector('[aria-current="page"], [aria-selected="true"], .p-channel_sidebar__channel--selected, .p-channel_sidebar__link--selected');
    return active ? findSidebarRow(active, sidebar) : null;
  }

  function collectBySelectors(selectors) {
    const found = new Set();
    selectors.forEach((selector) => {
      try {
        document.querySelectorAll(selector).forEach((el) => found.add(el));
      } catch (_) {}
    });
    return Array.from(found);
  }

  function shouldFadeElement(el) {
    if (!el || !enabled) return false;
    if (el.id === 'neurosense-summary-bar' || el.closest('#neurosense-summary-bar')) return false;
    if (el.closest(SIDEBAR_SELECTOR)) return false;
    return true;
  }

  function applyUiLayers() {
    document.querySelectorAll('.neurosense-ui-fade').forEach((el) => el.classList.remove('neurosense-ui-fade'));
    document.querySelectorAll('.neurosense-deep-hide').forEach((el) => el.classList.remove('neurosense-deep-hide'));
    if (!enabled) return;

    collectBySelectors(FADE_SELECTORS).forEach((el) => {
      if (shouldFadeElement(el)) el.classList.add('neurosense-ui-fade');
    });

    if (deepFocus) {
      collectBySelectors(DEEP_HIDE_SELECTORS).forEach((el) => {
        if (shouldFadeElement(el)) el.classList.add('neurosense-deep-hide');
      });

      const sidebar = document.querySelector(SIDEBAR_SELECTOR);
      if (sidebar) {
        Array.from(sidebar.querySelectorAll('*')).forEach((node) => {
          const text = (node.textContent || '').trim().toLowerCase();
          if (!text) return;
          if (DEEP_TEXT_MATCHES.some((term) => text === term || text.startsWith(term + ' '))) {
            const row = findSidebarRow(node, sidebar);
            if (row) row.classList.add('neurosense-deep-hide');
          }
        });
      }
    }

    trackSessionVisibility();
  }

  function syncFocusShell() {
    document.documentElement.classList.toggle('neurosense-focus-mode', enabled);
    document.body.classList.toggle('neurosense-focus-mode', enabled);
    document.documentElement.classList.toggle('neurosense-focus-fullscreen', !!document.fullscreenElement);
    document.body.classList.toggle('neurosense-focus-fullscreen', !!document.fullscreenElement);
    document.documentElement.classList.toggle('neurosense-deep-focus', enabled && deepFocus);
    document.body.classList.toggle('neurosense-deep-focus', enabled && deepFocus);
    applyUiLayers();
    if (NS.summarizer && NS.summarizer.refreshPanelForContext) NS.summarizer.refreshPanelForContext();
  }

  function applyChannelFocus() {
    const sidebar = document.querySelector(SIDEBAR_SELECTOR);
    if (!sidebar) return;

    sidebar.classList.toggle('neurosense-focus', enabled);
    const activeButton = getActiveChannelButton();
    const items = getChannelItems();

    items.forEach((item, i) => {
      const isMention = hasMention(item);
      const isActive = !!activeButton && (item === activeButton || item.contains(activeButton) || activeButton.contains(item));
      const inTop = i < KEEP_COUNT;
      const keep = inTop || isMention || isActive;
      item.classList.toggle('neurosense-focus-hidden', enabled && !keep);
      item.classList.toggle('neurosense-focus-priority', enabled && keep);
      item.classList.toggle('neurosense-focus-active', enabled && isActive);
    });

    trackSessionVisibility();
  }

  function applyTheme() {
    const root = document.body;
    if (!root) return;
    THEMES.forEach((t) => root.classList.remove(THEME_CLASS_PREFIX + t));
    if (enabled && currentTheme && THEMES.includes(currentTheme)) root.classList.add(THEME_CLASS_PREFIX + currentTheme);
  }

  function isAboutMe(text) {
    if (!mentionHandle || !text) return false;
    const lower = (text || '').toLowerCase();
    const handle = mentionHandle.toLowerCase().replace(/^@/, '');
    return lower.includes('@' + handle) || lower.includes(handle);
  }

  function getNotificationElements() {
    return collectBySelectors(NOTIFICATION_SELECTORS);
  }

  function filterNotifications() {
    if (!enabled) return;
    const hideWhenNotMe = !!mentionHandle;
    getNotificationElements().forEach((el) => {
      const text = (el.textContent || '').trim();
      if (!text) return;
      const aboutMe = isAboutMe(text);
      el.classList.toggle('neurosense-notification-hidden', hideWhenNotMe && !aboutMe);
    });
  }

  function startChannelObserver() {
    if (observer) return;
    const sidebar = document.querySelector(SIDEBAR_SELECTOR);
    if (!sidebar) return;
    observer = new MutationObserver(() => {
      applyChannelFocus();
      applyUiLayers();
      if (NS.summarizer && NS.summarizer.ensureFocusLauncher) NS.summarizer.ensureFocusLauncher();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-current', 'aria-selected'] });
  }

  function startNotificationObserver() {
    if (notificationObserver) return;
    notificationObserver = new MutationObserver(() => {
      filterNotifications();
      applyUiLayers();
      if (NS.summarizer && NS.summarizer.ensureFocusLauncher) NS.summarizer.ensureFocusLauncher();
    });
    notificationObserver.observe(document.body, { childList: true, subtree: true });
  }

  function stopObservers() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (notificationObserver) {
      notificationObserver.disconnect();
      notificationObserver = null;
    }
    const sidebar = document.querySelector(SIDEBAR_SELECTOR);
    if (sidebar) sidebar.classList.remove('neurosense-focus');
    document.querySelectorAll('.neurosense-focus-hidden, .neurosense-focus-priority, .neurosense-focus-active').forEach((el) => {
      el.classList.remove('neurosense-focus-hidden', 'neurosense-focus-priority', 'neurosense-focus-active');
    });
    document.querySelectorAll('.neurosense-notification-hidden, .neurosense-ui-fade, .neurosense-deep-hide').forEach((el) => {
      el.classList.remove('neurosense-notification-hidden', 'neurosense-ui-fade', 'neurosense-deep-hide');
    });
    THEMES.forEach((t) => document.body.classList.remove(THEME_CLASS_PREFIX + t));
    document.documentElement.classList.remove('neurosense-focus-mode', 'neurosense-focus-fullscreen', 'neurosense-deep-focus');
    document.body.classList.remove('neurosense-focus-mode', 'neurosense-focus-fullscreen', 'neurosense-deep-focus');
    if (NS.summarizer && NS.summarizer.refreshPanelForContext) NS.summarizer.refreshPanelForContext();
  }

  async function requestFullscreen() {
    const root = document.documentElement;
    if (!root || !root.requestFullscreen || document.fullscreenElement) {
      syncFocusShell();
      return !!document.fullscreenElement;
    }
    try {
      await root.requestFullscreen();
      fullscreenRequestedByFocus = true;
      syncFocusShell();
      return true;
    } catch (_) {
      fullscreenRequestedByFocus = false;
      syncFocusShell();
      return false;
    }
  }

  async function exitFullscreen() {
    if (!document.fullscreenElement || !document.exitFullscreen || !fullscreenRequestedByFocus) {
      fullscreenRequestedByFocus = false;
      syncFocusShell();
      return;
    }
    try {
      await document.exitFullscreen();
    } catch (_) {}
    fullscreenRequestedByFocus = false;
    syncFocusShell();
  }

  function persistFocusModeState(on) {
    if (NS.settings) NS.settings.focusMode = on;
    try {
      chrome.storage.sync.set({ focusMode: on });
    } catch (_) {}
  }

  function setEnabled(on, opts) {
    const nextEnabled = !!on;
    const wasEnabled = enabled;
    enabled = nextEnabled;
    opts = opts || {};
    if (opts.theme !== undefined) currentTheme = opts.theme || 'zen';
    if (opts.mentionHandle !== undefined) mentionHandle = (opts.mentionHandle || '').trim();
    if (opts.deepFocus !== undefined) deepFocus = !!opts.deepFocus;

    if (NS.settings) {
      if (!currentTheme) currentTheme = NS.settings.focusTheme || NS.settings.theme || 'zen';
      if (mentionHandle === undefined) mentionHandle = (NS.settings.mentionHandle || '').trim();
      if (opts.deepFocus === undefined) deepFocus = NS.settings.deepFocus !== false;
    }

    if (!wasEnabled && nextEnabled) startSession();
    if (wasEnabled && !nextEnabled) finishSession();

    syncFocusShell();

    if (enabled) {
      applyChannelFocus();
      applyTheme();
      filterNotifications();
      applyUiLayers();
      if (NS.summarizer && NS.summarizer.ensureFocusLauncher) NS.summarizer.ensureFocusLauncher();
      startChannelObserver();
      startNotificationObserver();
      setTimeout(() => {
        applyChannelFocus();
        applyUiLayers();
        if (NS.summarizer && NS.summarizer.ensureFocusLauncher) NS.summarizer.ensureFocusLauncher();
      }, 400);
      if (opts.requestFullscreen) requestFullscreen();
    } else {
      stopObservers();
      exitFullscreen();
    }
  }

  function setDeepFocus(on) {
    deepFocus = !!on;
    if (NS.settings) NS.settings.deepFocus = deepFocus;
    syncFocusShell();
  }

  function setFocusOptions(opts) {
    if (opts.theme !== undefined) currentTheme = opts.theme || 'zen';
    if (opts.mentionHandle !== undefined) mentionHandle = (opts.mentionHandle || '').trim();
    if (opts.deepFocus !== undefined) deepFocus = !!opts.deepFocus;
    if (enabled) {
      applyTheme();
      filterNotifications();
      applyChannelFocus();
      syncFocusShell();
    }
  }

  document.addEventListener('fullscreenchange', () => {
    const exitedFocusFullscreen = enabled && fullscreenRequestedByFocus && !document.fullscreenElement;
    if (!document.fullscreenElement) fullscreenRequestedByFocus = false;
    syncFocusShell();
    if (exitedFocusFullscreen) {
      persistFocusModeState(false);
      setEnabled(false);
    }
  });

  window.addEventListener('beforeunload', () => {
    if (enabled) finishSession();
  });

  NS.focusMode = { setEnabled, setFocusOptions, setDeepFocus };
  NS.modules.push((settings) => {
    currentTheme = settings.focusTheme || settings.theme || 'zen';
    mentionHandle = (settings.mentionHandle || '').trim();
    deepFocus = settings.deepFocus !== false;
    setEnabled(!!settings.focusMode, { deepFocus });
  });
})();