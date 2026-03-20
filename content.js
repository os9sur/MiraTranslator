window.currentTargetL = navigator.language || 'zh-CN';
window.__LANG_READY__ = false;
window.__LANG_PROMISE__ = null;
function loadTargetLanguage() {
  if (window.__LANG_PROMISE__) return window.__LANG_PROMISE__;
  window.__LANG_PROMISE__ = chrome.storage.local
    .get(['targetLanguage'])
    .then(res => {
      window.currentTargetL = res?.targetLanguage || navigator.language || 'zh-CN';
      window.__LANG_READY__ = true;
      return window.currentTargetL;
    })
    .catch(() => {
      window.currentTargetL = navigator.language || 'zh-CN';
      window.__LANG_READY__ = true;
      return window.currentTargetL;
    });
  return window.__LANG_PROMISE__;
}
loadTargetLanguage();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.targetLanguage) {
    window.currentTargetL = changes.targetLanguage.newValue || navigator.language || 'zh-CN';
  }
});
let APP_NAME = 'Mira Translator';
async function initApp() {
  try {
    loadTargetLanguage().then(() => {
      APP_NAME = t('appName') || 'Mira Translator';
    });
  } catch (error) {
    logger.error("Failed to initialize app:", error);
  }
}

initApp();
logger.log(window.currentTargetL);

(async () => {
  let res = await safeGetStorage(['activeConfig', 'targetLanguage']);

  if (!res || !res.activeConfig) {
    const finalCfg = await getInitialActiveConfig();

    window.currentConfig.activeConfig = finalCfg;
    window.currentConfig.selectedEngine = finalCfg.engine;

    await chrome.storage.local.set({ activeConfig: finalCfg });

    res = {
      activeConfig: finalCfg,
      targetLanguage: (navigator.language || 'zh-CN').replace('_', '-').toLowerCase()
    };
  }

  syncLocalState(res);
})();


