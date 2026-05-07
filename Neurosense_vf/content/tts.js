// NeuroSense Text-to-Speech: highlight text then click Speak Text

(function () {
  const NS = window.neurosense;
  if (!NS) return;

  let popupBtn = null;
  let enabled = false;

  function createPopupBtn() {
    if (popupBtn) return;
    popupBtn = document.createElement('button');
    popupBtn.id = 'ns-tts-popup-btn';
    popupBtn.innerHTML = 'Speak Text';
    popupBtn.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      display: none;
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      color: white;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 8px 20px rgba(0,0,0,0.3);
      transition: background 0.2s, transform 0.1s;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      white-space: nowrap;
      align-items: center;
      gap: 6px;
    `;
    popupBtn.onmouseover = () => { popupBtn.style.transform = 'scale(1.05)'; };
    popupBtn.onmouseout = () => { popupBtn.style.transform = 'scale(1)'; };

    document.body.appendChild(popupBtn);
    console.log('NeuroSense: TTS button injected');

    popupBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const text = window.getSelection().toString().trim();
      if (text) {
        speak(text);
      }
      hidePopup();
      window.getSelection().removeAllRanges();
    });
  }

  function hidePopup() {
    if (popupBtn) {
      popupBtn.style.display = 'none';
      popupBtn.removeAttribute('data-ns-visible');
    }
  }

  function getSelectionRect(selection) {
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    let rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      const rects = range.getClientRects();
      if (rects && rects.length) rect = rects[0];
    }
    return rect || null;
  }

  function showPopupAtRect(rect) {
    if (!popupBtn || !rect) return;
    popupBtn.style.display = 'block';
    popupBtn.setAttribute('data-ns-visible', '1');
    const margin = 8;
    const btnWidth = popupBtn.offsetWidth || 120;
    const btnHeight = popupBtn.offsetHeight || 28;
    const viewLeft = window.scrollX;
    const viewTop = window.scrollY;
    const viewRight = viewLeft + window.innerWidth;

    let top = rect.top + viewTop - btnHeight - margin;
    if (top < viewTop + margin) {
      top = rect.bottom + viewTop + margin;
    }
    let left = rect.left + viewLeft;
    if (left + btnWidth + margin > viewRight) {
      left = viewRight - btnWidth - margin;
    }
    if (left < viewLeft + margin) {
      left = viewLeft + margin;
    }
    popupBtn.style.top = `${Math.round(top)}px`;
    popupBtn.style.left = `${Math.round(left)}px`;
  }

  function updatePopupFromSelection() {
    if (!enabled) {
      hidePopup();
      return;
    }
    if (!popupBtn) {
      createPopupBtn();
    }
    const selection = window.getSelection();
    const text = (selection && selection.toString()) ? selection.toString().trim() : '';
    if (!text) {
      hidePopup();
      return;
    }
    const rect = getSelectionRect(selection);
    if (!rect) {
      hidePopup();
      return;
    }
    showPopupAtRect(rect);
  }

  function getSettings() {
    return {
      rate: (NS.settings && NS.settings.ttsRate) || 0.8,
      pitch: (NS.settings && NS.settings.ttsPitch) || 1.1,
      volume: (NS.settings && NS.settings.ttsVolume) !== undefined ? NS.settings.ttsVolume : 0.7
    };
  }

  function speakNow(text, settings) {
    if (!('speechSynthesis' in window)) {
      console.error('NeuroSense: Web Speech API not available in this browser.');
      return;
    }
    const { rate, pitch, volume } = settings;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;
    utterance.lang = document.documentElement.lang || 'en-US';
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length) {
      utterance.voice = voices[0];
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function speak(text) {
    if (!text) return;
    const { rate, pitch, volume } = getSettings();
    console.log('NeuroSense: Speaking text', { text, rate, pitch, volume });

    const voices = window.speechSynthesis.getVoices();
    if (!voices || !voices.length) {
      const onVoices = () => {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
        speakNow(text, { rate, pitch, volume });
      };
      window.speechSynthesis.addEventListener('voiceschanged', onVoices);
      window.speechSynthesis.getVoices();
      return;
    }
    speakNow(text, { rate, pitch, volume });
  }

  function onMouseUp() {
    if (!enabled) return;
    setTimeout(updatePopupFromSelection, 0);
  }

  function init() {
    createPopupBtn();
    document.body.addEventListener('selectionchange', () => {
      if (!enabled) return;
      const selection = window.getSelection();
      const text = (selection && selection.toString()) ? selection.toString().trim() : '';
      if (text) updatePopupFromSelection();
    }, true);
    document.body.addEventListener('mouseup', onMouseUp, true);
    document.body.addEventListener('mousedown', (e) => {
      if (e.target.id !== 'ns-tts-popup-btn') hidePopup();
    });
    document.body.addEventListener('keyup', () => {
      updatePopupFromSelection();
    }, true);
    document.body.addEventListener('scroll', hidePopup, true);
  }

  function setEnabled(on) {
    enabled = !!on;
    if (!enabled) hidePopup();
  }

  NS.tts = { speak, getSettings, setEnabled };
  NS.modules.push((settings) => { init(); setEnabled(!!settings.ttsEnabled); });
})();
