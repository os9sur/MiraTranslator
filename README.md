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
  <img src="https://img.shields.io/badge/Version-3.5.6.0-blue" alt="Version">
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

## Technical Overview

**Mira Translate** is a browser extension designed for translation tasks using user-provided API keys. It functions as an interface between the browser and translation services, allowing users to manage their own API configurations.

This tool was created to fill the need for a functional, open-source bilingual translation utility that prioritizes simplicity and efficiency. It was developed in spare time for personal use, featuring a streamlined interface designed around specific, subjective workflows. As it is a personal project, it does not aim to cater to every preference or provide the polish of commercial software.

> **Note:** This tool serves strictly as an assistant for AI-powered translation. Due to limited maintenance time, bug fixes may not be immediate, and universal compatibility with all websites is not guaranteed.

### Features

* **Performance:** The extension is built using native JavaScript with a core size of approximately 300KB, aimed at minimizing browser resource usage.
* **Visual Configuration:** A panel is provided to adjust translation styles, colors, and layout, which are applied to the webpage.
* **YouTube Integration:** Includes dual-language subtitle rendering, player adjustments, and a feature to download subtitles.
* **Privacy:** API keys are stored locally in the browser. The extension does not use intermediary servers for translation processing.
* **Multi-Engine Support:** Compatible with OpenAI, Claude, Gemini, DeepL, and SiliconFlow. Users can also configure custom API endpoints.
* **Element Selection:** Allows users to select or exclude specific areas of a webpage for translation.
* **Data Synchronization:** Supports syncing configurations and saved vocabulary via Google Drive or WebDAV.
* **Vocabulary Learning:** Enables users to save words or phrases directly from translated text into a local list, allowing for future review, editing, and cross-device synchronization.

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