const TRANS_STATUS = {
  LOADING: 'loading',
  DONE: 'done',
  ERROR: 'error'
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
window.__MIRA_DEBUG_COMMENTS = (typeof localStorage !== 'undefined' && localStorage.getItem && localStorage.getItem('mira_debug_comments') === '1') || false;
function debugCommentLog(...args) { if (window.__MIRA_DEBUG_COMMENTS) logger.log('[Mira-Debug]', ...args); }
function highlightDebugNode(node, ttl = 2000, color = 'rgba(255,99,71,0.6)') {
  try {
    if (!node?.style) return;
    const prevOutline = node.style.outline;
    node.style.outline = `3px solid ${color}`;
    setTimeout(() => { try { node.style.outline = prevOutline; } catch (e) { } }, ttl);
  } catch (e) { }
}
const DEFAULT_COMMENT_FALLBACKS = [
  'yt-formatted-string#content-text',
  'yt-formatted-string.style-scope.ytd-comment-renderer',
  '#content-text',
  'ytd-comment-renderer yt-formatted-string',
  'ytd-comment-replies-renderer yt-formatted-string#content-text'
];
function getCommentFallbackSelectors(domain) {
  try {
    const host = (domain || window.location.hostname || '').replace(/^www\./, '');
    if (window.__MIRA_SCAN_FALLBACKS) {
      if (window.__MIRA_SCAN_FALLBACKS[window.location.hostname]) return window.__MIRA_SCAN_FALLBACKS[window.location.hostname];
      if (window.__MIRA_SCAN_FALLBACKS[host]) return window.__MIRA_SCAN_FALLBACKS[host];
    }
    if (window.__MIRA_GLOBAL_FALLBACK && window.__MIRA_GLOBAL_FALLBACK.length) return window.__MIRA_GLOBAL_FALLBACK;
  } catch (e) { }
  return DEFAULT_COMMENT_FALLBACKS;
}
if (typeof fastMemoryCache === 'undefined') var fastMemoryCache = new Map();
if (typeof pendingRequests === 'undefined') var pendingRequests = new Set();
window.currentConfig = {
  targetLanguage: (navigator.language || 'zh-CN').replace('_', '-'),
  selectedEngine: getRuntimeDefaultEngine(),
  activeConfig: { engine: getRuntimeDefaultEngine(), data: {} }
};
async function syncLocalState(storageData) {
  if (storageData.targetLanguage) {
    const lang = storageData.targetLanguage.replace('_', '-');
    window.currentConfig.targetLanguage = lang;
    window.currentTargetL = lang;
    applyI18n(lang);
  }

  if (storageData.activeConfig) {
    const cfg = storageData.activeConfig;
    window.currentConfig.selectedEngine = cfg.engine || getRuntimeDefaultEngine();
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

  if (typeof checkEngineStatus === 'function') checkEngineStatus();
}
(async () => {
  const data = await safeGetStorage(['targetLanguage', 'activeConfig']);
  if (!data) return;
  syncLocalState(data);
})();
chrome.storage.onChanged.addListener((changes) => {
  const update = {};
  if (changes.targetLanguage) update.targetLanguage = changes.targetLanguage.newValue;
  if (changes.activeConfig) update.activeConfig = changes.activeConfig.newValue;
  if (Object.keys(update).length > 0) syncLocalState(update);
});
function hidePopup() {
  if (popupEl) {
    popupEl.classList.add('is-hidden');
    setTimeout(() => { popupEl.style.display = 'none'; }, 200);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }
}
function applyAppConfig(newConfig) {
  appConfig = newConfig;
  isPageScanEnabled = !!appConfig.page;
  isSelectEnabled = !!appConfig.select;
  isYTEnabled = !!appConfig.yt;
  document.querySelectorAll('.kt-paragraph-translation').forEach(el => {
    el.style.display = isPageScanEnabled ? 'block' : 'none';
  });
  if (isPageScanEnabled) {
    scanContent();
  };
  if (!isSelectEnabled) {
    hidePopup();
  }
  refreshIcon();
  if (location.hostname.includes('youtube.com')) {
    syncSubtitleDisplay();
    ensureYouTubeReadyWatcher();
  }
  refreshIcon();
}
function smartClear(newSelectors) {
  const whiteList = new Set(document.querySelectorAll(newSelectors));
  document.querySelectorAll('[data-translated="true"]').forEach(el => {
    if (!whiteList.has(el)) {
      const transEl = el.querySelector('.kt-paragraph-translation');
      if (transEl) {
        transEl.remove();
      }
      el.removeAttribute('data-translated');
      el.removeAttribute('data-translating');
      delete el.dataset.translated;
      delete el.dataset.translating;
    }
  });
}
async function applyUserStyles(transEl, directConfig = null) {
  const render = (config) => {
    const originalFontSize = transEl.style.fontSize;
    const isWiki = location.hostname.includes('wikipedia.org');
    const clearStyle = isWiki ? 'none' : 'both';
    const targetPrefix = (window.currentTargetL || "").toLowerCase().slice(0, 2);
    const isRTL = ['he', 'ar', 'fa'].includes(targetPrefix);
    const mountTarget = transEl.parentElement;
    let inheritedWhiteSpace = 'normal';
    if (mountTarget) {
      const sourceStyle = window.getComputedStyle(mountTarget);
      const ws = sourceStyle.whiteSpace;
      if (ws.includes('pre') || ws === 'break-spaces') {
        inheritedWhiteSpace = 'pre-wrap';
      }
    }
    transEl.style.cssText = '';
    transEl.onmouseenter = null;
    transEl.onmouseleave = null;
    const oldMarker = transEl.querySelector('.marker-span');
    if (oldMarker) {
      transEl.innerHTML = oldMarker.innerHTML;
    }
    let sourceAlign = 'inherit';
    let sourceMarginLeft = '0px';
    let sourcePaddingLeft = '0px';
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
      const isWikiParagraph = isWiki &&
        transEl.parentElement?.className?.includes('mw-parser-output');
      let defaultCss = `
      display: block !important;
      width: auto !important;
      clear: ${clearStyle} !important;
      margin: 6px ${sourceMarginLeft} 4px ${sourceMarginLeft} !important;
      padding-left: ${sourcePaddingLeft} !important;
      text-align: ${sourceAlign} !important; 
      color: ${transEl.dataset.translated === 'true' ? '#60a5fa' : 'gray'} !important;
      font-style: ${transEl.dataset.translated === 'true' ? 'normal' : 'italic'} !important;
      text-decoration: underline !important;
      text-decoration-style: dashed !important;
      text-decoration-color: #38bdf866 !important;
      text-decoration-thickness: 0.5px !important;
      text-underline-offset: 5px !important;
      background: transparent !important;
      border: none !important;
      padding: 0 !important;
      animation: fadeIn 0.6s ease-out !important;
    `;
      transEl.style.cssText = defaultCss;
      const oldWrapper = transEl.querySelector('.mira-default-wrapper');
      if (oldWrapper) {
        transEl.innerHTML = oldWrapper.innerHTML;
      }
      if (originalFontSize) transEl.style.fontSize = originalFontSize;
      return;
    }
    const color = config.color || '#60a5fa';
    const borderColor = config.borderColor || '#38bdf8';
    const borderType = config.borderType || 'left';
    const isBlur = config.isBlur || config.isBlurEnabled || false;
    const isTwitter = location.hostname.includes('x.com');
    const isWikiUI = isWiki && (
      transEl.closest('.vector-menu-content') ||
      transEl.closest('figcaption') ||
      transEl.closest('.thumbcaption') ||
      transEl.tagName === 'LI' ||
      (transEl.closest('p') &&
        !transEl.closest('table') &&
        !transEl.closest('.infobox') &&
        !transEl.closest('.sidebar') &&
        !transEl.closest('.navbox'))
    );
    let css = `
        display: ${isWikiUI ? 'inline-block' : 'block'} !important;
        clear: ${clearStyle} !important;
        width: auto !important; 
        max-width: ${isWikiUI ? 'calc(100% - 2px)' : '100%'} !important;
        margin: ${isWikiUI ? '2px 0 0 0' : '6px 0 4px 0'} !important;
        direction: ${isRTL ? 'rtl' : 'ltr'} !important;
        text-align: ${sourceAlign} !important;
        unicode-bidi: ${isRTL ? 'plaintext' : 'normal'} !important;
        overflow-wrap: anywhere !important;
        word-break: break-word !important;
        white-space: ${(isTwitter || inheritedWhiteSpace === 'pre-wrap') ? 'pre-wrap' : 'normal'} !important;
        line-height: 1.5 !important;
        overflow: ${isWikiUI ? 'hidden' : 'visible'} !important;  
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
      case 'left':
        if (isRTL) {
          css += `border-right: 3px solid ${borderColor} !important; border-left: 0 !important;`;
          finalPadding = "0 8px 0 0";
        } else {
          css += `border-left: 3px solid ${borderColor} !important; border-right: 0 !important;`;
          finalPadding = "0 0 0 8px";
        }
        break;
      case 'solid':
        css += `border: 1px solid ${borderColor} !important; border-radius: 6px !important;`;
        finalPadding = "1px 5px";
        break;
      case 'dashed':
        css += `border: 1px dashed ${borderColor} !important; border-radius: 6px !important;`;
        finalPadding = "1px 5px";
        break;
      case 'none':
        css += `border: none !important;`;
        break;
      case 'underline':
      case 'dashedUnderline':
      case 'dottedUnderline': {
        const styleMap = { underline: 'solid', dashedUnderline: 'dashed', dottedUnderline: 'dotted' };
        const style = styleMap[borderType] || 'solid';
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
      case 'wavy':
        css += `text-decoration: underline wavy ${borderColor} !important; text-underline-offset: 5px !important;`;
        finalPadding = "0 0 0 5px";
        break;
      case 'highlight':
        css += `background-color: ${borderColor}33 !important; border-radius: 4px !important;`;
        finalPadding = "1px 5px";
        break;
      case 'marker':
        css += `background: transparent !important;`;
        finalPadding = "1px 5px";
        break;
      case 'paper':
        css += `background: #ffffff !important;
                  box-shadow: 0 2px 6px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.1) !important;
                  border: 1px solid #eee !important;
                  border-radius: 6px !important;
                  color: #333 !important;
                  padding: 8px !important;
                  `;
        finalPadding = "5px";
        break;
      case 'dividingLine':
        css += `border-top: 1px solid ${borderColor} !important; margin-top: 12px !important;`;
        finalPadding = "1px 0 0 5px";
        break;
      case 'italic':
        css += `font-style: italic !important;`;
        break;
      case 'bold':
        css += `font-weight: bold !important;`;
        break;
      case 'opacity':
        css += `opacity: 0.45 !important;`;
        break;
    }
    css += `padding: ${finalPadding} !important;`;
    if (isBlur) {
      css += `filter: blur(5px) !important; cursor: help !important;`;
      transEl.onmouseenter = () => transEl.style.setProperty('filter', 'none', 'important');
      transEl.onmouseleave = () => transEl.style.setProperty('filter', 'blur(5px)', 'important');
    }
    if (transEl.dataset.translated !== 'true') {
      css = css.replace(/color:[^;]+!important;/, 'color: gray !important;');
      css = css.replace(/font-style:[^;]+!important;/, 'font-style: italic !important;');
    }
    transEl.style.cssText = css;
    if (borderType === 'marker') {
      const span = document.createElement('span');
      span.className = 'marker-span';
      span.innerHTML = transEl.innerHTML;
      transEl.innerHTML = '';
      transEl.appendChild(span);
      const isTwitter = location.hostname.includes('x.com');
      span.style.cssText = `
          display: inline !important;
          background-image: linear-gradient(to bottom, transparent 55%, ${borderColor}66 55%) !important;
          box-decoration-break: clone !important;
          -webkit-box-decoration-break: clone !important;
          white-space: ${isTwitter ? 'nowrap' : 'normal'} !important;
          line-height: 1.6 !important;
          padding: 1px 5px !important;
        `;
    }
    if (originalFontSize) {
      transEl.style.fontSize = originalFontSize;
    }
  };
  try {
    const data = await safeGetStorage('userStyleConfig');
    if (!data) {
      render(directConfig);
      return;
    }
    render(data.userStyleConfig || directConfig);
  } catch (e) {
    logger.error('ApplyUserStyles 核心异常:', e);
    render(directConfig);
  };
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
  'foxnews.com',
  'grok.com',
  'cnn.com',
  'bbc.com',
  'reuters.com',
  // 按需添加白名单,动态标题扫描问题
];
function ensureDynamicContentWatcher() {
  const host = location.hostname;
  const needsWatcher = DYNAMIC_WATCHER_SITES.some(site => host.includes(site));
  if (!needsWatcher) return;
  if (window.__mira_dynamic_observer) return;
  // AI 对话页面用更长的 debounce，等流式输出结束
  const isAIChat = [
    'grok.com',
    'claude.ai',
    'chatgpt.com',
    'gemini.google.com',
    'copilot.microsoft.com',
    'bing.com/chat',
    'perplexity.ai',
    'poe.com',
    'character.ai',
    'huggingface.co/chat',
    'mistral.ai',
    'cohere.com',
    'you.com',
    'phind.com',
    'deepseek.com',
    'kimi.moonshot.cn',
    'tongyi.aliyun.com',
    'yiyan.baidu.com',
    'hailuoai.com',
    'doubao.com',
  ].some(s => host.includes(s));
  const debounceDelay = isAIChat ? 2000 : 800;

  let debounceTimer = null;
  window.__mira_dynamic_observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.classList?.contains('kt-paragraph-translation')) continue;
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
    subtree: true
  });
}
function ensureYouTubeNavigationListener() {
  if (!location.hostname.includes('youtube.com')) return;
  try {
    if (window.youTubeNavHooked) return;
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function () { origPush.apply(this, arguments); window.dispatchEvent(new Event('locationchange')); };
    history.replaceState = function () { origReplace.apply(this, arguments); window.dispatchEvent(new Event('locationchange')); };
    window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
    const cleanupStaleTranslations = () => {
      try {
        document.querySelectorAll('.kt-paragraph-translation').forEach(el => el.remove());
        document.querySelectorAll('[data-translated], [data-translating], [data-mira-processing]').forEach(el => {
          el.removeAttribute('data-translated');
          el.removeAttribute('data-translating');
          el.removeAttribute('data-mira-processing');
          delete el.dataset.translated;
          delete el.dataset.translating;
          delete el._miraSkippedHash;
          delete el._miraRetryCount;
        });
      } catch (e) { logger.error('[Mira] Cleanup error:', e); }
    };
    const scheduleRescanRetries = (label) => {
      if (label === 'yt-navigate-finish') cleanupStaleTranslations();
      let attempts = 0;
      const iv = setInterval(async () => {
        attempts++;
        ensureYouTubeReadyWatcher();
        const res = await executeReScan({ selectors: currentActiveSelectors || 'p', forceAll: false });
        if ((res && res.triggered > 10) || attempts >= 6) clearInterval(iv);
      }, 800);
    };
    window.addEventListener('locationchange', () => scheduleRescanRetries('locationchange'));
    let lastUrl = location.href;
    window.addEventListener('yt-navigate-finish', () => {
      if (lastUrl !== location.href) {
        cleanupStaleTranslations();
        lastUrl = location.href;
      }
      ensureYouTubeReadyWatcher();
      const navUrl = location.href;
      let titleRetry = 0;
      const titleElAtStart = document.querySelector('h1.ytd-watch-metadata yt-formatted-string');
      let textAtNavStart = titleElAtStart?.innerText?.trim() || "";
      const titleFixer = setInterval(() => {
        titleRetry++;
        if (location.href !== navUrl) {
          clearInterval(titleFixer);
          return;
        }
        const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string');
        const currentText = titleEl?.innerText?.trim() || "";
        if (!currentText || currentText === textAtNavStart) {
          if (titleRetry > 20) clearInterval(titleFixer);
          return;
        }
        titleEl.removeAttribute('data-translated');
        titleEl.removeAttribute('data-translating');
        titleEl.removeAttribute('data-mira-processing');
        _miraProcessingSet.delete(titleEl);
        let sibling = titleEl.nextElementSibling;
        while (sibling && sibling.classList.contains('kt-paragraph-translation')) {
          const next = sibling.nextElementSibling;
          sibling.remove();
          sibling = next;
        }
        const h1 = titleEl.closest('h1');
        if (h1) {
          let h1Sibling = h1.nextElementSibling;
          while (h1Sibling && h1Sibling.classList.contains('kt-paragraph-translation')) {
            const next = h1Sibling.nextElementSibling;
            h1Sibling.remove();
            h1Sibling = next;
          }
        }
        if (typeof handleTranslateElement === 'function') {
          handleTranslateElement(titleEl, true);
        }
        clearInterval(titleFixer);
      }, 500);
      scheduleRescanRetries('yt-navigate-finish');
    });
    window.youTubeNavHooked = true;
  } catch (e) { logger.error('[Mira] NavListener error:', e); }
}
function ensureYouTubeReadyWatcher() {
  if (typeof isPageScanEnabled !== 'undefined' && !isPageScanEnabled) return;
  if (!location.hostname.includes('youtube.com')) return;
  try {
    ensureYouTubeNavigationListener();
    if (window.youTubeRescanObserver) return;
    const defaultSelectors = [
      'h1.ytd-watch-metadata yt-formatted-string',
      'p',
      'li',
      '#description-inner span',
      '#content-text span',
      'yt-attributed-string.ytd-video-content-metadata-renderer span'
    ];
    const selectors = (typeof currentActiveSelectors === 'string' && currentActiveSelectors.trim() !== '' && currentActiveSelectors !== '__LOADING__')
      ? currentActiveSelectors.split(',').map(s => s.trim()).filter(Boolean)
      : defaultSelectors;
    const selectorList = selectors.join(', ');
    const checkTargets = () => {
      if (!isPageScanEnabled) return;
      let allTargets = [];
      try {
        allTargets = (typeof querySelectorAllDeep === 'function')
          ? querySelectorAllDeep(selectorList)
          : Array.from(document.querySelectorAll(selectorList));
      } catch (e) {
        allTargets = [];
      }
      allTargets.forEach(el => {
        try {
          if (el.closest('.yt-content-metadata-view-model__metadata-row, .yt-content-metadata-view-model__metadata-text')) {
            return;
          }
          if (el.dataset.translated === 'true') return;
          if (el.hasAttribute('data-translating')) return;
          if (el.hasAttribute('data-mira-processing')) return;
          if (_miraProcessingSet.has(el)) return;
          const titleContainer = el.closest('.yt-lockup-metadata-view-model__title');
          if (titleContainer) {
            const next = titleContainer.nextElementSibling;
            if (next?.classList?.contains('kt-paragraph-translation')) {
              el.dataset.translated = 'true';
              return;
            }
          }
          const txt = (el.textContent || '').trim();
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
      const root = document.querySelector('ytd-app') || document.body;
      observer.observe(root, { childList: true, subtree: true, characterData: true });
      const h1Container = document.querySelector('h1.ytd-watch-metadata');
      if (h1Container) {
        observer.observe(h1Container, { childList: true, subtree: true, characterData: true });
      }
      window.youTubeRescanObserver = observer;
      if (!window.__mira_mutation_observer) {
        const attachCommentsWatcher = () => {
          const rule = SiteRules.getRule(location.hostname);
          if (!rule?.selectors) {
            logger.warn('[Mira] attachCommentsWatcher: no rule for', location.hostname);
            return;
          }
          if (!window.observer) {
            return;
          }
          const registerToObserver = (nodes) => {
            nodes.forEach(node => {
              if (node.nodeType !== 1) return;
              try {
                if (node.matches(rule.selectors)) window.observer.observe(node);
                const matches = node.querySelectorAll(rule.selectors);
                matches.forEach(m => {
                  if (!m.hasAttribute('data-mira-registered')) {
                    m.setAttribute('data-mira-registered', 'true');
                    setTimeout(() => { window.observer.observe(m); m.removeAttribute('data-mira-registered'); }, 200);
                  }
                });
              } catch (e) {
                logger.warn('[Mira] registerToObserver error:', e);
              }
            });
          };
          window.__mira_mutation_observer = new MutationObserver((mutations) => {
            const added = [];
            mutations.forEach(m => added.push(...m.addedNodes));
            if (added.length > 0) registerToObserver(added);
          });
          window.__mira_mutation_observer.observe(root, { childList: true, subtree: true });
          registerToObserver([root]);
        };
        attachCommentsWatcher();
      }
    };
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      attach();
    } else {
      window.addEventListener('load', attach, { once: true });
    }
  } catch (e) { logger.error('[Mira] Watcher error:', e); }
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!chrome.runtime || !chrome.runtime.id) return;
  if (msg.action === 'SET_PAGE_SCAN_STATE') {
    isPageScanEnabled = msg.enabled;
    if (isPageScanEnabled) {
      if (typeof refreshIcon === 'function') refreshIcon();
      if (typeof scanContent === 'function') scanContent();
    } else {
      document.querySelectorAll('.kt-paragraph-translation').forEach(el => el.remove());
      document.querySelectorAll('[data-translated]').forEach(el => {
        el.removeAttribute('data-translated');
        el.removeAttribute('data-translating');
      });
      if (typeof observer !== 'undefined') observer.disconnect();
      try {
        const commentsRoot = document.querySelector('ytd-comments') || document.getElementById('comments');
        if (commentsRoot) {
          if (commentsRoot._miraClickHandler) {
            commentsRoot.removeEventListener('click', commentsRoot._miraClickHandler, true);
            delete commentsRoot._miraClickHandler;
          }
          if (commentsRoot._miraScrollHandler) {
            commentsRoot.removeEventListener('scroll', commentsRoot._miraScrollHandler, { passive: true });
            delete commentsRoot._miraScrollHandler;
          }
        }
      } catch (e) { }
    }
    sendResponse({ status: "ok" });
  }
  else if (msg.action === 'RE_SCAN_PAGE') {
    if (typeof executeReScan === 'function') executeReScan(msg.config);
    sendResponse({ status: "success" });
  }
  else if (msg.action === 'SET_SELECT_STATE') {
    isSelectEnabled = msg.enabled;
    if (!isSelectEnabled && typeof popupEl !== 'undefined' && popupEl) {
      if (typeof logoBtn !== 'undefined' && logoBtn) logoBtn.classList.remove('show');
      popupEl.classList.add('is-hidden');
    }
    sendResponse({ status: "ok" });
  }
  else if (msg.action === "UPDATE_VISUAL_STYLE") {
    const allTrans = document.querySelectorAll('.kt-paragraph-translation');
    allTrans.forEach(el => {
      if (typeof applyUserStyles === 'function') applyUserStyles(el);
    });
    sendResponse({ status: "ok" });
  }
  else if (msg.action === 'SET_YT_STATE') {
    isYTEnabled = msg.enabled;
    if (typeof refreshIcon === 'function') refreshIcon();
    if (typeof syncSubtitleDisplay === 'function') syncSubtitleDisplay();
    sendResponse({ status: "ok" });
  }
  else if (msg.action === 'PREVIEW_YT_STYLE') {
    if (typeof applySubtitleSettings === 'function') applySubtitleSettings(msg.settings);
    sendResponse({ status: "ok" });
  }
  else if (msg.action === 'REFRESH_YT') {
    if (typeof isYTEnabled === 'undefined') {
      isYTEnabled = true;
      if (typeof refreshIcon === 'function') refreshIcon();
    }
    if (typeof fastMemoryCache !== 'undefined') fastMemoryCache.clear();
    if (typeof lastSubIndex !== 'undefined') lastSubIndex = -1;
    sendResponse({ status: "ok" });
  }
  else if (msg.action === 'GET_CURRENT_CONFIG') {
    if (typeof applyUserStyles === 'function') applyUserStyles(msg.config);
    sendResponse({ status: "ok" });
  }
  else if (msg.action === 'SET_LANGUAGE') {
    window.currentTargetL = msg.lang;
    if (typeof updateLanguageOnPage === 'function') updateLanguageOnPage();
    document.querySelectorAll('[data-translated]').forEach(el => {
      const transEl = el.querySelector('.kt-paragraph-translation');
      if (transEl && (transEl.innerText.includes('...') || transEl.dataset.status === 'loading')) {
        transEl.innerText = typeof t === 'function' ? t('loading') : 'loading...';
      } else {
        delete el.dataset.translated;
        if (transEl) transEl.remove();
      }
    });
    if (typeof popupEl !== 'undefined' && popupEl && popupEl.style.display !== 'none') {
      const pBasic = typeof shadowHost !== 'undefined' ? shadowHost.shadowRoot.getElementById('p-basic') : null;
      if (pBasic && pBasic.innerText.includes('...')) {
        pBasic.innerText = typeof t === 'function' ? t('loading') : 'loading...';
      }
    }
    sendResponse({ status: "ok" });
  }
  else if (msg.action === 'previewStyle') {
    if (typeof applySubtitleSettings === 'function') applySubtitleSettings(msg.settings);
    if (msg.save) {
      chrome.storage.sync.set({ ytStyleSettings: msg.settings });
    }
    sendResponse({ status: "ok" });
  }
  else {
    sendResponse({ status: "ignored" });
  }
  return false;
});
document.addEventListener('MIRA_INTERNAL_RESCAN', (e) => {
  if (e.detail && e.detail.selectors) {
    executeReScan(e.detail);
  }
});
(async () => {
  const data = await safeGetStorage(['globalConfig', 'siteSettings', 'targetLanguage', 'scanConfig']);
  if (!data) return;
  const domain = window.location.hostname.replace('www.', '');
  if (data.targetLanguage) window.currentTargetL = data.targetLanguage;
  const customScanConfig = data.scanConfig?.custom?.[domain];
  const globalScanConfig = data.scanConfig?.global;
  const defaultScanRule = (typeof SiteRules !== 'undefined')
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
          : String(entry.fallbackSelectors).split(',').map(s => s.trim()).filter(Boolean);
        if (arr.length) window.__MIRA_SCAN_FALLBACKS[k] = arr;
      }
    }
  } catch (e) { }
  const g = data.scanConfig?.global?.fallbackSelectors;
  if (g) {
    window.__MIRA_GLOBAL_FALLBACK = Array.isArray(g) ? g : String(g).split(',').map(s => s.trim()).filter(Boolean);
  }
  const globalConf = data.globalConfig || { page: true, select: true, yt: true };
  const siteConf = data.siteSettings || {};
  const finalConfig = siteConf[domain] ? siteConf[domain] : globalConf;
  applyAppConfig(finalConfig);
  if (!chrome.runtime?.id) return;
  if (typeof initSelectionTranslate === 'function') {
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
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ');
}
function isYoutubeCaptionOn() {
  const ccButton = document.querySelector('.ytp-subtitles-button');
  if (!ccButton) return false;
  return ccButton.getAttribute('aria-pressed') === 'true';
}
function toggleVisibility() {
  syncSubtitleDisplay();
  if (popupEl && !isSelectEnabled) popupEl.style.display = 'none';
  document.querySelectorAll('.kt-paragraph-translation').forEach(el => {
    el.style.display = isPageScanEnabled ? 'block' : 'none';
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
  if (document.getElementById('mira-translator-style')) return;
  const style = document.createElement('style');
  style.id = 'mira-translator-style';
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
      font-style: italic !important;
      word-break: break-word !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}
injectGlobalStyles();
function applyLayoutFix(id, css) {
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
}
const normalizeForCompare = (text) => {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .trim();
};
function shrinkHeadingIfOverflow(container, el) {
  if (!['H1', 'H2', 'H3', 'H4'].includes(el.tagName)) return;

  const originFontSize = parseFloat(container.style.fontSize);
  if (!originFontSize || originFontSize <= 24) return;

  const containerWidth = el.closest('article, main, [class*="article"], [class*="content"]')
    ?.getBoundingClientRect()?.width ||
    el.parentElement?.getBoundingClientRect()?.width || 0;

  if (containerWidth <= 0) return;
  if (container.scrollWidth <= containerWidth) return; // 没溢出不处理

  const MIN_SIZE = 16;
  let lo = MIN_SIZE, hi = originFontSize;
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    container.style.setProperty('font-size', `${mid}px`, 'important');
    if (container.scrollWidth > containerWidth) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  container.style.setProperty('font-size', `${Math.max(lo, MIN_SIZE)}px`, 'important');
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
    if (this._isFirstScreen && this._firstScreenCount < this.FIRST_SCREEN_LIMIT) {
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
      if (!this.timer) { this.timer = setTimeout(() => this.flush(), 100); }
      return;
    }
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.isProcessing = true;
    const storage = await safeGetStorage(['activeConfig', 'targetLanguage']);
    if (!storage) {
      this.queue = [];
      this.isProcessing = false;
      return;
    }
    const engine = (storage.activeConfig?.engine || getRuntimeDefaultEngine()).toLowerCase();
    const lang = (storage.targetLanguage || navigator.language || 'zh-CN').replace('_', '-').toLowerCase();
    let currentBatch = [];
    let currentLength = 0;
    const isAI = AI_LLM_WHITE_LIST.includes(engine);
    const MAX_CHARS = isAI ? 4000 : 2000;
    const MAX_ITEMS = isAI ? 10 : 5;
    const pre = '[[';
    const suf = ']]';
    while (this.queue.length > 0) {
      const nextItem = this.queue[0];
      if (nextItem._singleRetry && currentBatch.length > 0) break;
      const nextLen = nextItem.text.length;
      if (currentBatch.length === 0) {
        currentBatch.push(this.queue.shift());
        currentLength += nextLen;
      } else {
        if (nextItem._singleRetry) break;
        if (currentLength + nextLen > MAX_CHARS || currentBatch.length >= MAX_ITEMS) break;
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
      alreadyCached.forEach(item => this.applyResult(item, item.cachedContent, false));
      if (needTranslate.length === 0) { this.finishProcessing(); return; }
      needTranslate.forEach((item, i) => {
        const token = `mira_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
        item.el.dataset.miraToken = token;
        item.miraToken = token;
      });
      const hasComplexTweet = needTranslate.some(item => (item.textForTranslation || item.text).length > 250);
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
          mergedText = needTranslate[0].textForTranslation || needTranslate[0].text;
        } else {
          mergedText = needTranslate.map((item, idx) =>
            `${pre}${idx}${suf}\n${item.textForTranslation || item.text}`
          ).join('\n\n');
        }
      }
      const normalizedText = mergedText.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
      const res = await getDetailedTranslation(normalizedText, true, null, { skipCache: true, isBatch: true });
      if (!chrome.runtime?.id) return;
      if (!res || res.isError) {
        logger.error("[Batcher] API 返回异常", res);
        throw new Error(res?.basic || "API Error");
      }
      const allTrans = res?.basic || "";
      needTranslate.forEach((item, i) => {
        if (item.el.dataset.miraToken !== item.miraToken) {
          logger.warn('[Batcher] 节点已被回收，丢弃翻译结果');
          item.el.removeAttribute('data-mira-token');
          this.unlock(item.el);
          if (item.container?.parentNode) item.container.remove();
          return;
        }
        item.el.removeAttribute('data-mira-token');
        let singleTrans = "";
        if (needTranslate.length === 1) {
          singleTrans = allTrans;
        } else {
          const currentMarkerStr = `\\[{1,2}${i}\\]{1,2}`;
          const nextMarkerStr = `\\[{1,2}${i + 1}\\]{1,2}`;
          const currentRegex = new RegExp(currentMarkerStr, 'i');
          const nextRegex = new RegExp(nextMarkerStr, 'i');
          const startMatch = allTrans.match(currentRegex);
          if (startMatch) {
            const contentStart = startMatch.index + startMatch[0].length;
            const nextMatch = allTrans.match(nextRegex);
            singleTrans = nextMatch ? allTrans.substring(contentStart, nextMatch.index) : allTrans.substring(contentStart);
          } else if (i === 0 && !allTrans.includes('#==#')) {
            singleTrans = allTrans;
          }
        }
        const cleanPattern = new RegExp(`\\[{1,2}\\d+\\]{1,2}[:：\\s\\n]*`, 'g');
        singleTrans = singleTrans.replace(cleanPattern, '').trim();
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
                isBatch: true
              }
            });
          }
          this.applyResult(item, singleTrans, res?.isSameLang);
        } else {
          logger.warn("[Batcher] 该条目切分失败，降级单条重试", { index: i, text: item.text.slice(0, 30) });
          item.el.removeAttribute('data-translated');
          item.el.removeAttribute('data-translating');
          item.el.removeAttribute('data-mira-processing');
          _miraProcessingSet.delete(item.el);
          item.el._miraRetryCount = 0;
          item._singleRetry = true;
          item.forceRefresh = true;
          if (item.container && item.container.parentNode) item.container.remove();
          setTimeout(() => this.add(item, true), 500);
        }
      });
    } catch (err) {
      hasError = true;
      logger.error("[Batcher] 流程崩溃:", err);
      needTranslate.forEach(item => {
        item.el.removeAttribute('data-mira-token');
        this.unlock(item.el);
        if (item.container?.parentNode) {
          const errorText = err.message || "Translation failed";
          const match = errorText.match(/400|401|402|403|404|429|500|502|503/);
          let displayMessage = "";
          if (match) {
            let errorCode = match[0];
            if (errorCode === "400" && errorText.toLowerCase().includes("balance")) errorCode = "402";
            const friendlyMsg = chrome.i18n.getMessage(`ERROR_${errorCode}`);
            displayMessage = friendlyMsg
              ? `${friendlyMsg} (Code: ${errorCode})`
              : `API Error (Code: ${errorCode})`;
          } else if (errorText.toLowerCase().includes("timeout")) {
            displayMessage = chrome.i18n.getMessage("ERROR_TIMEOUT") || "Request Timeout";
          } else {
            displayMessage = errorText.length < 100 ? errorText : "Translation failed";
          }
          item.container.innerText = `⚠ ${displayMessage}`;
          item.container.style.color = "#f87171";
          item.container.style.fontStyle = "italic";
          item.container.style.fontSize = "0.85em";
          item.container.classList.remove('kt-loading');
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
        if (transContent && normalizedTrans === normalizedBase && item.singleKey) {
          idb.remove(item.singleKey).catch(() => { });
        }
        if (container && container.parentNode) container.remove();
        if (item._singleRetry) {
          el._miraSkippedHash = normalizedBase;
        }
        return;
      }
      container?.classList.remove('kt-loading');
      if (linkMap && Object.keys(linkMap).length > 0) {
        Object.keys(linkMap).forEach(idx => {
          const pattern = new RegExp(
            `[\\(（]\\s*L${idx}\\s*[：:]\\s*([^)）]+?)\\s*[\\)）]`,
            'gi'
          );
          transContent = transContent.replace(pattern, (match, translatedText) => {
            if (linkMap[idx]) {
              linkMap[idx]._translatedText = translatedText.trim();
            }
            return `<a data-mira-link="${idx}"></a>`;
          });
        });
      }
      transContent = transContent.replace(/[（(]\s*L\d+\s*[：:]\s*[）)]/g, '').trim();
      const { mentionMap } = item;
      if (mentionMap && Object.keys(mentionMap).length > 0) {
        Object.keys(mentionMap).forEach(idx => {
          const pattern = new RegExp(
            `[\\(（]\\s*M${idx}\\s*[：:]\\s*([^)）]+?)\\s*[\\)）]`,
            'gi'
          );
          transContent = transContent.replace(pattern, `<span data-mira-mention="${idx}"></span>`);
        });
      }
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = transContent;
      const markedLinks = tempDiv.querySelectorAll('a[data-mira-link]');
      markedLinks.forEach(link => {
        const idx = link.getAttribute('data-mira-link');
        const meta = linkMap[idx];
        if (meta) {
          link.href = meta.href;
          link.target = '_blank';
          let display = (linkMap[idx]._translatedText || meta.textContent || link.textContent || '')
            .replace(/^https?:\/\//i, '');
          const LIMIT = 25;
          if (display.length > LIMIT) {
            display = display.substring(0, LIMIT).replace(/\/$/, '') + '...';
          }
          link.textContent = display;
          link.style.cssText = `
            color: #1d9bf0 !important;
            display: inline !important;
            white-space: nowrap !important;
            font-size: inherit !important;
            letter-spacing: -0.2px !important;
          `;
        }
        link.removeAttribute('data-mira-link');
      });
      if (mentionMap && Object.keys(mentionMap).length > 0) {
        tempDiv.querySelectorAll('span[data-mira-mention]').forEach(placeholder => {
          const idx = placeholder.getAttribute('data-mira-mention');
          const meta = mentionMap[idx];
          if (meta) {
            placeholder.replaceWith(meta.node.cloneNode(true));
          }
        });
      }
      container.innerHTML = '';
      Array.from(tempDiv.childNodes).forEach(node => {
        container.appendChild(node.cloneNode(true));
      });
      shrinkHeadingIfOverflow(container, el);
      container.style.fontStyle = "normal";
      container.style.color = "";
      container.dataset.translated = "true";
      if (typeof applyUserStyles === 'function') {
        applyUserStyles(container);
      }
    } catch (e) {
      logger.error('[Batcher] 渲染出错:', e);
      if (container && container.parentNode) container.remove();
    }
  },
  unlock(el) {
    el.removeAttribute('data-mira-processing');
    el.removeAttribute('data-translating');
    _miraProcessingSet.delete(el);
  },
};
function handleTwitterMultiParagraph(container, forceRefresh) {
  if (!forceRefresh && container.dataset.translated === 'true') return true;
  if (forceRefresh) {
    container.querySelectorAll('.kt-paragraph-translation').forEach(n => n.remove());
  }
  if (!forceRefresh && container.querySelector('.kt-paragraph-translation')) return true;
  const targetPrefix = (window.currentTargetL || '').toLowerCase().slice(0, 2);
  const isRTL = ['he', 'ar', 'fa'].includes(targetPrefix);
  const isAlreadyTargetLang = (text) => {
    if (forceRefresh) return false;
    const cleanText = text
      .replace(/@\w+/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[（）\(\)]/g, '')
      .trim();
    if (cleanText.length < 1) return true;
    return detectIsAlreadyTarget(cleanText, window.currentTargetL || navigator.language || 'en');
  };
  const atoms = [];
  function processNode(node) {
    if (!node) return;
    if (node.nodeType === 3) {
      node.textContent.split('\n').forEach((part, i, arr) => {
        atoms.push({ type: 'text', content: part.trim() });
        if (i < arr.length - 1) atoms.push({ type: 'break' });
      });
      return;
    }
    if (node.nodeType !== 1) return;
    if (node.classList?.contains('kt-paragraph-translation')) return;
    if (node.tagName === 'BUTTON') return;
    if (node.nodeName === 'A') {
      atoms.push({ type: 'link', node: node });
    } else if (node.nodeName === 'DIV' || node.nodeName === 'SPAN') {
      const isMention = node.querySelector('a') && node.innerText.startsWith('@');
      if (isMention) {
        atoms.push({ type: 'mention', node: node, text: node.innerText });
        atoms.push({ type: 'text', content: node.innerText });
      } else {
        Array.from(node.childNodes).forEach(processNode);
        if (node.style && node.style.display === 'block') {
          atoms.push({ type: 'break' });
        }
      }
    }
  }
  Array.from(container.childNodes).forEach(processNode);
  const paragraphs = [];
  let current = { texts: [], links: [], mentions: [] };
  let emptyBreakCount = 0;
  const flushPara = (isBlankLine = false) => {
    const text = current.texts.filter(t => t).join(' ').trim();
    if (text.length > 0 || current.links.length > 0 || current.mentions.length > 0) {
      paragraphs.push({ ...current, text, isBlank: false });
    } else if (isBlankLine) {
      paragraphs.push({ text: '', isBlank: true, links: [], mentions: [] });
    }
    current = { texts: [], links: [], mentions: [] };
  };
  atoms.forEach(atom => {
    if (atom.type === 'break') {
      const hasContent = current.texts.some(t => t) || current.links.length > 0 || current.mentions.length > 0;
      if (hasContent) { flushPara(false); emptyBreakCount = 0; }
      else { emptyBreakCount++; if (emptyBreakCount >= 1) flushPara(true); }
    } else if (atom.type === 'text') {
      if (atom.content !== undefined) current.texts.push(atom.content);
    } else if (atom.type === 'link') {
      current.links.push(atom.node);
    } else if (atom.type === 'mention') {
      current.mentions.push(atom);
    }
  });
  flushPara(false);
  if (paragraphs.length <= 1) return false;
  const nodesToRemove = Array.from(container.childNodes).filter(node => {
    if (node.classList?.contains('kt-paragraph-translation')) return false;
    if (node.tagName === 'BUTTON') return false;
    return true;
  });
  nodesToRemove.forEach(n => n.remove());
  paragraphs.forEach(({ text, links, mentions, isBlank }) => {
    if (!container || !container.parentNode) return;
    const newSpan = document.createElement('span');
    newSpan.style.display = 'block';
    if (isBlank) {
      newSpan.innerHTML = '<br>';
      container.appendChild(newSpan);
      return;
    }
    newSpan.textContent = text;
    links.forEach(a => {
      newSpan.appendChild(document.createTextNode(' '));
      newSpan.appendChild(a.cloneNode(true));
    });
    mentions.forEach(m => {
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
        text: m.text
      };
    });
    links.forEach((a, index) => {
      if (!a) return;
      const placeholder = `(L${index}: ${a.textContent})`;
      if (textForTranslation.includes(a.textContent) && a.textContent.length > 1) {
        textForTranslation = textForTranslation.replace(a.textContent, placeholder);
      } else {
        textForTranslation += ` ${placeholder}`;
      }
      generatedLinkMap[index] = {
        href: a.href,
        className: a.className,
        target: a.target || '_blank',
        textContent: a.textContent
      };
    });
    textForTranslation = textForTranslation.replace(/→\s*$/, '').trim();
    if (isAlreadyTargetLang(textForTranslation)) return;
    if (textForTranslation.length < 2) return;
    const transContainer = document.createElement('div');
    transContainer.className = 'kt-paragraph-translation';
    transContainer.style.setProperty('display', 'block', 'important');
    transContainer.style.setProperty('white-space', 'pre-wrap', 'important');
    transContainer.style.setProperty('margin-top', '2px', 'important');
    transContainer.style.setProperty('margin-bottom', '8px', 'important');
    transContainer.style.setProperty('line-height', '1.5', 'important');
    if (isRTL) {
      transContainer.style.setProperty('direction', 'rtl', 'important');
      transContainer.style.setProperty('text-align', 'right', 'important');
    }
    transContainer.innerText = t('loading');
    transContainer.classList.add('kt-loading');
    container.appendChild(transContainer);
    TranslationBatcher.add({
      el: newSpan,
      text: textForTranslation,
      container: transContainer,
      linkMap: generatedLinkMap,
      mentionMap: mentionMap
    }, forceRefresh);
    newSpan.dataset.translating = 'true';
  });
  container.dataset.translated = 'true';
  return true;
}
function extractTextWithLinks(node, el, linkMap, textHolder) {
  if (node.nodeType === Node.TEXT_NODE) {
    const content = node.textContent;
    const isSequenceIndicator = /^\s*[\(\[]?\d+[\.\)\]]?\s*$/.test(content);
    if (isSequenceIndicator && el.childNodes.length > 1) return;
    textHolder.text += content;
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return;
    if (node.tagName === 'SUP') return;
    if (node.classList?.contains('kt-paragraph-translation')) return;
    if (node.nodeName === 'A') {
      const isCitation = node.closest('sup') || /^\s*\[\d+\]\s*$/.test(node.textContent);
      if (isCitation) return;
      const textContent = node.textContent.trim();
      if (textContent === '' && node.querySelector('img')) return;
      const idx = linkMap.length;
      linkMap.push({ href: node.href, className: node.className, target: node.target, textContent });
      textHolder.text += `(L${idx}: ${textContent})`;
      return;
    }
    if (node.tagName === 'IMG' && node.alt) {
      const alt = node.alt.trim();
      if (alt.length > 0 && alt.length < 50 && !/^\d|stars|rating/i.test(alt)) {
        textHolder.text += alt;
      }
      return;
    }
    if (['UL', 'OL', 'P'].includes(node.tagName)) return;
    Array.from(node.childNodes).forEach(child =>
      extractTextWithLinks(child, el, linkMap, textHolder)
    );
  }
}
const _miraProcessingSet = new WeakSet();
async function handleTranslateElement(el, forceRefresh = false) {

  if (el.tagName === 'LI') {
    const rawText = el.innerText?.trim() || '';
    const hasSubMenu = !!el.querySelector('.jet-sub-mega-menu, .sub-menu, .dropdown-menu, [class*="mega-menu"]');
    const isTooLong = rawText.length > 500;
    if (hasSubMenu || isTooLong) {
      el.dataset.translated = 'true';
      el.removeAttribute('data-mira-processing');
      _miraProcessingSet.delete(el);
      return;
    }
  }
  if (el.isContentEditable ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'INPUT' ||
    el.closest('[contenteditable="true"]') ||
    el.closest('textarea') ||
    el.closest('input')) {
    return;
  }
  if (el.querySelector('script, style')) {
    el.dataset.translated = 'true';
    el.removeAttribute('data-mira-processing');
    _miraProcessingSet.delete(el);
    return;
  }
  const isYoutube = location.hostname.includes('youtube.com');
  const isTwitter = location.hostname.includes('x.com');
  const isAmazon = location.hostname.includes('amazon.com');
  const parentH1 = isYoutube ? el.closest('h1') : null;
  const youtubeListTitleLink = isYoutube ? el.closest('.yt-lockup-metadata-view-model__title') : null;
  const isHN = location.hostname.includes('news.ycombinator.com');
  const isGitHub = location.hostname.includes('github.com');
  const fastRawText = Array.from(el.childNodes)
    .filter(n => {
      if (n.nodeType === Node.ELEMENT_NODE) {
        return !n.classList.contains('kt-paragraph-translation');
      }
      return n.nodeType === Node.TEXT_NODE;
    })
    .map(n => n.textContent || '')
    .join('')
    .replace(/[ \t]+/g, ' ')
    .trim();
  if (isYoutube && el) {
    const isExcluded = el.closest(`
      .yt-content-metadata-view-model__metadata-row, 
      .yt-content-metadata-view-model__metadata-text,
      ytd-video-owner-renderer #channel-name,
      .ytd-channel-name,
      ytd-guide-entry-renderer,
      #guide-section-title,
      ytd-active-account-header-renderer,
      ytd-multi-page-menu-renderer
    `);
    if (isExcluded) {
      el.querySelectorAll('.kt-paragraph-translation').forEach(t => t.remove());
      el.dataset.translated = "true";
      el.removeAttribute('data-mira-processing');
      _miraProcessingSet.delete(el);
      return;
    }
  }
  if (isGitHub) {
    const isGitHubUI =
      el.closest('header.AppHeader') ||
      el.closest('nav') ||
      el.closest('[role="navigation"]') ||
      el.closest('.pagehead-actions') ||
      el.closest('.file-navigation') ||
      el.closest('.Box-header') ||
      (el.closest('aside') && !el.closest('.dashboard-changelog')) ||
      el.closest('[aria-label*="workflow"]') ||
      el.closest('.ActionList') ||
      el.closest('a[aria-label*="skipped"], a[aria-label*="failed"], a[aria-label*="success"]') ||
      el.tagName === 'BUTTON' ||
      el.tagName === 'RELATIVE-TIME' ||
      /^[\w.\-]+\/[\w.\-]+$/.test(fastRawText.trim());
    if (isGitHubUI) {
      el.querySelectorAll('.kt-paragraph-translation').forEach(t => t.remove());
      el.dataset.translated = 'true';
      el.removeAttribute('data-mira-processing');
      _miraProcessingSet.delete(el);
      return;
    }
  }
  if (!forceRefresh) {
    if (detectIsAlreadyTarget(fastRawText, window.currentTargetL || navigator.language)) {
      el.dataset.translated = 'true';
      return;
    }
  }
  if (!forceRefresh) {
    if (
      el.dataset.translated === 'true' ||
      el.dataset.transSkipped === 'true' ||
      el.dataset.translating === 'true' ||
      el.hasAttribute('data-mira-processing') ||
      _miraProcessingSet.has(el)
    ) return;
  } else if (el.dataset.translated === 'error') {
    const lastError = parseInt(el.dataset.lastErrorTime || 0);
    if (Date.now() - lastError < 30000) return;// 30秒内不重试
  } else {
    if (el.dataset.translating === 'true' || el.hasAttribute('data-mira-processing')) return;
  }
  if (isHN) {
    if (el.querySelector('.titleline')) {
      const actualTitle = el.querySelector('.titleline');
      return handleTranslateElement(actualTitle, forceRefresh);
    }
    if (el.classList.contains('rank')) return;
  }
  if (isTwitter) {
    const isSystemUI =
      (el.matches('[role="heading"]') || el.closest('[role="heading"]')) &&
      !el.closest('[data-testid="tweetText"]') ||
      el.closest('[data-testid="AppTabBar"]') ||
      el.closest('[data-testid="TopNavBar"]') ||
      el.closest('[data-testid="SearchBox"]') ||
      el.closest('[role="tab"]') ||
      el.closest('.r-bt1l66') ||
      el.closest('[data-testid="User-Name"]') ||
      el.closest('[data-testid="pillLabel"]') ||
      el.closest('a[href*="followers_you_follow"]') ||
      el.closest('h2') ||
      (el.closest('[data-testid="cellInnerDiv"]') &&
        !el.closest('[data-testid="tweetText"]') &&
        !el.closest('[data-testid="UserDescription"]') &&
        !el.closest('[data-testid="trend"]') &&
        !el.closest('[data-testid="trendMetadata"]'));
    if (isSystemUI) {
      el.dataset.translated = 'true';
      return;
    }

    const isNewsMeta = /^\d+\s+(hour|day|minute|week)s?\s+ago\s*·/.test(fastRawText)
      || /^(Trending now|Just now)\s*·/.test(fastRawText)
      || /·\s*Trending/.test(fastRawText);
    if (isNewsMeta) {
      el.dataset.translated = 'true';
      return;
    }
    const twitterTextContainer = el.closest('[data-testid="tweetText"], [data-testid="UserDescription"]');
    if (twitterTextContainer && el !== twitterTextContainer) {
      if (!twitterTextContainer.dataset.translating && !twitterTextContainer.dataset.translated) {
        handleTranslateElement(twitterTextContainer, forceRefresh);
      }
      return;
    }
    if (el === twitterTextContainer || el.matches?.('[data-testid="tweetText"]')) {
      const handled = handleTwitterMultiParagraph(el, forceRefresh);
      if (handled) return;
    }
  }
  const isSubListItem = el.tagName === 'LI' && !!el.closest('ul')?.parentElement?.closest('li');
  const isIndependent = ['P', 'LI'].includes(el.tagName);
  if (!isIndependent && !isSubListItem && el.parentElement) {
    const isAmazonReviewSpan = isAmazon && !!el.closest('[data-hook="review-collapsed"]');
    const isTrendTitle = isTwitter && !!el.closest('[data-testid="trend"]');
    const isAmazonCarouselTitle = isAmazon && el.tagName === 'SPAN';

    if (!isAmazonReviewSpan && !isTrendTitle && !isAmazonCarouselTitle &&
      el.parentElement.closest('[data-translating="true"], [data-translated="true"]')) {
      return;
    }
  }
  if (!forceRefresh && el.querySelector('.kt-paragraph-translation')) {
    el.dataset.translated = 'true';
    return;
  }
  const isYoutubeCustomTag = isYoutube && el.tagName.toLowerCase().startsWith('yt-');
  let mountTarget = el;
  if (isTwitter) {
    mountTarget = el.closest('[data-testid="tweetText"], [data-testid="UserDescription"]') || el;
  }
  const existingContainer = el.querySelector(':scope > .kt-paragraph-translation');
  const nextSiblingContainer = el.nextElementSibling?.classList?.contains('kt-paragraph-translation')
    ? el.nextElementSibling : null;
  const titleContainerSibling = youtubeListTitleLink?.nextElementSibling?.classList?.contains('kt-paragraph-translation')
    ? youtubeListTitleLink.nextElementSibling : null;
  if (!forceRefresh && (existingContainer || nextSiblingContainer || titleContainerSibling)) {
    el.dataset.translated = "true";
    el.removeAttribute('data-translating');
    el.removeAttribute('data-mira-processing');
    _miraProcessingSet.delete(el);
    return;
  }
  const linkMap = [];
  const textHolder = { text: '' };
  el.childNodes.forEach(node => extractTextWithLinks(node, el, linkMap, textHolder));
  const textWithPlaceholders = textHolder.text;
  const originalText = textWithPlaceholders.replace(/[ \t]+/g, ' ').trim();
  if (originalText.length < 2) {
    el.removeAttribute('data-translating');
    el.removeAttribute('data-mira-processing');
    _miraProcessingSet.delete(el);
    return;
  }
  if (/^(@\w+\s*)+$/.test(originalText.trim())) {
    el.dataset.translated = 'true';
    el.removeAttribute('data-translating');
    el.removeAttribute('data-mira-processing');
    _miraProcessingSet.delete(el);
    return;
  }
  if (!forceRefresh) {
    if (detectIsAlreadyTarget(originalText, window.currentTargetL || navigator.language)) {
      el.dataset.translated = "true";
      el.removeAttribute('data-translating');
      el.removeAttribute('data-mira-processing');
      _miraProcessingSet.delete(el);
      const oldContainer = el.querySelector('.kt-paragraph-translation');
      if (oldContainer) oldContainer.remove();
      return;
    }
    const currentHash = normalizeForCompare(originalText);
    if (el._miraSkippedHash && el._miraSkippedHash === currentHash) {
      el.dataset.translated = "true";
      el.removeAttribute('data-translating');
      el.removeAttribute('data-mira-processing');
      _miraProcessingSet.delete(el);
      return;
    }
  }
  el.dataset.translating = "true";
  el.setAttribute('data-mira-processing', 'true');
  _miraProcessingSet.add(el);
  let transContainer = existingContainer;
  if (!transContainer) {
    transContainer = document.createElement('div');
    transContainer.className = 'kt-paragraph-translation';
    transContainer.style.setProperty('display', 'block', 'important');
    transContainer.style.setProperty('white-space', 'pre-wrap', 'important');
    transContainer.innerText = t('loading');
    transContainer.style.color = 'gray';
    transContainer.style.fontStyle = 'italic';
  }
  const targetPrefix = (window.currentTargetL || "").toLowerCase().slice(0, 2);
  const isRTL = ['he', 'ar', 'fa'].includes(targetPrefix);
  if (isRTL) {
    transContainer.style.setProperty('direction', 'rtl', 'important');
    transContainer.style.setProperty('text-align', 'right', 'important');
    transContainer.style.setProperty('line-height', '1.6', 'important');
  } else {
    transContainer.style.setProperty('direction', 'ltr', 'important');
    transContainer.style.setProperty('text-align', 'left', 'important');
    transContainer.style.setProperty('line-height', '1.4', 'important');
  }
  if (!existingContainer) {
    const isAmazon = location.hostname.includes('amazon.');
    const isReddit = location.hostname.includes('reddit.com');
    const isWiki = location.hostname.includes('wikipedia.org');
    const isGoogle = location.hostname.includes('google.com');
    const finalCheckNode = isYoutube ? (parentH1 || youtubeListTitleLink || el) : mountTarget;
    if (!forceRefresh && isYoutube) {
      const ytNextSibling = finalCheckNode.nextElementSibling;
      if (ytNextSibling?.classList?.contains('kt-paragraph-translation')) {
        el.dataset.translated = "true";
        el.removeAttribute('data-translating');
        el.removeAttribute('data-mira-processing');
        _miraProcessingSet.delete(el);
        return;
      }
    }
    if (isYoutube && (parentH1 || youtubeListTitleLink)) {
      applyLayoutFix('youtube-layout-fix', `
        ytd-watch-metadata h1.style-scope.ytd-watch-metadata { height: auto !important; max-height: none !important; display: block !important; }
        .yt-lockup-metadata-view-model__title-container, 
        .yt-lockup-view-model__metadata,
        .yt-lockup-metadata-view-model__heading-reset { 
          height: auto !important; 
          max-height: none !important; 
          overflow: visible !important; 
          display: block !important;
        }
        .kt-paragraph-translation { display: block !important; clear: both !important; width: 100% !important; position: relative !important; }
      `);
      finalCheckNode.insertAdjacentElement('afterend', transContainer);
    } else if (el.tagName === 'LI' && (
      el.closest('nav, [class*="sidebar"], [id*="sidebar"]') ||
      (el.querySelector(':scope > a') && !el.querySelector(':scope > p, :scope > div:not(.kt-paragraph-translation)'))
    )) {
      const textDiv = el.querySelector('a > div > div:first-child')
        || el.querySelector('[class*="nav-text"]')
        || el.querySelector('[class*="menu-title"] span, [class*="nav-title"] span')
        || null;
      if (textDiv) {
        textDiv.appendChild(transContainer);
        transContainer.style.setProperty('display', 'block', 'important');
        transContainer.style.setProperty('margin-top', '2px', 'important');
        transContainer.style.setProperty('padding-left', '0', 'important');
        transContainer.style.setProperty('font-size', '0.9em', 'important');
      } else {
        el.appendChild(transContainer);
        transContainer.style.setProperty('display', 'block', 'important');
        transContainer.style.setProperty('margin-top', '2px', 'important');
        transContainer.style.setProperty('margin-left', '0', 'important');
        transContainer.style.setProperty('padding-left', '0', 'important');
        transContainer.style.setProperty('font-size', '0.9em', 'important');
      }
    }
    else if (el.tagName === 'TD') {
      el.appendChild(transContainer);
      transContainer.style.setProperty('display', 'block', 'important');
      transContainer.style.setProperty('margin-top', '4px', 'important');
      transContainer.style.setProperty('padding-top', '4px', 'important');
      transContainer.style.setProperty('border-top', '1px dashed rgba(128,128,128,0.3)', 'important');
      transContainer.style.setProperty('font-size', '0.85em', 'important');
      transContainer.style.setProperty('line-height', '1.4', 'important');
      transContainer.style.setProperty('white-space', 'normal', 'important');
      transContainer.style.setProperty('word-break', 'break-word', 'important');
      transContainer.style.setProperty('width', '100%', 'important');
      transContainer.style.setProperty('max-width', '100%', 'important');
      transContainer.style.setProperty('box-sizing', 'border-box', 'important');
    }
    else if (isGoogle) {
      el.appendChild(transContainer);
      transContainer.style.setProperty('display', 'block', 'important');
      transContainer.style.setProperty('margin-top', '4px', 'important');
      transContainer.style.setProperty('font-weight', 'normal', 'important');
      const lineClampParent = el.closest('[style*="-webkit-line-clamp"]') || el;
      lineClampParent.style.setProperty('-webkit-line-clamp', 'unset', 'important');
      lineClampParent.style.setProperty('display', 'block', 'important');
      lineClampParent.style.setProperty('overflow', 'visible', 'important');
    } else if (isAmazon) {
      if (el.id === 'productTitle') {
        Array.from(el.childNodes).forEach(node => {
          if (node.nodeType === 3) node.textContent = node.textContent.trim();
        });
        el.insertAdjacentElement('afterend', transContainer);
      } else {
        const expanderContainer = el.closest('.a-expander-container');
        if (expanderContainer) {
          expanderContainer.insertAdjacentElement('afterend', transContainer);
        } else {
          el.appendChild(transContainer);
        }
      }
      if (el.closest('#featurebullets_feature_div')) {
        transContainer.style.setProperty('margin-top', '2px', 'important');
        transContainer.style.setProperty('margin-bottom', '4px', 'important');
      }
      if (el.closest('.a-carousel-card, .a-truncate, .p13n-sc-uncoverable-faceout, [class*="prodInfo"], [class*="twoAsinsProductDetail"], li.p13n-intuition-product-grid__grid-item') ||
        (el.closest('.a-list-item') && !el.closest('[data-hook="review-collapsed"]') && !el.closest('[data-hook="review-body"]'))) {

        if (transContainer.parentNode) transContainer.parentNode.removeChild(transContainer);
        el.insertAdjacentElement('afterend', transContainer);

        transContainer.style.setProperty('display', 'block', 'important');
        transContainer.style.setProperty('position', 'relative', 'important');
        transContainer.style.setProperty('clear', 'both', 'important');
        transContainer.style.setProperty('width', '100%', 'important');
        transContainer.style.setProperty('margin-top', '20px', 'important');
        transContainer.style.setProperty('z-index', '1', 'important');

        el.style.setProperty('height', 'auto', 'important');
        el.style.setProperty('max-height', 'none', 'important');
        el.style.setProperty('overflow', 'visible', 'important');

        let parent = el.parentElement;
        for (let i = 0; i < 12 && parent && parent !== document.body; i++) {
          parent.style.setProperty('height', 'auto', 'important');
          parent.style.setProperty('max-height', 'none', 'important');
          parent.style.setProperty('overflow', 'visible', 'important');
          parent.style.setProperty('-webkit-line-clamp', 'unset', 'important');
          parent = parent.parentElement;
        }
      }
    } else if (isReddit) {
      const redditTitle = el.tagName === 'H1' || el.tagName === 'H2' || el.id.includes('post-title');
      if (redditTitle) {
        el.appendChild(transContainer);
        transContainer.style.setProperty('display', 'block', 'important');
        transContainer.style.setProperty('margin-top', '8px', 'important');
        transContainer.style.setProperty('font-weight', 'normal', 'important');
      } else {
        el.appendChild(transContainer);
      }
    } else if (isWiki) {
      const isHeading = ['H1', 'H2', 'H3', 'H4'].includes(el.tagName);
      const isCaption = el.tagName === 'FIGCAPTION';
      if (isCaption) {
        el.appendChild(transContainer);
        transContainer.style.setProperty('display', 'block', 'important');
        transContainer.style.setProperty('width', '100%', 'important');
        transContainer.style.setProperty('margin-top', '4px', 'important');
      } else if (isHeading) {
        el.appendChild(transContainer);
      } else {
        el.insertAdjacentElement('afterend', transContainer);
        transContainer.style.setProperty('display', 'flow-root', 'important');
        transContainer.style.setProperty('width', '100%', 'important');
      }
      transContainer.style.setProperty('clear', 'none', 'important');
    } else if (isYoutube) {
      finalCheckNode.insertAdjacentElement('afterend', transContainer);
    } else if (el.tagName === 'P') {
      el.appendChild(transContainer);
    } else if (isHN) {
      const titleLine = el.closest('.titleline');
      if (titleLine) {
        titleLine.insertAdjacentElement('afterend', transContainer);
        transContainer.style.display = 'block';
        transContainer.style.marginTop = '4px';
      } else {
        const firstP = el.querySelector('p');
        if (firstP && el.tagName !== 'P') {
          el.insertBefore(transContainer, firstP);
        } else {
          el.appendChild(transContainer);
        }
      }
    } else if (isTwitter) {
      const lineClampParent = mountTarget.closest
        ? mountTarget.closest('[data-testid^="news_sidebar_article"] div[dir="ltr"]')
        : null;

      const trendLineClamp = el.closest('[data-testid="trend"] div[dir="ltr"][style*="line-clamp"]');
      const trendKeyword = !trendLineClamp && el.closest('[data-testid="trend"]')
        ? el.closest('[data-testid="trend"] div[dir="ltr"]:not([style*="line-clamp"])')
        : null;
      const placementTrackingTitle = el.closest('[data-testid="placementTracking"] button div[style*="line-clamp"]');
      if (trendLineClamp) {
        trendLineClamp.insertAdjacentElement('afterend', transContainer);
      } else if (trendKeyword) {
        trendKeyword.insertAdjacentElement('afterend', transContainer);
      } else if (placementTrackingTitle) {
        placementTrackingTitle.style.setProperty('-webkit-line-clamp', 'unset', 'important');
        placementTrackingTitle.style.setProperty('overflow', 'visible', 'important');
        placementTrackingTitle.style.setProperty('display', 'block', 'important');
        placementTrackingTitle.insertAdjacentElement('afterend', transContainer);
      }
      else if (lineClampParent) {
        lineClampParent.insertAdjacentElement('afterend', transContainer);
      } else {
        mountTarget.insertAdjacentElement('afterend', transContainer);
      }
      transContainer.style.display = 'block';
      transContainer.style.marginTop = '8px';
      transContainer.style.setProperty('white-space', 'pre-wrap', 'important');
      transContainer.style.setProperty('line-height', '1.5', 'important');
    } else if (isGitHub) {
      if (el.tagName === 'A' && el.className.includes('IssuePullRequestTitle')) {
        const container = el.closest('[class*="Title-module__container"]') || el.parentElement || el;
        container.appendChild(transContainer);
        transContainer.style.setProperty('display', 'block', 'important');
        transContainer.style.setProperty('margin-top', '2px', 'important');
        transContainer.style.setProperty('font-weight', 'normal', 'important');
      } else if (el.classList.contains('markdown-title')) {
        const h1 = el.closest('h1') || el.parentElement || el;
        h1.appendChild(transContainer);
        transContainer.style.setProperty('display', 'block', 'important');
        transContainer.style.setProperty('margin-top', '8px', 'important');
        transContainer.style.setProperty('font-weight', 'normal', 'important');
        transContainer.style.setProperty('font-size', '0.85em', 'important');
      } else if (el.closest('h1.heading-element')) {
        const h1 = el.closest('h1.heading-element');
        h1.appendChild(transContainer);
        transContainer.style.setProperty('display', 'block', 'important');
        transContainer.style.setProperty('margin-top', '8px', 'important');
        transContainer.style.setProperty('font-weight', 'normal', 'important');
      } else if (el.closest('.markdown-body, .comment-body')) {
        el.appendChild(transContainer);
        transContainer.style.setProperty('display', 'block', 'important');
        transContainer.style.setProperty('margin-top', '4px', 'important');
      } else {
        el.appendChild(transContainer);
        transContainer.style.setProperty('display', 'block', 'important');
        transContainer.style.setProperty('margin-top', '4px', 'important');
      }
    }
    else {
      if (el.tagName === 'LI') {
        const subList = el.querySelector(':scope > ul, :scope > ol');
        if (subList) {
          el.insertBefore(transContainer, subList);
        } else {
          el.appendChild(transContainer);
        }
      } else if (el.tagName === 'P' || el.tagName === 'DIV' || el.tagName === 'SPAN') {
        el.appendChild(transContainer);
      } else {
        mountTarget.insertAdjacentElement('afterend', transContainer);
      }
    }
  }
  el.removeAttribute('data-mira-container-pending');
  if (typeof applyUserStyles === 'function') {
    await applyUserStyles(transContainer);

    if (!existingContainer) {
      transContainer.classList.add('kt-loading');
    }
    const originStyle = window.getComputedStyle(el);
    const originFontSize = originStyle.fontSize;
    const originFontWeight = originStyle.fontWeight;
    transContainer.style.setProperty('font-size', originFontSize, 'important');

    if (isYoutube && (isYoutubeCustomTag || youtubeListTitleLink)) {
      transContainer.style.setProperty('font-weight', originFontWeight, 'important');
      transContainer.style.setProperty('margin-top', youtubeListTitleLink ? '6px' : '12px', 'important');
      transContainer.style.setProperty('margin-bottom', youtubeListTitleLink ? '4px' : '18px', 'important');
    } else if (isAmazon && (el.id === 'productTitle' || el.querySelector('#productTitle'))) {
      const h1 = el.closest('h1');
      if (h1) {
        Array.from(h1.childNodes).forEach(node => { if (node.nodeType === 3) node.remove(); });
        h1.style.setProperty('display', 'flex', 'important');
        h1.style.setProperty('flex-direction', 'column', 'important');
        h1.style.setProperty('line-height', '1.1', 'important');
        el.style.setProperty('display', 'block', 'important');
        transContainer.style.setProperty('margin-top', '2px', 'important');
      }
    }
    if (isRTL) {
      transContainer.style.setProperty('direction', 'rtl', 'important');
      transContainer.style.setProperty('text-align', 'right', 'important');
      transContainer.style.setProperty('unicode-bidi', 'plaintext', 'important');
      transContainer.style.setProperty('line-height', '1.6', 'important');
    } else {
      transContainer.style.setProperty('direction', 'ltr', 'important');
      transContainer.style.setProperty('text-align', 'inherit', 'important');
      transContainer.style.setProperty('line-height', '1.5', 'important');
    }
  }
  TranslationBatcher.add({
    el: el,
    text: originalText,
    container: transContainer,
    linkMap: linkMap
  }, forceRefresh);
}
function getObserver() {
  if (!window.observer) {
    window.observer = new IntersectionObserver((entries) => {
      const rule = SiteRules.getRule(location.hostname);
      const selectors = rule.selectors;
      const host = location.hostname;
      const isYoutube = host.includes('youtube.com');
      entries.forEach(async entry => {
        if (!isPageScanEnabled || !entry.isIntersecting) return;
        const el = entry.target;
        const isMatch = el.matches(selectors);
        let targetEl = el;
        if (!isMatch && el.tagName === 'SPAN') {
          const parent = el.closest(selectors);
          if (parent) targetEl = parent;
        }
        if (!isMatch && targetEl === el) {
          if (!(isYoutube && el.classList?.contains('yt-core'))) {
            window.observer.unobserve(el);
            return;
          }
        }
        if (isYoutube) {
          const currentText = (targetEl.textContent || '').trim();
          const lastText = targetEl._miraLastText;
          if (lastText && lastText !== currentText) {
            targetEl.removeAttribute('data-translated');
            targetEl.removeAttribute('data-translating');
            targetEl.removeAttribute('data-mira-processing');
            delete targetEl._miraRetryCount;
            delete targetEl._miraSkippedHash;
            _miraProcessingSet.delete(targetEl);
            const nextNode = targetEl.nextElementSibling;
            if (nextNode && nextNode.classList?.contains('kt-paragraph-translation')) {
              nextNode.remove();
            }
            targetEl.querySelector?.('.kt-paragraph-translation')?.remove();
          }
          targetEl._miraLastText = currentText;
        }
        if (targetEl.dataset.translated === 'true') {
          if (!isYoutube) window.observer.unobserve(el);
          return;
        }
        if (targetEl.dataset.transSkipped === 'true') {
          if (!isYoutube) window.observer.unobserve(el);
          return;
        }
        if (targetEl.hasAttribute('data-translating')) return;
        if (targetEl.hasAttribute('data-mira-processing')) return;
        if (_miraProcessingSet.has(targetEl)) return;
        const text = (targetEl.textContent || '').trim();
        if (text.length >= (rule.minLen || 3)) {
          try {
            await handleTranslateElement(targetEl);
          } catch (error) {
            logger.error('Translation failed for element:', targetEl, error);
            _miraProcessingSet.delete(targetEl);
            targetEl.removeAttribute('data-mira-processing');
            targetEl.removeAttribute('data-translating');
          }
          if (!isYoutube) window.observer.unobserve(el);
        } else if (isYoutube) {
          handleYTDelayedText(targetEl);
        } else {
          window.observer.unobserve(el);
        }
      });
    }, { rootMargin: '400px' });
  }
  return window.observer;
}
/**
 * 穿透函数：递归搜索所有 Shadow DOM 中的目标
 */
