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
<img src="https://img.shields.io/badge/Version-3.5.8.610-blue" alt="Version">
  &nbsp;
  <img src="https://img.shields.io/badge/License-Source--Available-orange" alt="License">
  &nbsp;
  <a href="https://os9sur.github.io/mira-trans/">
    <img src="https://img.shields.io/badge/Official-Website-brightgreen" alt="Website">
  </a>
</p>

> ## ⚠️ 版权声明 / Copyright Notice
>
> **本仓库是 Mira Translator 唯一官方源码仓库。**
>
> **历史侵权记录（发生于本项目采用 AGPL-3.0 协议期间）：** 我们发现有人罔顾基本诚信与法律底线，未经授权复制了本项目当时基于 AGPL-3.0 协议发布的代码，并删除了 AGPL-3.0 协议声明、原始 README 及全部提交（commit）历史记录，虚假标注为 MIT 协议对外发布。**我们已就此提起版权侵权举报，并保留追究法律责任的权利。**
>
> 这种删除他人版权声明、抹去署名与提交历史、将他人心血据为己有的行为，是赤裸裸的窃取与欺骗，践踏了开源社区赖以生存的信任与诚信底线，也是对自己人格与职业操守的公然践踏!
>
> **⚡ 请注意：本项目自 2026 年 9 月 2 日（北京时间）起，已不再采用 AGPL-3.0 协议，现行许可条款请见 [LICENSE](LICENSE) 文件。在此日期之前发布的版本仍受 AGPL-3.0 条款约束；在此日期及之后发布的版本受当前 LICENSE 约束。** 我们建议任何试图复制、二次分发本项目代码的个人或组织，在行动前认真阅读并遵守当前 LICENSE 文件中的全部条款——未经授权不得修改后对外重新发布、不得更改品牌重新上架、不得擅自删除或篡改本项目的版权声明、README 文档或提交历史，避免因一时之利承担远超预期的法律后果。
>
> ---
>
> **This repository is the sole official source of Mira Translator.**
>
> **Historical infringement record (occurred while this project was licensed under AGPL-3.0):** We identified an unauthorized copy of code that this project distributed under AGPL-3.0 at the time, in which the AGPL-3.0 license notice, original README, and the entire commit history were removed, with the code falsely relabeled as MIT-licensed. **We have filed an official copyright infringement report regarding this matter and reserve the right to pursue further legal action.**
>
> Deleting another creator's copyright notice, erasing their attribution and commit history, and passing off their work as one's own is nothing short of theft and deception. It tramples on the basic trust and integrity the open-source community depends on to survive — and it is, above all, a public betrayal of one's own character and professional integrity.
>
> **⚡ Please note: as of September 2, 2026 (Beijing time), this project is no longer licensed under AGPL-3.0. Versions published before this date remain governed by AGPL-3.0; versions published on or after this date are governed by the current [LICENSE](LICENSE) file.** Anyone considering copying or redistributing this project's code is strongly advised to fully comply with the current LICENSE file — unauthorized redistribution of modified versions, rebranding, or deletion/alteration of the copyright notice, README, or commit history is prohibited — to avoid legal consequences that may far outweigh any short-term benefit.
>
> ---

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

## 💡 Project Scope & Free Alternatives

If you are simply looking for a completely free, zero-setup AI translation tool, your current browser likely already provides excellent built-in options:

- **Chrome Users:** The Gemini side panel offers powerful, out-of-the-box webpage reading and content analysis capabilities.
- **Edge Users:** The built-in Copilot can easily analyze webpage content and generate video subtitle summaries.

**So why develop Mira?**

I couldn't find a translation tool that was truly handy, respected my privacy, and didn't leave me wondering whether my browsing data was being collected in the background. So I decided to build one myself in my spare time.

