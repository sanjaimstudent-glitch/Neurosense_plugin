// NeuroSense Sensory Themes: Zen, Night, High-Contrast

(function () {
  const NS = window.neurosense;
  if (!NS) return;

  const THEME_CLASS_PREFIX = 'neurosense-theme-';
  const THEMES = ['zen', 'night', 'high-contrast'];

  function apply(themeName) {
    const root = document.body;
    if (!root) return;
    THEMES.forEach((t) => root.classList.remove(THEME_CLASS_PREFIX + t));
    if (themeName && THEMES.includes(themeName)) {
      root.classList.add(THEME_CLASS_PREFIX + themeName);
    }
  }

  NS.themes = { apply };
  NS.modules.push((settings) => apply(settings.theme));
})();
