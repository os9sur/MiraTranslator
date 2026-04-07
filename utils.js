const IS_DEV = true;
const api = (typeof chrome !== 'undefined' && chrome.runtime?.id)
  ? (typeof browser !== 'undefined' ? browser : chrome)
  : {};
const logger = {
  _print: (type, ...args) => {
    if (!IS_DEV) return;
    const prefix = `[Mira-${type.toUpperCase()}]`;
    const styles = {
      log: "color: #38bdf8; font-weight: bold;",
      warn: "color: #f1c40f; font-weight: bold;",
      error: "color: #e74c3c; font-weight: bold;",
      group: "color: #a855f7; font-weight: bold;"
    };
    if (typeof console !== 'undefined') {
      if (['log', 'warn', 'group', 'groupCollapsed'].includes(type) && typeof window !== 'undefined') {
        console[type](` %c${prefix}`, styles[type] || styles.log, ...args);
      } else {
        console[type](prefix, ...args);
      }
    }
  },
  log: (...args) => logger._print('log', ...args),
  warn: (...args) => logger._print('warn', ...args),
  group: (...args) => logger._print('group', ...args),
  groupCollapsed: (...args) => logger._print('groupCollapsed', ...args),
  groupEnd: () => IS_DEV && console.groupEnd(),
  error: (...args) => {
    try {
      if (IS_DEV) {
        console.error("[Mira-Error]", ...args);
        return;
      }
      const msg = args.map(a => {
        if (!a && a !== 0) return '';
        if (a instanceof Error) return a.message || String(a);
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch (e) { return String(a); }
      }).join(' ');
      const benignPatterns = ['Extension context invalidated'];
      for (const p of benignPatterns) {
        if (msg.includes(p)) return;
      }
    } catch (e) { }
  }
};
const IS_MAIN_WORLD = (typeof chrome === 'undefined' || !chrome.runtime?.id);
(function () {
  try {
    const test = window.localStorage;
  } catch (e) {
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'localStorage', {
        get: () => ({ getItem: () => null, setItem: () => null, removeItem: () => null })
      });
    }
  }
})();
const getCleanDomain = (url) => {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch (e) {
    return "unknown";
  }
};
//浏览器语言
const normalizeLang = (lang) => {
  if (!lang) return 'en';
  if (lang.startsWith('zh')) {
    return (lang === 'zh-TW' || lang === 'zh-HK') ? 'zh-TW' : 'zh-CN';
  }
  return lang.split('-')[0];
};

const getBrowserLang = () => {
  try {
    let chromeAvailable = false;
    try {
      chromeAvailable = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
    } catch (_) {
      chromeAvailable = false;
    }

    if (!chromeAvailable) {
      return normalizeLang(navigator.language) || 'en';
    }

    const raw = chrome.i18n?.getUILanguage?.() ||
      (navigator.languages && navigator.languages[0]) ||
      navigator.language ||
      'en';

    return normalizeLang(raw);
  } catch (e) {
    return normalizeLang(navigator.language) || 'en';
  }
};

async function safeSendToTab(tabId, message) {
  if (!tabId || typeof tabId !== 'number' || !chrome.runtime?.id) return null;
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {

        const error = chrome.runtime.lastError;
        if (error) {
          resolve(null);
        } else {
          resolve(response);
        }
      });
    } catch (e) {
      resolve(null);
    }
  });
}

async function safeSetIcon(tabId, imageData) {
  if (!tabId || !imageData || !chrome.runtime?.id) return null;
  return new Promise((resolve) => {
    try {
      chrome.action.setIcon({ imageData: imageData, tabId: tabId }, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    } catch (e) {
      resolve(false);
    }
  });
}

async function safeCreateTab(url, unique = true) {
  const finalUrl = url.startsWith('http') ? url : chrome.runtime.getURL(url);
  return new Promise((resolve) => {
    if (unique) {
      chrome.tabs.query({ url: finalUrl }, (tabs) => {
        const err1 = chrome.runtime.lastError;
        if (!err1 && tabs && tabs.length > 0) {
          chrome.tabs.update(tabs[0].id, { active: true }, (tab) => {
            chrome.runtime.lastError;
            resolve(tab);
          });
          chrome.windows.update(tabs[0].windowId, { focused: true });
        } else {
          chrome.tabs.create({ url: finalUrl }, (tab) => {
            chrome.runtime.lastError;
            resolve(tab);
          });
        }
      });
    } else {
      chrome.tabs.create({ url: finalUrl }, (tab) => {
        const err = chrome.runtime.lastError;
        if (err) logger.warn(`[SafeCreate] 创建失败: ${err.message}`);
        resolve(tab);
      });
    }
  });
}

async function getActiveTab() {
  return new Promise((resolve) => {
    try {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const err = chrome.runtime.lastError;
        if (err) {
          logger.warn(`[SafeQuery] 查询 Tab 异常: ${err.message}`);
          return resolve(null);
        }
        if (tabs && tabs.length > 0) {
          resolve(tabs[0]);
        } else {
          chrome.tabs.query({ active: true, currentWindow: true }, (fallbackTabs) => {
            const err2 = chrome.runtime.lastError;
            if (!err2 && fallbackTabs && fallbackTabs.length > 0) {
              resolve(fallbackTabs[0]);
            } else {
              resolve(null);
            }
          });
        }
      });
    } catch (e) {
      logger.error("[SafeQuery] 同步捕获错误:", e);
      resolve(null);
    }
  });
}

let _defaultEngine = 'bing';

let _defaultEngineReady = safeGetStorage(['_defaultEngine'], true).then(res => {
  if (res && res._defaultEngine) _defaultEngine = res._defaultEngine;
});

async function getInitialActiveConfig() {
  await _defaultEngineReady;
  return { engine: _defaultEngine, data: {} };
}

function getRuntimeDefaultEngine() {
  return _defaultEngine;
}

function getCurrentLang() {
  return window.currentConfig?.targetLanguage ||
    window.currentTargetL ||
    getBrowserLang() ||
    'en';
}

