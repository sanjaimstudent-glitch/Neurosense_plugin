# NeuroSense

Chrome extension that enhances Slack for neurodivergent users: Focus Mode, Text Simplifier, TTS, Sensory Themes, Data Vault, and Task/Thread Analyzer. All client-side, no backend.

## Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `Neurosense` folder

## Use

1. Open any Slack workspace (e.g. `https://your-workspace.slack.com`)
2. Click the NeuroSense icon in the toolbar to open the popup
3. Toggle **Focus Mode** (shows only top 3 channels + @mentions), **Text Simplifier** (long messages → bullets), **Hide Sensitive Data** (Data Vault)
4. Choose **Theme**: Zen, Night, or High-Contrast
5. Click **Analyze All Threads** to see a task dashboard (top-right, auto-hides in 10s)
6. Double-click any message to hear it read aloud (TTS)

## Demo script (3 min)

- 0:00–0:20 Chaotic Slack
- 0:20–0:50 Focus Mode ON
- 0:50–1:20 Text Simplifier
- 1:20–1:40 Thread Analyzer
- 1:40–2:00 Themes + TTS
- 2:00–2:20 Data Vault
- 2:20–3:00 Summary

## Tech

- Manifest V3, `chrome.storage.sync` (settings), `chrome.storage.local` (Data Vault audit log)
- Slack DOM selectors: `[data-qa="channel_sidebar"]`, `[data-qa="message_content"]`, `[data-qa="thread"]`
- No Slack API or server required