Mira is designed around my own needs and preferences. It's not built as a commercial product for the general public, and I maintain it at my own pace. If this little tool happens to meet your needs too, you're welcome to use it under the terms set out in the [License & Usage Terms](#license--usage-terms) section below. But please understand that due to limited time, I can't guarantee compatibility with every website or provide immediate bug fixes.

---

## Technical Overview

**Mira Translate** is a browser extension designed for translation tasks using user-provided API keys. It functions as an interface between the browser and translation services, allowing users to manage their own API configurations seamlessly.

This tool was created to fill the need for a functional, transparent, source-available bilingual translation utility that prioritizes simplicity and efficiency. It features a streamlined interface designed around specific workflows without the bloat of corporate software.

### Features

* **Performance:** The extension is built using native JavaScript with a core size of approximately 300KB+, aimed at minimizing browser resource usage.

* **Visual Configuration:** A panel is provided to adjust translation styles, colors, and layout, which are applied directly to the webpage.

* **YouTube Integration:** Includes dual-language subtitle rendering, player adjustments, subtitle downloading, and AI-powered subtitle segmentation for more natural sentence breaks while preserving subtitle timing.

* **AI Subtitle Segmentation:** AI can automatically segment YouTube subtitles into more natural sentences based on context, improving readability while keeping the original subtitle timing aligned with speech.

* **Input Field Translation:** Supports quick translation directly in text input fields. Press the configured shortcut or trigger method to translate text without leaving the current input field.

* **Flexible Engine Assignment:** Different translation engines can be assigned to different translation scenarios. For example, one engine can be used for webpage translation, another for YouTube subtitles, and another for input field or selection translation, allowing users to choose the most suitable engine for each task.

* **Privacy:** API keys are stored locally in the browser. The extension does not use intermediary servers for translation processing.

* **Multi-Engine Support:** Compatible with ChatGPT/OpenAI (and any OpenAI-compatible APIs), Claude, Gemini, DeepL, SiliconFlow, local models such as Ollama, and more. Users can also configure custom API endpoints.

* **AI Context-Aware Translation:** Uses surrounding context to produce more accurate and natural translations, rather than translating isolated words or sentences.

* **Element Selection:** Rather than translating the entire page by default, Mira focuses on main content areas out of the box — menus and other UI chrome are skipped to avoid layout breakage and visual clutter. Users can select additional areas to translate, or exclude specific ones, as needed.

* **Data Synchronization:** Supports syncing configurations and saved vocabulary via Google Drive or WebDAV.

* **Vocabulary Learning:** Enables users to save words or phrases directly from translated text into a local list, allowing for future review, editing, and cross-device synchronization.

* **Mobile Support:** Compatible with mobile browsers such as Microsoft Edge and Firefox on Android, allowing for seamless translation on the go.

* **Keyboard Shortcuts:** Supports configurable keyboard shortcuts for common translation actions, such as translating the paragraph or word under the mouse cursor. Users can customize shortcuts to fit their workflow.

---

### **Design Philosophy**

Mira aims to provide the essential features needed for a practical translation workflow without overwhelming users with configuration options. Most of the functionality is already built in, while many technical details are handled automatically in the background to keep things simple.

You're still in control of the essentials: AI tones/personas, global or site-specific default toggles, translation scopes, styling, and hotkeys.

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

## License & Usage Terms

This project is source-available under a custom license — **not** an OSI-approved open-source license. In short:

- ✅ You may view, study, and learn from the source code.
- ✅ You may run it for personal, non-commercial use.
- ✅ You may fork it using your platform's native fork feature to submit contributions (see below) — forks may not be packaged or distributed as an installable browser extension or end-user product.
- ❌ You may **not** modify and redistribute it, rebrand it, or republish it (under this or any other name) without a separate Commercial License.
- ❌ You may **not** remove or alter the copyright notice, README, LICENSE, commit history, or attribution.
- ❌ You may **not** use the source code to train or fine-tune any AI/ML model without a separate Commercial License.

Full terms: see [LICENSE](LICENSE). Commercial licensing inquiries: [mira.studio@proton.me]

### Contributing

Pull requests are welcome. By submitting a PR, you agree to the Developer Certificate of Origin (DCO) and the contribution terms set out in [LICENSE](LICENSE), Section 8 — in short, you confirm you have the right to submit the contribution, and you grant the project owner the right to use, modify, and (where applicable) commercially (sub)license it as part of the Software.

## 许可与使用条款

本项目采用自定义的 **Source-Available（源码可见）** 许可协议，**并非** OSI 认证的开源许可证。简要说明：

- ✅ 可以查看、学习、研究源代码。
- ✅ 可以将其用于个人、非商业用途。
- ✅ 可以使用平台原生 Fork 功能 fork 本仓库以提交贡献（见下方说明）——fork 不得被打包或分发为可安装的浏览器扩展或终端用户产品。
- ❌ 未经单独商业许可，**不得**修改后重新发布、更改品牌，或以任何名称重新上架发布。
- ❌ **不得**删除或篡改版权声明、README 文档、LICENSE 文件、提交历史或署名信息。
- ❌ 未经单独商业许可，**不得**将源代码用于训练或微调任何 AI/机器学习模型。

完整条款请见 [LICENSE](LICENSE) 文件。商业授权咨询：[mira.studio@proton.me]

### 贡献说明

欢迎提交 Pull Request。提交 Pull Request 即表示你同意《开发者原创声明》（DCO）以及 [LICENSE](LICENSE) 文件第8条所述的贡献条款——即你确认拥有权利提交该贡献内容，并授予项目所有者使用、修改及（在适用情况下）进行商业转授权的权利，将其作为本软件的一部分。

---

© 2026 **David Bai**. Licensed under a custom [Source-Available License](LICENSE). Commercial licensing available — see LICENSE for details.