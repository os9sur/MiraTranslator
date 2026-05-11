<p align="center">
  <a href="https://chromewebstore.google.com/detail/mira-translator/hmmllfdmkbmmfffjekhmmbhhfhhnocmn" target="_blank">
    <img src="images/logo.png" width="120px" height="auto" alt="Mira Logo">
  </a>
</p>

<h1 align="center">Mira Translator</h1>

<p align="center">
  <em>Ultra-lightweight (~300KB) AI Gateway — Pure Native JS for immersive web reading, YouTube bilingual subtitles, and cross-site word highlighting. Zero-bloat, privacy-first.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Version-3.5.3.3-blue" alt="Version">
  &nbsp;
  <img src="https://img.shields.io/badge/License-AGPL--3.0-orange" alt="License">
  &nbsp;
  <a href="https://os9sur.github.io/mira-translator/">
    <img src="https://img.shields.io/badge/Official-Website-brightgreen" alt="Website">
  </a>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/mira-translator-immersive/hmmllfdmkbmmfffjekhmmbhhfhhnocmn"><img src="https://img.shields.io/badge/Chrome-4285F4?logo=googlechrome&logoColor=white" alt="Chrome"></a>
  <a href="https://addons.mozilla.org/firefox/addon/mira-translator/"><img src="https://img.shields.io/badge/Firefox-FF7139?logo=firefoxbrowser&logoColor=white" alt="Firefox"></a>
  <a href="https://microsoftedge.microsoft.com/addons/detail/ofhlbeoigddhlpompkgbmbdhpbffmife"><img src="https://custom-icon-badges.demolab.com/badge/Microsoft_Edge-2771D8?logo=edge-white&logoColor=white" alt="Microsoft Edge"></a>
</p>

<br>

<p align="center">
  <img src="images/bird_screenshot.png" width="415" alt="Translation Preview">
  <img src="images/caddy_screenshot.png" width="415" alt="Feature Preview">
</p>

<p align="center">
  <img src="images/style_setting_screenshot.png" width="415" alt="Style Settings">
  <img src="images/settings_screenshot.png" width="415" alt="Settings">
</p>

---

## Technical Philosophy

**Mira Translate** is an immersive translation browser extension reimagined for performance and autonomy. Built with **pure native JavaScript**, it operates as a flexible **AI Translation Gateway**, allowing you to bypass "black-box" services and take full control of translation quality and cost using your own API keys.

Unlike bloated alternatives, Mira prioritizes a near-zero resource footprint and an intuitive **What You See Is What You Get (WYSIWYG)** user experience.

### Key Advantages

* **Performance //** Engineered with zero heavy frameworks. The entire core is approximately **200KB**, ensuring lightning-fast execution without slowing down your browser.
* **WYSIWYG Control //** True visual feedback. Adjust translation styles, colors, and layouts via the visual panel and see the effects on the webpage instantly.
* **Refined UI/UX //** A modern, aesthetic interface designed for clarity. Sophisticated power meets a minimalist, easy-to-configure design.
* **YouTube Toolkit //** Advanced dual-language rendering with integrated player styling and **one-click subtitle downloads**.
* **Zero-Trace Privacy //** Your API keys stay encrypted in your local browser. No intermediary servers, no data logging, no telemetry.

### Core Capabilities

* **Multi-Engine Support //** Native integration for OpenAI, Claude, Gemini, DeepL, and SiliconFlow. Supports fully customizable API endpoints.
* **Visual Element Selector //** Precision-targeted translation. Intuitively pick or exclude specific webpage elements using the visual selector tool.
* **Cloud Sync //** Seamlessly synchronize your vocabulary and configurations via Google Drive or WebDAV.

---

## Development & Build

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/) installed.

### 2. Configuration
API keys are kept in a private file. Create your local config from the template:
```bash
cp private_config.example.js private_config.js
```

Edit `private_config.js` and fill in your `CLIENT_ID`, `MANIFEST_KEY`.

### 3. Build Commands

| Command | Target Browser |
| --- | --- |
| `pnpm dev` | **Chrome** |
| `pnpm dev:edge` | **Edge** |
| `pnpm dev:firefox` | **Firefox** |

---
© 2026 **David Bai**. Licensed under the [AGPL-3.0 License](LICENSE).
