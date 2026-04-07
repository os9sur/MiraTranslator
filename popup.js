window.browser = (function () {
  return window.msBrowser || window.browser || window.chrome;
})();
let activeTab = null;
let currentMode = 'current';
const CACHE_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_SIZE = 200;
let currentTranslationResponse = null;

//新用户蒙层
async function initOnboarding() {
  const tab = await getActiveTab();
  const url = tab?.url || "";

  // 受限页面，直接退出，不显示蒙层
  if (MiraUtils.isRestrictedUrl(url)) {
    return;
  }
  const guideEl = document.getElementById('welcome-guide');
  const targetBox = document.getElementById('targetLangCombox');
  const labelEl = document.getElementById('targetLangLabelText');
  const selectEl = document.getElementById('targetLang');
  const storageKey = 'mira_onboarding_v1';

  const completeOnboarding = () => {
    if (!guideEl || guideEl.style.display === 'none') return;
    if (labelEl) labelEl.style.display = 'block';
    localStorage.setItem(storageKey, 'true');
    guideEl.style.transition = 'opacity 0.4s ease';
    guideEl.style.opacity = '0';

    setTimeout(() => {
      guideEl.style.display = 'none';
      targetBox.classList.remove('first-time-highlight');
      //  蒙层消失时，恢复原生高度，不再占用多余空间
      document.body.style.minHeight = '';
    }, 400);
  };

  if (!localStorage.getItem(storageKey)) {
    if (labelEl) labelEl.style.display = 'none';
    //  强制撑开 popup 窗口，保证蒙层内容完全展示
    document.body.style.minHeight = '620px';

    guideEl.style.display = 'flex';
    targetBox.classList.add('first-time-highlight');
    document.getElementById('close-guide-btn').onclick = completeOnboarding;

    if (selectEl) {
      selectEl.addEventListener('mousedown', () => {
        // 500ms 后自动关掉蒙层 
        setTimeout(completeOnboarding, 500);
      });
    }
    // 点击蒙层背景关闭 
    guideEl.addEventListener('click', (e) => {
      if (e.target === guideEl) completeOnboarding();
    });
  } else {
    // 非第一次加载，Label 显示
    if (labelEl) labelEl.style.display = 'block';
  }
}

const NOTICE_DISMISSED_KEY = 'mira_notice_dismissed_v';