function querySelectorAllDeep(selector, root = document) {
  let nodes = Array.from(root.querySelectorAll(selector));
  const allElements = root.querySelectorAll('*');
  for (const el of allElements) {
    if (el.shadowRoot) {
      nodes = nodes.concat(querySelectorAllDeep(selector, el.shadowRoot));
    }
  }
  return nodes;
}
function resolveActiveSelectors(inputSelectors) {
  if (typeof SiteRules === 'undefined') return (inputSelectors || "p").trim();
  const hasSpecificRule = SiteRules.hasRule(location.hostname);
  const genericSelectors = SiteRules.generic.selectors.trim();
  const isBasic = !inputSelectors
    || inputSelectors.trim() === ""
    || inputSelectors.trim() === "p";
  if (!isBasic) return inputSelectors.trim();
  if (hasSpecificRule) {
    const rule = SiteRules.getRule(location.hostname);
    if (rule && rule.selectors) return rule.selectors;
  }
  return genericSelectors;
}
function isElementVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (style.opacity === '0') return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  return true;
}
async function executeReScan(config) {
  if (!isPageScanEnabled) return;
  if (!window.__mira_reScanLock) window.__mira_reScanLock = { running: false, lastAt: 0 };
  const lock = window.__mira_reScanLock;
  const now = Date.now();
  const cooldown = 700;
  if (lock.running) {
    return { targets: 0, triggered: 0 };
  }
  if (!(config && config.forceAll) && (now - (lock.lastAt || 0) < cooldown)) {
    return { targets: 0, triggered: 0 };
  }
  lock.running = true;
  lock.lastAt = now;
  try {
    if (window.observer) {
      window.observer.disconnect();
    }
    const selectors = config?.selectors || currentActiveSelectors || "";
    const activeRules = resolveActiveSelectors(selectors);
    currentActiveSelectors = activeRules;
    if (config && config.forceAll) {
      document.querySelectorAll('.kt-paragraph-translation').forEach(node => {
        try { node.remove(); } catch (e) { }
      });
      const allMarked = (typeof querySelectorAllDeep === 'function')
        ? querySelectorAllDeep('[data-translated], [data-translating]')
        : document.querySelectorAll('[data-translated], [data-translating]');
      allMarked.forEach(el => {
        try {
          el.removeAttribute('data-translated');
          el.removeAttribute('data-translating');
          el.removeAttribute('data-mira-processing');
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
    let allElements = (typeof querySelectorAllDeep === 'function')
      ? querySelectorAllDeep(scanRules)
      : Array.from(document.querySelectorAll(scanRules));
    let triggered = 0;
    const tasks = [];
    const targets = [];
    for (let el of allElements) {
      try {
        const tag = el.tagName;
        if (['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT'].includes(tag)) continue;
        const text = el.innerText || el.textContent || '';
        const isCssLike = (text.match(/[{};:]/g) || []).length > 5;
        if (isCssLike) continue;
        if (el.closest('style, script, pre, code, [contenteditable]')) continue;
        const isX = location.hostname.includes('x.com');
        if (isX) {
          el.removeAttribute('data-translating');
          delete el.dataset.translating;
        }
        if (el.dataset.translated === 'true') {
          const hasRealContainer =
            el.nextElementSibling?.classList?.contains('kt-paragraph-translation') ||
            Array.from(el.children).some(c => c.classList.contains('kt-paragraph-translation'));
          if (hasRealContainer) continue;
          el.removeAttribute('data-translated');
          delete el.dataset.translated;
        }
        if (el.dataset.translating === 'true') continue;
        if (el.tagName === 'DIV' && (activeRules.includes('p') || activeRules.includes('li') || activeRules.includes('span'))) {
          const isAmazonProductTitle = location.hostname.includes('amazon.') &&
            el.className.includes('line-clamp');
          if (!isAmazonProductTitle) {
            const hasDirectText = Array.from(el.childNodes).some(n =>
              n.nodeType === 3 && n.textContent.trim().length > 1
            );
            if (!hasDirectText && el.querySelector('p, li, span')) continue;
          }
        }
        const rect = el.getBoundingClientRect();
        const isInViewportBuffer = rect.top < window.innerHeight + 800 && rect.bottom > -800;
        if ((config && config.forceAll) || isInViewportBuffer) {
          targets.push(el);
          tasks.push(async () => {
            try {
              if (!(config && config.forceAll)) {
                if (el.dataset.translated === 'true' || el.dataset.translating === 'true') return 0;
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
    logger.error('[Mira] executeReScan error:', e);
    lock.running = false;
    lock.lastAt = Date.now();
    return { targets: 0, triggered: 0 };
  }
}
async function scanContent(forcedSelectors = null) {
  if (typeof isPageScanEnabled !== 'undefined' && !isPageScanEnabled) return;
  if (forcedSelectors === null && currentActiveSelectors === "__LOADING__") return;
  if (forcedSelectors === null && typeof SiteRules !== 'undefined') {
    const domain = window.location.hostname.replace('www.', '');
    if (SiteRules.hasRule(domain)) {
      const presetSelectors = SiteRules.getRule(domain).selectors;
      // 合并 custom selector
      const storage = await safeGetStorage(['scanConfig']);
      const customSelectors = storage?.scanConfig?.custom?.[domain]?.selectors || "";
      if (customSelectors) {
        currentActiveSelectors = [...new Set([
          ...presetSelectors.split(',').map(s => s.trim()).filter(Boolean),
          ...customSelectors.split(',').map(s => s.trim()).filter(Boolean),
        ])].join(', ');
      } else {
        currentActiveSelectors = presetSelectors;
      }
    }
  }
  try {
    const isX = location.hostname.includes('x.com');
    const isMSN = location.hostname.includes('msn.com');
    let selectorsArray = [];
    const inputSelectors = (forcedSelectors !== null) ? forcedSelectors : (typeof currentActiveSelectors !== 'undefined' ? currentActiveSelectors : null);
    const finalRules = resolveActiveSelectors(inputSelectors);
    finalRules.split(',').forEach(s => { if (s.trim()) selectorsArray.push(s.trim()); });
    if (isX && !selectorsArray.includes("[data-testid='tweetText']")) {
      selectorsArray.push("[data-testid='tweetText']");
    }
    const validSelectors = [...new Set(selectorsArray)].filter(Boolean);
    if (validSelectors.length === 0) return;
    const finalSelectors = validSelectors.join(', ');
    if (forcedSelectors !== null) {
      currentActiveSelectors = forcedSelectors;
    }
    let allTargets;
    const hasShadowPotential = !!document.querySelector(':defined:not(style, script, link, meta)');
    if (isMSN || hasShadowPotential) {
      allTargets = typeof querySelectorAllDeep === 'function' ? querySelectorAllDeep(finalSelectors) : Array.from(document.querySelectorAll(finalSelectors));
    } else {
      allTargets = Array.from(document.querySelectorAll(finalSelectors));
    }
    allTargets.forEach(el => {
      if (!el || el.nodeType !== 1) return;
      const isAmazon = location.hostname.includes('amazon.');
      const isAmazonReview = el.getAttribute('data-hook') === 'review-body';
      if (isAmazon && el.tagName === 'LI' && el.classList.contains('a-carousel-card')) {
        el.dataset.translated = 'true';
        return;
      }
      if (isAmazon && el.getAttribute('data-hook') === 'review') {
        const reviewSpan = el.querySelector("[data-hook='review-collapsed'] > span");
        if (reviewSpan && reviewSpan.dataset.translated !== 'true') {
          handleTranslateElement(reviewSpan);
        }
        return;
      }
      const isYTComment = el.classList.contains('yt-core-attributed-string') || el.id === 'content-text';
      const isSpecialSite = isAmazonReview || isYTComment || isX || isAmazon;
      let targetEl = el;
      if (isAmazonReview) {
        const deepSpan = el.querySelector('.review-text-content span') || el.querySelector('span');
        if (deepSpan) targetEl = deepSpan;
      }
      if (!isSpecialSite) {
        if (['STYLE', 'SCRIPT', 'NOSCRIPT'].includes(targetEl.tagName) || targetEl.querySelector('style, script')) {
          targetEl.dataset.translated = "true";
          return;
        }
        let directText = "";
        targetEl.childNodes.forEach(node => {
          if (node.nodeType === 3) {
            directText += node.textContent;
          }
        });
        const raw = directText.trim();
        if (raw.length > 0) {
          if ((raw.includes('{') && raw.includes(':')) || raw.includes('NO_OF_HOURS')) {
            targetEl.dataset.translated = "true";
            return;
          }
        }
      }

      if (targetEl.dataset.translated === "true") return;
      if (targetEl.dataset.translating === "true" && !isAmazonReview) return;
      const textContent = (isAmazonReview || isYTComment) ? (targetEl.textContent || "") : (targetEl.innerText || targetEl.textContent || "");
      const cleanText = textContent.trim();
      if (cleanText.length < (isSpecialSite ? 1 : 2)) {
        targetEl.dataset.translated = "true";
        return;
      }
      if (isAmazonReview && cleanText.length > 800) {
        const chunks = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
        targetEl.innerHTML = '';
        chunks.forEach(chunk => {
          const s = document.createElement('span');
          s.style.display = 'block';
          s.style.marginBottom = '8px';
          s.textContent = chunk;
          targetEl.appendChild(s);
          if (typeof handleTranslateElement === 'function') handleTranslateElement(s);
        });
        targetEl.dataset.translated = "true";
        return;
      }
      if (!isSpecialSite) {
        let parent = targetEl.parentElement;
        const isIndependent = ['P', 'LI', 'H1', 'H2', 'H3', 'H4'].includes(targetEl.tagName);
        if (!isIndependent) {
          while (parent && parent !== document.documentElement) {
            if (typeof parent.matches === 'function' && parent.matches(finalSelectors)) {
              if (parent.dataset.translated === "true" || parent.dataset.translating === "true") {
                targetEl.dataset.translated = "true";
                return;
              }
            }
            parent = parent.parentElement;
          }
        }
      }
      const rect = targetEl.getBoundingClientRect();
      const isInViewport = isSpecialSite || (rect.top < window.innerHeight + 1500 && rect.bottom > -1500);
      if (isInViewport && typeof handleTranslateElement === 'function') {
        handleTranslateElement(targetEl);
      } else {
        const obs = getObserver();
        if (obs && typeof obs.observe === 'function') {
          if (
            targetEl.isContentEditable ||
            targetEl.closest?.('[contenteditable="true"]') ||
            targetEl.closest?.('textarea') ||
            targetEl.tagName === 'TEXTAREA' ||
            targetEl.tagName === 'INPUT'
          ) return;
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
 * 这种方式避免了使用 chrome.runtime.sendMessage 导致的“通信未就绪”报错
 */
document.addEventListener('KT_CONFIG_UPDATED', (e) => {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
    if (typeof showUpdateNotification === 'function') {
      showUpdateNotification();
    }
    return;
  }
  isPageScanEnabled = true;
  const newSelectors = e.detail.selectors;
  currentActiveSelectors = newSelectors;
  if (newSelectors.trim() !== "") {
    try {
      document.querySelectorAll(newSelectors).forEach(el => {
        if (!el.closest("[data-testid='tweetText']")) {
          delete el.dataset.translated;
          delete el.dataset.translating;
          el.removeAttribute('data-translated');
          el.removeAttribute('data-translating');
          const oldTrans = el.querySelector('.kt-paragraph-translation');
          if (oldTrans) oldTrans.remove();
        }
      });
    } catch (err) {
      logger.warn("[Mira] 选择器语法解析失败，跳过预清理:", newSelectors);
    }
  }
  if (typeof scanContent === 'function') {
    scanContent(newSelectors);
  } else {
    logger.error("[Mira] 错误：未找到 scanContent 函数");
  }
});
/**
 * 语音朗读函数 - 自动识别语言并播放
 * @param {string} text 需要朗读的文本
 */
let lastUtterance = null;
function speak(text, speakBtn) {
  if (!window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  lastUtterance = new SpeechSynthesisUtterance(text);
  lastUtterance.rate = 0.8;
  lastUtterance.volume = 1.0;
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) {
    lastUtterance.lang = 'ja-JP';
    lastUtterance.rate = 0.55;
  }
  else if (/\p{Script=Hangul}/u.test(text)) {
    lastUtterance.lang = 'ko-KR';
  }
  else if (/\p{Script=Hebrew}/u.test(text)) {
    lastUtterance.lang = 'he-IL';
    lastUtterance.rate = 0.85;
  }
  else if (/\p{Script=Han}/u.test(text)) {
    lastUtterance.lang = /[繁體國語]/.test(text) ? 'zh-TW' : 'zh-CN';
    lastUtterance.rate = 0.9;
  }
  else if (/\p{Script=Thai}/u.test(text)) {
    lastUtterance.lang = 'th-TH';
  }
  else if (/\p{Script=Arabic}/u.test(text)) {
    lastUtterance.lang = 'ar-SA';
  }
  else if (/\p{Script=Hebrew}/u.test(text)) {
    lastUtterance.lang = 'he-IL';
  }
  else if (/\p{Script=Devanagari}/u.test(text)) {
    lastUtterance.lang = 'hi-IN';
  }
  else if (/\p{Script=Bengali}/u.test(text)) {
    lastUtterance.lang = 'bn-BD';
  }
  else if (/\p{Script=Cyrillic}/u.test(text)) {
    lastUtterance.lang = 'ru-RU';
  }
  else if (/\p{Script=Greek}/u.test(text)) {
    lastUtterance.lang = 'el-GR';
  }
  else if (/[ĞğİıŞş]/.test(text)) {
    lastUtterance.lang = 'tr-TR';
  }
  else if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(text)) {
    lastUtterance.lang = 'pl-PL';
  }
  else if (/[àáảãạăâèéẻẽẹêìíỉĩịòóỏõọôơùúủũụưỳýỷỹỵĐđ]/.test(text)) {
    lastUtterance.lang = 'vi-VN';
  }
  else if (/[äöüßÄÖÜ]/.test(text)) {
    lastUtterance.lang = 'de-DE';
  }
  else if (/[éàèâîôûçëïüÿœæ]/.test(text)) {
    lastUtterance.lang = 'fr-FR';
  }
  else if (/[ñ¿¡]/.test(text)) {
    lastUtterance.lang = 'es-ES';
  }
  else {
    lastUtterance.lang = 'en-US';
  }
  const forceReset = new SpeechSynthesisUtterance("");
  window.speechSynthesis.speak(forceReset);
  setTimeout(() => {
    window.speechSynthesis.speak(lastUtterance);
  }, 50);
  if (speakBtn) {
    speakBtn.classList.remove('is-speaking');
    lastUtterance.onstart = () => speakBtn.classList.add('is-speaking');
    const stop = () => speakBtn?.classList.remove('is-speaking');
    lastUtterance.onend = stop;
    lastUtterance.onerror = stop;
  }
}
const getTextFragmentAnchor = (word) => {
  try {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return '';
    const range = selection.getRangeAt(0);
    const container = range.startContainer.parentElement;
    const fullText = container.innerText || "";
    const startOffset = range.startOffset;
    const endOffset = range.endOffset;
    const prefix = fullText.substring(Math.max(0, startOffset - 15), startOffset).trim();
    const suffix = fullText.substring(endOffset, Math.min(fullText.length, endOffset + 15)).trim();
    let fragment = `#:~:text=`;
    if (prefix) fragment += encodeURIComponent(prefix) + '-,';
    fragment += encodeURIComponent(word);
    if (suffix) fragment += ',-' + encodeURIComponent(suffix);
    return fragment;
  } catch (e) {
    logger.warn("[Mira-Context] 无法获取文本片段:", e);
    return '';
  }
};
function initSelectionTranslate() {
  const logoBase64 = ASSETS.logoBase64;
  window.addEventListener('scroll', () => {
    if (logoBtn && logoBtn.classList.contains('show')) {
      forceHideLogo();
    }
  }, { passive: true });
  let isDragging = false, startX, startY, initialX, initialY;
  let shadowHost = null, popupEl = null, logoBtn = null;
  function clampPopupToViewport(el) {
    const margin = 10;
    const rect = el.getBoundingClientRect();
    const vw = window.visualViewport?.width || window.innerWidth;
    const vh = window.visualViewport?.height || window.innerHeight;
    let left = rect.left;
    let top = rect.top;
    if (rect.right > vw - margin) {
      left = vw - rect.width - margin;
    }
    if (left < margin) {
      left = margin;
    }
    if (rect.bottom > vh - margin) {
      top = vh - rect.height - margin;
    }
    if (top < margin) {
      top = margin;
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }
  function enablePanelResize(panel) {
    const resizers = panel.querySelectorAll('.resizer');
    resizers.forEach(resizer => {
      resizer.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const dir = this.getAttribute('data-dir');
        const startX = e.clientX;
        const startY = e.clientY;
        const rect = panel.getBoundingClientRect();
        const startW = rect.width;
        const startH = rect.height;
        const startL = rect.left;
        const startT = rect.top;
        panel.style.transition = 'none';
        function onMouseMove(ev) {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if (dir.includes('r') || dir.includes('l')) {
            let newW = dir.includes('r') ? startW + dx : startW - dx;
            const maxWidthLimit = window.innerWidth * 0.9;
            if (newW > 280 && newW < maxWidthLimit) {
              panel.style.width = newW + 'px';
              panel.style.maxWidth = newW + 'px';
              if (dir.includes('l')) {
                panel.style.left = (startL + dx) + 'px';
              }
            }
          }
          let newH = startH;
          if (dir.includes('b')) { newH = startH + dy; }
          else if (dir.includes('t')) { newH = startH - dy; }
          const maxHeightLimit = window.innerHeight * 0.85;
          if (newH > 150 && newH < maxHeightLimit) {
            panel.style.height = newH + 'px';
            panel.style.maxHeight = newH + 'px';
            if (dir.includes('t')) {
              panel.style.top = (startT + dy) + 'px';
            }
          }
        }
        function onMouseUp() {
          panel.style.transition = 'opacity 0.2s, transform 0.2s';
          const finalRect = panel.getBoundingClientRect();
          panel.style.width = finalRect.width + 'px';
          panel.style.maxWidth = finalRect.width + 'px';
          panel.style.minWidth = '280px';
          panel.style.height = 'auto';
          panel.style.maxHeight = finalRect.height + 'px';
          panel.style.minHeight = finalRect.height + 'px';
          const settings = {
            width: finalRect.width + 'px',
            height: finalRect.height + 'px'
          };
          localStorage.setItem('eclipse-translator-settings', JSON.stringify(settings));//设置窗口大小
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        }
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    });
  }
  function initShadowDOM() {
    if (shadowHost) return;
    shadowHost = document.createElement('div');
    shadowHost.id = 'eclipse-translator-host';
    shadowHost.setAttribute('data-pinned', 'false');
    shadowHost.style.cssText = "position:absolute; top:0; left:0; width:0; height:0; z-index:2147483647;pointer-events: none;";
    document.documentElement.appendChild(shadowHost);
    const shadow = shadowHost.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
:host {
    --p-bg: rgba(18, 18, 18, 0.95);
    --p-text-main: #ffffffb7;
    --p-text-query: rgb(31 31 35 / 34%);
    --p-text-muted: rgba(255, 255, 255, 0.6);
    --p-text-detail: rgba(255, 255, 255, 0.6);
    --p-accent: #38bdf8;
    --p-border: rgba(255, 255, 255, 0.1);
    --p-shadow: rgba(0, 0, 0, 0.5);
    --p-glow-opacity: 0.8;   
    --p-content-container: rgba(39, 39, 50 ,0.39);  
    --p-header-wrapper: rgba(31, 31, 35 ,0.34);
    --p-header-wrapper-shadow:0 2px 8px rgba(235, 215, 215, 0.09);
    --p-phonetic: #38bdf8;
}
:host([theme="light"]) {
    --p-bg: #ffffffb7; 
    --p-text-main: #1a202c;           
    --p-text-query: #2d3748;          
    --p-text-muted: #718096;          
    --p-text-detail: #4f5a6a;
    --p-accent: #0284c7;              
    --p-border: rgba(0, 0, 0, 0.1);   
    --p-shadow: rgba(0, 0, 0, 0.1);
    --p-glow-opacity: 0.3;            
    --p-content-container: rgba(245, 249, 249 ,0.79); 
    --p-header-wrapper: rgba(177, 178, 191, 0.23);
    --p-header-wrapper-shadow:0 2px 8px rgba(0, 0, 0, 0.3);
    --p-phonetic: #07a457;
}
@media (prefers-color-scheme: light) {
    :host(:not([theme="dark"])) {
        --p-bg: #ffffffb7; 
        --p-text-main: #1a202c;
        --p-text-query: #2d3748;
        --p-text-muted: #718096;
        --p-text-detail: rgba(255, 255, 255, 0.6);
        --p-accent: #0284c7;
        --p-border: rgba(0, 0, 0, 0.1);
        --p-shadow: rgba(0, 0, 0, 0.1);
        --p-content-container: rgba(245, 249, 249 ,0.79); 
        --p-header-wrapper: rgba(177, 178, 191, 0.23);
    --p-header-wrapper-shadow:0 2px 8px rgba(0, 0, 0, 0.3);
    --p-phonetic: #07a457;
    }
}
:host([theme="dark"]) {
    --p-bg: rgba(18, 18, 18, 0.95);
    --p-text-main: #ffffffb7;
    --p-text-muted: rgba(255, 255, 255, 0.6);
    --p-text-detail: rgba(255, 255, 255, 0.6);
    --p-border: rgba(255, 255, 255, 0.1);
    --p-shadow: rgba(0, 0, 0, 0.5);
    --p-accent: #38bdf8;
    --p-glow-opacity: 0.8;
    --p-content-container: rgba(39, 39, 50 ,0.39);  
    --p-header-wrapper: rgba(31, 31, 35 ,0.34);
    --p-header-wrapper-shadow:0 2px 8px rgba(235, 215, 215, 0.09);
    --p-phonetic: #38bdf8;
}
:host([theme="light"]) {
    --p-bg: #ffffffb7;
    --p-text-main: #1a202c;
    --p-text-muted: #718096;
    --p-text-detail: #4f5a6a;
    --p-border: rgba(0, 0, 0, 0.1);
    --p-shadow: rgba(0, 0, 0, 0.1);
    --p-accent: #0284c7;
    --p-glow-opacity: 0.3;
    --p-content-container: rgba(245, 249, 249 ,0.79); 
    --p-header-wrapper: rgba(177, 178, 191, 0.23);
    --p-header-wrapper-shadow:0 2px 8px rgba(0, 0, 0, 0.3);
    --p-phonetic: #07a457;
}
:host([data-detected="dark"]) {
    --p-bg: rgba(18, 18, 18, 0.95);
    --p-text-main: #ffffffb7;
    --p-text-muted: rgba(255, 255, 255, 0.6);
    --p-text-detail: rgba(255, 255, 255, 0.6);
    --p-border: rgba(255, 255, 255, 0.1);
    --p-shadow: rgba(0, 0, 0, 0.5);
    --p-accent: #38bdf8;
    --p-glow-opacity: 0.8;
    --p-content-container: rgba(39, 39, 50 ,0.39);  
    --p-header-wrapper: rgba(31, 31, 35 ,0.34);
    --p-header-wrapper-shadow:0 2px 8px rgba(235, 215, 215, 0.09);
    --p-phonetic: #38bdf8;
}
@keyframes eclipseHalo {
  0%, 100% {
    box-shadow: 
      0 0 8px 2px rgba(56, 189, 248, 0.25),  
      0 0 20px 4px rgba(124, 222, 255, 0.15),  
      0 0 35px 6px rgba(186, 230, 253, 0.08),  
      0 10px 30px var(--p-shadow, rgba(0, 0, 0, 0.5));
  }
  50% {
    box-shadow: 
      0 0 15px 4px rgba(56, 189, 248, 0.5),
      0 0 30px 8px rgba(124, 222, 255, 0.3),  
      0 0 50px 12px rgba(186, 230, 253, 0.15),
      0 0 80px 20px rgba(219, 239, 255, 0.05),  
      0 10px 30px var(--p-shadow, rgba(0, 0, 0, 0.5));
  }
}
@keyframes eclipseHaloLight {
  0%, 100% {
    box-shadow: 
      0 0 8px 2px rgba(168, 85, 247, 0.25),
      0 0 20px 4px rgba(192, 132, 252, 0.2),  
      0 0 35px 6px rgba(233, 213, 255, 0.15),
      0 10px 30px var(--p-shadow, rgba(0, 0, 0, 0.1));
  }
  50% {
    box-shadow: 
      0 0 15px 4px rgba(168, 85, 247, 0.5),
      0 0 30px 8px rgba(192, 132, 252, 0.4),
      0 0 50px 12px rgba(233, 213, 255, 0.25),
      0 0 80px 20px rgba(245, 228, 255, 0.1),
      0 10px 30px var(--p-shadow, rgba(0, 0, 0, 0.1));
  }
}
@keyframes eclipseHaloLightAlt {
  0%, 100% {
    box-shadow: 
      0 0 8px 2px rgba(74, 222, 128, 0.3),
      0 0 20px 4px rgba(134, 239, 172, 0.2),
      0 0 35px 6px rgba(187, 247, 208, 0.15),
      0 10px 30px var(--p-shadow, rgba(0, 0, 0, 0.1));
  }
  50% {
    box-shadow: 
      0 0 15px 4px rgba(74, 222, 128, 0.6),
      0 0 30px 8px rgba(134, 239, 172, 0.4),
      0 0 50px 12px rgba(187, 247, 208, 0.25),
      0 0 80px 20px rgba(220, 252, 231, 0.1),
      0 10px 30px var(--p-shadow, rgba(0, 0, 0, 0.1));
  }
}
@keyframes eclipseHaloLightWarm {
  0%, 100% {
    box-shadow: 
      0 0 8px 2px rgba(245, 158, 11, 0.3),
      0 0 20px 4px rgba(251, 191, 36, 0.25),
      0 0 35px 6px rgba(253, 230, 138, 0.2),
      0 10px 30px var(--p-shadow, rgba(0, 0, 0, 0.1));
  }
  50% {
    box-shadow: 
      0 0 15px 4px rgba(245, 158, 11, 0.6),
      0 0 30px 8px rgba(251, 191, 36, 0.4),
      0 0 50px 12px rgba(253, 230, 138, 0.25),
      0 0 80px 20px rgba(254, 243, 199, 0.15),
      0 10px 30px var(--p-shadow, rgba(0, 0, 0, 0.1));
  }
}
    .resizer {
            background: transparent; 
            pointer-events: auto !important;
            z-index: 2147483648 !important; 
            position: absolute;
        }
    .resizer:hover {
      background: rgba(56, 189, 248, 0.05);
    }
    #eclipse-translator-host {
      pointer-events: none;
    }
    #drag-zone {
      position: absolute;
      top: 5px;
      left: 0;
      right: 0;
      height: 22px;
      cursor: grab;
      z-index: 5;
    }
    .eclipse-logo-btn {
      position: fixed;
      width: 22px;
      height: 22px;
      background: transparent !important;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 2147483647;
      transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.2), opacity 0.2s;
      opacity: 0;
      transform: scale(0.5);
      pointer-events: auto;
    }
    .eclipse-logo-btn.show {
      display: flex !important;
      opacity: 1 !important;
      transform: scale(1) !important;
    }
    .eclipse-logo-btn img {
      width: 18px;
      height: 18px;
      border-radius: 4px;
      filter: drop-shadow(0 0 3px rgba(0, 0, 0, 0.3));
    }
    .panel {
    pointer-events: auto;
    color: var(--p-text-main);
    position: fixed;
    background: var(--p-bg, rgba(20, 20, 25, 0.85)) !important;
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border-top: 1px solid rgba(255, 255, 255, 0.12) !important;
    border-left: 1px solid rgba(255, 255, 255, 0.12) !important;
    box-shadow: 
        0 8px 30px rgba(0, 0, 0, 0.4),
        0 1px 0 rgba(255, 255, 255, 0.05),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    border-radius: 16px !important;
    padding: 0 !important;
    z-index: 2147483647;
    box-sizing: border-box;
    min-height: 150px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    transition: 
        opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1),
        transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); 
        max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
        width 0.3s ease;
    overflow: hidden !important;
    resize: none;
    cursor: default;
    min-width: 280px;
    max-width: 450px;
    width: fit-content;
    word-wrap: break-word;
    overflow-wrap: break-word;
    word-break: break-word;
    align-items: flex-start !important;
    animation: eclipseHalo 6s ease-in-out infinite;
}
    /* 浅色模式光晕效果 
    eclipseHaloLight 蓝色
    eclipseHaloLightAlt 绿色
    eclipseHaloLightWarm 橙色
    */
    :host([theme="light"]) .panel {
        animation: eclipseHaloLightWarm 8s ease-in-out infinite;
    }
    .panel:hover {
      animation-duration: 3s !important;
    }
    :host([theme="light"]) .panel:hover {
      animation-duration: 4s !important;
    }
    .panel::-webkit-resizer {
      background-image: linear-gradient(135deg, transparent 50%, var(--p-accent) 50%);
      background-size: 10px 10px;
      background-repeat: no-repeat;
      background-position: bottom right;
    }
    #p-content-container {
      flex: 1;
      padding-top: 6px !important;
      overflow-y: auto !important;
      overflow-x: hidden;
      word-break: break-word;
      padding-top: 5px;
      will-change: transform;
      margin-top: 0px;
      min-height: 0;
      position: relative;
      z-index: 5;
      contain: nosize;
      display: block;
      background-color: var(--p-content-container, rgba(31, 31, 35 ,0.34)) !important;
    }
    #p-main-container {
    flex: 1; 
    display: flex; 
    flex-direction: column; 
    min-height: 0; 
    min-width: 0; 
    width: 100%;
    overflow: visible !important;
    background-color: transparent !important; 
    color: var(--p-text-main);
}
    #p-header-wrapper {
    position: relative;
    z-index: 1000;
    width: 100%;
    display: flex;
    box-sizing: border-box;
    padding: 10px 16px 0px 16px;
    pointer-events: none;
    background: rgba(30, 30, 35, 0.85) !important;
    background: var(--p-header-wrapper, rgba(30, 30, 35, 0.85)) !important;
    backdrop-filter: blur(20px) saturate(180%);
    box-shadow:var(--p-header-wrapper-shadow);
}
    .close-btn, #p-pin, #p-save, .speak-btn {
        -webkit-user-select: none; 
        -moz-user-select: none;    
        -ms-user-select: none;     
        user-select: none;         
        cursor: pointer;
    }
#p-content-container::-webkit-scrollbar {
    width: 10px;
    background: transparent !important;
}
#p-content-container::-webkit-scrollbar-track {
    background: transparent !important;
}
#p-content-container::-webkit-scrollbar-thumb {
    background-color: var(--p-text-muted) !important;
    border-radius: 20px !important;
    border: 3px solid transparent !important;
    background-clip: padding-box !important;
    transition: background-color 0.2s ease; 
}
#p-content-container::-webkit-scrollbar-thumb:hover {
    background-color: var(--p-accent) !important;
    background-clip: padding-box !important; 
}
    .is-hidden {
      opacity: 0 !important;
      pointer-events: none !important;
      transform: scale(0.8) translateY(8px) !important;
    }
    #p-header {
      height: 20px;
      cursor: grab;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      pointer-events: none;
    }
    .word-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 4px;
    }
    #p-query {
      font-size: 22px;
      font-weight: 700;
      color: var(--p-text-query);
      line-height: 1.2;
      display: block;      
        width: 100%;
        word-break: break-all; 
        overflow-wrap: break-word;
        white-space: normal;   
    }
    #p-phonetic {
      color: var(--p-text-main);
      font-size: 14px;
      margin-top: 4px;
      opacity: 0.8;
      font-family: "Lucida Sans Unicode", sans-serif;
      display: inline-block;
      padding: 2px 0;
    }
    .icon-btn {
      cursor: pointer;
      opacity: 0.8;
      display: flex;
      align-items: center;
      transition: 0.2s;
    }
    .icon-btn:hover {
      opacity: 1;
      transform: scale(1.1);
    }
    .basic {
      font-size: 17px;
      color: var(--p-accent);
      margin: 12px 0 8px 0;
      font-weight: 500;
    }
    .detail {
      font-size: 13.5px;
      color: var(--p-text-detail);
      line-height: 1.6;
      border-top: 1px solid var(--p-border);
      padding-top: 7px;
    }
    #p-examples {
      margin-top: 15px;
      border-top: 1px dotted var(--p-border);
      padding-top: 12px;
      width: 100%;           
      box-sizing: border-box; 
      overflow: hidden;      
    }
    .ex-item {
      margin-bottom: 10px;
      border-left: 3px solid #25cbf6ab;
      padding-left: 10px;
      padding-right: 5px;
      border-radius: 2px;
      display: block;
      word-wrap: break-word;       
      overflow-wrap: break-word;   
      word-break: break-all;       
      max-width: 100%;             
      box-sizing: border-box;      
    } 
    .ex-en {
      font-size: 13px;
      color: var(--p-text-muted) !important;
      line-height: 1.4;
      white-space: normal;
      overflow-wrap: break-word; 
      word-break: normal;        
    }
    .ex-cn {
      font-size: 12px;
      color: var(--p-text-muted) !important;
      margin-top: 2px;
      white-space: normal;
      word-break: break-all;     
    }
    #p-pin {
      display: flex !important;
      align-items: center;
      justify-content: center;
      width: 32px;  
      height: 46px; 
      overflow: visible !important;
      transform: translateY(-6px); 
      cursor: pointer;
      pointer-events: auto !important;
    }
    #pin-icon {
      display: block !important;
      transform: rotate(-45deg);
      transition:
        transform 0.4s cubic-bezier(0.4, 0, 0.2, 1),
        stroke 0.4s ease;
      !important;
    }
    #p-pin:hover #pin-icon {
      stroke: #38bdf8 !important;
      opacity: 1 !important;
      transform: scale(1.2) !important;
    }
    #p-pin.is-pinned #pin-icon {
      stroke: #38bdf8 !important;
      fill: rgba(56, 189, 248, 0.3) !important; 
      transform: rotate(0deg) scale(1.1) !important; 
      opacity: 1 !important;
    }
    #p-pin.is-pinned:not(:hover) #pin-icon {
      stroke: #38bdf8 !important;
      fill:#38bdf8 !important;
    }
    #p-pin, #p-save, .close-btn {
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .header-controls {
        position: absolute;
        top: 1px;      
        right: 9px;    
        display: flex;
        align-items: center;
        gap: 3px;      
        z-index: 10001; 
        pointer-events: auto !important; 
    }
    .save-btn  {
      transition: all 0.2s ease;
    }
    .save-btn:hover {
      transform: scale(1.1);
      filter: drop-shadow(0 0 5px rgba(250, 204, 21, 0.4));
    }
    .save-btn:active {
      transform: scale(0.85) translateY(1px) !important;
      filter: brightness(0.9);
      transition: all 0.05s !important; 
    }
    .refresh-btn {
        transition: all 0.2s ease;
    }
    .refresh-btn:hover {
        transform: scale(1.2) !important;
    }
    #p-save:hover #star-icon {
      stroke: #facc15 !important;
      fill: rgba(250, 204, 21, 0.2) !important;
      transform: scale(1.1);
    }
    #star-icon {
      transition: all 0.2s ease !important;
      transform-origin: center;
    }
    @keyframes speak-jump-fancy {
      0% {
        transform: scale(1.15) rotate(0deg);
        filter: drop-shadow(0 0 2px #38bdf8);
      }
      25% {
        transform: scale(1.3) rotate(-5deg);
        filter: drop-shadow(0 0 12px #38bdf8);
      }
      50% {
        transform: scale(1.1) rotate(5deg);
        filter: drop-shadow(0 0 5px #38bdf8);
      }
      75% {
        transform: scale(1.25) rotate(-3deg);
        filter: drop-shadow(0 0 10px #38bdf8);
      }
      100% {
        transform: scale(1.15) rotate(0deg);
        filter: drop-shadow(0 0 2px #38bdf8);
      }
    }
    @keyframes wave-ripple {
      0% {
        transform: translate(-50%, -50%) scale(0.8);
        opacity: 0.8;
        border-width: 2px;
      }
      100% {
        transform: translate(-50%, -50%) scale(2.5);
        opacity: 0;
        border-width: 1px;
      }
    }
    .speak-btn {
      position: relative;
      width: 32px;
      height: 32px;
      display: flex;
      margin-top: 4px;
      align-items: center;
      justify-content: center;
      z-index: 100;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      overflow: visible !important;
      vertical-align: sub;
    }
    .speak-btn svg {
      position: relative;
      z-index: 2;
      transition: stroke 0.3s ease;
    }
    .speak-btn.is-speaking {
      z-index: 101;
    }
    .speak-btn.is-speaking svg {
      animation: speak-jump-fancy 0.5s ease-in-out infinite;
      stroke: #ffffff !important; 
      filter: drop-shadow(0 0 5px #38bdf8);
    }
    .speak-btn.is-speaking::before,
    .speak-btn.is-speaking::after {
      content: "";
      position: absolute;
      top: 50%;transform: translate(-50%, -50%);
      left: 50%;
      width: 100%;
      height: 100%;
      border: 2px solid #38bdf8;
      border-radius: 50%;
      pointer-events: none;
      z-index: 1;
    }
    .speak-btn.is-speaking::before {
      animation: wave-ripple 1s cubic-bezier(0, 0, 0.2, 1) infinite;
    }
    .speak-btn.is-speaking::after {
      animation: wave-ripple 1s cubic-bezier(0, 0, 0.2, 1) infinite 0.5s;
    }
    .speak-btn:hover:not(.is-speaking) svg {
      filter: drop-shadow(0 0 8px #38bdf8);
      transform: scale(1.2);
    }
    .speak-btn::before,
    .speak-btn::after {
      pointer-events: none;
    }
    @keyframes logo-glow {
      0% {
        filter: drop-shadow(0 0 2px rgba(56, 189, 248, 0.5));
      }
      50% {
        filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.9));
      }
      100% {
        filter: drop-shadow(0 0 2px rgba(56, 189, 248, 0.5));
      }
    }
    #p-header img {
      animation: logo-glow 3s ease-in-out infinite;
    }
    .close-btn {
      padding: 8px; 
      cursor: pointer;
      font-size: 16px;
      font-weight: bold;
      color: #94a3b8;
      line-height: 1;
      transform: translateY(-2px);
      pointer-events: auto !important;
    }
    .close-btn:hover {
      filter: drop-shadow(0 0 5px rgba(239, 68, 68, 0.3));
      opacity: 1 !important;
      color: #f87171 !important;
      transform: rotate(90deg);
      transition: all 0.3s;
    }
    .close-btn:active {
      transform: scale(0.9);
    }
      `;
    shadow.appendChild(style);
    logoBtn = document.createElement('div');
    shadow.appendChild(logoBtn);
    logoBtn.className = 'eclipse-logo-btn';
    logoBtn.innerHTML = `<div class="glowing-icon" style="
  display: inline-block;
  width: 21px; 
  height: 21px; 
  border-radius: 4px;
  position: relative;
  box-shadow: 0 0 6px rgba(100, 180, 255, 0.7);
  animation: icon-glow 2s ease-in-out infinite;
  background: rgba(100, 180, 255, 0.1);
">
  <style>
    @keyframes icon-glow {
      0%, 100% { 
        box-shadow: 0 0 6px rgba(100, 180, 255, 0.7),
                    0 0 10px rgba(100, 180, 255, 0.4);
      }
      50% { 
        box-shadow: 0 0 10px rgba(120, 220, 255, 0.9),
                    0 0 16px rgba(100, 200, 255, 0.6);
      }
    }
  </style>
  <img src="${logoBase64}" style="
    width: 100%; 
    height: 100%; 
    border-radius: 2px;
    position: relative;
    z-index: 2;
    filter: brightness(1.2);  
  ">
</div>`;
    shadow.appendChild(logoBtn);
    const handleHide = () => {
      if (logoBtn && logoBtn.classList.contains('show')) {
        forceHideLogo();
      }
    };
    window.addEventListener('contextmenu', handleHide, true);
    popupEl = document.createElement('div');
    popupEl.className = 'panel';
    popupEl.style.cssText = "display:none; position:fixed; visibility:hidden; width:0; height:0;";
    popupEl.innerHTML = `
<div id="drag-zone" style="
        position: absolute; 
        top: 0; left: 0; right: 0; 
        height: 46px; 
        width: calc(100% - 110px);
        z-index: 1000000000; 
        cursor: grab;
    "></div>
    <div id="p-main-container">
<div class="header-controls">
<div id="p-theme-toggle" class="icon-btn theme" title="" style="margin-right: 0px;top: -6px;">
                <svg id="theme-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
                    </svg>
            </div>
    <div id="p-pin" class="icon-btn" title="${t('pinUnpin')}">
        <svg id="pin-icon" width="18" height="18" viewBox="0 0 24 28" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" style="transition: all 0.2s ease; display: block;">
      <path d="M21 10V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2"></path>
      <path d="M7 10v4a2 2 0 0 1-2 2 2 2 0 0 0 0 4h14a2 2 0 0 0 0-4 2 2 0 0 1-2-2v-4"></path>
      <line x1="12" y1="22" x2="12" y2="28"></line>
    </svg>
        </div>
        <div id="close-p" class="close-btn"
            style="cursor: pointer; font-size: 16px;font-weight:500px; color: #94a3b8; line-height: 1;margin-top:-9px">✕</div>
            </div>
        <div id="p-header-wrapper" style="pointer-events: auto;"></div>
        <div id="p-content-container" style="pointer-events: auto;"></div>
    </div>
    <div class="resizer" data-dir="t" style="position:absolute; top:-5px; left:10px; right:10px; height:10px; cursor:ns-resize; z-index:2147483647;"></div>
    <div class="resizer" data-dir="b" style="position:absolute; bottom:-5px; left:10px; right:10px; height:10px; cursor:ns-resize; z-index:2147483647;"></div>
    <div class="resizer" data-dir="l" style="position:absolute; left:-5px; top:10px; bottom:10px; width:10px; cursor:ew-resize; z-index:2147483647;"></div>
    <div class="resizer" data-dir="r" style="position:absolute; right:-7px; top:10px; bottom:10px; width:10px; cursor:ew-resize; z-index:2147483647;"></div>
    <div class="resizer" data-dir="tl" style="position:absolute; top:-8px; left:-8px; width:16px; height:16px; cursor:nwse-resize; z-index:2147483648;"></div>
    <div class="resizer" data-dir="tr" style="position:absolute; top:-8px; right:-8px; width:16px; height:16px; cursor:nesw-resize; z-index:2147483648;"></div>
    <div class="resizer" data-dir="bl" style="position:absolute; bottom:-8px; left:-8px; width:16px; height:16px; cursor:nesw-resize; z-index:2147483648;"></div>
    <div class="resizer" data-dir="br" style="position:absolute; bottom:-8px; right:-8px; width:16px; height:16px; cursor:nwse-resize; z-index:2147483648;"></div>
`;
    shadow.appendChild(popupEl);
    const saved = localStorage.getItem('eclipse-translator-settings');
    if (saved) {
      try {
        const { width, height } = JSON.parse(saved);
        popupEl.style.display = 'flex';
        popupEl.style.flexDirection = 'column';
        const finalMaxW = Math.min(parseInt(width), window.innerWidth * 0.9);
        const finalMaxH = Math.min(parseInt(height), window.innerHeight * 0.9);
        popupEl.style.maxWidth = finalMaxW + 'px';
        popupEl.style.maxHeight = finalMaxH + 'px';
        popupEl.style.width = 'fit-content';
        popupEl.style.maxWidth = width;
        popupEl.style.minWidth = '280px';
        popupEl.style.height = height;
        popupEl.style.maxHeight = height;
        popupEl.style.boxSizing = 'border-box';
      } catch (e) {
        logger.error('Failed to load saved settings', e);
      }
    }
    enablePanelResize(popupEl);
  }
  function setPanelGlowColor(panel) {
    if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
      return;
    }
    const bodyBg = window.getComputedStyle(document.body).backgroundColor;
    function getBrightness(rgb) {
      const match = rgb.match(/\d+/g);
      if (!match) return 0;
      const [r, g, b] = match.map(Number);
      return (r * 299 + g * 587 + b * 114) / 1000;
    }
    const brightness = getBrightness(bodyBg);
    if (brightness > 200) {
      panel?.style.setProperty('--glow-color', 'rgba(0, 150, 255, 1)');
    } else {
      panel?.style.setProperty('--glow-color', 'rgba(56,220,255,1)');
    }
  }
  const themeIcons = {
    auto: `<circle cx="12" cy="12" r="10" stroke-width="2.0"></circle>
       <path d="M12 2v20M2 12h20" stroke-opacity="0.3"></path>
       <path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"></path>`,
    light: `<circle cx="12" cy="12" r="5.5" stroke-width="2.0"></circle>
          <!-- 垂直光线  -->
          <path d="M12 1.5v2.5"></path>  <!-- 上 -->
          <path d="M12 20v2.5"></path>   <!-- 下 -->
          <!-- 水平光线  -->
          <path d="M1.5 12h2.5"></path>  <!-- 左 -->
          <path d="M20 12h2.5"></path>   <!-- 右 -->
          <!-- 对角线光线  -->
          <path d="m4.5 4.5 1.8 1.8"></path>    <!-- 左上↖-->
          <path d="m19.5 4.5-1.8 1.8"></path>   <!-- 右上↗ -->
          <path d="m4.5 19.5 1.8-1.8"></path>   <!-- 左下↙ -->
          <path d="m19.5 19.5-1.8-1.8"></path>  <!-- 右下↘ -->`,
    dark: `<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" stroke-width="2.0"></path>`
  };
  const getWebPageBrightness = () => {
    const bodyStyle = window.getComputedStyle(document.body);
    const htmlStyle = window.getComputedStyle(document.documentElement);
    let color = bodyStyle.backgroundColor;
    let source = "body";
    if (color === 'rgba(0, 0, 0, 0)' || color === 'transparent') {
      color = htmlStyle.backgroundColor;
      source = "html";
    }
    const rgb = color.match(/\d+/g);
    if (!rgb || rgb.length < 3) {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      return systemDark ? 'dark' : 'light';
    }
    const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
    const result = brightness < 128 ? 'dark' : 'light';
    return result;
  };
  const updateThemeUI = (mode, shadow, shadowHost) => {
    localStorage.setItem('eclipse-theme', mode);
    let appliedTheme = mode === 'auto' ? getWebPageBrightness() : mode;
    shadowHost.setAttribute('theme', appliedTheme);
    const themeBtn = shadow.getElementById('p-theme-toggle');
    const themeIconSvg = shadow.getElementById('theme-icon');
    if (themeBtn && themeIconSvg) {
      themeIconSvg.innerHTML = themeIcons[mode];
      const modeNames = {
        auto: t('autoTheme'),
        light: t('lightTheme'),
        dark: t('darkTheme')
      };
      themeBtn.title = modeNames[mode];
    }
  };
  async function renderAndShowPopup(text, pos, shadow, manualLang = 'auto') {
    const isPinnedNow = shadowHost.getAttribute('data-pinned') === 'true';
    const wordText = text.trim();
    const targetPrefix = (window.currentTargetL || "").toLowerCase().slice(0, 2);
    const isRTL = ['he', 'ar', 'fa'].includes(targetPrefix);
    const entry = await idb.vocabulary.get(wordText);
    const isSaved = !!(entry && !entry.deleted);
    popupEl.querySelector('#p-header-wrapper').innerHTML =
      `<div id="p-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
    <div style="display: flex; align-items: center; gap: 5px; user-select: none;">
        <img src="${logoBase64}"
            style="width: 23px; height: 23px; border-radius: 2px; filter: drop-shadow(0 0 4px var(--p-accent));">
        <div style="opacity: 0.6; font-size: 11px; font-weight: bold; letter-spacing: 2px; color: var(--p-text-main);font-style: italic;">${APP_NAME}
        </div>
    </div>
    <div style="display: flex; gap: 4px; align-items: center; height: 40px; position: relative; z-index: 30; right: -15px;">
        <div id="p-theme-toggle" class="icon-btn" title="">
            <svg id="theme-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            </svg>
        </div>
    </div>
   <div style="
    display: flex; 
    gap: 4px; 
    align-items: center; 
    height: 40px;      
    position: relative; 
    z-index: 30;       
    right: -15px;
">
    </div>
</div>`;
    const contentContainer = popupEl.querySelector('#p-content-container');
    const styleTag = document.createElement('style');
    styleTag.textContent = `
  .icon-btn {
    position: relative !important;
    width: 30px ;
    height: 30px ;
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none ;
    border-radius: 8px !important;  
    color: #94a3b8;
    cursor: pointer;
    padding: 0 !important;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    transform: scale(1.05);
    outline: none;
    flex-shrink: 0; 
    overflow: visible; 
  }
.icon-btn:not(.is-saved) svg {
    fill: none ;
    stroke: rgba(255,255,255,0.8) !important;
  }
  .icon-btn svg {
    display: block;
    pointer-events: none;
    stroke: var(--p-text-muted) !important;
    z-index: 1;
  }
 .icon-btn:hover svg {
  filter: drop-shadow(0 0 2px rgba(255, 215, 0, 0.5)); 
  transform: scale(1.2);
}
  .icon-btn:hover {
    transform: scale(1.2);
  }
 .icon-btn:not(.is-saved) svg {
    fill: none;
    stroke: var(--p-text-muted) !important;
}
    .icon-btn.theme svg#theme-icon {
    width: 16px !important;  
    height: 16px !important;
    stroke: var(--p-text-muted) !important; 
    fill: none !important;
    transition: stroke 0.3s ease, filter 0.3s ease, transform 0.3s ease !important;
    display: block !important;
    pointer-events: none;
}
.icon-btn.theme:hover {
    transform: scale(1.1) !important;
}
.icon-btn.theme:hover svg#theme-icon {
    stroke: #ffaa00a7 !important; 
    filter: drop-shadow(0 0 3px #ff7b00af) !important; 
    transform: scale(1.1) !important;
}
.icon-btn.theme:active {
    transform: scale(0.92) !important;
}
  #p-speak { color: #38bdf8; }
  #p-speak:hover {
    background: rgba(56, 189, 248, 0.2) !important;
    color: #38bdf8 !important; 
    box-shadow: 0 0 8px rgba(56, 189, 248, 0.4); 
  }
    #p-speak:hover svg {
    stroke: #38bdf8 !important;  
  }
  #p-save:hover { 
    background: rgba(250, 204, 21, 0.2) !important;
    color: #facc15 !important;
    box-shadow: 0 0 8px rgba(250, 204, 21, 0.4);
  }
  .is-saved { color: #facc15 !important; }
  .is-saved svg { fill: #facc15 !important; stroke: #facc15 !important; }
  #p-refresh:hover {
    background: rgba(34, 197, 94, 0.2) !important;
    color: #4ade80 !important;
    box-shadow: 0 0 8px rgba(34, 197, 94, 0.4);
  }
    #p-refresh:hover svg {
    stroke: #4ade80 !important; 
  }
  .spinning svg {
    animation: res-rotate 0.6s linear infinite;
}
@keyframes res-rotate {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
`;
    if (!shadow.querySelector('style#p-style')) {
      styleTag.id = 'p-style';
      shadow.appendChild(styleTag);
    }
    contentContainer.style.cssText = `
    display: block; 
    width: 100%; 
    box-sizing: border-box; 
    overflow-y: auto; 
    padding: 0 20px 15px 24px;
    direction: ${isRTL ? 'rtl' : 'ltr'};
    text-align: ${isRTL ? 'right' : 'left'};
`;
    contentContainer.innerHTML = `
<div style="line-height: 1.2;">
    <div style="display: block; line-height: 1.2;">
        <span id="p-query" style="
                font-size: 24px; 
                font-weight: 700; 
                color: var(--p-text-main);; 
                line-height: 1.2; 
                word-break: break-word; 
                overflow-wrap: break-word;
                display: inline; 
                vertical-align: middle;
            ">${text}</span>
        <div
            style="display: inline-flex; align-items: center; gap: 8px; margin-left: 10px;padding-top:6px; vertical-align: middle; white-space: nowrap;">
            <div id="p-speak" class="icon-btn speak-btn" title="${t('pronunciation')}" style="margin:0;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
            </div>
            <div id="p-save" class="icon-btn save-btn ${isSaved ? 'is-saved' : ''}" title="${isSaved ? t('uncollect') : t('collect')}" style="margin:0;">
    <svg id="star-icon" width="20" height="20" viewBox="0 0 24 24" 
         fill="${isSaved ? '#facc15' : 'none'}"
         stroke="${isSaved ? '#facc15' : 'rgba(255,255,255,0.8)'}" 
         stroke-width="1.5" stroke-linejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
    </svg>
</div>
            <div id="p-refresh" class="icon-btn refresh-btn" title="${t('retranslate')}" style="margin:0;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
                </svg>
            </div>
        </div>
    </div>
    <div id="p-phonetic"
        style="margin-top:6px; margin-left: 2px; color:var(--p-phonetic) ; font-size: 14px; opacity: 0.8; font-family: 'Lucida Sans Unicode', sans-serif;">
    </div>
    <div id="p-basic" class="basic" style="margin-top: 8px;">Loading...</div>
    <div id="p-detail" class="detail" style="display:none; margin-top: 10px;margin-bottom: 10px"></div>
    <div id="p-examples" style="display:none; margin-top: 12px;"></div>
    <div id="p-source" style="display:none; margin-top:10px; font-size:10px; opacity:0.35; text-align:right; letter-spacing:0.5px;"></div>
</div>`;
    popupEl.classList.remove('is-hidden');
    popupEl.style.display = 'flex';
    popupEl.style.width = 'fit-content';
    popupEl.style.height = 'auto';
    popupEl.style.minWidth = '280px';
    popupEl.style.minHeight = '100px';
    const saveBtnInit = shadow.getElementById('p-save');
    if (saveBtnInit) {
      saveBtnInit._miraReady = false;
      saveBtnInit._miraSnapshot = null;
    }
    const settings = JSON.parse(localStorage.getItem('eclipse-translator-settings') || '{}');
    if (settings.width) {
      popupEl.style.maxWidth = settings.width;
    } else {
      popupEl.style.maxWidth = '450px';
    }
    if (settings.height) {
      popupEl.style.maxHeight = settings.height;
    } else {
      popupEl.style.maxHeight = '85vh';
    }
    popupEl.style.visibility = 'visible';
    const pQuary = shadow.getElementById('p-query');
    if (!pQuary?.style) return;
    if (text.length > 100) {
      pQuary.style.fontSize = '12px';
      pQuary.style.lineHeight = '1.4';
    } else if (text.length > 40) {
      pQuary.style.fontSize = '14px';
      pQuary.style.lineHeight = '1.4';
    } else if (text.length > 10) {
      pQuary.style.fontSize = '16px';
      pQuary.style.lineHeight = '1.2';
    } else {
      pQuary.style.fontSize = '22px';
      pQuary.style.lineHeight = '1.2';
    }
    setPanelGlowColor(popupEl);
    if (!isPinnedNow) {
      const pWidth = popupEl.offsetWidth || 300;
      const pHeight = popupEl.offsetHeight || 200;
      let left = pos.clientX + 10;
      if (left + pWidth > window.innerWidth - 20) {
        left = window.innerWidth - pWidth - 20;
      }
      left = Math.max(10, left);
      let top = pos.clientY + 15;
      if (top + pHeight > window.innerHeight - 20) {
        top = pos.clientY - pHeight - 15;
      }
      top = Math.max(10, top);
      popupEl.style.left = left + 'px';
      popupEl.style.top = top + 'px';
      requestAnimationFrame(() => {
        clampPopupToViewport(popupEl);
      });
    }
    popupEl.style.visibility = 'visible';
    shadow.getElementById('close-p').onclick = (e) => {
      e.stopPropagation();
      shadowHost.setAttribute('data-pinned', 'false');
      popupEl.classList.add('is-hidden');
      setTimeout(() => {
        if (shadowHost.getAttribute('data-pinned') !== 'true') popupEl.style.display = 'none';
      }, 200);
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
    const pinBtn = shadow.getElementById('p-pin');
    if (!pinBtn) return;
    const updatePinUI = (state) => {
      shadowHost.setAttribute('data-pinned', state ? 'true' : 'false');
      if (state) {
        pinBtn.classList.add('is-pinned');
      } else {
        pinBtn.classList.remove('is-pinned');
      }
    };
    updatePinUI(isPinnedNow);
    pinBtn.onclick = (e) => {
      e.stopPropagation();
      const isNowPinned = shadowHost.getAttribute('data-pinned') === 'true';
      updatePinUI(!isNowPinned);
    };
    const speakBtn = shadow.getElementById('p-speak');
    speakBtn.onclick = (e) => {
      e.stopPropagation();
      speak(text, speakBtn);
    };
    const refreshBtn = shadow.getElementById('p-refresh');
    refreshBtn.onclick = async (e) => {
      e?.stopPropagation();
      if (refreshBtn?.classList.contains('spinning')) return;

      const coreText = text.trim()
        .replace(/[\s\n\r\t.,!?;:。，！？、・「」]/g, "")
        .toLowerCase();
      const textFingerprint = typeof hash === 'function' ? hash(coreText) : coreText.substring(0, 50);
      const allCache = await idb.getAll('tr_');
      const keysToRemove = Object.keys(allCache).filter(k => k.includes(textFingerprint));
      if (keysToRemove.length > 0) await Promise.all(keysToRemove.map(k => idb.remove(k)));

      const saveBtnRef = shadow.getElementById('p-save');
      if (saveBtnRef) saveBtnRef._miraReady = false;
      const basicEl = shadow.getElementById('p-basic');
      const phoneticEl = shadow.getElementById('p-phonetic');
      const detailEl = shadow.getElementById('p-detail');
      const examplesEl = shadow.getElementById('p-examples');
      if (!basicEl?.style) return;
      refreshBtn.classList.add('spinning');
      const originalBasic = basicEl.innerText;
      basicEl.innerHTML = `<span style="opacity:0.6; font-size:13px; font-style:italic;">${t('retranslate')}...</span>`;
      if (phoneticEl) phoneticEl.innerText = "";
      if (detailEl?.style) detailEl.style.display = 'none';
      if (examplesEl?.style) examplesEl.style.display = 'none';
      try {
        const newRes = await getDetailedTranslation(text, true, manualLang, {});
        if (newRes && !newRes.isError) {
          basicEl.style.color = "";
          basicEl.style.fontStyle = "normal";
          fillPopupData(newRes, shadow, text, manualLang);
        } else {
          const errorMsg = newRes?.basic || t('unknown_error');
          basicEl.innerText = `[${t('translate_failed')}: ${errorMsg}]`;
          basicEl.style.color = "#ff4d4f";
          basicEl.style.fontStyle = "italic";
        }
      } catch (err) {
        basicEl.innerText = `[${t('translate_failed')}: ${err.message || 'Network Error'}]`;
        basicEl.style.color = "#ff4d4f";
        basicEl.style.fontStyle = "italic";
      } finally {
        setTimeout(() => {
          refreshBtn?.classList.remove('spinning');
        }, 600);
      }
    };
    function fillPopupData(res, shadow, text, targetLang) {
      if (!shadow || !res) return;
      const escapeHtml = (str) => {
        if (typeof str !== 'string') return '';
        return str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      };
      const cleanMarker = (str) => {
        if (typeof str !== 'string') return str;
        return str.replace(/\[\[\d+\]\]\s*/g, '').trim();
      };
      const pPhonetic = shadow.getElementById('p-phonetic');
      if (pPhonetic) {
        pPhonetic.innerText = res.phonetic
          ? `/${res.phonetic.replace(/[\[\]\/]/g, '')}/`
          : "";
      }
      const pBasic = shadow.getElementById('p-basic');
      if (pBasic) {
        pBasic.innerText = cleanMarker(res.basic) || "";
      }
      const pD = shadow.getElementById('p-detail');
      if (pD?.style) {
        if (res.dictData?.length > 0 || res.wordForms?.length > 0 || res.prototype) {
          pD.style.display = 'block';

          let detailHtml = (res.dictData || []).map(i => {
            const localPos = escapeHtml(localizePos(i.pos, targetLang) || '');
            const cleanMeanings = (i.meanings || [])
              .map(m => escapeHtml(cleanMarker(m)))
              .join(', ');
            return `<div><b style="color:#319BCA; font-size:12px;margin-right:4px;">${localPos}</b> ${cleanMeanings}</div>`;
          }).join('');

          if (res.wordForms?.length > 0 || res.prototype) {
            let formsHtml = '';

            if (res.prototype) {
              formsHtml += `<span style="display:inline-flex;align-items:center;gap:4px;background:color-mix(in srgb, var(--p-accent) 8%, transparent);border:0.5px solid color-mix(in srgb, var(--p-accent) 40%, transparent);border-radius:6px;padding:3px 8px;font-size:12px;">
                <span style="color:var(--p-text-muted);font-size:11px;">原型</span>
                <span style="color:var(--p-accent);font-weight:500;">${escapeHtml(res.prototype)}</span>
            </span>`;
            }

            (res.wordForms || []).forEach(wf => {
              formsHtml += `<span style="display:inline-flex;align-items:center;gap:4px;background:color-mix(in srgb, var(--p-text-main) 5%, transparent);border:0.5px solid color-mix(in srgb, var(--p-border) 60%, transparent);border-radius:6px;padding:3px 8px;font-size:12px;">
                <span style="color:var(--p-text-muted);font-size:11px;">${escapeHtml(wf.name)}</span>
                <span style="color:var(--p-text-main);font-weight:500;">${escapeHtml(wf.value)}</span>
            </span>`;
            });

            detailHtml += `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">${formsHtml}</div>`;
          }

          pD.innerHTML = detailHtml;
        } else {
          pD.style.display = 'none';
        }
      }
      const saveBtn = shadow.getElementById('p-save');
      if (saveBtn) {
        saveBtn._miraSnapshot = {
          word: text,
          basic: res.basic || "",
          phonetic: res.phonetic || "",
          dictData: res.dictData || [],
          examples: res.examples || [],
          prototype: res.prototype || null
        };
        saveBtn._miraReady = true;
      }
      const pE = shadow.getElementById('p-examples');
      if (pE?.style) {
        if (res.examples?.length > 0) {
          pE.style.display = 'block';
          const safeText = (text || "").replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b(${safeText})\\b`, 'gi');
          const rtl = typeof isRTL !== 'undefined' ? isRTL : false;
          pE.innerHTML = `<div style="font-size:9px; opacity:0.5; margin-bottom:10px; font-weight:bold; letter-spacing:1px;">EXAMPLES</div>` +
            res.examples.slice(0, 3).map(s => {
              let en = typeof s === 'string' ? s : (s.en || s.sentence || "");
              let cn = typeof s === 'object' ? (s.cn || s.translation || "") : "";
              en = escapeHtml(cleanMarker(en));
              cn = escapeHtml(cleanMarker(cn));
              const highlightedEn = en.replace(regex, `<span style="color: #38BDF8; font-weight: 600;">$1</span>`);
              return `<div class="ex-item" style="margin-bottom: 10px; direction: ${rtl ? 'rtl' : 'ltr'}; text-align: ${rtl ? 'right' : 'left'};">
            <div class="ex-en" style="font-style: italic; line-height: 1.4;">${highlightedEn}</div>
            <div class="ex-cn" style="font-style: italic; opacity: 0.9; font-size: 12px;">${cn}</div>
          </div>`;
            }).join('');
        } else {
          pE.style.display = 'none';
        }
      }

      const pSource = shadow.getElementById('p-source');
      if (pSource) {
        if (res.source) {
          pSource.style.display = 'block';
          pSource.innerText = `Source: ${res.source}`;
        } else {
          pSource.style.display = 'none';
        }
      }
    }
    shadow.getElementById('p-save').onclick = async (e) => {
      e.stopPropagation();
      const saveBtn = shadow.getElementById('p-save');
      if (!saveBtn) return;
      if (!saveBtn._miraReady) {
        saveBtn.style.animation = 'none';
        saveBtn.title = typeof t === 'function' ? t('loading') : 'Loading...';
        setTimeout(() => {
          saveBtn.title = typeof t === 'function' ? t('collect') : 'Collect';
        }, 1000);
        return;
      }
      const star = shadow.getElementById('star-icon');
      const wordText = text.trim();
      const wordLower = wordText.toLowerCase();
      const dbKey = `vb_${wordLower}`;
      const now = Date.now();
      const currentUrl = window.location.href;
      const currentTitle = document.title;
      const cleanText = (str) => {
        if (!str) return "";
        return str.replace(/\[\[\d+\]\]/g, '').trim();
      };
      let fullTranslation = null;
      const snapshot = saveBtn._miraSnapshot;
      const isSnapshotMatched = snapshot && snapshot.word?.toLowerCase().trim() === wordLower;
      if (isSnapshotMatched) {
        fullTranslation = {
          basic: cleanText(snapshot.basic),
          phonetic: snapshot.phonetic,
          dictData: snapshot.dictData
        };
      }
      else {
        const lastWordMatched = lastTranslationResult &&
          lastTranslationResult.word?.toLowerCase().trim() === wordLower;
        if (lastWordMatched) {
          fullTranslation = {
            basic: cleanText(lastTranslationResult.basic || ""),
            phonetic: lastTranslationResult.phonetic || "",
            dictData: lastTranslationResult.dictData || []
          };
        } else {
          fullTranslation = {
            basic: cleanText(shadow.getElementById('p-basic')?.innerText || ""),
            phonetic: shadow.getElementById('p-phonetic')?.innerText || "",
            dictData: []
          };
        }
      }
      let existingEntry = await idb.vocabulary.get(dbKey);
      if (!existingEntry) {
        existingEntry = await idb.vocabulary.get(wordText);
      }
      let isActive = false;
      let entryToSave = null;
      if (existingEntry) {
        if (!existingEntry.deleted) {
          entryToSave = { ...existingEntry, deleted: true, updated: now };
          isActive = false;
        } else {
          entryToSave = {
            ...existingEntry,
            word: wordText,
            trans: fullTranslation,
            src: currentUrl,
            title: currentTitle,
            deleted: false,
            updated: now,
            date: now
          };
          isActive = true;
        }
      } else {
        entryToSave = {
          id: crypto.randomUUID(),
          word: wordText,
          trans: fullTranslation,
          src: currentUrl,
          title: currentTitle,
          date: now,
          updated: now,
          deleted: false,
          lv: 0
        };
        isActive = true;
      }
      await idb.set({ [dbKey]: entryToSave });
      if (isActive) {
        saveBtn.classList.add('is-saved');
        saveBtn.title = (typeof t === 'function' ? t('uncollect') : "Uncollect");
        star.setAttribute('fill', '#facc15');
        star.setAttribute('stroke', '#facc15');
      } else {
        saveBtn.classList.remove('is-saved');
        saveBtn.title = (typeof t === 'function' ? t('collect') : "Collect");
        star.setAttribute('fill', 'none');
        star.setAttribute('stroke', 'rgba(255,255,255,0.8)');
      }
    };
    const dragZone = shadow.getElementById('drag-zone');
    const header = shadow.getElementById('p-header');
    const startDrag = (e) => {
      if (e.target.closest('.icon-btn')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const r = popupEl.getBoundingClientRect();
      initialX = r.left;
      initialY = r.top;
      e.preventDefault();
    };
    dragZone.onmousedown = startDrag;
    header.onmousedown = startDrag;
    const themeBtn = shadow.getElementById('p-theme-toggle');
    themeBtn.onclick = (e) => {
      e.stopPropagation();
      let nextMode;
      const currentStored = localStorage.getItem('eclipse-theme') || 'auto';
      if (currentStored === 'light') nextMode = 'auto';
      else if (currentStored === 'auto') nextMode = 'dark';
      else if (currentStored === 'dark') nextMode = 'light';
      else nextMode = 'auto';
      updateThemeUI(nextMode, shadow, shadowHost);
    };
    const initialMode = localStorage.getItem('eclipse-theme') || 'auto';
    updateThemeUI(initialMode, shadow, shadowHost);
    const basicEl = shadow?.getElementById('p-basic');
    if (!basicEl?.style) return;
    try {
      const res = await getDetailedTranslation(text, false, manualLang, {});
      if (res && !res.isError) {
        basicEl.style.color = "";
        basicEl.style.fontStyle = "normal";
        fillPopupData(res, shadow, text, manualLang);
      } else {
        const errorMsg = res?.basic || "未知错误";
        basicEl.innerText = `[Error: ${errorMsg}]`;
        basicEl.style.color = "#ff4d4f";
        basicEl.style.fontStyle = "italic";
      }
    } catch (err) {
      basicEl.innerText = `[Error: ${err.message || '网络异常'}]`;
      basicEl.style.color = "#ff4d4f";
      basicEl.style.fontStyle = "italic";
    } finally {
      if (typeof popupEl !== 'undefined' && popupEl) {
        requestAnimationFrame(() => {
          if (typeof clampPopupToViewport === 'function') {
            clampPopupToViewport(popupEl);
          }
        });
      }
    }
  }
  //小按钮
  let logoCenter = null;
  const setImportantStyle = (el, props) => {
    for (const [prop, val] of Object.entries(props)) {
      el.style.setProperty(prop, val, 'important');
    }
  };
  function forceHideLogo() {
    if (logoBtn) {
      logoBtn.classList?.remove('show');
      if (typeof setImportantStyle === 'function') {
        setImportantStyle(logoBtn, {
          'opacity': '0',
          'transform': 'scale(0.8)',
          'pointer-events': 'none'
        });
      }
    }
    setTimeout(() => {
      if (logoBtn && !logoBtn.classList?.contains('show')) {
        logoBtn.style?.setProperty('display', 'none', 'important');
      }
    }, 200);
    logoCenter = null;
  }
  window.addEventListener('mousemove', (e) => {
    if (logoBtn && logoBtn.classList.contains('show') && logoCenter) {
      const dx = e.clientX - logoCenter.x;
      const dy = e.clientY - logoCenter.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 70) {
        forceHideLogo();
      }
    }
    if (typeof isDragging !== 'undefined' && isDragging && popupEl) {
      popupEl.style.left = (initialX + (e.clientX - startX)) + 'px';
      popupEl.style.top = (initialY + (e.clientY - startY)) + 'px';
      if (typeof clampPopupToViewport === 'function') clampPopupToViewport(popupEl);
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
  window.addEventListener('mouseup', (e) => {
    if (typeof isDragging !== 'undefined') isDragging = false;
    if (e.button === 2 || (typeof isSelectEnabled !== 'undefined' && !isSelectEnabled)) return;
    if (shadowHost && e.composedPath().includes(shadowHost)) return;
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    setTimeout(async () => {
      const selection = getSmartSelection();
      if (!selection) return;
      const text = selection.toString().trim();
      if (!text || text.length > 1000) return;
      const targetLang = window.currentTargetL || navigator.language || 'en';
      const isAlreadyTarget = detectIsAlreadyTarget(text, targetLang);
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
        const isMouseInside = mouseX >= rect.left && mouseX <= rect.right &&
          mouseY >= rect.top && mouseY <= rect.bottom;
        if (isMouseInside) {
          l = mouseX + 10;
          t = mouseY - 32;
        }
      }
      const btnSize = 32;
      l = Math.max(10, Math.min(l, window.innerWidth - btnSize - 10));
      t = Math.max(10, Math.min(t, window.innerHeight - btnSize - 10));
      logoBtn.style.left = l + 'px';
      logoBtn.style.top = t + 'px';
      logoBtn.style.setProperty('display', 'flex', 'important');
      setImportantStyle(logoBtn, {
        'transition': 'transform 0.1s ease-out, opacity 0.1s ease',
        'transform': 'scale(1)',
        'opacity': '1',
        'pointer-events': 'auto',
        'position': 'fixed',
        'z-index': '2147483647'
      });
      logoCenter = { x: l + 16, y: t + 16 };
      logoBtn.classList.add('show');
      clearTimeout(window.logoAutoTimer);
      window.logoAutoTimer = setTimeout(() => {
        forceHideLogo();
      }, 3000);
      logoBtn.onmouseenter = async () => {
        forceHideLogo();
        const storage = await safeGetStorage(['targetLanguage']);
        const currentTarget = storage?.targetLanguage || navigator.language || 'zh-CN';
        let finalQuery = text;
        const hasHan = /[\u4e00-\u9fa5]/.test(text);
        const hasEn = /[a-zA-Z]/.test(text);
        const hasJa = LANGUAGE_PATTERNS['ja']?.test(text);
        if (hasHan && hasEn && !hasJa) {
          const zhChars = text.match(/[\u4e00-\u9fa5]/g) || [];
          const enChars = text.match(/[a-zA-Z]/g) || [];
          if (enChars.length > zhChars.length) {
            finalQuery = text.replace(/[\u4e00-\u9fa5]/g, '').trim();
          }
        }
        await renderAndShowPopup(
          finalQuery,
          { clientX: mouseX, clientY: mouseY },
          shadowHost.shadowRoot,
          currentTarget
        );
      };
    }, 150);
  });
  document.addEventListener('mousedown', (e) => {
    if (shadowHost && e.composedPath().includes(shadowHost)) return;
    forceHideLogo();
    if (shadowHost && shadowHost.getAttribute('data-pinned') !== 'true' && typeof popupEl !== 'undefined') {
      window.speechSynthesis?.cancel();
      if (popupEl) popupEl.classList.add('is-hidden');
      setTimeout(() => { popupEl.style.display = 'none'; }, 200);
    }
  });
  document.addEventListener('contextmenu', forceHideLogo, true);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && popupEl?.style.display !== 'none') {
      window.speechSynthesis?.cancel();
      if (popupEl) popupEl.classList.add('is-hidden');
      setTimeout(() => {
        if (popupEl) popupEl.style.display = 'none';
      }, 200);
      window.getSelection()?.removeAllRanges();
    }
  }, true);
  //小按钮相关逻辑结束----------
}

//yt
let fullSubtitleData = [];
let semanticGroups = [];
lastSubIndex = -1;
let lastDataLength = 0;
window.addEventListener('KT_DATA_READY', (e) => {
  fullSubtitleData = e.detail;
  if (typeof fastMemoryCache !== 'undefined') fastMemoryCache.clear();
  if (typeof pendingRequests !== 'undefined') pendingRequests.clear();
  const engine = window.currentConfig?.selectedEngine || getRuntimeDefaultEngine();
  const isAI = AI_LLM_WHITE_LIST.includes(engine);
  semanticGroups = mergeToSemantic(fullSubtitleData, isAI);
  lastDataLength = fullSubtitleData.length;
  if (semanticGroups.length > 0) {
    setTimeout(() => {
      batchPrefetch(0);
    }, 200);
  }
});
(function initVideoResetListener() {
  const video = document.querySelector('video');
  if (!video) {
    setTimeout(initVideoResetListener, 500);
    return;
  }
  video.addEventListener('emptied', () => {
    fullSubtitleData = [];
    semanticGroups = [];
    lastSubIndex = -1;
    lastDataLength = 0;
    if (typeof fastMemoryCache !== 'undefined') fastMemoryCache.clear();
    if (typeof pendingRequests !== 'undefined') pendingRequests.clear();
    const box = document.getElementById('kt-yt-box');
    const oEl = document.getElementById('yt-o');
    const tEl = document.getElementById('yt-t');
    if (box) {
      box.style.opacity = '0';
      box.style.visibility = 'hidden';
    }
    if (oEl) oEl.innerHTML = '';
    if (tEl) tEl.innerText = '';
    if (tEl) tEl.classList.remove('kt-loading');
  });
})();

//断句
function mergeToSemantic(data, isAI = false) {
  if (!data || data.length === 0) return [];
  const groups = [];
  let temp = null;
  const cjkRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/;
  const isCJK = cjkRegex.test(data[0]?.text || "");
  const isEnglish = !isCJK;
  const LIMITS = isAI ? {
    MAX_CHARS: 150,
    MIN_CHARS_PAUSE: 80,
    PAUSE_GAP: 1.5,
    FORCE_CUT: 210
  } : {
    MAX_CHARS: 120,
    MIN_CHARS_PAUSE: 80,
    PAUSE_GAP: 1.2,
    FORCE_CUT: 180
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
      groups.push({ start: startTime, text: currentRawText, end: startTime + durTime });
      return;
    }
    if (!temp) {
      temp = { start: startTime, text: currentRawText, end: startTime + durTime };
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
    }
    else if (isCJK) {
      if (/[。？！?!]$/.test(trimmedText) && charCount > 15) { shouldBreak = true; breakReason = "Punc"; }
      else if (charCount > LIMITS.MAX_CHARS) { shouldBreak = true; breakReason = "Max"; }
      else if (charCount > LIMITS.MIN_CHARS_PAUSE && safeGap > LIMITS.PAUSE_GAP) { shouldBreak = true; breakReason = "Pause"; }
    }
    else if (isEnglish) {
      const words = trimmedText.split(/\s+/);
      const lastWord = words.at(-1)?.toLowerCase().replace(/[^a-z]/g, "") || "";
      const protectionList = [
        "the", "a", "an", "and", "or", "but", "if", "because", "so",
        "of", "to", "in", "at", "with", "for", "as", "on", "by",
        "is", "was", "were", "are", "be", "been", "that", "which", "who",
        "my", "your", "his", "her", "their", "our", "its"
      ];
      const isHanging = protectionList.includes(lastWord) ||
        /\b(how|why|what|when|where|who|like|than)\b\s*$/i.test(trimmedText);
      const dynamicPauseGap = isHanging ? (LIMITS.PAUSE_GAP * 2) : LIMITS.PAUSE_GAP;
      const endsWithSentencePunc = /[.?!]["']?\s*$/.test(trimmedText);
      const minPuncLen = isAI ? 70 : 40;
      if (endsWithSentencePunc && charCount > minPuncLen && !isHanging) {
        shouldBreak = true; breakReason = "Full Sentence";
      }
      else if (charCount > LIMITS.MIN_CHARS_PAUSE && safeGap > dynamicPauseGap && !isHanging) {
        shouldBreak = true; breakReason = "Semantic Breath";
      }
      else if (charCount > LIMITS.FORCE_CUT) {
        shouldBreak = true; breakReason = "Visual Hard Cap";
      }
    }
    if (shouldBreak) {
      if (nextStart !== null) {
        const timeUntilNext = nextStart - temp.end;
        if (timeUntilNext > 0) {
          const MAX_EXTENSION = 2.5;
          const buffer = 0.05;
          const extendDuration = Math.min(timeUntilNext - buffer, MAX_EXTENSION);
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
if (!document.getElementById('mira-global-style')) {
  const style = document.createElement('style');
  style.id = 'mira-global-style';
  style.innerHTML = `
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
    content = content.replace(/^⟦KT_\d+⟧\s*/, '');
    content = content.replace(/\n+/g, ' ').trim();
    content = content.replace(/^[:：]\s*/, '').replace(/["”]$|^["“]/g, '');
    map[index] = content;
  }
  return map;
}
async function batchPrefetch(startIndex) {
  const now = Date.now();
  if (now - lastBatchTime < BATCH_GAP) return;
  lastBatchTime = now;
  const windowStart = Math.max(0, startIndex - 2);
  const windowEnd = startIndex + PREFETCH_AHEAD;
  const slice = semanticGroups.slice(windowStart, windowEnd);
  if (!slice.length) return;
  const activeCfg = window.currentConfig?.activeConfig || {};
  const engine = activeCfg.engine || window.currentConfig?.selectedEngine || getRuntimeDefaultEngine();
  let lang = window.currentConfig?.targetLanguage || navigator.language || 'zh-CN';
  lang = lang.replace('_', '-').toLowerCase();
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
      key: fullKey
    });
  }
  if (itemsToTranslate.length === 0) return;
  const MAX_CHUNK_SIZE = 5;
  const MAX_CHAR_COUNT = 800;
  let currentChunk = [];
  let currentLength = 0;
  const processChunk = async (chunk) => {
    if (!chunk.length) return;
    chunk.forEach(item => pendingRequests.add(item.key));
    const textPayload = chunk.map(item => `⟦KT_${item.absoluteIndex}⟧ ${item.text}`).join('\n');
    try {
      const res = await getDetailedTranslation(textPayload);
      if (res?.basic) {
        const split = splitBatchTranslation(res.basic);
        chunk.forEach(item => {
          if (split[item.absoluteIndex]) {
            fastMemoryCache.set(item.key, { basic: split[item.absoluteIndex] });
          }
        });
      }
    } catch (e) {
      logger.warn("Chunk Translation Failed:", e);
      chunk.forEach(item => pendingRequests.delete(item.key));
    } finally {
      chunk.forEach(item => pendingRequests.delete(item.key));
    }
  };
  for (const item of itemsToTranslate) {
    const itemLen = item.text.length;
    if (currentChunk.length >= MAX_CHUNK_SIZE || (currentLength + itemLen) > MAX_CHAR_COUNT) {
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
function syncSubtitleDisplay() {
  const video = document.querySelector('video');
  const player = document.querySelector('.html5-video-player');
  const box = document.getElementById('kt-yt-box');
  const enabled = (typeof isYTEnabled === 'undefined') ? true : isYTEnabled;
  refreshIcon();
  const ccOn = (typeof isYoutubeCaptionOn === 'function') ? isYoutubeCaptionOn() : true;
  const shouldShow = enabled && ccOn;
  if (!shouldShow) {
    if (box) box.style.display = 'none';
    const tooltip = document.getElementById('kt-word-tooltip');
    if (tooltip && tooltip.style.display !== 'none') {
      tooltip.style.display = 'none';
      if (video && video.paused && !isVideoManuallyPaused) video.play();
    }
    if (player) player.classList.remove('kt-enabled');
    return;
  }
  if (player && !document.getElementById('kt-yt-box')) createSubtitleBox(player);
  if (player) {
    const shouldBeEnabled = (typeof isYTEnabled !== 'undefined' ? isYTEnabled : true) && ccOn;
    const box = document.getElementById('kt-yt-box');
    if (box) box.style.display = shouldBeEnabled ? 'flex' : 'none';
    if (shouldBeEnabled && !player.classList.contains('kt-enabled')) {
      player.classList.add('kt-enabled');
    } else if (!shouldBeEnabled && player.classList.contains('kt-enabled')) {
      player.classList.remove('kt-enabled');
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
    if (box) { box.style.opacity = '0'; box.style.visibility = 'hidden'; }
    return;
  }
  const now = video.currentTime;
  const currentIndex = semanticGroups.findIndex(g => now >= (g.start - 0.2) && now <= (g.end + 0.5));
  if (box) {
    if (currentIndex === -1) {
      box.style.opacity = '0'; box.style.pointerEvents = 'none';
    } else {
      box.style.opacity = '1'; box.style.pointerEvents = 'auto'; box.style.visibility = 'visible';
    }
  }
  if (currentIndex !== -1) {
    const group = semanticGroups[currentIndex];
    const tEl = document.getElementById('yt-t');
    const oEl = document.getElementById('yt-o');
    const activeCfg = window.currentConfig?.activeConfig || {};
    const currentEngine = activeCfg.engine || window.currentConfig?.selectedEngine || getRuntimeDefaultEngine();
    const currentTargetL = window.currentConfig?.targetLanguage || navigator.language || 'zh-CN';
    const cacheKey = getCacheKey(group.text, currentEngine, currentTargetL);
    const isAI = AI_LLM_WHITE_LIST.includes(currentEngine);
    const isBing = currentEngine === 'bing';
    const isBatchEngine = isAI || isBing;
    if (currentIndex !== lastSubIndex) {
      if (typeof closeTooltipAndResume === 'function') closeTooltipAndResume();
      lastSubIndex = currentIndex;
      let cached = (typeof fastMemoryCache !== 'undefined') ? fastMemoryCache.get(cacheKey) : null;
      if (!cached && !isAI && typeof fastMemoryCache !== 'undefined') {
        const fingerprint = cacheKey.substring(cacheKey.indexOf('_', 3));
        const aiHit = AI_LLM_WHITE_LIST.find(ai => fastMemoryCache.has(`tr_${ai}${fingerprint}`));
        if (aiHit) {
          cached = fastMemoryCache.get(`tr_${aiHit}${fingerprint}`);
          fastMemoryCache.set(cacheKey, cached);
        }
      }
      if (oEl) renderWords(group.text, oEl);
      if (tEl) {
        if (cached && cached.basic) {
          tEl.innerText = cached.basic;
          tEl.classList.remove('kt-loading');
        } else {
          if (isBatchEngine) {
            tEl.innerText = '...';
            tEl.classList.add('kt-loading');
            const thisRequestIndex = currentIndex;
            setTimeout(async () => {
              const currentTEl = document.getElementById('yt-t');
              if (lastSubIndex === thisRequestIndex && currentTEl?.classList.contains('kt-loading')) {
                logger.log("批量预取超时/失败，触发单句强制补漏...");
                try {
                  const res = await getDetailedTranslation(group.text);
                  if (lastSubIndex === thisRequestIndex && res?.basic) {
                    currentTEl.innerText = res.basic;
                    currentTEl?.classList.remove('kt-loading');
                    fastMemoryCache.set(cacheKey, res);
                  }
                } catch (e) {
                  if (currentTEl) currentTEl.innerText = "Translation Error";
                  logger.error("Fallback failed:", e);
                }
              }
            }, 3000);
          } else {
            tEl.innerText = typeof t === 'function' ? t('loading') : 'Translating...';
            tEl?.classList.add('kt-loading');
            getDetailedTranslation(group.text).then(res => {
              if (!res || res.isPending || !res.basic) return;
              if (typeof fastMemoryCache !== 'undefined') fastMemoryCache.set(cacheKey, res);
              if (lastSubIndex === currentIndex) {
                const innerTEl = document.getElementById('yt-t');
                if (innerTEl) {
                  innerTEl.innerText = res.basic;
                  innerTEl.classList.remove('kt-loading');
                }
              }
            }).catch(() => { });
          }
        }
      }
      batchPrefetch(currentIndex);
    } else {
      if (tEl && tEl.classList.contains('kt-loading')) {
        const cached = (typeof fastMemoryCache !== 'undefined') ? fastMemoryCache.get(cacheKey) : null;
        if (cached && cached.basic) {
          tEl.innerText = cached.basic;
          tEl.classList.remove('kt-loading');
        }
      }
    }
  } else if (currentIndex === -1 && lastSubIndex !== -1) {
    lastSubIndex = -1;
    if (box) { box.style.opacity = '0'; box.style.visibility = 'hidden'; }
  }
}
if (window.ktDisplayTimer) clearInterval(window.ktDisplayTimer);
window.ktDisplayTimer = setInterval(syncSubtitleDisplay, 100);
async function createSubtitleBox(player) {
  const box = document.createElement('div');
  box.id = 'kt-yt-box';
  box.innerHTML = `
      <div id="yt-o">Loading...</div>
      <div id="yt-t"></div>
  `;
  player.appendChild(box);
  try {
    const data = await safeGetStorage(['ytBoxBottom', 'ytStyleSettings']);
    if (!data) return;
    if (data.ytBoxBottom && parseInt(data.ytBoxBottom) > 10) {
      box.style.bottom = data.ytBoxBottom;
    } else {
      box.style.bottom = '20px';
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
  box.addEventListener('mousedown', (e) => {
    if (e.target.closest('.kt-word') || e.target.closest('.icon-btn')) return;
    isDragging = true;
    startY = e.clientY;
    const rawBottom = parseInt(box.style.bottom);
    startBottom = isNaN(rawBottom) ? 80 : rawBottom;
    box.classList.add('dragging');
    document.body.style.cursor = 'grab';
    box.style.top = 'auto';
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaY = startY - e.clientY;
    const targetBottom = startBottom + deltaY;
    const videoPlayer = document.querySelector('.html5-video-player');
    const maxHeight = videoPlayer ? videoPlayer.offsetHeight * 0.9 : window.innerHeight * 0.8;
    const currentBottom = Math.max(0, Math.min(targetBottom, maxHeight));
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      box.style.bottom = `${currentBottom}px`;
      rafId = null;
    });
  });
  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      box.classList.remove('dragging');
      document.body.style.cursor = 'default';
      chrome.storage.local.set({ ytBoxBottom: box.style.bottom });
    }
  });
}
function initSubtitleAvoidance() {
  if (window._ktAvoidanceInit) return;
  window._ktAvoidanceInit = true;
  const AVOID_THRESHOLD = 150;
  const AVOID_OFFSET = 55;
  let isAvoiding = false;
  function getBox() { return document.getElementById('kt-yt-box'); }
  function isControlsVisible() {
    const player = document.querySelector('.html5-video-player');
    if (!player) return false;
    return !player.classList.contains('ytp-autohide');
  }
  function applyAvoidance() {
    const box = getBox();
    if (!box || isAvoiding || box.classList.contains('dragging')) return;
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
    isAvoiding = false;
    box.style.transform = `translateX(-50%) translateY(0px)`;
  }
  const player = document.querySelector('.html5-video-player');
  if (!player) return;
  new MutationObserver(() => {
    if (getBox()?.classList.contains('dragging')) return;
    isControlsVisible() ? applyAvoidance() : removeAvoidance();
  }).observe(player, { attributes: true, attributeFilter: ['class'] });
  player.addEventListener('mouseleave', removeAvoidance);
  window.addEventListener('mouseup', () => {
    requestAnimationFrame(() => {
      isControlsVisible() ? applyAvoidance() : removeAvoidance();
    });
  });
}
setTimeout(initSubtitleAvoidance, 2000);
function renderWords(text, container) {
  if (!container) return;
  container.innerHTML = '';
  const cjkRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/;
  const isCJK = cjkRegex.test(text);
  let words;
  if (isCJK) {
    words = text.match(/[\u4e00-\u9fa5]+|[\u3040-\u309f]+|[\u30a0-\u30ff]+|[a-zA-Z0-9']+|[^\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff\s]/g) || [];
  } else {
    words = text.split(/(\s+)/);
  }
  words.forEach(word => {
    const trimmed = word.trim();
    if (trimmed.length > 0) {
      const span = document.createElement('span');
      span.className = 'kt-word';
      span.innerText = word;
      if (isCJK) {
        span.style.margin = '0 0.5px';
        span.style.display = 'inline-block';
      }
      span.onmouseenter = (e) => { if (typeof handleWordMouseEnter === 'function') handleWordMouseEnter(e, trimmed); };
      span.onmouseleave = (e) => { if (typeof handleWordMouseLeave === 'function') handleWordMouseLeave(e); };
      span.ondblclick = (e) => { if (typeof handleWordDblClick === 'function') handleWordDblClick(e, trimmed); };
      span.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        const cleanWord = trimmed.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()。、？！「」]/g, "");
        if (typeof speak === 'function') speak(cleanWord, span);
        const originalColor = span.style.color;
        span.style.color = '#facc15';
        setTimeout(() => span.style.color = originalColor || '', 200);
      };
      container.appendChild(span);
    } else if (!isCJK) {
      container.appendChild(document.createTextNode(word));
    }
  });
}
function applySubtitleSettings(settings) {
  const box = document.getElementById('kt-yt-box');
  if (!box) return;
  const config = {
    fontSize: settings.fontSize || 25,
    color: settings.color || '#38bdf8',
    bgOpacity: settings.bgOpacity ?? 0.55,
    textShadow: settings.textShadow ?? '2px 2px 4px black',
    ...settings
  };
  box.style.setProperty('--kt-trans-size', `${config.fontSize}px`);
  box.style.setProperty('--kt-trans-color', config.color);
  box.style.setProperty('--kt-bg-rgba', `rgba(0, 0, 0, ${config.bgOpacity})`);
  box.style.setProperty('--kt-origin-size', `${config.fontSize * 0.85}px`);
  box.style.transition = 'opacity 0.2s ease-in-out, background 0.3s, transform 0.3s ease-out';
}
let isVideoManuallyPaused = false;
let currentHoveredElement = null;
async function handleWordMouseEnter(e, word) {
  currentHoveredElement = e.target;
  const oldTooltip = document.getElementById('kt-word-tooltip');
  if (oldTooltip) oldTooltip.style.display = 'none';
  const video = document.querySelector('video');
  if (video) {
    isVideoManuallyPaused = video.paused;
    if (!video.paused) video.pause();
  }
  e.target.style.background = 'rgba(56, 189, 248, 0.4)';
  e.target.style.borderRadius = '4px';
  const cleanWord = word.trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim();
  if (!cleanWord) return;
  const [entry, storage] = await Promise.all([
    idb.vocabulary.get(cleanWord),
    safeGetStorage(['targetLanguage'])
  ]);
  const currentLang = storage?.targetLanguage || navigator.language || 'zh-CN';
  const isCollected = !!(entry && entry.deleted === false);
  let tooltip = document.getElementById('kt-word-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'kt-word-tooltip';
    tooltip.style.cssText = `
            position: fixed; z-index: 2147483647; background: #1e293b !important; 
            color: white !important; padding: 10px 14px; border-radius: 8px; 
            font-size: 14px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            pointer-events: none; max-width: 240px; line-height: 1.5;
            display: none; flex-direction: column;
            box-sizing: border-box;
            transition: top 0.15s ease-out;
            border: 1px solid #334155;
        `;
    const moviePlayer = document.querySelector('.html5-video-player') || document.body;
    moviePlayer.appendChild(tooltip);
  }
  tooltip.style.border = isCollected ? '2px solid #facc15' : '1px solid #334155';
  const tipText = isCollected ? t('alreadyAddedFeedback') : t('hintAddAction');
  const tipColor = isCollected ? '#facc15' : '#94a3b8';
  tooltip.innerHTML = `
        <div id="kt-word-def" data-status="loading" style="color:#94a3b8">Loading...</div>
        <div id="kt-word-tip" style="font-size: 11px; color: ${tipColor}; border-top: 1px solid #334155; padding-top: 4px; margin-top: 4px; white-space: normal; word-break: break-word;">
            ${tipText}
        </div>
    `;
  tooltip.style.display = 'flex';
  tooltip.style.visibility = 'visible';
  repositionTooltip(tooltip, e.target);
  try {
    const res = await getDetailedTranslation(cleanWord, false, currentLang);
    const defEl = tooltip.querySelector('#kt-word-def');
    if (res && defEl) {
      const phoneticStr = res.phonetic ? `<span style="font-size: 11px; color: #94a3b8; font-weight: normal; margin-left: 8px;">[${res.phonetic}]</span>` : '';
      let dictHtml = '';
      if (res.dictData && res.dictData.length > 0) {
        dictHtml = res.dictData.map(i => {
          const meaningsStr = Array.isArray(i.meanings) ? i.meanings.join(', ') : (i.meanings || "");
          const localizedPos = localizePos(i.pos, currentLang);
          return `
                        <div style="margin-top: 4px; display: flex; align-items: flex-start; gap: 8px;">
                            <b style="color:#38BDF8; font-size:12px; font-style:italic; min-width:32px;">${localizedPos}</b>
                            <span style="color:#E2E8F0; font-size:13px; line-height:1.4;">${meaningsStr}</span>
                        </div>
                    `;
        }).join('');
      } else {
        dictHtml = `<div style="color: #e2e8f0; font-size: 13px; margin-top: 4px;">${res.basic}</div>`;
      }
      defEl.innerHTML = `
                <div style="display: flex; align-items: baseline; border-bottom: 1px solid #334155; padding-bottom: 4px; margin-bottom: 4px;">
                    <span style="font-size: 16px; font-weight: 700; color: #ffffff;">${cleanWord}</span>
                    ${phoneticStr}
                </div>
                <div style="overflow-y: auto; scrollbar-width: none;">
                    ${dictHtml}
                </div>
            `;
      defEl.setAttribute('data-status', 'success');
      repositionTooltip(tooltip, e.target);
    }
  } catch (err) {
    logger.error(err);
    const defEl = tooltip.querySelector('#kt-word-def');
    if (defEl) defEl.innerText = "Error";
  }
}
function handleWordMouseLeave(e) {
  const tooltip = document.getElementById('kt-word-tooltip');
  if (tooltip) tooltip.style.display = 'none';
  e.target.style.background = 'transparent';
  e.target.style.borderRadius = '0';
  const video = document.querySelector('video');
  if (video && !isVideoManuallyPaused) {
    video.play();
  }
  if (currentHoveredElement === e.target) {
    currentHoveredElement = null;
  }
}
window.addEventListener('scroll', () => {
  if (currentHoveredElement) {
    const mockEvent = { target: currentHoveredElement };
    handleWordMouseLeave(mockEvent);
    currentHoveredElement = null;
  }
}, { capture: true, passive: true });
function repositionTooltip(tipEl, targetEl) {
  if (!tipEl?.style || !targetEl?.getBoundingClientRect) return;
  const rect = targetEl.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    tipEl.style.visibility = 'hidden';
    return;
  }
  const realHeight = tipEl.offsetHeight || 0;
  const realWidth = tipEl.offsetWidth || 0;
  const spacing = 10;
  let topPos = rect.top - realHeight - spacing;
  if (topPos < 10) {
    topPos = rect.bottom + spacing;
  }
  let leftPos = rect.left;
  const viewportWidth = window.innerWidth;
  if (leftPos + realWidth > viewportWidth - 10) {
    leftPos = viewportWidth - realWidth - 10;
  }
  if (leftPos < 10) leftPos = 10;
  tipEl.style.left = `${leftPos}px`;
  tipEl.style.top = `${topPos}px`;
  tipEl.style.visibility = 'visible';
}
async function handleWordDblClick(e, word) {
  e.stopPropagation();
  const cleanWord = word.trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "");
  if (!cleanWord) return;
  const wordLower = cleanWord.toLowerCase();
  let fullTranslation = null;
  const storage = await safeGetStorage(['targetLanguage']);
  const currentLang = storage?.targetLanguage || navigator.language || 'zh-CN';
  const res = await getDetailedTranslation(cleanWord, false, currentLang);
  if (res && !res.isError) {
    fullTranslation = {
      basic: res.basic || "",
      phonetic: res.phonetic || "",
      dictData: (res.dictData || []).map(item => ({
        ...item,
        pos: localizePos(item.pos, currentLang)
      }))
    };
  }
  if (!fullTranslation) return;
  const now = Date.now();
  let contextUrl = window.location.href;
  try {
    const video = document.querySelector('video');
    if (video && window.location.hostname.includes('youtube.com')) {
      const urlObj = new URL(window.location.href);
      const videoId = urlObj.searchParams.get('v');
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
      title: isReActivating ? currentTitle : existingEntry.title
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
      lv: 0
    };
    isAddedNow = true;
  }
  await idb.vocabulary.add(cleanWord, entryToSave);
  const tooltip = document.getElementById('kt-word-tooltip');
  if (tooltip) {
    tooltip.style.border = isAddedNow ? '2px solid #facc15' : '1px solid #334155';
    const tipLine = tooltip.querySelector('#kt-word-tip');
    if (tipLine) {
      tipLine.innerText = isAddedNow ? t('addedFeedback') : t('hintAddAction');
      tipLine.style.color = isAddedNow ? '#facc15' : '#94a3b8';
    }
  }
  if (typeof showCollectFeedback === 'function') {
    showCollectFeedback(
      e.target,
      isAddedNow ? `⭐ ${t('alreadyInVocabulary')}` : `🗑️ ${t('removed')}`
    );
  }
}
function showCollectFeedback(target, text) {
  try {
    const rect = target.getBoundingClientRect();
    const fb = document.createElement('div');
    fb.innerText = text;
    fb.style.cssText = `
            position: fixed; z-index: 2147483647; color: #facc15; font-size: 12px;
            font-weight: bold; pointer-events: none; transition: all 0.5s;
            left: ${rect.left}px; top: ${rect.top - 20}px;
            text-shadow: 1px 1px 2px black;
        `;
    document.body.appendChild(fb);
    setTimeout(() => {
      fb.style.top = `${rect.top - 40}px`;
      fb.style.opacity = '0';
      setTimeout(() => fb.remove(), 500);
    }, 10);
  } catch (e) {
    logger.error('Failed to show collect feedback', e);
  }
}
function showCollectFeedback(target, text) {
  try {
    const rect = target.getBoundingClientRect();
    const fb = document.createElement('div');
    fb.innerText = text;
    fb.style.cssText = `
            position: fixed; z-index: 2147483647; color: #facc15; font-size: 12px;
            font-weight: bold; pointer-events: none; transition: all 0.5s;
            left: ${rect.left}px; top: ${rect.top - 20}px; text-shadow: 1px 1px 2px black;
        `;
    document.body.appendChild(fb);
    setTimeout(() => {
      fb.style.top = `${rect.top - 40}px`;
      fb.style.opacity = '0';
      setTimeout(() => fb.remove(), 500);
    }, 10);
  } catch (e) {
    logger.error(e);
  }
}
function closeTooltipAndResume() {
  const tooltip = document.getElementById('kt-word-tooltip');
  if (!tooltip) return;
  if (tooltip.style.display !== 'none') {
    tooltip.style.display = 'none';
    const video = document.querySelector('video');
    const shouldResume = video &&
      video.paused &&
      typeof isVideoManuallyPaused !== 'undefined' &&
      !isVideoManuallyPaused;
    if (shouldResume) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          logger.log("[Mira] Video play interrupted or blocked:", error.message);
        });
      }
    }
  }
}