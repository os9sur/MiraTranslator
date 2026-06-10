/**
 * Mira Translator
 * Copyright (C) 2026 David Bai 
 * License: AGPL-3.0 (https://github.com/os9sur)
 * Contact: mira.studio@proton.me
 */

window.currentTargetL = getBrowserLang() || "en";
window.__LANG_READY__ = false;
window.__LANG_PROMISE__ = null;

function loadTargetLanguage() {
  if (window.__LANG_PROMISE__) return window.__LANG_PROMISE__;
  window.__LANG_PROMISE__ = safeGetStorage(["targetLanguage", "ui_language"])
    .then((res) => {
      window.currentTargetL = res?.targetLanguage || getBrowserLang() || "en";
      window.uiLanguage = res?.ui_language || getBrowserLang() || "en";
      window.__LANG_READY__ = true;
      return window.currentTargetL;
    })
    .catch(() => {
      window.currentTargetL = getBrowserLang() || "en";
      window.uiLanguage = getBrowserLang() || "en";
      window.__LANG_READY__ = true;
      return window.currentTargetL;
    });
  return window.__LANG_PROMISE__;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.targetLanguage)
      window.currentTargetL =
        changes.targetLanguage.newValue || getBrowserLang() || "en";
    if (changes.ui_language)
      window.uiLanguage =
        changes.ui_language.newValue || getBrowserLang() || "en";
  }
});

let APP_NAME = "Mira Translator";

loadTargetLanguage().then(async () => {
  APP_NAME = t("appName") || "Mira Translator";
  logger.log(
    "Content script - Current target language:",
    window.currentTargetL,
  );

  await _defaultEngineReady;

  let res = await safeGetStorage(["activeConfig", "targetLanguage"]);
  if (!res || !res.activeConfig) {
    const finalCfg = { engine: _defaultEngine, data: {} };
    window.currentConfig.activeConfig = finalCfg;
    window.currentConfig.selectedEngine = finalCfg.engine;
    res = {
      activeConfig: finalCfg,
      targetLanguage: window.currentTargetL,
    };
  }
  syncLocalState(res);
});

const TRANS_STATUS = {
  LOADING: "loading",
  DONE: "done",
  ERROR: "error",
};
let appConfig = { page: true, select: true, yt: true };
const currentDomain = window.location.hostname;
let isPageScanEnabled = false;
let isSelectEnabled = true;
let isYTEnabled = true;
let lastSubIndex = -1;
let shadowHost = null,
  popupEl = null;
let logoBtn = null;
let wasPlayingBeforeHover = false;
let currentActiveSelectors = "__LOADING__";
window.__MIRA_DEBUG_COMMENTS =
  (typeof localStorage !== "undefined" &&
    localStorage.getItem &&
    localStorage.getItem("mira_debug_comments") === "1") ||
  false;
function debugCommentLog(...args) {
  if (window.__MIRA_DEBUG_COMMENTS) logger.log("[Mira-Debug]", ...args);
}
function highlightDebugNode(node, ttl = 2000, color = "rgba(255,99,71,0.6)") {
  try {
    if (!node?.style) return;
    const prevOutline = node.style.outline;
    node.style.outline = `3px solid ${color}`;
    setTimeout(() => {
      try {
        node.style.outline = prevOutline;
      } catch (e) { }
    }, ttl);
  } catch (e) { }
}
const DEFAULT_COMMENT_FALLBACKS = [
  "yt-formatted-string#content-text",
  "yt-formatted-string.style-scope.ytd-comment-renderer",
  "#content-text",
  "ytd-comment-renderer yt-formatted-string",
  "ytd-comment-replies-renderer yt-formatted-string#content-text",
];
function getCommentFallbackSelectors(domain) {
  try {
    const host = (domain || window.location.hostname || "").replace(
      /^www\./,
      "",
    );
    if (window.__MIRA_SCAN_FALLBACKS) {
      if (window.__MIRA_SCAN_FALLBACKS[window.location.hostname])
        return window.__MIRA_SCAN_FALLBACKS[window.location.hostname];
      if (window.__MIRA_SCAN_FALLBACKS[host])
        return window.__MIRA_SCAN_FALLBACKS[host];
    }
    if (window.__MIRA_GLOBAL_FALLBACK && window.__MIRA_GLOBAL_FALLBACK.length)
      return window.__MIRA_GLOBAL_FALLBACK;
  } catch (e) { }
  return DEFAULT_COMMENT_FALLBACKS;
}
if (typeof fastMemoryCache === "undefined") var fastMemoryCache = new Map();
if (typeof pendingRequests === "undefined") var pendingRequests = new Set();
window.currentConfig = {
  targetLanguage: (getBrowserLang() || "en").replace("_", "-"),
  selectedEngine: getRuntimeDefaultEngine(),
  activeConfig: { engine: getRuntimeDefaultEngine(), data: {} },
};
async function syncLocalState(storageData) {
  if (storageData.targetLanguage) {
    const lang = storageData.targetLanguage.replace("_", "-");
    window.currentTargetL = lang;
    window.currentConfig.targetLanguage = lang;
    applyI18n(lang);
  }

  if (storageData.activeConfig) {
    const cfg = storageData.activeConfig;
    window.currentConfig.selectedEngine =
      cfg.engine || getRuntimeDefaultEngine();
    window.currentConfig.activeConfig = cfg;
    window.currentEngine = cfg.engine || getRuntimeDefaultEngine();
  } else {
    const defEngine = getRuntimeDefaultEngine();
    window.currentConfig.selectedEngine = defEngine;
    window.currentEngine = defEngine;
    if (!window.currentConfig.activeConfig) {
      window.currentConfig.activeConfig = { engine: defEngine, data: {} };
    }
  }

  if (typeof checkEngineStatus === "function") checkEngineStatus();
}
(async () => {
  const data = await safeGetStorage(["targetLanguage", "activeConfig"]);
  if (!data) return;
  syncLocalState(data);
})();
chrome.storage.onChanged.addListener((changes) => {
  const update = {};
  if (changes.targetLanguage)
    update.targetLanguage = changes.targetLanguage.newValue;
  if (changes.activeConfig) update.activeConfig = changes.activeConfig.newValue;
  if (Object.keys(update).length > 0) syncLocalState(update);
});
function hidePopup() {
  if (popupEl) {
    popupEl.classList.add("is-hidden");
    setTimeout(() => {
      popupEl.style.display = "none";
    }, 200);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }
}
function applyAppConfig(newConfig) {
  appConfig = newConfig;
  isPageScanEnabled = !!appConfig.page;
  isSelectEnabled = !!appConfig.select;
  isYTEnabled = !!appConfig.yt;
  document.querySelectorAll(".kt-paragraph-translation").forEach((el) => {
    el.style.display = isPageScanEnabled ? "block" : "none";
  });
  if (isPageScanEnabled) {
    scanContent();
  }
  if (!isSelectEnabled) {
    hidePopup();
  }
  refreshIcon();
  if (location.hostname.includes("youtube.com")) {
    syncSubtitleDisplay();
    ensureYouTubeReadyWatcher();
  }
  refreshIcon();
}
function smartClear(newSelectors) {
  const whiteList = new Set(document.querySelectorAll(newSelectors));
  document.querySelectorAll('[data-translated="true"]').forEach((el) => {
    if (!whiteList.has(el)) {
      const transEl = el.querySelector(".kt-paragraph-translation");
      if (transEl) {
        transEl.remove();
      }
      el.removeAttribute("data-translated");
      el.removeAttribute("data-translating");
      delete el.dataset.translated;
      delete el.dataset.translating;
    }
  });
}
async function applyUserStyles(
  transEl,
  directConfig = null,
  inheritFontSize = null,
) {
  const render = (config) => {
    const finalFontSize =
      inheritFontSize || transEl.dataset.inheritFontSize || null;
    const isWiki = location.hostname.includes("wikipedia.org");
    const isInstagram = location.hostname.includes("instagram.com");
    const clearStyle = isWiki ? "none" : "both";
    const targetPrefix = (window.currentTargetL || "")
      .toLowerCase()
      .slice(0, 2);
    const isRTL = checkRTL(targetPrefix);
    const mountTarget = transEl.parentElement;
    let inheritedWhiteSpace = "normal";
    if (mountTarget) {
      const sourceStyle = window.getComputedStyle(mountTarget);
      const ws = sourceStyle.whiteSpace;
      if (ws.includes("pre") || ws === "break-spaces") {
        inheritedWhiteSpace = "pre-wrap";
      }
    }
    transEl.style.cssText = "";
    transEl.onmouseenter = null;
    transEl.onmouseleave = null;
    const oldMarker = transEl.querySelector(".marker-span");
    if (oldMarker) {
      transEl.innerHTML = oldMarker.innerHTML;
    }
    let sourceAlign = "inherit";
    let sourceMarginLeft = "0px";
    let sourcePaddingLeft = "0px";
    const isFacebook = location.hostname.includes("facebook.com");
    try {
      let sourceEl = transEl.previousElementSibling;
      if (sourceEl && sourceEl.offsetHeight < 5) {
        sourceEl = transEl.parentElement;
      }
      if (sourceEl) {
        const computedStyle = window.getComputedStyle(sourceEl);
        sourceAlign = computedStyle.textAlign;
        sourceMarginLeft = computedStyle.marginLeft;
        sourcePaddingLeft = computedStyle.paddingLeft;
      }
    } catch (e) {
      logger.warn("无法获取原文对齐方式", e);
    }
    if (!config) {
      const verticalMargin = isInstagram ? "0px" : "6px";
      const bottomMargin = isInstagram ? "2px" : "4px";
      const useInline =
        (transEl.tagName === "SPAN" || transEl.tagName === "FONT") &&
        transEl.classList.contains("kt-paragraph-translation") &&
        transEl.dataset.forceInline !== "false";
      let defaultCss = `
        display: ${useInline ? "inline" : "block"} !important;
        width: auto !important;
        clear: ${useInline ? "none" : clearStyle} !important;
        margin: ${useInline ? "0 0 0 4px" : `${verticalMargin} ${sourceMarginLeft} ${bottomMargin} ${sourceMarginLeft}`} !important;
        padding-left: ${useInline ? "0" : sourcePaddingLeft} !important;
        text-align: ${isRTL ? "right" : sourceAlign} !important;
        color: ${transEl.dataset.translated === "true" ? "#60a5fa" : "gray"} !important;
        font-style: ${transEl.dataset.translated === "true" ? "normal" : "italic"} !important;
        text-decoration: none !important;
        background: transparent !important;
        border: none !important;
        padding: 0 !important;
        animation: fadeIn 0.6s ease-out !important;
        ${finalFontSize ? `font-size: ${finalFontSize} !important;` : ""}
`;
      transEl.style.cssText = defaultCss;
      const oldWrapper = transEl.querySelector(".mira-default-wrapper");
      if (oldWrapper) {
        transEl.innerHTML = oldWrapper.innerHTML;
      }
      return;
    }
    const color = config.color || "#60a5fa";
    const borderColor = config.borderColor || "#38bdf8";
    const borderType = config.borderType || "left";
    const isBlur = config.isBlur || config.isBlurEnabled || false;
    const isTwitter = location.hostname.includes("x.com");
    const isFBC = location.hostname.includes("facebook.com");
    const isWikiUI =
      isWiki &&
      (transEl.closest(".vector-menu-content") ||
        transEl.closest("figcaption") ||
        transEl.closest(".thumbcaption") ||
        transEl.tagName === "LI" ||
        (transEl.closest("p") &&
          !transEl.closest("table") &&
          !transEl.closest(".infobox") &&
          !transEl.closest(".sidebar") &&
          !transEl.closest(".navbox")));
    const finalMargin = isInstagram
      ? "-5px 0px 2px 0px"
      : isWikiUI
        ? "2px 0 0 0"
        : "6px 0 4px 0";
    const finalOverflow = isInstagram
      ? "visible"
      : isWikiUI
        ? "hidden"
        : "visible";
    const useInline =
      (transEl.tagName === "SPAN" || transEl.tagName === "FONT") &&
      transEl.classList.contains("kt-paragraph-translation") &&
      transEl.dataset.forceInline !== "false";

    let css = `
        display: ${useInline ? "inline" : isWikiUI ? "inline-block" : "block"} !important;
        clear: ${useInline ? "none" : clearStyle} !important;
        width: ${useInline ? "auto" : "100%"} !important;
        max-width: ${isWikiUI ? "calc(100% - 2px)" : "100%"} !important;
        margin: ${useInline ? "0 0 0 4px" : finalMargin} !important;
        direction: ${isRTL ? "rtl" : "ltr"} !important;
        text-align: ${isRTL ? "right" : sourceAlign} !important;
        unicode-bidi: ${isRTL ? "plaintext" : "normal"} !important;
        overflow-wrap: anywhere !important;
        word-break: break-word !important;
        white-space: ${isTwitter || isFBC || inheritedWhiteSpace === "pre-wrap" ? "pre-wrap" : "normal"} !important;
        line-height: 1.5 !important;
        writing-mode: horizontal-tb !important;
        overflow: ${finalOverflow} !important;
        color: ${color} !important;
        background: transparent !important;
        font-style: normal !important;
        font-weight: normal !important;
        box-sizing: border-box !important;
        transition: all 0.3s ease !important;
        border-radius: 3px;
        animation: fadeIn 0.8s ease-out !important;
      `;
    let finalPadding = "0 0 0 8px";
    switch (borderType) {
      case "left":
        if (isRTL) {
          css += `border-right: 3px solid ${borderColor} !important; border-left: 0 !important;`;
          finalPadding = "0 8px 0 0";
        } else {
          css += `border-left: 3px solid ${borderColor} !important; border-right: 0 !important;`;
          finalPadding = "0 0 0 8px";
        }
        break;
      case "solid":
        css += `border: 1px solid ${borderColor} !important; border-radius: 6px !important;`;
        finalPadding = "1px 5px";
        break;
      case "dashed":
        css += `border: 1px dashed ${borderColor} !important; border-radius: 6px !important;`;
        finalPadding = "1px 5px";
        break;
      case "none":
        css += `border: none !important;`;
        break;
      case "underline":
      case "dashedUnderline":
      case "dottedUnderline": {
        const styleMap = {
          underline: "solid",
          dashedUnderline: "dashed",
          dottedUnderline: "dotted",
        };
        const style = styleMap[borderType] || "solid";
        css += `
            text-decoration: underline !important;
            text-decoration-style: ${style} !important;
            text-decoration-color: ${borderColor} !important;
            text-decoration-thickness: 0.5px !important;
            text-underline-offset: 5px !important;
          `;
        finalPadding = "0 0 1px 5px";
        break;
      }
      case "wavy":
        css += `text-decoration: underline wavy ${borderColor} !important; text-underline-offset: 5px !important;`;
        finalPadding = "0 0 0 5px";
        break;
      case "highlight":
        css += `background-color: ${borderColor}33 !important; border-radius: 4px !important;`;
        finalPadding = "1px 5px";
        break;
      case "marker":
        css += `background: transparent !important;`;
        finalPadding = "1px 5px";
        break;
      case "paper":
        css += `background: #ffffff !important;
                  box-shadow: 0 2px 6px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.1) !important;
                  border: 1px solid #eee !important;
                  border-radius: 6px !important;
                  color: #333 !important;
                  padding: 8px !important;
                  `;
        finalPadding = "5px";
        break;
      case "dividingLine":
        css += `border-top: 1px solid ${borderColor} !important; margin-top: 12px !important;`;
        finalPadding = "1px 0 0 5px";
        break;
      case "italic":
        css += `font-style: italic !important;`;
        break;
      case "bold":
        css += `font-weight: bold !important;`;
        break;
      case "opacity":
        css += `opacity: 0.45 !important;`;
        break;
    }

    if (finalFontSize) {
      css += `font-size: ${finalFontSize} !important;`;
    }

    css += `padding: ${finalPadding} !important;`;
    if (isBlur) {
      css += `filter: blur(5px) !important; cursor: help !important;`;
      transEl.onmouseenter = () =>
        transEl.style.setProperty("filter", "none", "important");
      transEl.onmouseleave = () =>
        transEl.style.setProperty("filter", "blur(5px)", "important");
    }
    if (transEl.dataset.translated !== "true") {
      css = css.replace(/color:[^;]+!important;/, "color: gray !important;");
      css = css.replace(
        /font-style:[^;]+!important;/,
        "font-style: italic !important;",
      );
    }
    transEl.style.cssText = css;
    const parentLI =
      transEl.parentElement?.tagName === "LI" ? transEl.parentElement : null;
    if (parentLI) {
      transEl.style.setProperty("display", "block", "important");
      transEl.style.setProperty("width", "100%", "important");
      transEl.style.setProperty("margin-top", "4px", "important");
      // 让 LI 自身换行
      parentLI.style.setProperty("display", "list-item", "important");
    }
    const isAmazon = location.hostname.includes("amazon.");
    if (isAmazon) {
      const h1 = transEl.closest("h1");
      if (h1 && h1.querySelector("#productTitle")) {
        const titleSpan = h1.querySelector("#productTitle");
        // 在样式应用完成后，直接给 h1 加 overflow:hidden 截断空白
        h1.style.setProperty("overflow", "hidden", "important");
        // trim 文本节点
        Array.from(titleSpan.childNodes).forEach((node) => {
          if (node.nodeType === 3) {
            node.textContent = node.textContent.trim();
          }
        });
        // 强制 span 不产生多余高度
        titleSpan.style.setProperty("display", "block", "important");
        titleSpan.style.setProperty("white-space", "normal", "important");
        titleSpan.style.setProperty("line-height", "1.3", "important");
        // 修正译文自身的 margin
        transEl.style.setProperty("margin-top", "4px", "important");
      }
    }
    const isTemu = location.hostname.includes("temu.com");
    if (isTemu) {
      const outerFlex = transEl.closest(".NhsUfVvY");
      if (outerFlex) {
        outerFlex.style.setProperty("display", "block", "important");
      }
      transEl.style.setProperty("width", "100%", "important");
      transEl.style.setProperty("display", "block", "important");
      transEl.style.setProperty("margin-top", "4px", "important");
    }
    if (isTwitter) {
      const parent = transEl.parentElement;
      if (parent) {
        parent.style.setProperty("flex-direction", "column", "important");
        parent.style.setProperty("align-items", "flex-start", "important");
      }
    }
    if (borderType === "marker") {
      const span = document.createElement("span");
      span.className = "marker-span";
      span.innerHTML = transEl.innerHTML;
      transEl.innerHTML = "";
      transEl.appendChild(span);
      const isTwitter = location.hostname.includes("x.com");
      span.style.cssText = `
          display: inline !important;
          background-image: linear-gradient(to bottom, transparent 55%, ${borderColor}66 55%) !important;
          box-decoration-break: clone !important;
          -webkit-box-decoration-break: clone !important;
          white-space: ${isTwitter ? "nowrap" : "normal"} !important;
          line-height: 1.6 !important;
          padding: 1px 5px !important;
        `;
    }
    const parentEl = transEl.parentElement;
    if (parentEl) {
      const grandParent = parentEl.parentElement;
      const grandParentDisplay = grandParent
        ? window.getComputedStyle(grandParent).display
        : "";
      const isFlexChild = grandParentDisplay.includes("flex");
      let ancestor = parentEl.parentElement;
      for (let i = 0; i < 5 && ancestor && ancestor !== document.body; i++) {
        const style = window.getComputedStyle(ancestor);
        const isAncestorFlex = style.display.includes("flex");
        if (
          !isAncestorFlex &&
          (style.overflow === "hidden" || style.webkitLineClamp !== "none")
        ) {
          ancestor.style.setProperty("overflow", "visible", "important");
          ancestor.style.setProperty(
            "-webkit-line-clamp",
            "unset",
            "important",
          );
          ancestor.style.setProperty("height", "auto", "important");
          ancestor.style.setProperty("max-height", "none", "important");
        }
        ancestor = ancestor.parentElement;
      }
    }
    transEl.style.setProperty("writing-mode", "horizontal-tb", "important");
    const isSteam = location.hostname.includes("steamcommunity.com");
    if (isSteam && transEl.parentElement?.classList.contains("forum_topic_name")) {
      transEl.style.setProperty("display", "inline", "important");
      transEl.style.setProperty("margin", "0 0 0 6px", "important");
      transEl.style.setProperty("font-size", "0.9em", "important");
      transEl.style.setProperty("clear", "none", "important");
      transEl.style.setProperty("width", "auto", "important");
    } else if (isSteam) {
      transEl.style.setProperty("margin-top", "0", "important");
      transEl.style.setProperty("margin-bottom", "0", "important");
      transEl.style.setProperty("margin-left", "0", "important");
      transEl.style.setProperty("padding-left", "0", "important");
    }
  };
  try {
    const data = await safeGetStorage("userStyleConfig");
    if (!data) {
      render(directConfig);
      return;
    }
    render(data.userStyleConfig || directConfig);
  } catch (e) {
    logger.error("ApplyUserStyles 核心异常:", e);
    render(directConfig);
  }
}
async function runWithConcurrency(tasks, limit = 4) {
  const results = [];
  const executing = [];
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p);
    executing.push(p);
    const clean = () => {
      const idx = executing.indexOf(p);
      if (idx > -1) executing.splice(idx, 1);
    };
    p.then(clean).catch(clean);
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

const DYNAMIC_WATCHER_SITES = [
  "foxnews.com",
  "grok.com",
  "cnn.com",
  "bbc.com",
  "reuters.com",
  "facebook.com",
  // 按需添加白名单,动态标题扫描问题
];
function ensureDynamicContentWatcher() {
  const host = location.hostname;
  const needsWatcher =
    DYNAMIC_WATCHER_SITES.some((site) => host.includes(site)) ||
    !SiteRules.hasRule(host); // generic 网站也监听
  if (!needsWatcher) return;
  if (window.__mira_dynamic_observer) return;
  // AI 对话页面用更长的 debounce，等流式输出结束
  const isAIChat = [
    "grok.com",
    "claude.ai",
    "chatgpt.com",
    "gemini.google.com",
    "copilot.microsoft.com",
    "bing.com/chat",
    "perplexity.ai",
    "poe.com",
    "character.ai",
    "huggingface.co/chat",
    "mistral.ai",
    "cohere.com",
    "you.com",
    "phind.com",
    "deepseek.com",
    "kimi.moonshot.cn",
    "tongyi.aliyun.com",
    "yiyan.baidu.com",
    "hailuoai.com",
    "doubao.com",
  ].some((s) => host.includes(s));
  const debounceDelay = isAIChat ? 2000 : 800;

  let debounceTimer = null;
  window.__mira_dynamic_observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.classList?.contains("kt-paragraph-translation")) continue;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          executeReScan({ selectors: currentActiveSelectors });
        }, debounceDelay);
        return;
      }
    }
  });

  window.__mira_dynamic_observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}
function ensureYouTubeNavigationListener() {
  if (!location.hostname.includes("youtube.com")) return;
  try {
    if (window.youTubeNavHooked) return;
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function () {
      origPush.apply(this, arguments);
      window.dispatchEvent(new Event("locationchange"));
    };
    history.replaceState = function () {
      origReplace.apply(this, arguments);
      window.dispatchEvent(new Event("locationchange"));
    };
    window.addEventListener("popstate", () =>
      window.dispatchEvent(new Event("locationchange")),
    );
    const cleanupStaleTranslations = () => {
      try {
        document
          .querySelectorAll(".kt-paragraph-translation")
          .forEach((el) => el.remove());
        document
          .querySelectorAll(
            "[data-translated], [data-translating], [data-mira-processing]",
          )
          .forEach((el) => {
            el.removeAttribute("data-translated");
            el.removeAttribute("data-translating");
            el.removeAttribute("data-mira-processing");
            delete el.dataset.translated;
            delete el.dataset.translating;
            delete el._miraSkippedHash;
            delete el._miraRetryCount;
          });
      } catch (e) {
        logger.error("[Mira] Cleanup error:", e);
      }
    };
    const scheduleRescanRetries = (label) => {
      if (label === "yt-navigate-finish") cleanupStaleTranslations();
      let attempts = 0;
      const iv = setInterval(async () => {
        attempts++;
        ensureYouTubeReadyWatcher();
        try {
          const res = await executeReScan({
            selectors: currentActiveSelectors || "p",
            forceAll: false,
          });
          if ((res && res.triggered > 10) || attempts >= 6) clearInterval(iv);
        } catch (e) {
          logger.error("[Mira] executeReScan error:", e.name, e.message, e); // 打印完整信息
          if (attempts >= 6) clearInterval(iv);
        }
      }, 800);
    };
    window.addEventListener("locationchange", () =>
      scheduleRescanRetries("locationchange"),
    );
    let lastUrl = location.href;
    window.addEventListener("yt-navigate-finish", () => {
      if (lastUrl !== location.href) {
        cleanupStaleTranslations();
        lastUrl = location.href;
      }
      ensureYouTubeReadyWatcher();
      const navUrl = location.href;
      let titleRetry = 0;
      const titleElAtStart = document.querySelector(
        "h1.ytd-watch-metadata yt-formatted-string",
      );
      let textAtNavStart = titleElAtStart?.innerText?.trim() || "";
      const titleFixer = setInterval(() => {
        titleRetry++;
        if (location.href !== navUrl) {
          clearInterval(titleFixer);
          return;
        }
        const titleEl = document.querySelector(
          "h1.ytd-watch-metadata yt-formatted-string",
        );
        const currentText = titleEl?.innerText?.trim() || "";
        if (!currentText || currentText === textAtNavStart) {
          if (titleRetry > 20) clearInterval(titleFixer);
          return;
        }
        titleEl.removeAttribute("data-translated");
        titleEl.removeAttribute("data-translating");
        titleEl.removeAttribute("data-mira-processing");
        _miraProcessingSet.delete(titleEl);
        let sibling = titleEl.nextElementSibling;
        while (
          sibling &&
          sibling.classList.contains("kt-paragraph-translation")
        ) {
          const next = sibling.nextElementSibling;
          sibling.remove();
          sibling = next;
        }
        const h1 = titleEl.closest("h1");
        if (h1) {
          let h1Sibling = h1.nextElementSibling;
          while (
            h1Sibling &&
            h1Sibling.classList.contains("kt-paragraph-translation")
          ) {
            const next = h1Sibling.nextElementSibling;
            h1Sibling.remove();
            h1Sibling = next;
          }
        }
        if (typeof handleTranslateElement === "function") {
          handleTranslateElement(titleEl, true);
        }
        clearInterval(titleFixer);
      }, 500);
      scheduleRescanRetries("yt-navigate-finish");
    });
    window.youTubeNavHooked = true;
  } catch (e) {
    logger.error("[Mira] NavListener error:", e);
  }
}
function ensureYouTubeReadyWatcher() {
  if (typeof isPageScanEnabled !== "undefined" && !isPageScanEnabled) return;
  if (!location.hostname.includes("youtube.com")) return;
  try {
    ensureYouTubeNavigationListener();
    if (window.youTubeRescanObserver) return;
    const defaultSelectors = [
      "h1.ytd-watch-metadata yt-formatted-string",
      "p",
      "li",
      "#description-inner span",
      "#content-text span",
      "yt-attributed-string.ytd-video-content-metadata-renderer span",
    ];
    const selectors =
      typeof currentActiveSelectors === "string" &&
        currentActiveSelectors.trim() !== "" &&
        currentActiveSelectors !== "__LOADING__"
        ? currentActiveSelectors
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
        : defaultSelectors;
    const selectorList = selectors.join(", ");
    const checkTargets = () => {
      if (!isPageScanEnabled) return;
      let allTargets = [];
      try {
        allTargets =
          typeof querySelectorAllDeep === "function"
            ? querySelectorAllDeep(selectorList)
            : Array.from(document.querySelectorAll(selectorList));
      } catch (e) {
        allTargets = [];
      }
      allTargets.forEach((el) => {
        try {
          if (
            el.closest(
              ".yt-content-metadata-view-model__metadata-row, .yt-content-metadata-view-model__metadata-text",
            )
          ) {
            return;
          }
          if (el.dataset.translated === "true") return;
          if (el.hasAttribute("data-translating")) return;
          if (el.hasAttribute("data-mira-processing")) return;
          if (_miraProcessingSet.has(el)) return;
          const titleContainer = el.closest(
            ".yt-lockup-metadata-view-model__title",
          );
          if (titleContainer) {
            const next = titleContainer.nextElementSibling;
            if (next?.classList?.contains("kt-paragraph-translation")) {
              el.dataset.translated = "true";
              return;
            }
          }
          const txt = (el.textContent || "").trim();
          if (txt.length > 2 && /[\p{L}\p{Nl}]/u.test(txt)) {
            executeReScan({ selectors: selectorList, forceAll: false });
          }
        } catch (e) { }
      });
    };
    let debounceTimer = null;
    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => checkTargets(), 300);
    });
    const attach = () => {
      const root = document.querySelector("ytd-app") || document.body;
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      const h1Container = document.querySelector("h1.ytd-watch-metadata");
      if (h1Container) {
        observer.observe(h1Container, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }
      window.youTubeRescanObserver = observer;
      if (!window.__mira_mutation_observer) {
        const attachCommentsWatcher = () => {
          const rule = SiteRules.getRule(location.hostname);
          if (!rule?.selectors) {
            logger.warn(
              "[Mira] attachCommentsWatcher: no rule for",
              location.hostname,
            );
            return;
          }
          if (!window.observer) {
            return;
          }
          const registerToObserver = (nodes) => {
            nodes.forEach((node) => {
              if (node.nodeType !== 1) return;
              try {
                if (node.matches(rule.selectors)) window.observer.observe(node);
                const matches = node.querySelectorAll(rule.selectors);
                matches.forEach((m) => {
                  if (!m.hasAttribute("data-mira-registered")) {
                    m.setAttribute("data-mira-registered", "true");
                    setTimeout(() => {
                      window.observer.observe(m);
                      m.removeAttribute("data-mira-registered");
                    }, 200);
                  }
                });
              } catch (e) {
                logger.warn("[Mira] registerToObserver error:", e);
              }
            });
          };
          window.__mira_mutation_observer = new MutationObserver(
            (mutations) => {
              const added = [];
              mutations.forEach((m) => added.push(...m.addedNodes));
              if (added.length > 0) registerToObserver(added);
            },
          );
          window.__mira_mutation_observer.observe(root, {
            childList: true,
            subtree: true,
          });
          registerToObserver([root]);
        };
        attachCommentsWatcher();
      }
    };
    if (
      document.readyState === "complete" ||
      document.readyState === "interactive"
    ) {
      attach();
    } else {
      window.addEventListener("load", attach, { once: true });
    }
  } catch (e) {
    logger.error("[Mira] Watcher error:", e);
  }
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!chrome.runtime || !chrome.runtime.id) return;
  if (msg.action === "SET_PAGE_SCAN_STATE") {
    isPageScanEnabled = msg.enabled;
    if (isPageScanEnabled) {
      if (typeof refreshIcon === "function") refreshIcon();
      if (typeof scanContent === "function") scanContent();
    } else {
      document
        .querySelectorAll(".kt-paragraph-translation")
        .forEach((el) => el.remove());
      document.querySelectorAll("[data-translated]").forEach((el) => {
        el.removeAttribute("data-translated");
        el.removeAttribute("data-translating");
      });
      if (typeof observer !== "undefined") observer.disconnect();
      try {
        const commentsRoot =
          document.querySelector("ytd-comments") ||
          document.getElementById("comments");
        if (commentsRoot) {
          if (commentsRoot._miraClickHandler) {
            commentsRoot.removeEventListener(
              "click",
              commentsRoot._miraClickHandler,
              true,
            );
            delete commentsRoot._miraClickHandler;
          }
          if (commentsRoot._miraScrollHandler) {
            commentsRoot.removeEventListener(
              "scroll",
              commentsRoot._miraScrollHandler,
              { passive: true },
            );
            delete commentsRoot._miraScrollHandler;
          }
        }
      } catch (e) { }
    }
    sendResponse({ status: "ok" });
  } else if (msg.action === "RE_SCAN_PAGE") {
    if (msg.lang) {
      window.currentTargetL = msg.lang;
    }
    if (typeof executeReScan === "function") executeReScan(msg.config);
    sendResponse({ status: "success" });
  } else if (msg.action === "SET_SELECT_STATE") {
    isSelectEnabled = msg.enabled;
    if (!isSelectEnabled && typeof popupEl !== "undefined" && popupEl) {
      if (typeof logoBtn !== "undefined" && logoBtn)
        logoBtn.classList.remove("show");
      popupEl.classList.add("is-hidden");
    }
    sendResponse({ status: "ok" });
  } else if (msg.action === "UPDATE_VISUAL_STYLE") {
    const allTrans = document.querySelectorAll(".kt-paragraph-translation");
    allTrans.forEach((el) => {
      if (typeof applyUserStyles === "function") applyUserStyles(el);
    });
    sendResponse({ status: "ok" });
  } else if (msg.action === "SET_YT_STATE") {
    isYTEnabled = msg.enabled;
    if (typeof refreshIcon === "function") refreshIcon();
    if (typeof syncSubtitleDisplay === "function") syncSubtitleDisplay();
    const dlBtn = document.getElementById("kt-subtitle-download");
    if (dlBtn) dlBtn.style.display = msg.enabled ? "inline-flex" : "none";
    sendResponse({ status: "ok" });
  } else if (msg.action === "PREVIEW_YT_STYLE") {
    if (typeof applySubtitleSettings === "function")
      applySubtitleSettings(msg.settings);
    sendResponse({ status: "ok" });
  } else if (msg.action === "REFRESH_YT") {
    if (typeof isYTEnabled === "undefined") {
      isYTEnabled = true;
      if (typeof refreshIcon === "function") refreshIcon();
    }
    if (typeof fastMemoryCache !== "undefined") fastMemoryCache.clear();
    if (typeof lastSubIndex !== "undefined") lastSubIndex = -1;
    sendResponse({ status: "ok" });
  } else if (msg.action === "GET_CURRENT_CONFIG") {
    if (typeof applyUserStyles === "function") applyUserStyles(msg.config);
    sendResponse({ status: "ok" });
  } else if (msg.action === "SET_LANGUAGE") {
    window.currentTargetL = msg.lang;
    if (typeof updateLanguageOnPage === "function") updateLanguageOnPage();
    document.querySelectorAll("[data-translated]").forEach((el) => {
      const transEl = el.querySelector(".kt-paragraph-translation");
      if (
        transEl &&
        (transEl.innerText.includes("...") ||
          transEl.dataset.status === "loading")
      ) {
        transEl.innerText =
          typeof t === "function" ? t("loading") : "loading...";
      } else {
        delete el.dataset.translated;
        if (transEl) transEl.remove();
      }
    });
    if (
      typeof popupEl !== "undefined" &&
      popupEl &&
      popupEl.style.display !== "none"
    ) {
      const pBasic =
        typeof shadowHost !== "undefined"
          ? shadowHost.shadowRoot.getElementById("p-basic")
          : null;
      if (pBasic && pBasic.innerText.includes("...")) {
        pBasic.innerText =
          typeof t === "function" ? t("loading") : "loading...";
      }
    }
    sendResponse({ status: "ok" });
  } else {
    sendResponse({ status: "ignored" });
  }
  return false;
});
document.addEventListener("MIRA_INTERNAL_RESCAN", (e) => {
  if (e.detail && e.detail.selectors) {
    executeReScan(e.detail);
  }
});
(async () => {
  const data = await safeGetStorage([
    "globalConfig",
    "siteSettings",
    "targetLanguage",
    "scanConfig",
  ]);
  if (!data) return;
  const domain = window.location.hostname.replace("www.", "");
  if (data.targetLanguage) window.currentTargetL = data.targetLanguage;
  const customScanConfig = data.scanConfig?.custom?.[domain];
  const globalScanConfig = data.scanConfig?.global;
  const defaultScanRule =
    typeof SiteRules !== "undefined"
      ? SiteRules.getRule(domain)
      : { selectors: "p" };
  if (customScanConfig?.selectors !== undefined) {
    currentActiveSelectors = customScanConfig.selectors;
  } else if (SiteRules.hasRule(domain)) {
    currentActiveSelectors = defaultScanRule.selectors;
  } else if (globalScanConfig?.selectors !== undefined) {
    currentActiveSelectors = globalScanConfig.selectors;
  } else {
    currentActiveSelectors = defaultScanRule.selectors;
  }
  window.__MIRA_SCAN_CONFIG = data.scanConfig || {};
  window.__MIRA_SCAN_FALLBACKS = {};
  try {
    const customMap = data.scanConfig?.custom || {};
    for (const k of Object.keys(customMap)) {
      const entry = customMap[k];
      if (entry?.fallbackSelectors) {
        const arr = Array.isArray(entry.fallbackSelectors)
          ? entry.fallbackSelectors
          : String(entry.fallbackSelectors)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        if (arr.length) window.__MIRA_SCAN_FALLBACKS[k] = arr;
      }
    }
  } catch (e) { }
  const g = data.scanConfig?.global?.fallbackSelectors;
  if (g) {
    window.__MIRA_GLOBAL_FALLBACK = Array.isArray(g)
      ? g
      : String(g)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  }
  const globalConf = data.globalConfig || {
    page: globalDefault_Page,
    select: globalDefault_Select,
    yt: globalDefault_YT,
  };
  const siteConf = data.siteSettings || {};
  const finalConfig = siteConf[domain] ? siteConf[domain] : globalConf;
  applyAppConfig(finalConfig);
  if (!chrome.runtime?.id) return;
  if (typeof initSelectionTranslate === "function") {
    initSelectionTranslate();
  }
  const scanTimer = setInterval(() => {
    if (!chrome.runtime?.id) return clearInterval(scanTimer);
    scanContent();
  }, 2000);
})();
function normalizeText(text) {
  return text
    .trim()
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ");
}
function isYoutubeCaptionOn() {
  const ccButton = document.querySelector(".ytp-subtitles-button");
  if (!ccButton) return false;
  return ccButton.getAttribute("aria-pressed") === "true";
}
function toggleVisibility() {
  syncSubtitleDisplay();
  if (popupEl && !isSelectEnabled) popupEl.style.display = "none";
  document.querySelectorAll(".kt-paragraph-translation").forEach((el) => {
    el.style.display = isPageScanEnabled ? "block" : "none";
  });
}
function handleYTDelayedText(el) {
  if (el.dataset.miraRetry) return;
  el.dataset.miraRetry = "true";
  setTimeout(() => {
    const newText = (el.innerText || el.textContent || "").trim();
    if (newText.length > 0) {
      handleTranslateElement(el);
    }
  }, 600);
}
function injectGlobalStyles() {
  if (document.getElementById("mira-translator-style")) return;
  const style = document.createElement("style");
  style.id = "mira-translator-style";
  style.textContent = `
    ytd-watch-metadata h1.style-scope.ytd-watch-metadata {
      height: auto !important;
      display: block !important;
      overflow: visible !important;
    }
    .kt-paragraph-translation {
      display: block !important;
      margin-top: 8px !important;
      color: grey !important;
    font-family: 
      -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, 
      "PingFang SC", "Microsoft YaHei",  /* 优先中文黑体 */
      "Hiragino Sans", "Meiryo",         /* 紧跟日文黑体 */
      sans-serif !important;
      }
  `;
  (document.head || document.documentElement).appendChild(style);
}
injectGlobalStyles();
function applyLayoutFix(id, css) {
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
}
const normalizeForCompare = (text) => {
  if (!text) return "";
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "")
    .trim();
};
function shrinkHeadingIfOverflow(container, el) {
  if (!["H1", "H2", "H3", "H4"].includes(el.tagName)) return;

  const originFontSize = parseFloat(container.style.fontSize);
  if (!originFontSize || originFontSize <= 24) return;

  const containerWidth =
    el
      .closest('article, main, [class*="article"], [class*="content"]')
      ?.getBoundingClientRect()?.width ||
    el.parentElement?.getBoundingClientRect()?.width ||
    0;

  if (containerWidth <= 0) return;
  if (container.scrollWidth <= containerWidth) return; // 没溢出不处理

  const MIN_SIZE = 16;
  let lo = MIN_SIZE,
    hi = originFontSize;
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    container.style.setProperty("font-size", `${mid}px`, "important");
    if (container.scrollWidth > containerWidth) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  container.style.setProperty(
    "font-size",
    `${Math.max(lo, MIN_SIZE)}px`,
    "important",
  );
}
const TranslationBatcher = {
  queue: [],
  timer: null,
  maxBatch: 8,
  wait: 200,
  isProcessing: false,
  _isFirstScreen: true,
  _firstScreenCount: 0,
  FIRST_SCREEN_LIMIT: 3,
  FIRST_SCREEN_TIMEOUT: 1500,
  _initFirstScreen() {
    if (!this._firstScreenTimer) {
      this._firstScreenTimer = setTimeout(() => {
        this._isFirstScreen = false;
        if (this.queue.length > 0 && !this.isProcessing) {
          this.flush();
        }
      }, this.FIRST_SCREEN_TIMEOUT);
    }
  },
  async _flushSingle(item, retries = 0) {
    if (this.isProcessing) {
      if (retries > 20) {
        this.unlock(item.el);
        if (item.container?.parentNode) item.container.remove();
        return;
      }
      setTimeout(() => this._flushSingle(item, retries + 1), 300);
      return;
    }
    this.queue.unshift(item);
    this.flush();
  },
  add(item, forceRefresh = false) {
    const { el } = item;
    this._initFirstScreen();
    if (el._miraRetryCount === undefined) el._miraRetryCount = 0;
    if (!forceRefresh && el._miraRetryCount >= 3) {
      el._miraSkippedHash = normalizeForCompare(item.text);
      this.unlock(el);
      if (item.container && item.container.parentNode) item.container.remove();
      return;
    }
    el._miraRetryCount++;
    item.forceRefresh = forceRefresh;
    if (item._singleRetry) {
      this._flushSingle(item);
      return;
    }
    // 判断是否是 li 元素（兼容 article li / section li 等组合选择器）
    const isLiEl = item.el.tagName === "LI";

    if (
      !isLiEl &&
      this._isFirstScreen &&
      this._firstScreenCount < this.FIRST_SCREEN_LIMIT
    ) {
      this._firstScreenCount++;
      item._singleRetry = true;
      this.queue.unshift(item);
      const delay = (this._firstScreenCount - 1) * 80;
      setTimeout(() => {
        if (!this.isProcessing) {
          this.flush();
        }
      }, delay);
      return;
    }

    // li 元素始终推到队尾
    if (isLiEl) {
      this.queue.push(item);
      if (!this.isProcessing) {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.flush(), this.wait);
      }
      return;
    }
    this.queue.push(item);
    if (this.isProcessing && !forceRefresh) return;
    const isFirstBatch = this.queue.length === 1;
    if (this.queue.length >= this.maxBatch) {
      this.flush();
    } else {
      if (this.timer) clearTimeout(this.timer);
      const delay = isFirstBatch ? 100 : this.wait;
      this.timer = setTimeout(() => this.flush(), delay);
    }
  },
  async flush() {
    if (this.queue.length === 0) return;
    if (this.isProcessing) {
      if (!this.timer) {
        this.timer = setTimeout(() => this.flush(), 100);
      }
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.isProcessing = true;

    // flush 时对队列重排，可视区域的非li元素优先
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect();
      return rect.top < window.innerHeight + 800 && rect.bottom > -800;
    };
    const isLi = (el) => el.tagName === "LI";

    // 检查是否存在可视区域内的非li元素
    const hasVisibleNonLi = this.queue.some(
      (q) => !isLi(q.el) && isVisible(q.el),
    );

    if (hasVisibleNonLi) {
      // 把可视区域的非li排前面，li和不可视的排后面
      const front = this.queue.filter((q) => !isLi(q.el) && isVisible(q.el));
      const back = this.queue.filter((q) => isLi(q.el) || !isVisible(q.el));
      this.queue = [...front, ...back];
    }

    const storage = await safeGetStorage(["activeConfig", "targetLanguage"]);
    if (!storage) {
      this.queue = [];
      this.isProcessing = false;
      return;
    }
    const engine = (
      storage.activeConfig?.engine || getRuntimeDefaultEngine()
    ).toLowerCase();
    const lang = (storage.targetLanguage || getBrowserLang() || "en")
      .replace("_", "-")
      .toLowerCase();
    let currentBatch = [];
    let currentLength = 0;
    const isAI = AI_LLM_WHITE_LIST.includes(engine);
    const MAX_CHARS = isAI ? 4000 : 2000;
    const MAX_ITEMS = isAI ? 10 : 5;
    const pre = "[[";
    const suf = "]]";
    while (this.queue.length > 0) {
      const nextItem = this.queue[0];
      if (nextItem._singleRetry && currentBatch.length > 0) break;
      const nextLen = nextItem.text.length;
      if (currentBatch.length === 0) {
        currentBatch.push(this.queue.shift());
        currentLength += nextLen;
      } else {
        if (nextItem._singleRetry) break;
        if (
          currentLength + nextLen > MAX_CHARS ||
          currentBatch.length >= MAX_ITEMS
        )
          break;
        currentBatch.push(this.queue.shift());
        currentLength += nextLen;
      }
    }
    let needTranslate = [];
    let hasError = false;
    try {
      const alreadyCached = [];
      for (const item of currentBatch) {
        const textToCache = item.textForTranslation || item.text;
        item.singleKey = getCacheKey(textToCache, engine, lang);
        if (!item.forceRefresh && detectIsAlreadyTarget(item.text, lang)) {
          item.el.dataset.translated = "true";
          this.unlock(item.el);
          if (item.container?.parentNode) item.container.remove();
          continue;
        }
        if (item.forceRefresh) {
          needTranslate.push(item);
          continue;
        }
        const hit = await lookupCache(textToCache, engine, lang);
        if (hit) {
          item.cachedContent = hit.result.basic;
          alreadyCached.push(item);
          continue;
        }
        needTranslate.push(item);
      }
      alreadyCached.forEach((item) =>
        this.applyResult(item, item.cachedContent, false),
      );
      if (needTranslate.length === 0) {
        this.finishProcessing();
        return;
      }
      needTranslate.forEach((item, i) => {
        const token = `mira_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
        item.el.dataset.miraToken = token;
        item.miraToken = token;
      });
      const hasComplexTweet = needTranslate.some(
        (item) => (item.textForTranslation || item.text).length > 250,
      );
      let mergedText;
      if (needTranslate.length > 1 && hasComplexTweet) {
        const item = needTranslate[0];
        if (needTranslate.length > 1) {
          const others = needTranslate.slice(1);
          this.queue = [...others, ...this.queue];
        }
        needTranslate = [item];
        mergedText = item.textForTranslation || item.text;
      } else {
        if (needTranslate.length === 1) {
          needTranslate[0]._singleRetry = true;
          // 单条直接发原文，不加标记
          mergedText =
            needTranslate[0].textForTranslation || needTranslate[0].text;
        } else {
          mergedText = needTranslate
            .map(
              (item, idx) =>
                `${pre}${idx}${suf}\n${item.textForTranslation || item.text}`,
            )
            .join("\n\n");
        }
      }
      const normalizedText = mergedText
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"');
      const res = await getDetailedTranslation(normalizedText, true, null, {
        skipCache: true,
        isBatch: true,
      });
      if (!chrome.runtime?.id) return;
      if (!res || res.isError) {
        logger.error("[Batcher] API 返回异常", res);
        throw new Error(res?.basic || "API Error");
      }
      const allTrans = res?.basic || "";
      needTranslate.forEach((item, i) => {
        if (item.el.dataset.miraToken !== item.miraToken) {
          logger.warn("[Batcher] 节点已被回收，丢弃翻译结果");
          item.el.removeAttribute("data-mira-token");
          this.unlock(item.el);
          if (item.container?.parentNode) item.container.remove();
          return;
        }
        item.el.removeAttribute("data-mira-token");
        let singleTrans = "";
        if (needTranslate.length === 1) {
          singleTrans = allTrans;
        } else {
          const currentMarkerStr = `\\[{1,2}${i}\\]{1,2}`;
          const nextMarkerStr = `\\[{1,2}${i + 1}\\]{1,2}`;
          const currentRegex = new RegExp(currentMarkerStr, "i");
          const nextRegex = new RegExp(nextMarkerStr, "i");
          const startMatch = allTrans.match(currentRegex);
          if (startMatch) {
            const contentStart = startMatch.index + startMatch[0].length;
            const nextMatch = allTrans.match(nextRegex);
            singleTrans = nextMatch
              ? allTrans.substring(contentStart, nextMatch.index)
              : allTrans.substring(contentStart);
          } else if (i === 0 && !allTrans.includes("#==#")) {
            singleTrans = allTrans;
          }
        }
        const cleanPattern = new RegExp(
          `\\[{1,2}\\d+\\]{1,2}[:：\\s\\n]*`,
          "g",
        );
        singleTrans = singleTrans.replace(cleanPattern, "").trim();
        if (singleTrans && item.singleKey) {
          const textToCompare = item.textForTranslation || item.text;
          const normalizedTrans = normalizeForCompare(singleTrans);
          const normalizedBase = normalizeForCompare(textToCompare);
          if (normalizedTrans !== normalizedBase) {
            idb.set({
              [item.singleKey]: {
                basic: singleTrans,
                timestamp: Date.now(),
                isFallback: res?.isFallback || false,
                isBatch: true,
              },
            });
          }
          this.applyResult(item, singleTrans, res?.isSameLang);
        } else {
          logger.warn("[Batcher] 该条目切分失败，降级单条重试", {
            index: i,
            text: item.text.slice(0, 30),
          });
          item.el.removeAttribute("data-translated");
          item.el.removeAttribute("data-translating");
          item.el.removeAttribute("data-mira-processing");
          _miraProcessingSet.delete(item.el);
          item.el._miraRetryCount = 0;
          item._singleRetry = true;
          item.forceRefresh = true;
          if (item.container && item.container.parentNode)
            item.container.remove();
          setTimeout(() => this.add(item, true), 500);
        }
      });
    } catch (err) {
      hasError = true;
      logger.error("[Batcher] 流程崩溃:", err);
      needTranslate.forEach((item) => {
        item.el.removeAttribute("data-mira-token");
        this.unlock(item.el);
        if (item.container?.parentNode) {
          const errorText = err.message || "Translation failed";
          const match = errorText.match(/400|401|402|403|404|429|500|502|503/);
          let displayMessage = "";
          if (match) {
            let errorCode = match[0];
            if (
              errorCode === "400" &&
              errorText.toLowerCase().includes("balance")
            )
              errorCode = "402";
            const friendlyMsg = getSafeMessage(`ERROR_${errorCode}`);
            displayMessage = friendlyMsg
              ? `${friendlyMsg} (Code: ${errorCode})`
              : `API Error (Code: ${errorCode})`;
          } else if (errorText.toLowerCase().includes("timeout")) {
            displayMessage =
              getSafeMessage("ERROR_TIMEOUT") || "Request Timeout";
          } else if (errorText.includes("ERROR_NOT_SIGNED_IN")) {
            displayMessage =
              getSafeMessage("ERROR_NOT_SIGNED_IN") || "Please sign in";
          } else {
            displayMessage =
              errorText.length < 100 ? errorText : "Translation failed";
          }
          item.container.innerText = `⚠ ${displayMessage}`;
          item.container.style.color = "#f87171";
          item.container.style.fontStyle = "italic";
          item.container.style.fontSize = "0.85em";
          item.container.classList.remove("kt-loading");
          // 标记 el，避免无限重试
          item.el.dataset.translated = "error";
          item.el.dataset.lastErrorTime = String(Date.now());
        }
      });
    } finally {
      this.finishProcessing(hasError);
    }
  },
  finishProcessing(hasError = false) {
    const cooldown = hasError ? 2000 : 50;
    setTimeout(() => {
      this.isProcessing = false;
      if (this.queue.length > 0) this.flush();
    }, cooldown);
  },
  applyResult(item, transContent, isSameLang) {
    const { el, container, text: originalText, linkMap } = item;
    const compareBase = item.textForTranslation || originalText;
    const normalizedTrans = normalizeForCompare(transContent);
    const normalizedBase = normalizeForCompare(compareBase);

    el.dataset.translated = "true";
    this.unlock(el);
    try {
      if (!transContent || isSameLang || normalizedTrans === normalizedBase) {
        if (
          transContent &&
          normalizedTrans === normalizedBase &&
          item.singleKey
        ) {
          idb.remove(item.singleKey).catch(() => { });
        }
        if (container && container.parentNode) container.remove();
        if (item._singleRetry) {
          el._miraSkippedHash = normalizedBase;
        }
        return;
      }
      container?.classList.remove("kt-loading");
      if (linkMap && Object.keys(linkMap).length > 0) {
        Object.keys(linkMap).forEach((idx) => {
          const pattern = new RegExp(
            `[\\(（]\\s*L${idx}\\s*[：:]\\s*([^)）]+?)\\s*[\\)）]`,
            "gi",
          );
          transContent = transContent.replace(
            pattern,
            (match, translatedText) => {
              if (linkMap[idx]) {
                linkMap[idx]._translatedText = translatedText.trim();
              }
              return `<a data-mira-link="${idx}"></a>`;
            },
          );
        });
      }
      transContent = transContent
        .replace(/[（(]\s*L\d+\s*[：:]\s*[）)]/g, "")
        .trim();
      const { mentionMap } = item;
      if (mentionMap && Object.keys(mentionMap).length > 0) {
        Object.keys(mentionMap).forEach((idx) => {
          const pattern = new RegExp(
            `[\\(（]\\s*M${idx}\\s*[：:]\\s*([^)）]+?)\\s*[\\)）]`,
            "gi",
          );
          transContent = transContent.replace(
            pattern,
            `<span data-mira-mention="${idx}"></span>`,
          );
        });
      }
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = transContent;
      const markedLinks = tempDiv.querySelectorAll("a[data-mira-link]");
      markedLinks.forEach((link) => {
        const idx = link.getAttribute("data-mira-link");
        const meta = linkMap[idx];
        if (meta) {
          link.href = meta.href;
          link.target = "_blank";
          let display = (
            linkMap[idx]._translatedText ||
            meta.textContent ||
            link.textContent ||
            ""
          ).replace(/^https?:\/\//i, "");

          // 只对看起来像 URL 的内容截断，译文不截断
          const looksLikeUrl =
            /^[\w\-\.\/]+$/.test(display) && !display.includes(" ");
          const LIMIT = 25;
          if (looksLikeUrl && display.length > LIMIT) {
            display = display.substring(0, LIMIT).replace(/\/$/, "") + "...";
          }

          link.textContent = display;
          link.style.cssText = `
      color: #1d9bf0 !important;
      display: inline !important;
      white-space: normal !important;
      font-size: inherit !important;
      letter-spacing: -0.2px !important;
    `;
        }
        link.removeAttribute("data-mira-link");
      });
      if (mentionMap && Object.keys(mentionMap).length > 0) {
        tempDiv
          .querySelectorAll("span[data-mira-mention]")
          .forEach((placeholder) => {
            const idx = placeholder.getAttribute("data-mira-mention");
            const meta = mentionMap[idx];
            if (meta) {
              placeholder.replaceWith(meta.node.cloneNode(true));
            }
          });
      }
      container.innerHTML = "";
      Array.from(tempDiv.childNodes).forEach((node) => {
        container.appendChild(node.cloneNode(true));
      });
      shrinkHeadingIfOverflow(container, el);
      container.style.fontStyle = "normal";
      container.style.color = "";
      container.dataset.translated = "true";
      if (typeof applyUserStyles === "function") {
        // 从 container 上读取之前存的字体大小
        const savedFontSize = container.dataset.inheritFontSize || null;
        applyUserStyles(container, null, savedFontSize);
      }
    } catch (e) {
      logger.error("[Batcher] 渲染出错:", e);
      if (container && container.parentNode) container.remove();
    }
  },
  unlock(el) {
    el.removeAttribute("data-mira-processing");
    el.removeAttribute("data-translating");
    _miraProcessingSet.delete(el);
  },
};
function handleTwitterMultiParagraph(container, forceRefresh) {
  if (!forceRefresh && container.dataset.translated === "true") return true;
  if (forceRefresh) {
    container
      .querySelectorAll(".kt-paragraph-translation")
      .forEach((n) => n.remove());
  }
  if (!forceRefresh && container.querySelector(".kt-paragraph-translation"))
    return true;
  const targetPrefix = (window.currentTargetL || "").toLowerCase().slice(0, 2);
  const isRTL = checkRTL(targetPrefix);
  const isAlreadyTargetLang = (text) => {
    if (forceRefresh) return false;
    const cleanText = text
      .replace(/@\w+/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/[（）\(\)]/g, "")
      .trim();
    if (cleanText.length < 1) return true;
    return detectIsAlreadyTarget(
      cleanText,
      window.currentTargetL || getBrowserLang() || "en",
    );
  };
  const atoms = [];
  function processNode(node) {
    if (!node) return;
    if (node.nodeType === 3) {
      node.textContent.split("\n").forEach((part, i, arr) => {
        atoms.push({ type: "text", content: part.trim() });
        if (i < arr.length - 1) atoms.push({ type: "break" });
      });
      return;
    }
    if (node.nodeType !== 1) return;
    if (node.classList?.contains("kt-paragraph-translation")) return;
    if (node.tagName === "BUTTON") return;
    if (node.nodeName === "A") {
      atoms.push({ type: "link", node: node });
    } else if (node.nodeName === "DIV" || node.nodeName === "SPAN") {
      const isMention =
        node.querySelector("a") && node.innerText.startsWith("@");
      if (isMention) {
        atoms.push({ type: "mention", node: node, text: node.innerText });
        atoms.push({ type: "text", content: node.innerText });
      } else {
        Array.from(node.childNodes).forEach(processNode);
        if (node.style && node.style.display === "block") {
          atoms.push({ type: "break" });
        }
      }
    }
  }
  Array.from(container.childNodes).forEach(processNode);
  const paragraphs = [];
  let current = { texts: [], links: [], mentions: [] };
  let emptyBreakCount = 0;
  const flushPara = (isBlankLine = false) => {
    const text = current.texts
      .filter((t) => t)
      .join(" ")
      .trim();
    if (
      text.length > 0 ||
      current.links.length > 0 ||
      current.mentions.length > 0
    ) {
      paragraphs.push({ ...current, text, isBlank: false });
    } else if (isBlankLine) {
      paragraphs.push({ text: "", isBlank: true, links: [], mentions: [] });
    }
    current = { texts: [], links: [], mentions: [] };
  };
  atoms.forEach((atom) => {
    if (atom.type === "break") {
      const hasContent =
        current.texts.some((t) => t) ||
        current.links.length > 0 ||
        current.mentions.length > 0;
      if (hasContent) {
        flushPara(false);
        emptyBreakCount = 0;
      } else {
        emptyBreakCount++;
        if (emptyBreakCount >= 1) flushPara(true);
      }
    } else if (atom.type === "text") {
      if (atom.content !== undefined) current.texts.push(atom.content);
    } else if (atom.type === "link") {
      current.links.push(atom.node);
    } else if (atom.type === "mention") {
      current.mentions.push(atom);
    }
  });
  flushPara(false);
  if (paragraphs.length <= 1) return false;
  const nodesToRemove = Array.from(container.childNodes).filter((node) => {
    if (node.classList?.contains("kt-paragraph-translation")) return false;
    if (node.tagName === "BUTTON") return false;
    return true;
  });
  nodesToRemove.forEach((n) => n.remove());
  paragraphs.forEach(({ text, links, mentions, isBlank }) => {
    if (!container || !container.parentNode) return;
    const newSpan = document.createElement("span");
    newSpan.style.display = "block";
    if (isBlank) {
      newSpan.innerHTML = "<br>";
      container.appendChild(newSpan);
      return;
    }
    newSpan.textContent = text;
    links.forEach((a) => {
      newSpan.appendChild(document.createTextNode(" "));
      newSpan.appendChild(a.cloneNode(true));
    });
    mentions.forEach((m) => {
      newSpan.appendChild(m.node.cloneNode(true));
    });
    container.appendChild(newSpan);
    let textForTranslation = text;
    const generatedLinkMap = {};
    const mentionMap = {};
    mentions.forEach((m, index) => {
      const placeholder = `(M${index}: ${m.text})`;
      textForTranslation = textForTranslation.replace(m.text, placeholder);
      mentionMap[index] = {
        node: m.node.cloneNode(true),
        text: m.text,
      };
    });
    links.forEach((a, index) => {
      if (!a) return;
      const placeholder = `(L${index}: ${a.textContent})`;
      if (
        textForTranslation.includes(a.textContent) &&
        a.textContent.length > 1
      ) {
        textForTranslation = textForTranslation.replace(
          a.textContent,
          placeholder,
        );
      } else {
        textForTranslation += ` ${placeholder}`;
      }
      generatedLinkMap[index] = {
        href: a.href,
        className: a.className,
        target: a.target || "_blank",
        textContent: a.textContent,
      };
    });
    textForTranslation = textForTranslation.replace(/→\s*$/, "").trim();
    if (isAlreadyTargetLang(textForTranslation)) return;
    if (textForTranslation.length < 2) return;
    const transContainer = document.createElement("div");
    transContainer.className = "kt-paragraph-translation";
    transContainer.style.setProperty("display", "block", "important");
    transContainer.style.setProperty("white-space", "pre-wrap", "important");
    transContainer.style.setProperty("margin-top", "2px", "important");
    transContainer.style.setProperty("margin-bottom", "8px", "important");
    transContainer.style.setProperty("line-height", "1.5", "important");
    if (isRTL) {
      transContainer.style.setProperty("direction", "rtl", "important");
      transContainer.style.setProperty("text-align", "right", "important");
    }
    transContainer.innerText = t("loading");
    transContainer.classList.add("kt-loading");
    container.appendChild(transContainer);
    TranslationBatcher.add(
      {
        el: newSpan,
        text: textForTranslation,
        container: transContainer,
        linkMap: generatedLinkMap,
        mentionMap: mentionMap,
      },
      forceRefresh,
    );
    newSpan.dataset.translating = "true";
  });
  container.dataset.translated = "true";
  return true;
}
function extractTextWithLinks(node, el, linkMap, textHolder) {
  if (node.nodeType === Node.TEXT_NODE) {
    const content = node.textContent;
    const isSequenceIndicator = /^\s*[\(\[]?\d+[\.\)\]]?\s*$/.test(content);
    if (isSequenceIndicator && el.childNodes.length > 1) return;
    textHolder.text += content;
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    if (node.tagName === "SCRIPT" || node.tagName === "STYLE") return;
    if (node.tagName === "SUP") return;
    if (node.classList?.contains("kt-paragraph-translation")) return;
    if (node.nodeName === "A") {
      const isCitation =
        node.closest("sup") || /^\s*\[\d+\]\s*$/.test(node.textContent);
      if (isCitation) return;
      const textContent = node.textContent.trim();
      if (textContent === "" && node.querySelector("img")) return;
      const idx = linkMap.length;
      linkMap.push({
        href: node.href,
        className: node.className,
        target: node.target,
        textContent,
      });
      textHolder.text += `(L${idx}: ${textContent})`;
      return;
    }
    if (node.tagName === "IMG" && node.alt) {
      const alt = node.alt.trim();
      if (alt.length > 0 && alt.length < 50 && !/^\d|stars|rating/i.test(alt)) {
        textHolder.text += alt;
      }
      return;
    }
    if (["UL", "OL", "P"].includes(node.tagName)) return;
    Array.from(node.childNodes).forEach((child) =>
      extractTextWithLinks(child, el, linkMap, textHolder),
    );
  }
}
function shouldSkipTextNode(node) {
  let el = node.parentElement;
  if (!el) return true;
  // 跳过不可见元素
  if (el.offsetParent === null && el.tagName !== 'BODY') return true;
  // 跳过脚本/样式
  if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT'].includes(el.tagName)) return true;
  // 跳过代码块
  if (el.closest('pre, code, [class*="highlight"], [class*="hljs"]')) return true;
  // 跳过已翻译
  if (el.closest('[data-translated="true"]')) return true;
  // 跳过译文容器本身
  if (el.closest('.kt-paragraph-translation')) return true;
  // 跳过可编辑区域
  if (el.isContentEditable || el.closest('[contenteditable="true"]')) return true;
  return false;
}

function startGenericTranslation() {
  if (!window.__mira_generic_covered) window.__mira_generic_covered = new Set();
  const coveredNodes = window.__mira_generic_covered;

  const domain = window.location.hostname.replace('www.', '');
  const customSelectors = window.__MIRA_SCAN_CONFIG?.custom?.[domain]?.selectors;
  const globalSelectors = window.__MIRA_SCAN_CONFIG?.global?.selectors;
  const blockSelector = customSelectors || globalSelectors || SiteRules.generic.selectors;

  const blockEls = document.querySelectorAll(blockSelector);


  blockEls.forEach(el => {
    if (shouldSkipTextNode({ parentElement: el })) return;
    const text = el.innerText?.trim();
    if (!text || text.length < 5) return;
    if (el.querySelector('.kt-paragraph-translation')) return;
    if (detectIsAlreadyTarget(text, window.currentTargetL || getBrowserLang())) return;

    const font = document.createElement('font');
    font.className = 'kt-paragraph-translation';
    font.dataset.forceInline = "false";
    font.style.setProperty('display', 'block', 'important');
    font.style.setProperty('margin-top', '4px', 'important');
    font.style.setProperty('color', 'gray', 'important');
    font.style.setProperty('font-style', 'italic', 'important');
    font.innerText = t('loading');
    el.appendChild(font);

    coveredNodes.add(el);
    el.querySelectorAll('*').forEach(child => coveredNodes.add(child));

    TranslationBatcher.add({ el, text, container: font, linkMap: [] });
  });

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while (node = walker.nextNode()) {
    const text = node.textContent.trim();
    if (text.length < 5) continue;
    if (shouldSkipTextNode(node)) continue;
    const el = node.parentElement;
    if (!el) continue;
    try {
      if (!el.matches(blockSelector) && !el.closest(blockSelector)) continue;
    } catch (e) { continue; }
    let ancestor = node.parentElement;
    let covered = false;
    while (ancestor && ancestor !== document.body) {
      if (coveredNodes.has(ancestor)) { covered = true; break; }
      ancestor = ancestor.parentElement;
    }
    if (covered) continue;
    nodes.push(node);
  }

  nodes.forEach(textNode => {
    const el = textNode.parentElement;
    if (!el) return;
    if (coveredNodes.has(el)) return;
    if (el.querySelector('.kt-paragraph-translation')) return;
    if (detectIsAlreadyTarget(textNode.textContent.trim(), window.currentTargetL || getBrowserLang())) return;

    const font = document.createElement('font');
    font.className = 'kt-paragraph-translation';
    font.style.setProperty('display', 'inline', 'important');
    font.style.setProperty('margin-left', '4px', 'important');
    font.style.setProperty('color', 'gray', 'important');
    font.style.setProperty('font-style', 'italic', 'important');
    font.innerText = t('loading');
    textNode.parentNode.insertBefore(font, textNode.nextSibling);
    TranslationBatcher.add({ el, text: textNode.textContent.trim(), container: font, linkMap: [] });
  });
}
const _miraProcessingSet = new WeakSet();
async function handleTranslateElement(el, forceRefresh = false) {

  //排除逻辑
  if (el.tagName === "LI") {
    if (el.classList.contains("a-carousel-card") || el.closest(".a-carousel")) {
      el.dataset.translated = "true";
      el.removeAttribute("data-mira-processing");
      _miraProcessingSet.delete(el);
      return;
    }
    const rawText = el.innerText?.trim() || "";
    const hasSubMenu = !!el.querySelector(
      '.jet-sub-mega-menu, .sub-menu, .dropdown-menu, [class*="mega-menu"]',
    );
    const isTooLong = rawText.length > 500;
    if (hasSubMenu || isTooLong) {
      el.dataset.translated = "true";
      el.removeAttribute("data-mira-processing");
      _miraProcessingSet.delete(el);
      return;
    }
    const liStyle = window.getComputedStyle(el);
    const liIsFlex = ["flex", "inline-flex"].includes(liStyle.display);
    const hasMultipleBlockChildren =
      el.querySelectorAll(":scope > div, :scope > section, :scope > article")
        .length > 1;
    if (liIsFlex && hasMultipleBlockChildren) {
      el.dataset.translated = "true";
      el.removeAttribute("data-mira-processing");
      _miraProcessingSet.delete(el);
      return;
    }
  }
  // LinkedIn profile 名字在 h2 里是纯文本节点，跳过
  if (location.hostname.includes("linkedin.com") && el.tagName === "H2") {
    const hasOnlyText = el.children.length === 0 && el.childNodes.length === 1 && el.childNodes[0].nodeType === 3;
    if (hasOnlyText) {
      el.dataset.translated = "true";
      el.removeAttribute("data-mira-processing");
      _miraProcessingSet.delete(el);
      return;
    }
  }
  if (el.closest(".mira-kt-panel, .mira-font-family")) {
    el.dataset.translated = "true";
    el.removeAttribute("data-mira-processing");
    _miraProcessingSet.delete(el);
    return;
  }
  if (el.tagName === "SPAN" && el.parentElement) {
    const parentDisplay = window.getComputedStyle(el.parentElement).display;
    if (parentDisplay === "flex" || parentDisplay === "inline-flex") {
      // 这个 span 是 flex 子项，跳过，交给父元素处理
      el.dataset.translated = "true";
      el.removeAttribute("data-mira-processing");
      _miraProcessingSet.delete(el);
      return;
    }
    const parentTag = el.parentElement.tagName;
    if (["H1", "H2", "H3"].includes(parentTag)) {
      el.dataset.translated = "true";
      return;
    }
  }
  if (
    el.tagName === "TR" ||
    el.tagName === "TABLE" ||
    (el.closest("table") &&
      ["DIV", "SPAN"].includes(el.tagName) &&
      el.querySelectorAll("td, th").length > 0)
  ) {
    el.dataset.translated = "true";
    el.removeAttribute("data-mira-processing");
    _miraProcessingSet.delete(el);
    return;
  }
  if (
    el.isContentEditable ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "INPUT" ||
    el.closest('[contenteditable="true"]') ||
    el.closest("textarea") ||
    el.closest("input")
  ) {
    return;
  }
  if (el.querySelector("script, style")) {
    el.dataset.translated = "true";
    el.removeAttribute("data-mira-processing");
    _miraProcessingSet.delete(el);
    return;
  }
  // wikipedia 维基百科的代码块很多都是用 class 包裹的，而不是 pre/code 标签， 特殊处理 
  // wikipedia 维基百科的法语版本不会翻译的问题
  const isWikipedia = location.hostname.includes("wikipedia.org");

  const isCodeBlock = el.closest('pre, code, [class*="highlight"], [class*="hljs"]');
  const isClassCode = !isWikipedia && el.closest('[class*="code"]');

  if (isCodeBlock || isClassCode) {
    if (isWikipedia && !el.closest('pre, code')) {
    } else {
      el.dataset.translated = "true";
      el.removeAttribute("data-mira-processing");
      _miraProcessingSet.delete(el);
      return;
    }
  }
  const isYoutube = location.hostname.includes("youtube.com");
  const isTwitter = location.hostname.includes("x.com");
  const isAmazon = location.hostname.includes("amazon.com");
  const isFacebook = location.hostname.includes("facebook.com");
  const isInstagram = location.hostname.includes("instagram.com");
  const useInlineMode = !SiteRules.hasRule(location.hostname);
  const isIndependent = ["P", "LI"].includes(el.tagName);
  const parentH1 = isYoutube ? el.closest("h1") : null;

  //youtube的 yt-lockup-metadata-view-model__title 改成 ytLockupMetadataViewModelTitle 或 ytLockupMetadataViewModelHeadingReset了，先兼容一下
  const youtubeListTitleLink = isYoutube
    ? el.closest(".yt-lockup-metadata-view-model__title") ||
    el.closest(".ytLockupMetadataViewModelTitle") ||
    el.closest(".ytLockupMetadataViewModelHeadingReset")
    : null;
  //排除逻辑
  const isHN = location.hostname.includes("news.ycombinator.com");
  const isGitHub = location.hostname.includes("github.com");
  const isTemu = location.hostname.includes("temu.com");
  const isSteamCommunity = location.hostname.includes("steamcommunity.com");
  if (isTemu) {
    if (el.classList.contains("HZ_BBbqn") || el.closest(".HZ_BBbqn")) {
      el.dataset.translated = "true";
      el.removeAttribute("data-mira-processing");
      _miraProcessingSet.delete(el);
      return;
    }
    if (el.classList.contains("_25g_jM0z") && !el.closest(".NhsUfVvY")) {
      el.dataset.translated = "true";
      el.removeAttribute("data-mira-processing");
      _miraProcessingSet.delete(el);
      return;
    }
  }
  const isAmazon_early = location.hostname.includes("amazon.");
  if (isAmazon_early) {
    if (el.closest('.a-carousel, .a-carousel-card, [class*="p13n-sc"]')) {
      el.dataset.translated = "true";
      el.removeAttribute("data-mira-processing");
      _miraProcessingSet.delete(el);
      return;
    }
  }
  const fastRawText = Array.from(el.childNodes)
    .filter((n) => {
      if (n.nodeType === Node.ELEMENT_NODE) {
        return !n.classList.contains("kt-paragraph-translation");
      }
      return n.nodeType === Node.TEXT_NODE;
    })
    .map((n) => n.textContent || "")
    .join("")
    .replace(/[ \t]+/g, " ")
    .trim();
  //youtube 排除列表
  if (isYoutube && el) {
    const isExcluded = el.closest(`
    .yt-content-metadata-view-model__metadata-row,
    .yt-content-metadata-view-model__metadata-text,
    ytd-video-owner-renderer #channel-name,
    .ytd-channel-name,
    ytd-guide-entry-renderer,
    #guide-section-title,
    ytd-active-account-header-renderer,
    ytd-multi-page-menu-renderer,
    #header-description,
    ytd-playlist-panel-video-renderer,
    #info-container,
    ytd-comments-header-renderer,
    ytd-video-owner-renderer
  `);
    if (isExcluded) {
      el.querySelectorAll(".kt-paragraph-translation").forEach((t) =>
        t.remove(),
      );
      el.dataset.translated = "true";
      el.removeAttribute("data-mira-processing");
      _miraProcessingSet.delete(el);
      return;
    }

    // 防止同一个标题被重复翻译（Shorts 和普通视频卡片）
    const parentH3 = el.closest("h3");
    if (parentH3) {
      const h3Next = parentH3.nextElementSibling;
      if (h3Next?.classList?.contains("kt-paragraph-translation")) {
        el.dataset.translated = "true";
        el.removeAttribute("data-mira-processing");
        _miraProcessingSet.delete(el);
        return;
      }
    }
  }
  if (isGitHub) {
    const isGitHubUI =
      el.closest("header.AppHeader") ||
      el.closest("nav") ||
      el.closest('[role="navigation"]') ||
      el.closest(".pagehead-actions") ||
      el.closest(".file-navigation") ||
      el.closest(".Box-header") ||
      (el.closest("aside") && !el.closest(".dashboard-changelog")) ||
      el.closest('[aria-label*="workflow"]') ||
      el.closest(".ActionList") ||
      el.closest(
        'a[aria-label*="skipped"], a[aria-label*="failed"], a[aria-label*="success"]',
      ) ||
      el.tagName === "BUTTON" ||
      el.tagName === "RELATIVE-TIME" ||
      /^[\w.\-]+\/[\w.\-]+$/.test(fastRawText.trim());
    if (isGitHubUI) {
      el.querySelectorAll(".kt-paragraph-translation").forEach((t) =>
        t.remove(),
      );
      el.dataset.translated = "true";
      el.removeAttribute("data-mira-processing");
      _miraProcessingSet.delete(el);
      return;
    }
  }
  if (!forceRefresh) {
    if (
      detectIsAlreadyTarget(
        fastRawText,
        window.currentTargetL || getBrowserLang(),
      )
    ) {
      el.dataset.translated = "true";
      return;
    }
  }

  // 检查祖先元素是否已翻译过, 避免重复（仅 YouTube）
  if (!forceRefresh && isYoutube) {
    let ancestor = el.parentElement;
    let depth = 0;
    while (ancestor && ancestor !== document.body && depth < 3) {
      if (
        ancestor.querySelector(":scope > .kt-paragraph-translation") ||
        ancestor.nextElementSibling?.classList?.contains(
          "kt-paragraph-translation",
        ) ||
        ancestor.dataset.translated === "true"
      ) {
        el.dataset.translated = "true";
        return;
      }
      ancestor = ancestor.parentElement;
      depth++;
    }
  }
  if (!forceRefresh) {
    if (
      el.dataset.translated === "true" ||
      el.dataset.transSkipped === "true" ||
      el.dataset.translating === "true" ||
      el.hasAttribute("data-mira-processing") ||
      _miraProcessingSet.has(el)
    )
      return;
  } else if (el.dataset.translated === "error") {
    const lastError = parseInt(el.dataset.lastErrorTime || 0);
    if (Date.now() - lastError < 30000) return; // 30秒内不重试
  } else {
    if (
      el.dataset.translating === "true" ||
      el.hasAttribute("data-mira-processing")
    )
      return;
  }
  if (isHN) {
    if (el.querySelector(".titleline")) {
      const actualTitle = el.querySelector(".titleline");
      return handleTranslateElement(actualTitle, forceRefresh);
    }
    if (el.classList.contains("rank")) return;
  }
  if (isFacebook) {
    const isFacebookUI =
      el.closest("nav") ||
      el.closest('[role="navigation"]') ||
      el.closest(".xh8ybd") || // Facebook nav
      el.closest('[aria-label*="menu"]') ||
      el.closest('[aria-label*="Search"]') ||
      el.closest('[role="menuitem"]') ||
      el.closest('[role="button"]') ||
      el.closest("header") ||
      el.closest('[data-testid="side_rail_section"]') || // Facebook sidebar
      el.closest(
        '[data-testid="feed_stream_container"] [role="article"] .xvq74 .xjbqb8a [role="button"]',
      ) || // Like/comment buttons
      (el.closest('[role="article"]') && el.querySelector("svg")) ||
      el.tagName === "BUTTON" ||
      (el.tagName === "A" && el.getAttribute("role") === "menuitem");
    if (isFacebookUI) {
      el.dataset.translated = "true";
      return;
    }
  }
  //  跳过社交平台用户名链接不过滤 span 里的文字
  if (el.tagName === "A") {
    const isSocial =
      location.hostname.includes("facebook.com") ||
      location.hostname.includes("instagram.com");
    if (isSocial) {
      const href = el.getAttribute("href") || "";
      const text = el.textContent?.trim() || "";
      const looksLikeUsername =
        /^\/[\w.]+\/?$/.test(href) && !text.includes(" ") && text.length < 30;
      if (looksLikeUsername) {
        el.dataset.translated = "true";
        return;
      }
    }
  }

  // 同时检查父元素是否是只包含用户名链接的 div
  if ((isFacebook || isInstagram) && el.tagName === "DIV") {
    const onlyLink = el.children.length === 1 && el.children[0].tagName === "A";
    if (onlyLink) {
      const href = el.children[0].getAttribute("href") || "";
      const text = el.children[0].textContent?.trim() || "";
      const looksLikeUsername =
        /^\/[\w.]+\/?$/.test(href) && !text.includes(" ") && text.length < 30;
      if (looksLikeUsername) {
        el.dataset.translated = "true";
        el.children[0].dataset.translated = "true";
        return;
      }
    }
  }

  // 处理 Twitter Article 页面
  if (isTwitter && (
    el.classList?.contains("public-DraftStyleDefault-block") ||
    el.classList?.contains("longform-header-two")
  )) {
    const text = el.innerText?.trim();
    if (!text || text.length < 3) return;
    if (detectIsAlreadyTarget(text, window.currentTargetL || getBrowserLang())) return;
    if (!forceRefresh && el.dataset.translated === "true") return;
    if (el.dataset.translating === "true") return;
    el.dataset.translating = "true";
    const transContainer = document.createElement("div");
    transContainer.className = "kt-paragraph-translation";
    transContainer.style.setProperty("display", "block", "important");
    transContainer.style.setProperty("white-space", "pre-wrap", "important");
    transContainer.style.setProperty("margin-top", "4px", "important");
    transContainer.style.setProperty("line-height", "1.5", "important");
    transContainer.style.setProperty("color", "gray", "important");
    transContainer.style.setProperty("font-style", "italic", "important");
    transContainer.innerText = t("loading");
    el.insertAdjacentElement("afterend", transContainer);
    TranslationBatcher.add(
      { el: el, text: text, container: transContainer, linkMap: [] },
      forceRefresh
    );
    return;
  }
  if (isTwitter) {
    const isSystemUI =
      ((el.matches('[role="heading"]') || el.closest('[role="heading"]')) &&
        !el.closest('[data-testid="tweetText"]')) ||
      el.closest('[data-testid="AppTabBar"]') ||
      el.closest('[data-testid="TopNavBar"]') ||
      el.closest('[data-testid="SearchBox"]') ||
      el.closest('[role="tab"]') ||
      el.closest(".r-bt1l66") ||
      el.closest('[data-testid="User-Name"]') ||
      el.closest('[data-testid="pillLabel"]') ||
      el.closest('a[href*="followers_you_follow"]') ||
      (el.closest("h2") && !el.closest("h2.longform-header-two")) ||
      (el.closest('[data-testid="cellInnerDiv"]') &&
        !el.closest('[data-testid="tweetText"]') &&
        !el.closest('[data-testid="UserDescription"]') &&
        !el.closest('[data-testid="trend"]') &&
        !el.closest('[data-testid="trendMetadata"]') &&
        !el.closest('[data-editor]'));
    if (isSystemUI) {
      el.dataset.translated = "true";
      return;
    }

    const isNewsMeta =
      /^\d+\s+(hour|day|minute|week)s?\s+ago\s*·/.test(fastRawText) ||
      /^(Trending now|Just now)\s*·/.test(fastRawText) ||
      /·\s*Trending/.test(fastRawText);
    if (isNewsMeta) {
      el.dataset.translated = "true";
      return;
    }
    const twitterTextContainer = el.closest(
      '[data-testid="tweetText"], [data-testid="UserDescription"]',
    );
    if (twitterTextContainer && el !== twitterTextContainer) {
      if (
        !twitterTextContainer.dataset.translating &&
        !twitterTextContainer.dataset.translated
      ) {
        handleTranslateElement(twitterTextContainer, forceRefresh);
      }
      return;
    }
    if (
      el === twitterTextContainer ||
      el.matches?.('[data-testid="tweetText"]')
    ) {
      const handled = handleTwitterMultiParagraph(el, forceRefresh);
      if (handled) return;
    }
    if (
      el.classList?.contains("public-DraftStyleDefault-block") ||
      el.classList?.contains("longform-header-two")
    ) {
      const text = el.innerText?.trim();
      if (!text || text.length < 3) return;
    }
  }
  const isSubListItem =
    el.tagName === "LI" && !!el.closest("ul")?.parentElement?.closest("li");
  if (!isIndependent && !isSubListItem && el.parentElement) {
    const isAmazonReviewSpan =
      isAmazon && !!el.closest('[data-hook="review-collapsed"]');
    const isTrendTitle = isTwitter && !!el.closest('[data-testid="trend"]');
    const isAmazonCarouselTitle = isAmazon && el.tagName === "SPAN";
    const isInlineSpan = useInlineMode && el.tagName === "SPAN";

    if (
      !isAmazonReviewSpan &&
      !isTrendTitle &&
      !isAmazonCarouselTitle &&
      !isInlineSpan &&
      el.parentElement.closest(
        '[data-translating="true"], [data-translated="true"]',
      )
    ) {
      return;
    }
  }
  if (!forceRefresh && el.querySelector(".kt-paragraph-translation")) {
    el.dataset.translated = "true";
    return;
  }
  const isYoutubeCustomTag =
    isYoutube && el.tagName.toLowerCase().startsWith("yt-");
  let mountTarget = el;
  if (isTwitter) {
    mountTarget =
      el.closest(
        '[data-testid="tweetText"], [data-testid="UserDescription"]',
      ) || el;
  }
  const existingContainer = el.querySelector(
    ":scope > .kt-paragraph-translation",
  );
  const nextSiblingContainer = el.nextElementSibling?.classList?.contains(
    "kt-paragraph-translation",
  )
    ? el.nextElementSibling
    : null;
  const titleContainerSibling =
    youtubeListTitleLink?.nextElementSibling?.classList?.contains(
      "kt-paragraph-translation",
    )
      ? youtubeListTitleLink.nextElementSibling
      : null;
  if (
    !forceRefresh &&
    (existingContainer || nextSiblingContainer || titleContainerSibling)
  ) {
    el.dataset.translated = "true";
    el.removeAttribute("data-translating");
    el.removeAttribute("data-mira-processing");
    _miraProcessingSet.delete(el);
    return;
  }
  const linkMap = [];
  const textHolder = { text: "" };
  el.childNodes.forEach((node) =>
    extractTextWithLinks(node, el, linkMap, textHolder),
  );
  const textWithPlaceholders = textHolder.text;
  const originalText = textWithPlaceholders.replace(/[ \t]+/g, " ").trim();
  const rule = SiteRules.getRule(location.hostname);
  const minLen = rule?.minLen !== undefined ? rule?.minLen : 2;
  if (originalText.length < minLen) {
    el.removeAttribute("data-translating");
    el.removeAttribute("data-mira-processing");
    _miraProcessingSet.delete(el);
    return;
  }
  if (/^(@\w+\s*)+$/.test(originalText.trim())) {
    el.dataset.translated = "true";
    el.removeAttribute("data-translating");
    el.removeAttribute("data-mira-processing");
    _miraProcessingSet.delete(el);
    return;
  }
  if (!forceRefresh) {
    if (
      detectIsAlreadyTarget(
        originalText,
        window.currentTargetL || getBrowserLang(),
      )
    ) {
      el.dataset.translated = "true";
      el.removeAttribute("data-translating");
      el.removeAttribute("data-mira-processing");
      _miraProcessingSet.delete(el);
      const oldContainer = el.querySelector(".kt-paragraph-translation");
      if (oldContainer) oldContainer.remove();
      return;
    }
    const currentHash = normalizeForCompare(originalText);
    if (el._miraSkippedHash && el._miraSkippedHash === currentHash) {
      el.dataset.translated = "true";
      el.removeAttribute("data-translating");
      el.removeAttribute("data-mira-processing");
      _miraProcessingSet.delete(el);
      return;
    }
  }

  el.dataset.translating = "true";
  el.setAttribute("data-mira-processing", "true");
  _miraProcessingSet.add(el);
  let transContainer = existingContainer;
  if (!transContainer) {
    const useSpan =
      useInlineMode && !["H1", "H2", "H3", "H4", "P"].includes(el.tagName);
    if (useSpan) {
      transContainer = document.createElement("span");
    } else {
      transContainer = document.createElement("div");
    }
    transContainer.className = "kt-paragraph-translation";
    transContainer.style.setProperty(
      "display",
      useInlineMode ? "inline" : "block",
      "important",
    );
    transContainer.style.setProperty("white-space", "pre-wrap", "important");
    transContainer.innerText = t("loading");
    transContainer.style.color = "gray";
    transContainer.style.fontStyle = "italic";
  }
  const targetPrefix = (window.currentTargetL || "").toLowerCase().slice(0, 2);
  const isRTL = checkRTL(targetPrefix);
  if (isRTL) {
    transContainer.style.setProperty("direction", "rtl", "important");
    transContainer.style.setProperty("text-align", "right", "important");
    transContainer.style.setProperty("line-height", "1.6", "important");
  } else {
    transContainer.style.setProperty("direction", "ltr", "important");
    transContainer.style.setProperty("text-align", "left", "important");
    transContainer.style.setProperty("line-height", "1.4", "important");
  }
  if (!existingContainer) {
    const isAmazon = location.hostname.includes("amazon.");
    const isReddit = location.hostname.includes("reddit.com");
    const isWiki = location.hostname.includes("wikipedia.org");
    const isGoogle = location.hostname.includes("google.com");
    const isTemu = location.hostname.includes("temu.com");
    const isFB = location.hostname.includes("facebook.com");
    const finalCheckNode = isYoutube
      ? parentH1 || youtubeListTitleLink || el
      : mountTarget;
    if (!forceRefresh && isYoutube) {
      const ytNextSibling = finalCheckNode.nextElementSibling;
      if (ytNextSibling?.classList?.contains("kt-paragraph-translation")) {
        el.dataset.translated = "true";
        el.removeAttribute("data-translating");
        el.removeAttribute("data-mira-processing");
        _miraProcessingSet.delete(el);
        return;
      }
    }
    if (isYoutube && (parentH1 || youtubeListTitleLink)) {
      //youtube 的linkedList的标题改了, 兼容
      applyLayoutFix(
        "youtube-layout-fix",
        `
        ytd-watch-metadata h1.style-scope.ytd-watch-metadata { height: auto !important; max-height: none !important; display: block !important; }
        .yt-lockup-metadata-view-model__title-container,
        .ytLockupMetadataViewModelTitle,
        .ytLockupMetadataViewModelHeadingReset,
        .yt-lockup-view-model__metadata,
        .yt-lockup-metadata-view-model__heading-reset {
          height: auto !important;
          max-height: none !important;
          overflow: visible !important;
          display: block !important;
        }
        .kt-paragraph-translation { display: block !important; clear: both !important; width: 100% !important; position: relative !important; }
        .kt-paragraph-translation a { text-decoration: inherit !important; color: inherit !important; }
      `,
      );
      finalCheckNode.insertAdjacentElement("afterend", transContainer);
    } else if (
      el.tagName === "LI" &&
      (el.closest('nav, [class*="sidebar"], [id*="sidebar"]') ||
        (el.querySelector(":scope > a") &&
          !el.querySelector(
            ":scope > p, :scope > div:not(.kt-paragraph-translation)",
          )))
    ) {
      const textDiv =
        el.querySelector("a > div > div:first-child") ||
        el.querySelector('[class*="nav-text"]') ||
        el.querySelector(
          '[class*="menu-title"] span, [class*="nav-title"] span',
        ) ||
        null;
      if (textDiv) {
        textDiv.appendChild(transContainer);
        transContainer.style.setProperty("display", "block", "important");
        transContainer.style.setProperty("margin-top", "2px", "important");
        transContainer.style.setProperty("padding-left", "0", "important");
        transContainer.style.setProperty("font-size", "0.9em", "important");
      } else {
        el.appendChild(transContainer);
        transContainer.style.setProperty("display", "block", "important");
        transContainer.style.setProperty("margin-top", "2px", "important");
        transContainer.style.setProperty("margin-left", "0", "important");
        transContainer.style.setProperty("padding-left", "0", "important");
        transContainer.style.setProperty("font-size", "0.9em", "important");
      }
    } else if (el.tagName === "TD") {
      el.appendChild(transContainer);
      transContainer.style.setProperty("display", "block", "important");
      transContainer.style.setProperty("margin-top", "4px", "important");
      transContainer.style.setProperty("padding-top", "4px", "important");
      transContainer.style.setProperty(
        "border-top",
        "1px dashed rgba(128,128,128,0.3)",
        "important",
      );
      transContainer.style.setProperty("font-size", "0.85em", "important");
      transContainer.style.setProperty("line-height", "1.4", "important");
      transContainer.style.setProperty("white-space", "normal", "important");
      transContainer.style.setProperty("word-break", "break-word", "important");
      transContainer.style.setProperty("width", "100%", "important");
      transContainer.style.setProperty("max-width", "100%", "important");
      transContainer.style.setProperty("box-sizing", "border-box", "important");
    } else if (isGoogle) {
      el.appendChild(transContainer);
      transContainer.style.setProperty("display", "block", "important");
      transContainer.style.setProperty("margin-top", "4px", "important");
      transContainer.style.setProperty("font-weight", "normal", "important");
      const lineClampParent = el.closest('[style*="-webkit-line-clamp"]') || el;
      lineClampParent.style.setProperty(
        "-webkit-line-clamp",
        "unset",
        "important",
      );
      lineClampParent.style.setProperty("display", "block", "important");
      lineClampParent.style.setProperty("overflow", "visible", "important");
    } else if (isTemu && el.classList.contains("_25g_jM0z")) {
      const outerFlex = el.closest(".NhsUfVvY");
      const innerWrapper = el.closest("._1Zf27vaY");

      if (outerFlex && innerWrapper) {
        outerFlex.style.setProperty("display", "block", "important");
        innerWrapper.appendChild(transContainer);
      } else {
        el.insertAdjacentElement("afterend", transContainer);
      }
      transContainer.style.setProperty("display", "block", "important");
      transContainer.style.setProperty("width", "100%", "important");
      transContainer.style.setProperty("margin-top", "4px", "important");
    } else if (isAmazon) {
      if (el.id === "productTitle") {
        Array.from(el.childNodes).forEach((node) => {
          if (node.nodeType === 3) node.textContent = node.textContent.trim();
        });
        el.insertAdjacentElement("afterend", transContainer);
      } else {
        const expanderContainer = el.closest(".a-expander-container");
        if (expanderContainer) {
          expanderContainer.insertAdjacentElement("afterend", transContainer);
        } else {
          el.appendChild(transContainer);
        }
      }
      if (el.closest("#featurebullets_feature_div")) {
        transContainer.style.setProperty("margin-top", "2px", "important");
        transContainer.style.setProperty("margin-bottom", "4px", "important");
      }
      if (
        el.closest(
          '.a-carousel-card, .a-truncate, .p13n-sc-uncoverable-faceout, [class*="prodInfo"], [class*="twoAsinsProductDetail"], li.p13n-intuition-product-grid__grid-item',
        ) ||
        (el.closest(".a-list-item") &&
          !el.closest('[data-hook="review-collapsed"]') &&
          !el.closest('[data-hook="review-body"]'))
      ) {
        if (transContainer.parentNode)
          transContainer.parentNode.removeChild(transContainer);
        el.insertAdjacentElement("afterend", transContainer);

        transContainer.style.setProperty("display", "block", "important");
        transContainer.style.setProperty("position", "relative", "important");
        transContainer.style.setProperty("clear", "both", "important");
        transContainer.style.setProperty("width", "100%", "important");
        transContainer.style.setProperty("margin-top", "20px", "important");
        transContainer.style.setProperty("z-index", "1", "important");

        el.style.setProperty("height", "auto", "important");
        el.style.setProperty("max-height", "none", "important");
        el.style.setProperty("overflow", "visible", "important");

        let parent = el.parentElement;
        for (let i = 0; i < 12 && parent && parent !== document.body; i++) {
          parent.style.setProperty("height", "auto", "important");
          parent.style.setProperty("max-height", "none", "important");
          parent.style.setProperty("overflow", "visible", "important");
          parent.style.setProperty("-webkit-line-clamp", "unset", "important");
          parent = parent.parentElement;
        }
      }
    } else if (isReddit) {
      const redditTitle =
        el.tagName === "H1" ||
        el.tagName === "H2" ||
        el.tagName === "H3" ||
        el.id.includes("post-title");
      if (redditTitle) {
        // 解除 line-clamp 和 overflow 限制
        el.style.setProperty("-webkit-line-clamp", "unset", "important");
        el.style.setProperty("overflow", "visible", "important");
        el.style.setProperty("display", "block", "important");
        el.style.setProperty("max-height", "none", "important");
        // 同时处理父元素
        let parent = el.parentElement;
        for (let i = 0; i < 3 && parent && parent !== document.body; i++) {
          parent.style.setProperty("overflow", "visible", "important");
          parent.style.setProperty("max-height", "none", "important");
          parent = parent.parentElement;
        }
        el.appendChild(transContainer);
        transContainer.style.setProperty("display", "block", "important");
        transContainer.style.setProperty("margin-top", "8px", "important");
        transContainer.style.setProperty("font-weight", "normal", "important");
      } else {
        el.appendChild(transContainer);
      }
    } else if (isWiki) {
      const isHeading = ["H1", "H2", "H3", "H4"].includes(el.tagName);
      const isCaption = el.tagName === "FIGCAPTION";
      if (isCaption) {
        el.appendChild(transContainer);
        transContainer.style.setProperty("display", "block", "important");
        transContainer.style.setProperty("width", "100%", "important");
        transContainer.style.setProperty("margin-top", "4px", "important");
      } else if (isHeading) {
        el.appendChild(transContainer);
      } else {
        el.insertAdjacentElement("afterend", transContainer);
        transContainer.style.setProperty("display", "flow-root", "important");
        transContainer.style.setProperty("width", "100%", "important");
      }
      transContainer.style.setProperty("clear", "none", "important");
    } else if (isYoutube) {
      // 找到最近的块级容器，避免插入到 <a> 内部
      let insertTarget = finalCheckNode;
      while (insertTarget && insertTarget.closest("a")) {
        insertTarget = insertTarget.closest("a").parentElement;
      }
      (insertTarget || finalCheckNode).insertAdjacentElement(
        "afterend",
        transContainer,
      );
    } else if (el.tagName === "P") {
      const pStyle = window.getComputedStyle(el);
      const pIsFlex = ["flex", "inline-flex"].includes(pStyle.display);
      if (pIsFlex) {
        // P 是 flex 容器，让译文换行占满整行
        el.style.setProperty("flex-wrap", "wrap", "important");
        transContainer.style.setProperty("flex-basis", "100%", "important");
        transContainer.style.setProperty("width", "100%", "important");
        transContainer.style.setProperty("margin-top", "4px", "important");
      }
      el.appendChild(transContainer);
    } else if (isHN) {
      const titleLine = el.closest(".titleline");
      if (titleLine) {
        titleLine.insertAdjacentElement("afterend", transContainer);
        transContainer.style.display = "block";
        transContainer.style.marginTop = "4px";
      } else {
        const firstP = el.querySelector("p");
        if (firstP && el.tagName !== "P") {
          el.insertBefore(transContainer, firstP);
        } else {
          el.appendChild(transContainer);
        }
      }
    } else if (isTwitter) {
      const lineClampParent = mountTarget.closest
        ? mountTarget.closest(
          '[data-testid^="news_sidebar_article"] div[dir="ltr"]',
        )
        : null;

      const trendLineClamp = el.closest(
        '[data-testid="trend"] div[dir="ltr"][style*="line-clamp"]',
      );
      const trendKeyword =
        !trendLineClamp && el.closest('[data-testid="trend"]')
          ? el.closest(
            '[data-testid="trend"] div[dir="ltr"]:not([style*="line-clamp"])',
          )
          : null;
      const placementTrackingTitle = el.closest(
        '[data-testid="placementTracking"] button div[style*="line-clamp"]',
      );
      if (trendLineClamp) {
        trendLineClamp.insertAdjacentElement("afterend", transContainer);
      } else if (trendKeyword) {
        trendKeyword.insertAdjacentElement("afterend", transContainer);
      } else if (placementTrackingTitle) {
        placementTrackingTitle.style.setProperty(
          "-webkit-line-clamp",
          "unset",
          "important",
        );
        placementTrackingTitle.style.setProperty(
          "overflow",
          "visible",
          "important",
        );
        placementTrackingTitle.style.setProperty(
          "display",
          "block",
          "important",
        );
        placementTrackingTitle.insertAdjacentElement(
          "afterend",
          transContainer,
        );
      } else if (lineClampParent) {
        lineClampParent.insertAdjacentElement("afterend", transContainer);
      } else {
        mountTarget.insertAdjacentElement("afterend", transContainer);
      }
      transContainer.style.display = "block";
      transContainer.style.marginTop = "8px";
      transContainer.style.setProperty("white-space", "pre-wrap", "important");
      transContainer.style.setProperty("line-height", "1.5", "important");
    }
    else if (isSteamCommunity) {
      if (el.classList.contains("forum_topic_name")) {
        el.appendChild(transContainer);
        transContainer.style.setProperty("display", "inline", "important");
        transContainer.style.setProperty("font-size", "0.9em", "important");
        transContainer.style.setProperty("margin-left", "6px", "important");
        transContainer.style.setProperty("clear", "none", "important");
        transContainer.style.setProperty("width", "auto", "important");
      } else {
        el.appendChild(transContainer);
        transContainer.style.setProperty("display", "block", "important");
        transContainer.style.setProperty("margin-top", "4px", "important");
        transContainer.style.setProperty("margin-bottom", "0", "important");
      }
    } else if (isGitHub) {
      if (
        el.tagName === "A" &&
        el.className.includes("IssuePullRequestTitle")
      ) {
        const container =
          el.closest('[class*="Title-module__container"]') ||
          el.parentElement ||
          el;
        container.appendChild(transContainer);
        transContainer.style.setProperty("display", "block", "important");
        transContainer.style.setProperty("margin-top", "2px", "important");
        transContainer.style.setProperty("font-weight", "normal", "important");
      } else if (el.classList.contains("markdown-title")) {
        const h1 = el.closest("h1") || el.parentElement || el;
        h1.appendChild(transContainer);
        transContainer.style.setProperty("display", "block", "important");
        transContainer.style.setProperty("margin-top", "8px", "important");
        transContainer.style.setProperty("font-weight", "normal", "important");
        transContainer.style.setProperty("font-size", "0.85em", "important");
      } else if (el.closest("h1.heading-element")) {
        const h1 = el.closest("h1.heading-element");
        h1.appendChild(transContainer);
        transContainer.style.setProperty("display", "block", "important");
        transContainer.style.setProperty("margin-top", "8px", "important");
        transContainer.style.setProperty("font-weight", "normal", "important");
      } else if (el.closest(".markdown-body, .comment-body")) {
        el.appendChild(transContainer);
        transContainer.style.setProperty("display", "block", "important");
        transContainer.style.setProperty("margin-top", "4px", "important");
      } else {
        el.appendChild(transContainer);
        transContainer.style.setProperty("display", "block", "important");
        transContainer.style.setProperty("margin-top", "4px", "important");
      }
    } else if (isFB) {
      el.appendChild(transContainer);
      transContainer.style.setProperty("display", "block", "important");
      transContainer.style.setProperty("margin-top", "4px", "important");
      transContainer.style.setProperty("margin-bottom", "4px", "important");
      transContainer.style.setProperty("padding", "6px", "important");
      const postContainer = el.closest(
        '[data-testid="feed_stream_container"] [role="article"]',
      );
      if (postContainer) {
        transContainer.style.setProperty("font-size", "0.95em", "important");
      }
    } else {
      const elStyle = window.getComputedStyle(el);
      const elIsFlex = ["flex", "inline-flex"].includes(elStyle.display);

      if (elIsFlex) {
        el.style.setProperty("flex-wrap", "wrap", "important");

        // 创建一个占满整行的翻译容器
        transContainer = document.createElement("div");
        transContainer.className = "kt-paragraph-translation";
        transContainer.dataset.forceInline = "true";
        transContainer.style.setProperty("display", "block", "important");
        transContainer.style.setProperty("width", "100%", "important"); // 占满整行
        transContainer.style.setProperty("flex-basis", "100%", "important"); // flex换行后占满
        transContainer.style.setProperty("margin-top", "4px", "important");
        el.appendChild(transContainer);
      } else {
        const parentIsBlock = [
          "H1",
          "H2",
          "H3",
          "H4",
          "P",
          "DIV",
          "SECTION",
          "ARTICLE",
        ].includes(el.parentElement?.tagName);
        if (parentIsBlock) {
          transContainer.dataset.forceInline = "false";
          transContainer.style.setProperty("display", "block", "important");
          transContainer.style.setProperty("margin-top", "4px", "important");
        }
        el.appendChild(transContainer);
      }
    }
  }

  el.removeAttribute("data-mira-container-pending");
  if (typeof applyUserStyles === "function") {
    const originStyle = window.getComputedStyle(el);
    const originFontWeight = originStyle.fontWeight;

    // YouTube 优先取 a 标签字体，其他直接取 el
    let originFontSize = originStyle.fontSize;
    if (isYoutube) {
      const innerA = el.querySelector("a");
      if (innerA) {
        const innerSize = parseFloat(window.getComputedStyle(innerA).fontSize);
        const elSize = parseFloat(originFontSize);
        if (innerSize > elSize) originFontSize = innerSize + "px";
      }
    }
    if (isFacebook) {
      const size = parseFloat(originFontSize);
      if (!size || size < 14) originFontSize = "15px";
    }
    // 存到 dataset，供翻译完成后的回调使用
    transContainer.dataset.inheritFontSize = originFontSize;

    await applyUserStyles(transContainer, null, originFontSize);
    if (isYoutube) {
      transContainer.querySelectorAll("a").forEach((a) => {
        a.style.setProperty("white-space", "normal", "important");
      });
    }
    // 强制 font-size，防止 applyUserStyles 内部 await 期间 DOM 变化导致丢失
    if (originFontSize) {
      transContainer.style.setProperty(
        "font-size",
        originFontSize,
        "important",
      );
    }

    if (!existingContainer) {
      transContainer.classList.add("kt-loading");
    }

    if (isYoutube && (isYoutubeCustomTag || youtubeListTitleLink)) {
      transContainer.style.setProperty(
        "font-weight",
        originFontWeight,
        "important",
      );
      transContainer.style.setProperty(
        "margin-top",
        youtubeListTitleLink ? "6px" : "12px",
        "important",
      );
      transContainer.style.setProperty(
        "margin-bottom",
        youtubeListTitleLink ? "4px" : "18px",
        "important",
      );
    } else if (
      isAmazon &&
      (el.id === "productTitle" || el.querySelector("#productTitle"))
    ) {
      const h1 = el.closest("h1");
      if (h1) {
        Array.from(h1.childNodes).forEach((node) => {
          if (node.nodeType === 3) node.remove();
        });
        const titleSpan = h1.querySelector("#productTitle") || el;
        Array.from(titleSpan.childNodes).forEach((node) => {
          if (node.nodeType === 3) {
            node.textContent = node.textContent.trim();
          }
        });
        h1.style.setProperty("display", "block", "important");
        h1.style.setProperty("line-height", "1.1", "important");
        el.style.setProperty("display", "block", "important");
        titleSpan.style.setProperty("white-space", "normal", "important");
        titleSpan.style.setProperty("padding", "0", "important");
        transContainer.style.setProperty("margin-top", "2px", "important");
      }
    }

    if (isRTL) {
      transContainer.style.setProperty("direction", "rtl", "important");
      transContainer.style.setProperty("text-align", "right", "important");
      transContainer.style.setProperty(
        "unicode-bidi",
        "plaintext",
        "important",
      );
      transContainer.style.setProperty("line-height", "1.6", "important");
    } else {
      transContainer.style.setProperty("direction", "ltr", "important");
      transContainer.style.setProperty("text-align", "inherit", "important");
      transContainer.style.setProperty("line-height", "1.5", "important");
    }
  }
  TranslationBatcher.add(
    {
      el: el,
      text: originalText,
      container: transContainer,
      linkMap: linkMap,
    },
    forceRefresh,
  );
}

function getObserver() {
  if (!window.observer) {
    window.observer = new IntersectionObserver(
      (entries) => {
        const rule = SiteRules.getRule(location.hostname);
        const selectors = rule.selectors;
        const host = location.hostname;
        const isYoutube = host.includes("youtube.com");
        const isInstagram = host.includes("instagram.com");
        const isDynamic = isYoutube || isInstagram;

        entries.forEach(async (entry) => {
          if (!isPageScanEnabled || !entry.isIntersecting) return;
          const el = entry.target;
          const isMatch = el.matches(selectors);
          let targetEl = el;

          if (!isMatch && el.tagName === "SPAN") {
            const parent = el.closest(selectors);
            if (parent) targetEl = parent;
          }

          if (!isMatch && targetEl === el) {
            const hasText =
              (el.textContent || "").trim().length >= (rule?.minLen || 3);
            if (!hasText) {
              window.observer.unobserve(el);
              return;
            }
            if (
              !isDynamic &&
              !(isYoutube
                ? el.classList?.contains("yt-core-attributed-string") ||
                el.classList?.contains("ytLockupMetadataViewModelTitle") ||
                el.classList?.contains(
                  "ytLockupMetadataViewModelHeadingReset",
                )
                : el.classList?.contains("x"))
            ) {
              // 有文本内容，继续翻译，不 unobserve
            }
          }

          if (isDynamic) {
            const currentText = (targetEl.textContent || "").trim();
            const lastText = targetEl._miraLastText;
            if (lastText && lastText !== currentText) {
              targetEl.removeAttribute("data-translated");
              targetEl.removeAttribute("data-translating");
              targetEl.removeAttribute("data-mira-processing");
              delete targetEl._miraRetryCount;
              delete targetEl._miraSkippedHash;
              _miraProcessingSet.delete(targetEl);
              const nextNode = targetEl.nextElementSibling;
              if (
                nextNode &&
                nextNode.classList?.contains("kt-paragraph-translation")
              ) {
                nextNode.remove();
              }
              targetEl.querySelector?.(".kt-paragraph-translation")?.remove();
            }
            targetEl._miraLastText = currentText;
          }

          if (targetEl.dataset.translated === "true") {
            if (isInstagram) return;
            if (!isDynamic) window.observer.unobserve(el);
            return;
          }

          if (targetEl.dataset.transSkipped === "true") {
            if (!isDynamic) window.observer.unobserve(el);
            return;
          }

          if (targetEl.hasAttribute("data-translating")) return;
          if (targetEl.hasAttribute("data-mira-processing")) return;
          if (_miraProcessingSet.has(targetEl)) return;

          const text = (targetEl.textContent || "").trim();
          const minLen = rule?.minLen !== undefined ? rule?.minLen : 3;
          if (text.length >= minLen) {
            try {
              await handleTranslateElement(targetEl);
            } catch (error) {
              logger.error("Translation failed for element:", targetEl, error);
              _miraProcessingSet.delete(targetEl);
              targetEl.removeAttribute("data-mira-processing");
              targetEl.removeAttribute("data-translating");
            }
            if (!isDynamic) window.observer.unobserve(el);
          } else if (isDynamic) {
            handleYTDelayedText(targetEl);
          } else {
            window.observer.unobserve(el);
          }
        });
      },
      { rootMargin: "400px" },
    );
  }
  return window.observer;
}

function initFacebookDeepWatcher() {
  if (!location.hostname.includes("facebook.com")) return;
  if (window.__mira_fb_see_more_hooked) return;

  const lengthCache = new WeakMap();

  const watcher = new MutationObserver((mutations) => {
    const postElements = document.querySelectorAll(
      'div[dir="auto"].xdj266r, div[data-ad-comet-preview="message"]',
    );

    postElements.forEach((el) => {
      const currentText = (el.textContent || "").trim();
      const currentLen = currentText.length;
      const lastLen = lengthCache.get(el);

      if (lastLen !== undefined && currentLen > lastLen + 10) {
        if (el.getAttribute("data-translated") === "true") {
          logger.log("[Mira] Facebook 内容膨胀检测成功，重置翻译...");

          el.removeAttribute("data-translated");
          el.removeAttribute("data-mira-processing");
          _miraProcessingSet?.delete(el);

          el.querySelectorAll(".kt-paragraph-translation").forEach((b) =>
            b.remove(),
          );
          if (
            el.nextElementSibling?.classList.contains(
              "kt-paragraph-translation",
            )
          ) {
            el.nextElementSibling.remove();
          }

          lengthCache.set(el, currentLen);
          if (typeof handleTranslateElement === "function") {
            handleTranslateElement(el, true);
          }
        }
      }

      if (lastLen === undefined && currentLen > 0) {
        lengthCache.set(el, currentLen);
      }
    });
  });

  watcher.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  window.__mira_fb_see_more_hooked = true;
}

initFacebookDeepWatcher();

function initInstagramDeepWatcher() {
  if (!location.hostname.includes("instagram.com")) return;

  const lengthCache = new WeakMap();

  const watcher = new MutationObserver((mutations) => {
    const postSpans = document.querySelectorAll('span[dir="auto"]._ap3a');

    postSpans.forEach((span) => {
      const currentText = (span.textContent || "").trim();
      const currentLen = currentText.length;
      const lastLen = lengthCache.get(span);

      if (lastLen !== undefined && currentLen > lastLen + 5) {
        if (span.getAttribute("data-translated") === "true") {
          logger.log("[Mira] 检测到文字内容膨胀，正在重置并重译...");

          span.removeAttribute("data-translated");
          span.removeAttribute("data-mira-processing");

          const oldTrans =
            span.querySelector(".kt-paragraph-translation") ||
            (span.nextElementSibling?.classList.contains(
              "kt-paragraph-translation",
            )
              ? span.nextElementSibling
              : null);
          if (oldTrans) oldTrans.remove();

          lengthCache.set(span, currentLen);
          if (typeof handleTranslateElement === "function") {
            handleTranslateElement(span, true);
          }
        }
      }

      if (
        lastLen === undefined &&
        span.getAttribute("data-translated") === "true"
      ) {
        lengthCache.set(span, currentLen);
      }
    });
  });

  watcher.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

initInstagramDeepWatcher();

//局部扫描函数：只扫描特定容器内的无翻译内容
async function scanArticleContentOnly(article, selectors) {
  if (!article || !selectors) return;
  try {
    const rule = SiteRules.getRule(location.hostname);
    const finalSelectors = rule?.selectors || selectors;
    const minLen = rule?.minLen !== undefined ? rule?.minLen : 2;

    if (!finalSelectors) {
      logger.warn("[Scan] No selectors found");
      return;
    }

    const finalRules = resolveActiveSelectors(finalSelectors);
    const selectorArray = finalRules
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (selectorArray.length === 0) return;

    logger.log(
      `[Scan] Using ${selectorArray.length} selectors for ${location.hostname}`,
    );

    // 只在当前文章容器内查询
    const allTargets = article.querySelectorAll(selectorArray.join(", "));

    let translateCount = 0;
    for (const el of allTargets) {
      if (!el || el.nodeType !== 1) continue;

      // 跳过已翻译或正在翻译的元素
      if (el.dataset.translated === "true" || el.dataset.translating === "true")
        continue;
      if (el.hasAttribute("data-mira-processing") || _miraProcessingSet.has(el))
        continue;

      // 跳过按钮元素
      if (
        el.querySelector('[role="button"]') ||
        el.getAttribute("role") === "button"
      )
        continue;

      const textContent = el.innerText?.trim() || el.textContent?.trim() || "";
      if (textContent.length < minLen) continue;

      // 跳过已经是目标语言的内容
      if (
        detectIsAlreadyTarget(
          textContent,
          window.currentTargetL || getBrowserLang(),
        )
      ) {
        el.dataset.translated = "true";
        continue;
      }

      try {
        await handleTranslateElement(el, false);
        translateCount++;
      } catch (error) {
        logger.error("[Mira] Article scan error:", error);
      }
    }

    logger.log(
      `[Mira] Facebook article scan complete, translated ${translateCount} elements`,
    );
  } catch (error) {
    logger.error("[Mira] scanArticleContentOnly error:", error);
  }
}

// 扫描Instagram模态框（帖子详情、评论）
async function scanInstagramModal(modal) {
  if (!modal) {
    return;
  }
  try {
    const finalRules = resolveActiveSelectors(currentActiveSelectors);
    const selectorArray = finalRules
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // 首先处理那些被标记为已翻译但没有容器的元素（修复错误状态）
    const allPotentialElements = modal.querySelectorAll(
      'h1[dir="auto"], h2[dir="auto"], h3[dir="auto"], h4[dir="auto"], span[dir="auto"]',
    );

    let fixedCount = 0;
    const fixedElements = []; // 跟踪被修复的元素

    for (const el of allPotentialElements) {
      if (!el.dataset.translated) continue;

      const textContent = el.innerText?.trim() || el.textContent?.trim() || "";
      const hasInternalContainer = el.querySelector(
        ".kt-paragraph-translation",
      );
      const hasSiblingContainer = el.nextElementSibling?.classList?.contains(
        "kt-paragraph-translation",
      );
      const parentHasSibling = el.parentElement?.querySelector(
        ":scope > .kt-paragraph-translation",
      );

      if (!hasInternalContainer && !hasSiblingContainer && !parentHasSibling) {
        if (textContent.length > 2) {
          logger.log(
            `[Mira Modal Scan] MISMARKED: "${textContent.substring(0, 50)}" - cleared and queued for force translation`,
          );

          // 清除错误的标记
          el.removeAttribute("data-translated");
          el.removeAttribute("data-translating");
          el.removeAttribute("data-instagram-tracked");
          el.removeAttribute("data-mira-processing");
          _miraProcessingSet.delete(el);
          fixedCount++;
          fixedElements.push(el);
        }
      }
    }

    if (fixedCount > 0) {
      // 强制这些被修复的元素进行翻译
      for (const el of fixedElements) {
        try {
          await handleTranslateElement(el, true); // 使用 forceRefresh=true
        } catch (error) {
          logger.error(
            "[Mira Modal Scan] Error re-translating fixed element:",
            error,
          );
        }
      }
    }

    // 在模态框中扫描所有需要翻译的元素
    const allTargets = modal.querySelectorAll(selectorArray.join(", "));

    let translateCount = 0;
    for (const el of allTargets) {
      if (!el || el.nodeType !== 1) continue;

      if (el.dataset.miraFixedMismark === "true") {
        el.removeAttribute("data-mira-fixed-mismark"); // 清除临时标记
        continue;
      }

      const hasTranslationContainer =
        el.querySelector(".kt-paragraph-translation") ||
        el.nextElementSibling?.classList?.contains("kt-paragraph-translation");

      if (el.dataset.translated === "true") {
        if (hasTranslationContainer) {
          continue;
        } else {
          el.removeAttribute("data-translated");
          el.removeAttribute("data-instagram-tracked");
        }
      }

      if (el.dataset.translating === "true") continue;
      if (el.hasAttribute("data-mira-processing") || _miraProcessingSet.has(el))
        continue;

      const textContent = el.innerText?.trim() || el.textContent?.trim() || "";
      if (textContent.length < 2) continue;

      try {
        await handleTranslateElement(el, false);
        translateCount++;
      } catch (error) {
        logger.error("[Mira] Instagram modal scan error:", error);
      }
    }

    const nestedSpans = modal.querySelectorAll(
      'span[dir="auto"] div[style*="display: inline"] span[dir="auto"]',
    );
    for (const el of nestedSpans) {
      if (!el || el.nodeType !== 1) continue;

      const hasTranslationContainer =
        el.querySelector(".kt-paragraph-translation") ||
        el.nextElementSibling?.classList?.contains("kt-paragraph-translation");

      if (el.dataset.translated === "true") {
        if (hasTranslationContainer) {
          continue;
        } else {
          el.removeAttribute("data-translated");
          el.removeAttribute("data-instagram-tracked");
        }
      }

      if (el.dataset.translating === "true") continue;
      if (el.hasAttribute("data-mira-processing") || _miraProcessingSet.has(el))
        continue;

      const textContent = el.innerText?.trim() || el.textContent?.trim() || "";
      if (textContent.length < 2) continue;

      try {
        await handleTranslateElement(el, false);
        translateCount++;
      } catch (error) {
        logger.error("[Mira] Instagram nested span error:", error);
      }
    }

    logger.log(
      `[Mira] Instagram modal scan complete, translated ${translateCount} elements`,
    );
  } catch (error) {
    logger.error("[Mira] scanInstagramModal error:", error);
  }
}

// 扫描Instagram评论和其他内容
async function scanInstagramComments(commentContainer) {
  logger.log("[Mira] scanInstagramComments called");
  if (!commentContainer) {
    logger.log("[Mira] scanInstagramComments: container is null, returning");
    return;
  }
  try {
    const finalRules = resolveActiveSelectors(currentActiveSelectors);
    const selectorArray = finalRules
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // 添加特定的评论选择器
    const additionalSelectors = [
      "[class*='_a9zr']",
      "span[dir='auto']",
      "h1[dir='auto']",
      "h2[dir='auto']",
      "h3[dir='auto']",
    ];

    const allSelectors = [...selectorArray, ...additionalSelectors].filter(
      (v, i, a) => a.indexOf(v) === i,
    ); // 去重

    // 先检查并修复被误标记的元素
    logger.log("[Mira Comment Scan] Starting pre-scan for mismarked elements");
    const allPotentialElements = commentContainer.querySelectorAll(
      'h1[dir="auto"], h2[dir="auto"], h3[dir="auto"], h4[dir="auto"], span[dir="auto"], [class*="_a9zr"]',
    );
    logger.log(
      `[Mira Comment Scan] Found ${allPotentialElements.length} potential elements in container`,
    );

    let fixedInComments = 0;
    const fixedCommentElements = []; // 跟踪被修复的元素

    for (const el of allPotentialElements) {
      if (!el.dataset.translated) continue;

      const textContent = el.innerText?.trim() || el.textContent?.trim() || "";

      // 检查是否有翻译容器
      const hasInternalContainer = el.querySelector(
        ".kt-paragraph-translation",
      );
      const hasSiblingContainer = el.nextElementSibling?.classList?.contains(
        "kt-paragraph-translation",
      );
      const parentHasSibling = el.parentElement?.querySelector(
        ":scope > .kt-paragraph-translation",
      );

      if (!hasInternalContainer && !hasSiblingContainer && !parentHasSibling) {
        if (textContent.length > 2) {
          logger.log(
            `[Mira Comment Scan] MISMARKED: "${textContent.substring(0, 50)}" - cleared and queued for force translation`,
          );

          el.removeAttribute("data-translated");
          el.removeAttribute("data-translating");
          el.removeAttribute("data-instagram-tracked");
          el.removeAttribute("data-mira-processing");
          _miraProcessingSet.delete(el);
          fixedInComments++;
          fixedCommentElements.push(el);
        }
      }
    }

    if (fixedInComments > 0) {
      for (const el of fixedCommentElements) {
        try {
          await handleTranslateElement(el, true);
        } catch (error) {
          logger.error(
            "[Mira Comment Scan] Error force-translating fixed element:",
            error,
          );
        }
      }
    }

    const allTargets = commentContainer.querySelectorAll(
      allSelectors.join(", "),
    );

    let translateCount = 0;
    for (const el of allTargets) {
      if (!el || el.nodeType !== 1) continue;

      if (el.dataset.miraFixedMismark === "true") {
        el.removeAttribute("data-mira-fixed-mismark");
        continue;
      }

      const hasTranslationContainer =
        el.querySelector(".kt-paragraph-translation") ||
        el.nextElementSibling?.classList?.contains("kt-paragraph-translation");

      if (el.dataset.translated === "true") {
        if (hasTranslationContainer) {
          continue;
        } else {
          el.removeAttribute("data-translated");
          el.removeAttribute("data-instagram-tracked");
        }
      }

      if (el.dataset.translating === "true") continue;
      if (el.hasAttribute("data-mira-processing") || _miraProcessingSet.has(el))
        continue;

      const textContent = el.innerText?.trim() || el.textContent?.trim() || "";
      if (textContent.length < 2) continue;

      // 跳过用户名和时间戳 - 扩展时间格式支持
      if (
        /^\d+[shdwmy]$|^now$|^\d+\s*(s|sec|seconds?|m|min|minutes?|h|hour|hours?|d|day|days?|w|week|weeks?|mo|month|months?|y|year|years?)$/i.test(
          textContent,
        )
      )
        continue;

      // 跳过纯emoji或纯数字
      if (/^[\d\p{Emoji}]+$/u.test(textContent)) continue;

      try {
        await handleTranslateElement(el, false);
        el.dataset.instagramTracked = "true";
        translateCount++;
      } catch (error) {
        logger.error("[Mira] Instagram comment scan error:", error);
      }
    }

    if (translateCount > 0) {
      logger.log(
        `[Mira] Instagram comments scanned, translated ${translateCount} elements`,
      );
    }
  } catch (error) {
    logger.error("[Mira] scanInstagramComments error:", error);
  }
}

//穿透函数：递归搜索所有 Shadow DOM 中的目标
function querySelectorAllDeep(selector, root = document) {
  let nodes = Array.from(root.querySelectorAll(selector));
  const allElements = root.querySelectorAll("*");
  for (const el of allElements) {
    if (el.shadowRoot) {
      nodes = nodes.concat(querySelectorAllDeep(selector, el.shadowRoot));
    }
  }
  return nodes;
}
function resolveActiveSelectors(inputSelectors) {
  if (typeof SiteRules === "undefined") return (inputSelectors || "p").trim();
  const hasSpecificRule = SiteRules.hasRule(location.hostname);
  const genericSelectors = SiteRules.generic.selectors.trim();
  const isBasic =
    !inputSelectors ||
    inputSelectors.trim() === "" ||
    inputSelectors.trim() === "p";
  if (!isBasic) {
    // generic 网站始终合并 span selector，防止用户配置里没有 span
    if (!hasSpecificRule) {
      const spanSelector =
        "span:not(button *):not(nav *):not(header *):not(footer *):not(.kt-paragraph-translation):not([class*='icon']):not([class*='badge']):not([class*='tag'])";
      const existing = inputSelectors.trim();
      if (!existing.includes("span")) {
        return existing + ", " + spanSelector;
      }
    }
    return inputSelectors.trim();
  }
  if (hasSpecificRule) {
    const rule = SiteRules.getRule(location.hostname);
    if (rule && rule.selectors) return rule.selectors;
  }
  return genericSelectors;
}
function isElementVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none") return false;
  if (style.visibility === "hidden") return false;
  if (style.opacity === "0") return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  return true;
}

function sortElementsByPriority(elements, selectors) {
  const liSelectors = selectors
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /\bli\b\s*$/.test(s));

  if (liSelectors.length === 0) return elements;

  const isLiTarget = (el) =>
    liSelectors.some((sel) => {
      try {
        return el.matches(sel);
      } catch {
        return false;
      }
    });

  return [...elements].sort((a, b) => {
    return (isLiTarget(a) ? 1 : 0) - (isLiTarget(b) ? 1 : 0);
  });
}

async function executeReScan(config) {
  if (!isPageScanEnabled) return;
  if (!window.__mira_reScanLock)
    window.__mira_reScanLock = { running: false, lastAt: 0 };
  const lock = window.__mira_reScanLock;
  const now = Date.now();
  const cooldown = 700;
  if (lock.running) {
    return { targets: 0, triggered: 0 };
  }
  if (!(config && config.forceAll) && now - (lock.lastAt || 0) < cooldown) {
    return { targets: 0, triggered: 0 };
  }
  lock.running = true;
  lock.lastAt = now;
  try {
    if (window.observer) {
      window.observer.disconnect();
    }

    const storage = await safeGetStorage(["scanConfig"]);
    const domain = window.location.hostname.replace("www.", "");
    const configData = storage?.scanConfig;
    const currentMinLen = configData?.custom?.[domain]?.minLen ?? configData?.global?.minLen ?? 2;

    const selectors = config?.selectors || currentActiveSelectors || "";
    const activeRules = resolveActiveSelectors(selectors);
    currentActiveSelectors = activeRules;
    if (config && config.forceAll) {
      window.__mira_generic_covered = new Set();
      document.querySelectorAll(".kt-paragraph-translation").forEach((node) => {
        try {
          node.remove();
        } catch (e) { }
      });
      const allMarked =
        typeof querySelectorAllDeep === "function"
          ? querySelectorAllDeep("[data-translated], [data-translating]")
          : document.querySelectorAll("[data-translated], [data-translating]");
      allMarked.forEach((el) => {
        try {
          el.removeAttribute("data-translated");
          el.removeAttribute("data-translating");
          el.removeAttribute("data-mira-processing");
          delete el.dataset.translated;
          delete el.dataset.translating;
        } catch (e) { }
      });
      TranslationBatcher.queue = [];
      if (TranslationBatcher.timer) {
        clearTimeout(TranslationBatcher.timer);
        TranslationBatcher.timer = null;
      }
    }
    getObserver();
    const scanRules = activeRules;
    let allElements =
      typeof querySelectorAllDeep === "function"
        ? querySelectorAllDeep(scanRules)
        : Array.from(document.querySelectorAll(scanRules));
    allElements = sortElementsByPriority(allElements, scanRules);
    let triggered = 0;
    const tasks = [];
    const targets = [];
    for (let el of allElements) {
      try {
        const tag = el.tagName;
        if (
          ["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA", "INPUT"].includes(tag)
        )
          continue;
        const text = el.innerText || el.textContent || "";

        if (text.trim().length < currentMinLen) {
          continue;
        }

        const isCssLike = (text.match(/[{};:]/g) || []).length > 5;
        if (isCssLike) continue;
        if (el.closest("style, script, pre, code, [contenteditable]")) continue;
        const isX = location.hostname.includes("x.com");
        if (isX) {
          el.removeAttribute("data-translating");
          delete el.dataset.translating;
        }
        if (el.dataset.translated === "true") {
          if (el.dataset.transSkipped === "true") continue;
          const hasRealContainer =
            el.nextElementSibling?.classList?.contains(
              "kt-paragraph-translation",
            ) ||
            Array.from(el.children).some((c) =>
              c.classList.contains("kt-paragraph-translation"),
            );
          if (hasRealContainer) continue;
          el.removeAttribute("data-translated");
          delete el.dataset.translated;
        }
        if (el.dataset.translating === "true") continue;
        if (
          el.tagName === "DIV" &&
          (activeRules.includes("p") ||
            activeRules.includes("li") ||
            activeRules.includes("span"))
        ) {
          const isAmazonProductTitle =
            location.hostname.includes("amazon.") &&
            el.className.includes("line-clamp");
          if (!isAmazonProductTitle) {
            const hasDirectText = Array.from(el.childNodes).some(
              (n) => n.nodeType === 3 && n.textContent.trim().length > 1,
            );
            if (!hasDirectText && el.querySelector("p, li, span")) continue;
          }
        }
        const rect = el.getBoundingClientRect();
        const isInViewportBuffer =
          rect.top < window.innerHeight + 800 && rect.bottom > -800;
        if ((config && config.forceAll) || isInViewportBuffer) {
          targets.push(el);
          tasks.push(async () => {
            try {
              if (!(config && config.forceAll)) {
                if (
                  el.dataset.translated === "true" ||
                  el.dataset.translating === "true"
                )
                  return 0;
              }
              await handleTranslateElement(el, !!(config && config.forceAll));
              return 1;
            } catch (e) {
              return 0;
            }
          });
        }
      } catch (e) { }
    }
    if (tasks.length > 0) {
      const results = await runWithConcurrency(tasks, 6);
      triggered = results.reduce((a, b) => a + b, 0);
    }
    lock.running = false;
    lock.lastAt = Date.now();
    return { targets: targets.length, triggered };
  } catch (e) {
    logger.error("[Mira] executeReScan error:", e);
    lock.running = false;
    lock.lastAt = Date.now();
    return { targets: 0, triggered: 0 };
  }
}
async function scanContent(forcedSelectors = null) {

  if (typeof isPageScanEnabled !== "undefined" && !isPageScanEnabled) return;
  if (forcedSelectors === null && currentActiveSelectors === "__LOADING__")
    return;
  if (forcedSelectors === null && typeof SiteRules !== "undefined") {
    const domain = window.location.hostname.replace("www.", "");
    if (SiteRules.hasRule(domain)) {
      const presetSelectors = SiteRules.getRule(domain).selectors;
      // 合并 custom selector
      const storage = await safeGetStorage(["scanConfig"]);
      const customSelectors =
        storage?.scanConfig?.custom?.[domain]?.selectors || "";
      if (customSelectors) {
        currentActiveSelectors = [
          ...new Set([
            ...presetSelectors
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            ...customSelectors
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          ]),
        ].join(", ");
      } else {
        currentActiveSelectors = presetSelectors;
      }
    } else {
      // generic 网站：用 TreeWalker 翻译文本节点
      startGenericTranslation();
      return;
    }
  }
  try {
    const isX = location.hostname.includes("x.com");
    const isMSN = location.hostname.includes("msn.com");
    const isFB = location.hostname.includes("facebook.com");
    let selectorsArray = [];
    const inputSelectors =
      forcedSelectors !== null
        ? forcedSelectors
        : typeof currentActiveSelectors !== "undefined"
          ? currentActiveSelectors
          : null;
    const finalRules = resolveActiveSelectors(inputSelectors);
    finalRules.split(",").forEach((s) => {
      if (s.trim()) selectorsArray.push(s.trim());
    });
    if (isX && !selectorsArray.includes("[data-testid='tweetText']")) {
      selectorsArray.push("[data-testid='tweetText']");
    }
    if (
      isFB &&
      !selectorsArray.includes(
        "[dir='auto']:not([role='button']):not([role='tab']):not([role='article'])",
      )
    ) {
      selectorsArray.push(
        "[dir='auto']:not([role='button']):not([role='tab']):not([role='article'])",
      );
    }
    const validSelectors = [...new Set(selectorsArray)].filter(Boolean);
    if (validSelectors.length === 0) return;
    const finalSelectors = validSelectors.join(", ");
    if (forcedSelectors !== null) {
      currentActiveSelectors = forcedSelectors;
    }
    let allTargets;
    const hasShadowPotential = !!document.querySelector(
      ":defined:not(style, script, link, meta)",
    );
    if (isMSN || hasShadowPotential) {
      allTargets =
        typeof querySelectorAllDeep === "function"
          ? querySelectorAllDeep(finalSelectors)
          : Array.from(document.querySelectorAll(finalSelectors));
    } else {
      allTargets = Array.from(document.querySelectorAll(finalSelectors));
    }
    allTargets = sortElementsByPriority(allTargets, finalSelectors);
    allTargets.forEach((el) => {
      if (!el || el.nodeType !== 1) return;
      const isAmazon = location.hostname.includes("amazon.");
      const isAmazonReview = el.getAttribute("data-hook") === "review-body";
      if (
        isAmazon &&
        el.tagName === "LI" &&
        el.classList.contains("a-carousel-card")
      ) {
        el.dataset.translated = "true";
        return;
      }
      if (isAmazon && el.getAttribute("data-hook") === "review") {
        const reviewSpan = el.querySelector(
          "[data-hook='review-collapsed'] > span",
        );
        if (reviewSpan && reviewSpan.dataset.translated !== "true") {
          handleTranslateElement(reviewSpan);
        }
        return;
      }
      const isYTComment =
        el.classList.contains("yt-core-attributed-string") ||
        el.id === "content-text";
      const isSpecialSite = isAmazonReview || isYTComment || isX || isAmazon;
      let targetEl = el;
      if (isAmazonReview) {
        const deepSpan =
          el.querySelector(".review-text-content span") ||
          el.querySelector("span");
        if (deepSpan) targetEl = deepSpan;
      }
      if (!isSpecialSite) {
        if (
          ["STYLE", "SCRIPT", "NOSCRIPT"].includes(targetEl.tagName) ||
          targetEl.querySelector("style, script")
        ) {
          targetEl.dataset.translated = "true";
          return;
        }
        let directText = "";
        targetEl.childNodes.forEach((node) => {
          if (node.nodeType === 3) {
            directText += node.textContent;
          }
        });
        const raw = directText.trim();
        if (raw.length > 0) {
          if (
            (raw.includes("{") && raw.includes(":")) ||
            raw.includes("NO_OF_HOURS")
          ) {
            targetEl.dataset.translated = "true";
            return;
          }
        }
      }

      if (targetEl.dataset.translated === "true") return;
      if (targetEl.dataset.translating === "true" && !isAmazonReview) return;
      //  p 内部有可翻译 span 就跳过 p 本身，防止重复翻译
      if (
        targetEl.tagName === "P" &&
        !isSpecialSite &&
        !SiteRules.hasRule(location.hostname)
      ) {
        const innerSpan = targetEl.querySelector(
          "span:not(.kt-paragraph-translation):not([class*='icon']):not([class*='badge'])",
        );
        if (innerSpan && innerSpan.textContent.trim().length > 0) {
          targetEl.dataset.translated = "true";
          return;
        }
      }
      const textContent =
        isAmazonReview || isYTComment
          ? targetEl.textContent || ""
          : targetEl.innerText || targetEl.textContent || "";
      const cleanText = textContent.trim();
      if (cleanText.length < (isSpecialSite ? 1 : 2)) {
        targetEl.dataset.translated = "true";
        return;
      }
      if (isAmazonReview && cleanText.length > 800) {
        const chunks = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
        targetEl.innerHTML = "";
        chunks.forEach((chunk) => {
          const s = document.createElement("span");
          s.style.display = "block";
          s.style.marginBottom = "8px";
          s.textContent = chunk;
          targetEl.appendChild(s);
          if (typeof handleTranslateElement === "function")
            handleTranslateElement(s);
        });
        targetEl.dataset.translated = "true";
        return;
      }
      if (!isSpecialSite) {
        let parent = targetEl.parentElement;
        const isIndependent = ["P", "LI", "H1", "H2", "H3", "H4"].includes(
          targetEl.tagName,
        );
        if (!isIndependent) {
          while (parent && parent !== document.documentElement) {
            if (
              typeof parent.matches === "function" &&
              parent.matches(finalSelectors)
            ) {
              if (
                (parent.dataset.translated === "true" &&
                  parent.dataset.transSkipped !== "true") ||
                parent.dataset.translating === "true"
              ) {
                targetEl.dataset.translated = "true";
                return;
              }
            }
            parent = parent.parentElement;
          }
        }
      }
      const rect = targetEl.getBoundingClientRect();
      const isInViewport =
        isSpecialSite ||
        (rect.top < window.innerHeight + 1500 && rect.bottom > -1500);
      if (isInViewport && typeof handleTranslateElement === "function") {
        //  p 元素内部有可翻译的 span 就跳过 p 本身
        if (
          !isSpecialSite &&
          targetEl.tagName === "P" &&
          targetEl.querySelector(finalSelectors)
        ) {
          targetEl.dataset.translated = "true";
          return;
        }
        handleTranslateElement(targetEl);
      } else {
        const obs = getObserver();
        if (obs && typeof obs.observe === "function") {
          if (
            targetEl.isContentEditable ||
            targetEl.closest?.('[contenteditable="true"]') ||
            targetEl.closest?.("textarea") ||
            targetEl.tagName === "TEXTAREA" ||
            targetEl.tagName === "INPUT"
          )
            return;
          obs.observe(targetEl);
        }
      }
    });
  } catch (e) {
    logger.error("[Mira Translator] ScanContent Error:", e);
  }

  if (!window.__mira_dynamic_observer) {
    ensureDynamicContentWatcher();
  }
}
/**
 * 监听：捕获来自拾取器（content_pick_script.js）的即时更新信号
 */
document.addEventListener("KT_CONFIG_UPDATED", (e) => {
  if (typeof chrome === "undefined" || !chrome.runtime?.id) {
    if (typeof showUpdateNotification === "function") {
      showUpdateNotification();
    }
    return;
  }
  isPageScanEnabled = true;
  const newSelectors = e.detail.selectors;
  currentActiveSelectors = newSelectors;
  if (newSelectors.trim() !== "") {
    try {
      document.querySelectorAll(newSelectors).forEach((el) => {
        if (!el.closest("[data-testid='tweetText']")) {
          delete el.dataset.translated;
          delete el.dataset.translating;
          el.removeAttribute("data-translated");
          el.removeAttribute("data-translating");
          const oldTrans = el.querySelector(".kt-paragraph-translation");
          if (oldTrans) oldTrans.remove();
        }
      });
    } catch (err) {
      logger.warn("[Mira] 选择器语法解析失败，跳过预清理:", newSelectors);
    }
  }
  if (typeof scanContent === "function") {
    scanContent(newSelectors);
  } else {
    logger.error("[Mira] 错误：未找到 scanContent 函数");
  }
});

const getTextFragmentAnchor = (word) => {
  try {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return "";
    const range = selection.getRangeAt(0);
    const container = range.startContainer.parentElement;
    const fullText = container.innerText || "";
    const startOffset = range.startOffset;
    const endOffset = range.endOffset;
    const prefix = fullText
      .substring(Math.max(0, startOffset - 15), startOffset)
      .trim();
    const suffix = fullText
      .substring(endOffset, Math.min(fullText.length, endOffset + 15))
      .trim();
    let fragment = `#:~:text=`;
    if (prefix) fragment += encodeURIComponent(prefix) + "-,";
    fragment += encodeURIComponent(word);
    if (suffix) fragment += ",-" + encodeURIComponent(suffix);
    return fragment;
  } catch (e) {
    logger.warn("[Mira-Context] 无法获取文本片段:", e);
    return "";
  }
};
let _capturedContext = "";
let _capturedContextTranslation = "";

function initSelectionTranslate() {
  const logoBase64 = ASSETS.logoBase64;

  window.addEventListener(
    "scroll",
    () => {
      if (logoBtn && logoBtn.classList.contains("show")) {
        forceHideLogo();
      }
    },
    { passive: true },
  );
  let isDragging = false,
    startX,
    startY,
    initialX,
    initialY;
  let shadowHost = null,
    popupEl = null,
    logoBtn = null;
  function clampPopupToViewport(el) {
    const margin = 10;
    const rect = el.getBoundingClientRect();
    const vw = window.visualViewport?.width || window.innerWidth;
    const vh = window.visualViewport?.height || window.innerHeight;
    let left = rect.left;
    let top = rect.top;

    if (rect.right > vw - margin) left = vw - rect.width - margin;
    if (left < margin) left = margin;

    //  底部超出：向上移
    if (rect.bottom > vh - margin) top = vh - rect.height - margin;

    //  顶部超出：强制贴顶
    if (top < margin) top = margin;

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }
  function enablePanelResize(panel) {
    const resizers = panel.querySelectorAll(".resizer");
    resizers.forEach((resizer) => {
      resizer.addEventListener("mousedown", function (e) {
        e.preventDefault();
        e.stopPropagation();
        const dir = this.getAttribute("data-dir");

        const rect = panel.getBoundingClientRect();
        panel.style.width = rect.width + "px";
        panel.style.height = rect.height + "px";
        panel.style.maxWidth = window.innerWidth * 0.9 + "px";
        panel.style.maxHeight = window.innerHeight * 0.85 + "px";
        panel.style.minHeight = "150px";

        const startX = e.clientX;
        const startY = e.clientY;
        const startW = rect.width;
        const startH = rect.height;
        const startL = rect.left;
        const startT = rect.top;
        panel.style.transition = "none";
        function onMouseMove(ev) {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;

          if (dir.includes("r") || dir.includes("l")) {
            let newW = dir.includes("r") ? startW + dx : startW - dx;
            const maxWidthLimit = window.innerWidth * 0.9;
            if (newW >= 280 && newW <= maxWidthLimit) {
              panel.style.width = newW + "px";
              if (dir.includes("l")) {
                panel.style.left = startL + dx + "px";
              }
            }
          }

          let newH = startH;
          if (dir.includes("b")) {
            newH = startH + dy;
          } else if (dir.includes("t")) {
            newH = startH - dy;
          }

          const maxHeightLimit = window.innerHeight * 0.85;
          if (newH >= 150 && newH <= maxHeightLimit) {
            panel.style.height = newH + "px";
            if (dir.includes("t")) {
              panel.style.top = startT + dy + "px";
            }
          }
        }
        function onMouseUp() {
          panel.style.transition = "opacity 0.2s, transform 0.2s";
          const finalRect = panel.getBoundingClientRect();

          panel.style.width = finalRect.width + "px";
          panel.style.minWidth = "280px";
          panel.style.maxWidth = window.innerWidth * 0.9 + "px";

          panel.style.height = finalRect.height + "px";
          panel.style.minHeight = "150px";
          panel.style.maxHeight = window.innerHeight * 0.85 + "px";

          safeSetStorage({
            uiConfig: {
              width: finalRect.width + "px",
              height: finalRect.height + "px",
            },
          });

          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);
        }
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
      });
    });
  }
  // ─── Shadow DOM 初始化 ───────────────────────────────────────────────────────

  function initShadowDOM() {
    if (shadowHost) return;

    shadowHost = document.createElement("div");
    shadowHost.id = "eclipse-translator-host";
    shadowHost.setAttribute("data-pinned", "false");
    shadowHost.style.cssText =
      "position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
    document.documentElement.appendChild(shadowHost);

    const shadow = shadowHost.attachShadow({ mode: "open" });
    shadow.appendChild(buildStyle());

    // Logo 按钮
    logoBtn = document.createElement("div");
    logoBtn.className = "eclipse-logo-btn";
    logoBtn.innerHTML = `
    <div class="glowing-icon">
      <img src="${logoBase64}">
    </div>`;
    shadow.appendChild(logoBtn);

    window.addEventListener(
      "contextmenu",
      () => {
        if (logoBtn?.classList.contains("show")) forceHideLogo();
      },
      true,
    );

    // 主面板
    popupEl = document.createElement("div");
    popupEl.className = "mira-kt-panel";
    popupEl.style.cssText =
      "display:none;position:fixed;visibility:hidden;width:0;height:0;";
    popupEl.innerHTML = buildPanelHTML();
    shadow.appendChild(popupEl);

    // 恢复用户尺寸设置
    safeGetStorage("uiConfig", (res) => {
      const s = res?.uiConfig;
      if (!s?.width || !s?.height) return;
      try {
        popupEl.style.width = s.width;
        popupEl.style.maxWidth = s.width;
        popupEl.style.minWidth = "280px";
        popupEl.style.height = s.height;
        popupEl.style.maxHeight = s.height;
        popupEl.style.boxSizing = "border-box";
      } catch (e) {
        logger.error("Failed to load uiConfig", e);
      }
    });

    enablePanelResize(popupEl);

    // 监听面板尺寸变化，自动修正位置
    const resizeObserver = new ResizeObserver(() => {
      if (popupEl.style.display !== 'none') {
        clampPopupToViewport(popupEl);
      }
    });
    resizeObserver.observe(popupEl);
  }

  // ─── 样式表构建 ──────────────────────────────────────────────────────────────

  function buildStyle() {
    const style = document.createElement("style");
    style.textContent = `
      /* ── CSS 变量（暗色默认）── */
      :host {
        --p-bg:               rgba(18,18,18,0.95);
        --p-text-main:        #ffffffb7;
        --p-text-query:       rgb(31 31 35 / 34%);
        --p-text-muted:       rgba(255,255,255,0.6);
        --p-text-detail:      rgba(255,255,255,0.6);
        --p-accent:           #38bdf8;
        --arrowColor:         rgb(34, 197, 94);
        --p-border:           rgba(255,255,255,0.1);
        --p-shadow:           rgba(0,0,0,0.5);
        --p-content-bg:       rgba(39,39,50,0.39);
        --p-header-bg:        rgba(31,31,35,0.34);
        --p-header-shadow:    0 2px 8px rgba(235,215,215,0.09);
        --p-phonetic:         #38bdf8;
        --p-glow-opacity:     0.8;
        --p-panel-anim:       eclipseHalo;
        --p-link-hover-bg:    rgba(56, 189, 248, 0.15);
        --p-link-kana-bg:     #064e3b;
          --p-link-kana:     #dae2da; 
      }

      /* ── 亮色变量── */
      :host([theme="light"]),
      :host(:not([theme="dark"])) {
        --p-bg:               #fffffff3;
        --p-text-main:        #1a202c;
        --p-text-query:       #2d3748;
        --p-text-muted:       #718096;
        --p-text-detail:      #4f5a6a;
        --p-accent:           #465359;
        --arrowColor:         #2ecb3c;
        --p-border:           rgba(0,0,0,0.1);
        --p-shadow:           rgba(0,0,0,0.1);
        --p-content-bg:       rgba(245,249,249,0.79);
        --p-header-bg:        rgba(177,178,191,0.23);
        --p-header-shadow:    0 2px 8px rgba(0,0,0,0.3);
        --p-phonetic:         #07a457;
        --p-glow-opacity:     0.3;
        --p-panel-anim:       eclipseHaloLightAlt;
        --p-link-hover-bg:    rgba(2, 132, 199, 0.1);
        --p-link-kana-bg:     #66f16f69;
          --p-link-kana:     #030303; 
      }

      /* 仅在系统偏好亮色且未手动设置 dark 时生效 */
      @media (prefers-color-scheme: light) {
        :host(:not([theme="dark"])) {
          --p-bg:            #fffffff3;
          --p-text-main:     #1a202c;
          --p-text-query:    #2d3748;
          --p-text-muted:    #718096;
          --p-text-detail:   #4f5a6a;
          --p-accent:        #0284c7;
          --arrowColor:      #2ecb3c;
          --p-border:        rgba(0,0,0,0.1);
          --p-shadow:        rgba(0,0,0,0.1);
          --p-content-bg:    rgba(245,249,249,0.79);
          --p-header-bg:     rgba(177,178,191,0.23);
          --p-header-shadow: 0 2px 8px rgba(0,0,0,0.3);
          --p-phonetic:      #07a457;
          --p-panel-anim:    eclipseHaloLightWarm;
          --p-link-kana-bg:  #66f16f69;
          --p-link-kana:     #dae2da; 
        }
      }

      /* 页面背景检测（JS 写入 data-detected）*/
      :host([data-detected="dark"]) {
        --p-bg:            rgba(18,18,18,0.95);
        --p-text-main:     #ffffffb7;
        --p-text-muted:    rgba(255,255,255,0.6);
        --p-text-detail:   rgba(255,255,255,0.6);
        --p-border:        rgba(255,255,255,0.1);
        --p-shadow:        rgba(0,0,0,0.5);
        --p-accent:        #38bdf8;  
        --arrowColor:      rgb(34, 197, 94);
        --p-content-bg:    rgba(39,39,50,0.39);
        --p-header-bg:     rgba(31,31,35,0.34);
        --p-header-shadow: 0 2px 8px rgba(235,215,215,0.09);
        --p-phonetic:      #38bdf8;
        --p-panel-anim:    eclipseHalo;
        --p-link-kana-bg: #064e3b;
        --p-link-kana:     #dae2da; 
      }

      /* ── 光晕动画 ── */
      @keyframes eclipseHalo {
        0%,100% { box-shadow: 0 0 8px 2px rgba(56,189,248,0.25), 0 0 20px 4px rgba(124,222,255,0.15), 0 0 35px 6px rgba(186,230,253,0.08), 0 10px 30px var(--p-shadow); }
        50%     { box-shadow: 0 0 15px 4px rgba(56,189,248,0.5), 0 0 30px 8px rgba(124,222,255,0.3), 0 0 50px 12px rgba(186,230,253,0.15), 0 0 80px 20px rgba(219,239,255,0.05), 0 10px 30px var(--p-shadow); }
      }
      @keyframes eclipseHaloLightWarm {
        0%,100% { box-shadow: 0 0 8px 2px rgba(245,158,11,0.3), 0 0 20px 4px rgba(251,191,36,0.25), 0 0 35px 6px rgba(253,230,138,0.2), 0 10px 30px var(--p-shadow); }
        50%     { box-shadow: 0 0 15px 4px rgba(245,158,11,0.6), 0 0 30px 8px rgba(251,191,36,0.4), 0 0 50px 12px rgba(253,230,138,0.25), 0 0 80px 20px rgba(254,243,199,0.15), 0 10px 30px var(--p-shadow); }
      }
      /* 备用光晕（紫色/绿色，按需启用）*/
      @keyframes eclipseHaloLight {
        0%,100% { box-shadow: 0 0 8px 2px rgba(168,85,247,0.25), 0 0 20px 4px rgba(192,132,252,0.2), 0 10px 30px var(--p-shadow); }
        50%     { box-shadow: 0 0 15px 4px rgba(168,85,247,0.5), 0 0 30px 8px rgba(192,132,252,0.4), 0 10px 30px var(--p-shadow); }
      }
      @keyframes eclipseHaloLightAlt {
        0%,100% { box-shadow: 0 0 8px 2px rgba(74,222,128,0.3), 0 0 20px 4px rgba(134,239,172,0.2), 0 10px 30px var(--p-shadow); }
        50%     { box-shadow: 0 0 15px 4px rgba(74,222,128,0.6), 0 0 30px 8px rgba(134,239,172,0.4), 0 10px 30px var(--p-shadow); }
      }

@keyframes panelFloatLight {
  0%,100% { box-shadow: 0 8px 24px rgba(0,0,0,0.16), 0 20px 48px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06); }
}

      /* ── 主面板 ── */
      .mira-kt-panel {
        pointer-events:   auto;
        position:         fixed;
        color:            var(--p-text-main);
        background:       var(--p-bg) !important;
        backdrop-filter:  blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border-top:       1px solid rgba(255,255,255,0.12) !important;
        border-left:      1px solid rgba(255,255,255,0.12) !important;
        box-shadow:       0 8px 30px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1);
        border-radius:    16px !important;
        padding:          0 !important;
        z-index:          2147483647;
        box-sizing:       border-box;
        min-height:       150px;
        max-height:       85vh;
        max-width:        min(450px, calc(100vw - 20px)) !important;
        min-width:        min(280px, calc(100vw - 20px)) !important;
        width:            fit-content;
        display:          flex;
        flex-direction:   column;
        align-items:      flex-start !important;
        overflow:         hidden !important;
        resize:           none;
        word-wrap:        break-word;
        overflow-wrap:    break-word;
        word-break:       break-word;
        transition:       opacity .2s cubic-bezier(.4,0,.2,1), transform .2s cubic-bezier(.34,1.56,.64,1);
        animation:        var(--p-panel-anim, eclipseHalo) 6s ease-in-out infinite;
      }
      :host([theme="light"]) .panel { animation-name: eclipseHaloLightWarm; animation-duration: 8s; }
      .panel:hover                  { animation-duration: 3s !important; }
      :host([theme="light"]) .panel:hover { animation-duration: 4s !important; }

      .is-hidden {
        opacity:          0 !important;
        pointer-events:   none !important;
        transform:        scale(0.8) translateY(8px) !important;
      }

      /* ── 拖拽区 ── */
      #drag-zone {
        position:   absolute;
        top:        0;
        left:       0;
        right:      0;
        height:     46px;
        width:      calc(100% - 110px);
        cursor:     grab;
        z-index:    1000000000;
      }

      /* ── 头部 ── */
      #p-header-wrapper {
        position:         relative;
        z-index:          1000;
        width:            100%;
        box-sizing:       border-box;
        padding:          8px 16px 0;
        background:       var(--p-header-bg) !important;
        backdrop-filter:  blur(20px) saturate(180%);
        box-shadow:       var(--p-header-shadow);
        display:          flex;
        pointer-events:   none;
      }

      #p-header {
        height:         20px;
        cursor:         grab;
        display:        flex;
        justify-content: space-between;
        align-items:    center;
        margin-bottom:  6px;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      }

      /* Logo 动画 */
      @keyframes logo-glow {
        0%,100% { filter: drop-shadow(0 0 2px rgba(56,189,248,0.5)); }
        50%     { filter: drop-shadow(0 0 6px rgba(56,189,248,0.9)); }
      }
      #p-header img { animation: logo-glow 3s ease-in-out infinite; }

      /* ── 主容器 ── */
      #p-main-container {
        flex:       1;
        display:    flex;
        flex-direction: column;
        min-height: 0;
        min-width:  0;
        width:      100%;
        background: transparent !important;
        color:      var(--p-text-main);
        overflow:   visible !important;
      }

      /* ── 内容区 ── */
      #p-content-container {
        flex:         1;
        padding-top:  6px !important;
        overflow-y:   auto !important;
        overflow-x:   hidden;
        word-break:   break-word;
        min-height:   0;
        position:     relative;
        z-index:      5;
        display:      block;
        background:   var(--p-content-bg) !important;
        contain:      nosize;
        will-change:  transform;
      }
      #p-content-container::-webkit-scrollbar       { width: 10px; background: transparent !important; }
      #p-content-container::-webkit-scrollbar-track { background: transparent !important; }
      #p-content-container::-webkit-scrollbar-thumb {
        background-color: var(--p-text-muted) !important;
        border-radius:    20px !important;
        border:           3px solid transparent !important;
        background-clip:  padding-box !important;
        transition:       background-color .2s ease;
      }
      #p-content-container::-webkit-scrollbar-thumb:hover {
        background-color: var(--p-accent) !important;
        background-clip:  padding-box !important;
      }

      /* ── 控制栏（右上角按钮组）── */
      .header-controls {
        position:      absolute;
        top:           1px;
        right:         9px;
        height:        28px;
        display:       flex;
        align-items:   center;
        gap:           3px;
        z-index:       10001;
        pointer-events: auto !important;
      }

      /* ── 通用图标按钮 ── */
      .icon-btn {
        display:        inline-flex;
        align-items:    center;
        justify-content: center;
        width:          30px;
        height:         30px;
        background:     transparent;
        border:         none;
        border-radius:  8px;
        color:          #94a3b8;
        cursor:         pointer;
        padding:        0;
        flex-shrink:    0;
        overflow:       visible;
        outline:        none;
        transition:     all .3s cubic-bezier(.4,0,.2,1);
        transform:      scale(1);
        -webkit-user-select: none;
        user-select:    none;
      }
      .icon-btn svg {
        display:        block;
        pointer-events: none;
        stroke:         var(--p-text-muted) !important;
        fill:           none;
        z-index:        1;
      }
      .icon-btn:hover       { transform: scale(1.1); }
      .icon-btn:hover svg   { transform: scale(1.1); }

      .save-btn:hover svg {stroke: #ffaa00a7 !important;}

      /* 主题切换 */
      .icon-btn.theme svg#theme-icon {
        width:      15px !important;
        height:     15px !important;
        fill:       none !important;
        transition: stroke .3s ease, filter .3s ease, transform .3s ease !important;
      }
      .icon-btn.theme:hover            { transform: scale(1.1) !important; }
      .icon-btn.theme:hover svg        { stroke: #ffaa00a7 !important; filter: drop-shadow(0 0 3px #ff7b00af) !important; }
      .icon-btn.theme:active           { transform: scale(0.92) !important; }

      /* 发音按钮 */
      #p-speak:hover     { background: rgba(56,189,248,0.2) !important; box-shadow: 0 0 8px rgba(56,189,248,0.4); }
      #p-speak:hover svg { stroke: #38bdf8 !important; }

      /* 收藏按钮 */
      #p-save:hover     { background: rgba(250,204,21,0.2) !important; box-shadow: 0 0 8px rgba(250,204,21,0.4); }
      #p-save:hover svg { filter: drop-shadow(0 0 5px rgba(250,204,21,0.4)); }
      #star-icon        { transition: all .2s ease !important; transform-origin: center; }
      .is-saved         { color: #facc15 !important; }
      .is-saved svg     { fill: #facc15 !important; stroke: #facc15 !important; }

      /* 刷新按钮 */
      #p-refresh:hover     { background: rgba(34,197,94,0.2) !important; box-shadow: 0 0 8px rgba(34,197,94,0.4); }
      #p-refresh:hover svg { stroke: #4ade80 !important; }
      @keyframes res-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .spinning svg        { animation: res-rotate .6s linear infinite; stroke: #4ade80 !important;}

      /* 固定按钮 */
      #p-pin {
        display:    flex !important;
        align-items: center;
        justify-content: center;
        width:      32px;
        height:     32px;
        overflow:   visible !important;
        pointer-events: auto !important;
      }
      #pin-icon {
        display:    block !important;
        transform:  rotate(-45deg);
        transition: transform .4s cubic-bezier(.4,0,.2,1), stroke .4s ease !important;
      }
      #p-pin:hover #pin-icon          { stroke: #38bdf8 !important; opacity: 1 !important; transform: scale(1.1) !important; }
      #p-pin.is-pinned #pin-icon      { stroke: #38bdf8 !important; fill: #38bdf8 !important; transform: rotate(0deg) scale(1.05) !important; opacity: 1 !important; }

      /* 关闭按钮 */
      .close-btn {
        padding: 8px;
        cursor: pointer;
        font-size: 16px;
        font-weight: bold;
        color: #7889a1;
        line-height: 1;
        pointer-events: auto !important;
        -webkit-user-select: none; /* Chrome, Safari, Opera */
        -moz-user-select: none;
        user-select: none;         /* 标准语法 */
      }
      .close-btn:hover  { color: #f87171 !important; filter: drop-shadow(0 0 5px rgba(239,68,68,0.3)); transform: rotate(90deg); transition: all .3s; }
      .close-btn:active { transform: scale(0.9); }

      /* ── Resize 手柄 ── */
      .resizer {
        background:     transparent;
        pointer-events: auto !important;
        z-index:        2147483648 !important;
        position:       absolute;
      }
      .resizer:hover { background: rgba(56,189,248,0.05); }

      /* ── Logo 浮动按钮 ── */
      .eclipse-logo-btn {
        position:     fixed;
        width:        22px;
        height:       22px;
        background:   transparent !important;
        display:      none;
        align-items:  center;
        justify-content: center;
        cursor:       pointer;
        z-index:      2147483647;
        transition:   transform .2s cubic-bezier(.175,.885,.32,1.2), opacity .2s;
        opacity:      0;
        transform:    scale(0.5);
        pointer-events: auto;
      }
      .eclipse-logo-btn.show { display: flex !important; opacity: 1 !important; transform: scale(1) !important; }
      .eclipse-logo-btn img  { width: 18px; height: 18px; border-radius: 4px; filter: drop-shadow(0 0 3px rgba(0,0,0,0.3)); }

      .glowing-icon {
        display:      inline-block;
        width:        21px;
        height:       21px;
        border-radius: 4px;
        position:     relative;
        background:   rgba(100,180,255,0.1);
        animation:    icon-glow 2s ease-in-out infinite;
      }
      .glowing-icon img {
        width:      100%;
        height:     100%;
        border-radius: 2px;
        position:   relative;
        z-index:    2;
        filter:     brightness(1.2);
      }
      @keyframes icon-glow {
        0%,100% { box-shadow: 0 0 6px rgba(100,180,255,0.7), 0 0 10px rgba(100,180,255,0.4); }
        50%     { box-shadow: 0 0 10px rgba(120,220,255,0.9), 0 0 16px rgba(100,200,255,0.6); }
      }

      /* ── 发音动画 ── */
      @keyframes speak-jump-fancy {
        0%,100% { transform: scale(1.15) rotate(0deg);  filter: drop-shadow(0 0 2px #38bdf8); }
        25%     { transform: scale(1.3)  rotate(-5deg); filter: drop-shadow(0 0 12px #38bdf8); }
        50%     { transform: scale(1.1)  rotate(5deg);  filter: drop-shadow(0 0 5px #38bdf8); }
        75%     { transform: scale(1.25) rotate(-3deg); filter: drop-shadow(0 0 10px #38bdf8); }
      }
      @keyframes wave-ripple {
        0%   { transform: translate(-50%,-50%) scale(0.8); opacity: 0.8; border-width: 2px; }
        100% { transform: translate(-50%,-50%) scale(2.5); opacity: 0;   border-width: 1px; }
      }
      @keyframes speak-loading {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }

      
@keyframes tts-loading-spin {
  to {
    transform: rotate(360deg);
  }
}

.tts-loading {
  position: relative;
}

.tts-loading::before {
  content: "";
  position: absolute;
  top: 0;
  left: -3px;
  right: 0;
  bottom: 0;
  margin: auto;
  width: 14px;
  height: 14px;
  border: 1.5px solid rgba(56, 189, 248, 0.2);
  border-top-color: #38bdf8;
  border-radius: 50%;
  pointer-events: none;
  animation: tts-loading-spin 0.7s linear infinite;
}

.tts-loading svg {
  opacity: 0.3;
}
      .mira-font-family{
          font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', Roboto, sans-serif !important;
      }
      .speak-btn {
        position:   relative;
        width:      32px;
        height:     32px;
        display:    flex;
        margin-top: 4px;
        align-items: center;
        justify-content: center;
        z-index:    100;
        overflow:   visible !important;
        vertical-align: sub;
        transition: all .3s cubic-bezier(.175,.885,.32,1.275);
      }
      .speak-btn svg            { position: relative; z-index: 2; transition: stroke .3s ease; }
      .speak-btn:hover:not(.is-speaking) svg { filter: drop-shadow(0 0 8px #38bdf8); transform: scale(1.05); }
      .speak-btn::before,
      .speak-btn::after         { pointer-events: none; }

      /* 播放中状态 */
      .speak-btn.is-speaking svg {
        animation: speak-jump-fancy .5s ease-in-out infinite;
        stroke:    #38bdf8  !important;
        filter:    drop-shadow(0 0 5px #38bdf8);
      }
      .speak-btn.is-speaking::before,
      .speak-btn.is-speaking::after {
        content:       "";
        position:      absolute;
        top:   50%; left: 50%;
        transform:     translate(-50%,-50%);
        width:  100%; height: 100%;
        border:        2px solid #38bdf8;
        border-radius: 50%;
        z-index:       1;
      }
      .speak-btn.is-speaking::before { animation: wave-ripple 1s cubic-bezier(0,0,.2,1) infinite; }
      .speak-btn.is-speaking::after  { animation: wave-ripple 1s cubic-bezier(0,0,.2,1) infinite .5s; }

      /* 加载中状态 */
      .speak-btn.is-loading::before {
        content:       "";
        position:      absolute;
        inset:         0;
        margin:        auto;
        width:  24px; height: 24px;
        border:        2px solid rgba(56,189,248,0.2);
        border-top-color: #38bdf8;
        border-radius: 50%;
        z-index:       1;
        animation:     speak-loading .7s linear infinite;
      }
      .speak-btn.is-loading svg { opacity: 0.4; stroke: #38bdf8 !important; }

      /* ── 内容区文字样式 ── */
      .basic {
        font-size:   17px;
        color:       var(--p-accent);
        margin:      2px 0 2px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      }
      .detail {
        font-size:   13.5px;
        color:       var(--p-text-detail);
        line-height: 1.6;
        border-top:  1px solid var(--p-border);
        padding-top: 7px;
      }
        #p-source {
        color: var(--p-text-main);
        font-size: 11px;
        margin-top: 12px;
        opacity: 0.7;
      }

    #p-source a {
      color: var(--p-accent);
      text-decoration: none;
      font-weight: 600;

      border-bottom: 1.5px solid rgba(var(--p-accent-rgb), 0.4);

      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      padding: 1px 4px;
      margin-left: 2px;
    }

    #p-source a:hover {
      opacity: 1;
      background: rgba(var(--p-accent-rgb), 0.25);
      filter: brightness(1.3);
      text-shadow: 0 0 5px rgba(var(--p-accent-rgb), 0.4);
      border-bottom-color: var(--p-accent);
      color: var(--p-accent);
    }

    @keyframes neon-click-spread {
      0% {
        box-shadow: 0 0 0 0px color-mix(in srgb, var(--p-accent) 60%, transparent);
        transform: scale(0.96);
      }
      100% {
        box-shadow: 0 0 4px 20px color-mix(in srgb, var(--p-accent) 0%, transparent);
        transform: scale(1);
      }
    }

    .lang-tag-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 10px;
  cursor: pointer;
  border-radius: 6px;
  border: none !important;
  outline: none;
  background: transparent !important;
  box-shadow: none; 
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  min-width: unset;
  width: auto;
  height: auto;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
}

.lang-tag-btn:hover { 
  background: color-mix(in srgb, var(--p-accent) 18%, transparent) !important;
  box-shadow: 0 0 8px color-mix(in srgb, var(--p-accent) 50%, transparent);
  transform: none;
}

.lang-tag-btn:active { 
  background: color-mix(in srgb, var(--p-accent) 28%, transparent) !important;
  box-shadow: 0 0 4px color-mix(in srgb, var(--p-accent) 50%, transparent);
}

      #p-engine-wrap:hover,
      .p-eng-item:hover,
      .p-eng-subitem:hover {
        background: rgba(99, 102, 241, 0.12);
        border-radius: 7px;
      }
      #p-engine-dropdown::-webkit-scrollbar {
        width: 4px;
      }
      #p-engine-dropdown::-webkit-scrollbar-track {
        background: transparent;
      }
      #p-engine-dropdown::-webkit-scrollbar-thumb {
        background: color-mix(in srgb, var(--p-accent) 40%, transparent);
        border-radius: 4px;
      }

      /* 例句喇叭 */
    .mira-example-speak {
      position: relative;
      transition: all 0.2s;
      opacity: 0.6;
    }
      .mira-example-speak:hover {
      opacity: 1;
    }
    .mira-example-speak.is-speaking {
      opacity: 1;
      color: #38bdf8 !important;
      filter: drop-shadow(0 0 4px rgba(56,189,248,0.8));
    }
      .mira-example-speak.is-speaking svg {
      stroke: #38bdf8 !important;
      filter: drop-shadow(0 0 4px rgba(56,189,248,0.8));
    }
    .mira-example-speak.is-speaking::before,
    .mira-example-speak.is-speaking::after {
      content: "";
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 100%; height: 100%;
      border: 1.5px solid #38bdf8;
      border-radius: 50%;
      pointer-events: none;
    }
    .mira-example-speak.is-speaking::before { animation: wave-ripple 1s cubic-bezier(0,0,.2,1) infinite; }
    .mira-example-speak.is-speaking::after  { animation: wave-ripple 1s cubic-bezier(0,0,.2,1) infinite .5s; }
  
    .mira-neon-btn {
        display: none;
        font-size: 11px;
        color: var(--p-link-kana);
        cursor: pointer;
        user-select: none;
        padding: 2px 6px; 
        border-radius: 6px;
        background: var(--p-link-kana-bg);  
        margin-left: 8px;
        white-space: nowrap;
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }
  
    .mira-neon-btn:hover {
        color: #ffffff; 
        border-color: #34d399; 
        background-color: #059669; 
        box-shadow: 0 0 8px rgba(52, 211, 153, 0.6), 
                    0 0 20px rgba(52, 211, 153, 0.3);
    }

    .neon-engine-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        padding: 5px 7px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 550;
        color: var(--p-accent);
        background: color-mix(in srgb, var(--p-accent) 10%, transparent);
        user-select: none;
        -webkit-user-select: none;
        white-space: nowrap;
        transition: all 0.3s ease;
    }

    .neon-engine-btn:hover {
        background: color-mix(in srgb, var(--p-accent) 25%, transparent);
        box-shadow: 0 0 10px color-mix(in srgb, var(--p-accent) 50%, transparent);
    }
      `;

    return style;
  }

  // ─── 面板 HTML 模板 ──────────────────────────────────────────────────────────

  function buildPanelHTML() {
    return `
    <div id="drag-zone"></div>
    <div id="p-main-container">
      <div class="header-controls">
        <div id="p-theme-toggle" class="icon-btn theme" title="">
          <svg id="theme-icon" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2.8"
              stroke-linecap="round" stroke-linejoin="round"></svg>
        </div>
        <div id="p-pin" class="icon-btn" title="${t("pinUnpin")}">
          <svg id="pin-icon" width="16" height="16" viewBox="0 0 24 28"
              fill="none" stroke="currentColor" stroke-width="2.8"
              stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2"></path>
            <path d="M7 10v4a2 2 0 0 1-2 2 2 2 0 0 0 0 4h14a2 2 0 0 0 0-4 2 2 0 0 1-2-2v-4"></path>
            <line x1="12" y1="22" x2="12" y2="28"></line>
          </svg>
        </div>
        <div id="close-p" class="close-btn" title="${t("closeWindow")}">✕</div>
      </div>
      <div id="p-header-wrapper" style="pointer-events:auto;"></div>
      <div id="p-content-container" style="pointer-events:auto;"></div>
    </div>

    <!-- Resize 手柄 -->
    <div class="resizer" data-dir="t"  style="top:-5px;  left:10px;  right:10px; height:10px; cursor:ns-resize;"></div>
    <div class="resizer" data-dir="b"  style="bottom:-5px;left:10px; right:10px; height:10px; cursor:ns-resize;"></div>
    <div class="resizer" data-dir="l"  style="left:-5px; top:10px;  bottom:10px;width:10px;  cursor:ew-resize;"></div>
    <div class="resizer" data-dir="r"  style="right:-7px;top:10px;  bottom:10px;width:10px;  cursor:ew-resize;"></div>
    <div class="resizer" data-dir="tl" style="top:-8px;  left:-8px; width:16px; height:16px; cursor:nwse-resize;"></div>
    <div class="resizer" data-dir="tr" style="top:-8px;  right:-8px;width:16px; height:16px; cursor:nesw-resize;"></div>
    <div class="resizer" data-dir="bl" style="bottom:-8px;left:-8px;width:16px; height:16px; cursor:nesw-resize;"></div>
    <div class="resizer" data-dir="br" style="bottom:-8px;right:-8px;width:16px;height:16px; cursor:nwse-resize;"></div>`;
  }

  // ─── 辅助函数 ────────────────────────────────────────────────────────────────

  function setPanelGlowColor(panel) {
    if (typeof chrome === "undefined" || !chrome.runtime?.id) return;
    const rgb = window
      .getComputedStyle(document.body)
      .backgroundColor.match(/\d+/g);
    if (!rgb) return;
    const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
    panel?.style.setProperty(
      "--glow-color",
      brightness > 200 ? "rgba(0,150,255,1)" : "rgba(56,220,255,1)",
    );
  }

  const themeIcons = {
    auto: `<circle cx="12" cy="12" r="10" stroke-width="2"></circle>
          <path d="M12 2v20M2 12h20" stroke-opacity="0.3"></path>
          <path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"></path>`,
    light: `<circle cx="12" cy="12" r="5.5" stroke-width="2"></circle>
          <path d="M12 1.5v2.5"></path>
          <path d="M12 20v2.5"></path>
          <path d="M1.5 12h2.5"></path>
          <path d="M20 12h2.5"></path>
          <path d="m4.5 4.5 1.8 1.8"></path>
          <path d="m19.5 4.5-1.8 1.8"></path>
          <path d="m4.5 19.5 1.8-1.8"></path>
          <path d="m19.5 19.5-1.8-1.8"></path>`,
    dark: `<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" stroke-width="2"></path>`,
  };

  const getWebPageBrightness = () => {
    const tryColor = (el) => window.getComputedStyle(el).backgroundColor;
    let color = tryColor(document.body);
    if (color === "rgba(0, 0, 0, 0)" || color === "transparent")
      color = tryColor(document.documentElement);
    const rgb = color.match(/\d+/g);
    if (!rgb || rgb.length < 3)
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 < 128
      ? "dark"
      : "light";
  };

  const updateThemeUI = (mode, shadow, shadowHost) => {
    localStorage.setItem("eclipse-theme", mode);
    const applied = mode === "auto" ? getWebPageBrightness() : mode;
    shadowHost.setAttribute("theme", applied);
    const icon = shadow.getElementById("theme-icon");
    if (icon) icon.innerHTML = themeIcons[mode];
    const btn = shadow.getElementById("p-theme-toggle");
    if (btn)
      btn.title = {
        auto: t("autoTheme"),
        light: t("lightTheme"),
        dark: t("darkTheme"),
      }[mode];

    // 切换主题时同步更新链接颜色
    const isDark = applied === "dark";

    // 更新 source 链接
    const sourceA = shadow.querySelector("#p-source a");
    if (sourceA) {
      const normalColor = isDark ? "#7dd3fc" : "#0369a1";
      const hoverColor = isDark ? "#bae6fd" : "#01478a";
      const normalBg = isDark
        ? "rgba(56,189,248,0.15)"
        : "rgba(3,105,161,0.08)";
      const hoverBg = isDark ? "rgba(56,189,248,0.28)" : "rgba(3,105,161,0.15)";
      sourceA.style.color = normalColor;
      sourceA.style.background = normalBg;
      sourceA.onmouseover = () => {
        sourceA.style.color = hoverColor;
        sourceA.style.background = hoverBg;
      };
      sourceA.onmouseout = () => {
        sourceA.style.color = normalColor;
        sourceA.style.background = normalBg;
      };
    }

    // 更新 cambridge 链接
    const cambridgeA = shadow.querySelector("#p-source a:last-of-type");
    if (cambridgeA) {
      const caNormalColor = isDark ? "#cbd5e1" : "#475569";
      const caHoverColor = isDark ? "#f1f5f9" : "#1e293b";
      const caNormalBg = isDark
        ? "rgba(148,163,184,0.15)"
        : "rgba(71,85,105,0.08)";
      const caHoverBg = isDark
        ? "rgba(148,163,184,0.28)"
        : "rgba(71,85,105,0.15)";
      cambridgeA.style.color = caNormalColor;
      cambridgeA.style.background = caNormalBg;
      cambridgeA.onmouseover = () => {
        cambridgeA.style.color = caHoverColor;
        cambridgeA.style.background = caHoverBg;
      };
      cambridgeA.onmouseout = () => {
        cambridgeA.style.color = caNormalColor;
        cambridgeA.style.background = caNormalBg;
      };
    }

    // 更新 cambridge top 链接
    const cambridgeTopA = shadow.querySelector("#p-cambridge-top a");
    if (cambridgeTopA) {
      const normalColor = isDark ? "#7dd3fc" : "#0369a1";
      const hoverColor = isDark ? "#38bdf8" : "#01478a";
      cambridgeTopA.style.color = normalColor;
      cambridgeTopA.onmouseover = () => {
        cambridgeTopA.style.color = hoverColor;
        cambridgeTopA.style.opacity = "1";
      };
      cambridgeTopA.onmouseout = () => {
        cambridgeTopA.style.color = normalColor;
        cambridgeTopA.style.opacity = "0.9";
      };
    }
  };

  async function getMiraModels() {
    // 先读缓存
    const cached = await safeGetStorage("mira_models_cache");
    const cache = cached?.mira_models_cache;
    const ONE_HOUR = 60 * 60 * 1000;

    // 缓存存在且未过期（1小时内）
    if (cache?.models?.length && Date.now() - cache.timestamp < ONE_HOUR) {
      return cache.models;
    }

    // 缓存过期或不存在，重新 fetch
    try {
      const resp = await fetch(MODELS_URL);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const notice = await resp.json();
      const models = (notice.models || []).map((m) => ({
        id: m.id,
        label: m.label,
        tag: m.tag || "",
        tagColor: m.tagColor || "#7c3aed",
      }));
      // 存入缓存
      await safeSetStorage({
        mira_models_cache: { models, timestamp: Date.now() },
      });
      return models;
    } catch (e) {
      // fetch 失败，用旧缓存（即使过期）
      if (cache?.models?.length) return cache.models;
      // 实在没有，用内置备用
      return MIRA_FALLBACK_MODELS;
    }
  }

  function createEngineDropdown(
    anchorEl,
    shadow,
    shadowHost,
    userConfigs,
    currentId,
    currentModel,
    onSelect,
  ) {
    const shadowRoot = shadowHost.shadowRoot;

    // 已存在则关闭
    const existing = shadowRoot.getElementById("p-engine-dropdown");
    if (existing) {
      existing.remove();
      return;
    }

    const isDark =
      shadowHost.getAttribute("theme") === "dark" ||
      (shadowHost.getAttribute("theme") !== "light" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    const colors = isDark
      ? {
        bg: "rgba(18,18,18,0.4)",
        border: "rgba(255,255,255,0.27)",
        shadow: "0 8px 24px rgba(0,0,0,0.6)",
        text: "#ffffffb7",
        textMuted: "rgba(255,255,255,0.50)",
        hoverBg: "rgba(56,189,248,0.15)",
        accent: "#38bdf8",
        activeBg: "rgba(56,189,248,0.15)",
      }
      : {
        bg: "rgba(255,255,255,0.97)",
        border: "rgba(0,0,0,0.1)",
        shadow: "0 8px 24px rgba(0,0,0,0.15)",
        text: "#1a202c",
        textMuted: "#718096",
        hoverBg: "rgba(2,132,199,0.1)",
        accent: "#0284c7",
        activeBg: "rgba(2,132,199,0.1)",
      };

    const dropdown = document.createElement("div");
    dropdown.id = "p-engine-dropdown";
    dropdown.style.cssText = `
          position:fixed; z-index:2147483647;
          background:${colors.bg}; border:1px solid ${colors.border};
          border-radius:10px; box-shadow:${colors.shadow};
          max-height:360px; overflow-y:auto; min-width:200px;
          padding:4px; font-size:12px; color:${colors.text};
          pointer-events:auto;
          backdrop-filter:blur(20px) saturate(180%);
          -webkit-backdrop-filter:blur(20px) saturate(180%);
      `;

    dropdown.addEventListener(
      "wheel",
      (ev) => {
        ev.stopPropagation();
        dropdown.scrollTop += ev.deltaY;
      },
      { passive: false },
    );

    // 定位
    const btnRect = anchorEl.getBoundingClientRect();
    const gap = 6;
    const dropW = 200;
    const dropH = 360;
    let left = btnRect.left;
    let top = btnRect.bottom + gap;
    if (left + dropW > window.innerWidth)
      left = window.innerWidth - dropW - gap;
    if (left < gap) left = gap;
    if (top + dropH > window.innerHeight) top = btnRect.top - dropH - gap;
    dropdown.style.top = `${top}px`;
    dropdown.style.left = `${left}px`;

    // 滚动条样式
    const scrollStyle = document.createElement("style");
    scrollStyle.textContent = `
        #p-engine-dropdown::-webkit-scrollbar { width: 4px; }
        #p-engine-dropdown::-webkit-scrollbar-track { background: transparent; }
        #p-engine-dropdown::-webkit-scrollbar-thumb {
            background: ${colors.textMuted}; border-radius: 4px;
        }
    `;
    dropdown.appendChild(scrollStyle);

    // 覆写 remove
    const origRemove = dropdown.remove.bind(dropdown);
    dropdown.remove = () => {
      origRemove();
      anchorEl.classList.remove("is-open");
      shadowHost.style.pointerEvents = "none";
    };
    //const miraModels = await getMiraModels();
    // 构建列表项
    userConfigs.forEach((cfg) => {
      const isMira = cfg.engine === "mira_pro";
      const isEngineActive = cfg.id === currentId;

      if (isMira) {
        const header = document.createElement("div");
        header.classList.add("mira-font-family");
        header.style.cssText = `
        display:flex; align-items:center; gap:6px;
        padding:6px 10px; font-size:12px; font-weight:600;
        color:${colors.textMuted}; user-select:none;
    `;
        if (enable_pro_features) {
          header.innerHTML = `<span style="color:#fbbf24;">✦</span> Mira AI Translator
        <span style="margin-left:auto; background: linear-gradient(135deg, rgb(245, 158, 11), rgb(217, 119, 6)) !important; color:#fff;
            font-size:9px; padding:1px 5px; border-radius:8px;">Pro</span>`;
          dropdown.appendChild(header);
        }

        //  创建子项容器
        const miraContainer = document.createElement("div");
        miraContainer.id = "p-mira-models-list";
        dropdown.appendChild(miraContainer);
        miraContainer.classList.add("mira-font-family");
        //  渲染函数
        const buildMiraItems = (models) => {
          miraContainer.innerHTML = "";
          models.forEach((m) => {
            const isActive = isEngineActive && currentModel === m.id;
            const item = document.createElement("div");
            item.style.cssText = `
                display:flex; align-items:center; gap:8px;
                padding:5px 10px 5px 24px; border-radius:7px; cursor:pointer;
                color:${isActive ? colors.accent : colors.text};
                background:${isActive ? colors.activeBg : "transparent"};
                transition:background 0.15s;
            `;
            item.innerHTML = `
                <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m.label}</span>
                <span style="font-size:9px; padding:1px 5px; border-radius:8px; flex-shrink:0;
                    background:${m.tagColor}22; color:${m.tagColor};">${m.tag}</span>
            `;
            item.onmouseenter = () => {
              if (!isActive) item.style.background = colors.hoverBg;
            };
            item.onmouseleave = () => {
              if (!isActive) item.style.background = "transparent";
            };
            item.onclick = (ev) => {
              ev.stopPropagation();
              dropdown.remove();
              onSelect(cfg, m.id);
            };
            miraContainer.appendChild(item);
          });
        };

        if (enable_pro_features) {
          buildMiraItems(MIRA_FALLBACK_MODELS);

          getMiraModels().then((models) => {
            if (!shadowRoot.getElementById("p-engine-dropdown")) return;
            buildMiraItems(models);
          });
        }
      } else {
        // 普通引擎
        const isActive = isEngineActive;
        const item = document.createElement("div");

        item.classList.add("mira-font-family");
        item.style.cssText = `
                display:flex; align-items:center; gap:8px;
                padding:6px 10px; border-radius:7px; cursor:pointer;
                color:${isActive ? colors.accent : colors.text};
                background:${isActive ? colors.activeBg : "transparent"};
                font-weight:${isActive ? "600" : "400"};
                transition:background 0.15s;
            `;
        item.innerHTML = `
                <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${cfg.alias}
                </span>
            `;
        item.onmouseenter = () => {
          if (!isActive) item.style.background = colors.hoverBg;
        };
        item.onmouseleave = () => {
          if (!isActive) item.style.background = "transparent";
        };
        item.onclick = (ev) => {
          ev.stopPropagation();
          dropdown.remove();
          onSelect(cfg, null);
        };
        dropdown.appendChild(item);
      }
    });

    // 挂载到 shadowRoot
    shadowRoot.appendChild(dropdown);
    shadowHost.style.pointerEvents = "auto";

    // 点击外部关闭
    const closeDropdown = (ev) => {
      const path = ev.composedPath();
      if (!path.includes(dropdown) && !path.includes(anchorEl)) {
        dropdown.remove();
        shadowRoot.removeEventListener("click", closeDropdown, true);
        document.removeEventListener("click", closeDropdown, true);
      }
    };
    setTimeout(() => {
      shadowRoot.addEventListener("click", closeDropdown, true);
      document.addEventListener("click", closeDropdown, true);
    }, 0);
  }
  async function switchEngineInPopup(
    cfg,
    model,
    userConfigs,
    shadow,
    dotEl,
    labelEl,
  ) {
    const instanceData =
      (await safeGetStorage(`data_${cfg.id}`))?.[`data_${cfg.id}`] || {};

    let finalInstanceData = instanceData;
    if (cfg.engine === "mira_pro" && model) {
      finalInstanceData = { ...instanceData, model };
    }

    const activeConfig = {
      id: cfg.id,
      engine: cfg.engine,
      data: finalInstanceData,
    };

    // 存储操作不 await，fire-and-forget
    safeSetStorage({
      activeConfig,
      lastActiveId: cfg.id,
      selectedEngine: cfg.engine,
      ...(cfg.engine === "mira_pro" && model
        ? { data_mira_pro: finalInstanceData }
        : {}),
    });

    // 立即更新 UI
    if (labelEl) {
      const m = MIRA_FALLBACK_MODELS.find((m) => m.id === model);
      labelEl.textContent =
        cfg.engine === "mira_pro"
          ? m
            ? m.label
            : "Mira"
          : (cfg.alias || cfg.engine).slice(0, 10);
    }
    if (dotEl) dotEl.style.background = "#6b7280";

    // 立即触发翻译
    shadow.getElementById("p-refresh")?.onclick({ stopPropagation: () => { } });
  }
  async function initEngineSelector(shadow) {
    const engineBtn = shadow.getElementById("p-engine-btn");
    if (engineBtn?._engineInitialized) return;  // 已初始化过，跳过
    if (engineBtn) engineBtn._engineInitialized = true;
    // 1. 读取数据
    const data = await safeGetStorage([
      "userConfigs",
      "activeConfig",
      "data_mira_pro",
    ]);
    if (!data) return;

    const builtInEngines = [
      { id: "mira_pro", engine: "mira_pro", alias: "✦ Mira AI Translator" },
      { id: "google_builtin", engine: "google", alias: "Google" },
      { id: "bing_builtin", engine: "bing", alias: "Bing" },
    ];

    const storedConfigs = data.userConfigs || [];
    const customConfigs = storedConfigs.filter(
      (c) => !["mira_pro", "google_builtin", "bing_builtin"].includes(c.id),
    );
    const userConfigs = [...builtInEngines, ...customConfigs];

    const activeConfig = data.activeConfig;
    const getDefaultEngineId = (userConfigs) => {
      return (
        userConfigs.find((c) => c.engine === _defaultEngine)?.id ||
        "google_builtin"
      );
    };

    const currentId =
      activeConfig?.id ||
      userConfigs.find((c) => c.engine === data.selectedEngine)?.id ||
      userConfigs.find((c) => c.engine === _defaultEngine)?.id ||
      getDefaultEngineId(userConfigs);
    const miraSaved = data.data_mira_pro || {};
    const currentModel = miraSaved.model || MIRA_FALLBACK_MODELS[0].id;

    // 2. 更新按钮标签
    function getShortAlias(cfg, modelId) {
      if (cfg.engine === "mira_pro") {
        const m = MIRA_FALLBACK_MODELS.find((m) => m.id === modelId);
        return m ? m.label : "Mira";
      }
      // 自定义引擎取前8字
      return (cfg.alias || cfg.engine).slice(0, 10);
    }

    const labelEl = shadow.getElementById("p-engine-label");
    const dotEl = shadow.getElementById("p-engine-dot");
    if (labelEl) {
      const curCfg =
        userConfigs.find((c) => c.id === currentId) || userConfigs[0];
      labelEl.textContent = getShortAlias(curCfg, currentModel);
    }
    shadow.host._engineDotEl = dotEl;
    // safeGetStorage('_engineAvailable').then(res => {
    //   if (!dotEl) return;
    //   if (res?._engineAvailable === true) dotEl.style.background = '#22c55e';
    //   else if (res?._engineAvailable === false) dotEl.style.background = '#ef4444';
    //   else dotEl.style.background = '#6b7280'; // 从未检测过，灰色
    // });

    // 4. 按钮点击
    const btn = shadow.getElementById("p-engine-btn");
    btn.onclick = async (e) => {
      e.stopPropagation();
      try {
        const latestData = await safeGetStorage([
          "activeConfig",
          "data_mira_pro",
          "selectedEngine",
          "_defaultEngine",
        ]);

        const latestConfig = latestData?.activeConfig;
        const latestId =
          (latestData?.activeConfig?.id &&
            userConfigs.find((c) => c.id === latestData.activeConfig.id)?.id) ||
          (latestData?.selectedEngine &&
            userConfigs.find((c) => c.engine === latestData.selectedEngine)?.id) ||
          (latestData?._defaultEngine &&
            userConfigs.find((c) => c.engine === latestData._defaultEngine)?.id) ||
          "google_builtin";
        const latestModel =
          latestData?.data_mira_pro?.model || MIRA_FALLBACK_MODELS[0].id;

        createEngineDropdown(
          btn,
          shadow,
          shadow.host,
          userConfigs,
          latestId,
          latestModel,
          async (cfg, model) => {
            await switchEngineInPopup(cfg, model, userConfigs, shadow, dotEl, labelEl);
          },
        );
      } catch (err) {
        logger.warn('[engine-btn] 下拉框加载失败:', err.message);
        // 不做任何处理，下次点击依然可以重试
      }
    };

    // // 点击外部关闭
    // shadow.host?.ownerDocument?.addEventListener('click', () => {
    //   if (dropdown) dropdown.style.display = 'none';
    // });
  }
  // ─── 渲染并展示翻译面板 ───────────────────────────────────────────────────────
  function setActionBtns(shadow, enabled) {
    ["p-speak", "p-save", "p-refresh"].forEach(id => {
      const btn = shadow.getElementById(id);
      if (!btn) return;
      btn.style.opacity = enabled ? "" : "0.4";
      btn.style.filter = enabled ? "" : "grayscale(1)";
      btn.style.pointerEvents = enabled ? "" : "none";
    });
  }
  function stopSpeech() {
    currentSpeakId++; // 让所有进行中的任务失效

    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
      currentAudio = null;
    }
    if (currentTimeoutId) {
      clearTimeout(currentTimeoutId);
      currentTimeoutId = null;
    }
    window.speechSynthesis?.cancel();
    if (window._currentSpeakBtn) {
      window._currentSpeakBtn.classList.remove('is-speaking', 'is-loading', 'speaking-wave', 'tts-loading');
      window._currentSpeakBtn = null;
    }
  }
  // 用上下文辅助检测源语言
  const detectedHintLang = (() => {
    const ctx = _capturedContext || "";
    if (ctx.length < 20) return null;
    return detectSourceLang(ctx) || null;
  })();
  async function renderAndShowPopup(
    text,
    pos,
    shadow,
    manualLang = "auto",
    hintSourceLang = null,
  ) {
    const state = {
      sourceLang: hintSourceLang || "auto",
      targetLang:
        window.currentTargetL || manualLang || getBrowserLang() || "en",
    };
    const isPinnedNow = shadowHost.getAttribute("data-pinned") === "true";
    const wordText = text.trim();
    shadowHost.setAttribute("data-current-word", wordText);

    const targetPrefix = (window.currentTargetL || "")
      .toLowerCase()
      .slice(0, 2);
    const isRTL = checkRTL(targetPrefix);
    const entry = await idb.vocabulary.get(wordText);
    const isSaved = !!(entry && !entry.deleted);
    let hintSourceLangNew = hintSourceLang;

    // 头部 HTML
    popupEl.querySelector("#p-header-wrapper").innerHTML = `
    <div id="p-header">
      <div style="display:flex;align-items:center;gap:5px;user-select:none;">
        <img src="${logoBase64}" style="width:23px;height:23px;border-radius:2px;filter:drop-shadow(0 0 4px var(--p-accent));">
        <span class="mira-font-family" style="opacity:0.6;font-size:11px;font-weight:bold;letter-spacing:2px;color:var(--p-text-main);font-style:italic;">${t("appName", window.uiLanguage) || APP_NAME}</span>
      </div>
      <div style="display:flex;gap:4px;align-items:center;height:40px;position:relative;z-index:30;right:-15px;">
        <div id="p-theme-toggle" class="icon-btn theme" title="">
          <svg id="theme-icon" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2.5"
              stroke-linecap="round" stroke-linejoin="round"></svg>
        </div>
      </div>
    </div>`;

    // 内容区
    const contentContainer = popupEl.querySelector("#p-content-container");
    contentContainer.style.cssText = `
    display:block;width:100%;box-sizing:border-box;
    overflow-y:auto;padding:0 15px 15px 21px;
    direction:${isRTL ? "rtl" : "ltr"};
    text-align:${isRTL ? "right" : "left"};`;

    contentContainer.innerHTML = buildContentHTML(text, isSaved);
    // 异步读取上次保存的源语言并更新显示
    safeGetStorage("lpLangA").then((res) => {
      const saved = res?.lpLangA;
      const srcSpan = shadow.getElementById("p-lang-src");
      if (srcSpan && saved && saved !== "auto") {
        // 从 LANGS 找短标签，fallback 到 code 前两位
        const match = LANGS.find((l) => l?.value === saved);
        srcSpan.textContent = match
          ? match.value.toUpperCase().slice(0, 2)
          : saved.toUpperCase().slice(0, 2);
        hintSourceLangNew = saved;
      }
    });

    initEngineSelector(shadow);
    // 面板可见
    popupEl.classList.remove("is-hidden");
    Object.assign(popupEl.style, {
      display: "flex",
      width: "fit-content",
      height: "auto",
      minWidth: "280px",
      minHeight: "100px",
      visibility: "hidden",
    });

    // 初始化 saveBtn 状态
    const saveBtnInit = shadow.getElementById("p-save");
    if (saveBtnInit) {
      saveBtnInit._miraReady = false;
      saveBtnInit._miraSnapshot = null;
    }

    // 应用用户尺寸配置
    const settings = (await safeGetStorage("uiConfig"))?.uiConfig || {};
    const vw = window.visualViewport?.width || window.innerWidth;
    const savedWidth = parseInt(settings.width) || 360;
    const finalWidth = Math.min(savedWidth, vw - 20);
    popupEl.style.width = finalWidth + "px";
    popupEl.style.maxWidth = finalWidth + "px";
    popupEl.style.maxHeight = settings.height || "50vh";

    // 调整查询词字号
    const pQuery = shadow.getElementById("p-query");
    if (!pQuery?.style) {
      // DOM 不完整，重新构建内容区
      contentContainer.innerHTML = buildContentHTML(text, isSaved);
      // 重新获取
      const pQueryRetry = shadow.getElementById("p-query");
      if (!pQueryRetry?.style) return;
    }
    const len = text.length;
    pQuery.style.fontSize =
      len > 100 ? "12px" : len > 40 ? "14px" : len > 10 ? "16px" : "22px";
    pQuery.style.lineHeight = len > 10 ? "1.4" : "1.2";

    setPanelGlowColor(popupEl);

    // 定位
    if (!isPinnedNow) {
      popupEl.style.visibility = "hidden"; // 先隐藏，避免左上角闪烁
      requestAnimationFrame(() => {
        const pw = popupEl.offsetWidth || 300;
        const ph = popupEl.offsetHeight || 200;
        let left = Math.max(
          10,
          Math.min(pos.clientX + 10, window.innerWidth - pw - 20),
        );
        let top =
          pos.clientY + ph + 15 > window.innerHeight - 20
            ? pos.clientY - ph - 15
            : pos.clientY + 15;
        top = Math.max(10, top);
        popupEl.style.left = left + "px";
        popupEl.style.top = top + "px";
        clampPopupToViewport(popupEl);
        popupEl.style.visibility = "visible"; //  定位完成后再显示
      });

    } else {
      popupEl.style.visibility = "visible";
    }

    // ── 事件绑定 ─────────────────────────────────────────────────────────────

    // 关闭
    shadow.getElementById("close-p").onclick = (e) => {
      e.stopPropagation();

      const existingDropdown =
        shadowHost.shadowRoot.getElementById("p-lang-dropdown");
      if (existingDropdown) existingDropdown.remove();

      shadowHost.setAttribute("data-pinned", "false");
      popupEl.classList.add("is-hidden");
      setTimeout(() => {
        if (shadowHost.getAttribute("data-pinned") !== "true")
          popupEl.style.display = "none";
      }, 200);
      stopSpeech();
    };

    // 固定
    const pinBtn = shadow.getElementById("p-pin");
    if (!pinBtn) return;
    const updatePinUI = (state) => {
      shadowHost.setAttribute("data-pinned", state ? "true" : "false");
      pinBtn.classList.toggle("is-pinned", state);
    };
    updatePinUI(isPinnedNow);
    pinBtn.onclick = (e) => {
      e.stopPropagation();
      updatePinUI(shadowHost.getAttribute("data-pinned") !== "true");
    };

    // 发音 
    shadow.getElementById("p-speak").onclick = (e) => {
      e.stopPropagation();
      const lang = (window.hintSourceLang || hintSourceLangNew);
      let finalLang = (!lang || lang === 'auto') ? null : lang;
      logger.log('[p-speak] 点击发音，hintSourceLangNew:', hintSourceLangNew, 'window.hintSourceLang:', window.hintSourceLang, '最终判断的 lang:', finalLang);
      logger.log('[p-speak] capturedContext:', _capturedContext?.slice(0, 50));
      // 如果没有明确语言，用上下文辅助判断
      if (!finalLang) {
        const ctx = _capturedContext || "";
        const detected = detectSourceLang(ctx || text);
        const langMap = { ja: 'ja-JP', zh: 'zh-CN', ko: 'ko-KR', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', ru: 'ru-RU', en: 'en-US' };
        finalLang = detected ? (langMap[detected] || null) : null;
      }
      logger.log('[p-speak] 经过上下文辅助判断后的最终发音语言:', finalLang);
      speakText(text, shadow.getElementById("p-speak"), finalLang);
    };
    function handleTranslationResult(result, text, shadow) {
      if (!result) return;
      const currentWord = shadowHost?.getAttribute("data-current-word");
      if (text.trim() !== currentWord) return;

      const targetPrefix = (window.currentTargetL || "")
        .toLowerCase()
        .slice(0, 2);
      const isRTL = checkRTL(targetPrefix);
      if (result.isPartial) {
        const pBasic = shadow.getElementById("p-basic");
        const pPhonetic = shadow.getElementById("p-phonetic");
        const pDetail = shadow.getElementById("p-detail");
        if (pBasic) {
          pBasic.innerText = result.basic || "";
          pBasic.style.fontStyle = "normal";
        }
        if (pPhonetic) {
          pPhonetic.innerText = result.sourcePhonetic
            ? `/${result.sourcePhonetic.replace(/[\[\]\/]/g, "")}/`
            : "";
        }
        if (pDetail) {
          pDetail.innerHTML = `<span class="mira-font-family" style="opacity:0.5;font-size:12px;font-style:italic;">${t("loading")}...</span>`;
          pDetail.style.display = "block";
        }
      } else {
        fillPopupData(
          result,
          shadow,
          text.trim(),
          window.currentTargetL,
          isRTL,
          null,
          effectiveHintLang,
        );
        if (shadowHost) shadowHost._detailFullyRendered = true;
      }
    }
    // 刷新翻译
    function triggerRefresh() {
      const refreshBtn = shadow.getElementById("p-refresh");
      if (refreshBtn?.classList.contains("spinning")) return;

      if (shadowHost) {
        clearTimeout(shadowHost._slowTimer);
        clearTimeout(shadowHost._detailTimer);
        shadowHost._slowTimer = null;
        shadowHost._detailTimer = null;
        shadowHost._detailFullyRendered = false;
      }

      const currentTargetLang = window.currentTargetL || state.targetLang;
      const currentSourceLang = state.sourceLang === "auto"
        ? (detectedHintLang || null)
        : state.sourceLang;

      // 判断是单词还是句子（单词：无空格且长度<=30）
      const isWord = !text.trim().includes(" ") && text.trim().length <= 30;

      const fingerprint =
        typeof hash === "function"
          ? hash(
            text
              .trim()
              .replace(/[\s\n\r\t.,!?;:。，！？、・「」]/g, "")
              .toLowerCase(),
          )
          : text.trim().substring(0, 50);

      idb
        .getAll("tr_")
        .then((allCache) => {
          return Promise.all(
            Object.keys(allCache)
              .filter((k) => k.includes(fingerprint))
              .map((k) => idb.remove(k)),
          );
        })
        .then(() => {
          const saveBtn = shadow.getElementById("p-save");
          if (saveBtn) saveBtn._miraReady = false;

          const basicEl = shadow.getElementById("p-basic");
          const phoneticEl = shadow.getElementById("p-phonetic");
          const pDetail = shadow.getElementById("p-detail");
          const pExamples = shadow.getElementById("p-examples");
          if (!basicEl?.style) return;

          if (refreshBtn) refreshBtn.classList.add("spinning");
          basicEl.innerHTML = `<span style="opacity:0.6;font-size:13px;font-style:italic;">${t("retranslate")}...</span>`;
          if (phoneticEl) phoneticEl.innerText = "";
          if (pExamples) pExamples.style.display = "none";

          if (isWord) {
            if (pDetail) {
              pDetail.style.display = "block";
              pDetail.innerHTML = `<span class="mira-font-family" style="opacity:0.5;font-size:12px;font-style:italic;">${t("loadingMore", window.uiLanguage)}</span>`;
            }
            // 8秒超时显示刷新按钮
            shadowHost._detailTimer = setTimeout(() => {
              if (shadowHost?._detailFullyRendered) return;
              const pDetail = shadow.getElementById("p-detail");
              if (pDetail) {
                pDetail.style.display = "block";
                pDetail.innerHTML = `<span class="mira-font-family" id="p-detail-retry" style="opacity:0.5;font-size:12px;font-style:italic;cursor:pointer;text-decoration:underline;">↻ ${t("retry", window.uiLanguage) || "retry"}</span>`;
                shadow
                  .getElementById("p-detail-retry")
                  ?.addEventListener("click", () => {
                    shadow.getElementById("p-refresh")?.click();
                  });
              }
            }, 8000);
          } else {
            //  句子：直接隐藏 pDetail，不启动定时器
            if (pDetail) pDetail.style.display = "none";
          }
          if (shadowHost?._engineDotEl)
            shadowHost._engineDotEl.style.background = "#6b7280";

          getDetailedTranslation(
            text,
            true,
            currentTargetLang,
            {
              hintInputLang: currentSourceLang,
            },
            currentSourceLang,
          )
            .then((result) => {
              // logger.log('[refresh]', {
              //   isWord: result?.isWord,
              //   isPartial: result?.isPartial,
              //   dictData: result?.dictData,
              //   basic: result?.basic,
              // });
              if (basicEl) {
                basicEl.style.color = "";
                basicEl.style.fontStyle = "normal";
              }
              if (result?.isError) {
                if (shadowHost?._engineDotEl)
                  shadowHost._engineDotEl.style.background = "#ef4444";
                clearTimeout(shadowHost?._detailTimer);
                const pDetail = shadow.getElementById("p-detail");
                if (pDetail) {
                  pDetail.style.display = "none";
                  pDetail.innerHTML = "";
                }
                setBasicError(basicEl, result.basic || "Translation failed");
                return;
              }
              if (shadowHost?._engineDotEl)
                shadowHost._engineDotEl.style.background = "#22c55e";

              if (result?.isPartial && shadowHost?._detailFullyRendered) return;
              handleTranslationResult(result, text, shadow);
            })
            .catch((err) => {
              if (shadowHost?._engineDotEl)
                shadowHost._engineDotEl.style.background = "#ef4444";
              clearTimeout(shadowHost?._detailTimer);
              const pDetail = shadow.getElementById("p-detail");
              if (pDetail) {
                pDetail.style.display = "none";
                pDetail.innerHTML = "";
              }
              setBasicError(basicEl, err.message || "Network Error");
            })
            .finally(() => {
              setTimeout(() => refreshBtn?.classList.remove("spinning"), 600);
            });
        });
    }

    //  p-refresh 按钮绑定
    shadow.getElementById("p-refresh").onclick = async (e) => {
      e?.stopPropagation();
      triggerRefresh();
    };

    // 收藏
    shadow.getElementById("p-save").onclick = async (e) => {
      e.stopPropagation();
      const saveBtn = shadow.getElementById("p-save");
      if (!saveBtn?._miraReady) {
        saveBtn.title = typeof t === "function" ? t("loading") : "Loading...";
        setTimeout(() => {
          saveBtn.title = t("collect");
        }, 1000);
        return;
      }

      const star = shadow.getElementById("star-icon");
      const wordLower = wordText.toLowerCase();
      const dbKey = `vb_${wordLower}`;
      const now = Date.now();
      const snapshot = saveBtn._miraSnapshot;

      const cleanText = (s) => (s ? s.replace(/\[\[\d+\]\]/g, "").trim() : "");

      let fullTranslation;
      if (snapshot?.word?.toLowerCase().trim() === wordLower) {
        const isWord = !wordText.includes(" ") && wordText.length <= 30;

        fullTranslation = {
          basic: cleanText(snapshot.basic),
          phonetic: snapshot.phonetic,
          sourcePhonetic: snapshot.sourcePhonetic || "",
          dictData: isWord ? snapshot.dictData : [],        // 只有单词才存词典数据
          examples: isWord ? snapshot.examples || [] : [],  // 只有单词才存例句
          sourceLang: snapshot.sourceLang || "",
          context: snapshot.context || "",                  // 单词/短语/句子都存
          contextTranslation: snapshot.contextTranslation || "",
        };
      } else {
        fullTranslation = {
          basic: cleanText(shadow.getElementById("p-basic")?.innerText || ""),
          phonetic: shadow.getElementById("p-phonetic")?.innerText || "",
          hiragana: shadow.getElementById("p-hiragana")?.innerText || "",
          katakana: shadow.getElementById("p-katakana")?.innerText || "",
          dictData: [],
          examples: [],
        };
      }

      const existing = await idb.vocabulary.get(wordText);
      let isActive, entry;
      if (existing) {
        if (!existing.deleted) {
          entry = { ...existing, deleted: true, updated: now };
          isActive = false;
        } else {
          entry = {
            ...existing,
            word: wordText,
            trans: fullTranslation,
            src: window.location.href,
            title: document.title,
            deleted: false,
            updated: now,
            date: now,
          };
          isActive = true;
        }
      } else {
        entry = {
          id: crypto.randomUUID(),
          word: wordText,
          trans: fullTranslation,
          src: window.location.href,
          title: document.title,
          date: now,
          updated: now,
          deleted: false,
          lv: 0,
        };
        isActive = true;
      }

      await idb.set({ [dbKey]: entry });

      if (isActive) {
        saveBtn.classList.add("is-saved");
        saveBtn.title = t("uncollect");
        star.setAttribute("fill", "#facc15");
        star.setAttribute("stroke", "#facc15");
      } else {
        saveBtn.classList.remove("is-saved");
        saveBtn.title = t("collect");
        star.setAttribute("fill", "none");
        star.setAttribute("stroke", "rgba(255,255,255,0.8)");
      }
      await window.__vocabOnSave?.(wordText, isActive);
    };

    // ─── 公共函数 ────────────────────────────────────────────────────────────────

    function getLangDropdownColors() {
      const isDark =
        shadowHost.getAttribute("theme") === "dark" ||
        (shadowHost.getAttribute("theme") !== "light" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      return isDark
        ? {
          bg: "rgba(18,18,18,0.4)",
          border: "rgba(255,255,255,0.27)",
          shadow: "0 8px 24px rgba(0,0,0,0.6)",
          text: "#ffffffb7",
          textMuted: "rgba(255,255,255,0.50)",
          sepBorder: "rgba(255,255,255,0.08)",
          hoverBg: "rgba(56,189,248,0.15)",
          accent: "#38bdf8",
        }
        : {
          bg: "rgba(255,255,255,0.97)",
          border: "rgba(0,0,0,0.1)",
          shadow: "0 8px 24px rgba(0,0,0,0.15)",
          text: "#1a202c",
          textMuted: "#718096",
          sepBorder: "rgba(0,0,0,0.06)",
          hoverBg: "rgba(2,132,199,0.1)",
          accent: "#0284c7",
        };
    }

    function createLangDropdown(anchorEl) {
      const shadowRoot = shadowHost.shadowRoot;

      // 已存在则关闭
      const existing = shadowRoot.getElementById("p-lang-dropdown");
      if (existing) {
        existing.remove();
        return null;
      }

      anchorEl.classList.add("is-open");
      const colors = getLangDropdownColors();

      const dropdown = document.createElement("div");
      dropdown.id = "p-lang-dropdown";
      dropdown.style.cssText = `
        position:fixed; z-index:2147483647;
        background:${colors.bg}; border:1px solid ${colors.border};
        border-radius:8px; box-shadow:${colors.shadow};
        max-height:380px; overflow-y:auto; min-width:220px;
        padding:4px 0; font-size:12px; color:${colors.text};
        pointer-events:auto;
        backdrop-filter:blur(20px) saturate(180%);
        -webkit-backdrop-filter:blur(20px) saturate(180%);
      `;

      dropdown.addEventListener(
        "wheel",
        (ev) => {
          ev.stopPropagation();
          dropdown.scrollTop += ev.deltaY;
        },
        { passive: false },
      );

      // 定位
      const btnRect = anchorEl.getBoundingClientRect();
      const gap = 4;
      const dropW = 380;
      const dropH = 380;
      let left = btnRect.left;
      let top = btnRect.bottom + gap;
      if (left + dropW > window.innerWidth)
        left = window.innerWidth - dropW - gap;
      if (left < gap) left = gap;
      if (top + dropH > window.innerHeight) top = btnRect.top - dropH - gap;
      dropdown.style.top = `${top}px`;
      dropdown.style.left = `${left}px`;

      // 挂载
      const scrollStyle = document.createElement("style");
      scrollStyle.textContent = `
        #p-lang-dropdown::-webkit-scrollbar {
          width: 6px;
        }
        #p-lang-dropdown::-webkit-scrollbar-track {
          background: transparent;
        }
        #p-lang-dropdown::-webkit-scrollbar-thumb {
          background: ${colors.textMuted};
          border-radius: 10px;
          transition: background 0.2s;
        }
        #p-lang-dropdown::-webkit-scrollbar-thumb:hover {
          background: ${colors.accent};
        }
      `;
      dropdown.appendChild(scrollStyle);

      shadowRoot.appendChild(dropdown);
      shadowHost.style.pointerEvents = "auto";

      // 覆写 remove，恢复 pointerEvents
      const origRemove = dropdown.remove.bind(dropdown);
      dropdown.remove = () => {
        origRemove();
        anchorEl.classList.remove("is-open");
        shadowHost.style.pointerEvents = "none";
      };

      // 点击外部关闭
      const closeDropdown = (ev) => {
        const path = ev.composedPath();
        if (!path.includes(dropdown) && !path.includes(anchorEl)) {
          dropdown.remove();
          shadowRoot.removeEventListener("click", closeDropdown, true);
          document.removeEventListener("click", closeDropdown, true);
        }
      };

      setTimeout(() => {
        shadowRoot.addEventListener("click", closeDropdown, true);
        document.addEventListener("click", closeDropdown, true);
      }, 0);

      return { dropdown, colors };
    }

    function buildLangItem(lang, colors, onClick) {
      if (lang.type === "sep") {
        const sep = document.createElement("div");
        sep.className = "mira-font-family";
        sep.style.cssText = `
      padding:5px 14px 3px; font-size:11px; color:${colors.textMuted};
      letter-spacing:0.5px; border-top:1px solid ${colors.sepBorder};
      margin-top:2px; user-select:none;font-style:italic;
    `;
        sep.textContent = lang.label;
        return sep;
      }

      const item = document.createElement("div");
      item.className = "mira-font-family";
      item.textContent = lang.label;
      item.style.cssText = `
    padding:6px 14px; cursor:pointer; color:${colors.text};
    transition:background 0.15s; border-radius:4px;
    margin:0 4px; white-space:nowrap;
  `;
      item.onmouseenter = () => (item.style.background = colors.hoverBg);
      item.onmouseleave = () => (item.style.background = "");
      item.onclick = onClick;
      return item;
    }

    // 语言切换,源语言
    shadow.getElementById("p-lang-select").onclick = (e) => {
      e.stopPropagation();
      const btn = shadow.getElementById("p-lang-select");
      const result = createLangDropdown(btn);
      if (!result) return;
      const { dropdown, colors } = result;

      let currentEl = null; // 记录当前项

      LANGS.forEach((lang) => {
        const isCurrent =
          lang.value?.toLowerCase() ===
          (window.hintSourceLang?.toLowerCase() || "auto");
        const el = buildLangItem(lang, colors, async (ev) => {
          ev.stopPropagation();
          dropdown.remove();

          state.sourceLang = lang.value;
          await safeSetStorage({ lpLangA: lang.value });
          window.hintSourceLang = lang.value;

          const srcSpan = shadow.getElementById("p-lang-src");
          if (srcSpan)
            srcSpan.textContent =
              lang.value === "auto"
                ? "AUTO"
                : lang.value.toUpperCase().slice(0, 2);

          shadow
            .getElementById("p-refresh")
            ?.onclick({ stopPropagation: () => { } });
        });
        if (isCurrent && lang.type !== "sep") {
          el.style.color = colors.accent;
          el.style.fontWeight = "600";
          currentEl = el; // 记录当前项
        }
        dropdown.appendChild(el);
      });

      // 滚动到当前选中项
      if (currentEl) {
        setTimeout(() => {
          currentEl.scrollIntoView({ block: "center" });
        }, 0);
      }
    };

    // 目标语言
    shadow.getElementById("p-lang-tgt-btn").onclick = (e) => {
      e.stopPropagation();
      const btn = shadow.getElementById("p-lang-tgt-btn");
      const result = createLangDropdown(btn);
      if (!result) return;
      const { dropdown, colors } = result;

      let currentEl = null; // 记录当前项

      LANGS.filter((l) => l?.value !== "auto").forEach((lang) => {
        const isCurrent =
          lang.value?.toLowerCase() ===
          (window.currentTargetL?.toLowerCase() || "");
        //logger.log('语言列表项', { "isCurrent": isCurrent, "lang": lang.value, "current": window.currentTargetL });
        const el = buildLangItem(lang, colors, async (ev) => {
          ev.stopPropagation();
          dropdown.remove();

          state.targetLang = lang.value;
          window.currentTargetL = lang.value;
          await safeSetStorage({ targetLanguage: lang.value });

          const tgtSpan = shadow.getElementById("p-lang-tgt-btn");
          if (tgtSpan) {
            const langVal = lang.value.toLowerCase();
            tgtSpan.textContent =
              LANG_DISPLAY[langVal] || lang.value.toUpperCase().slice(0, 2);
          }

          const newIsRTL = checkRTL(lang.value);
          const contentContainer = shadow.getElementById("p-content-container");
          if (contentContainer) {
            contentContainer.style.direction = newIsRTL ? "rtl" : "ltr";
            contentContainer.style.textAlign = newIsRTL ? "right" : "left";
          }

          shadow
            .getElementById("p-refresh")
            ?.onclick({ stopPropagation: () => { } });
        });

        if (isCurrent && lang.type !== "sep") {
          el.style.color = colors.accent;
          el.style.fontWeight = "600";
          currentEl = el; // 记录当前项
        }

        dropdown.appendChild(el);
      });

      // 滚动到当前选中项
      if (currentEl) {
        setTimeout(() => {
          currentEl.scrollIntoView({ block: "center" });
        }, 0);
      }
    };

    // 拖拽
    const startDrag = (e) => {
      if (e.target.closest(".icon-btn")) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const r = popupEl.getBoundingClientRect();
      initialX = r.left;
      initialY = r.top;
      e.preventDefault();
    };
    shadow.getElementById("drag-zone").onmousedown = startDrag;
    shadow.getElementById("p-header").onmousedown = startDrag;

    // 主题切换
    const themeBtn = shadow.getElementById("p-theme-toggle");
    themeBtn.onclick = (e) => {
      e.stopPropagation();
      const cur = localStorage.getItem("eclipse-theme") || "auto";
      const next =
        { light: "auto", auto: "dark", dark: "light" }[cur] ?? "auto";
      updateThemeUI(next, shadow, shadowHost);
    };
    updateThemeUI(
      localStorage.getItem("eclipse-theme") || "auto",
      shadow,
      shadowHost,
    );

    // ── 加载翻译数据 ───────────────────
    const basicEl = shadow?.getElementById("p-basic");
    if (!basicEl?.style) return;

    //  刷新时重置状态，允许新的 partial/完整消息正常处理
    if (shadowHost) {
      shadowHost._detailFullyRendered = false;
      clearTimeout(shadowHost._slowTimer);
      shadowHost._slowTimer = null;
    }
    // 显示 loading 状态
    basicEl.innerHTML = `<span style="opacity:0.5;font-size:13px;font-style:italic;">${t("loading")}...</span>`;
    // 翻译未完成前禁用发音按钮
    setActionBtns(shadow, false);
    const pDetail = shadow.getElementById("p-detail");
    if (pDetail) {
      pDetail.style.display = "none";
    }
    if (shadowHost?._engineDotEl)
      shadowHost._engineDotEl.style.background = "#6b7280";

    const hasDiacritics = (str) => /\p{M}/u.test(str);

    const isEnglish = (langCode) => {
      if (!langCode) return false;
      const baseLang = langCode.split('-')[0].toLowerCase();
      return baseLang === 'en';
    };

    const detectedFromContext = (() => {
      try {
        return detectSourceLang(_capturedContext || '') || null;
      } catch (e) {
        return null;
      }
    })();

    const detectedFromText = (() => {
      try {
        return detectSourceLang(text || '') || null;
      } catch (e) {
        return null;
      }
    })();

    const fromText = detectSourceLang(text);
    const fromCtx = detectSourceLang(_capturedContext);
    const hasKana = /[\u3040-\u309F\u30A0-\u30FF]/.test(text);

    const textIsAmbiguousCJK = fromText === 'zh' &&
      !/[\u3040-\u309F\u30A0-\u30FF]/.test(text) &&
      /^[\u4e00-\u9fa5\s\p{P}]+$/u.test(text);

    let effectiveHintLang = null;

    if (hintSourceLang && hintSourceLang !== 'auto') {
      effectiveHintLang = hintSourceLang; // 外部传入的直接用，不再覆盖
    } else if (hasKana) {
      effectiveHintLang = 'ja';
    } else if (textIsAmbiguousCJK && fromCtx === 'ja') {
      effectiveHintLang = 'ja';
    } else if (fromText) {
      effectiveHintLang = fromText;
    } else if (fromCtx) {
      effectiveHintLang = fromCtx;
    }

    shadowHost._effectiveHintLang = effectiveHintLang;
    logger.log("🔍 [MIRA 调试] 翻译参数:", {
      text: text,
      manualLang: manualLang,
      effectiveHintLang: effectiveHintLang,
      detectedFromText: detectedFromText,
      detectedFromContext: detectedFromContext,
      finalSource: hintSourceLangNew !== "auto" ? hintSourceLangNew : null
    });
    // 发消息，不等结果，UI 完全由 TRANSLATE_DETAIL_UPDATE 驱动
    getDetailedTranslation(
      text,
      false,
      manualLang,
      { hintInputLang: effectiveHintLang },
      hintSourceLangNew !== "auto" ? hintSourceLangNew : null,
    )
      .then((result) => {
        // 翻译完成，恢复发音按钮
        setActionBtns(shadow, true);
        if (basicEl) {
          basicEl.style.color = "";
          basicEl.style.fontStyle = "normal";
        }
        if (!result) return;
        if (result?.isError) {
          if (shadowHost?._engineDotEl)
            shadowHost._engineDotEl.style.background = "#ef4444";
          clearTimeout(shadowHost?._detailTimer);
          const pDetail = shadow.getElementById("p-detail");
          if (pDetail) {
            pDetail.style.display = "none";
            pDetail.innerHTML = "";
          }
          setBasicError(basicEl, result.basic || "Translation failed");
          return;
        }
        if (shadowHost?._engineDotEl)
          shadowHost._engineDotEl.style.background = "#22c55e";
        const currentWord = shadowHost?.getAttribute("data-current-word");
        if (text.trim() !== currentWord) return;

        const isRTL = checkRTL(window.currentTargetL);
        if (result.isPartial) {
          const pBasic = shadow.getElementById("p-basic");
          const pPhonetic = shadow.getElementById("p-phonetic");
          const pDetail = shadow.getElementById("p-detail");
          if (pBasic) {
            pBasic.innerText = result.basic || "";
            pBasic.style.color = "";
            pBasic.style.fontStyle = "normal";
          }
          if (pPhonetic) {
            pPhonetic.innerText = result.sourcePhonetic
              ? `/${result.sourcePhonetic.replace(/[\[\]\/]/g, "")}/`
              : "";
          }
          if (pDetail) {
            if (result.isWord) {
              pDetail.innerHTML = `<span class="mira-font-family" style="opacity:0.5;font-size:12px;font-style:italic;">${t("loadingMore", window.uiLanguage)}</span>`;
              pDetail.style.display = "block";
            }
          }
          if (shadowHost?._engineDotEl)
            shadowHost._engineDotEl.style.background = "#22c55e";
        } else {
          // logger.log("result.isPartial 为 false", result);
          if (shadowHost) {
            clearTimeout(shadowHost._slowTimer);
            shadowHost._slowTimer = null;
            shadowHost._detailFullyRendered = true;
          }
          if (shadowHost?._engineDotEl)
            shadowHost._engineDotEl.style.background = "#22c55e";
          fillPopupData(
            result,
            shadow,
            text.trim(),
            window.currentTargetL,
            isRTL,
            null,
            shadowHost._effectiveHintLang || result?.langInfo?.code || null,
          );
        }
      })
      .catch((err) => {
        // 翻译失败， 恢复发音按钮
        setActionBtns(shadow, true);
        if (shadowHost?._engineDotEl)
          shadowHost._engineDotEl.style.background = "#ef4444";
        clearTimeout(shadowHost?._detailTimer);
        const pDetail = shadow.getElementById("p-detail");
        if (pDetail) {
          pDetail.style.display = "none";
          pDetail.innerHTML = "";
        }
        logger.log("❌ getDetailedTranslation 报错", err);
        setBasicError(basicEl, err.message || "网络异常");
      });

    requestAnimationFrame(() => { clampPopupToViewport?.(popupEl); });
  }

  // ─── 内容 HTML 模板 ──

  function buildContentHTML(text, isSaved) {
    const isMultiline = text.length > 40 || text.includes("\n");
    const targetLang = (
      window.currentTargetL ||
      getBrowserLang() ||
      "EN"
    ).toLowerCase();
    const targetLangDisplay =
      LANG_DISPLAY[targetLang] || targetLang.toUpperCase().slice(0, 2);

    return `
    <div style="line-height:1.4; display:flex; flex-direction:column; gap:8px;margin-top:4px;">
      <div id="p-tools-header" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding-bottom:4px; border-bottom:1px solid var(--p-border);">

        <div style="display:inline-flex; align-items:center; gap:2px;white-space:nowrap; background:color-mix(in srgb, var(--p-accent) 10%, transparent); border-radius:8px; padding:3px;">

          <div id="p-lang-select" class="lang-tag-btn"
              style="font-size:11px; font-weight:700; color:var(--p-accent); user-select:none; -webkit-user-select:none;">
            <span id="p-lang-src" style="pointer-events:none;">AUTO</span>
          </div>

         <svg width="14" height="12" viewBox="0 0 28 24" fill="none" stroke="var(--arrowColor)"
            stroke-width="2.5" style="flex-shrink:0; pointer-events:none; ${["ar", "he", "fa", "ku"].includes(targetLang.slice(0, 2)) ? "transform:scaleX(-1);" : ""}">
            <path d="M2 12h24m-9-8 9 8-9 8"/>
        </svg>

          <div id="p-lang-tgt-btn" class="lang-tag-btn"
              style="font-size:11px; font-weight:700; color:var(--p-accent); user-select:none; -webkit-user-select:none;">
            <span id="p-lang-tgt" style="pointer-events:none;">${targetLangDisplay}</span>
          </div>

        </div>
      <!-- 引擎选择器 -->
      <div id="p-engine-wrap" class="mira-font-family" style="position:relative; display:flex; align-items:center; margin-left:4px;">
        <div id="p-engine-btn" class="neon-engine-btn">
          <span id="p-engine-dot"
                style="width:6px; height:6px; border-radius:50%; background:#6b7280; flex-shrink:0;"></span>
          <span id="p-engine-label" style="overflow:hidden; text-overflow:ellipsis;">···</span>
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2.5" style="opacity:0.6; flex-shrink:0; pointer-events:none;">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>

      </div>
        <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
          <div id="p-speak" class="icon-btn speak-btn" title="${t("pronunciation")}" style="width:28px; height:28px; display:flex; align-items:center; justify-content:center; margin:0; padding:0;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:block;">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
          </div>

          <div id="p-save" class="icon-btn save-btn ${isSaved ? "is-saved" : ""}"
               title="${isSaved ? t("uncollect") : t("collect")}" style="width:28px; height:28px; display:flex; align-items:center; justify-content:center; margin:0; padding:0;">
            <svg id="star-icon" width="18" height="18" viewBox="0 0 24 24"
                 fill="${isSaved ? "#facc15" : "none"}"
                 stroke="${isSaved ? "#facc15" : "currentColor"}"
                 stroke-width="2" stroke-linejoin="round" style="display:block;">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          </div>

          <div id="p-refresh" class="icon-btn refresh-btn" title="${t("retranslate")}" style="width:28px; height:28px; display:flex; align-items:center; justify-content:center; margin:0; padding:1px 0 0 0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="display:block;">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
            </svg>
          </div>
        </div>
      </div>

    <div id="p-query-container" style="padding: 4px 2px 0;">
      <div id="p-query" class="mira-font-family" style="font-size:${isMultiline ? '18px' : '22px'}; font-weight:700; color:var(--p-text-main); word-break:break-word; overflow-wrap:break-word; line-height:1.3;">
        ${text}
      </div>
      
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
        <div id="p-phonetic" style="color:var(--p-phonetic); font-size:13px; opacity:0.6; font-family:sans-serif;  word-break:break-word;"></div>
        
    <span id="mira-toggle-ja" class="mira-neon-btn">
        Kana ▾
    </span>
   </div>

  <div id="p-ja-extension" style="display: none; margin-top: 6px; padding-bottom: 6px; padding-top: 6px; border-bottom: 1px dashed rgb(51, 65, 85);">
    <div id="p-hiragana" style="color:#22afb7; font-size:14px;  line-height:1.2; word-break:break-word; letter-spacing:0.5px; margin-bottom: 4px;"></div>
    <div id="p-katakana" style="color:#8c8c8c; font-size:14px;  line-height:1.2; word-break:break-word; letter-spacing:0.5px;"></div>
  </div>
</div>

      <div id="p-result-container" style="display:flex; flex-direction:column; gap:6px;">
       <div id="p-basic" class="basic" style="font-size:18px;font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', Roboto, sans-serif !important; color:var(--p-accent); font-weight:500;">Loading...</div>
        <div id="p-detail" class="detail" style="display:none; margin-top:2px;"></div>
        <div id="p-examples" style="display:none; margin-top:4px;"></div>
      </div>

      <div id="p-source" class="mira-font-family" style="display:none; margin-top:8px; font-size:10px; opacity:0.5; text-align:right; font-style:italic;"></div>
    </div>`;
  }

  // ─── 填充翻译数据 ──────────────

  function fillPopupData(
    res,
    shadow,
    text,
    targetLang,
    isRTL = false,
    state = null,
    sourceLang = null,
  ) {
    if (!shadow || !res) return;

    const esc = (s) =>
      typeof s !== "string"
        ? ""
        : s
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");

    const cleanMarker = (s) =>
      typeof s === "string" ? s.replace(/\[\[\d+\]\]\s*/g, "").trim() : s;

    // 合并相同词性
    const mergedDict = (res.dictData || [])
      .reduce((acc, item) => {
        const meanings = item.meanings?.length
          ? item.meanings
          : item.definition
            ? [
              ...new Set(
                item.definition
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              ),
            ]
            : [];
        const found = acc.find((d) => d.pos === item.pos);
        if (found) found.meanings.push(...meanings);
        else acc.push({ ...item, meanings });
        return acc;
      }, [])
      .map((i) => ({
        ...i,
        meanings: [...new Set(i.meanings.map((m) => m.trim()).filter(Boolean))],
      }));

    res = {
      ...res,
      dictData: mergedDict,
    };
    // ====== 全语言音标与日语假名逻辑 ======
    const pPhonetic = shadow.getElementById("p-phonetic");
    const pToggleJa = shadow.getElementById("mira-toggle-ja");
    const pJaExtension = shadow.getElementById("p-ja-extension");
    const pHiragana = shadow.getElementById("p-hiragana");
    const pKatakana = shadow.getElementById("p-katakana");
    const saveBtn = shadow.getElementById("p-save");

    if (pPhonetic && pToggleJa && pJaExtension && pHiragana && pKatakana) {
      try {
        const rawPhonetic = res.sourcePhonetic || res.phonetic || "";

        logger.log('[kana debug] rawPhonetic:', rawPhonetic, 'text:', text, 'isJapanese:', isJapanese(text));
        if (rawPhonetic) {
          pPhonetic.innerText = rawPhonetic;
          pPhonetic.style.display = "block";
        } else {
          pPhonetic.style.display = "none";
        }

        logger.log('[kana debug] sourceLang:', sourceLang, 'rawPhonetic:', rawPhonetic);
        if (rawPhonetic && sourceLang === 'ja') {
          getKana(rawPhonetic).then(({ hiragana, katakana }) => {
            if (!hiragana) {
              pToggleJa.style.display = "none";
              pJaExtension.style.display = "none";
              return;
            }
            pHiragana.innerText = hiragana;
            pKatakana.innerText = katakana;
            pToggleJa.style.display = "inline-block";
            pToggleJa.onclick = null;
            pToggleJa.onclick = (e) => {
              e.stopPropagation();
              if (pJaExtension.style.display === "none") {
                pJaExtension.style.display = "block";
                pToggleJa.innerText = "Hide ▴";
              } else {
                pJaExtension.style.display = "none";
                pToggleJa.innerText = "Kana ▾";
              }
            };
          });
        } else {
          // 源语言不是日语，一律隐藏
          pToggleJa.style.display = "none";
          pJaExtension.style.display = "none";
        }
      } catch (error) {
        logger.error("通用音标与假名处理失败:", error);
        pToggleJa.style.display = "none";
        pJaExtension.style.display = "none";
      }
    }
    // 音标
    // const pPhonetic = shadow.getElementById("p-phonetic");
    if (pPhonetic)
      pPhonetic.innerText = (res.phonetic || res.sourcePhonetic)
        ? `/${(res.phonetic || res.sourcePhonetic).replace(/[\[\]\/]/g, "")}/`
        : "";

    // 基本释义
    const pBasic = shadow.getElementById("p-basic");
    if (pBasic) pBasic.innerText = cleanMarker(res.basic) || "";

    // 词典详情
    const pD = shadow.getElementById("p-detail");
    if (pD?.style) {
      if (res.dictData?.length || res.wordForms?.length || res.prototype) {
        const isTraditional = /tw|hk/i.test(targetLang || "");
        const ZH_FORM_TW = {
          过去式: "過去式",
          过去分词: "過去分詞",
          现在分词: "現在分詞",
          第三人称单数: "第三人稱單數",
          复数: "複數",
          单数: "單數",
          比较级: "比較級",
          最高级: "最高級",
        };

        const hasOriginal = res.originalDictData?.length > 0;

        let html = res.dictData
          .map((item) => {
            const pos = esc(localizePos(item.pos, targetLang) || "");

            const isJaContent = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(
              (item.meanings || []).join('')
            );
            const meanings = (item.meanings || [])
              .map(m => esc(cleanMarker(m))
                .replace(/。(?!$)/g, '、')
                .replace(/\s*、\s*/g, '、')
              )
              .join(isJaContent ? '、' : ', ');

            return `<div style="margin-bottom:4px;">
                  <div style="display:flex;align-items:baseline;flex-wrap:wrap;gap:2px;">
                    <b class="mira-font-family" style="color:#319BCA;font-size:12px;font-weight:500;margin-right:4px;flex-shrink:0;">${pos}</b>
                    <span class="mira-font-family">${meanings}</span>
                  </div>
                </div>`;
          })
          .join("");

        let forms = "";
        if (
          res.prototype &&
          res.prototype.toLowerCase().trim() !== text.toLowerCase().trim()
        ) {
          forms += `<span style="display:inline-flex;align-items:center;gap:4px;
          background:color-mix(in srgb,var(--p-accent) 8%,transparent);
          border:0.5px solid color-mix(in srgb,var(--p-accent) 40%,transparent);
          border-radius:6px;padding:3px 8px;font-size:12px;">
        <span class="mira-font-family" style="color:var(--p-text-muted);font-size:11px;">Prototype</span>
        <span class="mira-font-family" style="color:var(--p-accent);font-weight:500;">${esc(res.prototype)}</span>
      </span>`;
        }
        (res.wordForms || []).forEach((wf) => {
          const name = esc(
            isTraditional ? ZH_FORM_TW[wf.name] || wf.name : wf.name,
          );
          forms += `<span class="mira-font-family" style="display:inline-flex;align-items:center;gap:4px;
          background:color-mix(in srgb,var(--p-text-main) 5%,transparent);
          border:0.5px solid color-mix(in srgb,var(--p-border) 60%,transparent);
          border-radius:6px;padding:3px 8px;font-size:12px;">
          
        <span class="mira-font-family" style="color:var(--p-text-main);font-weight:500;">${esc(wf.value)}</span>
      </span>`;
        });
        if (forms)
          html += `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">${forms}</div>`;

        pD.innerHTML = html;
        pD.style.display = "block";

      } else {
        pD.style.display = "none";
      }
    }

    if (saveBtn) {

      saveBtn._miraSnapshot = {
        word: text,
        basic: res.basic || "",
        phonetic: res.phonetic || "",
        sourcePhonetic: res.sourcePhonetic || "",
        hiragana: "",
        katakana: "",
        dictData: res.dictData || [],
        examples: res.examples || [],
        prototype: res.prototype || null,
        sourceLang: res.langInfo?.code || detectSourceLang(text),
        context: _capturedContext || "",
        contextTranslation: _capturedContextTranslation || "",
      };
      //logger.log('[snapshot]', saveBtn._miraSnapshot);
      saveBtn._miraReady = true;
    }

    // 例句
    const langMap = { ja: 'ja-JP', zh: 'zh-CN', ko: 'ko-KR', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', ru: 'ru-RU', en: 'en-US' };
    const hintLang = window.hintSourceLang || null;
    let exampleLang = (hintLang && hintLang !== 'auto') ? hintLang : null;
    if (!exampleLang) {
      const detected = detectSourceLang(_capturedContext || text);
      exampleLang = langMap[detected] || null;
    }

    // 例句
    const pE = shadow.getElementById("p-examples");
    if (pE?.style) {
      if (res.examples?.length) {
        const safeText = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const stem =
          text.length > 3
            ? text
              .replace(/[ey]$/, "")
              .replace(/([bcdfghjklmnpqrstvwxz])\1$/, "$1") // 去双写辅音，如 running->run
            : text;
        const safeStem = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(
          `\\b(${safeText}[a-z]*|${safeStem}[a-z]*)\\b`,
          "gi",
        );
        pE.innerHTML =
          `<div class="mira-font-family" style="font-size:9px;opacity:0.5;margin-bottom:10px;font-weight:bold;letter-spacing:1px;">EXAMPLES</div>` +
          res.examples
            .slice(0, 3)
            .map((s) => {
              const en = esc(
                cleanMarker(
                  typeof s === "string" ? s : s.en || s.sentence || "",
                ),
              );
              const cn = esc(
                cleanMarker(
                  typeof s === "object" ? s.cn || s.translation || "" : "",
                ),
              );
              const dir = isRTL ? "rtl" : "ltr";
              // 定义边框样式变量
              const borderStyle = isRTL ? "border-right:3px solid #25cbf6ab;" : "border-left:3px solid #25cbf6ab;";
              const paddingStyle = isRTL ? "padding:0 10px 0 5px;" : "padding:0 5px 0 10px;";

              const safeEn = en.replace(/'/g, "\\'");

              return `<div class="mira-font-family" style="margin-bottom:10px;${borderStyle}${paddingStyle}
              border-radius:2px;word-break:break-word;direction:${dir};text-align:${isRTL ? "right" : "left"};">
              <div style="display:flex;align-items:center;gap:6px;flex-direction:${isRTL ? "row-reverse" : "row"};">
                <div class="mira-font-family" style="font-size:13px;font-style:italic;color:var(--p-text-muted);line-height:1.4;flex:1;">
                  ${en.replace(regex, '<span style="color:#38BDF8;font-weight:600;">$1</span>')}
                </div>
                <span class="mira-example-speak" data-sentence="${safeEn}" data-lang="${exampleLang || ''}" 
                  style="cursor:pointer;flex-shrink:0;color:var(--p-text-muted);display:flex;transition:color 0.2s;">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                  </svg>
                </span>
              </div>
              <div class="mira-font-family" style="font-size:12px;font-style:italic;color:var(--p-text-muted);margin-top:3px;opacity:0.65;">${cn}</div>
            </div>`;
            })
            .join("");
        pE.style.display = "block";
        //例句发音
        pE.querySelectorAll(".mira-example-speak").forEach(btn => {
          btn.addEventListener("mouseenter", () => {
            btn.style.color = "#38bdf8";
            btn.style.filter = "drop-shadow(0 0 4px rgba(56,189,248,0.6))";
          });
          btn.addEventListener("mouseleave", () => {
            if (!btn.classList.contains("is-speaking")) {
              btn.style.color = "var(--p-text-muted)";
              btn.style.filter = "";
            }
          });
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const sentence = btn.getAttribute("data-sentence");
            const lang = btn.getAttribute("data-lang") || null;
            if (!sentence) return;

            btn.style.transform = "scale(0.8)";
            setTimeout(() => { btn.style.transform = "scale(1)"; }, 150);

            const finalLang = (!lang || lang === 'auto') ? null : lang;
            logger.log('播放例句发音', { sentence, finalLang });
            speakText(sentence, btn, finalLang);
          });
        });
      } else {
        pE.style.display = "none";
      }
    }

    // 来源
    const pSource = shadow.getElementById("p-source");
    if (pSource) {
      const isWord = isWordText(text);
      let cambridgeHref = "";
      let isZhTw = false;

      if (isWord) {
        const encoded = encodeURIComponent(text.trim().toLowerCase());
        const tgt = (
          window.currentTargetL ||
          getBrowserLang() ||
          "en"
        ).toLowerCase();
        const src = (
          res.langInfo?.code ||
          state?.sourceLang ||
          "en"
        ).toLowerCase();
        isZhTw = tgt === "zh-tw";

        let dictPath = null;
        if (src === "en") {
          dictPath = FORWARD[tgt === "tw" ? "zh-tw" : tgt] || null;
        }

        if (dictPath) {
          cambridgeHref = `https://dictionary.cambridge.org/dictionary/${dictPath}/${encoded}`;
        }
      }

      // 基本释义下方（仅 zh-tw）
      // const pBasic = shadow.getElementById('p-basic');
      const existingTop = shadow.getElementById("p-cambridge-top");
      if (existingTop) existingTop.remove();

      // if (isZhTw && cambridgeHref && pBasic) {
      //   const div = document.createElement('div');
      //   div.id = 'p-cambridge-top';
      //   div.style.cssText = 'margin-top:4px;';
      //   const a = document.createElement('a');
      //   a.href = cambridgeHref;
      //   a.target = '_blank';
      //   a.rel = 'noopener noreferrer';
      //   a.textContent = '💡 更多釋義 → Cambridge Dictionary ↗';
      //   a.style.cssText = `
      //     color: #7dd3fc;
      //     font-size: 10px;
      //     text-decoration: none;
      //     opacity: 0.9;
      //     transition: all 0.2s ease;
      //   `;
      //   a.addEventListener('mouseover', () => { a.style.color = '#38bdf8'; a.style.opacity = '1'; });
      //   a.addEventListener('mouseout', () => { a.style.color = '#7dd3fc'; a.style.opacity = '0.9'; });
      //   div.appendChild(a);
      //   pBasic.after(div);
      // }
      // 底部 source
      pSource.style.display = res.source || cambridgeHref ? "block" : "none";
      pSource.innerHTML = "";

      // 主题判断
      const curMode = localStorage.getItem("eclipse-theme") || "auto";
      const appliedTheme =
        curMode === "auto" ? getWebPageBrightness() : curMode;
      const isDark = appliedTheme === "dark";

      if (res.source) {
        pSource.appendChild(document.createTextNode("Source: "));
        if (res.sourceUrl) {
          const a = document.createElement("a");
          a.href = res.sourceUrl;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = res.source;

          const normalColor = isDark ? "#38bdf8" : "#0369a1";
          const hoverColor = isDark ? "#7dd3fc" : "#01478a";
          const normalBg = isDark
            ? "rgba(56,189,248,0.08)"
            : "rgba(3,105,161,0.08)";
          const hoverBg = isDark
            ? "rgba(56,189,248,0.2)"
            : "rgba(3,105,161,0.15)";

          a.style.cssText = `
            color: ${normalColor};
            text-decoration: none;
            font-weight: 500;
            font-size: 10px;
            font-style: italic;
            padding: 2px 6px;
            border-radius: 4px;
            background: ${normalBg};
            transition: all 0.2s ease;
            margin-left: 4px;
          `;
          a.addEventListener("mouseover", () => {
            a.style.background = hoverBg;
            a.style.color = hoverColor;
          });
          a.addEventListener("mouseout", () => {
            a.style.background = normalBg;
            a.style.color = normalColor;
          });
          pSource.appendChild(a);
        } else {
          pSource.appendChild(document.createTextNode(res.source));
        }
      }

      if (cambridgeHref) {
        if (res.source) pSource.appendChild(document.createTextNode(" · "));
        const ca = document.createElement("a");
        ca.href = cambridgeHref;
        ca.target = "_blank";
        ca.rel = "noopener noreferrer";
        ca.textContent = "Cambridge ↗";

        const caNormalColor = isDark ? "#cbd5e1" : "#475569";
        const caHoverColor = isDark ? "#f1f5f9" : "#1e293b";
        const caNormalBg = isDark
          ? "rgba(148,163,184,0.15)"
          : "rgba(71,85,105,0.08)";
        const caHoverBg = isDark
          ? "rgba(148,163,184,0.28)"
          : "rgba(71,85,105,0.15)";

        ca.style.cssText = `
          word-space: nowrap;
          display: inline-block;
          color: ${caNormalColor};
          text-decoration: none;
          font-weight: 500;
          font-size: 10px;
          font-style: italic;
          padding: 2px 6px;
          border-radius: 4px;
          background: ${caNormalBg};
          transition: all 0.2s ease;
        `;
        ca.addEventListener("mouseover", () => {
          ca.style.background = caHoverBg;
          ca.style.color = caHoverColor;
        });
        ca.addEventListener("mouseout", () => {
          ca.style.background = caNormalBg;
          ca.style.color = caNormalColor;
        });
        pSource.appendChild(ca);
      }
    }

    const srcSpan = shadow.getElementById("p-lang-src");
    const tgtSpan = shadow.getElementById("p-lang-tgt");
    if (srcSpan) {
      if (state && state.sourceLang === "auto" && res.langInfo?.code) {
        srcSpan.textContent = res.langInfo.code.toUpperCase().slice(0, 2);
      } else if (!state && res.langInfo?.code) {
        srcSpan.textContent = res.langInfo.code.toUpperCase().slice(0, 2);
      }
    }
    if (tgtSpan) {
      const langVal = (
        window.currentTargetL ||
        getBrowserLang() ||
        "EN"
      ).toLowerCase();
      tgtSpan.textContent =
        LANG_DISPLAY[langVal] || langVal.toUpperCase().slice(0, 2);
    }
  }

  // ─── 工具函数 ────────────────────────────────────────────────────────────────

  function setBasicError(el, msg) {
    el.innerText = `[⚠ ${t(msg, window.uiLanguage)} ]`;
    el.style.color = "#ff4d4f";
    el.style.fontStyle = "italic";
  }

  //小按钮
  let logoCenter = null;
  const setImportantStyle = (el, props) => {
    for (const [prop, val] of Object.entries(props)) {
      el.style.setProperty(prop, val, "important");
    }
  };
  function forceHideLogo() {
    if (logoBtn) {
      logoBtn.classList?.remove("show");
      if (typeof setImportantStyle === "function") {
        setImportantStyle(logoBtn, {
          opacity: "0",
          transform: "scale(0.8)",
          "pointer-events": "none",
        });
      }
    }
    setTimeout(() => {
      if (logoBtn && !logoBtn.classList?.contains("show")) {
        logoBtn.style?.setProperty("display", "none", "important");
      }
    }, 200);
    logoCenter = null;
  }
  window.addEventListener("mousemove", (e) => {
    if (logoBtn && logoBtn.classList.contains("show") && logoCenter) {
      const dx = e.clientX - logoCenter.x;
      const dy = e.clientY - logoCenter.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 70) {
        forceHideLogo();
      }
    }
    if (typeof isDragging !== "undefined" && isDragging && popupEl) {
      popupEl.style.left = initialX + (e.clientX - startX) + "px";
      popupEl.style.top = initialY + (e.clientY - startY) + "px";
      if (typeof clampPopupToViewport === "function")
        clampPopupToViewport(popupEl);
    }
  });
  /**
   * 划词
   * 智能获取选区：优先普通 DOM，降级处理 Shadow DOM
   * 兼容 Chrome / Firefox / Edge
   */
  function getSmartSelection() {
    const winSel = window.getSelection();
    const winText = winSel ? winSel.toString().trim() : "";
    if (winText) {
      return winSel;
    }
    let active = document.activeElement;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    if (active && active.shadowRoot) {
      const shadowSel = active.shadowRoot.getSelection();
      if (shadowSel && shadowSel.toString().trim()) {
        return shadowSel;
      }
    }
    return winSel;
  }
  // 只取原文上下文，排除翻译段落
  const getOriginalText = (el) => {
    let text = "";

    //  黑名单：排除掉大概率包含语言列表、导航、页脚的标签
    const blackList = ['NAV', 'ASIDE', 'FOOTER', 'HEADER', 'SCRIPT', 'STYLE'];

    Array.from(el.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // 检查黑名单和已翻译标记
        const isBlacklisted = blackList.includes(node.tagName);
        const isTranslated = node.classList.contains("kt-paragraph-translation");

        if (!isBlacklisted && !isTranslated) {
          text += getOriginalText(node);
        }
      }
    });
    return text;
  };
  window.addEventListener("mouseup", (e) => {
    if (typeof isDragging !== "undefined") isDragging = false;
    if (
      e.button === 2 ||
      (typeof isSelectEnabled !== "undefined" && !isSelectEnabled)
    )
      return;
    if (shadowHost && e.composedPath().includes(shadowHost)) return;
    const mouseX = e.clientX;
    const mouseY = e.clientY;

    setTimeout(async () => {
      const selection = getSmartSelection();
      if (!selection) return;
      const text = selection.toString().trim();
      if (!text || text.length > 1000) return;

      //  立即克隆 Range，此时 selection 还有效
      let savedRange = null;
      try {
        if (selection.rangeCount > 0) {
          savedRange = selection.getRangeAt(0).cloneRange();
        }
      } catch (e) { }

      if (!window.__LANG_READY__) {
        await window.__LANG_PROMISE__;
      }
      const targetLang = window.currentTargetL || getBrowserLang() || "en";
      const storage = await safeGetStorage(["targetLanguage", "lpLangA"]);
      const sourceLang = storage?.lpLangA || "auto";
      const targetPrefix = targetLang.toLowerCase().slice(0, 2);
      const sourcePrefix = sourceLang.toLowerCase().slice(0, 2);

      let isAlreadyTarget = false;

      if (sourceLang !== "auto") {
        // 优先级1：用户已明确指定源语言，直接比对
        isAlreadyTarget = (sourcePrefix === targetPrefix);
      } else {
        // 优先级2：从上下文检测语言
        let ctxLang = null;
        let ctxText = "";
        if (savedRange) {
          try {
            let block = savedRange.commonAncestorContainer;
            if (block.nodeType === Node.TEXT_NODE) block = block.parentElement;
            let tries = 0;
            while (block.textContent.trim().length < 30 && block.parentElement && tries < 3) {
              block = block.parentElement;
              tries++;
            }
            ctxText = getOriginalText(block).replace(/\s+/g, " ").trim();
            if (ctxText.length >= 15) {
              ctxLang = detectSourceLang(ctxText);
            }
          } catch (e) { }
        }

        if (ctxLang !== null && !LATIN_BASED_LANGS.has(ctxLang)) {
          // 非拉丁语系（日、韩、中、俄等） 直接信任
          isAlreadyTarget = (ctxLang === targetPrefix);
        } else {
          // 拉丁语系或上下文检测失败：降级到选中文字判断
          isAlreadyTarget = detectIsAlreadyTarget(text, targetLang);
        }
      }

      if (isAlreadyTarget) {
        forceHideLogo();
        return;
      }

      if (!shadowHost) initShadowDOM();
      if (!logoBtn) return;
      let rect = null;
      try {
        if (selection.rangeCount > 0) {
          rect = selection.getRangeAt(0).getBoundingClientRect();
        }
      } catch (err) { }
      let l = mouseX + 2;
      let t = mouseY + 2;
      if (rect && rect.width > 0) {
        const isMouseInside =
          mouseX >= rect.left &&
          mouseX <= rect.right &&
          mouseY >= rect.top &&
          mouseY <= rect.bottom;
        if (isMouseInside) {
          l = mouseX + 10;
          t = mouseY - 32;
        }
      }
      const btnSize = 32;
      l = Math.max(10, Math.min(l, window.innerWidth - btnSize - 10));
      t = Math.max(10, Math.min(t, window.innerHeight - btnSize - 10));

      logoBtn.style.left = l + "px";
      logoBtn.style.top = t + "px";
      logoBtn.style.setProperty("display", "flex", "important");
      setImportantStyle(logoBtn, {
        transition: "transform 0.1s ease-out, opacity 0.1s ease",
        transform: "scale(1)",
        opacity: "1",
        "pointer-events": "auto",
        position: "fixed",
        "z-index": "2147483647",
      });
      logoCenter = { x: l + 16, y: t + 16 };
      logoBtn.classList.add("show");
      clearTimeout(window.logoAutoTimer);
      window.logoAutoTimer = setTimeout(() => {
        forceHideLogo();
      }, 3000);


      logoBtn.onmouseenter = async () => {
        try {
          if (!chrome.runtime?.id) {
            showUpdateNotice();
            return;
          }
        } catch (_) {
          showUpdateNotice();
          return;
        }
        try {
          const currentTarget = storage?.targetLanguage || getBrowserLang() || "en";
          const currentSource = storage?.lpLangA || "auto";
          let finalQuery = text;
          const hasHan = /[\u4e00-\u9fa5]/.test(text);
          const hasEn = /[a-zA-Z]/.test(text);
          const hasJa = LANGUAGE_PATTERNS["ja"]?.test(text);
          if (hasHan && hasEn && !hasJa) {
            const zhChars = text.match(/[\u4e00-\u9fa5]/g) || [];
            const enChars = text.match(/[a-zA-Z]/g) || [];
            if (enChars.length > zhChars.length) {
              finalQuery = text.replace(/[\u4e00-\u9fa5]/g, "").trim();
            }
          }
          // 修复 detectSourceLang 顺序后，用上下文辅助检测
          let ctxForDetect = _capturedContext || "";
          if (ctxForDetect.length < 20) {
            try {
              if (savedRange) {
                let block = savedRange.commonAncestorContainer;
                if (block.nodeType === Node.TEXT_NODE) block = block.parentElement;
                let tries = 0;
                while (block.textContent.trim().length < 50 && block.parentElement && tries < 5) {
                  block = block.parentElement;
                  tries++;
                }
                //  排除译文
                ctxForDetect = getOriginalText(block).replace(/\s+/g, " ").trim();
              }
            } catch (e) { }
          }

          const detectedSourceLang = currentSource !== 'auto'
            ? currentSource
            : (detectSourceLang(ctxForDetect || finalQuery) || "auto");

          //  上下文捕获：使用提前克隆好的 savedRange
          if (!shadowHost) initShadowDOM();
          try {
            if (savedRange) {
              const container = savedRange.commonAncestorContainer;
              const paragraph =
                container.nodeType === Node.TEXT_NODE
                  ? container.parentElement
                  : container;
              let block = paragraph.closest("[data-translated]") || paragraph;

              // 如果捕获的文本太短，向上找更大的容器
              let tries = 0;
              while (block.textContent.trim().length < 50 && block.parentElement && tries < 5) {
                block = block.parentElement;
                tries++;
              }

              const fullText = getOriginalText(block).replace(/\s+/g, " ").trim();

              //  对 finalQuery 做同样的空白规范化，避免多余空格导致 indexOf 失败
              const selectedText = finalQuery.replace(/\s+/g, " ").trim();

              let idx = fullText.indexOf(selectedText);
              //  兜底：忽略大小写再找一次
              if (idx === -1) {
                idx = fullText
                  .toLowerCase()
                  .indexOf(selectedText.toLowerCase());
              }

              if (idx !== -1) {
                const start = Math.max(0, idx - 80);
                const end = Math.min(
                  fullText.length,
                  idx + selectedText.length + 80
                );

                logger.log('[context] fullText slice:', fullText?.slice(0, 100));
                logger.log('[context] selectedText:', selectedText);
                logger.log('[context] idx:', idx);
                let context = fullText.slice(start, end).trim();
                if (start > 0) context = "..." + context;
                if (end < fullText.length) context = context + "...";
                _capturedContext = context;
                _capturedContextTranslation = "";
              } else {
                _capturedContext = fullText.slice(0, 160) || "";
              }

              const translationEl =
                block.querySelector(".kt-paragraph-translation") ||
                (block.nextElementSibling?.classList.contains("kt-paragraph-translation")
                  ? block.nextElementSibling : null) ||
                (block.parentElement?.nextElementSibling?.classList.contains("kt-paragraph-translation")
                  ? block.parentElement.nextElementSibling : null);

              _capturedContextTranslation = translationEl ? translationEl.textContent.trim() : "";
            }
          } catch (e) {
            logger.warn("[context-capture] 上下文捕获失败:", e);
            _capturedContext = "";
            _capturedContextTranslation = "";
          }

          await renderAndShowPopup(
            finalQuery,
            { clientX: mouseX, clientY: mouseY },
            shadowHost.shadowRoot,
            currentTarget,
            detectedSourceLang
          );

          //  成功显示窗口后，才隐藏小按钮
          forceHideLogo();
        } catch (e) {
          if (e.message?.includes("context invalidated")) {
            logger.warn("[mouseenter] Context invalidated, 扩展已更新");
            showUpdateNotice();
            return;
          }
          logger.error("[mouseenter] 显示翻译窗口失败:", e.message, e.stack);
          //  错误发生时不隐藏小按钮，保留让用户重试
        }
      };
    }, 150);
  });
  document.addEventListener("mousedown", (e) => {
    if (shadowHost && e.composedPath().includes(shadowHost)) return;
    const existingDropdown =
      shadowHost?.shadowRoot?.getElementById("p-lang-dropdown");
    if (existingDropdown) existingDropdown.remove();
    forceHideLogo();
    if (
      shadowHost &&
      shadowHost.getAttribute("data-pinned") !== "true" &&
      typeof popupEl !== "undefined"
    ) {
      stopSpeech();
      if (popupEl) popupEl.classList.add("is-hidden");
      setTimeout(() => {
        popupEl.style.display = "none";
      }, 200);
    }
  });
  document.addEventListener("contextmenu", forceHideLogo, true);
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && popupEl?.style.display !== "none") {
        stopSpeech();
        if (popupEl) popupEl.classList.add("is-hidden");
        setTimeout(() => {
          if (popupEl) popupEl.style.display = "none";
        }, 200);
        window.getSelection()?.removeAllRanges();
      }
    },
    true,
  );
  //小按钮相关逻辑结束----------

  (async () => {
    const doHighlight = (words, vocabulary) => {
      const escaped = words.map((w) =>
        w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      );
      const isLatinWord = (w) => /^[a-zA-Z0-9_]+$/.test(w);
      const patterns = escaped.map((w, i) =>
        isLatinWord(words[i]) ? `\\b${w}\\b` : `(${w})`,
      );
      const regex = new RegExp(patterns.join("|"), "giu");

      const wordMap = {};
      Object.values(vocabulary).forEach((item) => {
        if (item && !item.deleted && item.word) {
          wordMap[item.word.toLowerCase()] = item;
        }
      });

      if (!document.getElementById("vocab-highlight-style")) {
        const style = document.createElement("style");
        style.id = "vocab-highlight-style";
        style.textContent = `
        .vocab-highlight {
          background: linear-gradient(120deg, rgba(56,189,248,0.15) 0%, rgba(56,189,248,0.25) 100%);
          color: #38bdf8;
          border-bottom: 1px solid rgba(56,189,248,0.5);
          border-radius: 2px;
          cursor: pointer;
          padding: 0 1px;
          transition: background 0.2s;
        }
        .vocab-highlight:hover {
          background: linear-gradient(120deg, rgba(56,189,248,0.3) 0%, rgba(56,189,248,0.4) 100%);
        }
      `;
        document.head.appendChild(style);
      }

      const processed = new WeakSet();

      const createHighlightSpan = (text, entry) => {
        const span = document.createElement("span");
        span.className = "vocab-highlight";
        span.textContent = text;
        if (entry) {
          // mousedown stopPropagation 阻止 document mousedown 关闭窗口
          span.addEventListener("mousedown", (e) => {
            e.stopPropagation();
          });
          span.addEventListener("click", (e) => {
            if (e.target.closest("#kt-yt-box")) return;
            e.stopPropagation();
            if (!shadowHost) initShadowDOM();

            // 取上下文，同时更新 _capturedContext 供 renderAndShowPopup 内部使用
            const contextEl = e.target.closest("p, li, div, td, blockquote")
              || e.target.parentNode;
            const contextText = getOriginalText(contextEl);
            _capturedContext = contextText;
            _capturedContextTranslation = "";         // 重置译文上下文

            const fromText = detectSourceLang(entry.word);
            const fromCtx = detectSourceLang(contextText);
            const hasKana = /[\u3040-\u309F\u30A0-\u30FF]/.test(entry.word);

            const textIsAmbiguousCJK = fromText === 'zh' &&
              !/[\u3040-\u309F\u30A0-\u30FF]/.test(entry.word) &&
              /^[\u4e00-\u9fa5\s\p{P}]+$/u.test(entry.word);

            let effectiveHintLang = null;
            if (entry.trans?.sourceLang && entry.trans.sourceLang !== 'auto' && entry.trans.sourceLang !== 'zh') {
              effectiveHintLang = entry.trans.sourceLang;
            } else if (hasKana) {
              effectiveHintLang = 'ja';
            } else if (textIsAmbiguousCJK && fromCtx === 'ja') {
              effectiveHintLang = 'ja';
            } else if (fromText && fromText !== 'zh') {
              effectiveHintLang = fromText;
            } else if (fromCtx) {
              effectiveHintLang = fromCtx;   // 日文上下文兜底
            }

            renderAndShowPopup(
              entry.word,
              { clientX: e.clientX, clientY: e.clientY },
              shadowHost.shadowRoot,
              window.currentTargetL || "en",
              effectiveHintLang,
            );
          });
        }
        return span;
      };

      const walkWithRegex = (node, reg, getEntry) => {
        if (processed.has(node)) return;
        if (node.nodeType === Node.TEXT_NODE) {
          if (!node.textContent.trim()) return;
          if (!reg.test(node.textContent)) {
            reg.lastIndex = 0;
            return;
          }
          reg.lastIndex = 0;
          processed.add(node);

          const frag = document.createDocumentFragment();
          let lastIndex = 0;
          let match;
          reg.lastIndex = 0;

          while ((match = reg.exec(node.textContent)) !== null) {
            if (match.index > lastIndex) {
              frag.appendChild(
                document.createTextNode(
                  node.textContent.slice(lastIndex, match.index),
                ),
              );
            }
            const entry = getEntry(match[0]);
            frag.appendChild(createHighlightSpan(match[0], entry));
            lastIndex = match.index + match[0].length;
          }

          if (lastIndex < node.textContent.length) {
            frag.appendChild(
              document.createTextNode(node.textContent.slice(lastIndex)),
            );
          }
          node.parentNode?.replaceChild(frag, node);
        } else if (
          node.nodeType === Node.ELEMENT_NODE &&
          ![
            "SCRIPT",
            "STYLE",
            "TEXTAREA",
            "INPUT",
            "CODE",
            "PRE",
            "NOSCRIPT",
          ].includes(node.tagName) &&
          !node.classList.contains("vocab-highlight")
        ) {
          processed.add(node);
          Array.from(node.childNodes).forEach((n) =>
            walkWithRegex(n, reg, getEntry),
          );
        }
      };

      const walk = (node) =>
        walkWithRegex(
          node,
          regex,
          (matchText) => wordMap[matchText.toLowerCase()],
        );

      const highlightWord = async (word) => {
        const freshEntry = await idb.vocabulary.get(word);
        if (!freshEntry || freshEntry.deleted) return;

        const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const isLatin = /^[a-zA-Z0-9_]+$/.test(word);
        const singleRegex = isLatin
          ? new RegExp(`\\b(${esc})\\b`, "giu")
          : new RegExp(`(${esc})`, "giu");
        wordMap[word.toLowerCase()] = freshEntry;

        // 暂停 Observer 防止触发循环
        observer.disconnect();

        // 专门遍历文本节点，不检查 processed
        const walkForNew = (node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            if (!node.textContent.trim()) return;
            singleRegex.lastIndex = 0;
            if (!singleRegex.test(node.textContent)) return;
            singleRegex.lastIndex = 0;

            const frag = document.createDocumentFragment();
            let lastIndex = 0;
            let match;
            singleRegex.lastIndex = 0;

            while ((match = singleRegex.exec(node.textContent)) !== null) {
              if (match.index > lastIndex) {
                frag.appendChild(
                  document.createTextNode(
                    node.textContent.slice(lastIndex, match.index),
                  ),
                );
              }
              frag.appendChild(createHighlightSpan(match[0], freshEntry));
              lastIndex = match.index + match[0].length;
            }
            if (lastIndex < node.textContent.length) {
              frag.appendChild(
                document.createTextNode(node.textContent.slice(lastIndex)),
              );
            }
            if (node.parentNode) {
              node.parentNode.replaceChild(frag, node);
            }
          } else if (
            node.nodeType === Node.ELEMENT_NODE &&
            ![
              "SCRIPT",
              "STYLE",
              "TEXTAREA",
              "INPUT",
              "CODE",
              "PRE",
              "NOSCRIPT",
            ].includes(node.tagName) &&
            !node.classList.contains("vocab-highlight")
          ) {
            Array.from(node.childNodes).forEach(walkForNew);
          }
        };

        walkForNew(document.body);

        // 恢复 Observer
        observer.observe(document.body, { childList: true, subtree: true });
      };
      let observer = null;
      const removeHighlight = (word) => {
        observer.disconnect();

        const els = Array.from(document.querySelectorAll(".vocab-highlight"));
        els.forEach((el) => {
          if (el.textContent.toLowerCase() === word.toLowerCase()) {
            const textNode = document.createTextNode(el.textContent);
            const parent = el.parentNode;
            if (parent) {
              parent.replaceChild(textNode, el);
              processed.add(textNode);
            }
          }
        });
        delete wordMap[word.toLowerCase()];
        observer.observe(document.body, { childList: true, subtree: true });
      };

      window.__vocabHighlightWord = highlightWord;
      window.__vocabRemoveHighlight = removeHighlight;

      // p-save 联动：监听来自 renderAndShowPopup 的收藏事件
      window.__vocabOnSave = async (wordText, isActive) => {
        if (!window.__vocabHighlightWord) return;
        if (isActive) {
          await highlightWord(wordText);
        } else {
          removeHighlight(wordText);
        }
      };

      walk(document.body);

      observer = new MutationObserver((mutations) => {
        const newNodes = [];
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (!processed.has(node)) newNodes.push(node);
          });
        });
        if (newNodes.length === 0) return;
        requestAnimationFrame(() => newNodes.forEach(walk));
      });

      observer.observe(document.body, { childList: true, subtree: true });

      chrome.storage.onChanged.addListener((changes) => {
        if (changes.vocabHighlight?.newValue === false) {
          observer.disconnect();
          document.querySelectorAll(".vocab-highlight").forEach((el) => {
            el.replaceWith(document.createTextNode(el.textContent));
          });
          const s = document.getElementById("vocab-highlight-style");
          if (s) s.remove();
          window.__vocabHighlightWord = null;
          window.__vocabRemoveHighlight = null;
          window.__vocabOnSave = null;
        }
      });
    };

    async function initHighlight() {
      const vocabulary = await safeSendMessage({
        type: "IDB_GET_ALL",
        prefix: "vb_",
      });
      if (!vocabulary) return;

      const words = Object.values(vocabulary)
        .filter((item) => item && !item.deleted && item.word)
        .map((item) => item.word.toLowerCase());

      if (words.length === 0) return;

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () =>
          doHighlight(words, vocabulary),
        );
      } else {
        doHighlight(words, vocabulary);
      }
    }

    const storage = await safeGetStorage("vocabHighlight");
    if (storage?.vocabHighlight) {
      await initHighlight();
    }

    chrome.storage.onChanged.addListener(async (changes) => {
      if (changes.vocabHighlight?.newValue === true) {
        await initHighlight();
      }
    });
  })();

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "TRANSLATE_DETAIL_UPDATE") {
      const currentWord = shadowHost?.getAttribute("data-current-word");
      if (msg.originalText !== currentWord) {
        if (shadowHost?._detailTimer) {
          clearTimeout(shadowHost._detailTimer);
          shadowHost._detailTimer = null;
        }
        sendResponse({ status: "ignored" });
        return;
      }
      if (msg.originalText !== currentWord) {
        sendResponse({ status: "ignored" });
        return;
      }
      const shadow = shadowHost?.shadowRoot;
      if (!shadow || popupEl?.style?.display === "none") {
        sendResponse({ status: "ignored" });
        return;
      }

      const isWord = msg.result?.isWord ?? false;

      if (msg.result?.isPartial) {
        if (shadowHost?._detailFullyRendered) {
          sendResponse({ status: "ignored" });
          return;
        }

        const pDetail = shadow.getElementById("p-detail");

        if (pDetail?.querySelector("#p-detail-retry")) {
          sendResponse({ status: "ok" });
          return;
        }

        const pBasic = shadow.getElementById("p-basic");
        const pPhonetic = shadow.getElementById("p-phonetic");
        const pExamples = shadow.getElementById("p-examples");

        if (pBasic) {
          pBasic.innerText = msg.result.basic || "";
          pBasic.style.color = "";
          pBasic.style.fontStyle = "normal";
        }
        if (pPhonetic) {
          pPhonetic.innerText = msg.result.sourcePhonetic
            ? `/${msg.result.sourcePhonetic.replace(/[\[\]\/]/g, "")}/`
            : "";
        }

        if (isWord) {
          shadowHost._detailFullyRendered = false;
          if (pDetail) {
            pDetail.innerHTML = "";
            pDetail.style.display = "block";
          }
          if (pExamples) pExamples.style.display = "none";

          if (shadowHost._detailTimer) {
            clearTimeout(shadowHost._detailTimer);
            shadowHost._detailTimer = null;
          }

          shadowHost._detailTimer = setTimeout(() => {
            if (shadowHost?._detailFullyRendered) return;
            const pDetail = shadow.getElementById("p-detail");
            if (pDetail) {
              pDetail.style.display = "block";
              pDetail.innerHTML = `<span id="p-detail-retry" style="opacity:0.5;font-size:12px;font-style:italic;cursor:pointer;text-decoration:underline;">↻ ${t("retry", window.uiLanguage) || "retry"}</span>`;
              shadow
                .getElementById("p-detail-retry")
                ?.addEventListener("click", () => {
                  shadow.getElementById("p-refresh")?.click();
                });
            }
          }, 8000);
        }
      } else {
        if (shadowHost) {
          clearTimeout(shadowHost._slowTimer);
          clearTimeout(shadowHost._detailTimer);
          shadowHost._slowTimer = null;
          shadowHost._detailTimer = null;
          shadowHost._detailFullyRendered = true;
        }
        const isRTL = checkRTL(window.currentTargetL);
        fillPopupData(
          msg.result,
          shadow,
          msg.originalText,
          window.currentTargetL,
          isRTL,
          null,
          shadowHost._effectiveHintLang || msg.result?.langInfo?.code || null,
        );
      }

      sendResponse({ status: "ok" });
    }
    return true;
  });
}

//yt

let fullSubtitleData = [];
let semanticGroups = [];
lastSubIndex = -1;
let lastDataLength = 0;

// ===== 字幕下载功能开始 =====
// 全局下载锁
let isDownloading = false;
function formatSRTTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function buildSRT(groups, translationMap = null) {
  return groups
    .map((g, i) => {
      const start = formatSRTTime(g.start);
      const end = formatSRTTime(g.end);
      const original = g.text;
      const translation = translationMap?.[i];

      let content = original;
      if (translation) content += `\n${translation}`;

      return `${i + 1}\n${start} --> ${end}\n${content}`;
    })
    .join("\n\n");
}

function getVideoTitle() {
  return (
    document
      .querySelector("h1.ytd-video-primary-info-renderer")
      ?.textContent?.trim() ||
    document.title.replace(" - YouTube", "").trim() ||
    "subtitle"
  );
}
// 下载前最后做一次校验补漏
let downloadAbortController = null;

async function fillMissingTranslations(
  translationMap,
  engine,
  lang,
  isAI,
  signal,
) {
  const stillMissing = [];
  semanticGroups.forEach((g, i) => {
    if (!translationMap[i]) stillMissing.push(i);
  });

  if (stillMissing.length === 0) return;

  logger.log(`[Download] 最终补漏 ${stillMissing.length} 句`);
  const btn = document.getElementById("kt-download-btn");

  function sleep(ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("ABORTED"));
      });
    });
  }

  for (const idx of stillMissing) {
    if (signal?.aborted) throw new Error("ABORTED");

    const text = semanticGroups[idx].text;
    const key = getCacheKey(text, engine, lang);

    let success = false;
    for (let retry = 0; retry < 5; retry++) {
      if (signal?.aborted) throw new Error("ABORTED");
      try {
        const res = await getDetailedTranslation(text);
        if (res?.basic) {
          translationMap[idx] = res.basic;
          fastMemoryCache.set(key, { basic: res.basic });
          success = true;
          break;
        }
      } catch (e) {
        if (e.message === "ABORTED") throw e;
        const isRateLimit =
          e?.message?.includes("429") ||
          e?.message?.toLowerCase().includes("rate limit");
        if (isRateLimit) {
          const delay = 5000 * Math.pow(2, retry);
          if (btn) {
            btn._savedText = `⏸ ${Math.round(delay / 1000)}s`;
            if (btn.textContent !== "✕ Cancel")
              btn.textContent = btn._savedText;
          }
          await sleep(delay);
        } else {
          break;
        }
      }
    }

    if (success) {
      const done = Object.keys(translationMap).filter(
        (k) => translationMap[k],
      ).length;
      if (btn) {
        btn._savedText = `⏳ ${done}/${semanticGroups.length}`;
        if (btn.textContent !== "✕ Cancel") btn.textContent = btn._savedText;
      }
    }

    await sleep(isAI ? 2000 : 500);
  }
}
// 自定义confirm弹窗
function showMiraConfirm(msg) {
  return new Promise((resolve) => {
    // 防止重复
    document.getElementById("mira-confirm-modal")?.remove();

    const modal = document.createElement("div");
    modal.id = "mira-confirm-modal";
    modal.style.cssText = `
      position: fixed; inset: 0; z-index: 2147483647;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
    `;

    modal.innerHTML = `
  <div style="
    background: #1e293b; border: 1px solid #334155;
    border-radius: 12px; padding: 24px 28px;
    max-width: 360px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    font-family: system-ui, sans-serif; color: white;
  ">
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:16px;">
      <img src="${ASSETS.logoBase64}" style="width:20px; height:20px; border-radius:4px;" />
      <span style="font-weight:700; font-size:15px; color:#38bdf8;">Mira Translator</span>
    </div>
    <div style="font-size:14px; line-height:1.7; color:#cbd5e1; white-space:pre-line;">${msg}</div>
    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
      <button id="mira-confirm-cancel" style="
        padding: 8px 20px; border-radius: 8px; border: 1px solid #475569;
        background: transparent; color: #94a3b8; cursor: pointer; font-size: 13px;
        transition: all 0.25s ease; position: relative; overflow: hidden;
      ">${t("cancel", window.uiLanguage) || "Cancel"}</button>
      <button id="mira-confirm-ok" style="
        padding: 8px 20px; border-radius: 8px; border: none;
        background: linear-gradient(135deg, #38bdf8, #818cf8);
        color: #0f172a; cursor: pointer; font-size: 13px;
        font-weight: 600; transition: all 0.25s ease;
        position: relative; overflow: hidden;
        box-shadow: 0 0 0 rgba(56,189,248,0);
      ">OK</button>
    </div>
  </div>
`;

    document.body.appendChild(modal);

    const okBtn = modal.querySelector("#mira-confirm-ok");
    const cancelBtn = modal.querySelector("#mira-confirm-cancel");

    // 提前下载提示框的 OK 按钮
    okBtn.onmouseenter = () => {
      okBtn.style.transform = "translateY(-2px) scale(1.03)";
      okBtn.style.boxShadow =
        "0 0 16px rgba(56,189,248,0.6), 0 0 32px rgba(129,140,248,0.3)";
      okBtn.style.background = "linear-gradient(135deg, #7dd3fc, #a5b4fc)";
    };
    okBtn.onmouseleave = () => {
      okBtn.style.transform = "translateY(0) scale(1)";
      okBtn.style.boxShadow = "0 0 0 rgba(56,189,248,0)";
      okBtn.style.background = "linear-gradient(135deg, #38bdf8, #818cf8)";
    };
    okBtn.onmousedown = () => {
      okBtn.style.transform = "translateY(1px) scale(0.97)";
      okBtn.style.boxShadow = "0 0 8px rgba(56,189,248,0.3)";
    };
    okBtn.onmouseup = () => {
      okBtn.style.transform = "translateY(-2px) scale(1.03)";
    };

    cancelBtn.onmouseenter = () => {
      cancelBtn.style.borderColor = "#64748b";
      cancelBtn.style.color = "#e2e8f0";
      cancelBtn.style.background = "rgba(255,255,255,0.05)";
      cancelBtn.style.transform = "translateY(-1px)";
    };
    cancelBtn.onmouseleave = () => {
      cancelBtn.style.borderColor = "#475569";
      cancelBtn.style.color = "#94a3b8";
      cancelBtn.style.background = "transparent";
      cancelBtn.style.transform = "translateY(0)";
    };
    cancelBtn.onmousedown = () => {
      cancelBtn.style.transform = "translateY(1px)";
      cancelBtn.style.background = "rgba(255,255,255,0.03)";
    };
    cancelBtn.onmouseup = () => {
      cancelBtn.style.transform = "translateY(-1px)";
    };

    okBtn.onclick = () => {
      modal.remove();
      resolve(true);
    };
    cancelBtn.onclick = () => {
      modal.remove();
      resolve(false);
    };
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.remove();
        resolve(false);
      }
    };
  });
}

async function downloadSubtitles(withTranslation = false) {
  if (!semanticGroups?.length) return;

  // 正在下载时点击 = 取消
  if (isDownloading) {
    downloadAbortController?.abort();
    return;
  }

  downloadAbortController = new AbortController();
  const signal = downloadAbortController.signal;

  function checkAborted() {
    if (signal.aborted) throw new Error("ABORTED");
  }

  const activeCfg = window.currentConfig?.activeConfig || {};
  const engine =
    activeCfg.engine ||
    window.currentConfig?.selectedEngine ||
    getRuntimeDefaultEngine();
  const lang =
    window.currentConfig?.targetLanguage ||
    window.currentTargetL ||
    getBrowserLang() ||
    "en";
  const uiLang = window.uiLanguage || lang;
  const isAI = AI_LLM_WHITE_LIST.includes(engine);

  let translationMap = null;

  if (withTranslation) {
    translationMap = {};
    const missing = [];
    let hitCount = 0;

    semanticGroups.forEach((g, i) => {
      const key = getCacheKey(g.text, engine, lang);
      const cached = fastMemoryCache.get(key);
      if (cached?.basic) {
        translationMap[i] = cached.basic;
        hitCount++;
      } else {
        const fingerprint = key.substring(key.indexOf("_", 3));
        const aiHit = AI_LLM_WHITE_LIST.find((ai) =>
          fastMemoryCache.has(`tr_${ai}${fingerprint}`),
        );
        if (aiHit) {
          const fallback = fastMemoryCache.get(`tr_${aiHit}${fingerprint}`);
          if (fallback?.basic) {
            translationMap[i] = fallback.basic;
            fastMemoryCache.set(key, fallback);
            hitCount++;
            return;
          }
        }
        missing.push(i);
      }
    });

    logger.log(
      `[Download] 缓存命中 ${hitCount}/${semanticGroups.length}，缺失 ${missing.length} 句`,
    );

    const total = semanticGroups.length;
    const cacheRate = Math.round((hitCount / total) * 100);

    if (isAI && missing.length > 10) {
      const msg = (
        cacheRate < 30 ? t("dlRateLow", uiLang) : t("dlRatePartial", uiLang)
      )
        .replaceAll("{rate}", cacheRate)
        .replaceAll("{missing}", missing.length);

      if (cacheRate === 0) {
        const fullMsg = t("dlRateLow", uiLang).replaceAll("{rate}", cacheRate);
        const hint = fullMsg.split("\n\n").slice(0, 2).join("\n\n");
        await showMiraConfirm(hint);
        return;
      }
      const confirmed = await showMiraConfirm(msg);
      if (!confirmed) return;

      const content = buildSRT(semanticGroups, translationMap);
      triggerDownload(
        content,
        `[Mira] ${getVideoTitle()}_bilingual_${cacheRate}pct.txt`,
      );
      return;
    }

    if (missing.length > 0) {
      isDownloading = true;

      const btn = document.getElementById("kt-download-btn");

      function setBtnCancel() {
        if (!btn) return;
        btn._savedText = `⏳ 0/${total}`;
        btn.textContent = btn._savedText;
        btn.style.background = "rgba(34, 197, 94, 0.15)";
        btn.style.borderColor = "rgba(34, 197, 94, 0.4)";
        btn.style.color = "#4ade80";

        btn.disabled = false;

        btn.onmouseenter = () => {
          if (!isDownloading) return;
          btn._savedText = btn._savedText || btn.textContent;
          btn.textContent = "✕ Cancel";
          btn.style.background = "rgba(239, 68, 68, 0.2)";
          btn.style.borderColor = "rgba(239, 68, 68, 0.5)";
          btn.style.color = "#ff8080";
        };
        btn.onmouseleave = () => {
          btn.textContent = btn._savedText || btn.textContent;
          btn.style.background = "rgba(34, 197, 94, 0.15)";
          btn.style.borderColor = "rgba(34, 197, 94, 0.4)";
          btn.style.color = "#4ade80";
        };
      }

      function resetBtn() {
        if (!btn) return;
        btn.textContent = `⬇ ${t("bilingual", uiLang)} TXT`;
        btn.style.background = "";
        btn.style.borderColor = "";
        btn.style.color = "";
        btn.disabled = false;
        btn.onmouseenter = null;
        btn.onmouseleave = null;
        btn._savedText = null;
      }

      function updateProgress(extra = "") {
        if (signal.aborted || !btn) return;
        const done = Object.keys(translationMap).length;
        const text = extra || `⏳ ${done}/${total}`;
        btn._savedText = text;
        // hover 中不打断显示
        if (btn.textContent !== "✕ Cancel") btn.textContent = text;
      }

      function sleep(ms) {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, ms);
          signal.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new Error("ABORTED"));
          });
        });
      }

      async function translateChunkWithRetry(chunk, retryCount = 0) {
        checkAborted();
        const MAX_RETRIES = 4;
        const BASE_DELAY = 3000;
        const payload = chunk
          .map((item) => `⟦KT_${item.absoluteIndex}⟧ ${item.text}`)
          .join("\n");
        try {
          const res = await getDetailedTranslation(payload);
          checkAborted();
          if (res?.basic) {
            const split = splitBatchTranslation(res.basic);
            chunk.forEach((item) => {
              if (split[item.absoluteIndex]) {
                translationMap[item.absoluteIndex] = split[item.absoluteIndex];
                fastMemoryCache.set(item.key, {
                  basic: split[item.absoluteIndex],
                });
              }
            });
            updateProgress();
          }
        } catch (e) {
          if (e.message === "ABORTED") throw e;
          const isRateLimit =
            e?.status === 429 ||
            e?.message?.includes("429") ||
            e?.message?.toLowerCase().includes("rate limit") ||
            e?.message?.toLowerCase().includes("too many");
          if (isRateLimit && retryCount < MAX_RETRIES) {
            const delay = BASE_DELAY * Math.pow(2, retryCount);
            logger.warn(
              `Rate limited, retry ${retryCount + 1}/${MAX_RETRIES} after ${delay}ms`,
            );
            updateProgress(`⏸ ${Math.round(delay / 1000)}s`);
            await sleep(delay);
            updateProgress();
            return translateChunkWithRetry(chunk, retryCount + 1);
          }
          logger.warn("Chunk failed after retries:", e);
        }
      }

      const CHUNK_SIZE = isAI ? 3 : 5;
      const CHUNK_INTERVAL = isAI ? 2000 : 800;

      const chunks = [];
      for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
        chunks.push(
          missing.slice(i, i + CHUNK_SIZE).map((idx) => ({
            absoluteIndex: idx,
            text: semanticGroups[idx].text,
            key: getCacheKey(semanticGroups[idx].text, engine, lang),
          })),
        );
      }

      setBtnCancel();

      try {
        for (let i = 0; i < chunks.length; i++) {
          await translateChunkWithRetry(chunks[i]);
          if (i < chunks.length - 1) await sleep(CHUNK_INTERVAL);
        }
        await fillMissingTranslations(
          translationMap,
          engine,
          lang,
          isAI,
          signal,
        );
      } catch (e) {
        if (e.message === "ABORTED") {
          logger.log("[Download] 用户取消下载");
          isDownloading = false;
          downloadAbortController = null;
          resetBtn();
          return;
        }
      }

      isDownloading = false;
      downloadAbortController = null;
      resetBtn();
    }
  }

  const content = buildSRT(semanticGroups, translationMap);
  const filename = `[Mira] ${getVideoTitle()}${withTranslation ? "_bilingual" : ""}.txt`;
  triggerDownload(content, filename);
}

function triggerDownload(content, filename) {
  const blob = new Blob(["\uFEFF" + content], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function injectDownloadButton() {
  if (document.getElementById("kt-subtitle-download")) return;
  // 挂载到 YT 右下角工具栏区域
  const target = document.querySelector(".ytp-right-controls");
  if (!target) return;

  const wrapper = document.createElement("div");
  wrapper.id = "kt-subtitle-download";
  wrapper.style.cssText = `
    display: inline-flex; align-items: center; gap: 6px;
    margin-right: 8px; margin-left: 12px; opacity: 0;
    animation: ktFadeIn 0.3s ease forwards;
  `;

  const style = document.createElement("style");
  style.textContent = `
    @keyframes ktFadeIn { to { opacity: 1; } }
    .kt-dl-btn {
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.25);
      color: white; border-radius: 12px;
      padding: 3px 10px; font-size: 13px;
      cursor: pointer; transition: background 0.2s;
      white-space: nowrap;
      position: relative;
    }
    .kt-dl-btn:hover { background: rgba(255,255,255,0.25); }
      .kt-dl-btn .kt-tooltip {
      position: absolute;
      bottom: calc(100% + 28px);  /* 加大偏移  */
      left: 50%;
      transform: translateX(-50%);
      background: rgba(28, 28, 28, 0.68);  
      border-radius: 8px;
      color: #fff;
      font-size: 12px;
      padding: 5px 10px;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.1s ease;
    }
    .kt-dl-btn:hover .kt-tooltip {
      opacity: 1;
    }
  `;
  document.head.appendChild(style);

  const btnOriginal = document.createElement("button");
  btnOriginal.className = "kt-dl-btn";
  btnOriginal.textContent = "⬇ TXT";
  btnOriginal.title = '';
  btnOriginal.innerHTML = `⬇ TXT<span class="kt-tooltip">${t("dlOriginal", window.uiLanguage)}</span>`; //下载原文字幕
  btnOriginal.onclick = () => downloadSubtitles(false);

  const btnBilingual = document.createElement("button");
  btnBilingual.id = "kt-download-btn";
  btnBilingual.className = "kt-dl-btn";
  btnBilingual.textContent = `⬇ ${t("bilingual", window.uiLanguage)} TXT`; //双语
  btnBilingual.title = '';
  btnBilingual.innerHTML = `⬇ ${t("bilingual", window.uiLanguage)} TXT<span class="kt-tooltip">${t("dlBilingual", window.uiLanguage)}</span>`; //下载双语字幕（含翻译）
  btnBilingual.onclick = () => downloadSubtitles(true);

  wrapper.appendChild(btnOriginal);
  wrapper.appendChild(btnBilingual);
  target.prepend(wrapper);
}

function removeDownloadButton() {
  document.getElementById("kt-subtitle-download")?.remove();
}
//字幕下载功能结束--------

window.addEventListener("KT_DATA_READY", (e) => {
  fullSubtitleData = e.detail;
  if (typeof fastMemoryCache !== "undefined") fastMemoryCache.clear();
  if (typeof pendingRequests !== "undefined") pendingRequests.clear();
  const engine =
    window.currentConfig?.selectedEngine || getRuntimeDefaultEngine();
  const isAI = AI_LLM_WHITE_LIST.includes(engine);
  semanticGroups = mergeToSemantic(fullSubtitleData, isAI);
  lastDataLength = fullSubtitleData.length;
  if (semanticGroups.length > 0) {
    setTimeout(() => {
      batchPrefetch(0);
    }, 200);
  }
  injectDownloadButton();
  const dlBtn = document.getElementById("kt-subtitle-download");
  if (dlBtn)
    dlBtn.style.display =
      typeof isYTEnabled === "undefined" || isYTEnabled
        ? "inline-flex"
        : "none";
});

(function initVideoResetListener() {
  const video = document.querySelector("video");
  if (!video) {
    setTimeout(initVideoResetListener, 500);
    return;
  }
  video.addEventListener("emptied", () => {
    fullSubtitleData = [];
    semanticGroups = [];
    lastSubIndex = -1;
    lastDataLength = 0;
    if (typeof fastMemoryCache !== "undefined") fastMemoryCache.clear();
    if (typeof pendingRequests !== "undefined") pendingRequests.clear();
    const box = document.getElementById("kt-yt-box");
    const oEl = document.getElementById("yt-o");
    const tEl = document.getElementById("yt-t");
    if (box) {
      box.style.opacity = "0";
      box.style.visibility = "hidden";
    }
    if (oEl) oEl.innerHTML = "";
    if (tEl) tEl.innerText = "";
    if (tEl) tEl.classList.remove("kt-loading");
    removeDownloadButton();
  });
})();

//断句
function mergeToSemantic(data, isAI = false) {
  if (!data || data.length === 0) return [];
  const groups = [];
  let temp = null;
  const cjkRegex =
    /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/;
  const isCJK = cjkRegex.test(data[0]?.text || "");
  const isEnglish = !isCJK;
  const LIMITS = isAI
    ? {
      MAX_CHARS: 150,
      MIN_CHARS_PAUSE: 80,
      PAUSE_GAP: 1.5,
      FORCE_CUT: 210,
    }
    : {
      MAX_CHARS: 120,
      MIN_CHARS_PAUSE: 80,
      PAUSE_GAP: 1.2,
      FORCE_CUT: 180,
    };
  data.forEach((item, index) => {
    const currentRawText = item.text.replace(/\n/g, " ").trim();
    const startTime = parseFloat(item.start);
    const durTime = parseFloat(item.duration) || 1.0;
    const nextItem = data[index + 1];
    const nextStart = nextItem ? parseFloat(nextItem.start) : null;
    const gap = nextStart !== null ? nextStart - (startTime + durTime) : 0;
    const safeGap = Math.max(gap, 0);
    const isLast = index === data.length - 1;
    if (/^\[(music|applause|laughter)\]$/i.test(currentRawText)) {
      if (temp) pushGroup("Segment Break");
      groups.push({
        start: startTime,
        text: currentRawText,
        end: startTime + durTime,
      });
      return;
    }
    if (!temp) {
      temp = {
        start: startTime,
        text: currentRawText,
        end: startTime + durTime,
      };
    } else {
      temp.text += (isCJK ? "" : " ") + currentRawText;
      temp.end = startTime + durTime;
    }
    let shouldBreak = false;
    let breakReason = "";
    const trimmedText = temp.text.trim();
    const charCount = trimmedText.length;
    if (isLast) {
      shouldBreak = true;
      breakReason = "End of Data";
    } else if (isCJK) {
      if (/[。？！?!]$/.test(trimmedText) && charCount > 15) {
        shouldBreak = true;
        breakReason = "Punc";
      } else if (charCount > LIMITS.MAX_CHARS) {
        shouldBreak = true;
        breakReason = "Max";
      } else if (
        charCount > LIMITS.MIN_CHARS_PAUSE &&
        safeGap > LIMITS.PAUSE_GAP
      ) {
        shouldBreak = true;
        breakReason = "Pause";
      }
    } else if (isEnglish) {
      const words = trimmedText.split(/\s+/);
      const lastWord =
        words
          .at(-1)
          ?.toLowerCase()
          .replace(/[^a-z]/g, "") || "";
      const protectionList = [
        "the",
        "a",
        "an",
        "and",
        "or",
        "but",
        "if",
        "because",
        "so",
        "of",
        "to",
        "in",
        "at",
        "with",
        "for",
        "as",
        "on",
        "by",
        "is",
        "was",
        "were",
        "are",
        "be",
        "been",
        "that",
        "which",
        "who",
        "my",
        "your",
        "his",
        "her",
        "their",
        "our",
        "its",
      ];
      const isHanging =
        protectionList.includes(lastWord) ||
        /\b(how|why|what|when|where|who|like|than)\b\s*$/i.test(trimmedText);
      const dynamicPauseGap = isHanging
        ? LIMITS.PAUSE_GAP * 2
        : LIMITS.PAUSE_GAP;
      const endsWithSentencePunc = /[.?!]["']?\s*$/.test(trimmedText);
      const minPuncLen = isAI ? 70 : 40;
      if (endsWithSentencePunc && charCount > minPuncLen && !isHanging) {
        shouldBreak = true;
        breakReason = "Full Sentence";
      } else if (
        charCount > LIMITS.MIN_CHARS_PAUSE &&
        safeGap > dynamicPauseGap &&
        !isHanging
      ) {
        shouldBreak = true;
        breakReason = "Semantic Breath";
      } else if (charCount > LIMITS.FORCE_CUT) {
        shouldBreak = true;
        breakReason = "Visual Hard Cap";
      }
    }
    if (shouldBreak) {
      if (nextStart !== null) {
        const timeUntilNext = nextStart - temp.end;
        if (timeUntilNext > 0) {
          const MAX_EXTENSION = 2.5;
          const buffer = 0.05;
          const extendDuration = Math.min(
            timeUntilNext - buffer,
            MAX_EXTENSION,
          );
          if (extendDuration > 0) {
            temp.end += extendDuration;
          }
        }
      } else if (isLast) {
        temp.end += 1.0;
      }
      pushGroup(breakReason);
    }
    function pushGroup(reason) {
      if (!temp) return;
      groups.push(temp);
      temp = null;
    }
  });
  return groups;
}
if (!document.getElementById("mira-global-style")) {
  const style = document.createElement("style");
  style.id = "mira-global-style";
  style.innerHTML = `
  :root {
        --kt-bg-rgba: rgba(0, 0, 0, 0.5);
        --kt-origin-color: #f3f4f6;
        --kt-origin-size: 24px;
        --kt-trans-size: 22px;
        --kt-trans-color: #38bdf8;
    }
        .html5-video-player.kt-enabled .ytp-subtitles-player-content,
        .html5-video-player.kt-enabled .caption-window,
        .html5-video-player.kt-enabled .ytp-caption-segment {
            display: none !important;
            opacity: 0 !important;
        }
        #kt-yt-box {
            position: absolute !important;
            left: 50% !important;
            transform: translateX(-50%);
            display: flex;
            width: max-content !important;
            max-width: 90% !important;
            min-width: 100px;
            z-index: 2147483647 !important;
            text-align: center !important;
            flex-direction: column;
            align-items: center;
            padding: 12px 24px !important;
            background: var(--kt-bg-rgba, rgba(0, 0, 0, 0.5));
            border-radius: 12px;
            cursor: grab;
            user-select: none;
            visibility: hidden;
            opacity: 0;
            transition: opacity 0.2s, visibility 0.2s, transform 0.3s ease-out;
        }
        #kt-yt-box:hover, #kt-yt-box.dragging {
            background: rgba(0, 0, 0, 0.8);
            outline: 1px dashed rgba(255, 255, 255, 0.2);
        }
        #yt-o {
            color: var(--kt-origin-color, white) !important;
            font-size: var(--kt-origin-size, 24px) !important;
            text-shadow: 2px 2px 4px black;
            font-weight: bold;
            margin: 0 auto;
            width: 100%;
            line-height: 1.4;
            pointer-events: auto;
        }
        #yt-t {
            font-size: var(--kt-trans-size, 22px) !important;
            color: var(--kt-trans-color, #38bdf8) !important;
            text-shadow: 2px 2px 4px black;
            font-weight: bold;
            margin: 8px auto 0;
            width: 100%;
            line-height: 1.4;
        }
        .kt-word {
            cursor: pointer;
            transition: color 0.2s;
            display: inline-block;
        }
        .kt-word:hover {
            color: #facc15 !important;
        }
        #yt-t.kt-loading {
        opacity: 0.6 !important;
        font-style: italic !important;
        color: #94a3b8 !important;
        text-shadow: none !important;
        font-size: 20px !important;
        }
        #kt-yt-box.kt-settings-open {
        z-index: 100 !important;
        opacity: 0.25 !important;
        transition: opacity 0.2s ease;
       }
    `;
  document.head.appendChild(style);
}
const PREFETCH_AHEAD = 12;
const BATCH_SIZE = 8;
const BATCH_GAP = 3000;
let lastBatchTime = 0;
function splitBatchTranslation(translatedText) {
  const map = {};
  const regex = /⟦KT_(\d+)⟧\s*([\s\S]*?)(?=⟦KT_\d+⟧|$)/g;
  let match;
  while ((match = regex.exec(translatedText))) {
    const index = Number(match[1]);
    let content = match[2].trim();
    content = content.replace(/^⟦KT_\d+⟧\s*/, "");
    content = content.replace(/\n+/g, " ").trim();
    content = content.replace(/^[:：]\s*/, "").replace(/["”]$|^["“]/g, "");
    map[index] = content;
  }
  return map;
}

async function batchPrefetch(startIndex) {
  if (isDownloading) return;
  const now = Date.now();
  if (now - lastBatchTime < BATCH_GAP) return;
  lastBatchTime = now;
  const windowStart = Math.max(0, startIndex - 2);
  const windowEnd = startIndex + PREFETCH_AHEAD;
  const slice = semanticGroups.slice(windowStart, windowEnd);
  if (!slice.length) return;
  const activeCfg = window.currentConfig?.activeConfig || {};
  const engine =
    activeCfg.engine ||
    window.currentConfig?.selectedEngine ||
    getRuntimeDefaultEngine();
  let lang = getCurrentLang();
  lang = lang.replace("_", "-").toLowerCase();
  const isTraditional = !AI_LLM_WHITE_LIST.includes(engine);
  const itemsToTranslate = [];
  for (let i = 0; i < slice.length; i++) {
    const group = slice[i];
    const absoluteIndex = windowStart + i;
    const fullKey = getCacheKey(group.text, engine, lang);
    if (fastMemoryCache.has(fullKey) || pendingRequests.has(fullKey)) continue;
    itemsToTranslate.push({
      absoluteIndex,
      text: group.text,
      key: fullKey,
    });
  }
  if (itemsToTranslate.length === 0) return;
  const MAX_CHUNK_SIZE = 5;
  const MAX_CHAR_COUNT = 800;
  let currentChunk = [];
  let currentLength = 0;
  const processChunk = async (chunk) => {
    if (!chunk.length) return;
    chunk.forEach((item) => pendingRequests.add(item.key));
    const textPayload = chunk
      .map((item) => `⟦KT_${item.absoluteIndex}⟧ ${item.text}`)
      .join("\n");
    try {
      const res = await getDetailedTranslation(textPayload);
      if (res?.basic) {
        const split = splitBatchTranslation(res.basic);
        chunk.forEach((item) => {
          if (split[item.absoluteIndex]) {
            fastMemoryCache.set(item.key, { basic: split[item.absoluteIndex] });
          }
        });
      }
    } catch (e) {
      logger.warn("Chunk Translation Failed:", e);
      chunk.forEach((item) => pendingRequests.delete(item.key));
    } finally {
      chunk.forEach((item) => pendingRequests.delete(item.key));
    }
  };
  for (const item of itemsToTranslate) {
    const itemLen = item.text.length;
    if (
      currentChunk.length >= MAX_CHUNK_SIZE ||
      currentLength + itemLen > MAX_CHAR_COUNT
    ) {
      await processChunk(currentChunk);
      currentChunk = [];
      currentLength = 0;
    }
    currentChunk.push(item);
    currentLength += itemLen;
  }
  if (currentChunk.length > 0) {
    await processChunk(currentChunk);
  }
}

let __ktSourceLang = null;

window.addEventListener("KT_SOURCE_LANG_READY", (e) => {
  __ktSourceLang = e.detail?.lang || null;
  logger.log("[Mira] 收到源语言:", __ktSourceLang);
});

function getVideoSourceLang() {
  if (__ktSourceLang) return __ktSourceLang;

  // 兜底：用字幕文字检测
  const subtitleEl = document.querySelector('.ytp-caption-segment, .caption-window');
  const ctx = subtitleEl?.textContent || "";
  return ctx.length > 5 ? detectSourceLang(ctx) : null;
}
function syncSubtitleDisplay() {
  const video = document.querySelector("video");
  const player = document.querySelector(".html5-video-player");
  const box = document.getElementById("kt-yt-box");
  const enabled = typeof isYTEnabled === "undefined" ? true : isYTEnabled;
  refreshIcon();
  const ccOn =
    typeof isYoutubeCaptionOn === "function" ? isYoutubeCaptionOn() : true;
  const shouldShow = enabled && ccOn;
  if (!shouldShow) {
    if (box) box.style.display = "none";
    const tooltip = document.getElementById("kt-word-tooltip");
    if (tooltip && tooltip.style.display !== "none") {
      tooltip.style.display = "none";
      if (video && video.paused && !isVideoManuallyPaused) video.play();
    }
    if (player) player.classList.remove("kt-enabled");
    return;
  }
  //  等 box 创建好再继续，没有就显示 hint 并返回
  if (player && !document.getElementById("kt-yt-box")) {
    createSubtitleBox(player);

    return;
  }

  if (!semanticGroups || semanticGroups.length === 0) {
    // hint 存在就保持显示，不做任何操作
    return;
  }
  if (player) {
    const shouldBeEnabled =
      (typeof isYTEnabled !== "undefined" ? isYTEnabled : true) && ccOn;
    const box = document.getElementById("kt-yt-box");
    if (box) box.style.display = shouldBeEnabled ? "flex" : "none";
    if (shouldBeEnabled && !player.classList.contains("kt-enabled")) {
      player.classList.add("kt-enabled");
    } else if (!shouldBeEnabled && player.classList.contains("kt-enabled")) {
      player.classList.remove("kt-enabled");
    }
    if (!shouldBeEnabled) return;
  }
  if (Array.isArray(fullSubtitleData) && fullSubtitleData.length > 0) {
    const lenDiff = Math.abs(fullSubtitleData.length - lastDataLength);
    if (lenDiff > 0) {
      semanticGroups = mergeToSemantic(fullSubtitleData);
      lastDataLength = fullSubtitleData.length;
    }
  }
  if (!video || !semanticGroups || semanticGroups.length === 0) {
    if (box) {
      box.style.opacity = "0";
      box.style.visibility = "hidden";
    }
    return;
  }
  const now = video.currentTime;
  const currentIndex = semanticGroups.findIndex(
    (g) => now >= g.start - 0.2 && now <= g.end + 0.5,
  );
  if (box) {
    if (currentIndex === -1) {
      box.style.opacity = "0";
      box.style.pointerEvents = "none";
    } else {
      box.style.opacity = "1";
      box.style.pointerEvents = "auto";
      box.style.visibility = "visible";
    }
  }
  if (currentIndex !== -1) {
    // 第一次匹配到字幕时，清除 loading hint
    const hintEl = document.getElementById("kt-loading-hint");
    if (hintEl) hintEl.remove();
    const group = semanticGroups[currentIndex];
    const tEl = document.getElementById("yt-t");
    const oEl = document.getElementById("yt-o");
    const activeCfg = window.currentConfig?.activeConfig || {};
    const currentEngine =
      activeCfg.engine ||
      window.currentConfig?.selectedEngine ||
      getRuntimeDefaultEngine();
    const currentTargetL = getCurrentLang();
    const cacheKey = getCacheKey(group.text, currentEngine, currentTargetL);
    const isAI = AI_LLM_WHITE_LIST.includes(currentEngine);
    const isBing = currentEngine === "bing";
    const isBatchEngine = isAI || isBing;
    if (currentIndex !== lastSubIndex) {
      if (typeof closeTooltipAndResume === "function") closeTooltipAndResume();
      lastSubIndex = currentIndex;
      let cached =
        typeof fastMemoryCache !== "undefined"
          ? fastMemoryCache.get(cacheKey)
          : null;
      if (!cached && !isAI && typeof fastMemoryCache !== "undefined") {
        const fingerprint = cacheKey.substring(cacheKey.indexOf("_", 3));
        const aiHit = AI_LLM_WHITE_LIST.find((ai) =>
          fastMemoryCache.has(`tr_${ai}${fingerprint}`),
        );
        if (aiHit) {
          cached = fastMemoryCache.get(`tr_${aiHit}${fingerprint}`);
          fastMemoryCache.set(cacheKey, cached);
        }
      }
      //源语言 === 目标语言时，隐藏翻译行
      const sourceLang = getVideoSourceLang();
      if (oEl) renderWords(group.text, oEl, sourceLang);
      if (tEl) {
        // logger.log(
        //   `[Subtitle Display] Source Lang: ${sourceLang}, Target Lang: ${currentTargetL}`,
        // );
        const targetLang = getCurrentLang()?.split("-")[0].toLowerCase();
        const isSameLang =
          sourceLang && targetLang && sourceLang === targetLang;

        if (isSameLang) {
          tEl.style.display = "none";
          tEl.innerText = "";
          tEl.classList.remove("kt-loading");
        } else {
          tEl.style.display = ""; // 恢复显示
        }

        if (cached && cached.basic) {
          tEl.innerText = cached.basic;
          tEl.classList.remove("kt-loading");
        } else {
          if (isBatchEngine) {
            tEl.innerText = t("loading") || "Translating...";
            tEl.classList.add("kt-loading");
            const thisRequestIndex = currentIndex;
            setTimeout(async () => {
              const currentTEl = document.getElementById("yt-t");
              if (
                lastSubIndex === thisRequestIndex &&
                currentTEl?.classList.contains("kt-loading")
              ) {
                logger.log("批量预取超时/失败，触发单句强制补漏...");
                try {
                  const res = await getDetailedTranslation(group.text);
                  if (lastSubIndex === thisRequestIndex && res?.basic) {
                    currentTEl.innerText = res.basic;
                    currentTEl?.classList.remove("kt-loading");
                    fastMemoryCache.set(cacheKey, res);
                  }
                } catch (e) {
                  if (currentTEl) currentTEl.innerText = "Translation Error";
                  logger.error("Fallback failed:", e);
                }
              }
            }, 3000);
          } else {
            tEl.innerText =
              typeof t === "function" ? t("loading") : "Translating...";
            tEl?.classList.add("kt-loading");
            getDetailedTranslation(group.text)
              .then((res) => {
                if (!res || res.isPending || !res.basic) return;
                if (typeof fastMemoryCache !== "undefined")
                  fastMemoryCache.set(cacheKey, res);
                if (lastSubIndex === currentIndex) {
                  const innerTEl = document.getElementById("yt-t");
                  if (innerTEl) {
                    innerTEl.innerText = res.basic;
                    innerTEl.classList.remove("kt-loading");
                  }
                }
              })
              .catch(() => { });
          }
        }
      }
      batchPrefetch(currentIndex);
    } else {
      if (tEl && tEl.classList.contains("kt-loading")) {
        const cached =
          typeof fastMemoryCache !== "undefined"
            ? fastMemoryCache.get(cacheKey)
            : null;
        if (cached && cached.basic) {
          tEl.innerText = cached.basic;
          tEl.classList.remove("kt-loading");
        }
      }
    }
  } else if (currentIndex === -1 && lastSubIndex !== -1) {
    lastSubIndex = -1;
    if (box) {
      box.style.opacity = "0";
      box.style.visibility = "hidden";
    }
  }
}
if (window.ktDisplayTimer) clearInterval(window.ktDisplayTimer);
window.ktDisplayTimer = setInterval(syncSubtitleDisplay, 100);
async function createSubtitleBox(player) {
  const box = document.createElement("div");
  box.id = "kt-yt-box";
  box.innerHTML = `
    <div id="yt-o"></div>
    <div id="yt-t"></div>
`;
  player.appendChild(box);

  const tempHint = document.createElement("div");
  tempHint.id = "kt-loading-hint";
  tempHint.style.cssText = `
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    bottom: 60px;
    z-index: 2147483647;
    color: #cbd5e1;
    font-size: 17px;
    padding: 8px 16px;
    background: rgba(0,0,0,0.6);
    border-radius: 8px;
    pointer-events: none;
`;
  tempHint.innerText =
    t("loadingSubtitles", window.uiLanguage) || "Loading subtitles...";
  player.appendChild(tempHint);
  try {
    const data = await safeGetStorage(["ytBoxBottom", "ytStyleSettings"]);
    if (!data) return;
    if (data.ytBoxBottom && parseInt(data.ytBoxBottom) > 10) {
      box.style.bottom = data.ytBoxBottom;
    } else {
      box.style.bottom = "20px";
    }
    if (data.ytStyleSettings) {
      applySubtitleSettings(data.ytStyleSettings);
    }
  } catch (e) {
    if (e.message?.includes("context invalidated")) {
      showUpdateNotice();
    }
  }
  enableYtBoxDrag(box);
}
function enableYtBoxDrag(box) {
  let isDragging = false;
  let startY, startBottom;
  let rafId = null;
  if (!box) return;
  box.addEventListener("mousedown", (e) => {
    if (e.target.closest(".kt-word") || e.target.closest(".icon-btn")) return;
    isDragging = true;
    startY = e.clientY;
    const rawBottom = parseInt(box.style.bottom);
    startBottom = isNaN(rawBottom) ? 80 : rawBottom;
    box.classList.add("dragging");
    document.body.style.cursor = "grab";
    box.style.top = "auto";
    e.preventDefault();
  });
  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const deltaY = startY - e.clientY;
    const targetBottom = startBottom + deltaY;
    const videoPlayer = document.querySelector(".html5-video-player");
    const maxHeight = videoPlayer
      ? videoPlayer.offsetHeight * 0.9
      : window.innerHeight * 0.8;
    const currentBottom = Math.max(0, Math.min(targetBottom, maxHeight));
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      box.style.bottom = `${currentBottom}px`;
      rafId = null;
    });
  });
  window.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      box.classList.remove("dragging");
      document.body.style.cursor = "default";
      safeSetStorage({ ytBoxBottom: box.style.bottom });
    }
  });
}
function initSubtitleAvoidance() {
  if (window._ktAvoidanceInit) return;
  window._ktAvoidanceInit = true;
  const AVOID_THRESHOLD = 150;
  const AVOID_OFFSET = 55;
  let isAvoiding = false;
  function getBox() {
    return document.getElementById("kt-yt-box");
  }
  function isControlsVisible() {
    const player = document.querySelector(".html5-video-player");
    if (!player) return false;
    return !player.classList.contains("ytp-autohide");
  }
  function applyAvoidance() {
    const box = getBox();
    if (!box || isAvoiding || box.classList.contains("dragging")) return;
    const rawBottom = parseInt(box.style.bottom);
    const realBottom = isNaN(rawBottom) ? 80 : rawBottom;
    if (realBottom < AVOID_THRESHOLD) {
      isAvoiding = true;
      box.style.transform = `translateX(-50%) translateY(-${AVOID_OFFSET}px)`;
    }
  }
  function removeAvoidance() {
    const box = getBox();
    if (!box || !isAvoiding) return;
    // hover 期间不复位，等 hover 结束再做
    if (window.__ktIsHovering) {
      const onHoverEnd = () => {
        box.removeEventListener("kt-hover-end", onHoverEnd);
        isAvoiding = false;
        box.style.transform = `translateX(-50%) translateY(0px)`;
      };
      box.addEventListener("kt-hover-end", onHoverEnd);
      return;
    }

    isAvoiding = false;
    box.style.transform = `translateX(-50%) translateY(0px)`;
  }
  const player = document.querySelector(".html5-video-player");
  if (!player) return;
  new MutationObserver(() => {
    if (getBox()?.classList.contains("dragging")) return;
    isControlsVisible() ? applyAvoidance() : removeAvoidance();
  }).observe(player, { attributes: true, attributeFilter: ["class"] });
  player.addEventListener("mouseleave", removeAvoidance);
  window.addEventListener("mouseup", () => {
    requestAnimationFrame(() => {
      isControlsVisible() ? applyAvoidance() : removeAvoidance();
    });
  });
}
function initSettingsAvoidance() {
  const player = document.querySelector(".html5-video-player");
  if (!player) return;

  function checkSettingsOpen() {
    const settingsMenu = document.querySelector(".ytp-popup.ytp-settings-menu");
    const box = document.getElementById("kt-yt-box");
    if (!box) return;

    const isOpen = settingsMenu && settingsMenu.offsetHeight > 0;
    box.classList.toggle("kt-settings-open", isOpen);
  }

  // 同时监听 style 和 class 变化
  new MutationObserver(checkSettingsOpen).observe(player, {
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"],
    childList: true,
  });
}

setTimeout(initSettingsAvoidance, 2000);
setTimeout(initSubtitleAvoidance, 2000);
//卡片
function renderWords(text, container, sourceLang = null) {
  if (!container) return;
  container.innerHTML = "";

  let words = [];
  let currentLang = sourceLang;

  // 1. 自动判定语种（仅用于传给分词器）
  if (!currentLang) {
    if (/[\u3040-\u30ff]/.test(text)) currentLang = 'ja';
    else if (/[\u4e00-\u9fff]/.test(text)) currentLang = 'zh';
    else if (/[\u0E00-\u0E7F]/.test(text)) currentLang = 'th';
    else if (/[\u1000-\u109F]/.test(text)) currentLang = 'my';
    else if (/[\u1780-\u17FF]/.test(text)) currentLang = 'km';
    else currentLang = 'en'; // 英文、德语、法语等西方语言统一默认 en
  }

  // 2. 全语种统一使用 Intl.Segmenter 分词 
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    try {
      const segmenter = new Intl.Segmenter(currentLang, { granularity: 'word' });
      words = [...segmenter.segment(text)]
        .map(s => s.segment)
        .filter(s => s && s.length > 0);
    } catch (e) {
      words = [];
    }
  }

  // 3. 统一的高质量正则兜底（老旧浏览器）
  if (!words || words.length === 0) {
    words = text.match(
      /[\u4e00-\u9fa5]+|[\u3040-\u309f]+|[\u30a0-\u30ff]+|[a-zA-Z0-9']+|[^\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff\s]+|\s+/g
    ) || [];
  }

  // 判断是否属于紧凑布局语种，仅用于控制 span 的 margin 样式
  const isCompactStyle = ['ja', 'zh', 'th', 'my', 'km'].some(l => currentLang?.startsWith(l));

  // 4. 统一渲染逻辑
  words.forEach((word) => {
    const trimmed = word.trim();

    // 过滤掉所有标点符号，拿到纯净的查词文本
    const cleanWord = trimmed.replace(
      /[.,\/#!$%\^&\*;:{}=\-_`~()。、？！「」【】『』""''\s]/g,
      ""
    );

    //  如果 trimmed 为空（说明是空格）或者 cleanWord 为空（说明整个词全是标点符号）
    if (trimmed.length === 0 || cleanWord.length === 0) {
      // 统统作为纯文本节点渲染，不绑定任何交互事件，完美保留排版，同时防止标点符号被点击
      container.appendChild(document.createTextNode(word));
      return;
    }

    const span = document.createElement("span");
    span.className = "kt-word";
    span.innerText = word;

    span.style.display = "inline-block";
    span.style.margin = isCompactStyle ? "0 0.5px" : "0 1px";

    if (window.__subtitleWordMap?.[cleanWord.toLowerCase()]) {
      span.style.color = "#facc15";
      span.style.borderBottom = "1px solid rgba(250, 204, 21, 0.6)";
    }

    // 鼠标悬停事件（防抖）
    span.onmouseenter = (e) => {
      const el = e.target;
      el._hoverTimer = setTimeout(() => {
        if (typeof handleWordMouseEnter === "function")
          handleWordMouseEnter(e, trimmed);
      }, 80);
    };

    span.onmouseleave = (e) => {
      clearTimeout(e.target._hoverTimer);
      if (typeof handleWordMouseLeave === "function") handleWordMouseLeave(e);
    };

    span.ondblclick = (e) => {
      if (typeof handleWordDblClick === "function")
        handleWordDblClick(e, cleanWord);
    };

    // 单击发音与闪烁
    span.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof speakText === "function")
        speakText(cleanWord, span, currentLang);

      const originalColor = span.style.color;
      span.style.color = "#facc15";
      setTimeout(() => (span.style.color = originalColor || ""), 200);
    };

    container.appendChild(span);
  });
}
function applySubtitleSettings(settings) {
  const box = document.getElementById("kt-yt-box");
  if (!box) return;
  const config = {
    fontSize: settings.fontSize || 25,
    color: settings.color || "#38bdf8",
    bgOpacity: settings.bgOpacity ?? 0.55,
    textShadow: settings.textShadow ?? "2px 2px 4px black",
    ...settings,
  };
  box.style.setProperty("--kt-trans-size", `${config.fontSize}px`);
  box.style.setProperty("--kt-trans-color", config.color);
  box.style.setProperty("--kt-bg-rgba", `rgba(0, 0, 0, ${config.bgOpacity})`);
  box.style.setProperty("--kt-origin-size", `${config.fontSize * 0.85}px`);
  box.style.transition =
    "opacity 0.2s ease-in-out, background 0.3s, transform 0.3s ease-out";
}
let isVideoManuallyPaused = false;
let extensionDidPause = false;
let currentHoveredElement = null;
let __currentHoverToken = null;
async function handleWordMouseEnter(e, word) {
  const myToken = Symbol();
  __currentHoverToken = myToken;
  window.__ktIsHovering = true;

  currentHoveredElement = e.target;
  const oldTooltip = document.getElementById("kt-word-tooltip");
  if (oldTooltip) oldTooltip.style.display = "none";
  const video = document.querySelector("video");
  if (video) {
    isVideoManuallyPaused = video.paused;
    if (!video.paused) {
      video.pause();
      extensionDidPause = true;
    } else {
      extensionDidPause = false;
    }
  }
  e.target.style.background = "rgba(56, 189, 248, 0.4)";
  e.target.style.borderRadius = "4px";
  const cleanWord = word
    .trim()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()。、？！「」『』【】…—～・]/g, "")
    .trim();
  if (!cleanWord || cleanWord.length === 0) return;
  if (/^\d+$/.test(cleanWord)) return;
  if (/^[\p{P}\p{S}]$/u.test(cleanWord)) return;
  if (/^\s+$/.test(cleanWord)) return;
  if (/^[a-zA-Z]$/.test(cleanWord)) return;
  if (/^[\p{P}\p{S}\s]+$/u.test(cleanWord)) return;

  const [entry, storage] = await Promise.all([
    idb.vocabulary.get(cleanWord),
    safeGetStorage(["targetLanguage"]),
  ]);
  if (__currentHoverToken !== myToken) return;
  const currentLang = storage?.targetLanguage || getBrowserLang() || "en";
  const isCollected = !!(entry && entry.deleted === false);

  let tooltip = document.getElementById("kt-word-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "kt-word-tooltip";
    tooltip.style.cssText = `
      position: fixed; z-index: 2147483647; background: #1e293b !important;
      color: white !important; padding: 10px 14px; border-radius: 8px;
      font-size: 14px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      pointer-events: none; min-width: 160px; max-width: 260px; width: fit-content;
      line-height: 1.5; display: none; flex-direction: column;
      box-sizing: border-box; transition: top 0.15s ease-out;
      border: 1px solid #334155;
    `;
    const moviePlayer =
      document.querySelector(".html5-video-player") || document.body;
    moviePlayer.appendChild(tooltip);
  }

  tooltip.style.border = isCollected
    ? "2px solid #facc15"
    : "1px solid #334155";
  const tipText = isCollected
    ? t("alreadyAddedFeedback", currentLang)
    : t("hintAddAction", currentLang);
  const tipColor = isCollected ? "#facc15" : "#94a3b8";
  tooltip.innerHTML = `
    <div id="kt-word-def" data-status="loading" style="color:#94a3b8">Loading...</div>
    <div id="kt-word-tip" style="font-size: 11px; color: ${tipColor}; border-top: 1px solid #334155; padding-top: 4px; margin-top: 4px; white-space: normal; word-break: break-word;">
      ${tipText}
    </div>
  `;
  tooltip.style.display = "flex";
  tooltip.style.visibility = "visible";
  repositionTooltip(tooltip, e.target);

  // logger.log('[getVideoSourceLang] result:', getVideoSourceLang());
  try {
    const res = await getDetailedTranslation(cleanWord, false, currentLang, {
      lightweight: true,
      hintInputLang: getVideoSourceLang(),
    });
    if (__currentHoverToken !== myToken) {
      const t2 = document.getElementById("kt-word-tooltip");
      if (t2) t2.style.display = "none";
      return;
    }
    const defEl = tooltip.querySelector("#kt-word-def");
    if (res && defEl) {
      const phoneticStr = res.phonetic
        ? `<span style="font-size: 11px; color: #94a3b8; font-weight: normal; width: 100%;">[${res.phonetic}]</span>`
        : "";

      let dictHtml = "";
      if (res.dictData && res.dictData.length > 0) {
        dictHtml = res.dictData
          .map((i, index) => {
            const meaning =
              typeof i.definition === "string" && i.definition
                ? i.definition
                : Array.isArray(i.definition)
                  ? i.definition.join(", ")
                  : Array.isArray(i.meanings)
                    ? i.meanings.join(", ")
                    : typeof i.meanings === "string"
                      ? i.meanings
                      : "";

            if (!meaning) return "";

            const localizedPos = localizePos(i.pos, currentLang);
            // 第一条显示3行，其余2行
            const maxH = index === 0 ? "4.2em" : "2.8em";
            return `
            <div style="margin-top: 4px; display: flex; align-items: flex-start; gap: 8px;">
              <b style="color:#38BDF8; font-size:12px; font-style:italic; min-width:32px; flex-shrink:0;">${localizedPos}</b>
              <div style="position:relative; flex:1; min-width:0;">
                <span style="color:#E2E8F0; font-size:13px; line-height:1.4; display:block;
                  max-height:${maxH}; overflow:hidden; white-space:normal; word-break:break-word;">${meaning}</span>
                <div style="position:absolute; bottom:0; right:0; width:40px; height:1.4em;
                  background:linear-gradient(to right, transparent, #1e293b);"></div>
              </div>
            </div>
          `;
          })
          .filter(Boolean)
          .join("");
      } else {
        dictHtml = `<div style="color: #e2e8f0; font-size: 13px; margin-top: 4px;">${res.basic}</div>`;
      }

      defEl.innerHTML = `
      <div style="display: flex; align-items: baseline; gap: 6px; border-bottom: 1px solid #334155; padding-bottom: 4px; margin-bottom: 4px; flex-wrap: wrap;">
        <span style="font-size: 16px; font-weight: 700; color: #ffffff;">${cleanWord}</span>
        <span style="font-size: 18px; color: #38bdf8; margin-left: 4px;">${res.basic}</span>
        ${phoneticStr}
      </div>
      <div style="width: 100%;">
        ${dictHtml}
      </div>
    `;
      defEl.setAttribute("data-status", "success");
      repositionTooltip(tooltip, e.target);
    }
  } catch (err) {
    logger.error(err);
    const defEl = tooltip.querySelector("#kt-word-def");
    if (defEl) defEl.innerText = "Error";
  }
}
function handleWordMouseLeave(e) {
  __currentHoverToken = null;
  window.__ktIsHovering = false;

  const tooltip = document.getElementById("kt-word-tooltip");
  if (tooltip) tooltip.style.display = "none";
  e.target.style.background = "transparent";
  e.target.style.borderRadius = "0";
  const video = document.querySelector("video");
  if (video && extensionDidPause && !isVideoManuallyPaused) {
    video.play();
  }
  extensionDidPause = false;
  if (currentHoveredElement === e.target) {
    currentHoveredElement = null;
  }
  const box = document.getElementById("kt-yt-box");
  if (box) box.dispatchEvent(new CustomEvent("kt-hover-end"));
}
window.addEventListener(
  "scroll",
  () => {
    if (currentHoveredElement) {
      const mockEvent = { target: currentHoveredElement };
      handleWordMouseLeave(mockEvent);
      currentHoveredElement = null;
    }
  },
  { capture: true, passive: true },
);
function repositionTooltip(tipEl, targetEl) {
  if (!tipEl?.style || !targetEl?.getBoundingClientRect) return;
  const rect = targetEl.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    tipEl.style.visibility = "hidden";
    return;
  }
  const realHeight = tipEl.offsetHeight || 0;
  const realWidth = tipEl.offsetWidth || 0;
  const spacing = 10;

  // 用播放器边界而不是 window 宽度
  const player = document.querySelector(".html5-video-player");
  const playerRect = player ? player.getBoundingClientRect() : null;
  const rightBoundary = playerRect
    ? Math.min(playerRect.right - 10, window.innerWidth - 10)
    : window.innerWidth - 10;
  const leftBoundary = playerRect ? playerRect.left + 10 : 10;

  // 垂直：优先显示在单词上方，不够则显示下方
  let topPos = rect.top - realHeight - spacing;
  if (topPos < 10) {
    topPos = rect.bottom + spacing;
  }

  // 水平：优先左对齐单词，超出播放器右边界则向左推
  let leftPos = rect.left;
  if (leftPos + realWidth > rightBoundary) {
    leftPos = rightBoundary - realWidth;
  }
  if (leftPos < leftBoundary) leftPos = leftBoundary;

  tipEl.style.left = `${leftPos}px`;
  tipEl.style.top = `${topPos}px`;
  tipEl.style.visibility = "visible";
}
async function handleWordDblClick(e, word) {
  e.stopPropagation();
  const cleanWord = word
    .replace(/["""«»\[\]{}()|\\/<>!?.,;:@#$%^&*+=~`。，！？、【】《》]/g, "")
    .trim();
  if (!cleanWord) return;
  const wordLower = cleanWord.toLowerCase();

  let subtitleContext = "";
  try {
    const ytO = document.getElementById("yt-o");
    const ytT = document.getElementById("yt-t");

    const cleanSubtitle = (text) => {
      return text
        .replace(/^[\s\-–—>>\|]+/g, "")
        .replace(/[\-–—>>\|]+$/g, "")
        .replace(/\s*\|\s*/g, ". ")
        .replace(/\s+-\s+/g, " ")           // 只去掉前后有空格的 - （避免误删 couldn't）
        .replace(/\[.*?\]/g, "")            // 去掉 [...] 
        .replace(/["""«»]/g, "")            // 去掉特殊引号
        .replace(/\s+/g, " ")
        .trim();
    };

    const originalText = ytO
      ? Array.from(ytO.querySelectorAll(".kt-word"))
        .map(el => el.textContent.trim())
        .filter(Boolean)
        .join(" ")
      : "";
    const translationText = ytT ? ytT.textContent.trim() : "";
    const cleanEnding = (text) => {
      return text
        .replace(/[.\s]+$/g, "")   // 去掉结尾所有句号和空格
        .trim();
    };
    const cleanedOriginal = cleanSubtitle(originalText);
    const cleanedTranslation = cleanSubtitle(translationText);

    subtitleContext = cleanedOriginal;
    window.__currentTranslationTemp = cleanedTranslation; // 临时存一份用于后续赋值
  } catch (err) {
    logger.warn("[Mira] 获取字幕上下文失败:", err);
  }

  let fullTranslation = null;
  const storage = await safeGetStorage(["targetLanguage"]);
  const currentLang = storage?.targetLanguage || getBrowserLang() || "en";
  const res = await getDetailedTranslation(cleanWord, false, currentLang);
  logger.log("[debug] translation res:", res);
  if (res && !res.isError) {
    fullTranslation = {
      basic: res.basic || "",
      phonetic: res.phonetic || "",
      sourcePhonetic: res.sourcePhonetic || "",
      dictData: (res.dictData || []).map((item) => ({
        ...item,
        pos: localizePos(item.pos, currentLang),
      })),
      examples: res.examples || [],
      sourceLang: res.langInfo?.code || "",
      context: subtitleContext,
      contextTranslation: window.__currentTranslationTemp || "",
    };
  }
  if (!fullTranslation) return;
  const now = Date.now();
  let contextUrl = window.location.href;
  try {
    const video = document.querySelector("video");
    if (video && window.location.hostname.includes("youtube.com")) {
      const urlObj = new URL(window.location.href);
      const videoId = urlObj.searchParams.get("v");
      if (videoId) {
        const seconds = Math.floor(video.currentTime);
        contextUrl = `https://www.youtube.com/watch?v=${videoId}&t=${seconds}s`;
      }
    }
  } catch (err) {
    logger.warn("[Mira] 获取视频进度失败:", err);
  }
  const currentTitle = document.title;
  const existingEntry = await idb.vocabulary.get(wordLower);
  let isAddedNow = false;
  let entryToSave;
  if (existingEntry) {
    const isReActivating = !!existingEntry.deleted;
    entryToSave = {
      ...existingEntry,
      deleted: !existingEntry.deleted,
      updated: now,
      date: isReActivating ? now : existingEntry.date,
      trans: isReActivating ? fullTranslation : existingEntry.trans,
      src: isReActivating ? contextUrl : existingEntry.src,
      title: isReActivating ? currentTitle : existingEntry.title,
    };
    isAddedNow = !entryToSave.deleted;
  } else {
    entryToSave = {
      id: crypto.randomUUID(),
      word: cleanWord,
      trans: fullTranslation,
      src: contextUrl,
      title: currentTitle,
      date: now,
      updated: now,
      deleted: false,
      lv: 0,
    };
    isAddedNow = true;
  }
  await idb.vocabulary.add(cleanWord, entryToSave);
  const tooltip = document.getElementById("kt-word-tooltip");
  if (tooltip) {
    tooltip.style.border = isAddedNow
      ? "2px solid #facc15"
      : "1px solid #334155";
    const tipLine = tooltip.querySelector("#kt-word-tip");
    if (tipLine) {
      tipLine.innerText = isAddedNow
        ? t("addedFeedback", currentLang)
        : t("hintAddAction", currentLang);
      tipLine.style.color = isAddedNow ? "#facc15" : "#94a3b8";
    }
  }
  if (typeof showCollectFeedback === "function") {
    showCollectFeedback(
      e.target,
      isAddedNow ? `⭐ ${t("alreadyInVocabulary")}` : `🗑️ ${t("removed")}`,
    );
  }
  await window.__vocabOnSave?.(cleanWord, isAddedNow);
}
function showCollectFeedback(target, text) {
  try {
    const rect = target.getBoundingClientRect();
    const fb = document.createElement("div");
    fb.innerText = text;
    fb.style.cssText = `
            position: fixed; z-index: 2147483647; color: #facc15; font-size: 12px;
            font-weight: bold; pointer-events: none; transition: all 0.5s;
            left: ${rect.left}px; top: ${rect.top - 20}px; text-shadow: 1px 1px 2px black;
        `;
    document.body.appendChild(fb);
    setTimeout(() => {
      fb.style.top = `${rect.top - 40}px`;
      fb.style.opacity = "0";
      setTimeout(() => fb.remove(), 500);
    }, 10);
  } catch (e) {
    logger.error(e);
  }
}
function closeTooltipAndResume() {
  const tooltip = document.getElementById("kt-word-tooltip");
  if (!tooltip) return;
  if (tooltip.style.display !== "none") {
    tooltip.style.display = "none";
    const video = document.querySelector("video");
    const shouldResume =
      video &&
      video.paused &&
      typeof isVideoManuallyPaused !== "undefined" &&
      !isVideoManuallyPaused;
    if (shouldResume) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          logger.log(
            "[Mira] Video play interrupted or blocked:",
            error.message,
          );
        });
      }
    }
  }
}
