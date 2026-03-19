<p align="center">
  <a href="https://chromewebstore.google.com/detail/mira-translator/hmmllfdmkbmmfffjekhmmbhhfhhnocmn" target="_blank">
    <img src="icons/icon-128.png" width="48" height="48" alt="Mira Logo - Install on Chrome Web Store">
  </a>
</p>

<h1 align="center">Mira Translate</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Version-3.3.6.5-blue?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/License-AGPL--3.0-orange?style=flat-square" alt="License">
 <img src="https://img.shields.io/badge/Platform-Chrome-blue?style=flat-square" alt="Platform">
  <a href="https://os9sur.github.io/mira-translator-home/">
    <img src="https://img.shields.io/badge/Official-Website-brightgreen?style=flat-square" alt="Website">
  </a>
</p>

<p align="center">
  <b>Immersive translation gateway powered by native JavaScript. Pure, Private, and Powerful.</b>
  <br />
  基于原生 JS 构建的沉浸式翻译网关。纯粹、私密、强大。
</p>

<p align="center">
  <a href="#english">English</a> • <a href="#chinese">简体中文</a>
</p>

<p align="center">
  <a href="https://www.youtube.com/watch?v=qUbX6mzlsag" target="_blank">
    <img src="https://lh3.googleusercontent.com/nGElWTi1OJrm3o86_N8NTGPk4KOVbqQE799wU7kqJ4ATNqcfkTR3FBUVkw9aB9sMfiW9psQrYahzlG4eA-kPNgVq=s1280-w1280-h800" alt="Mira Translator Video Intro" width="400">
    <br>
    <b>📺 点击观看视频演示 (Video Demo)</b>
  </a>
</p>

<p align="center">
  <img src="images/bird_screenshot.png" width="415" alt="Translation Preview">
  <img src="images/caddy_screenshot.png" width="415" alt="Feature Preview">
</p>
<p align="center">
  <img src="images/style_setting_screenshot.png" width="415" alt="Mira Translate UI Preview">
  <img src="images/settings_screenshot.png" width="415" alt="Mira Translate UI Preview">
</p>
---

<a name="english"></a>
## 🌍 English Description

**Mira Translate** is an immersive translation browser extension built with pure native JavaScript. It acts as a flexible **AI Translation Gateway**, allowing you to bypass "black-box" services and take full control of your translation quality, speed, and cost by using your own API keys.

### ✨ Key Features
* **🤖 Advanced AI Engine**: Support for **OpenAI**, **Claude**, **SiliconFlow**, **DeepL**, and **Gemini**. Supports fully customizable AI API interfaces.
* **🎨 Visual Customization**: 
    * **Visual Element Picker**: Intuitive tool to visually extract or exclude webpage elements.
    * **Style Editor**: Customize colors, underlines, and margins via a visual panel with real-time preview.
* **📺 YouTube Deep Integration**: 
    * Real-time dual-language subtitle rendering.
    * **Visual Subtitle Styling**: Adjust font size, background opacity, and positioning directly on the player.
* **📚 Vocabulary & Cloud Sync**: Save unfamiliar words and sync configurations via **Google Drive** or **WebDAV**.
* **🔒 Privacy & Security**: Your API keys are encrypted and stored only in your local browser. No intermediary servers, no data logging.



---

<a name="chinese"></a>
## 🇨🇳 中文说明

**Mira Translate (Mira 翻译)** 是一款基于纯原生 JavaScript 开发的沉浸式翻译插件。它是一个灵活的 **AI 翻译网关**，通过接入您自己的 API 密钥，您可以完全掌控翻译的质量与成本，告别“黑盒”服务的限制。

### ✨ 核心功能
* **🤖 顶尖 AI 引擎支持**: 适配 **OpenAI**、**Claude**、**硅基流动**、**DeepL** 及 **Gemini**。支持自定义 API 接口。
* **🎨 可视化定制与沉浸式阅读**: 
    * **可视化元素提取**: 直观的“点击选取”工具，精确定义网页中哪些部分需要翻译。
    * **样式编辑器**: 无需代码，通过可视化面板调整译文样式，支持实时预览。
* **📺 YouTube 深度适配**: 实时双语字幕渲染，支持在播放器上直接调节大小、透明度及位置。
* **📚 生词本与云同步**: 浏览时一键收藏生词，支持通过 **Google Drive** 或 **WebDAV (如坚果云)** 同步配置。
* **🔒 隐私与安全**: 密钥加密存储于本地，零中转服务器，确保账户安全。

---

## 🛠️ Development & Build (开发与构建)

### 1. Prerequisites (环境准备)
Ensure you have [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/) installed.

### 2. Configuration (配置)
API keys are kept in a private file. Create your local config from the template:
```bash
cp private_config.example.js private_config.js
```

Edit `private_config.js` and fill in your `CLIENT_ID`, `MANIFEST_KEY`.

### 3. Build Commands (构建命令)

| Command | Target Browser | Mode |
| --- | --- | --- |
| `pnpm dev` | **Chrome** | Development |
| `pnpm build:chrome` | **Chrome** | Production Build |

---
