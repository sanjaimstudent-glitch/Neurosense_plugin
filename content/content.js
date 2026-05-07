// NeuroSense content script bootstrap: wait for Slack, load settings, init features, handle messages

(function () {
  const NS = window.neurosense = window.neurosense || {};
  NS.modules = NS.modules || [];

  function waitForSlack(cb) {
    const maxWait = 5000;
    const step = 200;
    let elapsed = 0;
    function check() {
      const sidebar = document.querySelector('[data-qa="channel_sidebar"]');
      if (sidebar || elapsed >= maxWait) {
        cb(!!sidebar);
        return;
      }
      elapsed += step;
      setTimeout(check, step);
    }
    setTimeout(check, 2000);
  }

  function loadSettings(cb) {
    chrome.storage.sync.get(
      { focusMode: false, deepFocus: true, textSimplifier: false, dataVault: false, ttsEnabled: false, theme: 'zen', focusTheme: 'zen', mentionHandle: '', ttsRate: 0.8, ttsPitch: 1.1, ttsVolume: 0.7, summarizer: false },
      (stored) => {
        NS.settings = stored;
        if (cb) cb(stored);
      }
    );
  }

  function applySettings(settings) {
    NS.settings = settings;
    if (NS.focusMode) NS.focusMode.setEnabled(!!settings.focusMode, { theme: settings.focusTheme || settings.theme, mentionHandle: settings.mentionHandle, deepFocus: settings.deepFocus !== false });
    if (NS.simplifier) NS.simplifier.setEnabled(!!settings.textSimplifier);
    if (NS.dataVault) NS.dataVault.setEnabled(!!settings.dataVault);
    if (NS.summarizer) NS.summarizer.setEnabled(!!settings.summarizer);
    if (NS.tts) NS.tts.setEnabled(!!settings.ttsEnabled);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'toggleFocus' && NS.focusMode) {
      NS.focusMode.setEnabled(!!msg.enabled, {
        theme: msg.theme,
        mentionHandle: msg.mentionHandle,
        requestFullscreen: true,
        deepFocus: msg.deepFocus !== false
      });
    }
    if (msg.action === 'toggleDeepFocus' && NS.focusMode) NS.focusMode.setDeepFocus(!!msg.enabled);
    if (msg.action === 'setFocusOptions' && NS.focusMode) NS.focusMode.setFocusOptions({ theme: msg.theme, mentionHandle: msg.mentionHandle, deepFocus: msg.deepFocus });
    if (msg.action === 'toggleSimplifier' && NS.simplifier) NS.simplifier.setEnabled(!!msg.enabled);
    if (msg.action === 'toggleDataVault' && NS.dataVault) NS.dataVault.setEnabled(!!msg.enabled);
    if (msg.action === 'toggleSummarizer' && NS.summarizer) NS.summarizer.setEnabled(!!msg.enabled);
    if (msg.action === 'toggleTTS' && NS.tts) NS.tts.setEnabled(!!msg.enabled);
    if (msg.action === 'analyzeThreads' && NS.threadAnalyzer) NS.threadAnalyzer.run();
    sendResponse({ ok: true });
    return true;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    loadSettings(applySettings);
  });

  waitForSlack((_ready) => {
    loadSettings((settings) => {
      NS.modules.forEach((init) => init(settings));
      applySettings(settings);
    });
  });
})();