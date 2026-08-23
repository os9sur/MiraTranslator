<p align="center">
  <a href="README.md">English</a> · <a href="README_zh-CN.md">简体中文</a> · 日本語
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/mira-translator/hmmllfdmkbmmfffjekhmmbhhfhhnocmn" target="_blank">
    <img src="images/logo.png" width="120px" height="auto" alt="Mira Logo">
  </a>
</p>

<h1 align="center">Mira Translator</h1>

<p align="center">
  <em>超軽量 (~300KB) AI 翻訳ゲートウェイ —— Vanilla JS 製。没入型の読書体験と YouTube のバイリンガル字幕をサポート。無駄を削ぎ落とし、プライバシーを最優先に。</em>
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

## 💡 プロジェクトの背景と代替手段

完全無料でそのまま使える AI 翻訳ツールをお探しなら、お使いのブラウザにすでに優れた機能が標準搭載されています。

- **Chrome ユーザー**：Gemini サイドパネルで、強力なウェブページの読み込みやコンテンツ分析を利用できます。
- **Edge ユーザー**：内蔵の Copilot を使えば、ウェブページの要約や動画の字幕サマリーを簡単に作成できます。

**では、なぜ Mira を開発したのか？**

「使い勝手が良く、プライバシーを尊重してくれ、バックグラウンドで閲覧データが収集されていないかと不安にならずに済む、そんなオープンソースの翻訳ツールが欲しい」と思い探したものの、なかなか見つかりませんでした。そこで、個人の趣味の範囲で自作することにしました。

Mira はあくまで個人のニーズとこだわりをベースに作られています。商業プロダクトではないため、マイペースにメンテナンスしていく予定です。もしこの小さなツールがあなたのニーズにも合致するなら、ぜひ自由に使ってください！ただし、リソースが限られているため、すべてのウェブサイトへの完全な互換性や迅速なバグ修正の保証は致しかねます。あらかじめご了承ください。

---

## 概要

**Mira Translate** は、ユーザー自身が用意した API キーを利用して翻訳を行うブラウザ拡張機能です。ブラウザと各翻訳サービスの間の軽量な仲介役として機能し、API の設定をシームレスに管理できます。

シンプルさと効率性を最優先しつつ、商用ソフトにありがちな無駄な機能を削ぎ落とした、実用的なオープンソースのバイリンガル翻訳ツールが欲しいという思いから生まれました。

### 主な機能

* **圧倒的な軽量・高速**：ネイティブ JavaScript で構築されており、コアサイズは約 300KB。ブラウザのリソース消費を最小限に抑えます。
* **ビジュアル設定**：専用のパネルを通じて、ウェブページに適用される翻訳スタイル、配色、レイアウトを自由に調整できます。
* **YouTube 連携**：バイリンガル字幕の表示、プレイヤーの調整、字幕のダウンロードをサポート。
* **プライバシーファースト**：API キーはブラウザ内のローカルにのみ保存されます。中継サーバーを介して翻訳処理を行うことは一切ありません。
* **マルチモデル対応**：ChatGPT / OpenAI（および OpenAI 互換 API）、Claude、Gemini、DeepL、SiliconFlow、ローカルモデル（Ollama など）のほか、カスタム API エンドポイントにも対応。
* **コンテキスト認識翻訳**：単語や文単位の機械的な直訳とは異なり、周辺の文脈を汲み取ることで、より自然で精度の高い翻訳を実現します。
* **スマートエリア選択**：デフォルトで本文エリアにフォーカスし、メニューや UI の装飾要素を自動で除外するため、レイアウトの崩れや視覚的なごちゃつきを防ぎます。必要に応じて、翻訳するエリアを手動で指定したり、特定の要素を除外することも可能です。
* **データ同期**：Google Drive または WebDAV を介した設定や単語帳の同期をサポート。
* **単語帳機能**：翻訳されたテキストからワンクリックで単語やフレーズをローカルの単語帳に追加可能。後からの復習や編集、クロスデバイス同期にも対応しています。
* **モバイル対応**：モバイル版ブラウザ（Android 版 Microsoft Edge や Firefox など）に対応し、移動中も快適に翻訳を利用できます。

---

### **デザイン哲学**

Mira は日常翻訳のコアなニーズに集中し、煩雑な設定を極力減らします。ほとんどの機能は最初から組み込まれており、技術的な細部もすべてバックグラウンドで自動処理されるため、極めてシンプルかつスムーズな体験をもたらします。

また、AIの口調やロール設定、デフォルトで全体翻訳を行うかサイトごとに切り替えるか、翻訳エリア、デザインスタイル、ショートカットキーといった本当に重要なコア設定は、引き続き自由にカスタマイズ可能です。

さらに、AI 翻訳の際には複数のテキストをできる限り 1 つのリクエストにバッチ処理することで、不要な API 呼び出しを削減し、翻訳効率を大幅に高めています。

## 開発とビルド

### 1. 前提条件
Node.js と pnpm がインストールされていることを確認してください。

### 2. 設定
API キーはプライベート設定ファイルに保存されます。テンプレートからローカル設定ファイルを作成してください：

    cp private_config.example.js private_config.js

`private_config.js` を編集し、`CLIENT_ID` と `MANIFEST_KEY` を入力します。

### 3. ビルドと実行

| コマンド | ターゲットブラウザ |
| --- | --- |
| `pnpm dev` | **Chrome** |
| `pnpm dev:edge` | **Edge** |
| `pnpm dev:firefox` | **Firefox** |

---
© 2026 David Bai. Licensed under the AGPL-3.0 License.