/**
 * Mira Translator
 * Copyright (C) 2026 David Bai 
 * License: AGPL-3.0 (https://github.com/os9sur)
 * Contact: mira.studio@proton.me
 */
if (typeof chrome.identity === 'undefined') {
  chrome.identity = {
    getRedirectURL: () => '',
    launchWebAuthFlow: () => Promise.reject(new Error('identity not supported')),
    getAuthToken: (_, cb) => cb && cb(null)
  };
}

window.browser = (function () {
  return window.msBrowser || window.browser || window.chrome;
})();
let activeTab = null;
let currentMode = 'current';
const CACHE_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_SIZE = 200;
let currentTranslationResponse = null;

// //新用户蒙层
// async function initOnboarding() {
//   const tab = await getActiveTab();
//   const url = tab?.url || "";

//   // 受限页面，直接退出，不显示蒙层
//   if (MiraUtils.isRestrictedUrl(url)) {
//     return;
//   }
//   const guideEl = document.getElementById('welcome-guide');
//   const targetBox = document.getElementById('targetLangCombox');
//   const labelEl = document.getElementById('targetLangLabelText');
//   const selectEl = document.getElementById('targetLang');
//   const storageKey = 'mira_onboarding_v1';

//   const completeOnboarding = () => {
//     if (!guideEl || guideEl.style.display === 'none') return;
//     if (labelEl) labelEl.style.display = 'block';
//     localStorage.setItem(storageKey, 'true');
//     guideEl.style.transition = 'opacity 0.4s ease';
//     guideEl.style.opacity = '0';

//     setTimeout(() => {
//       guideEl.style.display = 'none';
//       targetBox.classList.remove('first-time-highlight');
//       //  蒙层消失时，恢复原生高度，不再占用多余空间
//       // document.body.style.minHeight = '';
//     }, 400);
//   };

//   if (!localStorage.getItem(storageKey)) {
//     if (labelEl) labelEl.style.display = 'none';
//     //  强制撑开 popup 窗口，保证蒙层内容完全展示
//     //document.body.style.minHeight = '0';

//     guideEl.style.display = 'flex';
//     targetBox.classList.add('first-time-highlight');
//     document.getElementById('close-guide-btn').onclick = completeOnboarding;

//     if (selectEl) {
//       selectEl.addEventListener('mousedown', () => {
//         // 500ms 后自动关掉蒙层 
//         setTimeout(completeOnboarding, 500);
//       });
//     }
//     // 点击蒙层背景关闭 
//     guideEl.addEventListener('click', (e) => {
//       if (e.target === guideEl) completeOnboarding();
//     });
//   } else {
//     // 非第一次加载，Label 显示
//     if (labelEl) labelEl.style.display = 'block';
//   }
// }

