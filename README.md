<p align="center">
  <a href="https://chromewebstore.google.com/detail/mira-translator/hmmllfdmkbmmfffjekhmmbhhfhhnocmn" target="_blank">
    <img src="images/logo.png" width="120px" height="auto" alt="Mira Logo">
  </a>
</p>

<h1 align="center">Mira Translator</h1>

<p align="center">
  <em>Ultra-lightweight (~300KB) AI Gateway — Vanilla JS for immersive reading, YouTube bilingual subs. Zero bloat, privacy-first.</em>
</p>


<p align="center">
<img src="https://img.shields.io/badge/Version-3.5.7.997-blue" alt="Version">
  &nbsp;
  <img src="https://img.shields.io/badge/License-AGPL--3.0-orange" alt="License">
  &nbsp;
  <a href="https://os9sur.github.io/mira-trans/">
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

<p align="center">
  <img src="images/screenshot3.png" width="276" alt="Settings">
  <img src="images/screenshot2.png" width="276" alt="Settings">
  <img src="images/screenshot1.png" width="276" alt="Style Settings">
</p>

---

## ⚠️ Project Scope & Free Alternatives

If you are simply looking for a completely free, zero-setup AI translation tool, your current browser likely already provides excellent built-in options:

- **Chrome Users:** The Gemini side panel offers powerful, out-of-the-box webpage reading and content analysis capabilities.
- **Edge Users:** The built-in Copilot can easily analyze webpage content and generate video subtitle summaries.

**So why develop Mira?**

I couldn't find an open-source translation tool that was truly handy, respected my privacy, and didn't leave me wondering whether my browsing data was being collected in the background. So I decided to build one myself in my spare time.

Mira is designed around my own needs and preferences. It's not a commercial product, and I maintain it at my own pace. If this little tool happens to meet your needs too, you're welcome to use it! But please understand that due to limited time, I can't guarantee compatibility with every website or provide immediate bug fixes.

---

## Technical Overview

**Mira Translate** is a browser extension designed for translation tasks using user-provided API keys. It functions as an interface between the browser and translation services, allowing users to manage their own API configurations seamlessly.

This tool was created to fill the need for a functional, open-source bilingual translation utility that prioritizes simplicity and efficiency. It features a streamlined interface designed around specific workflows without the bloat of corporate software.

### Features

* **Performance:** The extension is built using native JavaScript with a core size of approximately 300KB, aimed at minimizing browser resource usage.
* **Visual Configuration:** A panel is provided to adjust translation styles, colors, and layout, which are applied to the webpage.
* **YouTube Integration:** Includes dual-language subtitle rendering, player adjustments, and a feature to download subtitles.
* **Privacy:** API keys are stored locally in the browser. The extension does not use intermediary servers for translation processing.
* **Multi-Engine Support:** Compatible with ChatGPT/OpenAI (and any OpenAI-compatible APIs), Claude, Gemini, DeepL, SiliconFlow, local models (like Ollama), and more. Users can also configure custom API endpoints.
* **AI Context-Aware Translation:** Uses surrounding context to produce more accurate and natural translations, rather than translating isolated words or sentences.
* **Element Selection:** Rather than translating the entire page by default, Mira focuses on main content areas out of the box — menus and other UI chrome are skipped to avoid layout breakage and visual clutter. Users can select additional areas to translate, or exclude specific ones, as needed.
* **Data Synchronization:** Supports syncing configurations and saved vocabulary via Google Drive or WebDAV.
* **Vocabulary Learning:** Enables users to save words or phrases directly from translated text into a local list, allowing for future review, editing, and cross-device synchronization.
* **Mobile Support:** Compatible with mobile browsers (such as Microsoft Edge and Firefox on Android), allowing for seamless translation on the go.

---

### **Design Philosophy**

Mira aims to provide the essential features needed for a practical translation workflow without overwhelming users with configuration options. Most of the functionality is already built in, while many technical details are handled automatically in the background to keep things simple.

Users can still customize the things that matter most, such as which areas to translate, the style of translated text, and keyboard shortcuts.

For AI translation, Mira batches multiple pieces of text into a single request whenever possible, helping reduce unnecessary API calls and improve translation efficiency.



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