let cachedSiteSettings = {};
let cachedGlobalConfig = { page: false, select: true, yt: true };
if (typeof chrome !== 'undefined' && chrome.storage) {
  safeGetStorage(['siteSettings', 'globalConfig'], true).then(res => {
    if (res?.siteSettings) cachedSiteSettings = res.siteSettings;
    if (res?.globalConfig) cachedGlobalConfig = res.globalConfig;
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.siteSettings) cachedSiteSettings = changes.siteSettings.newValue;
    if (changes.globalConfig) cachedGlobalConfig = changes.globalConfig.newValue;
  });
}
function isCurrentSiteActive() {
  try {
    const fullHost = window.location.hostname.toLowerCase();
    const cleanHost = fullHost.replace(/^www\./, '');
    const settings = cachedSiteSettings || {};
    const global = cachedGlobalConfig;
    const siteConfig = settings[fullHost] || settings[cleanHost];
    const activeConfig = siteConfig || global;
    if (fullHost.includes('youtube.com')) {
      return activeConfig.page === true || activeConfig.select === true || activeConfig.yt === true;
    }
    return activeConfig.page === true || activeConfig.select === true;
  } catch (e) {
    return false;
  }
}
function getSafeMessage(key, defaultMsg) {
  try {
    return (chrome.i18n && chrome.runtime?.id) ? chrome.i18n.getMessage(key) : defaultMsg;
  } catch (e) {
    return defaultMsg;
  }
}
async function safeSendMessage(message) {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
    if (isCurrentSiteActive()) showUpdateNotice();
    return null;
  }
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message;
          if (errorMsg.includes("context invalidated")) {
            if (isCurrentSiteActive()) showUpdateNotice();
          }
          resolve(null);
        } else {
          resolve(response);
        }
      });
    } catch (e) {
      if (e.message?.includes("context invalidated") || !chrome.runtime?.id) {
        if (isCurrentSiteActive()) showUpdateNotice();
      }
      resolve(null);
    }
  });
}
let isNoticeShowing = false;
function showUpdateNotice() {
  if (isNoticeShowing || document.getElementById('mira-update-notice')) return;

  isNoticeShowing = true;

  const div = document.createElement('div');
  div.id = 'mira-update-notice';
  const finalMsg = t("update_notice") === "update_notice"
    ? "Mira Translator has been updated. Please click here to refresh the page."
    : t("update_notice");
  div.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 10000000;
        background: #1f2937;
        color: #f3f4f6;
        padding: 14px 24px;
        border-radius: 12px;
        cursor: pointer;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        border: 1px solid #374151;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        align-items: center;
        gap: 10px;
    `;

  // 用 DOM API 创建 SVG，避免 innerHTML TrustedHTML 限制
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'mira-refresh-svg');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.style.transition = 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)';

  const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path1.setAttribute('d', 'M23 4v6h-6');
  const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path2.setAttribute('d', 'M1 20v-6h6');
  const path3 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path3.setAttribute('d', 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15');
  svg.appendChild(path1);
  svg.appendChild(path2);
  svg.appendChild(path3);

  const span = document.createElement('span');
  span.style.marginLeft = '8px';
  span.textContent = finalMsg;

  div.appendChild(svg);
  div.appendChild(span);

  div.onmouseenter = () => {
    div.style.background = '#374151';
    div.style.transform = 'translateY(-2px)';
    const svgEl = div.querySelector('.mira-refresh-svg');
    if (svgEl) svgEl.style.transform = 'rotate(360deg)';
  };
  div.onmouseleave = () => {
    div.style.background = '#1f2937';
    div.style.transform = 'translateY(0)';
    const svgEl = div.querySelector('.mira-refresh-svg');
    if (svgEl) svgEl.style.transform = 'rotate(0deg)';
  };
  div.onclick = (e) => {
    e.stopPropagation();
    isNoticeShowing = true;
    div.style.display = 'none';
    location.reload();
  };
  const target = document.body || document.documentElement;
  if (target) {
    target.appendChild(div);
  } else {
    isNoticeShowing = false;
  }
}
let i18nDict = {};
let isSynced = false;
function syncI18nDict(force = false) {
  if (isSynced && !force) return;
  const root = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : {});
  const dataKeys = ['i18nData', 'i18nContent', 'i18nEngineData', 'i18nStyleData', 'i18nDonateData', 'i18nSyncData', 'i18nCacheData', 'i18nThemeData', 'i18nYTData', 'i18nAttach1', 'i18nAttach2', 'i18nAttach3', 'i18nAttach4', 'i18nAttach5', 'i18nAttach6', 'i18nAttach7', 'i18nAttach8'];
  let foundAny = false;
  dataKeys.forEach(key => {
    const data = root[key];
    if (data) {
      foundAny = true;
      Object.keys(data).forEach(lang => {
        const normLang = lang.replace('_', '-').toLowerCase();
        if (!i18nDict[normLang]) i18nDict[normLang] = {};
        Object.assign(i18nDict[normLang], data[lang]);
      });
    }
  });
  if (foundAny) isSynced = true;
}

function t(key, forcedLang) {
  syncI18nDict();

  // 本地模型/自定义API相关提示
  const localModelTips = {
    'timeoutLocalModel': {
      'zh': '本地模型响应超时，无独立显卡时速度会非常慢，建议改用云端服务',
      'zh-tw': '本地模型回應逾時，建議使用獨立顯卡或雲端服務',
      'ja': 'ローカルモデルがタイムアウトしました。専用GPU（独立グラフィックカード）がない場合、速度が非常に遅くなります。クラウドサービスの利用をお勧めします。',
      'default': 'Local model timeout. A dedicated GPU is required. Consider using a cloud API instead.'
    },
    'customApiTip': {
      'zh': '兼容 OpenAI API 格式的服务均可使用（云端或本地）。使用本地模型（Ollama / LM Studio 等）需注意：① 需独立显卡，核显/CPU 会严重超时 ② 需开启跨域：Ollama 设置环境变量 OLLAMA_ORIGINS=*，LM Studio / Jan 在设置页开启 CORS 选项',
      'zh-tw': '相容 OpenAI API 格式的服務均可使用。本地模型需注意：① 需獨立顯卡，核顯/CPU 會嚴重逾時 ② 需開啟 CORS：Ollama 設定 OLLAMA_ORIGINS=*，LM Studio / Jan 在設定頁開啟 CORS',
      'ja': 'OpenAI API形式に対応したサービスであれば利用可能です（クラウド・ローカル問わず）。ローカルモデル（Ollama / LM Studio など）をご利用の場合：① 専用GPUが必要です。内蔵GPU/CPUのみではタイムアウトが頻発します ② CORSの有効化が必要です：OllamaはOLLAMA_ORIGINS=*を環境変数に設定、LM Studio / JanはCORSオプションをオンにしてください',
      'default': 'Compatible with any OpenAI API format (cloud or local). For local models (Ollama / LM Studio etc.): ① Dedicated GPU required, CPU/iGPU causes severe timeouts ② Enable CORS: set OLLAMA_ORIGINS=* for Ollama, or enable CORS in settings for LM Studio / Jan'
    },
  };

  if (localModelTips[key]) {
    const target = (forcedLang || globalUiLang || 'en').replace('_', '-').toLowerCase();
    const short = target.split('-')[0];
    const tips = localModelTips[key];
    return tips[target] || tips[short] || tips['default'];
  }

  if (!i18nDict || Object.keys(i18nDict).length === 0) return key;
  const root = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : {});
  const langEl = typeof document !== 'undefined' ? document.getElementById('targetLang') : null;
  let lang = forcedLang
    || root.currentTargetL
    || langEl?.value
    || root.currentConfig?.targetLanguage
    || getBrowserLang()
    || 'en';
  const target = lang.replace('_', '-').toLowerCase();
  const short = target.split('-')[0];
  const dict = i18nDict[target] || i18nDict[short] || i18nDict["en"] || {};
  return dict[key] || i18nDict["en"]?.[key] || key;
}

function applyI18n(forcedLang) {
  if (typeof document === 'undefined') return;
  syncI18nDict();
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const type = el.getAttribute('data-i18n-type');
    const translation = t(key, forcedLang);
    if (translation && translation !== key) {
      if (type === 'placeholder' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = translation;
      } else if (type === 'title' || el.hasAttribute('data-i18n-title')) {
        el.title = translation;
      } else if (type === 'value') {
        el.value = translation;
      } else {
        el.innerText = translation;
      }
    }
  });
}

let globalUiLang = getBrowserLang();

async function initUILanguage() {
  const uiSelect = document.getElementById('uiLangSelect');
  if (!uiSelect) return;

  const storage = await safeGetStorage(['ui_language'], true);

  if (storage?.ui_language) {
    uiSelect.value = storage.ui_language;
    globalUiLang = storage.ui_language;
  } else {
    uiSelect.value = globalUiLang;
  }

  applyI18n(globalUiLang);
}

function standardizeResult(raw, originalText) {
  const schema = {
    basic: "",
    phonetic: "",
    dictData: [],
    isFallback: false,
    engine: ""
  };
  if (!raw) {
    schema.basic = originalText;
    schema.isFallback = true;
    return schema;
  }
  if (typeof raw === 'string') {
    schema.basic = raw;
  } else if (typeof raw === 'object') {
    schema.basic = raw.basic || raw.translation || raw.text || originalText;
    schema.phonetic = raw.phonetic || "";
    schema.dictData = raw.dictData || [];
    schema.engine = raw.engine || "";
  }
  return schema;
}
let toastTimer = null;
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  clearTimeout(toastTimer);
  if (type === 'error') toast.style.borderColor = '#f87171';
  else if (type === 'success') toast.style.borderColor = '#4ade80';
  else toast.style.borderColor = '#475569';
  toast.textContent = message;
  toast.classList.remove('toast-hidden');
  toastTimer = setTimeout(() => {
    toast.classList.add('toast-hidden');
  }, 3000);
}
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
const hash = (str) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return Math.abs(h).toString(16);
};
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
/**
 * IndexedDB 基础配置与操作封装
 *
 * 核心 IDB 模块 - 采用前缀隔离策略
 * tr_ : 翻译缓存 (Translation Cache)
 * vb_ : 生词本 (Vocabulary Book)
 */
const idb = {
  async get(keys) {
    return await safeSendMessage({ type: 'IDB_GET', keys });
  },
  async getAll(prefix = '') {
    const res = await safeSendMessage({ type: 'IDB_GET_ALL', prefix });
    return res || {};
  },
  async set(items) {
    return await safeSendMessage({ type: 'IDB_SET', items });
  },
  async remove(key) {
    return await safeSendMessage({ type: 'IDB_REMOVE', key });
  },
  async getSize(prefix) {
    return await safeSendMessage({ type: 'IDB_GET_SIZE', prefix });
  },
  async getCount(prefix) {
    return await safeSendMessage({ type: 'IDB_GET_COUNT', prefix });
  },
  async clearPrefix(prefix) {
    return await safeSendMessage({ type: 'IDB_CLEAR_PREFIX', prefix });
  },
  cache: {
    async get(key) {
      const isArray = Array.isArray(key);
      const keys = isArray ? key : [key];
      const fullKeys = keys.map(k => k.startsWith('tr_') ? k : `tr_${k}`);
      const res = await idb.get(fullKeys);
      if (isArray) return res || {};
      return res ? res[fullKeys[0]] : null;
    },
    async set(key, value) {
      const fullKey = key.startsWith('tr_') ? key : `tr_${key}`;
      const dataToSet = typeof value === 'object' ? value : { basic: value };
      return idb.set({ [fullKey]: { ...dataToSet, ts: Date.now() } });
    },
    async remove(key) {
      const fullKey = key.startsWith('tr_') ? key : `tr_${key}`;
      return idb.remove(fullKey);
    },
    async getCount() {
      return idb.getCount('tr_');
    },
    async getSize() {
      return idb.getSize('tr_');
    },
    async clearAll() {
      return idb.clearPrefix('tr_');
    }
  },
  vocabulary: {
    async add(word, dataOrEntry) {
      const cleanWord = word.trim().toLowerCase();
      const fullKey = `vb_${cleanWord}`;
      const now = Date.now();
      let entry;
      if (dataOrEntry && dataOrEntry.id) {
        entry = dataOrEntry;
      } else {
        entry = {
          id: crypto.randomUUID(),
          word: cleanWord,
          trans: dataOrEntry.trans || dataOrEntry.translation || dataOrEntry.basic || dataOrEntry.t || '',
          src: dataOrEntry.src || dataOrEntry.url || '',
          title: dataOrEntry.title || '',
          date: dataOrEntry.date || dataOrEntry.ts || now,
          updated: now,
          deleted: false,
          lv: dataOrEntry.lv || 0
        };
      }
      return idb.set({ [fullKey]: entry });
    },
    async get(word) {
      const fullKey = `vb_${word.trim().toLowerCase()}`;
      const res = await idb.get([fullKey]);
      return res ? res[fullKey] : null;
    },
    async getAll() {
      const results = await idb.getAll('vb_');
      return Object.values(results || {});
    },
    async remove(word) {
      const fullKey = `vb_${word.trim().toLowerCase()}`;
      return idb.remove(fullKey);
    },
    async getCount() {
      return idb.getCount('vb_');
    },
    async getSize() {
      return idb.getSize('vb_');
    },
    async clearAll() {
      return idb.clearPrefix('vb_');
    }
  }
};
function getCacheKey(text, engine, lang) {
  if (!text) return '';
  const coreText = text
    .replace(/[\s\n\r\t.,!?;:。，！？、・「」]/g, "")
    .toLowerCase();
  const safeEngine = (engine || getRuntimeDefaultEngine()).toLowerCase();
  const safeLang = (lang || 'zh-cn').replace('_', '-').toLowerCase();
  let contentPart;
  if (typeof hash === 'function') {
    contentPart = hash(coreText);
  } else {
    contentPart = coreText.substring(0, 50);
  }
  return `tr_${safeEngine}_${contentPart}_${safeLang}`;
}
/**
 * 获取详细翻译结果
 * 适配多级数据结构：基础译文、音标、详细词典释义
 */
if (typeof pendingRequests === 'undefined') {
  pendingRequests = new Set();
}
const NON_LATIN_TARGETS = {
  'zh': { remove: /[\u4e00-\u9fa5\u4E00-\u9FFF]/g },
  'ja': { remove: /[\u3040-\u30FF\u30FC\p{Script=Han}]/gu },
  'ko': { remove: /[\uAC00-\uD7AF]/g },
  'th': { remove: /[\u0E00-\u0E7F]/g },
  'ar': { remove: /[\u0600-\u06FF]/g },
  'fa': { remove: /[\u0600-\u06FF]/g },
  'he': { remove: /[\u0590-\u05FF]/g },
  'hi': { remove: /[\u0900-\u097F]/g },
  'ru': { remove: /[\u0400-\u04FF]/g },
  'uk': { remove: /[\u0400-\u04FF]/g },
  'el': { remove: /[\u0370-\u03FF]/g },
};
const LANGUAGE_PATTERNS = {
  'ko': /\p{Script=Hangul}/u,
  'ru': /\p{Script=Cyrillic}/u,
  'uk': /\p{Script=Cyrillic}/u,
  'bg': /\p{Script=Cyrillic}/u,
  'th': /\p{Script=Thai}/u,
  'ar': /\p{Script=Arabic}/u,
  'fa': /\p{Script=Arabic}/u,
  'he': /\p{Script=Hebrew}/u,
  'hi': /\p{Script=Devanagari}/u,
  'bn': /\p{Script=Bengali}/u,
  'el': /\p{Script=Greek}/u,
  'vi': /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵĐđ]/i,
  'tr': /[ĞğİıŞş]/,
  'pl': /[ąćęłńśźżĄĆĘŁŃŚŹŻ]/,
  'cs': /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/,
  'sk': /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/,
  'hu': /[őűŐŰ]/,
  'ro': /[șțȘȚăĂâÂîÎ]/,
  'sl': /[čšžČŠŽćđĆĐ]/,
  'hr': /[čšžČŠŽćđĆĐ]/,
  'lv': /[āēīūļķģņČčŠšŽž]/,
  'lt': /[ąčęėįšųūžĄČĘĖĮŠŲŪŽ]/,
  'et': /[äöüõÄÖÜÕšžŠŽ]/,
  'sv': /[åäöÅÄÖ]/,
  'da': /[åæøÅÆØ]/,
  'no': /[åæøÅÆØ]/,
  'fi': /[äöÄÖ]/,
  'fr': /[àâæçèéêëîïôœùûüÿÀÂÆÇÈÉÊËÎÏÔŒÙÛÜŸ]/,
  'de': /[äöüßÄÖÜ]/,
  'es': /[áéíóúüñÁÉÍÓÚÜÑ]/,
  'pt': /[ãõçâêôÃÕÇÂÊÔáéíóúÁÉÍÓÚàÀ]/,
  'it': /[àèéìòùÀÈÉÌÒÙ]/,
  'nl': /[éëïóöüÉËÏÓÖÜ]/,
};
const LATIN_BASED_LANGS = new Set([
  'en', 'fr', 'de', 'es', 'it', 'nl', 'pt', 'sv', 'da', 'no', 'fi',
  'tr', 'pl', 'cs', 'sk', 'hu', 'ro', 'sl', 'hr', 'lv', 'lt', 'et', 'vi'
]);
function detectLatinLanguage(cleanText, cleanChars, targetPrefix) {
  const targetPattern = LANGUAGE_PATTERNS[targetPrefix];
  if (targetPattern) {
    if (targetPattern.test(cleanText)) {
      return true;
    }
    const hasOtherFeature = Object.entries(LANGUAGE_PATTERNS).some(([lang, pattern]) =>
      LATIN_BASED_LANGS.has(lang) && lang !== targetPrefix && pattern.test(cleanText)
    );
    if (hasOtherFeature) return false;
  }
  return false;
}
function detectIsAlreadyTarget(text, targetLang) {
  if (!text) return true;

  if (/^\s*[\d.,\s\-+%$€¥£#@!?]+\s*$/.test(text)) return true;
  const textWithoutUrls = text
    .replace(/https?:\/\/[^\s]+/g, '');
  const hasCJK = /[\u4e00-\u9fa5\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/.test(textWithoutUrls);
  if (textWithoutUrls.length > 12 && /[\d*]/.test(textWithoutUrls) && !/\s/.test(textWithoutUrls) && !hasCJK) return true;
  const cleanChars = Array.from(textWithoutUrls).filter(char =>
    /\p{L}/u.test(char) &&
    !/[\s\n\r\t\u00A0\u2000-\u200a\u2028\u2029\u3000\ufeff]/u.test(char) &&
    !/\p{P}|\p{S}/u.test(char)
  );
  if (cleanChars.length === 0) return true;
  const cleanText = cleanChars.join('');
  const prefix = (targetLang || 'en').toLowerCase().slice(0, 2);
  if (prefix === 'en') {
    // 含非英文拉丁字符，肯定不是英文
    const hasNonEnglishLatin = cleanChars.some(char =>
      /[äöüßÄÖÜàâæçéèêëîïôœùûüÿáéíóúñãõîêôû]/i.test(char)
    );
    if (hasNonEnglishLatin) return false;

    // 纯 a-z 的词：结合 hintSourceLang 或上下文判断
    // 无法区分 "aus" 是德语还是英语缩写，直接放行让翻译引擎处理
    return false; // 宁可多翻译，不neng漏掉
  }
  if (prefix === 'ja') {
    const hasKana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(cleanText);
    if (!hasKana) return false;
    const jaCount = cleanChars.filter(char =>
      /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(char) ||
      /[\u30FC\u30A0\u30FB\u30FD\u30FE]/.test(char)
    ).length;
    return jaCount / cleanChars.length >= 0.7;
  }
  if (prefix === 'zh') {
    const hasKana = cleanChars.some(c => /\p{Script=Hiragana}|\p{Script=Katakana}/u.test(c));
    if (hasKana) return false;
    const hanCount = cleanChars.filter(c => /\p{Script=Han}/u.test(c)).length;
    const totalCount = cleanChars.length;
    const ratio = hanCount / totalCount;
    if (totalCount <= 4) {
      return hanCount === totalCount;
    }
    if (totalCount <= 15) {
      return ratio >= 0.7;
    }
    return ratio >= 0.8;
  }
  if (LANGUAGE_PATTERNS[prefix] && !LATIN_BASED_LANGS.has(prefix)) {
    const scriptPattern = LANGUAGE_PATTERNS[prefix];
    const scriptCount = cleanChars.filter(char => scriptPattern.test(char)).length;
    return scriptCount / cleanChars.length >= 0.7;
  }
  if (LATIN_BASED_LANGS.has(prefix)) {
    return detectLatinLanguage(cleanText, cleanChars, prefix);
  }
  return false;
}
const POS_MAP = {
  '名词': {
    'zh-cn': '名词', 'zh-tw': '名詞', 'ja': '名詞', 'ko': '명사',
    'en': 'n.', 'fr': 'n.', 'de': 'Subst.'
  },
  '动词': {
    'zh-cn': '动词', 'zh-tw': '動詞', 'ja': '動詞', 'ko': '동사',
    'en': 'v.', 'fr': 'v.', 'de': 'V.'
  },
  '形容词': {
    'zh-cn': '形容词', 'zh-tw': '形容詞', 'ja': '形容詞', 'ko': '형용사',
    'en': 'adj.', 'fr': 'adj.', 'de': 'Adj.'
  },
  '副词': {
    'zh-cn': '副词', 'zh-tw': '副詞', 'ja': '副詞', 'ko': '부사',
    'en': 'adv.', 'fr': 'adv.', 'de': 'Adv.'
  },
  '介词': {
    'zh-cn': '介词', 'zh-tw': '介系詞', 'ja': '前置詞', 'ko': '전치사',
    'en': 'prep.', 'fr': 'prép.', 'de': 'Präp.'
  },
  '连词': {
    'zh-cn': '连词', 'zh-tw': '連接詞', 'ja': '接続詞', 'ko': '접속사',
    'en': 'conj.', 'fr': 'conj.', 'de': 'Konj.'
  },
  '代词': {
    'zh-cn': '代词', 'zh-tw': '代名詞', 'ja': '代名詞', 'ko': '대명사',
    'en': 'pron.', 'fr': 'pron.', 'de': 'Pron.'
  },
  '冠词': {
    'zh-cn': '冠词', 'zh-tw': '冠詞', 'ja': '冠詞', 'ko': '관사',
    'en': 'art.', 'fr': 'art.', 'de': 'Art.'
  },
  '感叹词': {
    'zh-cn': '感叹词', 'zh-tw': '感嘆詞', 'ja': '感嘆詞', 'ko': '감탄사',
    'en': 'interj.', 'fr': 'interj.', 'de': 'Interj.'
  },
  '数词': {
    'zh-cn': '数词', 'zh-tw': '數詞', 'ja': '数詞', 'ko': '수사',
    'en': 'num.', 'fr': 'num.', 'de': 'Num.'
  },
};
/**
 * 词性本地化转换函数
 * @param {string} pos - 原始词性名称（通常为简体中文）
 * @param {string} targetLang - 目标语言代码（如 "zh-CN", "zh-TW", "ja-JP", "en"）
 */
// 建立反向查找表：所有语言的词性表达 → 简体中文 key
const POS_REVERSE_MAP = (() => {
  const map = {};
  for (const [cnKey, translations] of Object.entries(POS_MAP)) {
    map[cnKey] = cnKey; // 自身
    for (const val of Object.values(translations)) {
      if (val) map[val.toLowerCase()] = cnKey;
    }
  }
  // 补充 AI 常见的缩写/变体
  const extra = {
    'n': '名词', 'noun': '名词',
    'v': '动词', 'verb': '动词',
    'adj': '形容词', 'adjective': '形容词',
    'adv': '副词', 'adverb': '副词',
    'prep': '介词', 'preposition': '介词',
    'conj': '连词', 'conjunction': '连词',
    'pron': '代词', 'pronoun': '代词',
    'art': '冠词', 'article': '冠词',
    'interj': '感叹词', 'interjection': '感叹词',
    'num': '数词', 'numeral': '数词', '介系词': '介词',
    '介系詞': '介词',
  };
  return { ...map, ...extra };
})();

function localizePos(pos, targetLang) {
  if (!pos) return '';

  const normalized = pos.trim().toLowerCase().replace(/\.$/, '');
  const cnKey = POS_REVERSE_MAP[normalized];

  // 找不到映射则原样返回
  if (!cnKey) return pos;

  const entry = POS_MAP[cnKey];
  const langFull = (targetLang || 'en').toLowerCase().replace('_', '-');
  const langShort = langFull.split('-')[0];

  // 优先级：目标全称 > 目标简称 > 英文保底 > 原始输入
  return entry[langFull] ||
    entry[langShort] ||
    entry['en'] ||
    pos;
}
const AI_LLM_WHITE_LIST = [
  'openai',
  'deepseek',
  'claude',
  'gemini',
  'grok',
  'groq',
  'siliconflow',
  'custom_ai'
];
const TRADITIONAL_ENGINE_LIST = [
  'google',
  'deepl',
  'deeplx',
  'bing'
];

const STORAGE_KEYS = {
  core: ['userConfigs', 'activeConfig', 'lastActiveId'],
  settings: ['siteSettings', 'customRules', 'uiConfig', 'scanConfig', 'userStyleConfig', 'ytStyleSettings', 'globalConfig'],
  sync: function () {
    return [...this.core, ...this.settings];
  },
  export: function () {
    return [...this.core, ...this.settings];
  }
};

async function safeGetStorage(keys, silent = false) {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
      if (!silent) showUpdateNotice();
      return null;
    }
  } catch (_) {
    if (!silent) showUpdateNotice();
    return null;
  }

  if (IS_MAIN_WORLD) return null;

  try {
    return await chrome.storage.local.get(keys);
  } catch (e) {
    if (e.message?.includes('context invalidated') ||
      e.message?.includes('Extension context')) {
      if (!silent) showUpdateNotice();
    }
    return null;
  }
}
async function safeSetStorage(items) {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
    showUpdateNotice();
    return false;
  }
  if (IS_MAIN_WORLD) {
    return false;
  }
  try {
    await chrome.storage.local.set(items);
    return true;
  } catch (e) {
    if (e.message.includes("context invalidated")) {
      showUpdateNotice();
    }
    return false;
  }
}
async function safeRemoveStorage(keys) {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.id) return null;
    return await chrome.storage.local.remove(keys);
  } catch (e) {
    if (e.message?.includes('context invalidated') ||
      e.message?.includes('Extension context')) {
      // 静默处理，环境已失效
    }
    return null;
  }
}
async function lookupCache(text, engine, lang) {
  const isAI = AI_LLM_WHITE_LIST.includes(engine);
  const singleKey = getCacheKey(text, engine, lang);
  const commonFingerprint = singleKey.substring(singleKey.indexOf('_', 3));
  let cachedData = null;
  let hitKey = null;
  if (isAI) {
    const store = await idb.get(singleKey);
    hitKey = singleKey;
    cachedData = store?.[singleKey] || null;
  } else {
    const aiKeys = AI_LLM_WHITE_LIST.map(ai => `tr_${ai}${commonFingerprint}`);
    const keysToQuery = [...aiKeys, singleKey];
    const store = await idb.get(keysToQuery);
    hitKey = aiKeys.find(k => store?.[k]) || (store?.[singleKey] ? singleKey : null);
    if (hitKey) cachedData = store[hitKey];
  }
  if (!cachedData) return null;
  const actualResult = cachedData.response?.currentTranslationResponse
    || cachedData.response
    || cachedData;
  const ageHours = (Date.now() - (cachedData.timestamp || actualResult.timestamp || 0)) / 3600000;
  const expireLimit = (actualResult.isFallback) ? 1 : 168;
  if (ageHours >= expireLimit) {
    await idb.remove(hitKey);
    return null;
  }
  if (!actualResult.isFallback) {
    actualResult.timestamp = Date.now();
    const updates = { [singleKey]: actualResult };
    if (hitKey !== singleKey) updates[hitKey] = actualResult;
    await idb.set(updates);
  }
  logger.log('[lookupCache] 查询 key:', singleKey, 'cachedData:', !!cachedData);
  return { result: actualResult, hitKey, singleKey };
}

function getPhoneticLabel(langCode) {
  const base = (langCode || 'en').split('-')[0].toLowerCase();
  const labels = {
    'ja': 'あ',
    'zh': '音',
    'ko': '가',      // 常用首字母
    'ar': 'ع',
    'hi': 'अ',
    'th': 'ก',
    'el': 'Ω',
    'ru': 'Я',
    'en': 'Ph.'
  };

  return labels[base] || 'Ph';
}

let lastUtterance = null;

function speakText(text, speakBtn, forcedLang) {
  if (!window.speechSynthesis || !text) return;

  window.speechSynthesis.cancel();

  if (speakBtn) {
    speakBtn.classList.remove('is-speaking', 'speaking-wave');
    speakBtn.classList.add('is-loading', 'tts-loading');
  }

  lastUtterance = new SpeechSynthesisUtterance(text);
  lastUtterance.volume = 1.0;

  const langMap = {
    'ja': 'ja-JP', 'zh': 'zh-CN', 'en': 'en-US', 'ko': 'ko-KR',
    'fr': 'fr-FR', 'de': 'de-DE', 'es': 'es-ES', 'ru': 'ru-RU'
  };

  let targetLang = '';
  if (forcedLang) {
    const base = forcedLang.split('-')[0].toLowerCase();
    targetLang = langMap[base] || forcedLang;
  }

  // 如果没有强制指定语言，走正则识别
  if (!targetLang) {
    if (/[\u3040-\u30ff]/.test(text)) targetLang = 'ja-JP';
    else if (/\p{Script=Hangul}/u.test(text)) targetLang = 'ko-KR';
    else if (/\p{Script=Han}/u.test(text)) targetLang = /[繁體國語]/.test(text) ? 'zh-TW' : 'zh-CN';
    else if (/[äöüßÄÖÜ]/.test(text)) targetLang = 'de-DE';
    else if (/[éàèâîôûçëïüÿœæ]/.test(text)) targetLang = 'fr-FR';
    else if (/[ñ¿¡]/.test(text)) targetLang = 'es-ES';
    else if (/\p{Script=Cyrillic}/u.test(text)) targetLang = 'ru-RU';
    else targetLang = 'en-US'; // 默认
  }

  lastUtterance.lang = targetLang;

  if (targetLang.startsWith('ja')) lastUtterance.rate = 0.6;
  else if (targetLang.startsWith('zh')) lastUtterance.rate = 0.85;
  else lastUtterance.rate = 0.8;

  const forceReset = new SpeechSynthesisUtterance("");
  window.speechSynthesis.speak(forceReset);

  setTimeout(() => {
    window.speechSynthesis.speak(lastUtterance);
  }, 50);

  if (speakBtn) {
    lastUtterance.onstart = () => {
      speakBtn.classList.remove('is-loading', 'tts-loading');
      speakBtn.classList.add('is-speaking', 'speaking-wave');
      speakBtn.querySelector('svg')?.classList.add('icon-active');
    };

    const stop = () => {
      speakBtn.classList.remove('is-speaking', 'is-loading', 'speaking-wave', 'tts-loading');
      speakBtn.querySelector('svg')?.classList.remove('icon-active');
    };

    lastUtterance.onend = stop;
    lastUtterance.onerror = stop;
  }
}

// 校验翻译结果是否有效
function isValidTranslationResult(res) {
  if (!res) return false;

  // basic 字段不应该是 JSON 字符串
  if (res.basic && (res.basic.trim().startsWith('{') || res.basic.trim().startsWith('['))) {
    return false;
  }
  if (!res.basic || res.basic.trim().length === 0) return false;
  // dictData 里的 definition 不应该是大量重复词
  if (res.dictData && res.dictData.length > 0) {
    for (const item of res.dictData) {
      const meaning = Array.isArray(item.definition)
        ? item.definition.join(', ')
        : typeof item.definition === 'string'
          ? item.definition
          : '';

      if (meaning) {
        const words = meaning.split(/[,\s]+/).filter(Boolean);
        // 超过10个词且都相同，判定为异常
        if (words.length > 10) {
          const unique = new Set(words.map(w => w.toLowerCase()));
          if (unique.size <= 2) return false;
        }
      }
    }
  }

  return true;
}


function mergeDictData(dictData) {
  if (!dictData || dictData.length === 0) return dictData;
  const merged = {};
  dictData.forEach(item => {
    const pos = item.pos || '';
    let def = '';
    if (typeof item.definition === 'string') def = item.definition;
    else if (Array.isArray(item.definition)) def = item.definition.join(', ');
    else if (Array.isArray(item.meanings)) def = item.meanings.join(', ');
    else if (typeof item.meanings === 'string') def = item.meanings;
    if (!def) return;
    merged[pos] = merged[pos] ? merged[pos] + ', ' + def : def;
  });
  return Object.entries(merged).map(([pos, definition]) => ({ pos, definition }));
}


//通用翻译
let lastTranslationResult = null;
const wordTranslationCache = new Map();
async function getDetailedTranslation(text, forceRefresh = false, manualLang = null, options = {}, hintSourceLang = null) {
  if (!text) return null;
  const query = text.trim();
  if (!query) return null;
  if (/^\d+%?$/.test(query)) {
    return { basic: query, isSameLang: true };
  }
  const storage = await safeGetStorage(['activeConfig', 'targetLanguage']);
  if (!storage) return;
  const {
    skipCache = false,
    isBatch = false,
    lightweight = false,
    needPhonetic = false,
    hintInputLang = null,
    hintLangA = null,
    hintLangB = null,
    fromPopup = false
  } = options;
  let engine = (
    storage.activeConfig?.engine ||
    (typeof currentEngine !== 'undefined' ? currentEngine : getRuntimeDefaultEngine())
  ).toLowerCase();
  let lang = (
    manualLang ||
    storage.targetLanguage ||
    getBrowserLang() ||
    'en'
  ).replace('_', '-').toLowerCase();

  lang = lang.replace('_', '-').toLowerCase();
  const targetBase = lang.split('-')[0];
  const hasHan = LANGUAGE_PATTERNS['zh']?.test(query) || false;
  const hasJa = LANGUAGE_PATTERNS['ja']?.test(query) || false;
  const hasKo = LANGUAGE_PATTERNS['ko']?.test(query) || false;
  const hasLatinEx = LANGUAGE_PATTERNS['latinEx']?.test(query) || false;
  const isPureEnglish = LANGUAGE_PATTERNS['en']?.test(query) || false;

  //logger.log("[getDetailedTranslation] hintInputLang:", hintInputLang, "targetBase:", targetBase);
  if (!isBatch) {
    let isSame = false;

    // 如果外部明确传入了输入语言，且与目标语言不同，跳过所有isSame检测
    if (hintInputLang && hintInputLang !== targetBase) {
      isSame = false;
    } else {
      if (targetBase === 'en' && isPureEnglish) {
        isSame = true;
      } else if (targetBase === 'zh' && hasHan && !hasJa && !hasKo) {
        const targetIsTraditional = lang.includes('tw') || lang.includes('hk');
        isSame = !targetIsTraditional;
      } else if (targetBase === 'ja' && hasJa) {
        isSame = true;
      } else if (targetBase === 'ko' && hasKo) {
        isSame = true;
      } else if (targetBase === 'he' && LANGUAGE_PATTERNS['he']?.test(query)) {
        isSame = true;
      } else if (LATIN_BASED_LANGS.has(targetBase) && hasLatinEx) {
        isSame = true;
      } else if (LANGUAGE_PATTERNS[targetBase]?.test(query)) {
        isSame = true;
      }
    }

    if (isSame) {
      const result = { basic: query, phonetic: "", dictData: [], examples: [], isSameLang: true, timestamp: Date.now() };
      wordTranslationCache.set(query.toLowerCase(), result);
      return result;
    }
    // chrome.i18n检测同理
    try {
      const detection = await new Promise((resolve) => {
        if (!chrome.i18n || !chrome.i18n.detectLanguage) return resolve(null);
        chrome.i18n.detectLanguage(query, resolve);
      });
      if (detection && detection.isReliable) {
        const detected = detection.languages[0].language.toLowerCase();
        // 外部有hint时，不信任chrome检测结果
        if (!hintInputLang && detected === targetBase) {
          return { basic: query, isSameLang: true, timestamp: Date.now() };
        }
      }
    } catch (e) { }
  }

  //缓存
  const cacheKey = getCacheKey(query, engine, lang);
  const isAI = AI_LLM_WHITE_LIST.includes(engine);
  try {
    if (!forceRefresh && !isBatch) {
      logger.log('[lookupCache] query:', JSON.stringify(query));
      const hit = await lookupCache(query, engine, lang);
      if (hit && !hit.result.isBatch) {
        const cached = hit.result;
        const basicStr = typeof cached.basic === 'string' ? cached.basic.trim() : '';
        if (basicStr.startsWith('{')) {
          await idb.remove(hit.hitKey);
          if (hit.singleKey && hit.singleKey !== hit.hitKey) await idb.remove(hit.singleKey);
        } else {
          cached.dictData = mergeDictData(cached.dictData);
          wordTranslationCache.set(query.toLowerCase(), cached);
          return cached;
        }
      }
    }
    pendingRequests.add(cacheKey);
    let response;
    try {
      response = await Promise.race([
        safeSendMessage({
          type: 'TRANSLATE',
          text: query,
          targetLang: lang,
          lightweight,
          needPhonetic,
          hintInputLang,
          hintLangA,
          hintLangB,
          hintSourceLang,
          cacheKey,
          isSubtitle: query.includes('⟦KT_') && isAI,
          fromPopup: fromPopup || false,
        }),
        new Promise(resolve => setTimeout(() => resolve({ error: 'TIMEOUT' }), 15000))
      ]);
      if (response === null) {
        return;
      }
      if (response.error) {
        if (response.error === 'TIMEOUT') {
          logger.warn("[Translate] 请求超时:", query);
        } else {
          logger.error("[Translate] 通讯错误:", response.error);
        }
      }
    } catch (err) {
      response = { error: err.message };
    } finally {
      pendingRequests.delete(cacheKey);
    }
    if (response && response.error && typeof response.error === 'string') {
      throw new Error(response.error);
    }
    //透传
    const data = response.currentTranslationResponse || response.result || response;
    let result = {
      basic: "",
      phonetic: "",
      sourcePhonetic: "",
      dictData: [],
      originalDictData: null,
      examples: [],
      wordForms: [],
      prototype: null,
      source: "",
      sourceUrl: "",
      isFallback: false,
      timestamp: Date.now()
    };
    if (typeof data === 'string') {
      // 解析JSON
      try {
        const parsed = JSON.parse(data);
        result.basic = parsed.basic || parsed.result || data;
        result.phonetic = parsed.phonetic || "";
        result.sourcePhonetic = parsed.sourcePhonetic || "";
        result.dictData = parsed.dictData || [];
        result.originalDictData = parsed.originalDictData || null;
        result.examples = parsed.examples || [];
        result.wordForms = parsed.wordForms || [];
        result.prototype = parsed.prototype || null;
        result.isFallback = parsed.isFallback || false;
        result.source = parsed.source || "";
        result.sourceUrl = parsed.sourceUrl || "";
        result.isPartial = parsed.isPartial || false;
      } catch {
        result.basic = data;
      }
    } else if (data && typeof data === 'object') {
      result.basic = data.basic || data.result || "";
      result.phonetic = data.phonetic || "";
      result.dictData = data.dictData || [];
      result.originalDictData = data.originalDictData || null;
      result.examples = data.examples || [];
      result.wordForms = data.wordForms || [];
      result.prototype = data.prototype || null;
      result.isFallback = data.isFallback || false;
      result.source = data.source || "";
      result.sourceUrl = data.sourceUrl || "";
      result.targetPhonetic = data.targetPhonetic || data.romaji || data.pinyin || data.transliteration || "";
      result.sourcePhonetic = data.sourcePhonetic || "";
      result.isPartial = data.isPartial || false;
    }
    if (result.basic && (!result.dictData || result.dictData.length === 0)) {
      if (isAI && !isBatch) {
        result.basic = result.basic.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
      } else {
        result.basic = result.basic.trim();
      }
    }
    // 归并重复pos的dictData
    result.dictData = mergeDictData(result.dictData);

    if (!skipCache) {
      if (result.basic || result.phonetic || result.dictData.length > 0 || result.isFallback) {

        // 脏数据检测：basic 是 JSON 字符串或大量重复词，跳过缓存写入
        const isJsonString = typeof result.basic === 'string'
          && (
            (result.basic.trimStart().startsWith('{')
              && result.basic.trimEnd().endsWith('}')
              && result.basic.includes('"basic"'))
            || result.basic.includes('"dictData"')
          );
        const isRepetitive = (() => {
          if (!result.basic) return false;
          const words = result.basic.split(/[,\s]+/).filter(Boolean);
          if (words.length <= 10) return false;
          const unique = new Set(words.map(w => w.toLowerCase()));
          return unique.size <= 2;
        })();

        if (!isJsonString && !isRepetitive) {
          await idb.set({ [cacheKey]: result });
        } else {
          logger.warn('[Cache] 脏数据跳过写入:', result.basic?.substring(0, 60));
        }

        if (forceRefresh) {
          const coreText = query
            .replace(/[\s\n\r\t.,!?;:。，！？、・「」]/g, "")
            .toLowerCase();
          const textFingerprint = typeof hash === 'function' ? hash(coreText) : coreText.substring(0, 50);
          const allCache = await idb.getAll('tr_');

          const keysToRemove = Object.keys(allCache).filter(k =>
            k.includes(textFingerprint) && k !== cacheKey
          );

          if (keysToRemove.length > 0) await Promise.all(keysToRemove.map(k => idb.remove(k)));
        }
      }
    }
    wordTranslationCache.set(query.toLowerCase(), result);
    lastTranslationResult = { ...result, word: query };
    return result;
  } catch (e) {
    lastTranslationResult = null;
    logger.error("Detailed Translation Error:", e);
    const errorText = e.message || e.toString() || "";
    const match = errorText.match(/400|401|402|404|429|500/);
    let displayMessage;
    if (match) {
      let errorCode = match[0];
      if (errorCode === "400" && errorText.toLowerCase().includes("balance")) {
        errorCode = "402";
      }
      const i18nMsg = getSafeMessage(`ERROR_${errorCode}`);
      displayMessage = `${i18nMsg || 'API Error'} (Code: ${match[0]})`;
    } else if (errorText.toLowerCase().includes("timeout")) {
      displayMessage = getSafeMessage("ERROR_TIMEOUT") || "Request Timeout";
    } else {
      displayMessage = getSafeMessage("ERROR_GENERIC") || "Translation failed";
    }
    return { basic: displayMessage, isError: true };
  } finally {
    pendingRequests.delete(cacheKey);
  }
}
async function refreshIcon() {
  const isYouTube = window.location.hostname.includes('youtube.com');
  const webActive = typeof isPageScanEnabled !== 'undefined' ? isPageScanEnabled : false;
  const subActive = isYouTube && (typeof isYTEnabled !== 'undefined' ? isYTEnabled : false);
  await safeSendMessage({
    action: "UPDATE_ICON",
    webActive: webActive,
    subActive: subActive
  });
}

const MiraUtils = {
  /**
   * 判断当前 URL 是否为受限页面
   */
  isRestrictedUrl: function (url) {
    if (!url) return true;

    const restrictedPrefixes = [
      'chrome://',
      'edge://',
      'about:',
      'chrome-extension://',
      'devtools://'
    ];

    const restrictedDomains = [
      'chrome.google.com/webstore',
      'chromewebstore.google.com'
    ];

    const isPrefixMatch = restrictedPrefixes.some(prefix => url.startsWith(prefix));
    const isDomainMatch = restrictedDomains.some(domain => url.includes(domain));

    return isPrefixMatch || isDomainMatch;
  },

  isYouTubeUrl: function (url) {
    if (!url) return false;
    return url.includes('youtube.com') || url.includes('youtu.be');
  }
};

//通知主题色配置
const NOTICE_THEMES = {
  info: {
    border: 'rgba(34, 197, 94, 0.4)',
    dot: '#22c55e',
    title: '#86efac',
    chevron: 'rgba(34, 197, 94, 0.7)',
    gotItBorder: 'rgba(34, 197, 94, 0.6)',
    gotItBg: 'rgba(34, 197, 94, 0.08)',
    gotItColor: '#86efac',
    divider: 'rgba(34, 197, 94, 0.15)',
    pulse: ['rgba(34,197,94,0.25)', 'rgba(34,197,94,0.9)'],
  },
  warning: {
    border: 'rgba(234, 179, 8, 0.4)',
    dot: '#eab308',
    title: '#fbbf24',
    chevron: 'rgba(235, 219, 70, 0.8)',
    gotItBorder: 'rgba(234, 179, 8, 0.6)',
    gotItBg: 'rgba(234, 179, 8, 0.08)',
    gotItColor: '#fbbf24',
    divider: 'rgba(234, 179, 8, 0.15)',
    pulse: ['rgba(234,179,8,0.25)', 'rgba(234,179,8,0.9)'],
  },
  urgent: {
    border: 'rgba(239, 68, 68, 0.4)',
    dot: '#ef4444',
    title: '#fca5a5',
    chevron: 'rgba(239, 68, 68, 0.8)',
    gotItBorder: 'rgba(239, 68, 68, 0.6)',
    gotItBg: 'rgba(239, 68, 68, 0.08)',
    gotItColor: '#fca5a5',
    divider: 'rgba(239, 68, 68, 0.15)',
    pulse: ['rgba(239,68,68,0.25)', 'rgba(239,68,68,0.9)'],
  }
};

function detectSourceLang(text) {
  if (!text) return null;
  // 已有的非拉丁脚本检测
  if (/\p{Script=Han}/u.test(text)) return 'zh';
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return 'ja';
  if (/\p{Script=Hangul}/u.test(text)) return 'ko';
  if (/\p{Script=Thai}/u.test(text)) return 'th';
  if (/\p{Script=Cyrillic}/u.test(text)) return 'ru';
  if (/\p{Script=Arabic}/u.test(text)) return 'ar';

  // 拉丁语系：通过特征字符区分
  if (/[äöüßÄÖÜ]/.test(text)) return 'de';           // 德语
  if (/[àâæçéèêëîïôœùûüÿ]/i.test(text)) return 'fr'; // 法语
  if (/[áéíóúüñ¿¡]/i.test(text)) return 'es';         // 西班牙语
  if (/[àèéìíîòóùú]/i.test(text)) return 'it';        // 意大利语
  if (/[ãõáéíóúâêô]/i.test(text)) return 'pt';        // 葡萄牙语
  if (/[åäöÅÄÖ]/.test(text)) return 'sv';             // 瑞典语/芬兰语

  // 纯拉丁字母，默认英语
  if (/^[a-zA-Z\s'-]+$/.test(text)) return 'en';

  return null; // 无法判断
}


const LANGS = [
  { value: 'auto', label: 'AUTO', en: 'Auto Detect' },
  { value: 'en', label: 'English', en: 'English' },
  { value: 'zh-CN', label: '简体中文 (Chinese Simplified)', en: 'Chinese Simplified' },
  { value: 'zh-TW', label: '繁體中文 (Chinese Traditional)', en: 'Chinese Traditional' },
  { value: 'ja', label: '日本語 (Japanese)', en: 'Japanese' },
  { value: 'ko', label: '한국어 (Korean)', en: 'Korean' },
  { type: 'sep', label: '—— Southeast Asia ——' },
  { value: 'id', label: 'Bahasa Indonesia (Indonesian)', en: 'Indonesian' },
  { value: 'ms', label: 'Bahasa Melayu (Malay)', en: 'Malay' },
  { value: 'th', label: 'ไทย (Thai)', en: 'Thai' },
  { value: 'vi', label: 'Tiếng Việt (Vietnamese)', en: 'Vietnamese' },
  { type: 'sep', label: '—— Middle East & South Asia ——' },
  { value: 'ar', label: 'العربية (Arabic)', en: 'Arabic' },
  { value: 'bn', label: 'বাংলা (Bengali)', en: 'Bengali' },
  { value: 'fa', label: 'فارسی (Persian)', en: 'Persian' },
  { value: 'hi', label: 'हिन्दी (Hindi)', en: 'Hindi' },
  { value: 'he', label: 'עברית (Hebrew)', en: 'Hebrew' },
  { value: 'tr', label: 'Türkçe (Turkish)', en: 'Turkish' },
  { type: 'sep', label: '—— Europe ——' },
  { value: 'de', label: 'Deutsch (German)', en: 'German' },
  { value: 'es', label: 'Español (Spanish)', en: 'Spanish' },
  { value: 'fr', label: 'Français (French)', en: 'French' },
  { value: 'it', label: 'Italiano (Italian)', en: 'Italian' },
  { value: 'pt', label: 'Português (Portuguese)', en: 'Portuguese' },
  { value: 'ru', label: 'Русский (Russian)', en: 'Russian' },
  { value: 'nl', label: 'Nederlands (Dutch)', en: 'Dutch' },
  { value: 'pl', label: 'Polski (Polish)', en: 'Polish' },
  { value: 'sv', label: 'Svenska (Swedish)', en: 'Swedish' },
  { value: 'uk', label: 'Українська (Ukrainian)', en: 'Ukrainian' },
  { value: 'bg', label: 'Български (Bulgarian)', en: 'Bulgarian' },
  { value: 'cs', label: 'Čeština (Czech)', en: 'Czech' },
  { value: 'da', label: 'Dansk (Danish)', en: 'Danish' },
  { value: 'et', label: 'Eesti (Estonian)', en: 'Estonian' },
  { value: 'el', label: 'Ελληνικά (Greek)', en: 'Greek' },
  { value: 'fi', label: 'Suomi (Finnish)', en: 'Finnish' },
  { value: 'hr', label: 'Hrvatski (Croatian)', en: 'Croatian' },
  { value: 'hu', label: 'Magyar (Hungarian)', en: 'Hungarian' },
  { value: 'lv', label: 'Latviešu (Latvian)', en: 'Latvian' },
  { value: 'lt', label: 'Lietuvių (Lithuanian)', en: 'Lithuanian' },
  { value: 'no', label: 'Norsk (Norwegian)', en: 'Norwegian' },
  { value: 'ro', label: 'Română (Romanian)', en: 'Romanian' },
  { value: 'sk', label: 'Slovenčina (Slovak)', en: 'Slovak' },
  { value: 'sl', label: 'Slovenščina (Slovenian)', en: 'Slovenian' },
  { value: 'ga', label: 'Gaeilge (Irish)', en: 'Irish' },
  { type: 'sep', label: '—— Africa ——' },
  { value: 'af', label: 'Afrikaans (Afrikaans)', en: 'Afrikaans' },
  { value: 'am', label: 'አማርኛ (Amharic)', en: 'Amharic' },
  { value: 'ha', label: 'Hausa (Hausa)', en: 'Hausa' },
  { value: 'sw', label: 'Kiswahili (Swahili)', en: 'Swahili' },
  { value: 'yo', label: 'Yorùbá (Yoruba)', en: 'Yoruba' },
  { value: 'zu', label: 'IsiZulu (Zulu)', en: 'Zulu' },
];


//剑桥词典URL 模板
const FORWARD = {
  // 双语词典 (Bilingual)
  'zh': 'english-chinese-simplified',
  'zh-cn': 'english-chinese-simplified',
  'zh-tw': 'english-chinese-traditional',
  'da': 'english-danish',
  'nl': 'english-dutch',
  'fr': 'english-french',
  'de': 'english-german',
  'id': 'english-indonesian',
  'it': 'english-italian',
  'ja': 'english-japanese',
  'no': 'english-norwegian',
  'pl': 'english-polish',
  'es': 'english-spanish',
  'pt': 'english-portuguese',
  // 半双语词典 (Semi-bilingual)
  'ar': 'english-arabic',
  'bn': 'english-bengali',
  'ca': 'english-catalan',
  'cs': 'english-czech',
  'gu': 'english-gujarati',
  'hi': 'english-hindi',
  'ko': 'english-korean',
  'ms': 'english-malay',
  'mr': 'english-marathi',
  'ru': 'english-russian',
  'ta': 'english-tamil',
  'te': 'english-telugu',
  'th': 'english-thai',
  'tr': 'english-turkish',
  'uk': 'english-ukrainian',
  'ur': 'english-urdu',
  'vi': 'english-vietnamese',
};

const REVERSE = {
  'zh': 'chinese-simplified-english',
  'zh-cn': 'chinese-simplified-english',
  'zh-tw': 'chinese-traditional-english',
  'ja': 'japanese-english',
  'ko': 'korean-english',
  'fr': 'french-english',
  'de': 'german-english',
  'es': 'spanish-english',
  'pt': 'portuguese-english',
  'it': 'italian-english',
  'nl': 'dutch-english',
  'da': 'danish-english',
  'no': 'norwegian-english',
  'pl': 'polish-english',
  'id': 'indonesian-english',
};
const LANG_DISPLAY = {
  'zh-tw': 'TW',
  'zh-hk': 'HK',
  'zh-cn': 'ZH',
};