async function initUpdateNotify() {
  let activeVocab = [];
  try {
    const vocabulary = await idb.vocabulary.getAll();
    activeVocab = vocabulary.filter(item => !item.deleted);
  } catch (e) {
    logger.error("Failed to fetch vocabulary", e);
  }

  const guideEl = document.getElementById('welcome-guide');
  if (!guideEl) return;

  const exportBtnHtml = activeVocab.length > 0 ? `
  <button id="notice-export-btn" style="
    background: #fcfcfc;
    color: #555;
    border: 1px solid #dcdcdc;
    border-radius: 8px;
    padding: 10px 20px;
    font-size: 13px;
    cursor: pointer;
    margin-bottom: 12px;
    width: 100%;
    pointer-events: auto;
    transition: all 0.2s;
  ">${t('notice.export', null, activeVocab.length)}</button>
` : '';


  guideEl.innerHTML = `
  <div style="
    background: #fff;
    border-radius: 20px;
    padding: 36px 28px;
    text-align: center;
    max-width: 320px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    box-shadow: 0 12px 48px rgba(0,0,0,0.18);
  ">
    <div style="font-size: 40px; margin-bottom: 20px;">✨</div>
    <h3 style="margin: 0 0 14px; font-size: 16px; font-weight: 600; color: #1a1a1a;">
      ${t('notice.title')}
    </h3>
    <div style="font-size: 13px; color: #555; line-height: 1.8; margin: 0 0 24px; text-align: left;">
      <p style="margin: 0 0 10px;"><strong> </strong></p>
      <p style="margin: 0;">${t('notice.body')}</p>
    </div>
    ${exportBtnHtml}
    <button id="notice-close-btn" style="
      background: #1890ff;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 12px 28px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      pointer-events: auto;
      width: 100%;
      box-shadow: 0 4px 12px rgba(24,144,255,0.2);
    ">${t('notice.close')}</button>
  </div>
`;

  guideEl.style.display = 'flex';
  guideEl.style.opacity = '1';
  guideEl.style.zIndex = '9999';

  if (activeVocab.length > 0) {
    const exportBtn = document.getElementById('notice-export-btn');
    exportBtn.addEventListener('click', async () => {
      activeVocab.sort((a, b) => (b.date || 0) - (a.date || 0));
      let csvContent = `\ufeff${_t('word')},${_t('meaning')},${_t('note')},Context,Source,URL,${_t('addTime')}\n`;

      activeVocab.forEach(item => {
        let transText = "";
        if (typeof item.trans === 'object' && item.trans !== null) {
          const basic = item.trans.basic || "";
          let detail = "";
          if (Array.isArray(item.trans.dictData)) {
            detail = item.trans.dictData.map(d => {
              const pos = d.pos ? `${d.pos} ` : "";
              const meanings = Array.isArray(d.meanings)
                ? d.meanings.join(' ')
                : (d.meanings || d.definition || "");
              return `${pos}${meanings}`;
            }).join(' | ');
          }
          transText = basic + (detail ? ` [${detail}]` : "");

          //  例句
          if (Array.isArray(item.trans.examples) && item.trans.examples.length > 0) {
            const exampleText = item.trans.examples.slice(0, 3).map(s => {
              const en = typeof s === 'string' ? s : (s.en || s.sentence || "");
              const cn = typeof s === 'object' ? (s.cn || s.translation || "") : "";
              return cn ? `${en} (${cn})` : en;
            }).join(' / ');
            transText += ` | Examples: ${exampleText}`;
          }

        } else {
          transText = item.trans || "";
        }

        //  上下文
        const context = item.trans?.context || "";
        const contextTranslation = item.trans?.contextTranslation || "";
        const contextText = context
          ? (contextTranslation ? `${context} (${contextTranslation})` : context)
          : "";

        const safeWord = (item.word || "").replace(/"/g, '""');
        const safeTrans = transText.replace(/"/g, '""').replace(/\r?\n|\r/g, ' ');
        const safeNote = (item.note || "").replace(/"/g, '""').replace(/\r?\n|\r/g, ' ');
        const safeTitle = (item.title || "").replace(/"/g, '""');
        const safeUrl = (item.src || "").replace(/"/g, '""');
        const safeContext = contextText.replace(/"/g, '""').replace(/\r?\n|\r/g, ' ');
        const time = new Date(item.date).toLocaleString().replace(/,/g, ' ');
        csvContent += `"${safeWord}","${safeTrans}","${safeNote}","${safeContext}","${safeTitle}","${safeUrl}","${time}"\n`;
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Mira_Vocabulary_Backup_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    });

    exportBtn.addEventListener('mouseenter', () => exportBtn.style.background = '#f0f0f0');
    exportBtn.addEventListener('mouseleave', () => exportBtn.style.background = '#fcfcfc');
  }

  document.getElementById('notice-close-btn').onclick = () => {
    window.close();
  };
}
document.addEventListener('DOMContentLoaded', async () => {
  if (navigator.maxTouchPoints > 0 && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    document.body.style.width = '100vw';
    document.body.style.maxWidth = '100vw';
    document.body.style.minWidth = 'unset';
    document.body.style.margin = '0';
    document.body.style.padding = '12px';
    document.body.style.borderRadius = '0';
  }

  if (showNotice) {
    initUpdateNotify();
    return;
  }

  const shown = await safeGetStorage('review_page_shown_v1');
  if (!shown?.review_page_shown_v1) {
    const installData = await safeGetStorage('install_time');
    const installTime = installData?.install_time || Date.now();
    const daysSinceInstall = (Date.now() - installTime) / (1000 * 60 * 60 * 24);
    const usageData = await safeGetStorage('usage_count');
    const activeDaysData = await safeGetStorage('active_days');
    const activeDaysCount = activeDaysData?.active_days?.length || 0;

    const MIN_DAYS = 180;
    const MIN_ACTIVE_DAYS = 120;

    if (daysSinceInstall >= MIN_DAYS && activeDaysCount >= MIN_ACTIVE_DAYS) {
      await safeSetStorage({ review_page_shown_v1: true });
      const { browser, timezone } = getDeviceInfo();
      trackEvent('review_page_shown', {
        browser_lang: navigator.language,
        timezone,
        browser,
        days_since_install: Math.floor(daysSinceInstall),
        active_days: activeDaysCount,
        usage_count: usageData?.usage_count || 0,
        trigger: 'popup',
      });
      chrome.tabs.create({ url: chrome.runtime.getURL("review.html") });
    }
  }

  initNoticeBar('popup');

  //await initOnboarding();
  const btnLogin = document.getElementById('btnLogin');
  const btnAvatar = document.getElementById('btnAvatar');
  if (btnLogin) btnLogin.style.display = 'none';
  if (btnAvatar) btnAvatar.style.display = 'none';

  function showPanel(panelId) {
    const allPanels = [
      'mainContainer',
      'syncSettingsPanel',
      'settingsPanel',
      'styleSettingsPanel',
      'advancedMenu'
    ];
    allPanels.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === 'styleSettingsPanel') {
        el.classList.remove('active');
      } else {
        el.style.display = 'none';
      }
    });

    const target = document.getElementById(panelId);
    if (!target) return;
    if (panelId === 'styleSettingsPanel') {
      target.classList.add('active');
    } else {
      target.style.display = 'flex';
    }

    document.body.style.height = '';
    document.body.style.minHeight = 'fit-content';
    document.body.style.maxHeight = '';
    window.scrollTo(0, 0);
  }

  function showMain() {
    const allPanels = [
      'syncSettingsPanel',
      'settingsPanel',
      'advancedMenu'
    ];
    allPanels.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    document.getElementById('styleSettingsPanel')?.classList.remove('active');

    const main = document.getElementById('mainContainer');
    if (main) main.style.display = 'block';

    document.body.style.height = '';
    document.body.style.minHeight = 'fit-content';
    document.body.style.maxHeight = '';
    window.scrollTo(0, 0);
  }

  const res_uiLanguage = await safeGetStorage('ui_language');
  if (res_uiLanguage) {
    window.currentConfig = {
      ui_language: res_uiLanguage.ui_language || (getBrowserLang() || 'en').replace('_', '-')
    };
  }

  populateSelect(document.getElementById('targetLang'), { selected: 'ja' });
  populateSelect(document.getElementById('lpSelA'), { includeAuto: true, selected: 'auto' });
  populateSelect(document.getElementById('lpSelB'), { selected: 'ja' });

  // ── 语言对初始化
  async function initLangPair() {
    const r = await safeGetStorage(['lpLangA', 'lpLangB']);
    const langA = r?.lpLangA || 'auto';
    const langB = r?.lpLangB || getBrowserLang() || 'ja';

    const selA = document.getElementById('lpSelA');
    const selB = document.getElementById('lpSelB');
    if (selA) selA.value = langA;
    if (selB) selB.value = langB;
    updateLpBadges();

    const rtl = checkRTL(langB);
    const arrow = document.getElementById('lpArrow');
    const toggle = document.getElementById('langPairToggle');
    if (arrow) arrow.textContent = rtl ? '←' : '→';
    if (toggle) toggle.style.flexDirection = rtl ? 'row-reverse' : 'row';
  }

  function updateLpBadges() {
    const selA = document.getElementById('lpSelA');
    const selB = document.getElementById('lpSelB');
    const badgeA = document.getElementById('lpBadgeA');
    const badgeB = document.getElementById('lpBadgeB');
    if (!selA || !selB || !badgeA || !badgeB) return;

    const getShortEn = (val) => {
      if (val === 'auto') return 'AUTO';
      const key = val.toLowerCase();
      if (LANG_DISPLAY[key]) return LANG_DISPLAY[key];
      if (key === 'ja') return 'JA';
      if (key === 'en') return 'EN';
      if (key === 'ko') return 'KO';
      const lang = LANGS.find(item => item.value === val);
      if (lang) return lang.en.slice(0, 2).toUpperCase();
      return val.slice(0, 2).toUpperCase();
    };

    badgeA.textContent = getShortEn(selA.value);
    badgeB.textContent = getShortEn(selB.value);
    window.hintSourceLang = selA.value;

    const rtl = checkRTL(selB.value);
    const arrow = document.getElementById('lpArrow');
    const toggle = document.getElementById('langPairToggle');
    if (arrow) arrow.textContent = rtl ? '←' : '→';
    if (toggle) toggle.style.flexDirection = rtl ? 'row-reverse' : 'row';
  }

  // 语言对 UI 事件绑定
  function bindLangPairEvents() {
    document.getElementById('langPairToggle')?.addEventListener('click', () => {
      document.getElementById('langPairTag').style.display = 'none';

      const editEl = document.getElementById('langPairEdit');
      editEl.style.display = 'flex';

      const selB = document.getElementById('lpSelB');
      const rtl = checkRTL(selB?.value);
      editEl.style.flexDirection = rtl ? 'row-reverse' : 'row';

      const arrow = document.getElementById('lpArrow');
      if (arrow) arrow.textContent = '⇄';
    });

    document.getElementById('lpDoneBtn')?.addEventListener('click', async () => {
      updateLpBadges();

      const selB = document.getElementById('lpSelB');
      const rtl = checkRTL(selB?.value);
      document.getElementById('langPairEdit').style.flexDirection = rtl ? 'row-reverse' : 'row';

      document.getElementById('langPairEdit').style.display = 'none';
      document.getElementById('langPairTag').style.display = 'flex';
      await safeSetStorage({
        lpLangA: document.getElementById('lpSelA').value,
        lpLangB: document.getElementById('lpSelB').value,
      });
    });

    document.getElementById('lpSwapBtn')?.addEventListener('click', () => {
      const a = document.getElementById('lpSelA');
      const b = document.getElementById('lpSelB');
      if (a.value === 'auto') return;
      [a.value, b.value] = [b.value, a.value];
      updateLpBadges();

      const rtl = checkRTL(b.value);
      document.getElementById('langPairEdit').style.flexDirection = rtl ? 'row-reverse' : 'row';
    });
  }
  initLangPair();
  bindLangPairEvents();
  const myInput = document.getElementById('conf-minlen');
  if (myInput) {
    myInput.addEventListener('input', function () {
      if (this.value < 0) this.value = 0;
    });
  }
  const styledInput = document.getElementById('conf-minlen');
  if (styledInput) {
    styledInput.addEventListener('focus', function () {
      this.style.borderColor = '#38bdf8';
    });
    styledInput.addEventListener('blur', function () {
      this.style.borderColor = '#334155';
    });
  }
  async function updateCacheSizeDisplay() {
    const allData = await safeGetStorage(null);
    if (!allData) return;
    const keys = Object.keys(allData).filter(key => key.startsWith('tr_'));
    let totalBytes = 0;
    keys.forEach(key => {
      totalBytes += JSON.stringify(allData[key]).length * 2;
    });
    const sizeText = document.getElementById('cacheSizeText');
    if (sizeText) {
      if (totalBytes === 0) {
        sizeText.innerText = "0.0 KB";
      } else if (totalBytes < 1024 * 1024) {
        sizeText.innerText = `${(totalBytes / 1024).toFixed(1)} KB`;
      } else {
        sizeText.innerText = `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`;
      }
    }
  }
  async function saveSyncConfig() {
    const config = {
      method: document.getElementById('syncMethod').value,
      webdavUrl: document.getElementById('webdavUrl').value.trim(),
      webdavUser: document.getElementById('webdavUser').value.trim(),
      webdavPass: document.getElementById('webdavPass').value,
      frequency: parseInt(document.getElementById('syncFrequency').value, 10) || 60
    };
    await safeSetStorage({ syncConfig: config });
    logger.log("💾 [Config Saved]:", config);
  }
  ['webdavUrl', 'webdavUser', 'webdavPass', 'syncFrequency', 'syncMethod'].forEach(id => {
    document.getElementById(id).onchange = saveSyncConfig;
  });
  document.getElementById('exportJson').onclick = async () => {
    const configKeys = STORAGE_KEYS.export();
    const data = await safeGetStorage(configKeys);
    if (!data) return;
    if (data.userConfigs && Array.isArray(data.userConfigs)) {
      const dynamicKeys = data.userConfigs.map(item => `data_${item.id}`);
      const dynamicData = await safeGetStorage(dynamicKeys);
      if (!dynamicData) return;
      Object.assign(data, dynamicData);
    }
    try {
      const vocabularyList = await safeSendMessage({ type: 'IDB_GET_ALL', prefix: 'vb_' });
      const list = Array.isArray(vocabularyList)
        ? vocabularyList
        : Object.values(vocabularyList || {});
      data.vocabulary = list.filter(item => !item.deleted);
    } catch (err) {
      logger.error("Export Vocabulary failed:", err);
      data.vocabulary = [];
    }
    const hasConfig = Object.keys(data).length > 1;
    const hasVocab = data.vocabulary && data.vocabulary.length > 0;
    if (!hasConfig && !hasVocab) {
      showToast(t('noExportWords'));
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `MiraTrans_Backup_${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`${t('export')} ${t('success')}!`, "success");
  };
  document.getElementById('importJson').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const importedData = JSON.parse(event.target.result);
          const allValidKeys = [...STORAGE_KEYS.sync(), 'vocabulary'];
          const hasValidData = allValidKeys.some(key =>
            Object.prototype.hasOwnProperty.call(importedData, key)
          );
          if (!hasValidData) throw new Error(t('invalidConfigFile'));
          const incomingVocabulary = Array.isArray(importedData.vocabulary) ? importedData.vocabulary : [];
          delete importedData.vocabulary;
          if (importedData.apiKeys && !importedData.userConfigs) {
            const oldEngine = importedData.selectedEngine || _defaultEngine;
            const oldApiKeys = importedData.apiKeys || {};
            const migrationId = 'inst_migrated_' + Date.now();
            importedData.userConfigs = [{
              id: migrationId,
              engine: oldEngine,
              alias: `Imported_${oldEngine}`
            }];
            importedData[`data_${migrationId}`] = oldApiKeys;
            importedData.activeConfig = {
              id: migrationId,
              engine: oldEngine,
              data: oldApiKeys
            };
            importedData.lastActiveId = migrationId;
            delete importedData.apiKeys;
            delete importedData.selectedEngine;
          }
          await safeSetStorage(importedData);
          if (incomingVocabulary.length > 0) {
            const promises = incomingVocabulary.map(item => {
              const word = item.word || item.w;
              if (!word) return Promise.resolve();
              return idb.vocabulary.add(word, item);
            });
            await Promise.all(promises);
          }
          const allWords = await idb.vocabulary.getAll();
          const finalCount = allWords.filter(item => !item.deleted).length;
          showToast(
            `${t('importSuccess')} ${finalCount} ${t('importSuccessCount')}`,
            'success'
          );
        } catch (err) {
          logger.error("Import Error:", err);
          showToast(t('importFailed') + ": " + err.message, 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };
  document.getElementById('openSyncPanel').onclick = (e) => {
    e.stopPropagation();
    showPanel('syncSettingsPanel');
    if (typeof refreshUI === 'function') refreshUI();
  };
  //快捷键设置菜单
  document.getElementById('openShortcutSettings').onclick = (e) => {
    e.stopPropagation();

    const isFirefox = typeof browser !== 'undefined' && navigator.userAgent.includes('Firefox');

    if (isFirefox) {
      navigator.clipboard.writeText('about:addons').then(() => {
        showToast(t('shortcutCopied', globalUiLang), 'info', 8000);
      }).catch(() => {
        showToast(t('shortcutManual', globalUiLang), 'info', 8000);
      });
      return;
    }

    if (chrome.commands?.openShortcutSettings) {
      chrome.commands.openShortcutSettings();
      return;
    }

    const isEdge = navigator.userAgent.includes('Edg/');
    const url = isEdge ? 'edge://extensions/shortcuts' : 'chrome://extensions/shortcuts';

    chrome.tabs.create({ url }, () => {
      if (chrome.runtime.lastError) {
        navigator.clipboard.writeText(url).then(() => {
          showToast(`Link copied (${url}), please paste it into the address bar`, 'info', 8000);
        }).catch(() => {
          showToast(url, 'info', 8000);
        });
      }
    });
  };
  document.getElementById('closeSyncPanel').onclick = () => {
    showMain();
  };

  document.getElementById('syncFrequency').onchange = async function () {
    const newFreq = parseInt(this.value);
    const data = await safeGetStorage('syncConfig');
    if (!data) return;
    const newConfig = { ...(data.syncConfig || {}), frequency: newFreq };
    await safeSetStorage({ syncConfig: newConfig });
  };

  document.getElementById('autoSyncToggle').onclick = async function () {
    this.classList.toggle('active');
    const isActive = this.classList.contains('active');
    const freqArea = document.getElementById('syncFrequencyArea');
    freqArea.style.opacity = isActive ? '1' : '0.5';
    freqArea.style.pointerEvents = isActive ? 'auto' : 'none';
    const freqSelect = document.getElementById('syncFrequency');
    const currentFreq = parseInt(freqSelect.value) || 60;
    const data = await safeGetStorage('syncConfig');
    if (!data) return;
    const newConfig = { ...(data.syncConfig || {}), frequency: currentFreq };
    await safeSetStorage({
      autoSync: isActive,
      syncConfig: newConfig
    });
    refreshUI();
  };
  document.getElementById('syncMethod').onchange = async (e) => {
    const selectedMethod = e.target.value;
    const isWebDAV = selectedMethod === 'webdav';
    const webdavArea = document.getElementById('webdavConfigArea');
    if (webdavArea) webdavArea.style.display = isWebDAV ? 'block' : 'none';
    const updatePopupHeight = () => {
      document.body.style.height = 'auto';
      document.body.style.minHeight = 'auto';
      requestAnimationFrame(() => {
        const syncPanel = document.getElementById('syncSettingsPanel');
        if (syncPanel) {
          const realHeight = syncPanel.scrollHeight;
          const finalHeight = Math.max(400, Math.min(realHeight, 600));
          document.body.style.height = `${finalHeight}px`;
          document.body.style.minHeight = `${finalHeight}px`;
          document.body.style.overflowY = realHeight > 600 ? 'auto' : 'hidden';
        }
      });
    };
    updatePopupHeight();

    const isFirefox = typeof InstallTrigger !== 'undefined' || /Firefox/.test(navigator.userAgent);
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

    if (selectedMethod === 'googleDrive') {
      logger.log("🔍 正在验证 Google Drive 授权...");
      const data = await safeGetStorage('google_drive_token');
      if (!data) return;

      if (isFirefox) {
        // Firefox 桌面 + Android
        if (!data.google_drive_token) {
          logger.log("🔑 Firefox 需要手动拉起授权...");
          showToast(t('notice.auth') || 'Please complete the authorization in the new tab and return here to retry.', 'info');
          safeSendMessage({ action: 'AUTH_FIREFOX' }).then((response) => {
            if (response?.success) {
              logger.log("✅ Firefox 授权成功");
              saveSyncConfig();
            } else {
              showToast(t('firefoxAuthIncomplete'), 'error');
            }
          });
        } else {
          logger.log("✅ Firefox 缓存 Token 存在");
          saveSyncConfig();
        }

      } else if (isMobile) {
        // 移动端 Edge：直接走 tab 授权，不碰 chrome.identity
        if (!data.google_drive_token) {
          logger.log("🔑 移动端 Edge 需要手动拉起授权...");
          showToast(t('notice.auth') || 'Please complete the authorization in the new tab and return here to retry.', 'info');
          safeSendMessage({ action: 'AUTH_TAB_FLOW' }).then((response) => {
            if (response?.success) {
              logger.log("✅ Google Drive 授权成功");
              saveSyncConfig();
            } else {
              logger.error("❌ 授权失败或取消");
            }
          });
        } else {
          logger.log("✅ 移动端 Edge 缓存 Token 存在");
          saveSyncConfig();
        }

      } else {
        // 桌面端 Chrome / Edge
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (chrome.runtime.lastError || !token) {
            logger.log("🔑 需要用户手动授权...");
            showToast(t('notice.auth') || 'Please complete the authorization in the new tab and return here to retry.', 'info');
            safeSendMessage({ type: 'START_AUTH' }).then((response) => {
              if (response?.success) {
                logger.log("✅ Google Drive 授权成功");
                saveSyncConfig();
              } else {
                logger.error("❌ 授权失败或取消");
              }
            });
          } else {
            logger.log("✅ Google Drive 授权有效");
            saveSyncConfig();
          }
        });
      }

    } else if (selectedMethod === 'oneDrive') {
      // OneDrive 授权分支
      logger.log("🔍 正在验证 OneDrive 授权...");
      const data = await safeGetStorage('onedrive_token');
      if (!data?.onedrive_token) {
        logger.log("🔑 OneDrive 需要用户手动授权...");
        showToast(t('notice.auth') || 'Please complete the authorization in the new tab and return here to retry.', 'info');
        safeSendMessage({ type: 'START_ONEDRIVE_AUTH' }).then((response) => {
          if (response?.success) {
            logger.log("✅ OneDrive 授权成功");
            saveSyncConfig();
          } else {
            logger.error("❌ OneDrive 授权失败或取消");
          }
        });
      } else {
        logger.log("✅ OneDrive 缓存 Token 存在");
        saveSyncConfig();
      }

    } else {
      saveSyncConfig();
    }
  };
  function updateSyncProgressUI(btnId, keyName, active) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const scroller = btn.querySelector('.sync-log-scroller');
    if (!active) {
      btn.classList.remove('syncing');
      return;
    }
    btn.classList.add('syncing');
    if (keyName) {
      scroller.innerHTML = `
              <div style="font-size: 8px; opacity: 0.5; margin-bottom: 2px;">SYNCING...</div>
              <div class="log-item">> ${keyName}</div>
          `;
    }
  }
  document.getElementById('manualSyncPush').onclick = async () => {
    await performUnifiedSync('manualSyncPush', 'push');
  };
  document.getElementById('manualSyncPull').onclick = async () => {
    await performUnifiedSync('manualSyncPull', 'pull');
  };
  async function performUnifiedSync(btnId, direction) {
    //logger.log('[DEBUG] IS_MAIN_WORLD:', IS_MAIN_WORLD);
    const btn = document.getElementById(btnId);
    const originalText = btn.innerText;
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    updateSyncProgressUI(btnId, 'initializing', true);
    await saveSyncConfig();
    const data = await safeGetStorage(['syncConfig', 'google_drive_token', 'ui_language', 'onedrive_token']);
    // logger.log('[DEBUG] onedrive_token 存在:', !!data?.onedrive_token);
    if (!data) return;
    window.uiLanguage = data.ui_language || (getBrowserLang() || 'en').replace('_', '-');
    const config = data.syncConfig || {};
    const method = config.method || 'googleDrive';
    if (!method || !['googleDrive', 'oneDrive', 'webdav'].includes(method)) {
      showToast(t('manualModeNoSync', window.uiLanguage), 'info');
      updateSyncProgressUI(btnId, '', false);
      return;
    }
    if (method === 'webdav') {
      if (!config.webdavUrl || !config.webdavUser || !config.webdavPass) {
        showToast(t('webdavConfigIncomplete', window.uiLanguage), 'error');
        updateSyncProgressUI(btnId, '', false);
        return;
      }
    }
    if (method === 'googleDrive' && !data.google_drive_token) {
      updateSyncProgressUI(btnId, 'authorizing', true);
      const isFirefox = typeof browser !== 'undefined' && /Firefox/.test(navigator.userAgent);

      if (isMobile) {
        showToast(t('notice.auth', window.uiLanguage) || 'Please complete the authorization in the new tab and return here to retry', 'info', 6000);
      }

      if (isFirefox) {
        // Firefox 桌面 + Android：走 AUTH_FIREFOX
        getGoogleTokenForFirefox(btn, originalText, direction);
      } else if (isMobile) {
        // 移动端 Edge（非 Firefox）：走 AUTH_TAB_FLOW
        performTabAuthFlow(btn, originalText, direction);
      } else {
        // 桌面端 Chrome / Edge：走 START_AUTH
        safeSendMessage({ type: 'START_AUTH' }).then((response) => {
          logger.log('[DEBUG] START_AUTH response:', response);
          if (!response) {
            updateSyncProgressUI(btnId, '', false);
            return;
          }
          if (response.success) {
            executeSyncDataAction(btn, originalText, direction);
          } else {
            updateSyncProgressUI(btnId, '', false);
          }
        });
      }
      return;
    }
    //  OneDrive 无 token 时先授权
    if (method === 'oneDrive' && !data.onedrive_token) {
      updateSyncProgressUI(btnId, 'authorizing', true);

      if (isMobile) {
        showToast(t('notice.auth', window.uiLanguage) || 'Please complete the authorization in the new tab and return here to retry', 'info', 6000);
      }

      safeSendMessage({ type: 'START_ONEDRIVE_AUTH' }).then((response) => {
        if (!response) { updateSyncProgressUI(btnId, '', false); return; }
        if (response.success) {
          executeSyncDataAction(btn, originalText, direction);
        } else {
          updateSyncProgressUI(btnId, '', false);
        }
      });
      return;
    }
    executeSyncDataAction(btn, originalText, direction);
  }
  async function executeSyncDataAction(btn, originalText, direction) {
    const btnId = btn.id;
    const baseKeys = ['userConfigs', 'activeConfig', 'lastActiveId', 'siteSettings', 'customRules', 'userStyleConfig', 'scanConfig', 'ytStyleSettings', 'ui_language'];
    const visualDelay = () => new Promise(r => setTimeout(r, 60));
    try {
      updateSyncProgressUI(btnId, direction === 'push' ? 'preparing_data' : 'checking_cloud', true);
      let localData = await safeGetStorage(baseKeys);
      if (!localData) return;
      if (localData.userConfigs && Array.isArray(localData.userConfigs)) {
        updateSyncProgressUI(btnId, 'mapping_configs', true);
        const dynamicKeys = localData.userConfigs.map(item => `data_${item.id}`);
        if (dynamicKeys.length > 0) {
          for (const dKey of dynamicKeys) {
            updateSyncProgressUI(btnId, dKey, true);
            await visualDelay();
          }
          const dynamicData = await safeGetStorage(dynamicKeys);
          if (!dynamicData) return;
          localData = { ...localData, ...dynamicData };
        }
      }
      window.uiLanguage = localData.ui_language || (getBrowserLang() || 'en').replace('_', '-');
      updateSyncProgressUI(btnId, direction === 'push' ? 'uploading_keys' : 'fetching_remote', true);
      btn.disabled = true;
      const response = await safeSendMessage({
        type: 'SYNC_DATA',
        direction: direction,
        payload: localData
      });
      if (!response) {
        btn.disabled = false;
        updateSyncProgressUI(btnId, '', false);
        return;
      }
      if (response.success) {
        const now = Date.now();
        if (direction === 'pull') {
          const merged = response.mergedData || {};
          const mergedKeys = Object.keys(merged).filter(k => !k.includes('vocabulary'));
          for (const mKey of mergedKeys.slice(0, 8)) {
            updateSyncProgressUI(btnId, `restore: ${mKey}`, true);
            await visualDelay();
          }
          updateSyncProgressUI(btnId, 'writing_idb', true);
          const storagePayload = { ...merged };
          delete storagePayload.vocabulary;
          delete storagePayload.idb_vocabulary;
          await safeSetStorage({
            ...storagePayload,
            lastSyncTime: now
          });
        }
        updateSyncProgressUI(btnId, 'done_success ✓', true);
        updateSyncStatusUI(now);
        showToast(direction === 'push' ? t('backupSuccess', window.uiLanguage) : t('restoreSuccess', window.uiLanguage), 'success');
        if (direction === 'pull') {
          setTimeout(async () => {
            if (typeof renderTable === 'function') await renderTable();
            if (typeof refreshPopupUI === 'function') refreshPopupUI();
          }, 100);
        }
      } else {
        if (response.error === 'onedrive_reauth_required') {
          updateSyncProgressUI(btnId, 'Reauthorizing...', true);
          safeSendMessage({ type: 'START_ONEDRIVE_AUTH' }).then(async (authRes) => {
            const tokenData = await safeGetStorage('onedrive_token');
            if (tokenData?.onedrive_token) {
              executeSyncDataAction(btn, originalText, direction);
            } else {
              updateSyncProgressUI(btnId, 'sync_failed ✕', true);
              setTimeout(() => {
                btn.disabled = false;
                updateSyncProgressUI(btnId, '', false);
              }, 1500);
            }
          });
          return;
        }

        if (response.error?.includes('401') || response.error?.includes('Unauthorized')) {
          updateSyncProgressUI(btnId, 'Reauthorizing...', true);
          const syncData = await safeGetStorage('syncConfig');
          const currentMethod = syncData?.syncConfig?.method || 'googleDrive';

          if (currentMethod === 'oneDrive') {
            safeSendMessage({ type: 'ONEDRIVE_SILENT_REFRESH' }).then(async (refreshRes) => {
              if (refreshRes?.success) {
                executeSyncDataAction(btn, originalText, direction);
              } else {
                await safeRemoveStorage('onedrive_token');
                safeSendMessage({ type: 'START_ONEDRIVE_AUTH' }).then(async (authRes) => {
                  const tokenData = await safeGetStorage('onedrive_token');
                  if (tokenData?.onedrive_token) {
                    executeSyncDataAction(btn, originalText, direction);
                  } else {
                    btn.disabled = false;
                    updateSyncProgressUI(btnId, '', false);
                  }
                });
              }
            });
          } else {
            await safeRemoveStorage('google_drive_token');
            if (typeof getGoogleTokenForFirefox === 'function') {
              return getGoogleTokenForFirefox(btn, originalText, direction);
            }
            safeSendMessage({ type: 'START_AUTH' }).then(async (authRes) => {
              const tokenData = await safeGetStorage('google_drive_token');    // await 生效
              if (tokenData?.google_drive_token) {                             //  读 storage 判断
                executeSyncDataAction(btn, originalText, direction);
              } else {
                btn.disabled = false;
                updateSyncProgressUI(btnId, '', false);
              }
            });
          }
          return; // 阻止底部 setTimeout 提前重置 UI
        } else {
          updateSyncProgressUI(btnId, 'sync_failed ✕', true);
          showToast(`${t('syncFailed', window.uiLanguage)} ` + (response.error || t('unknownError', window.uiLanguage)), 'error');
        }
      }
      setTimeout(() => {
        btn.disabled = false;
        updateSyncProgressUI(btnId, '', false);
      }, 1500);
    } catch (err) {
      updateSyncProgressUI(btnId, 'error_catch', true);
      btn.disabled = false;
      setTimeout(() => updateSyncProgressUI(btnId, '', false), 1500);
    }
  }
  async function getGoogleTokenForFirefox(btn, originalText, direction) {
    const response = await safeSendMessage({ action: "AUTH_FIREFOX" });
    if (!response) {
      if (btn) btn.innerText = originalText;
      if (btn) updateSyncProgressUI(btn.id, '', false);
      return;
    }
    if (response.success) {
      logger.log("[Mira-LOG] Firefox 授权成功");
      executeSyncDataAction(btn, originalText, direction);
    } else {
      showToast(t('firefoxAuthIncomplete'), 'error');
      if (btn) btn.innerText = originalText;
      if (btn) updateSyncProgressUI(btn.id, '', false);
    }
  }
  async function performTabAuthFlow(btn, originalText, direction) {
    const response = await safeSendMessage({ action: 'AUTH_TAB_FLOW' });
    if (!response) {
      if (btn) btn.innerText = originalText;
      if (btn) updateSyncProgressUI(btn.id, '', false);
      return;
    }
    if (response.success) {
      logger.log("[Mira-LOG] 移动端 tab 授权成功");
      executeSyncDataAction(btn, originalText, direction);
    } else {
      showToast(t('authFailed', window.uiLanguage) || 'Authorization failed', 'error');
      if (btn) btn.innerText = originalText;
      if (btn) updateSyncProgressUI(btn.id, '', false);
    }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.lastSyncTime) {
      updateSyncStatusUI(changes.lastSyncTime.newValue);
    }
  });
  function updateSyncStatusUI(time) {
    const statusEl = document.getElementById('syncStatus');
    if (!statusEl) return;
    if (time) {
      const timeStr = new Date(time).toLocaleString();
      statusEl.innerText = `${t('lastSync')} ${timeStr}`;
      statusEl.style.color = '#94a3b8';
    } else {
      statusEl.innerText = t('neverSynced', globalUiLang) || 'Not synced';
    }
  }
  function toggleStyleTab(type) {
    const isWeb = type === 'web';
    document.querySelectorAll('.style-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    const activeTab = document.getElementById(`tab-${type}`);
    activeTab.classList.add('active');
    document.getElementById('webStyleControls').style.display = isWeb ? 'block' : 'none';
    document.getElementById('ytStyleControls').style.display = !isWeb ? 'block' : 'none';
    document.getElementById('preview-web-box').style.display = isWeb ? 'block' : 'none';
    document.getElementById('preview-yt-box').style.display = !isWeb ? 'block' : 'none';
    const container = document.getElementById('stylePreviewContainer');
    if (isWeb) {
      container.style.backgroundColor = '#0f172a';
      container.style.backgroundImage = 'none';
    } else {
      container.style.backgroundColor = '#222';
      container.style.backgroundImage = `
        linear-gradient(45deg, #333 25%, transparent 25%), 
        linear-gradient(-45deg, #333 25%, transparent 25%), 
        linear-gradient(45deg, transparent 75%, #333 75%), 
        linear-gradient(-45deg, transparent 75%, #333 75%)
      `;
      container.style.backgroundSize = '20px 20px';
      container.style.backgroundPosition = '0 0, 0 10px, 10px 10px, 10px 0';
    }
    if (typeof updatePreview === 'function') {
      updatePreview();
    }
  }
  const langRes = await safeGetStorage(['targetLanguage']);
  if (!langRes) return;
  const effectiveLang = langRes.targetLanguage || getBrowserLang();
  const targetLang = effectiveLang.replace('_', '-');
  if (!langRes.targetLanguage) {
    await safeSetStorage({ targetLanguage: targetLang });
  }

  initUILanguage();
  const data = await safeGetStorage({
    activeConfig: { engine: _defaultEngine, data: {} },
    globalConfig: { page: globalDefault_Page, select: globalDefault_Select, yt: globalDefault_YT },
    siteSettings: {},
    targetLanguage: targetLang,
    scanConfig: {
      global: { selectors: "p", minLen: 5 },
      custom: {}
    },
    userStyleConfig: {
      color: '#ffffff',
      fontSize: '16',
      borderColor: '#38bdf8',
      borderType: 'solid',
      isBlur: false
    },
    ytStyleSettings: {
      fontSize: 25,
      bgOpacity: 0.4,
      color: '#38bdf8'
    }
  });
  if (!data) return;
  window.currentConfig = data;
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mode') === 'settings') {
    document.documentElement.classList.add('full-screen-mode');
    document.body.classList.add('full-screen-mode');
    if (document.getElementById('closeSettings')) document.getElementById('closeSettings').style.display = 'none';
    const main = document.getElementById('mainContainer');
    if (main) main.style.display = 'none';
    const settingsPanel = document.getElementById('settingsPanel');
    if (settingsPanel) settingsPanel.style.display = 'flex';
    const currentTab = urlParams.get('tab');
    if (currentTab === 'sync') {
      logger.log("[Mira-LOG] 正在切换至：云同步面板");
      if (settingsPanel) {
        settingsPanel.style.setProperty('display', 'none', 'important');
      }
      const syncSettingsPanel = document.getElementById('syncSettingsPanel');
      if (syncSettingsPanel) {
        syncSettingsPanel.style.setProperty('display', 'flex', 'important');
      }
    } else {
      logger.log("[Mira-LOG] 正在切换至：引擎配置面板");
      const syncSettingsPanel = document.getElementById('syncSettingsPanel');
      if (syncSettingsPanel) {
        syncSettingsPanel.style.setProperty('display', 'none', 'important');
      }
      if (settingsPanel) {
        settingsPanel.style.setProperty('display', 'flex', 'important');
      }
      const activeConfig = currentConfig.activeConfig || { engine: _defaultEngine, data: {} };
      const engine = activeConfig.engine;
      const engineData = activeConfig.data;
      const engineInput = document.getElementById('engineSelect');
      if (engineInput) engineInput.value = engine;
      renderApiInputs(engine, engineData);
      updateEngineTips(engine);
    }
  }
  document.getElementById('btnGoEngine').onclick = async () => {
    await safeCreateTab("engineSettings.html");
    window.close();
  };
  const tabCurrentGlobal = document.getElementById('tabCurrentGlobal');
  const webTranslationOptionContainer = document.getElementById('webTranslationOptionContainer');
  const selectTextOptionContainer = document.getElementById('selectTextOptionContainer');
  const ytRow = document.getElementById('youtube-option-container');
  const targetLangCombox = document.getElementById('targetLangCombox');
  const inspectContainer = document.getElementById('inspectContainer');
  const minCharsContainer = document.getElementById('minCharsContainer');
  document.getElementById('tab-web').onclick = () => toggleStyleTab('web');
  document.getElementById('tab-yt').onclick = () => toggleStyleTab('yt');
  const ytSizeInput = document.getElementById('yt-style-fontSize');
  const ytOpacityInput = document.getElementById('yt-style-bgOpacity');
  ytSizeInput.oninput = function () {
    const val = this.value;
    document.getElementById('ytFontSizeVal').innerText = val + 'px';
    document.getElementById('ytPreviewText').style.fontSize = (val / 1.5) + 'px';
  };
  ytOpacityInput.oninput = function () {
    const val = this.value;
    document.getElementById('ytBgOpacityVal').innerText = val;
    document.getElementById('ytPreviewText').style.backgroundColor = `rgba(0, 0, 0, ${val})`;
  };
  if (currentConfig.ytStyleSettings) {
    const ytSizeInput = document.getElementById('yt-style-fontSize');
    const ytOpacityInput = document.getElementById('yt-style-bgOpacity');
    ytSizeInput.value = currentConfig.ytStyleSettings.fontSize;
    ytOpacityInput.value = currentConfig.ytStyleSettings.bgOpacity;
    document.getElementById('ytFontSizeVal').innerText = currentConfig.ytStyleSettings.fontSize + 'px';
    document.getElementById('ytBgOpacityVal').innerText = currentConfig.ytStyleSettings.bgOpacity;
    if (currentConfig.ytStyleSettings.color) {
      const ytColorInput = document.getElementById('yt-style-color');
      ytColorInput.value = currentConfig.ytStyleSettings.color;
      ytColorInput.style.background = currentConfig.ytStyleSettings.color;
    }
  }

  const tab = await getActiveTab();
  activeTab = tab;
  let domain = "unknown";
  try { domain = new URL(tab.url).hostname.replace('www.', ''); } catch (e) { }

  const ytSwitch = document.getElementById('autoSwitchYT');
  const btnYT = document.getElementById('btnRefreshYT');
  const ytHint = document.getElementById('yt-hint');

  function showYtHintWithFade(ui_lang = 'en') {
    if (!ytHint || !ytRow) return;
    // ---显示逻辑 ---
    const currentLang = ui_lang || 'en';
    const isRTL = checkRTL(currentLang);

    if (isRTL) {
      ytHint.setAttribute('dir', 'rtl');
      ytHint.style.textAlign = 'right';
    } else {
      ytHint.removeAttribute('dir');
      ytHint.style.textAlign = 'left';
    }

    ytHint.style.display = 'block';
    requestAnimationFrame(() => {
      ytHint.classList.add('show');
    });
  }
  function hideYtHintWithFade() {
    if (!ytHint) return;
    ytHint.classList.remove('show');
    setTimeout(() => {
      if (!ytHint.classList.contains('show')) {
        ytHint.style.display = 'none';
        ytHint.removeAttribute('dir');
        ytHint.style.textAlign = '';
      }
    }, 300);
  }

  document.getElementById('currentDomain').innerText = domain;
  async function initPopupUI() {
    const tab = await getActiveTab();
    const url = tab?.url || "";
    const isYouTube = MiraUtils.isYouTubeUrl(url);
    const isRestricted = MiraUtils.isRestrictedUrl(url);
    window.isRestricted = isRestricted;
    window.isYouTube = isYouTube;
    const hintEl = document.getElementById('restrictedHint');
    const divideLine = document.getElementById('sharpDivideLine');
    const seperateLine = document.getElementById('seperateLine');
    //  受限页面：严格互斥，只做隐藏和显示提示
    if (isRestricted) {
      [
        ytRow,
        inspectContainer,
        tabCurrentGlobal,
        webTranslationOptionContainer,
        targetLangCombox,
        selectTextOptionContainer,
        minCharsContainer,
        ytHint
      ].forEach(el => {
        if (el) el.style.display = 'none';
      });

      if (hintEl) hintEl.style.display = 'flex';
      if (divideLine) divideLine.style.display = 'none';
      seperateLine.style.display = 'none';

      const domainEl = document.getElementById('currentDomain');
      if (domainEl) domainEl.innerText = "Restricted Page";
    }
    // YouTube 页面
    else if (isYouTube) {
      if (hintEl) hintEl.style.display = 'none';
      if (divideLine) divideLine.style.display = 'none';

      if (ytRow) {
        ytRow.classList.remove('disabled');
        ytRow.style.display = 'flex';
        showYtHintWithFade();
      }
      if (inspectContainer) inspectContainer.style.display = 'none';
      if (tabCurrentGlobal) tabCurrentGlobal.style.display = 'flex';
      if (targetLangCombox) targetLangCombox.style.display = 'flex';

      [webTranslationOptionContainer, selectTextOptionContainer].forEach(el => {
        if (el) el.style.display = '';
      });
    }
    //  普通页面
    else {
      if (hintEl) hintEl.style.display = 'none';
      if (divideLine) divideLine.style.display = 'flex';
      seperateLine.style.display = '';
      if (ytRow) {
        ytRow.classList.add('disabled');
        ytRow.style.display = 'none';
        hideYtHintWithFade();
      }

      if (tabCurrentGlobal) tabCurrentGlobal.style.display = 'flex';
      if (targetLangCombox) targetLangCombox.style.display = 'flex';

      if (inspectContainer) inspectContainer.style.display = '';
      if (webTranslationOptionContainer) webTranslationOptionContainer.style.display = '';
      if (selectTextOptionContainer) selectTextOptionContainer.style.display = '';
      if (minCharsContainer) minCharsContainer.style.display = '';
    }
  }
  initPopupUI();
  const res = await safeGetStorage(['targetLanguage', 'activeConfig', 'userConfigs']);
  if (!res) return;
  window.currentConfig = {
    targetLanguage: res.targetLanguage || targetLang,
    selectedEngine: res.activeConfig?.engine || _defaultEngine,
    apiKeys: res.activeConfig?.data || {},
    activeConfig: res.activeConfig || { engine: _defaultEngine, data: {} },
    userConfigs: res.userConfigs || []
  };
  window.currentTargetL = normalizeLang(window.currentTargetL || getBrowserLang() || 'en');
  const langEl = document.getElementById('targetLang');
  if (langEl) {
    const raw = currentConfig.targetLanguage || getBrowserLang() || 'en';
    let value = raw.startsWith('zh')
      ? (raw === 'zh-TW' || raw === 'zh-HK' ? 'zh-TW' : 'zh-CN')
      : raw.split('-')[0];
    langEl.value = value;
    if (!langEl.value) langEl.value = 'en';
  }

  const gearBtn = document.getElementById('advancedSettingsBtn');
  const advMenu = document.getElementById('advancedMenu');
  const stylePanel = document.getElementById('styleSettingsPanel');
  const webPreview = document.getElementById('webPreviewText');
  const colorInput = document.getElementById('style-color');
  const fontSizeInput = document.getElementById('style-fontSize');
  const borderTypeSelect = document.getElementById('style-borderType');
  const borderColorInput = document.getElementById('style-borderColor');
  const blurSwitch = document.getElementById('switch-blur');
  let isBlur = false;

  function updatePreview() {
    const isWeb = document.getElementById('tab-web').classList.contains('active');
    const ytPreview = document.getElementById('ytPreviewText');

    if (isWeb) {
      const currentLang = document.getElementById('targetLang')?.value || 'en';
      const isRTL = checkRTL(currentLang);
      const color = colorInput.value;
      const size = fontSizeInput.value;
      const borderColor = borderColorInput.value;
      const borderType = borderTypeSelect.value;
      const isBlur = blurSwitch.classList.contains('on');

      document.getElementById('fontSizeVal').innerText = size + 'px';
      const resetStyles = {
        color: color,
        fontSize: size + 'px',
        border: 'none',
        borderLeft: 'none',
        borderRight: 'none',
        borderBottom: 'none',
        borderTop: 'none',
        padding: '4px 0',
        direction: isRTL ? 'rtl' : 'ltr',
        textAlign: isRTL ? 'right' : 'left',
        backgroundColor: 'transparent',
        backgroundImage: 'none',
        textDecoration: 'none',
        fontStyle: 'normal',
        fontWeight: 'normal',
        boxShadow: 'none',
        opacity: '1',
        borderRadius: '0',
        filter: isBlur ? 'blur(4px)' : 'none'
      };
      Object.assign(webPreview.style, resetStyles);

      if (borderType === 'left') {
        if (isRTL) {
          webPreview.style.borderRight = `4px solid ${borderColor}`;
          webPreview.style.padding = '4px 12px 4px 4px';
        } else {
          webPreview.style.borderLeft = `4px solid ${borderColor}`;
          webPreview.style.padding = '4px 4px 4px 12px';
        }
        webPreview.style.borderRadius = '3px';
      } else if (borderType === 'solid') {
        webPreview.style.border = `1px solid ${borderColor}`;
        webPreview.style.padding = '8px';
        webPreview.style.borderRadius = '6px';
      } else if (borderType === 'dashed') {
        webPreview.style.border = `1px dashed ${borderColor}`;
        webPreview.style.padding = '8px';
        webPreview.style.borderRadius = '6px';
      }

      switch (borderType) {
        case 'dashedUnderline':
          webPreview.style.borderBottom = `1px dashed ${borderColor}`;
          break;
        case 'underline':
          webPreview.style.borderBottom = `2px solid ${borderColor}`;
          break;
        case 'dottedUnderline':
          webPreview.style.borderBottom = `2px dotted ${borderColor}`;
          break;
        case 'highlight':
          webPreview.style.backgroundColor = `${borderColor}33`;
          webPreview.style.padding = '2px 6px';
          webPreview.style.borderRadius = '4px';
          break;
        case 'marker':
          webPreview.style.background = `linear-gradient(to bottom, transparent 60%, ${borderColor}66 60%)`;
          break;
        case 'paper':
          webPreview.style.backgroundColor = '#ffffff';
          webPreview.style.padding = '12px';
          webPreview.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          webPreview.style.border = '1px solid #eeeeee';
          webPreview.style.borderRadius = '8px';
          webPreview.style.color = '#333333';
          break;
        case 'italic':
          webPreview.style.fontStyle = 'italic';
          break;
        case 'bold':
          webPreview.style.fontWeight = 'bold';
          break;
        case 'opacity':
          webPreview.style.opacity = '0.5';
          break;
        case 'dividingLine':
          webPreview.style.borderTop = `1px solid ${borderColor}`;
          webPreview.style.paddingTop = '8px';
          webPreview.style.marginTop = '12px';
          break;
        case 'wavy':
          webPreview.style.textDecoration = `underline wavy ${borderColor}`;
          webPreview.style.textDecorationLine = 'underline';
          webPreview.style.textDecorationStyle = 'wavy';
          webPreview.style.textDecorationColor = borderColor;
          break;
      }

      if (isBlur) {
        webPreview.style.filter = 'blur(4px)';
        webPreview.style.cursor = 'help';
      } else {
        webPreview.style.filter = 'none';
      }
    } else {
      const ytFontSize = document.getElementById('yt-style-fontSize').value;
      const ytBgOpacity = document.getElementById('yt-style-bgOpacity').value;
      const ytColor = document.getElementById('yt-style-color').value;
      document.getElementById('ytFontSizeVal').innerText = ytFontSize + 'px';
      document.getElementById('ytBgOpacityVal').innerText = ytBgOpacity;
      ytPreview.style.color = ytColor;
      ytPreview.style.fontSize = (ytFontSize / 1.5) + 'px';
      ytPreview.style.backgroundColor = `rgba(0, 0, 0, ${ytBgOpacity})`;
      ytPreview.style.textShadow = '1px 1px 2px #000, -1px -1px 2px #000';
    }
  }
  //默认样式
  const DEFAULT_STYLE = {
    color: '#60a5fa',
    fontSize: '23',
    borderType: 'dashedUnderline',
    borderColor: '#38bdf8',
    isBlur: false
  };
  async function initAndLoadStyles() {
    const res = await safeGetStorage(['userStyleConfig']);
    if (!res) return;
    const config = res.userStyleConfig || DEFAULT_STYLE;
    colorInput.value = config.color;
    colorInput.style.background = config.color;
    fontSizeInput.value = config.fontSize;
    borderTypeSelect.value = config.borderType;
    borderColorInput.value = config.borderColor;
    borderColorInput.style.background = config.borderColor;
    document.getElementById('fontSizeVal').innerText = config.fontSize + 'px';
    isBlur = config.isBlur;
    if (isBlur) {
      blurSwitch.classList.add('on');
    } else {
      blurSwitch.classList.remove('on');
    }
    updatePreview();
  }
  webPreview.addEventListener('mouseenter', () => {
    if (isBlur) webPreview.style.filter = 'none';
  });
  webPreview.addEventListener('mouseleave', () => {
    if (isBlur) webPreview.style.filter = 'blur(4px)';
  });

  //手绘取色器
  // 迷你取色器：全局只初始化一次，所有颜色输入框共用
  (function setupMiniPicker() {
    const picker = document.getElementById('mini-picker');
    const svBox = document.getElementById('picker-sv');
    const svCursor = document.getElementById('picker-sv-cursor');
    const hueBar = document.getElementById('picker-hue');
    const hueCursor = document.getElementById('picker-hue-cursor');
    let hue = 217;
    let currentInput = null;

    function hsvToHex(h, s, v) {
      s /= 100; v /= 100;
      const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
      let [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
        : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
      const toHex = n => Math.round((n + m) * 255).toString(16).padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    // HEX 反推 HSV，用于面板初始化同步当前颜色
    function hexToHsv(hex) {
      let r = parseInt(hex.slice(1, 3), 16) / 255;
      let g = parseInt(hex.slice(3, 5), 16) / 255;
      let b = parseInt(hex.slice(5, 7), 16) / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      let h = 0;
      if (d !== 0) {
        if (max === r) h = 60 * (((g - b) / d) % 6);
        else if (max === g) h = 60 * ((b - r) / d + 2);
        else h = 60 * ((r - g) / d + 4);
      }
      if (h < 0) h += 360;
      const s = max === 0 ? 0 : d / max;
      const v = max;
      return { h, s: s * 100, v: v * 100 };
    }

    function applyColor(hex) {
      if (!currentInput) return;
      currentInput.value = hex;
      currentInput.style.background = hex; // 拖动取色时同步按钮背景
      currentInput.dispatchEvent(new Event('input'));
    }

    function updateFromSV(clientX, clientY) {
      const rect = svBox.getBoundingClientRect();
      const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
      const y = Math.min(Math.max(clientY - rect.top, 0), rect.height);
      svCursor.style.left = x + 'px';
      svCursor.style.top = y + 'px';
      applyColor(hsvToHex(hue, (x / rect.width) * 100, 100 - (y / rect.height) * 100));
    }

    function updateFromHue(clientX) {
      const rect = hueBar.getBoundingClientRect();
      const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
      hueCursor.style.left = x + 'px';
      hue = (x / rect.width) * 360;
      svBox.style.background =
        `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hue},100%,50%)`;
      const svRect = svBox.getBoundingClientRect();
      updateFromSV(svRect.left + (parseFloat(svCursor.style.left) || 0),
        svRect.top + (parseFloat(svCursor.style.top) || 0));
    }

    let draggingSV = false, draggingHue = false;
    svBox.addEventListener('mousedown', e => { draggingSV = true; updateFromSV(e.clientX, e.clientY); });
    hueBar.addEventListener('mousedown', e => { draggingHue = true; updateFromHue(e.clientX); });
    document.addEventListener('mousemove', e => {
      if (draggingSV) updateFromSV(e.clientX, e.clientY);
      if (draggingHue) updateFromHue(e.clientX);
    });
    document.addEventListener('mouseup', () => { draggingSV = draggingHue = false; });

    document.addEventListener('click', e => {
      if (!picker.contains(e.target) && !e.target.classList.contains('mini-picker-trigger')) {
        picker.style.display = 'none';
      }
    });

    window.bindMiniPicker = function (input) {
      input.type = 'text';
      input.readOnly = true;
      input.classList.add('mini-picker-trigger');
      input.style.background = input.value; // 初始化按钮背景

      input.addEventListener('click', e => {
        e.preventDefault();
        currentInput = input;

        // 先定位面板并显示，确保后面 getBoundingClientRect() 能拿到真实宽高
        const rect = input.getBoundingClientRect();
        let top = rect.bottom + 4;
        let left = rect.left;
        if (left + 150 > window.innerWidth) left = window.innerWidth - 150;
        if (top + 130 > window.innerHeight) top = rect.top - 134;
        picker.style.left = left + 'px';
        picker.style.top = top + 'px';
        picker.style.display = 'block';

        // 面板已经可见，现在计算游标位置才准确
        const { h, s, v } = hexToHsv(input.value || '#60a5fa');
        hue = h;
        svBox.style.background =
          `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hue},100%,50%)`;
        const svRect = svBox.getBoundingClientRect();
        svCursor.style.left = (s / 100 * svRect.width) + 'px';
        svCursor.style.top = ((100 - v) / 100 * svRect.height) + 'px';
        const hueRect = hueBar.getBoundingClientRect();
        hueCursor.style.left = (hue / 360 * hueRect.width) + 'px';
      });
    };
  })();

  document.querySelectorAll('input[type="color"]').forEach(input => {
    window.bindMiniPicker(input);
  });

  //自动给所有原生颜色输入框绑定迷你取色器 
  document.querySelectorAll('input[type="color"]').forEach(input => {
    window.bindMiniPicker(input);
    input.style.background = input.value;
  });

  [
    colorInput, fontSizeInput, borderTypeSelect, borderColorInput,
    document.getElementById('yt-style-color'),
    document.getElementById('yt-style-fontSize'),
    document.getElementById('yt-style-bgOpacity')
  ].forEach(el => {
    if (el) el.addEventListener('input', updatePreview);
  });
  document.querySelectorAll('.color-preset').forEach(preset => {
    preset.addEventListener('click', function () {
      const selectedColor = this.dataset.color;
      const isYTPanel = this.closest('#ytStyleControls') !== null;
      if (isYTPanel) {
        const ytInput = document.getElementById('yt-style-color');
        if (ytInput) {
          ytInput.value = selectedColor;
          ytInput.style.background = selectedColor;
        }
      } else {
        colorInput.value = selectedColor;
        colorInput.style.background = selectedColor;
      }
      updatePreview();
    });
  });
  blurSwitch.addEventListener('click', function (e) {
    e.stopPropagation();
    isBlur = !isBlur;
    this.classList.toggle('on');
    updatePreview();
  });

  gearBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    loginModal.style.display = 'none';
    profilePanel.style.display = 'none';
    document.getElementById('p-engine-dropdown-popup')?.remove();
    const isVisible = advMenu.style.display === 'block';
    advMenu.style.display = isVisible ? 'none' : 'block';

    const { hasVisitedSettings } = await safeGetStorage('hasVisitedSettings');
    const isFirstTime = !hasVisitedSettings;

    if (isFirstTime) {
      await safeSetStorage({ hasVisitedSettings: true });
      gearBtn.classList.remove('engine-pulse-strong');
      gearBtn.classList.add('engine-pulse-soft');
    }

    const engineMenuItem = document.getElementById('btnGoEngine');
    if (!isVisible && isFirstTime) {
      engineMenuItem.classList.add('menu-item-pulse-strong');
    }
  });
  // 切换UI语言
  const uiSelect = document.getElementById('uiLangSelect');
  if (uiSelect) {
    uiSelect.onclick = (e) => e.stopPropagation();

    uiSelect.onchange = async (e) => {
      const selectedLang = e.target.value;
      const success = await safeSetStorage({ ui_language: selectedLang });
      if (success) {
        globalUiLang = selectedLang;
        applyI18n(selectedLang);
        const menu = document.getElementById('advancedMenu');
        if (menu) menu.style.display = 'none';
      }
    };
  }
  document.getElementById('btnGoStyle').addEventListener('click', async () => {
    showPanel('styleSettingsPanel');
    let defaultTab = 'web';
    try {
      const tab = await getActiveTab();
      if (tab?.url?.includes('youtube.com')) {
        defaultTab = 'yt';
      }
    } catch (e) {
      logger.error("URL判断失败:", e);
    }
    toggleStyleTab(defaultTab);
    initAndLoadStyles();
  });

  document.getElementById('closeStylePanel').addEventListener('click', () => {
    showMain();
  });
  document.addEventListener('click', () => {
    advMenu.style.display = 'none';
  });
  document.getElementById('saveStyleConfig').addEventListener('click', async () => {
    const currentUiLang = window.currentConfig.ui_language;
    const isYTTab = document.getElementById('tab-yt').classList.contains('active');
    const config = {
      color: document.getElementById('style-color').value,
      borderColor: document.getElementById('style-borderColor').value,
      borderType: document.getElementById('style-borderType').value,
      isBlur: document.getElementById('switch-blur').classList.contains('on')
    };
    const ytConfig = {
      fontSize: parseInt(document.getElementById('yt-style-fontSize').value),
      bgOpacity: parseFloat(document.getElementById('yt-style-bgOpacity').value),
      color: document.getElementById('yt-style-color').value
    };
    await safeSetStorage({
      'userStyleConfig': config,
      'ytStyleSettings': ytConfig
    });
    const tab = await getActiveTab();
    if (tab?.id) {
      try {
        if (isYTTab) {
          if (tab.url?.includes("youtube.com")) {
            await safeSendToTab(tab.id, {
              action: "PREVIEW_YT_STYLE",
              settings: ytConfig
            });
          }
        } else {
          await safeSendToTab(tab.id, {
            action: "UPDATE_VISUAL_STYLE",
            data: config
          });
        }
      } catch (error) {
        logger.warn("[Mira-Preview] 预览消息未送达目标标签页，可能脚本尚未就绪:", error.message);
      }
    }
    const btn = document.getElementById('saveStyleConfig');
    const oldText = btn.innerText;
    btn.innerText = t('appliedAndSaved', currentUiLang) + " ✅";
    setTimeout(() => {
      btn.innerText = oldText;
    }, 800);
  });
  const searchPanel = document.getElementById('searchPanel');
  const mainContainer = document.getElementById('mainContainer');
  const resultArea = document.getElementById('searchResultArea');
  const resSource = document.getElementById('resSourceText')?.innerText.trim();
  const resPhonetic = document.getElementById('resPhonetic');
  const resContent = document.getElementById('resContent');
  const notebookBtn = document.getElementById('openNotebookSecondary');
  const resVoiceHeader = document.getElementById('resVoiceHeader');
  const resSaveBtn = document.getElementById('resSaveBtn');
  const resRefreshBtn = document.getElementById('resRefreshBtn');
  const input = document.getElementById('searchTextInput');

  input.addEventListener('input', function () {
    this.style.height = 'auto';

    let newHeight = this.scrollHeight;
    if (newHeight > 80) {
      newHeight = 80;
      this.style.overflowY = 'auto';
    } else {
      this.style.overflowY = 'hidden';
    }

    this.style.height = newHeight + 'px';

    if (!this.value.trim()) {
      const resultArea = document.getElementById('resultArea');
      if (resultArea) resultArea.style.display = 'none';
      const actionArea = document.getElementById('actionArea');
      if (actionArea) actionArea.style.display = 'none';

      this.style.height = '35px';
      this.style.overflowY = 'hidden';
    }
  });

  input.onkeydown = function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (typeof triggerSearch === 'function') {
        triggerSearch(this.value.trim());
      }
    }
  };

  document.getElementById('searchSubmitBtn').onclick = () => {
    triggerSearch(input.value.trim());
  };

  // 即时翻译
  function triggerSearch(text) {
    if (!text) {
      resultArea.style.display = 'none';
      if (typeof notebookBtn !== 'undefined') notebookBtn.style.display = 'none';
      const actionArea = document.getElementById('actionArea');
      if (actionArea) actionArea.style.display = 'none';
      return;
    }
    executeTranslation(text);
  }
  //shuaxin
  let _refreshDebounceTimer = null;

  async function triggerResRefresh() {
    if (_refreshDebounceTimer) return;

    _refreshDebounceTimer = setTimeout(() => {
      _refreshDebounceTimer = null;
    }, 1500);

    const queryInput = document.getElementById('searchTextInput');
    const text = queryInput ? queryInput.value.trim() : "";
    if (!text) return;

    if (resRefreshBtn) resRefreshBtn.classList.add('spinning');
    if (resContent) resContent.style.opacity = '0.5';

    try {
      const coreText = text
        .replace(/[\s\n\r\t.,!?;:。，！？、・「」]/g, "")
        .toLowerCase();

      const fingerprint =
        typeof hash === 'function'
          ? hash(coreText)
          : coreText.substring(0, 50);

      const safeLang = (window.currentTargetL || 'zh-cn')
        .replace('_', '-')
        .toLowerCase();

      //  直接构造 key
      const ALL_ENGINES = [
        ...AI_LLM_WHITE_LIST,
        ...TRADITIONAL_ENGINE_LIST
      ];

      for (const engine of ALL_ENGINES) {
        const key = `tr_${engine.toLowerCase()}_${fingerprint}_${safeLang}`;
        try {
          await idb.remove(key);
        } catch { }
      }

      await executeTranslation(text, true);

    } finally {
      setTimeout(() => {
        if (resRefreshBtn) resRefreshBtn.classList.remove('spinning');
        if (resContent) resContent.style.opacity = '1';
      }, 600);
    }
  }

  if (resRefreshBtn) {
    resRefreshBtn.onclick = triggerResRefresh;
  }
  async function renderTranslationResult(response, text, ui_lang, langA, langB) {
    if (response && !response.isError) {
      currentTranslationResponse = response;
      resVoiceHeader.style.display = 'flex';
      resSource.innerText = text;
      const actionArea = document.getElementById('actionArea');
      if (actionArea) actionArea.style.display = 'block';
      if (typeof notebookBtn !== 'undefined') notebookBtn.style.display = 'flex';
      resultArea.style.display = 'flex';
      resultArea.style.userSelect = 'text';

      const basic = response.basic || '';
      const phonetic = response.phonetic || '';
      const dicts = response.dictData || [];
      const examples = response.examples || [];
      logger.log('[loadingMore] isPartial:', response.isPartial, 'basic:', basic, 'dicts.length:', dicts.length, 'isWord:', response.isWord);
      const targetPhonetic =
        response.targetPhonetic ||   // API 直接返回译文音标
        response.romaji ||            // 日语 romaji
        response.pinyin ||            // 中文拼音
        response.transliteration ||   // 通用转写
        '';
      logger.log('basic:', response.basic);
      logger.log('targetPhonetic:', response.targetPhonetic);
      window._lastTranslationBasic = basic || '';
      const ttsBtnTarget = document.getElementById('ttsBtnTarget');
      if (ttsBtnTarget) ttsBtnTarget.style.display = basic ? 'inline-flex' : 'none';
      const sourcePhonetic = response.sourcePhonetic || '';
      logger.log("sourcePhonetic: ", sourcePhonetic);
      if (resPhonetic) {
        resPhonetic.innerText = sourcePhonetic
          ? `[${sourcePhonetic}]`
          : '';

        // 日语假名显示
        const kanaDiv = document.getElementById('resKana');
        if (kanaDiv) {
          if (sourcePhonetic && langA === 'ja') {
            getKana(sourcePhonetic).then(({ hiragana, katakana }) => {
              if (!hiragana) { kanaDiv.style.display = 'none'; return; }
              kanaDiv.innerHTML = `
                    <span style="cursor:pointer; user-select:none;"
                          data-hiragana="${hiragana}"
                          data-katakana="${katakana}"
                          data-mode="hiragana">
                        ${hiragana}
                    </span>
                `;
              kanaDiv.style.display = 'block';
              kanaDiv.querySelector('span').onclick = (e) => {
                const el = e.currentTarget;
                if (el.dataset.mode === 'hiragana') {
                  el.innerText = el.dataset.katakana;
                  el.dataset.mode = 'katakana';
                } else {
                  el.innerText = el.dataset.hiragana;
                  el.dataset.mode = 'hiragana';
                }
              };
            });
          } else {
            kanaDiv.style.display = 'none';
          }
        }
      }

      let html = '';
      const src = (langA || 'en').toLowerCase();
      const tgt = (langB || 'zh').toLowerCase();
      let cambridgeHref = '';

      if (basic) {
        const hasPhonetic = !!targetPhonetic;
        const phoneticLabel = getPhoneticLabel(ui_lang);

        // 剑桥词典链接逻辑：仅单词模式
        const isWord = isWordText(text);;
        if (isWord) {
          const encoded = encodeURIComponent(text.trim().toLowerCase());

          let dictPath = null;
          // 只有英文源语言才给 Cambridge 链接
          if (src === 'en') {
            dictPath = FORWARD[tgt] || null;
          }

          if (dictPath) {
            cambridgeHref = `https://dictionary.cambridge.org/dictionary/${dictPath}/${encoded}`;
          }
        }

        html += `
        <div style="margin-bottom:10px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-weight:bold; word-break:break-all; color:#38BDF8; font-size:15px; user-select:text !important;">${basic}</span>
            ${hasPhonetic ? `<button id="togglePhoneticBtn">${phoneticLabel}</button>` : ''}
          </div>
          ${hasPhonetic ? `
            <div id="targetPhoneticRow" style="
              display:none; color:#64748b; font-size:11px;
              margin-top:3px; user-select:text;
            ">${targetPhonetic}</div>` : ''}
            ${(cambridgeHref && tgt === 'zh-tw') ? `
              <div style="margin-top:5px;">
                <a id="cambridgeLink" href="${cambridgeHref}" target="_blank" rel="noopener noreferrer"
                  style="color:#64748b; font-size:10px; text-decoration:none; opacity:0.7; transition:opacity 0.2s;">
                  💡 更多釋義 → Cambridge Dictionary ↗
                </a>
              </div>` : ''}
        </div>`;
      }

      // 合并相同 pos
      const mergedDicts = dicts.reduce((acc, item) => {
        const meanings = item.meanings?.length > 0
          ? item.meanings
          : (item.definition
            ? [...new Set(item.definition.split(',').map(s => s.trim()).filter(Boolean))]
            : []);
        const existing = acc.find(d => d.pos === item.pos);
        if (existing) {
          existing.meanings = [...existing.meanings, ...meanings];
        } else {
          acc.push({ ...item, meanings });
        }
        return acc;
      }, []).map(item => ({
        ...item,
        meanings: [...new Set(item.meanings.map(m => m.trim()).filter(Boolean))]
      }));
      logger.log('[DEBUG] isPartial:', response.isPartial, '| dicts:', dicts.length, '| basic:', basic.slice(0, 20));
      if (response.isPartial && basic && dicts.length === 0) {

        if (response.isWord) {
          html += `<div style="color:#64748b; font-size:11px; margin-top:8px;">
          ${t('loadingMore', ui_lang)}
        </div>`;
        }
      } else if (mergedDicts.length > 0) {
        html += mergedDicts.map((item, posIdx) => {
          const rawPos = (item.pos || '').toLowerCase().trim().replace(/\.$/, '');
          const cnKey = POS_REVERSE_MAP[rawPos] || rawPos;
          const targetLangCode = (langA || 'en').toLowerCase();
          let displayPos = cnKey;
          if (POS_MAP[cnKey]) {
            displayPos = POS_MAP[cnKey][targetLangCode] || POS_MAP[cnKey]['en'] || cnKey;
          }

          const origItem = response.originalDictData?.[posIdx];
          const origMeanings = origItem?.meanings?.join(', ') || '';

          return `
          <div style="margin-bottom:6px;">
            <div style="display:flex; align-items:baseline; flex-wrap:wrap; gap:4px; line-height:1.4;">
              <span style="color:#94a3b8; font-size:11px; font-weight:bold; margin-right:4px; min-width:32px; flex-shrink:0;">${displayPos}</span>
              <span style="color:#38bdf8; font-size:13px;">${item.meanings.join(', ')}</span>
            </div>
          </div>`;
        }).join('');
      }

      // 词形/时态
      const wordForms = response.wordForms || [];
      const prototype = response.prototype;
      const protoLower = (prototype || '').toLowerCase().trim();
      const textLower = text.toLowerCase().trim();

      if ((prototype && protoLower !== textLower) || wordForms.length > 0) {
        let formsHtml = '';
        if (prototype && protoLower !== textLower) {
          formsHtml += `
            <span style="display:inline-flex; align-items:center; gap:4px; background:rgba(99,179,237,0.1); border:0.5px solid rgba(99,179,237,0.4); border-radius:6px; padding:3px 8px; font-size:12px;">
              <span style="color:#94a3b8; font-size:11px;">Prototype</span>
              <span style="color:#38bdf8; font-weight:500;">${prototype}</span>
            </span>`;
        }
        logger.log('wordForms: ', JSON.stringify(response.wordForms));
        wordForms.forEach(wf => {
          formsHtml += `
            <span style="display:inline-flex; align-items:center; gap:4px; background:rgba(255,255,255,0.05); border:0.5px solid rgba(255,255,255,0.15); border-radius:6px; padding:3px 8px; font-size:12px;">
              <span style="color:rgba(255,255,255,0.85); font-weight:500;">${wf.value}</span>
            </span>`;
        });
        html += `<div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:6px;">${formsHtml}</div>`;
      }

      // 例句 
      const sourceLang = document.getElementById('lpSelA')?.value || 'en';
      if (examples.length > 0) {
        html += `
        <div style="margin-top:12px; border-top:1px dashed rgba(255,255,255,0.1); padding-top:10px; user-select:text !important;">
          <div style="color:#94a3b8; font-size:10px; margin-bottom:5px; text-transform:uppercase;">Examples</div>
          ${examples.map(ex => {
          const src = typeof ex === 'string' ? ex : (ex.en || '');
          const tgt = typeof ex === 'object' ? (ex.cn || '') : '';
          const safeSrc = src.replace(/'/g, '&apos;').replace(/"/g, '&quot;');
          return `
              <div style="margin-bottom:8px;">
                <div style="display:flex; align-items:flex-start; gap:6px;">
                  <div dir="auto" style="color:rgba(255,255,255,0.6); font-size:12px; font-style:italic; flex:1;">"${src}"</div>
                  <span class="popup-example-speak" data-sentence="${safeSrc}" data-lang="${sourceLang || 'en'}"
                    style="cursor:pointer; color:#64748b; flex-shrink:0; display:flex; margin-top:2px;
                          transition:color 0.2s; position:relative; overflow:visible;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                    </svg>
                  </span>
                </div>
                ${tgt ? `<div dir="auto" style="color:rgba(255,255,255,0.4); font-size:11px; font-style:italic; margin-top:2px;">${tgt}</div>` : ''}
              </div>`;
        }).join('')}
        </div>`;
      }

      // source 和 Cambridge 
      if (response.source || cambridgeHref) {
        html += `<div id="wiki-source-placeholder" 
        style="margin-top:10px; font-size:11px;
              display:flex; flex-wrap:wrap; justify-content:flex-end; align-items:center; gap:4px;
              color:#64748b;">
      </div>`;
      }
      resContent.innerHTML = html || 'No translation found.';
      resContent.querySelectorAll('.popup-example-speak').forEach(btn => {
        btn.addEventListener("mouseenter", () => {
          btn.style.color = "#38bdf8";
          btn.style.filter = "drop-shadow(0 0 4px rgba(56,189,248,0.6))";
        });
        btn.addEventListener("mouseleave", () => {
          if (!btn.classList.contains("is-speaking")) {
            btn.style.color = "#64748b";
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
          speakText(sentence, btn, finalLang);
        });
      });

      // 再单独处理 source 链接，用 DOM API 绑定事件
      if (response.source || cambridgeHref) {
        const placeholder = resContent.querySelector('#wiki-source-placeholder');
        if (placeholder) {

          // Source + 模型名 包在同一个 span 里
          if (response.source) {
            const sourceWrapper = document.createElement('span');
            sourceWrapper.style.cssText = `
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 220px;
        display: inline-flex;
        align-items: center;
        gap: 2px;
      `;

            const label = document.createTextNode('Source: ');
            sourceWrapper.appendChild(label);

            if (response.sourceUrl) {
              const a = document.createElement('a');
              a.href = response.sourceUrl;
              a.target = '_blank';
              a.rel = 'noopener noreferrer';
              a.textContent = response.source;
              a.style.cssText = `
          color: #38bdf8;
          text-decoration: none;
          font-weight: 500;
          font-size: 10px;
          font-style: italic;
          border-radius: 4px;
          background: rgba(56,189,248,0.08);
          transition: all 0.2s ease;
          margin-left: 4px;
        `;
              a.addEventListener('mouseover', () => {
                a.style.background = 'rgba(56,189,248,0.2)';
                a.style.color = '#7dd3fc';
              });
              a.addEventListener('mouseout', () => {
                a.style.background = 'rgba(56,189,248,0.08)';
                a.style.color = '#38bdf8';
              });
              sourceWrapper.appendChild(a);
            } else {
              sourceWrapper.appendChild(document.createTextNode(response.source));
            }

            placeholder.appendChild(sourceWrapper);
          }

          // Cambridge 链接
          if (cambridgeHref) {
            const sep = document.createTextNode(' · ');
            placeholder.appendChild(sep);
            const ca = document.createElement('a');
            ca.href = cambridgeHref;
            ca.target = '_blank';
            ca.rel = 'noopener noreferrer';
            ca.textContent = 'Cambridge ↗';
            ca.style.cssText = `
        white-space: nowrap;
        display: inline-block;
        color: #94a3b8;
        text-decoration: none;
        font-weight: 500;
        font-size: 10px;
        font-style: italic;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(148,163,184,0.08);
        transition: all 0.2s ease;
      `;
            ca.addEventListener('mouseover', () => {
              ca.style.background = 'rgba(148,163,184,0.2)';
              ca.style.color = '#cbd5e1';
            });
            ca.addEventListener('mouseout', () => {
              ca.style.background = 'rgba(148,163,184,0.08)';
              ca.style.color = '#94a3b8';
            });
            placeholder.appendChild(ca);
          }
        }
      }

      // 绑定基本释义下方剑桥链接 hover（仅 zh-tw）
      const cambridgeLink = resContent.querySelector('#cambridgeLink');
      if (cambridgeLink) {
        cambridgeLink.addEventListener('mouseover', () => {
          cambridgeLink.style.opacity = '1';
          cambridgeLink.style.color = '#38bdf8';
        });
        cambridgeLink.addEventListener('mouseout', () => {
          cambridgeLink.style.opacity = '0.8';
          cambridgeLink.style.color = '#7dd3fc';
        });
      }

      // 绑定音标切换
      const toggleBtn = document.getElementById('togglePhoneticBtn');
      const phoneticRow = document.getElementById('targetPhoneticRow');
      if (toggleBtn && phoneticRow) {
        toggleBtn.onclick = () => {
          const isHidden = phoneticRow.style.display === 'none';
          phoneticRow.style.display = isHidden ? 'block' : 'none';
          toggleBtn.classList.toggle('active', isHidden);
        };
      }

      if (typeof updateSaveBtnStatus === 'function') {
        await updateSaveBtnStatus(text);
      }
    } else {
      const errorMsg = response?.basic || response?.error || 'No response';
      resContent.innerHTML = `<span style="color:#ef4444;">${errorMsg}</span>`;
    }
  }

  async function executeTranslation(text, forceRefresh = false) {
    // 清理上一次残留的 listener
    if (window._detailUpdateListener) {
      chrome.runtime.onMessage.removeListener(window._detailUpdateListener);
      window._detailUpdateListener = null;
    }

    if (typeof notebookBtn !== 'undefined') notebookBtn.style.display = 'none';
    let ui_lang = 'en';
    try {
      const res = await safeGetStorage(['ui_language', 'activeConfig']);
      if (!res) return;

      ui_lang = res.ui_language || getBrowserLang() || 'en'
      resultArea.style.display = 'flex';
      resultArea.style.userSelect = 'text';
      resContent.innerHTML = `<span style="color: #64748b; font-size: 11px;">${t('loading', ui_lang)}</span>`;
      resPhonetic.innerText = '';
      resVoiceHeader.style.display = 'none';
      const langA = (document.getElementById('lpSelA').value || 'auto').replace('_', '-');
      const langB = (document.getElementById('lpSelB').value || 'ja').replace('_', '-');
      const baseA = langA.split('-')[0].toLowerCase();
      const baseB = langB.split('-')[0].toLowerCase();

      let engine = res.activeConfig?.engine || _defaultEngine;

      if (window.currentConfig) {
        window.currentConfig.selectedEngine = engine;
        window.currentConfig.activeConfig = res.activeConfig || { engine: _defaultEngine, data: {} };
      }
      if (typeof currentEngine !== 'undefined') currentEngine = engine;

      function detectInputLang(str) {
        if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(str)) return 'ja';
        if (/\p{Script=Hangul}/u.test(str)) return 'ko';
        if (/\p{Script=Han}/u.test(str)) return 'zh';
        if (/\p{Script=Arabic}/u.test(str)) return 'ar';
        if (/\p{Script=Cyrillic}/u.test(str)) return 'ru';
        if (/\p{Script=Thai}/u.test(str)) return 'th';
        if (/\p{Script=Hebrew}/u.test(str)) return 'he';
        if (/\p{Script=Devanagari}/u.test(str)) return 'hi';
        if (/^[a-zA-Z\u00C0-\u024F\s.,!?'"()\-¿¡«»]+$/.test(str.trim())) return 'latin';
        return 'unknown';
      }
      const inputLang = detectInputLang(text);

      function resolveInputLang(detectedLang, bA) {
        if (detectedLang !== 'zh') return detectedLang;
        if (bA.startsWith('ja')) return 'ja';
        return 'zh';
      }

      const resolvedLang = resolveInputLang(inputLang, baseA);
      const isZhBase = (l) => l.startsWith('zh');

      const matchesA = resolvedLang === baseA
        || (resolvedLang === 'zh' && isZhBase(baseA))
        || (resolvedLang === 'latin' && (typeof LATIN_BASED_LANGS !== 'undefined' && LATIN_BASED_LANGS.has(baseA)));

      const matchesB = resolvedLang === baseB
        || (resolvedLang === 'zh' && isZhBase(baseB))
        || (resolvedLang === 'latin' && (typeof LATIN_BASED_LANGS !== 'undefined' && LATIN_BASED_LANGS.has(baseB)));

      let targetL;
      if (matchesB && !matchesA) {
        targetL = langA === 'auto' ? (isZhBase(langB) ? 'en' : 'zh-CN') : langA;
      } else {
        targetL = langB;
      }

      window.currentTargetL = targetL;

      logger.log(`[Mira-LOG] 翻译请求: text="${text}", inputLang="${inputLang}", langA="${langA}", langB="${langB}", targetL="${targetL}", engine="${engine}"`);
      const TIMEOUT_MS = 8000;
      let timeoutTriggered = false;
      const slowTimer = setTimeout(() => {
        timeoutTriggered = true;
        if (!resContent) return;
        resContent.innerHTML = `
      <span style="opacity:0.5; font-size:12px;">
        ${t('loadingSlow', ui_lang) || 'API loading slow'}
        <button id="res-content-retry" style="
          margin-left:6px;
          font-size:12px;
          cursor:pointer;
          border:1px solid currentColor;
          border-radius:4px;
          padding:1px 7px;
          background:transparent;
          color:inherit;
          opacity:0.7;
        ">↺ ${t('retry', ui_lang) || 'Retry'}</button>
      </span>`;
        const retryBtn = resContent.querySelector('#res-content-retry');
        if (retryBtn) {
          retryBtn.onclick = (e) => {
            e?.stopPropagation();
            triggerResRefresh();
          };
        }
      }, TIMEOUT_MS);

      // 先注册 listener，再发请求
      window._detailUpdateListener = (msg) => {
        if (msg.action === 'TRANSLATE_DETAIL_UPDATE' && !msg.result?.isPartial) {
          clearTimeout(slowTimer);
          renderTranslationResult(msg.result, text, ui_lang, langA, langB);
          chrome.runtime.onMessage.removeListener(window._detailUpdateListener);
          window._detailUpdateListener = null;
        }
      };
      chrome.runtime.onMessage.addListener(window._detailUpdateListener);

      const response = await getDetailedTranslation(text, forceRefresh, targetL, {
        needPhonetic: true,
        hintInputLang: resolvedLang,
        hintLangA: langA,
        hintLangB: langB,
        fromPopup: false
      });

      clearTimeout(slowTimer);
      if (response) renderTranslationResult(response, text, ui_lang, langA, langB);

      if (!response?.isPartial) {
        chrome.runtime.onMessage.removeListener(window._detailUpdateListener);
        window._detailUpdateListener = null;
      }

    } catch (err) {
      clearTimeout(slowTimer);
      logger.error('Popup Logic Error:', err);
      resContent.innerHTML = `<span style="color:#ef4444;">Error: ${err.message}</span>`;
    }
  }
  async function updateSaveBtnStatus(word, isJustSaved = null) {
    if (!resSaveBtn || !word) return;
    try {
      const wordLower = word.trim().toLowerCase();
      let exists;
      if (isJustSaved !== null) {
        exists = isJustSaved;
        logger.log(`[Mira-LOG] 状态强制更新 (UI): word=${wordLower}, 收藏=${exists}`);
      } else {
        const entry = await idb.vocabulary.get(wordLower);
        exists = !!(entry && !entry.deleted);
        logger.log(`[Mira-LOG] 状态同步 (IDB): word=${wordLower}, 收藏=${exists}`);
      }
      resSaveBtn.dataset.activeWord = wordLower;
      if (exists) {
        resSaveBtn.classList.add('is-saved');
        resSaveBtn.title = t('uncollect');
        resSaveBtn.setAttribute('data-i18n', 'uncollect');
        if (isJustSaved === true) {
          resSaveBtn.classList.add('status-protect');
          setTimeout(() => {
            if (resSaveBtn.dataset.activeWord === wordLower) {
              resSaveBtn.classList.remove('status-protect');
            }
          }, 1500);
        }
      } else {
        resSaveBtn.classList.remove('is-saved');
        resSaveBtn.title = t('collect');
        resSaveBtn.setAttribute('data-i18n', 'collect');
        if (isJustSaved === false) {
          resSaveBtn.classList.add('status-protect');
          setTimeout(() => resSaveBtn.classList.remove('status-protect'), 500);
        }
      }
    } catch (e) {
      logger.error("updateSaveBtnStatus 异常:", e);
    }
  }
  if (resSaveBtn) {
    resSaveBtn.onclick = async function () {
      logger.log("[Popup] 收藏按钮被点击");
      if (this.classList.contains('status-protect')) {
        return;
      }
      const inputElem = document.getElementById('searchTextInput');
      const wordText = (inputElem?.value.trim() || this.dataset.activeWord || "").toLowerCase();
      if (!wordText) {
        logger.error("[Popup] 错误: 找不到单词文本");
        return;
      }
      const isCurrentlySaved = this.classList.contains('is-saved');
      const actionType = isCurrentlySaved ? 'UNCOLLECT' : 'COLLECT';
      let fullTranslation = null;
      if (typeof wordTranslationCache !== 'undefined' && wordTranslationCache.has(wordText)) {
        const cachedData = wordTranslationCache.get(wordText);
        fullTranslation = {
          basic: cachedData.basic || "",
          phonetic: cachedData.phonetic || "",
          dictData: cachedData.dictData || [],
          examples: cachedData.examples || [],
          sourceLang: cachedData.langInfo?.code || "",
        };
        logger.log("[Popup] 成功从内存 Map 中提取完整词典数据");
      } else {
        const pBasic = document.getElementById('p-basic')?.innerText || "";
        fullTranslation = { basic: pBasic, phonetic: "", dictData: [], examples: [], };
        logger.warn("[Popup] 内存未命中，降级为纯文本收藏");
      }
      this.classList.add('status-protect');
      updateSaveBtnStatus(wordText, actionType === 'COLLECT');
      const response = await safeSendMessage({
        type: 'SAFE_TOGGLE_VOCABULARY',
        data: {
          word: wordText,
          trans: fullTranslation,
          action: actionType
        }
      });
      if (!response) {
        this.classList.remove('status-protect');
        updateSaveBtnStatus(wordText, actionType !== 'COLLECT');
        return;
      }
      this.classList.remove('status-protect');
    };
  }
  document.getElementById('quickSearchBtn').onclick = () => {
    mainContainer.style.display = 'none';
    searchPanel.style.display = 'flex';
    input.focus();
  };
  document.getElementById('closeSearchPanel').onclick = () => {
    mainContainer.style.display = 'block';
    searchPanel.style.display = 'none';
    input.value = '';
    input.style.height = '36px';
    resultArea.style.display = 'none';
    notebookBtn.style.display = 'none';
  };

  // ── 原文发音
  document.getElementById('ttsBtn').onclick = function () {
    const text = document.getElementById('searchTextInput')?.value.trim();
    const langA = document.getElementById('lpSelA').value;

    const input = document.getElementById('searchTextInput');
    input.style.transition = 'box-shadow 0.05s ease';
    input.style.boxShadow = '0 0 8px 2px rgba(56,189,248,0.8), 0 0 20px 4px rgba(56,189,248,0.3), inset 0 0 8px rgba(56,189,248,0.15)';
    input.style.borderColor = 'rgba(56,189,248,0.9)';
    setTimeout(() => {
      input.style.transition = 'box-shadow 0.8s ease, border-color 0.8s ease';
      input.style.boxShadow = '';
      input.style.borderColor = '';
    }, 150);

    const finalLang = (!langA || langA === 'auto') ? null : langA;
    speakText(text, this, finalLang);
  };

  // ── 译文发音
  document.getElementById('ttsBtnTarget').onclick = async function () {
    const text = window._lastTranslationBasic;
    const langB = document.getElementById('lpSelB').value;

    const resultArea = document.getElementById('searchResultArea');
    const originalBorderColor = '#1e293b';

    resultArea.style.transition = 'box-shadow 0.05s ease, border-color 0.05s ease';
    resultArea.style.boxShadow = '0 0 8px 2px rgba(56,189,248,0.8), 0 0 20px 4px rgba(56,189,248,0.3)';
    resultArea.style.borderColor = 'rgba(56,189,248,0.9)';
    setTimeout(() => {
      resultArea.style.transition = 'box-shadow 0.8s ease, border-color 0.8s ease';
      resultArea.style.boxShadow = '';
      resultArea.style.borderColor = originalBorderColor;
    }, 150);

    const finalLang = (!langB || langB === 'auto') ? null : langB;
    speakText(text, this, finalLang);
  };

  // 刷新翻译
  async function triggerRefresh(btnElement, actionName) {
    btnElement.classList.add('loading');
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
        showUpdateNotification();
        btnElement.classList.remove('loading');
        return;
      }
      const tab = await getActiveTab();
      if (tab?.id) {
        await safeSendToTab(tab.id, {
          action: actionName,
          config: { forceAll: true }
        }).catch(err => {
          logger.warn(`[Popup] 消息下发失败 (页面可能未就绪):`, err.message);
        });
        logger.log(`[Popup] ${actionName} 流程尝试结束`);
      }
    } catch (error) {
      logger.warn("[Popup] 无法连接到目标页面脚本:", error.message);
    } finally {
      setTimeout(() => {
        btnElement.classList.remove('loading');
      }, 800);
    }
  }
  document.getElementById('btnRefreshPage').onclick = function (e) {
    e.stopPropagation();
    triggerRefresh(this, "RE_SCAN_PAGE");
  };
  document.getElementById('btnRefreshYT').onclick = function (e) {
    e.stopPropagation();
    triggerRefresh(this, "REFRESH_YT");
  };
  // 个性化扫描配置面板
  {
    const initInspectState = () => {
      const content = document.getElementById('inspectContent');
      const arrow = document.getElementById('inspectArrow');
      if (!content || !arrow) return;

      const savedState = localStorage.getItem('inspectContainerState');

      if (savedState === 'collapsed') {
        // 用户明确收起过，直接折叠
        content.style.transition = 'none';
        content.style.maxHeight = '0px';
        content.style.opacity = '0';
        content.style.overflow = 'hidden';
        content.style.marginTop = '0px';
        arrow.classList.remove('arrow-expanded');

      } else {
        // 已展开过，或首次使用：直接展开，不再自动收起
        content.style.transition = 'none';
        content.style.maxHeight = '600px';
        content.style.opacity = '1';
        content.style.overflow = 'visible';
        content.style.marginTop = '8px';
        arrow.classList.add('arrow-expanded');
      }
    };

    setTimeout(initInspectState, 0);

    document.addEventListener('click', function (e) {
      const header = e.target.closest('#inspectHeader');
      if (!header) return;

      const content = document.getElementById('inspectContent');
      const arrow = document.getElementById('inspectArrow');
      if (!content || !arrow) return;

      const isCollapsed = content.style.maxHeight === '0px' || content.style.maxHeight === '';

      if (isCollapsed) {
        // 展开
        content.style.transition = 'max-height 0.3s ease, opacity 0.25s ease, margin-top 0.3s ease';
        content.style.maxHeight = '600px';
        content.style.opacity = '1';
        content.style.marginTop = '8px';
        setTimeout(() => {
          content.style.overflow = 'visible';
          content.style.transition = 'none';
        }, 300);
        arrow.classList.add('arrow-expanded');
        localStorage.setItem('inspectContainerState', 'expanded');
      } else {
        // 折叠 确保 transition 先生效再改属性, 避免顿挫
        content.style.overflow = 'hidden';
        content.style.transition = 'none';
        requestAnimationFrame(() => {
          content.style.transition = 'max-height 0.3s ease, opacity 0.25s ease, margin-top 0.3s ease';
          requestAnimationFrame(() => {
            content.style.maxHeight = '0px';
            content.style.opacity = '0';
            content.style.marginTop = '0px';
          });
        });
        arrow.classList.remove('arrow-expanded');
        localStorage.setItem('inspectContainerState', 'collapsed');
      }
    });
  }

  const refreshUI = async () => {
    try {
      const tab = await getActiveTab();
      if (tab && tab.url) {
        window.domain = new URL(tab.url).hostname.replace('www.', '');
      }
      const keys = ['siteSettings', 'globalConfig', 'autoSync', 'syncConfig', 'lastSyncTime', 'scanConfig', 'ui_language'];
      const storage = await safeGetStorage(keys);
      if (!storage) {
        logger.error("[Mira-Trace] refreshUI 无法获取 storage");
        return;
      }
      const currentUiLang = storage.ui_language || getBrowserLang() || 'en';
      if (!window.currentConfig) window.currentConfig = {};
      Object.assign(window.currentConfig, storage);
      if (!window.currentConfig.scanConfig) {
        window.currentConfig.scanConfig = { global: {}, custom: {} };
      }
      if (!window.currentConfig.scanConfig.custom) {
        window.currentConfig.scanConfig.custom = {};
      }
      if (!window.currentConfig.scanConfig.global) {
        window.currentConfig.scanConfig.global = {};
      }
      const siteSettings = storage.siteSettings || {};
      const globalConfig = storage.globalConfig || { page: globalDefault_Page, select: globalDefault_Select, yt: globalDefault_YT };
      const conf = (currentMode === 'current' && siteSettings[window.domain])
        ? siteSettings[window.domain]
        : globalConfig;
      const updateEl = (id, className, condition) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle(className, !!condition);
      };
      updateEl('tabCurrent', 'active', currentMode === 'current');
      updateEl('tabGlobal', 'active', currentMode === 'global');
      updateEl('autoSwitchPage', 'on', conf.page);
      updateEl('autoSwitchSelectText', 'on', conf.select);
      const btnPage = document.getElementById('btnRefreshPage');
      if (btnPage) {
        btnPage.style.setProperty('display', conf.page ? 'flex' : 'none', 'important');
        btnPage.title = t('retranslate') || "Retranslate this page";
      }

      // 控制显隐youtube操作提示
      if (ytSwitch && btnYT) {
        const ytContainer = document.getElementById('youtube-option-container');

        if (currentMode === 'global' || !isYouTube) {
          // 全局模式 或 非 YouTube 页面，直接隐藏
          if (ytContainer) ytContainer.style.display = 'none';
          if (ytHint) {
            ytHint.classList.remove('show');
            ytHint.style.display = 'none';
          }
        } else {
          // current 模式 + YouTube 页面才显示
          if (ytContainer) ytContainer.style.display = '';
          const isYTOn = !!conf.yt;
          ytSwitch.classList.toggle('on', isYTOn);
          btnYT.style.setProperty('display', isYTOn ? 'flex' : 'none', 'important');

          if (ytHint) {
            const finalShouldShow = isYTOn && isYouTube && !window.isRestricted;
            if (finalShouldShow) {
              showYtHintWithFade(storage.ui_language);
            } else {
              ytHint.classList.remove('show');
              ytHint.style.display = 'none';
            }
          }
        }
      }

      const autoSyncEl = document.getElementById('autoSyncToggle');
      if (autoSyncEl) {
        const isActive = !!storage.autoSync;
        autoSyncEl.classList.toggle('active', isActive);
        const freqArea = document.getElementById('syncFrequencyArea');
        if (freqArea) {
          freqArea.style.opacity = isActive ? '1' : '0.5';
          freqArea.style.pointerEvents = isActive ? 'auto' : 'none';
        }
      }
      const statusEl = document.getElementById('syncStatus');
      if (statusEl) {
        statusEl.innerText = storage.lastSyncTime
          ? `${t('lastSync', currentUiLang)} ${new Date(storage.lastSyncTime).toLocaleString()}`
          : (t('neverSynced', currentUiLang) || 'Not synced');
      }
      if (storage.syncConfig) {
        const scSync = storage.syncConfig;
        const methodEl = document.getElementById('syncMethod');
        const areaEl = document.getElementById('webdavConfigArea');
        if (methodEl) {
          methodEl.value = scSync.method || 'googleDrive';
          if (areaEl) {
            areaEl.style.display = (methodEl.value === 'webdav') ? 'block' : 'none';
          }
        }
        const setVal = (id, val) => {
          const el = document.getElementById(id);
          if (el) el.value = val || '';
        };
        setVal('webdavUrl', scSync.webdavUrl);
        setVal('webdavUser', scSync.webdavUser);
        setVal('webdavPass', scSync.webdavPass);
        setVal('syncFrequency', scSync.frequency);
      }
      let targetL = targetLang || window.currentTargetL || getBrowserLang() || 'en';
      targetL = targetL.replace('_', '-');
      const targetLangEl = document.getElementById('targetLang');
      if (targetLangEl) targetLangEl.value = normalizeLang(targetL);
      if (typeof updateEngineTips === 'function') {
        const engineSelect = document.getElementById('engineSelect');
        const currentEngine = engineSelect ? engineSelect.value : _defaultEngine;
        updateEngineTips(currentEngine);
      }

      //  恢复界面语言下拉框状态 
      const uiLangSelect = document.getElementById('uiLangSelect');
      if (uiLangSelect) {
        //  获取标准化后的语言代码
        const rawUiLang = storage.ui_language || chrome.i18n.getUILanguage().replace('_', '-') || 'en';
        const normalized = normalizeLang(rawUiLang);

        //  尝试直接赋值
        uiLangSelect.value = normalized;

        //  如果赋值失败（value 变为空），则尝试回退到基础语言
        if (uiLangSelect.value !== normalized) {
          const baseLang = normalized.split('-')[0]; // 例如从 'pt-BR' 提取出 'pt'
          uiLangSelect.value = baseLang;
        }

        //  二次兜底：如果连基础语言都没有（比如某种罕见语种），默认选英文
        if (!uiLangSelect.value) {
          uiLangSelect.value = 'en';
        }
      }

      const domainLabel = document.getElementById('domainIndicatorWrapper');
      const inspectBtn = document.getElementById('inspectElement');
      const inspectLabelBtn = document.getElementById('inspectElementLabel');
      //仅手机端, 禁用pick功能
      const isPhone = /Android.*Mobile|iPhone|iPod/i.test(navigator.userAgent);

      if (isPhone) {
        if (inspectBtn) inspectBtn.style.display = 'none';
      }
      if (checkRTL(uiLangSelect.value)) {
        // inspectElementLabel 右对齐
        const label = document.getElementById('inspectElementLabel');
        if (label) {
          label.style.textAlign = 'right';
          label.style.display = 'block';
          label.style.width = '100%';
        }

        // inspectElement 图标移到右边
        const inspectBtn = document.getElementById('inspectElement');
        if (inspectBtn) {
          inspectBtn.style.display = 'flex';
          inspectBtn.style.flexDirection = 'row-reverse';
          const icon = inspectBtn.querySelector('span:first-child');
          if (icon) {
            icon.style.position = 'absolute';
            icon.style.left = 'auto';
            icon.style.right = '6px';
          }
        }

        // matchSelector label 右对齐
        const matchLabel = document.querySelector('label[data-i18n="matchSelector"]');
        if (matchLabel) {
          matchLabel.style.textAlign = 'right';
          matchLabel.style.display = 'block';
          matchLabel.style.width = '100%';
        }

        // label行反转
        const labelRow = document.querySelector('#inspectContainer .row > div:first-child');
        if (labelRow) {
          labelRow.style.flexDirection = 'row-reverse';
          labelRow.style.width = '100%';
        }
      }

      function hideFade(el) {
        if (!el) return;
        el.classList.add('hidden-fade');
        setTimeout(() => {
          el.style.display = 'none';
        }, 350);
      }

      function showFade(el) {
        if (!el) return;
        el.style.display = 'block';
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.classList.remove('hidden-fade');
          });
        });
      }

      if (inspectBtn && inspectLabelBtn) {
        if (isPhone) {
          hideFade(inspectBtn); // 手机端始终隐藏
        } else if (currentMode === 'global') {
          hideFade(inspectBtn);
          if (domainLabel) hideFade(domainLabel);
        } else {
          showFade(inspectBtn);
          if (domainLabel) showFade(domainLabel);
        }
      }
      const { activeConfig } = await safeGetStorage('activeConfig');
      const engineNameEl = document.getElementById('currentEngineName');
      if (engineNameEl) {
        const activeCfg = activeConfig || { engine: _defaultEngine, data: {} };
        const engineId = activeCfg.engine || _defaultEngine;
        const alias = activeCfg.alias || activeCfg.data?.alias;
        const engineMap = {
          'google': 'Google Translate',
          'bing': 'Bing Translate'
        };
        let displayName;
        if (engineMap[engineId]) {
          displayName = engineMap[engineId];
        } else if (alias && alias !== engineId) {
          displayName = alias;
        } else {
          displayName = engineId.charAt(0).toUpperCase() + engineId.slice(1);
        }
        engineNameEl.innerText = displayName;
      }
      updateScanInputs();
      if (typeof updateCacheSizeDisplay === 'function') updateCacheSizeDisplay();
      const hintEl = document.getElementById('builtinRuleHint');
      const resetBtn = document.getElementById('btnResetToBuiltin');
      const hasBuiltinRule = (typeof SiteRules !== 'undefined') && SiteRules.hasRule(domain);

      if (hintEl) {
        hintEl.style.display = hasBuiltinRule ? 'block' : 'none';
        hintEl.title = t('builtinRuleHint');
      }

      //  控制重置按钮显示   
      if (resetBtn) {
        resetBtn.style.display = hasBuiltinRule ? 'inline-block' : 'none';
        resetBtn.innerText = t('resetBuildinRules');
        resetBtn.title = t('restoreRules');
        resetBtn.onclick = async () => {
          const rule = SiteRules.getRule(domain);
          const builtinSelectors = rule.selectors;
          const builtinMinLen = rule.minLen ?? 5;

          const formatted = builtinSelectors
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
            .join(',\n');

          selectorInput.value = formatted;
          minLenInput.value = builtinMinLen;

          const res = await safeGetStorage('scanConfig');
          let config = { global: {}, custom: {} };
          if (res?.scanConfig) {
            config.global = res.scanConfig.global || {};
            config.custom = res.scanConfig.custom || {};
          }
          delete config.custom[domain];
          await safeSetStorage({ scanConfig: config });

          await saveScanConfig();
          showToast(t('success') || 'Default presets restored.', 'success');
        };
      }
    } catch (e) {
      logger.error("[Mira-Trace] refreshUI 发生致命错误:", e);
    }
  };
  document.getElementById('inspectElement').addEventListener('click', async () => {
    if (currentMode === 'global') return;
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
        showUpdateNotification();
        return;
      }
      const tab = await getActiveTab();
      if (tab?.id) {
        safeSendToTab(tab.id, {
          action: 'START_INSPECT',
          lang: globalUiLang
        }).catch(() => { });
        setTimeout(() => window.close(), 10);
      } else {
        window.close();
      }
    } catch (err) {
      if (err.message?.includes("context invalidated")) {
        showUpdateNotification();
      } else {
        logger.error("启动拾取失败:", err);
        window.close();
      }
    }
  });

  const updateScanInputs = () => {
    if (document.activeElement === selectorInput || document.activeElement === minLenInput) return;
    const config = window.currentConfig || {};
    const sc = config.scanConfig || { global: {}, custom: {} };
    const custom = sc.custom || {};
    const global = sc.global || {};
    let targetConfig;
    const tabCurrentEl = document.getElementById('tabCurrent');
    const isCurrentMode = tabCurrentEl ? tabCurrentEl.classList.contains('active') : true;
    const tabUrl = window.domain || "";

    if (isCurrentMode) {
      //  当前网站模式：优先用户自定义，再用网站默认，再用fallback
      const defaultScanRule = (typeof SiteRules !== 'undefined') ? SiteRules.getRule(tabUrl) : { selectors: '', minLen: 2 };
      targetConfig = custom[tabUrl] || defaultScanRule;
    } else {
      //  全局模式：只显示全局设置，没设置过就显示generic
      const generic = (typeof SiteRules !== 'undefined') ? SiteRules.generic : { selectors: '', minLen: 15 };
      targetConfig = {
        selectors: global.selectors || generic.selectors,
        minLen: global.minLen ?? generic.minLen  // 全局没设置就用generic（15）
      };
    }

    if (selectorInput) {
      selectorInput.value = (targetConfig && targetConfig.selectors)
        ? formatSelectors(targetConfig.selectors)
        : '';
      _originalSelectorValue = normalizeSelectors(selectorInput.value.trim());
    }
    if (minLenInput) minLenInput.value = (targetConfig && targetConfig.minLen) ? targetConfig.minLen : 15;
  };
  document.getElementById('tabCurrent').onclick = () => {
    currentMode = 'current';
    refreshUI();
  };
  document.getElementById('tabGlobal').onclick = () => {
    currentMode = 'global';
    refreshUI();
  };
  const bindSwitch = (id, key, action) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.onclick = null;
    el.onclick = async (e) => {
      e.stopPropagation();
      const data = await safeGetStorage(['siteSettings', 'globalConfig']);
      if (!data) return;
      let ss = data.siteSettings || {};
      let gc = data.globalConfig || { page: globalDefault_Page, select: globalDefault_Select, yt: globalDefault_YT };
      if (currentMode === 'current' && !ss[domain]) {
        ss[domain] = JSON.parse(JSON.stringify(gc));
        if (!domain.includes('youtube.com')) {
          delete ss[domain].yt;
        }
      }
      if (currentMode === 'current') {
        ss[domain][key] = !ss[domain][key];
      } else {
        gc[key] = !gc[key];
      }
      await safeSetStorage({
        globalConfig: gc,
        siteSettings: ss
      });
      if (currentConfig) {
        currentConfig.globalConfig = gc;
        currentConfig.siteSettings = ss;
      }
      refreshUI();
      const target = (currentMode === 'current') ? ss[domain] : gc;
      safeSendToTab(activeTab.id, {
        action: action,
        enabled: target[key],
        config: target
      });
    };
  };
  bindSwitch('autoSwitchPage', 'page', 'SET_PAGE_SCAN_STATE');
  bindSwitch('autoSwitchSelectText', 'select', 'SET_SELECT_STATE');
  bindSwitch('autoSwitchYT', 'yt', 'SET_YT_STATE');
  refreshUI();
  const formatSelectors = (str) =>
    str.split(',').map(s => s.trim()).filter(Boolean).join(',\n');
  const normalizeSelectors = (str) =>
    str.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).join(', ');
  const selectorInput = document.getElementById('conf-selectors');
  const userScanConfig = currentConfig.scanConfig?.custom?.[domain];
  const defaultScanRule = SiteRules.getRule(domain);
  const minLenInput = document.getElementById('conf-minlen');
  if (userScanConfig && userScanConfig.selectors !== undefined) {
    selectorInput.value = formatSelectors(userScanConfig.selectors);
  } else {
    selectorInput.value = formatSelectors(defaultScanRule.selectors);
  }
  if (userScanConfig && userScanConfig.minLen !== undefined) {
    minLenInput.value = userScanConfig.minLen;
  } else {
    minLenInput.value = defaultScanRule.minLen;
  }
  let _isSaving_Lock = false;
  let _originalSelectorValue = "";
  let _originalMinLen = "";
  const saveScanConfig = async () => {
    if (_isSaving_Lock) return;
    _isSaving_Lock = true;
    const currentValue = normalizeSelectors(selectorInput.value);
    const currentMinLen = minLenInput.value;
    if (currentValue === _originalSelectorValue && currentMinLen === _originalMinLen) {
      logger.log("[Popup] 内容未改变，跳过保存与重扫");
      _isSaving_Lock = false;
      return;
    }
    try {
      const _currentTab = await getActiveTab();
      if (!_currentTab || !_currentTab.id || !_currentTab.url) {
        _isSaving_Lock = false;
        return;
      }
      const _local_domain = new URL(_currentTab.url).hostname.replace('www.', '');
      const _local_selectors = normalizeSelectors(selectorInput.value.trim());
      const _local_minLen = parseInt(minLenInput.value) || 5;
      logger.log(`[Mira-Trace] 保存配置: domain=${_local_domain}, selectors="${_local_selectors}", minLen=${_local_minLen}`);
      const _isCurrentMode = document.getElementById('tabCurrent').classList.contains('active');
      const _local_storage_res = await safeGetStorage('scanConfig');
      let _finalConfig = { global: {}, custom: {} };
      if (_local_storage_res && _local_storage_res.scanConfig) {
        if (typeof _local_storage_res.scanConfig === 'object') {
          _finalConfig.global = _local_storage_res.scanConfig.global || {};
          _finalConfig.custom = _local_storage_res.scanConfig.custom || {};
        }
      }
      if (!_finalConfig.custom) _finalConfig.custom = {};
      if (_isCurrentMode) {
        logger.log(`[Mira-Trace] 准备写入域名配置: ${_local_domain}`);
        _finalConfig['custom'][String(_local_domain)] = {
          selectors: _local_selectors,
          minLen: _local_minLen
        };
      } else {
        logger.log(`[Mira-Trace] 准备写入全局配置`);
        if (!_finalConfig.global) _finalConfig.global = {};
        _finalConfig.global.selectors = _local_selectors;
        _finalConfig.global.minLen = _local_minLen;
      }
      await safeSetStorage({ scanConfig: _finalConfig });
      if (window.currentConfig) {
        window.currentConfig.scanConfig = _finalConfig;
      }
      logger.log("[Mira-Trace] 存储保存成功，准备适配消息格式...");
      const _finalSelectors = _isCurrentMode
        ? _local_selectors
        : (_finalConfig.global?.selectors || "p");
      const messageBody = {
        action: 'RE_SCAN_PAGE',
        config: {
          selectors: _finalSelectors,
          forceAll: true
        }
      };
      logger.log(`[Mira-Trace] 发送指令至 Tab ${_currentTab.id}, 规则: ${_finalSelectors}`);
      const response = await safeSendToTab(_currentTab.id, messageBody);
      if (response) {
        logger.log("[Mira-Trace] 页面重扫指令已确认");
      } else {
        logger.warn("[Mira-Trace] 消息已发出但未收到响应，可能是页面未加载脚本");
      }
    } catch (err) {
      logger.error("[Mira-Trace] 保存或通知过程失败:", err);
    } finally {
      _isSaving_Lock = false;
    }
  };
  selectorInput.onfocus = () => {
    _originalSelectorValue = normalizeSelectors(selectorInput.value.trim());
    _originalMinLen = minLenInput.value;
  };
  minLenInput.onfocus = () => {
    _originalSelectorValue = normalizeSelectors(selectorInput.value.trim());
    _originalMinLen = minLenInput.value;
  };
  selectorInput.addEventListener('blur', saveScanConfig);
  minLenInput.addEventListener('blur', saveScanConfig);
  //切换网页翻译目标语言
  document.getElementById('targetLang').onchange = async (e) => {
    const langSelect = document.getElementById('targetLang');
    try {
      langSelect.disabled = true;
      const lang = langSelect.value;
      currentConfig.targetLanguage = lang;
      window.currentTargetL = lang;
      await safeSetStorage({ targetLanguage: lang });
      const response = await safeSendToTab(activeTab.id, {
        action: 'RE_SCAN_PAGE',
        config: { forceAll: true },
        lang: lang
      });
    } catch (err) {
      logger.error("切换目标语言报错:", err);
    } finally {
      langSelect.disabled = false;
    }
  };
  const openNotebook = async () => {
    await safeCreateTab('notebook.html');
    window.close();
  };
  document.getElementById('openNotebook').onclick = openNotebook;
  document.getElementById('openNotebookSecondary').onclick = openNotebook;

  const openSettings = async () => {
    document.getElementById('btnGoEngine').classList.remove('menu-item-pulse-strong');
    await safeCreateTab("engineSettings.html");
    window.close();
  };
  document.getElementById('btnGoEngine').onclick = openSettings;

  document.getElementById('openSettings').onclick = async (e) => {
    e.stopPropagation();
    advMenu.style.display = 'none';
    togglePopupEngineDropdown();
  };

  const initEngineButtonState = async () => {
    const btn = document.getElementById('advancedSettingsBtn');
    const { hasVisitedSettings } = await safeGetStorage('hasVisitedSettings');
    btn.classList.remove('engine-pulse-strong', 'engine-pulse-soft');
    btn.classList.add(hasVisitedSettings ? 'engine-pulse-soft' : 'engine-pulse-strong');
  };

  // 初始化弹窗的引擎选择器
  async function initPopupEngineSelector() {
    const data = await safeGetStorage([
      "userConfigs",
      "activeConfig",
      "data_mira_pro",
      "selectedEngine",
      "_defaultEngine",
    ]);
    if (!data) return;

    const builtInEngines = [
      { id: "mira_pro", engine: "mira_pro", alias: "✦ Mira AI Translator" },
      { id: "google_builtin", engine: "google", alias: "Google" },
      { id: "bing_builtin", engine: "bing", alias: "Bing" },
    ];
    const storedConfigs = data.userConfigs || [];
    const customConfigs = storedConfigs.filter(
      (c) => !["mira_pro", "google_builtin", "bing_builtin"].includes(c.id)
    );
    window._popupUserConfigs = [...builtInEngines, ...customConfigs];

    let currentId =
      data.activeConfig?.id ||
      window._popupUserConfigs.find((c) => c.engine === data.selectedEngine)?.id ||
      window._popupUserConfigs.find((c) => c.engine === data._defaultEngine)?.id ||
      "google_builtin";
    const currentModel = data.data_mira_pro?.model || MIRA_FALLBACK_MODELS[0].id;

    // Pro 功能未开放时，若历史数据残留 mira_pro，兜底为 google
    if (currentId === "mira_pro" && !enable_pro_features) {
      currentId = "google_builtin";
    }

    window._popupCurrentEngineId = currentId;
    window._popupCurrentModel = currentModel;

    updatePopupEngineLabel();
  }

  function getShortAliasPopup(cfg, modelId) {
    if (cfg.engine === "mira_pro") {
      const m = MIRA_FALLBACK_MODELS.find((m) => m.id === modelId);
      return m ? m.label : "Mira";
    }
    return (cfg.alias || cfg.engine).slice(0, 10);
  }

  function updatePopupEngineLabel() {
    const labelEl = document.getElementById('currentEngineName');
    const cfg = (window._popupUserConfigs || []).find(
      (c) => c.id === window._popupCurrentEngineId
    ) || window._popupUserConfigs?.[0];
    if (labelEl && cfg) {
      labelEl.textContent = getShortAliasPopup(cfg, window._popupCurrentModel);
    }
  }

  function togglePopupEngineDropdown() {
    const existing = document.getElementById('p-engine-dropdown-popup');
    if (existing) {
      existing.remove();
      return;
    }
    createPopupEngineDropdown();
  }

  function createPopupEngineDropdown() {
    const anchorEl = document.getElementById('openSettings');
    const userConfigs = window._popupUserConfigs || [];
    const currentId = window._popupCurrentEngineId;
    const currentModel = window._popupCurrentModel;

    const colors = {
      bg: "rgba(18,18,18,0.85)",
      border: "rgba(255,255,255,0.27)",
      shadow: "0 8px 24px rgba(0,0,0,0.6)",
      text: "#ffffffb7",
      textMuted: "rgba(255,255,255,0.50)",
      hoverBg: "rgba(56,189,248,0.15)",
      accent: "#38bdf8",
      activeBg: "rgba(56,189,248,0.15)",
    };

    const dropdown = document.createElement('div');
    const anchorMinWidth = anchorEl.offsetWidth;
    const maxAllowedWidth = 260;

    dropdown.id = 'p-engine-dropdown-popup';
    //  先不定位、不限宽，只做隐身测量容器，让内容自然撑开
    dropdown.style.cssText = `
    position:fixed; z-index:9999; visibility:hidden;
    background:${colors.bg}; border:1px solid ${colors.border};
    border-radius:10px; box-shadow:${colors.shadow};
    padding:4px; font-size:12px; line-height:1.5; color:${colors.text};
    backdrop-filter:blur(20px) saturate(180%);
    -webkit-backdrop-filter:blur(20px) saturate(180%);
    top:0; left:0;
    width:max-content;
    max-width:${maxAllowedWidth}px;
  `;

    let activeItemEl = null; // 用于记录当前选中项，稍后滚动定位到它

    userConfigs.forEach((cfg) => {
      const isMira = cfg.engine === 'mira_pro';
      const isEngineActive = cfg.id === currentId;

      if (isMira) {
        if (!enable_pro_features) return; // Pro 功能未启用，整个 Mira 分组不渲染

        const header = document.createElement('div');
        header.style.cssText = `
        display:flex; align-items:center; gap:6px;
        padding:6px 10px; font-size:12px; font-weight:600;
        color:${colors.textMuted}; user-select:none;
      `;
        header.innerHTML = `<span style="color:#fbbf24;">✦</span> Mira AI Translator`;
        dropdown.appendChild(header);

        MIRA_FALLBACK_MODELS.forEach((m) => {
          const isActive = isEngineActive && currentModel === m.id;
          const item = document.createElement('div');
          item.style.cssText = `
          display:flex; align-items:center; gap:8px;
          padding:5px 10px 5px 24px; border-radius:7px; cursor:pointer;
          color:${isActive ? colors.accent : colors.text};
          background:${isActive ? colors.activeBg : 'transparent'};
          transition:background 0.15s;
        `;
          item.innerHTML = `
          <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m.label}</span>
          <span style="font-size:9px; padding:1px 5px; border-radius:8px; flex-shrink:0;
            background:${m.tagColor}22; color:${m.tagColor};">${m.tag}</span>
        `;
          item.onmouseenter = () => { if (!isActive) item.style.background = colors.hoverBg; };
          item.onmouseleave = () => { if (!isActive) item.style.background = 'transparent'; };
          item.onclick = (ev) => {
            ev.stopPropagation();
            dropdown.remove();
            switchPopupEngine(cfg, m.id);
          };
          dropdown.appendChild(item);
        });
      } else {
        const isActive = isEngineActive;
        const item = document.createElement('div');
        item.style.cssText = `
        display:flex; align-items:center; gap:8px;
        padding:6px 10px; border-radius:7px; cursor:pointer;
        color:${isActive ? colors.accent : colors.text};
        background:${isActive ? colors.activeBg : 'transparent'};
        font-weight:${isActive ? '600' : '400'};
        transition:background 0.15s;
      `;
        item.innerHTML = `<span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${cfg.alias}</span>`;
        item.onmouseenter = () => { if (!isActive) item.style.background = colors.hoverBg; };
        item.onmouseleave = () => { if (!isActive) item.style.background = 'transparent'; };
        item.onclick = (ev) => {
          ev.stopPropagation();
          dropdown.remove();
          switchPopupEngine(cfg, null);
        };
        if (isActive) activeItemEl = item;
        dropdown.appendChild(item);
      }
    });

    // 分隔线
    const divider = document.createElement('div');
    divider.style.cssText = `
      height:1px; background:${colors.border}; margin:4px 6px;
    `;
    dropdown.appendChild(divider);

    // 特殊选项：跳转到完整引擎设置页
    const manageItem = document.createElement('div');
    manageItem.style.cssText = `
      display:flex; align-items:center; gap:8px;
      padding:6px 10px; border-radius:7px; cursor:pointer;
      color:${colors.accent}; font-weight:600;
      transition:background 0.15s;
    `;
    manageItem.innerHTML = `
      <span style="
        flex-shrink:0; display:flex; align-items:center; justify-content:center;
        width:20px; height:16px; border-radius:5px;
        background: linear-gradient(135deg, rgba(56,189,248,0.35), rgba(56,189,248,0.12));
        border: 1px solid rgba(56,189,248,0.6);
        font-size:9px; font-weight:800; letter-spacing:0.3px;
        color:#7dd3fc;
        box-shadow: 0 0 6px 1px rgba(56,189,248,0.6);
        filter: drop-shadow(0 0 3px rgba(56,189,248,0.6));
      ">AI</span>
      <span data-i18n="engineSettingsShort" style="
      flex:1;
      min-width:0;
      overflow:hidden;
      text-overflow:ellipsis;
      display:-webkit-box;
      -webkit-box-orient:vertical;
      -webkit-line-clamp:2;
      white-space:normal;
      line-height:16px;
    ">${t('translationEngine', globalUiLang)}</span>
        `;

    manageItem.onmouseenter = () => { manageItem.style.background = colors.hoverBg; };
    manageItem.onmouseleave = () => { manageItem.style.background = 'transparent'; };
    manageItem.onclick = (ev) => {
      ev.stopPropagation();
      dropdown.remove();
      openSettings();
    };
    dropdown.appendChild(manageItem);

    document.body.appendChild(dropdown);

    // 彻底绕开 -webkit-box/line-clamp 的测量干扰：
    // 用一个完全独立的、脱离文档流的临时元素来测文字真实单行宽度，
    // 不依赖 manageSpan 当前的 display/whiteSpace 状态如何切换
    const manageSpan = manageItem.querySelector('span[data-i18n="engineSettingsShort"]');
    const measureEl = document.createElement('span');
    measureEl.style.cssText = `
  position:absolute; visibility:hidden; white-space:nowrap;
  font-size:12px; line-height:16px; font-weight:600;
`;
    measureEl.textContent = manageSpan.textContent;
    document.body.appendChild(measureEl);
    const manageTextWidth = measureEl.scrollWidth;
    measureEl.remove();

    const iconWidth = 20 + 8; // AI 图标宽度 + gap
    const managePadding = 20; // manageItem 左右 padding (10px * 2)
    const safetyBuffer = 16; // 测量与实际渲染的误差余量，避免临界换行
    const manageItemNeededWidth = manageTextWidth + iconWidth + managePadding + safetyBuffer;

    const naturalWidth = Math.max(dropdown.scrollWidth, manageItemNeededWidth);
    const dropW = Math.min(Math.max(naturalWidth, anchorMinWidth), maxAllowedWidth);
    //alert(`manageTextWidth: ${manageTextWidth}\ndropdown.scrollWidth: ${dropdown.scrollWidth}\nmanageItemNeededWidth: ${manageItemNeededWidth}\nanchorMinWidth: ${anchorMinWidth}\nnaturalWidth: ${naturalWidth}\ndropW: ${dropW}`);
    //  拿到最终宽度后，再计算屏幕定位
    const btnRect = anchorEl.getBoundingClientRect();
    const gap = 6;
    const safeMargin = 8;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const maxDropH = 280;

    let left = btnRect.left;
    if (left + dropW > vw - safeMargin) left = vw - dropW - safeMargin;
    if (left < safeMargin) left = safeMargin;

    const spaceBelow = vh - btnRect.bottom - gap - safeMargin;
    const spaceAbove = btnRect.top - gap - safeMargin;
    let top, maxHeight;
    if (spaceBelow >= Math.min(maxDropH, 120)) {
      top = btnRect.bottom + gap;
      maxHeight = Math.min(maxDropH, spaceBelow);
    } else if (spaceAbove > spaceBelow) {
      maxHeight = Math.min(maxDropH, spaceAbove);
      top = btnRect.top - gap - maxHeight;
    } else {
      top = btnRect.bottom + gap;
      maxHeight = Math.min(maxDropH, spaceBelow);
    }
    top = Math.max(safeMargin, Math.min(top, vh - maxHeight - safeMargin));

    //  应用最终宽度、位置，并取消隐身
    dropdown.style.width = `${dropW}px`;
    dropdown.style.maxWidth = '';
    dropdown.style.maxHeight = `${maxHeight}px`;
    dropdown.style.overflowY = 'auto';
    dropdown.style.top = `${top}px`;
    dropdown.style.left = `${left}px`;
    dropdown.style.visibility = 'visible';

    // 挂载后滚动到当前选中项，让用户一打开就能看到已选的引擎
    if (activeItemEl) {
      const itemTop = activeItemEl.offsetTop;
      const itemHeight = activeItemEl.offsetHeight;
      const dropdownHeight = dropdown.clientHeight;
      // 让选中项尽量居中显示
      const targetScroll = itemTop - dropdownHeight / 2 + itemHeight / 2;
      dropdown.scrollTop = Math.max(0, targetScroll);
    }

    const closeDropdown = (ev) => {
      if (!dropdown.contains(ev.target) && !anchorEl.contains(ev.target)) {
        dropdown.remove();
        document.removeEventListener('click', closeDropdown, true);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', closeDropdown, true);
    }, 0);
  }

  async function switchPopupEngine(cfg, model) {
    const instanceData =
      (await safeGetStorage(`data_${cfg.id}`))?.[`data_${cfg.id}`] || {};

    let finalInstanceData = instanceData;
    if (cfg.engine === 'mira_pro' && model) {
      finalInstanceData = { ...instanceData, model };
    }

    const activeConfig = {
      id: cfg.id,
      engine: cfg.engine,
      data: finalInstanceData,
    };

    await safeSetStorage({
      activeConfig,
      lastActiveId: cfg.id,
      selectedEngine: cfg.engine,
      ...(cfg.engine === 'mira_pro' && model
        ? { data_mira_pro: finalInstanceData }
        : {}),
    });

    window._popupCurrentEngineId = cfg.id;
    if (model) window._popupCurrentModel = model;
    updatePopupEngineLabel();

  }
  initUILanguage();
  refreshUI();
  initEngineButtonState();
  initPopupEngineSelector();//  加载引擎列表并显示当前引擎名

  // 检测当前引擎是否可用
  async function checkEngineStatus() {
    const settingsBtn = document.getElementById('openSettings');
    if (!settingsBtn) return;

    const engine = currentConfig?.activeConfig?.engine
      || currentConfig?.selectedEngine
      || _defaultEngine;

    if (engine === 'google' || engine === 'bing') {
      const stored = await safeGetStorage(['_engineAvailable', '_engineCheckTime']);
      const age = Date.now() - (stored?._engineCheckTime || 0);
      const cacheValid = age < 15 * 60 * 1000;//可用性缓存15分钟

      if (!cacheValid) {
        // 缓存过期，通知 background 重新检测，但不等结果
        // 本次 popup 先用上次的结果展示，下次打开就是新结果了
        safeSendMessage({ type: 'RECHECK_ENGINE' });
      }

      if (stored?._engineAvailable === false) {
        showEngineWarning(settingsBtn);
      }
      return;
    }

    // AI 引擎：必须实时检测，因为 API Key 随时可能失效
    const targetLang = currentConfig?.targetLanguage || 'zh-CN';
    const isTargetEn = targetLang.toLowerCase().startsWith('en');
    const testText = isTargetEn ? '早上好' : 'Good morning';

    const res = await Promise.race([
      safeSendMessage({ type: 'TRANSLATE', text: testText, targetLang }),
      new Promise(resolve => setTimeout(() => resolve(null), 8000))
    ]);

    if (!res || res.error) { showEngineWarning(settingsBtn); return; }

    const data = res.currentTranslationResponse || res.result;
    if (!data || data.error) { showEngineWarning(settingsBtn); return; }

    const translatedText = (typeof data === 'string'
      ? data
      : (data.basic || data.translatedText || '')
    ).trim();

    if (!translatedText || translatedText.toLowerCase() === testText.toLowerCase()) {
      showEngineWarning(settingsBtn);
    }
  }

  function showEngineWarning(settingsBtn) {
    if (settingsBtn.querySelector('.engine-warning')) return;

    settingsBtn.title = 'Engine may not be working';

    const warning = document.createElement('span');
    warning.className = 'engine-warning';
    warning.style.cssText = `
        position: absolute;
        top: -4px;
        right: -4px;
        width: 14px;
        height: 14px;
        background: #ef4444;
        border-radius: 50%;
        color: white;
        font-size: 10px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
        line-height: 1;
        cursor: pointer;
    `;
    warning.title = 'Click to open engine settings';
    warning.textContent = '!';
    warning.onclick = async (e) => {
      e.stopPropagation(); // 防止触发 openSettings 上的下拉框逻辑
      await safeCreateTab("engineSettings.html");
      window.close();
    };
    settingsBtn.appendChild(warning);
  }

  // 登录认证相关
  // ── Auth UI 状态管理 ──────────────────────────────
  let userData = null;
  function updateAuthUI(user) {
    if (!enable_pro_features) return;
    userData = user;
    const btnLogin = document.getElementById('btnLogin');
    const btnAvatar = document.getElementById('btnAvatar');
    const authLoading = document.getElementById('authLoading');

    // 隐藏占位
    if (authLoading) authLoading.style.display = 'none';

    if (user) {
      btnLogin.style.display = 'none';
      btnAvatar.style.display = 'flex';
      setAvatarDisplay(user);
    } else {
      btnLogin.style.display = 'flex';
      btnAvatar.style.display = 'none';
    }
  }

  function setAvatarDisplay(user) {
    // 小头像（header 按钮）
    const img = document.getElementById('avatarImg');
    const initial = document.getElementById('avatarInitial');
    // 大头像（panel 内）
    const pImg = document.getElementById('panelAvatarImg');
    const pInitial = document.getElementById('panelAvatarInitial');

    if (user.photoURL) {
      img.src = user.photoURL;
      img.style.display = 'block';
      initial.style.display = 'none';
      pImg.src = user.photoURL;
      pImg.style.display = 'block';
      pInitial.style.display = 'none';
    } else {
      const letter = (user.displayName || user.email || '?')[0].toUpperCase();
      initial.textContent = letter;
      pInitial.textContent = letter;
      img.style.display = 'none';
      pImg.style.display = 'none';
    }

    document.getElementById('panelName').textContent = user.displayName || '—';
    document.getElementById('panelEmail').textContent = user.email || '—';
  }

  function updateBalance(amount) {
    document.getElementById('panelBalance').textContent =
      '$ ' + Number(amount).toFixed(2);
  }

  // ── Profile Panel 开关 ────────────────────────────
  const profilePanel = document.getElementById('profilePanel');

  document.getElementById('btnAvatar').addEventListener('click', (e) => {
    e.stopPropagation();

    const isOpening = profilePanel.style.display !== 'block';
    profilePanel.style.display = isOpening ? 'block' : 'none';
    advMenu.style.display = 'none';

    if (isOpening) {
      const balanceEl = document.getElementById('panelBalance');
      if (balanceEl) {
        balanceEl.innerText = t('refreshing') || 'fetching balance...';
        balanceEl.style.opacity = '0.7';
      }

      setTimeout(() => {
        if (userData?.uid) {
          logger.log('--- 延迟后发起真实的获取请求 ---');
          fetchBalance(userData.uid);
        }
      }, 150);
    }
  });

  // 点击 panel 外部关闭
  document.addEventListener('click', (e) => {
    if (!profilePanel.contains(e.target) && e.target !== document.getElementById('btnAvatar')) {
      profilePanel.style.display = 'none';
    }
  });

  // ── 按钮事件 ─────────────────────────────────────

  // ── 登录弹窗开关 ──────────────────────────────────
  const loginModal = document.getElementById('loginModal');

  document.getElementById('btnLogin').addEventListener('click', (e) => {
    e.stopPropagation();
    advMenu.style.display = 'none';
    profilePanel.style.display = 'none';
    loginModal.style.display = loginModal.style.display === 'none' ? 'block' : 'none';
  });

  document.addEventListener('click', (e) => {
    if (!loginModal.contains(e.target) &&
      e.target !== document.getElementById('btnLogin')) {
      loginModal.style.display = 'none';
    }
  });

  async function doLogin(provider) {
    loginModal.style.display = 'none';

    const btnLogin = document.getElementById('btnLogin');
    btnLogin.disabled = true;
    btnLogin.innerHTML = '<div class="mini-spinner"></div>';

    const action = provider === 'google' ? 'googleLogin' : 'microsoftLogin';

    const res = await safeSendMessage({ action });

    btnLogin.disabled = false;
    btnLogin.innerText = t('login') || 'Log in';

    if (res?.user) {
      await safeSendMessage({ action: 'clearBalanceCache' });
      updateAuthUI(res.user);
      fetchBalance(res.user.uid);
    } else if (res?.error && res.error !== 'USER_CANCELED') {
      logger.error('Login error:', res.error);
    }
  }

  if (enable_pro_features) {
    document.getElementById('btnGoogleLogin').addEventListener('click', () => doLogin('google'));
    document.getElementById('btnMicrosoftLogin').addEventListener('click', () => doLogin('microsoft'));
  }

  document.getElementById('btnLogout').addEventListener('click', async () => {
    await safeSendMessage({ action: 'logout' });
    profilePanel.style.display = 'none';
    updateAuthUI(null);
  });
  document.getElementById('btnDeleteAccount').addEventListener('click', async () => {
    const confirmed = confirm(t('deleteAccountConfirm') || 'Are you sure you want to delete your account? This action cannot be undone.');
    if (!confirmed) return;

    const btn = document.getElementById('btnDeleteAccount');
    const originalText = btn.innerText;

    // 删除中状态
    btn.disabled = true;
    btn.innerHTML = '<div class="mini-spinner"></div>';

    const response = await safeSendMessage({ action: 'deleteAccount' });

    if (response.ok) {
      btn.innerText = t('deleteAccountSuccess') || 'Account deleted successfully';
      setTimeout(() => {
        document.getElementById('btnLogout').click();
      }, 800);
    } else {
      btn.innerText = t('deleteAccountFail') || '✗ Deletion failed, please try again later';
      setTimeout(() => {
        btn.disabled = false;
        btn.innerText = originalText;
      }, 2000); // 2秒后恢复 
    }
  });
  //充值按钮
  document.getElementById('btnRecharge').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    btn.style.transform = 'scale(0.96)';
    btn.style.opacity = '0.8';
    setTimeout(() => {
      btn.style.transform = '';
      btn.style.opacity = '';
      profilePanel.style.display = 'none';
      safeSendMessage({ action: 'openRecharge' });
    }, 150);
  });


  function updateExpiryHint(expiresAt, expired) {
    const hintEl = document.getElementById('balanceExpiryHint');
    if (!hintEl) return;

    hintEl.className = 'balance-expiry';

    if (expired) {
      hintEl.textContent = t('credits_expired');
      hintEl.classList.add('danger');
      return;
    }

    if (!expiresAt) {
      hintEl.textContent = '';
      return;
    }

    const daysLeft = Math.ceil((new Date(expiresAt) - Date.now()) / (1000 * 60 * 60 * 24));

    if (daysLeft <= 30) {
      hintEl.textContent = t('expires_in_days').replace('{days}', daysLeft);
      hintEl.classList.add('warning');
    } else {
      const dateStr = new Date(expiresAt).toLocaleDateString();
      hintEl.textContent = t('valid_until').replace('{date}', dateStr);
    }
  }
  // ── 初始化：读取登录状态 ───────────────────────────

  async function fetchBalance(uid) {
    if (!uid) return;
    logger.log('[fetchBalance] 开始请求, uid:', uid);

    const res = await safeSendMessage({ action: 'getBalance', uid });
    logger.log('[fetchBalance] 返回结果:', res);

    if (!res) {
      logger.warn('[fetchBalance] res 为 null，请求失败');
      return;
    }
    if (res?.error === 'token_expired') {
      logger.warn('[fetchBalance] token 已过期，需要重新登录');
      await safeSendMessage({ action: 'logout' });  // 清除后端存储
      profilePanel.style.display = 'none';
      updateAuthUI(null);  // 切回登录 UI
      return;
    }
    const balanceEl = document.getElementById('panelBalance');
    if (balanceEl) balanceEl.style.opacity = '1';

    if (res?.balance != null) {
      logger.log('[fetchBalance] 获取到余额:', res.balance);
      updateBalance(res.balance);

      // 同步存储余额 + 过期时间
      const data = await safeGetStorage(['mira_user']);
      const existingUser = data?.mira_user || {};
      if (existingUser.uid) {
        await safeSetStorage({
          'mira_user': {
            ...existingUser,
            balance: res.balance,
            expires_at: res.expires_at || null,
            expired: res.expired || false,
          }
        });
      }

      // 显示过期提示
      updateExpiryHint(res.expires_at, res.expired);

    } else {
      logger.warn('[fetchBalance] balance 为空, 使用本地缓存');
      if (userData && userData.balance != null) {
        updateBalance(userData.balance);
        // 本地缓存也有过期时间，一并显示
        updateExpiryHint(userData.expires_at, userData.expired);
      }
    }
  }

  // ── 初始化：读取登录状态 ──
  const resUser = await safeSendMessage({ action: 'getUser' });
  if (resUser?.user) {
    updateAuthUI(resUser.user);
    safeGetStorage(['mira_jwt'], (data) => {
      if (data.mira_jwt) {
        fetchBalance(resUser.user.uid);
      } else {
        logger.log('通行证尚未就绪，暂不拉取余额');
      }
    });
  } else {
    updateAuthUI(null);
  }

  //  监听 storage 变化自动刷新 UI
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.mira_user) {
      const user = changes.mira_user.newValue;
      if (user) {
        // 如果是其他地方（比如后台翻译完）更新了 storage，这里的监听会自动同步头像和面板里的显示。
        userData = user; // 同步内存变量
        if (user.balance !== undefined) {
          updateBalance(user.balance);
        }
      } else {
        updateAuthUI(null);
      }
    }
  });

  checkEngineStatus();

  document.querySelector("#reviewLink").href = getReviewUrl();

});