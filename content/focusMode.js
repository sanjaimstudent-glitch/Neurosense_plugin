// NeuroSense Focus Mode: channels + theme + notify only about me (single control)

(function () {
  const NS = window.neurosense;
  if (!NS) return;

  const SIDEBAR_SELECTOR = '[data-qa="channel_sidebar"]';
  const CHANNEL_BUTTON_SELECTOR = '[data-qa="channel_sidebar"] [role="button"]';
  const KEEP_COUNT = 3;
  const THEME_CLASS_PREFIX = 'neurosense-theme-';
  const THEMES = ['zen', 'night', 'high-contrast'];
  // Slack notifications: role="alert", common toast/notification containers
  const NOTIFICATION_SELECTORS = [
    '[role="alert"]',
    '[class*="notification"]',
    '[class*="toast"]',
    '[data-qa*="notification"]',
    '.p-notification',
    '.c-toast'
  ];

  let enabled = false;
  let observer = null;
  let notificationObserver = null;
  let currentTheme = 'zen';
  let mentionHandle = '';

  function hasMention(node) {
    const unread = node.querySelector('[data-qa="channel_sidebar_channel_unread_icon"], .p-channel_sidebar__channel--unread');
    return !!unread || (node.textContent && node.textContent.includes('@'));
  }

  function applyChannelFocus() {
    const sidebar = document.querySelector(SIDEBAR_SELECTOR);
    if (!sidebar) return;
    sidebar.classList.toggle('neurosense-focus', enabled);
    const buttons = Array.from(document.querySelectorAll(CHANNEL_BUTTON_SELECTOR));
    buttons.forEach((btn, i) => {
      const isMention = hasMention(btn);
      const inTop = i < KEEP_COUNT;
      const keep = inTop || isMention;
      btn.classList.toggle('neurosense-focus-hidden', enabled && !keep);
      btn.classList.toggle('neurosense-focus-priority', enabled && keep);
    });
  }

  function applyTheme() {
    const root = document.body;
    if (!root) return;
    THEMES.forEach((t) => root.classList.remove(THEME_CLASS_PREFIX + t));
    if (enabled && currentTheme && THEMES.includes(currentTheme)) {
      root.classList.add(THEME_CLASS_PREFIX + currentTheme);
    }
  }

  function isAboutMe(text) {
    if (!mentionHandle || !text) return false;
    const lower = (text || '').toLowerCase();
    const handle = mentionHandle.toLowerCase().replace(/^@/, '');
    return lower.includes('@' + handle) || lower.includes(handle);
  }

  function getNotificationElements() {
    const set = new Set();
    NOTIFICATION_SELECTORS.forEach((sel) => {
      try {
        document.querySelectorAll(sel).forEach((el) => set.add(el));
      } catch (_) {}
    });
    return Array.from(set);
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
    observer = new MutationObserver(() => applyChannelFocus());
    observer.observe(sidebar, { childList: true, subtree: true });
  }

  function startNotificationObserver() {
    if (notificationObserver) return;
    notificationObserver = new MutationObserver(() => filterNotifications());
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
    if (sidebar) {
      sidebar.classList.remove('neurosense-focus');
      document.querySelectorAll('.neurosense-focus-hidden, .neurosense-focus-priority').forEach((el) => {
        el.classList.remove('neurosense-focus-hidden', 'neurosense-focus-priority');
      });
    }
    document.querySelectorAll('.neurosense-notification-hidden').forEach((el) => {
      el.classList.remove('neurosense-notification-hidden');
    });
    THEMES.forEach((t) => document.body.classList.remove(THEME_CLASS_PREFIX + t));
  }

  function setEnabled(on, opts) {
    enabled = !!on;
    if (opts) {
      if (opts.theme !== undefined) currentTheme = opts.theme || 'zen';
      if (opts.mentionHandle !== undefined) mentionHandle = (opts.mentionHandle || '').trim();
    }
    if (NS.settings) {
      if (currentTheme === undefined || currentTheme === '') currentTheme = NS.settings.focusTheme || NS.settings.theme || 'zen';
      if (mentionHandle === undefined) mentionHandle = (NS.settings.mentionHandle || '').trim();
    }
    if (enabled) {
      applyChannelFocus();
      applyTheme();
      filterNotifications();
      startChannelObserver();
      startNotificationObserver();
    } else {
      stopObservers();
    }
  }

  function setFocusOptions(opts) {
    if (opts.theme !== undefined) currentTheme = opts.theme || 'zen';
    if (opts.mentionHandle !== undefined) mentionHandle = (opts.mentionHandle || '').trim();
    if (enabled) {
      applyTheme();
      filterNotifications();
    }
  }

  NS.focusMode = { setEnabled, setFocusOptions };
  NS.modules.push((settings) => {
    currentTheme = settings.focusTheme || settings.theme || 'zen';
    mentionHandle = (settings.mentionHandle || '').trim();
    setEnabled(!!settings.focusMode);
  });
})();