async function initNoticeBar() {
  const GITHUB_NOTICE_URL =
    'https://raw.githubusercontent.com/os9sur/MiraTranslator/refs/heads/main/assets/notice.json';

  let noticeData = null;

  try {
    const resp = await fetch(`${GITHUB_NOTICE_URL}?t=${Date.now()}`, {
      cache: 'no-cache'
    });
    if (!resp.ok) return;
    const json = await resp.json();
    if (!json.enabled) return;

    const uiLang = chrome.i18n.getUILanguage().replace('_', '-');
    const langShort = uiLang.split('-')[0];

    noticeData =
      json[uiLang] ||
      json[langShort] ||
      json['en'] ||
      null;
  } catch (e) {
    return;
  }

  if (!noticeData?.id || !noticeData?.title) return;

  const dismissedKey = NOTICE_DISMISSED_KEY + noticeData.id;
  const stored = await safeGetStorage(dismissedKey);
  if (stored?.[dismissedKey]) return;

  const bar = document.getElementById('noticeBar');
  const titleEl = document.getElementById('noticeTitleClip');
  const contentEl = document.getElementById('noticeContentText');
  const gotItBtn = document.getElementById('noticeGotItBtn');
  const expandBody = document.getElementById('noticeExpandedBody');
  const chevron = document.getElementById('noticeChevron');
  const dotEl = bar?.querySelector('[style*="border-radius: 50%"]');

  if (!bar) return;

  // 应用主题配色
  const theme = NOTICE_THEMES[noticeData.level] || NOTICE_THEMES.warning;
  bar.style.borderColor = theme.border;
  if (dotEl) dotEl.style.background = theme.dot;
  titleEl.style.color = theme.title;
  chevron.style.color = theme.chevron;
  gotItBtn.style.color = theme.gotItColor;
  gotItBtn.style.borderColor = theme.gotItBorder;
  gotItBtn.style.background = theme.gotItBg;
  expandBody.style.borderTopColor = theme.divider;
  bar.style.setProperty('--notice-glow', theme.dot);

  const styleId = 'mira-notice-pulse-style';
  let styleEl = document.getElementById(styleId);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
    @keyframes miraBorderPulse {
      0%,100% { border-color: ${theme.pulse[0]}; }
      50%      { border-color: ${theme.pulse[1]}; }
    }
  `;

  // 填入内容
  titleEl.textContent = noticeData.title;
  contentEl.textContent = noticeData.content || '';
  gotItBtn.textContent = noticeData.gotIt || t('btnGotIt', getBrowserLang() || 'en');

  bar.style.display = 'block';
  bar.classList.add('mira-pulsing');

  // 折叠行点击：展开 / 收起
  document.getElementById('noticeCollapsedRow').addEventListener('click', () => {
    const isExpanded = expandBody.style.display === 'block';
    expandBody.style.display = isExpanded ? 'none' : 'block';
    chevron.style.transform = isExpanded ? '' : 'rotate(180deg)';
    titleEl.classList.toggle('notice-title-expanded', !isExpanded);
    if (!isExpanded) bar.classList.remove('mira-pulsing');
  });

  // 知道了：持久化 + 淡出
  gotItBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await safeSetStorage({ [dismissedKey]: true });
    bar.style.transition = 'opacity 0.3s ease';
    bar.style.opacity = '0';
    setTimeout(() => { bar.style.display = 'none'; }, 300);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initNoticeBar();
  safeSendMessage({ type: 'CHECK_DEFAULT_ENGINE' });
  await initOnboarding();
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
      if (LANG_DISPLAY[key]) {
        return LANG_DISPLAY[key];
      }

      if (key === 'ja') return 'JA';
      if (key === 'en') return 'EN';
      if (key === 'ko') return 'KO';

      const lang = LANGS.find(item => item.value === val);
      if (lang) {
        return lang.en.slice(0, 2).toUpperCase();
      }

      return val.slice(0, 2).toUpperCase();
    };

    badgeA.textContent = getShortEn(selA.value);
    badgeB.textContent = getShortEn(selB.value);

    window.hintSourceLang = selA.value;
  }

  // 语言对 UI 事件绑定
  function bindLangPairEvents() {
    document.getElementById('langPairToggle')?.addEventListener('click', () => {
      document.getElementById('langPairTag').style.display = 'none';
      document.getElementById('langPairEdit').style.display = 'flex';
      document.getElementById('lpArrow').textContent = '⇄';
    });

    document.getElementById('lpDoneBtn')?.addEventListener('click', async () => {
      updateLpBadges();
      document.getElementById('langPairEdit').style.display = 'none';
      document.getElementById('langPairTag').style.display = 'flex';
      document.getElementById('lpArrow').textContent = '→';
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
  function initAllComboboxes() {
    document.querySelectorAll('.custom-combobox').forEach(box => {
      const input = box.querySelector('.api-input-field');
      const dropdown = box.querySelector('.combobox-dropdown');
      const toggle = box.querySelector('.combobox-toggle');
      const toggleMenu = (e) => {
        e.stopPropagation();
        const isShow = dropdown.classList.contains('show');
        document.querySelectorAll('.combobox-dropdown.show').forEach(d => d.classList.remove('show'));
        if (!isShow) {
          dropdown.classList.add('show');
          const currentValue = input.value;
          const activeItem = Array.from(dropdown.querySelectorAll('.dropdown-item'))
            .find(item => item.getAttribute('data-value') === currentValue);
          if (activeItem) {
            activeItem.scrollIntoView({ block: 'nearest' });
          }
        }
      };
      input.onclick = toggleMenu;
      if (toggle) toggle.onclick = toggleMenu;
      box.querySelectorAll('.dropdown-item').forEach(item => {
        item.onclick = (e) => {
          e.stopPropagation();
          const newValue = item.getAttribute('data-value');
          const newText = item.textContent;
          input.value = newValue;
          dropdown.classList.remove('show');
          input.dispatchEvent(new Event('change', { bubbles: true }));
        };
      });
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
          const finalHeight = Math.max(150, Math.min(realHeight, 600));
          document.body.style.height = `${finalHeight}px`;
          document.body.style.minHeight = `${finalHeight}px`;
          document.body.style.overflowY = realHeight > 600 ? 'auto' : 'hidden';
        }
      });
    };
    updatePopupHeight();
    const isFirefox = typeof InstallTrigger !== 'undefined' || /Firefox/.test(navigator.userAgent);
    if (selectedMethod === 'googleDrive') {
      logger.log("🔍 正在验证 Google Drive 授权...");
      if (isFirefox) {
        const data = await safeGetStorage('google_drive_token');
        if (!data) return;
        if (!data.google_drive_token) {
          logger.log("🔑 Firefox 需要手动拉起授权...");
          getGoogleTokenForFirefox(e.target, e.target.value, 'pull');
        } else {
          logger.log("✅ Firefox 缓存 Token 存在 (是否有效需在同步时验证)");
          saveSyncConfig();
        }
      } else {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (chrome.runtime.lastError || !token) {
            logger.log("🔑 Chrome 需要用户手动授权...");
            handleAuthFlow((response) => {
              if (response.success) {
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
      //  OneDrive 授权分支
      logger.log("🔍 正在验证 OneDrive 授权...");
      const data = await safeGetStorage('onedrive_token');
      if (!data?.onedrive_token) {
        logger.log("🔑 OneDrive 需要用户手动授权...");
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
    updateSyncProgressUI(btnId, 'initializing', true);
    await saveSyncConfig();
    const data = await safeGetStorage(['syncConfig', 'google_drive_token', 'ui_language', 'onedrive_token']);
    // logger.log('[DEBUG] onedrive_token 存在:', !!data?.onedrive_token);
    if (!data) return;
    window.uiLanguage = data.ui_language || (getBrowserLang() || 'en').replace('_', '-');
    const config = data.syncConfig || {};
    const method = config.method || 'local';
    if (method === 'local') {
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
      if (!isFirefox) {
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
      } else {
        getGoogleTokenForFirefox(btn, originalText, direction);
      }
      return;
    }
    //  OneDrive 无 token 时先授权
    if (method === 'oneDrive' && !data.onedrive_token) {
      updateSyncProgressUI(btnId, 'authorizing', true);
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
          safeSendMessage({ type: 'START_ONEDRIVE_AUTH' }).then((authRes) => {
            if (authRes?.success) {
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
            // 先尝试静默刷新，不弹窗
            safeSendMessage({ type: 'ONEDRIVE_SILENT_REFRESH' }).then(async (refreshRes) => {
              if (refreshRes?.success) {
                // 静默刷新成功，直接重试同步
                logger.log('[DEBUG] OneDrive 静默刷新成功，重试同步');
                executeSyncDataAction(btn, originalText, direction);
              } else {
                // 静默刷新失败，才清除 token 并弹窗重新授权
                logger.warn('[DEBUG] OneDrive 静默刷新失败，需要重新登录');
                await safeRemoveStorage('onedrive_token');
                safeSendMessage({ type: 'START_ONEDRIVE_AUTH' }).then((authRes) => {
                  if (authRes?.success) executeSyncDataAction(btn, originalText, direction);
                  else updateSyncProgressUI(btnId, '', false);
                });
              }
            });
          } else {
            await safeRemoveStorage('google_drive_token');
            if (typeof getGoogleTokenForFirefox === 'function') {
              return getGoogleTokenForFirefox(btn, originalText, direction);
            }
          }
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
      updateSyncProgressUI(btn.id, '', false);
      return;
    }
    if (response.success) {
      logger.log("[Mira-LOG] Firefox 授权成功");
      executeSyncDataAction(btn, originalText, direction);
    } else {
      showToast(t('firefoxAuthIncomplete'), 'error');
      if (btn) btn.innerText = originalText;
      updateSyncProgressUI(btn.id, '', false);
    }
  }
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
      tab.style.color = '#94a3b8';
      tab.style.background = 'transparent';
    });
    const activeTab = document.getElementById(`tab-${type}`);
    activeTab.classList.add('active');
    activeTab.style.color = '#020617';
    activeTab.style.background = '#38bdf8';
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
    globalConfig: { page: true, select: true, yt: true },
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
      document.getElementById('style-color').value = currentConfig.ytStyleSettings.color;
    }
  }
  //const btnDonate = document.getElementById('btnDonate');
  // const donateOverlay = document.getElementById('donateOverlay');
  // const closeDonate = document.getElementById('closeDonate');
  // const paypalUnit = document.getElementById('unit-paypal');
  // btnDonate.onclick = (e) => {
  //   e.stopPropagation();
  //   const currentLang = document.getElementById('targetLang').value;
  //   const donateContainer = document.getElementById('donateContainer');
  //   // 1. 处理 Paypal 单元挂载
  //   if (currentLang !== 'zh-CN') {
  //     donateContainer.prepend(paypalUnit);
  //   } else {
  //     donateContainer.appendChild(paypalUnit);
  //   }
  //   // 2. 面板切换
  //   document.getElementById('advancedMenu').style.display = 'none';
  //   donateOverlay.style.display = 'flex';
  //   // 3.  强制修改 body 尺寸 
  //   document.body.style.width = '600px';
  //   document.body.style.minHeight = 'auto';
  //   // 延迟获取高度
  //   setTimeout(() => {
  //     const fullHeight = donateOverlay.scrollHeight;
  //     document.body.style.height = fullHeight + 'px';
  //     document.body.style.minHeight = fullHeight + 'px';
  //     window.scrollTo(0, 0);
  //   }, 50); 
  // };
  // function hideDonateAndRestore() {
  //   donateOverlay.style.display = 'none';
  //   document.body.style.width = '260px';
  // }
  // if (closeDonate) {
  //   closeDonate.onclick = hideDonateAndRestore;
  // }
  // donateOverlay.onclick = (e) => {
  //   if (e.target === donateOverlay) {
  //     hideDonateAndRestore();
  //   }
  // };
  // paypalUnit.onclick = (e) => {
  //   e.preventDefault();
  //   e.stopPropagation();
  //   const url = 'https://www.paypal.me/davidbai27'; 
  //   if (typeof chrome !== 'undefined' && chrome.tabs) {
  //     chrome.tabs.create({ url: url });
  //   } else {
  //     window.open(url, '_blank', 'noopener,noreferrer');
  //   }
  // };
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
    const isRTL = ['ar', 'fa', 'he'].includes(currentLang);

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
        ytHint
      ].forEach(el => {
        if (el) el.style.display = 'none';
      });

      if (hintEl) hintEl.style.display = 'flex';
      seperateLine.style.display = 'none';

      const domainEl = document.getElementById('currentDomain');
      if (domainEl) domainEl.innerText = "Restricted Page";
    }
    // YouTube 页面
    else if (isYouTube) {
      if (hintEl) hintEl.style.display = 'none';

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

  initAllComboboxes();
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
    const webPreview = document.getElementById('webPreviewText');
    const ytPreview = document.getElementById('ytPreviewText');
    if (isWeb) {
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
        borderBottom: 'none',
        borderTop: 'none',
        padding: '4px 0',
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
        webPreview.style.borderLeft = `4px solid ${borderColor}`;
        webPreview.style.padding = '4px 12px';
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
  const DEFAULT_STYLE = {
    color: '#60a5fa',
    fontSize: '16',
    borderType: 'left',
    borderColor: '#38bdf8',
    isBlur: false
  };
  async function initAndLoadStyles() {
    const res = await safeGetStorage(['userStyleConfig']);
    if (!res) return;
    const config = res.userStyleConfig || DEFAULT_STYLE;
    colorInput.value = config.color;
    fontSizeInput.value = config.fontSize;
    borderTypeSelect.value = config.borderType;
    borderColorInput.value = config.borderColor;
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
        if (ytInput) ytInput.value = selectedColor;
      } else {
        colorInput.value = selectedColor;
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
  gearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = advMenu.style.display === 'block';
    advMenu.style.display = isVisible ? 'none' : 'block';
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
  const input = document.getElementById('searchTextInput');
  const resultArea = document.getElementById('searchResultArea');
  const resSource = document.getElementById('resSourceText')?.innerText.trim();
  const resPhonetic = document.getElementById('resPhonetic');
  const resContent = document.getElementById('resContent');
  const notebookBtn = document.getElementById('openNotebookSecondary');
  const resVoiceHeader = document.getElementById('resVoiceHeader');
  const resSaveBtn = document.getElementById('resSaveBtn');
  const resRefreshBtn = document.getElementById('resRefreshBtn');
  input.addEventListener('input', function () {
    this.style.height = 'auto';
    const newHeight = Math.min(this.scrollHeight, 80);
    this.style.height = newHeight + 'px';
    this.style.overflowY = this.scrollHeight > 80 ? 'auto' : 'hidden';
    if (!this.value.trim()) {
      resultArea.style.display = 'none';
      const actionArea = document.getElementById('actionArea');
      if (actionArea) actionArea.style.display = 'none';
      this.style.height = '35px';
    }
  });
  input.onkeydown = function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      triggerSearch(this.value.trim());
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
  async function triggerResRefresh() {
    const queryInput = document.getElementById('searchTextInput');
    const text = queryInput ? queryInput.value.trim() : "";
    if (!text) return;

    if (resRefreshBtn) resRefreshBtn.classList.add('spinning');
    if (resContent) resContent.style.opacity = '0.5';

    try {
      const coreText = text
        .replace(/[\s\n\r\t.,!?;:。，！？、・「」]/g, "")
        .toLowerCase();
      const textFingerprint = typeof hash === 'function' ? hash(coreText) : coreText.substring(0, 50);
      const allCache = await idb.getAll('tr_');
      const keysToRemove = Object.keys(allCache).filter(k => k.includes(textFingerprint));
      if (keysToRemove.length > 0) await Promise.all(keysToRemove.map(k => idb.remove(k)));

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
      }

      let html = '';
      const src = (langA || 'en').toLowerCase();
      const tgt = (langB || 'zh').toLowerCase();
      let cambridgeHref = '';

      if (basic) {
        const hasPhonetic = !!targetPhonetic;
        const phoneticLabel = getPhoneticLabel(ui_lang);

        // 剑桥词典链接逻辑：仅单词模式
        const isWord = !text.trim().includes(' ');
        if (isWord) {
          const encoded = encodeURIComponent(text.trim().toLowerCase());

          let dictPath;
          if (src === 'en') {
            dictPath = FORWARD[tgt] || null;
          } else if (tgt === 'en') {
            dictPath = REVERSE[src] || null;
          } else {
            dictPath = null;
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
              💡 繁體釋義 → Cambridge Dictionary ↗
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
          const hasOrig = origMeanings && origMeanings !== item.meanings.join(', ');

          return `
          <div style="margin-bottom:6px;">
            <div style="display:flex; align-items:baseline; flex-wrap:wrap; gap:4px; line-height:1.4;">
              <span style="color:#94a3b8; font-size:11px; font-weight:bold; margin-right:4px; min-width:32px; flex-shrink:0;">${displayPos}</span>
              <span style="color:#38bdf8; font-size:13px;">${item.meanings.join(', ')}</span>
              ${hasOrig ? `
                <span class="ql-orig-toggle" data-posidx="${posIdx}"
                      style="display:inline-flex;align-items:center;font-size:9px;font-weight:700;
                            color:#38bdf8;opacity:0.5;cursor:pointer;margin-left:4px;
                            border:1px solid #38bdf8;border-radius:3px;padding:1px 4px;
                            vertical-align:middle;user-select:none;flex-shrink:0;
                            transition:opacity 0.2s,background 0.2s;">EN</span>
              ` : ''}
            </div>
            ${hasOrig ? `
              <div class="ql-orig-text" data-posidx="${posIdx}"
                  style="display:none;margin-top:4px;padding:4px 8px;
                          border-left:2px solid #38bdf8;border-radius:2px 4px 4px 2px;
                          font-size:11px;color:#94a3b8;font-style:italic;
                          line-height:1.5;background:rgba(56,189,248,0.05);">
                ${origMeanings}
              </div>
            ` : ''}
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
              <span style="color:#94a3b8; font-size:11px;">原型</span>
              <span style="color:#38bdf8; font-weight:500;">${prototype}</span>
            </span>`;
        }
        wordForms.forEach(wf => {
          formsHtml += `
            <span style="display:inline-flex; align-items:center; gap:4px; background:rgba(255,255,255,0.05); border:0.5px solid rgba(255,255,255,0.15); border-radius:6px; padding:3px 8px; font-size:12px;">
              <span style="color:#94a3b8; font-size:11px;">${wf.name}</span>
              <span style="color:rgba(255,255,255,0.85); font-weight:500;">${wf.value}</span>
            </span>`;
        });
        html += `<div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:6px;">${formsHtml}</div>`;
      }

      // 例句
      if (examples.length > 0) {
        html += `
          <div style="margin-top:12px; border-top:1px dashed rgba(255,255,255,0.1); padding-top:10px; user-select:text !important;">
            <div style="color:#94a3b8; font-size:10px; margin-bottom:5px; text-transform:uppercase;">Examples</div>
            ${examples.map(ex => {
          const src = typeof ex === 'string' ? ex : (ex.en || '');
          const tgt = typeof ex === 'object' ? (ex.cn || '') : '';
          return `
                <div style="margin-bottom:8px;">
                  <div style="color:rgba(255,255,255,0.6); font-size:12px; font-style:italic;">"${src}"</div>
                  ${tgt ? `<div style="color:rgba(255,255,255,0.4); font-size:11px; font-style:italic; margin-top:2px;">${tgt}</div>` : ''}
                </div>`;
        }).join('')}
          </div>`;
      }

      // source 和 Cambridge 
      if (response.source || cambridgeHref) {
        html += `<div id="wiki-source-placeholder" 
            style="margin-top:10px; font-size:11px;
                  display:flex; justify-content:flex-end; align-items:center; gap:4px;
                  color:#64748b;">
        <span>Source:</span>
      </div>`;
      }

      resContent.innerHTML = html || 'No translation found.';

      // 绑定 EN 展开按钮
      resContent.querySelectorAll('.ql-orig-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = btn.getAttribute('data-posidx');
          const origText = resContent.querySelector(`.ql-orig-text[data-posidx="${idx}"]`);
          if (!origText) return;
          const isOpen = btn.getAttribute('data-open') === 'true';
          if (isOpen) {
            btn.setAttribute('data-open', 'false');
            btn.textContent = 'EN';
            btn.style.opacity = '0.5';
            btn.style.background = '';
            origText.style.display = 'none';
          } else {
            btn.setAttribute('data-open', 'true');
            btn.textContent = 'EN ▲';
            btn.style.opacity = '1';
            btn.style.background = 'rgba(56,189,248,0.15)';
            origText.style.display = 'block';
          }
        });
      });

      // 再单独处理 source 链接，用 DOM API 绑定事件
      if (response.source || cambridgeHref) {
        const placeholder = resContent.querySelector('#wiki-source-placeholder');
        if (placeholder) {
          // Google+Dict 链接
          if (response.source) {
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
              placeholder.appendChild(a);
            } else {
              placeholder.appendChild(document.createTextNode(response.source));
            }
          }

          // Cambridge 链接，追加在 Google+Dict 后面
          if (cambridgeHref) {
            const sep = document.createTextNode(' · ');
            placeholder.appendChild(sep);
            const ca = document.createElement('a');
            ca.href = cambridgeHref;
            ca.target = '_blank';
            ca.rel = 'noopener noreferrer';
            ca.textContent = 'Cambridge ↗';
            ca.style.cssText = `
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
      // ── 读取语言对 
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

      // ── 通用语言检测  
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

      // ── 纯汉字日语无法通过字符检测区分（无假名时 detectInputLang 返回 zh）
      // 此时若语言对包含 ja，根据语言对配置做兜底：
      // 若 A=ja 且 inputLang=zh → 实为日语，译成 B
      // 若 B=ja 且 inputLang=zh → 实为日语，译成 A
      // 由于无法确定，保持 fallback 到 B，但更新 currentConfig 中的 targetLanguage
      window.currentTargetL = targetL;

      logger.log(`[Mira-LOG] 翻译请求: text="${text}", inputLang="${inputLang}", langA="${langA}", langB="${langB}", targetL="${targetL}", engine="${engine}"`);
      //  启动超时计时器
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
      // 翻译 
      const response = await getDetailedTranslation(text, forceRefresh, targetL, {
        needPhonetic: true,
        hintInputLang: resolvedLang,
        hintLangA: langA,
        hintLangB: langB,
        fromPopup: true
      });

      clearTimeout(slowTimer);

      //基本释义
      if (response) renderTranslationResult(response, text, ui_lang, langA, langB);

      const detailUpdateListener = (msg) => {
        if (msg.action === 'TRANSLATE_DETAIL_UPDATE' && !msg.result?.isPartial) {
          clearTimeout(slowTimer);
          renderTranslationResult(msg.result, text, ui_lang, langA, langB);
          chrome.runtime.onMessage.removeListener(detailUpdateListener);
        }
      };
      chrome.runtime.onMessage.addListener(detailUpdateListener);
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
          dictData: cachedData.dictData || []
        };
        logger.log("[Popup] 成功从内存 Map 中提取完整词典数据");
      } else {
        const pBasic = document.getElementById('p-basic')?.innerText || "";
        fullTranslation = { basic: pBasic, phonetic: "", dictData: [] };
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

    speakText(text, this, langA);
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

    speakText(text, this, langB);
  };

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
      const globalConfig = storage.globalConfig || { page: true, select: true, yt: true };
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
        const ytRow = ytSwitch.closest('.row');
        // 获取当前实时状态
        const isYTDisabled = ytRow && (ytRow.classList.contains('disabled') || ytRow.style.display === 'none');
        const isYTOn = !!conf.yt;

        // 更新开关 UI,确保按钮状态正确)
        ytSwitch.classList.toggle('on', isYTOn);
        btnYT.style.setProperty('display', isYTOn ? 'flex' : 'none', 'important');

        if (ytHint) {
          // 只有 开启状态 + 非禁用 + YouTube页面 + 非受限页面 才准显示
          const finalShouldShow = isYTOn && !isYTDisabled && isYouTube && !window.isRestricted;

          if (finalShouldShow) {
            showYtHintWithFade(storage.ui_language);
          } else {
            ytHint.classList.remove('show');
            ytHint.style.display = 'none';
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
        const savedUiLang = storage.ui_language || chrome.i18n.getUILanguage().replace('_', '-') || 'en';
        uiLangSelect.value = normalizeLang(savedUiLang);
      }

      const domainLabel = document.getElementById('domainIndicator');
      const inspectBtn = document.getElementById('inspectElement');
      const inspectLabelBtn = document.getElementById('inspectElementLabel');
      if (inspectBtn && inspectLabelBtn) {
        if (currentMode === 'global') {
          inspectBtn.classList.add('hidden-fade');
          inspectLabelBtn.classList.add('hidden-fade');
          if (domainLabel) domainLabel.classList.add('hidden-fade');
        } else {
          inspectBtn.classList.remove('hidden-fade');
          inspectLabelBtn.classList.remove('hidden-fade');
          if (domainLabel) domainLabel.classList.remove('hidden-fade');
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
      if (hintEl) {
        const hasBuiltinRule = (typeof SiteRules !== 'undefined') && SiteRules.hasRule(domain);
        hintEl.style.display = hasBuiltinRule ? 'block' : 'none';
        hintEl.title = t('builtinRuleHint');
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
      const defaultScanRule = (typeof SiteRules !== 'undefined') ? SiteRules.getRule(tabUrl) : { selectors: '', minLen: 5 };
      targetConfig = custom[tabUrl] || defaultScanRule;
    } else {
      const generic = (typeof SiteRules !== 'undefined') ? SiteRules.generic : { selectors: '', minLen: 5 };
      targetConfig = {
        selectors: global.selectors || generic.selectors,
        minLen: global.minLen ?? generic.minLen
      };
    }
    if (selectorInput) {
      selectorInput.value = (targetConfig && targetConfig.selectors)
        ? formatSelectors(targetConfig.selectors)
        : '';
      _originalSelectorValue = normalizeSelectors(selectorInput.value.trim());
    }
    if (minLenInput) minLenInput.value = (targetConfig && targetConfig.minLen) ? targetConfig.minLen : 5;
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
      let gc = data.globalConfig || { page: true, select: true, yt: true };
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
  const minLenInput = document.getElementById('conf-minlen');
  const userScanConfig = currentConfig.scanConfig?.custom?.[domain];
  const defaultScanRule = SiteRules.getRule(domain);
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
  const saveScanConfig = async () => {
    if (_isSaving_Lock) return;
    _isSaving_Lock = true;
    const currentValue = normalizeSelectors(selectorInput.value);
    if (currentValue === _originalSelectorValue) {
      logger.log("[Popup] 内容未改变，跳过保存与重扫");
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
  const statusBadge = document.getElementById('openSettings');
  statusBadge.onclick = async () => {
    await safeCreateTab("engineSettings.html");
    window.close();
  };
  const openNotebook = async () => {
    await safeCreateTab('notebook.html');
    window.close();
  };
  document.getElementById('openNotebook').onclick = openNotebook;
  document.getElementById('openNotebookSecondary').onclick = openNotebook;
  const openSettings = async () => {
    await safeCreateTab('engineSettings.html');
    window.close();
  };
  document.getElementById('openSettings').onclick = openSettings;
  document.getElementById('btnGoEngine').onclick = openSettings;
  initUILanguage();
  refreshUI();

  // 测试当前引擎是否可用
  async function checkEngineStatus() {
    const settingsBtn = document.getElementById('openSettings');
    if (!settingsBtn) return;

    const engine = currentConfig?.activeConfig?.engine || currentConfig?.selectedEngine || _defaultEngine;
    const targetLang = currentConfig?.targetLanguage || 'zh-CN';

    try {
      if (engine === 'google') {
        // Google 直接 ping 接口验证数据结构
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
          const res = await fetch(
            'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh&dt=t&q=hello',
            { signal: controller.signal }
          );
          clearTimeout(timer);
          const data = await res.json();
          const translated = data?.[0]?.[0]?.[0];
          if (!res.ok || !translated || translated === 'hello') {
            showEngineWarning(settingsBtn);
          }
        } catch (e) {
          clearTimeout(timer);
          showEngineWarning(settingsBtn);
        }
        return;
      }

      // 非 Google：复用设置页的测试逻辑
      const isTargetEn = targetLang.toLowerCase().startsWith('en');
      const testText = isTargetEn ? '你好' : 'Good morning';

      const res = await Promise.race([
        safeSendMessage({
          type: 'TRANSLATE',
          text: testText,
          targetLang: targetLang,
        }),
        new Promise(resolve => setTimeout(() => resolve(null), 8000))
      ]);

      if (!res) { showEngineWarning(settingsBtn); return; }
      if (res.error) { showEngineWarning(settingsBtn); return; }

      const data = res.currentTranslationResponse || res.result;
      if (!data) { showEngineWarning(settingsBtn); return; }
      if (data.error) { showEngineWarning(settingsBtn); return; }

      const translatedText = (typeof data === 'string'
        ? data
        : (data.basic || data.translatedText || "")
      ).trim();

      const isNotOriginal = translatedText.toLowerCase() !== testText.toLowerCase();
      const hasContent = translatedText.length > 0 || data.dictData?.length > 0;

      if (!hasContent || !isNotOriginal) {
        showEngineWarning(settingsBtn);
      }

    } catch (e) {
      showEngineWarning(settingsBtn);
    }
  }

  function showEngineWarning(settingsBtn) {
    if (settingsBtn.querySelector('.engine-warning')) return;

    settingsBtn.style.position = 'relative';
    settingsBtn.title = 'Engine may not be working, click to check settings';

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
    warning.textContent = '!';
    settingsBtn.appendChild(warning);
  }

  checkEngineStatus();
});