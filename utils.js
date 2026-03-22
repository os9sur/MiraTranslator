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

let _defaultEngineReady = safeGetStorage(['_defaultEngine']).then(res => {
    if (res._defaultEngine) _defaultEngine = res._defaultEngine;
});

async function getInitialActiveConfig() {
    await _defaultEngineReady;
    return { engine: _defaultEngine, data: {} };
}

function getRuntimeDefaultEngine() {
    return _defaultEngine;
}


let cachedSiteSettings = {};
let cachedGlobalConfig = { page: false, select: true, yt: true };
if (typeof chrome !== 'undefined' && chrome.storage) {
  safeGetStorage(['siteSettings', 'globalConfig'], (res) => {
    if (res.siteSettings) cachedSiteSettings = res.siteSettings;
    if (res.globalConfig) cachedGlobalConfig = res.globalConfig;
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
var isNoticeShowing = false;
function showUpdateNotice() {
  if (isNoticeShowing || document.getElementById('mira-update-notice')) return;
  isNoticeShowing = true;
  const div = document.createElement('div');
  div.id = 'mira-update-notice';
  const finalMsg = t("update_notice") === "update_notice"
    ? "MIRA 插件已更新，请点击此处刷新页面以继续使用!"
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
  const svgIcon = `
    <svg class="mira-refresh-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);">
      <path d="M23 4v6h-6"></path>
      <path d="M1 20v-6h6"></path>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
    </svg>
    `;
  div.innerHTML = `
  ${svgIcon}
  <span style="margin-left: 8px;">${finalMsg}</span>
`;
  div.onmouseenter = () => {
    div.style.background = '#374151';
    div.style.transform = 'translateY(-2px)';
    const svg = div.querySelector('.mira-refresh-svg');
    if (svg) svg.style.transform = 'rotate(360deg)';
  };
  div.onmouseleave = () => {
    div.style.background = '#1f2937';
    div.style.transform = 'translateY(0)';
    const svg = div.querySelector('.mira-refresh-svg');
    if (svg) svg.style.transform = 'rotate(0deg)';
  };
  div.onclick = () => location.reload();
  document.body.appendChild(div);
}
var i18nDict = {};
let isSynced = false;
function syncI18nDict(force = false) {
  if (isSynced && !force) return;
  const root = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : {});
  const dataKeys = ['i18nData', 'i18nContent', 'i18nEngineData', 'i18nStyleData', 'i18nDonateData', 'i18nSyncData', 'i18nCacheData', 'i18nThemeData', 'i18nYTData', 'i18nAttach1', 'i18nAttach2','i18nAttach3'];
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
  const root = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : {});
  const langEl = typeof document !== 'undefined' ? document.getElementById('targetLang') : null;
  let lang = forcedLang
    || root.currentTargetL
    || langEl?.value
    || root.currentConfig?.targetLanguage
    || navigator.language
    || 'en';
  const target = lang.replace('_', '-').toLowerCase();
  const short = target.split('-')[0];
  const dict = i18nDict[target] || i18nDict[short] || i18nDict["en"] || {};
  return dict[key] || key;
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
  'fr', 'de', 'es', 'it', 'nl', 'pt', 'sv', 'da', 'no', 'fi',
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
    return cleanChars.every(char => /[a-zA-Z]/.test(char));
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
    'zh-cn': '介词', 'zh-tw': '前置詞', 'ja': '前置詞', 'ko': '전치사',
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
function localizePos(pos, targetLang) {
  if (!pos || !targetLang) return pos;
  const entry = POS_MAP[pos.trim()];
  if (!entry) return pos;
  const langFull = targetLang.toLowerCase();
  const langShort = langFull.split('-')[0];
  return entry[langFull] || entry[langShort] || pos;
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
  'youdao',
  'bing'
];

const STORAGE_KEYS = {
    core: ['userConfigs', 'activeConfig', 'lastActiveId'],
    settings: ['siteSettings', 'customRules', 'uiConfig', 'scanConfig', 'userStyleConfig', 'ytStyleSettings', 'globalConfig'],
    sync: function() {
        return [...this.core, ...this.settings];
    },
    export: function() {
        return [...this.core, ...this.settings];
    }
};

async function safeGetStorage(keys) {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
    showUpdateNotice();
    return null;
  }
  if (IS_MAIN_WORLD) {
    return null;
  }
  try {
    return await chrome.storage.local.get(keys);
  } catch (e) {
    if (e.message.includes("context invalidated")) {
      showUpdateNotice();
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
  return { result: actualResult, hitKey, singleKey };
}
//通用翻译
let lastTranslationResult = null;
const wordTranslationCache = new Map();
async function getDetailedTranslation(text, forceRefresh = false, manualLang = null, options = {}) {
  if (!text) return null;
  const query = text.trim();
  if (!query) return null;
  if (/^\d+%?$/.test(query)) {
    return { basic: query, isSameLang: true };
  }
  const storage = await safeGetStorage(['activeConfig', 'targetLanguage']);
  if (!storage) return;
  const { skipCache = false, isBatch = false } = options;
  let engine = (
    storage.activeConfig?.engine ||
    (typeof currentEngine !== 'undefined' ? currentEngine : getRuntimeDefaultEngine())
  ).toLowerCase();
  let lang = (
    manualLang ||
    storage.targetLanguage ||
    navigator.language ||
    'zh-CN'
  ).replace('_', '-').toLowerCase();
  lang = lang.replace('_', '-').toLowerCase();
  const targetBase = lang.split('-')[0];
  const hasHan = LANGUAGE_PATTERNS['zh']?.test(query) || false;
  const hasJa = LANGUAGE_PATTERNS['ja']?.test(query) || false;
  const hasKo = LANGUAGE_PATTERNS['ko']?.test(query) || false;
  const hasLatinEx = LANGUAGE_PATTERNS['latinEx']?.test(query) || false;
  const isPureEnglish = LANGUAGE_PATTERNS['en']?.test(query) || false;
  if (!isBatch) {
    let isSame = false;
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
    if (isSame) {
      const result = { basic: query, phonetic: "", dictData: [], examples: [], isSameLang: true, timestamp: Date.now() };
      wordTranslationCache.set(query.toLowerCase(), result);
      return result;
    }
    try {
      const detection = await new Promise((resolve) => {
        if (!chrome.i18n || !chrome.i18n.detectLanguage) return resolve(null);
        chrome.i18n.detectLanguage(query, resolve);
      });
      if (detection && detection.isReliable) {
        const detected = detection.languages[0].language.toLowerCase();
        if (detected === targetBase) {
          return { basic: query, isSameLang: true, timestamp: Date.now() };
        }
      }
    } catch (e) { }
  } else {
  }
  const cacheKey = getCacheKey(query, engine, lang);
  const isAI = AI_LLM_WHITE_LIST.includes(engine);
  try {
    if (!forceRefresh && !isBatch) {
      const hit = await lookupCache(query, engine, lang);
      if (hit && !hit.result.isBatch) {
        wordTranslationCache.set(query.toLowerCase(), hit.result);
        return hit.result;
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
          isSubtitle: query.includes('⟦KT_') && isAI
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
    const data = response.currentTranslationResponse || response.result || response;
    let result = {
      basic: "",
      phonetic: "",
      dictData: [],
      examples: [],
      wordForms: [],
      prototype: null,
      source: "",
      isFallback: false,
      timestamp: Date.now()
    };
    if (typeof data === 'string') {
      result.basic = data;
    } else if (data && typeof data === 'object') {
      result.basic = data.basic || data.result || "";
      result.phonetic = data.phonetic || "";
      result.dictData = data.dictData || [];
      result.examples = data.examples || [];
      result.wordForms = data.wordForms || [];
      result.prototype = data.prototype || null;
      result.isFallback = data.isFallback || false;
      result.source = data.source || "";
    }
    if (result.basic && (!result.dictData || result.dictData.length === 0)) {
      if (isAI && !isBatch) {
        result.basic = result.basic.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
      } else {
        result.basic = result.basic.trim();
      }
    }
    if (!skipCache) {
      if (result.basic || result.phonetic || result.dictData.length > 0 || result.isFallback) {
        await idb.set({ [cacheKey]: result });

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
      const i18nMsg = chrome.i18n.getMessage(`ERROR_${errorCode}`);
      displayMessage = `${i18nMsg || 'API Error'} (Code: ${match[0]})`;
    } else if (errorText.toLowerCase().includes("timeout")) {
      displayMessage = chrome.i18n.getMessage("ERROR_TIMEOUT") || "Request Timeout";
    } else {
      displayMessage = chrome.i18n.getMessage("ERROR_GENERIC") || "Translation failed";
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
