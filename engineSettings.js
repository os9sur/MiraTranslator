/**
 * Mira Translator
 * Copyright (C) 2026 David Bai 
 * License: AGPL-3.0 (https://github.com/os9sur)
 * Contact: mira.studio@proton.me
 */

window.browser = (function () {
    return window.msBrowser || window.browser || window.chrome;
})();
let userConfig = null;
let currentId = '';
let userConfigs = [];
let uiLanguage = getBrowserLang() || 'en';
document.addEventListener('DOMContentLoaded', async () => {
    const res = await safeGetStorage(['ui_language', 'selectedEngine', 'apiKeys']);
    if (!res) return;
    window.currentConfig = {
        ui_language: res.ui_language || (getBrowserLang() || 'en').replace('_', '-'),//ui_language
        selectedEngine: res.selectedEngine || _defaultEngine,
        apiKeys: res.apiKeys || {}
    };
    initNoticeBar('settings');
    uiLanguage = window.currentConfig?.ui_language || getBrowserLang() || 'en';
    // RTL布局调整

    if (checkRTL(uiLanguage)) {
        const panel = document.querySelector('.cache-status-panel');
        if (panel) panel.style.flexDirection = 'row-reverse';

        const cacheLabel = document.querySelector('.cache-label');
        if (cacheLabel) {
            cacheLabel.style.flexDirection = 'row-reverse';
            cacheLabel.style.marginRight = '0';
            cacheLabel.style.marginLeft = 'auto';
        }
    }
    const titleSuffix = t('engineListTitle', uiLanguage);
    document.title = `Mira - ${titleSuffix}`;

    const TEMPLATES = {
        'google': {
            name: 'Google Translate', isBuiltIn: true, color: '#4285F4', meta: 'G.FREE'
        },
        'bing': {
            name: 'Microsoft Bing', isBuiltIn: true, color: '#008373', meta: 'MS.FREE'
        },
        'deepl': {
            name: 'DeepL API', url: 'https://www.deepl.com/pro-api', color: '#116ab2', meta: 'DEEPL',
            fields: [{ k: 'deeplKey', l: 'DeepL Auth Key', t: 'password', p: '4a2b...:fx' }]
        },
        'baidu': {
            name: 'Baidu Translation', url: 'https://fanyi-api.baidu.com', color: '#2932e1', meta: 'BAIDU',
            fields: [
                { k: 'baiduAppId', l: 'APP ID', t: 'text' },
                { k: 'baiduKey', l: 'Secret Key', t: 'password' }
            ]
        },
        'openai': {
            name: 'OpenAI (ChatGPT)', url: 'https://platform.openai.com/api-keys', color: '#10a37f', meta: 'GPT.5.2',
            default_url: 'https://api.openai.com/v1',
            fields: [
                { k: 'oaKey', l: 'API Key', t: 'password', p: 'sk-...' },
                { k: 'oaModel', l: 'Model Name', t: 'text', d: 'gpt-4o-mini', placeholderOnly: true },
                { k: 'oaApiHost', l: 'Proxy Address', t: 'text', d: 'https://api.openai.com/v1' }
            ]
        },
        'claude': {
            name: 'Anthropic (Claude)', url: 'https://console.anthropic.com/settings/keys', color: '#d97752', meta: 'CL.35',
            fields: [
                { k: 'claudeKey', l: 'API Key', t: 'password', p: 'sk-ant-api03-...' },
                { k: 'claudeModel', l: 'Model Name', t: 'text', d: 'claude-3-5-sonnet-latest', placeholderOnly: true },
                { k: 'claudeApiHost', l: 'Proxy Address', t: 'text', d: 'https://api.anthropic.com/v1' }
            ]
        },
        'gemini': {
            name: 'Google (Gemini)', url: 'https://aistudio.google.com/app/apikey', color: '#fbbf24', meta: 'G.PRO',
            default_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
            fields: [
                { k: 'geminiKey', l: 'API Key', t: 'password', p: 'AIza...' },
                { k: 'geminiHost', l: 'Base URL', t: 'text', d: 'https://generativelanguage.googleapis.com/v1beta/openai' },
                { k: 'geminiModel', l: 'Model Name', t: 'text', d: 'gemini-2.5-flash', placeholderOnly: true }
            ]
        },
        'deepseek': {
            name: 'DeepSeek', url: 'https://platform.deepseek.com/api_keys', default_url: 'https://api.deepseek.com', color: '#3b82f6', meta: 'DS.R1',
            fields: [
                { k: 'dsKey', l: 'API Key', t: 'password', p: 'sk-...' },
                { k: 'dsHost', l: 'Base URL', t: 'text', d: 'https://api.deepseek.com' },
                { k: 'dsModel', l: 'Model Name', t: 'text', d: 'deepseek-chat', placeholderOnly: true }
            ]
        },
        'grok': {
            name: 'xAI (Grok)', url: 'https://x.ai/api', color: '#ffffff', meta: 'GROK',
            fields: [
                { k: 'grokKey', l: 'API Key', t: 'password', p: 'xai-...' },
                { k: 'grokHost', l: 'Base URL', t: 'text', d: 'https://api.x.ai/v1' },
                { k: 'grokModel', l: 'Model Name', t: 'text', d: 'grok-beta', placeholderOnly: true }
            ]
        },
        'google_v3': {
            name: 'Google Cloud (v3)', url: 'https://cloud.google.com/translate', color: '#4285F4', meta: 'G.V3',
            fields: [{ k: 'googleKey', l: 'Google API Key', t: 'password' }]
        },
        'microsoft': {
            name: 'Microsoft Azure', url: 'https://portal.azure.com', color: '#0078d4', meta: 'AZURE',
            fields: [
                { k: 'msKey', l: 'Secret Key', t: 'password' },
                { k: 'msRegion', l: 'Region', t: 'text', p: 'eastasia' }
            ]
        },
        'tencent': {
            name: 'Tencent Cloud', url: 'https://console.cloud.tencent.com/cam/capi', color: '#00a4ff', meta: 'TENCENT',
            fields: [
                { k: 'tenId', l: 'Secret ID', t: 'text' },
                { k: 'tenKey', l: 'Secret Key', t: 'password' }
            ]
        },
        'groq': {
            name: 'Groq', url: 'https://console.groq.com/keys', color: '#f55036', meta: 'ULTRA.FAST',
            fields: [
                { k: 'groqKey', l: 'API Key', t: 'password' },
                { k: 'groqHost', l: 'Base URL', t: 'text', d: 'https://api.groq.com/openai/v1' },
                { k: 'groqModel', l: 'Model Name', t: 'text', d: 'openai/gpt-oss-120b', placeholderOnly: true }
            ]
        },
        'siliconflow': {
            name: 'SiliconFlow', url: 'https://cloud.siliconflow.cn/account/ak', color: '#6366f1', meta: 'SF.AGGR',
            fields: [
                { k: 'siliconflowKey', l: 'API Key', t: 'password' },
                { k: 'siliconflowHost', l: 'Base URL', t: 'text', d: 'https://api.siliconflow.cn/v1' },
                { k: 'siliconflowModel', l: 'Model Name', t: 'text', d: 'deepseek-ai/DeepSeek-V3' }
            ]
        },
        'custom_ai': {
            name: 'Custom API', url: '#', default_url: 'https://api.openai.com/v1', color: '#a855f7', meta: 'ANY.API',
            tip: t('customApiTip', uiLanguage),
            fields: [
                { k: 'customKey', l: 'API Key', t: 'password' },
                { k: 'customHost', l: 'Base URL', t: 'text', d: 'https://api.your-provider.com/v1' },
                {
                    k: 'customModel', l: 'Model Name', t: 'text', d: 'gpt-4o-mini', placeholderOnly: true
                }
            ]
        }
    };
    const ENGINE_GROUPS = [
        {
            label: "Custom",
            engines: ['custom_ai']
        },
        {
            label: "AI Models (LLM)",
            engines: ['groq', 'gemini', 'claude', 'deepseek', 'openai', 'siliconflow', 'grok']
        },
        {
            label: "Cloud Translation API",
            engines: ['deepl', 'baidu', 'google', 'bing', 'google_v3', 'microsoft', 'volc', 'tencent']
        }
    ];

    async function init() {
        const data = await safeGetStorage(['userConfigs', 'lastActiveId', 'selectedEngine', 'apiKeys']);
        if (!data) return;
        let storedConfigs = data.userConfigs || [];
        const oldApiKeys = data.apiKeys || {};
        const builtInEngines = [
            { id: 'google_builtin', engine: 'google', alias: `Google (${window.t("builtin", uiLanguage)})` },
            { id: 'bing_builtin', engine: 'bing', alias: `Bing (${window.t("builtin", uiLanguage)})` }
        ];
        const customConfigs = storedConfigs.filter(c =>
            c.id !== 'google_builtin' &&
            c.id !== 'bing_builtin'
        );
        if (customConfigs.length === 0 && Object.keys(oldApiKeys).length > 0) {
            for (const engineKey of Object.keys(TEMPLATES)) {
                const tpl = TEMPLATES[engineKey];
                if (tpl.isBuiltIn) continue;
                const hasKey = tpl.fields?.some(f => oldApiKeys[f.k]);
                if (hasKey) {
                    const newId = `inst_migration_${engineKey}`;
                    if (!customConfigs.find(cc => cc.id === newId)) {
                        customConfigs.push({
                            id: newId,
                            engine: engineKey,
                            alias: `${tpl.name} (Migrated)`
                        });
                        const instanceSpecificData = {};
                        tpl.fields.forEach(f => {
                            if (oldApiKeys[f.k]) instanceSpecificData[f.k] = oldApiKeys[f.k];
                        });
                        await safeSetStorage({ [`data_${newId}`]: instanceSpecificData });
                    }
                }
            }
        }
        userConfigs = [...builtInEngines, ...customConfigs];
        if (JSON.stringify(data.userConfigs) !== JSON.stringify(userConfigs)) {
            await safeSetStorage({ userConfigs });
        }
        renderSidebar();
        let startId = data.lastActiveId && userConfigs.find(c => c.id === data.lastActiveId)
            ? data.lastActiveId : null;
        if (!startId && data.selectedEngine) {
            const match = userConfigs.find(c => c.engine === data.selectedEngine);
            if (match) startId = match.id;
        }

        if (!startId) {
            const defaultMatch = userConfigs.find(c => c.engine === _defaultEngine);
            startId = defaultMatch ? defaultMatch.id : userConfigs[0].id;
        }
        await switchInstance(startId);
        bindEvents();
    }
    async function renderSidebar() {
        const list = document.getElementById('engine-sidebar-list');
        const data = await safeGetStorage(['lastActiveId', 'activeConfig']);
        if (!data) return;
        const defaultId = userConfigs.find(c => c.engine === _defaultEngine)?.id ?? userConfigs[0].id;
        const lastActiveId = data?.lastActiveId ?? defaultId; // 侧边栏当前编辑的
        const runningId = data?.activeConfig?.id ?? defaultId;


        const activeConfig = userConfigs.find(c => c.id === runningId);
        const statusValueEl = document.getElementById('active-engine-name');
        if (statusValueEl) {
            statusValueEl.innerText = activeConfig ? activeConfig.alias : t('notEnabled', uiLanguage);
        }
        list.innerHTML = userConfigs.map(c => {
            const isEditing = c.id === lastActiveId;
            const isRunning = c.id === runningId;
            const tpl = TEMPLATES[c.engine] || {};
            const proTag = tpl.isPro ? `<span style="background:#7c3aed;color:#fff;font-size:10px;padding:1px 6px;border-radius:10px;margin-left:4px;">Pro</span>` : '';

            return `
    <div dir="auto" class="engine-item ${isEditing ? 'active' : ''}" data-id="${c.id}">
        <div class="engine-info">
            ${isRunning ? `<span class="status-dot checking" data-id="${c.id}"></span>` : ''}
            <span class="engine-name">${c.alias}</span>${proTag}
        </div>
        ${(c.id !== 'google_builtin' && c.id !== 'bing_builtin') ?
                    `<span class="del-icon" data-id="${c.id}">×</span>` : ''}
    </div>`;
        }).join('');
        list.querySelectorAll('.engine-item').forEach(el => {
            el.onclick = (e) => {
                if (e.target.classList.contains('del-icon')) {
                    e.stopPropagation();
                    deleteItem(el.dataset.id, e);
                } else {
                    switchInstance(el.dataset.id);
                }
            };
        });
        checkCurrentEngineStatus(runningId, userConfigs);
    }
    async function checkCurrentEngineStatus(runningId, userConfigs) {
        const dot = document.querySelector(`.status-dot[data-id="${runningId}"]`);
        if (!dot) return;

        const config = userConfigs.find(c => c.id === runningId);
        if (!config) return;

        const storage = await safeGetStorage(['ui_language']).catch(() => ({}));
        const targetLang = storage?.ui_language || 'en';
        const isTargetEn = targetLang.toLowerCase().startsWith('en');
        const testText = isTargetEn ? '早上好' : 'Good morning';

        // google / bing / 其他AI引擎：做翻译测试
        try {
            let failed = false;

            const instanceData = ['google', 'bing'].includes(config.engine)
                ? {}
                : (await safeGetStorage(`data_${runningId}`))?.[`data_${runningId}`] || {};

            const res = await Promise.race([
                safeSendMessage({
                    type: 'TRANSLATE',
                    text: testText,
                    targetLang,
                    isTest: true,
                    engine: config.engine,
                    tempKeys: instanceData
                }),
                new Promise(resolve => setTimeout(() => resolve(null), 8000))
            ]);

            if (!res || res.error) {
                failed = true;
            } else {
                const data = res.currentTranslationResponse;
                if (!data || data.error) {
                    failed = true;
                } else {
                    const translatedText = (typeof data === 'string'
                        ? data
                        : (data.translatedText || data.basic || '')
                    ).trim();
                    const isNotOriginal = translatedText.toLowerCase() !== testText.toLowerCase();
                    const hasContent = translatedText.length > 0 || data.dictData?.length > 0;
                    if (!hasContent || !isNotOriginal) failed = true;
                }
            }

            dot.classList.remove('checking');
            dot.classList.add(failed ? 'error' : 'success');
            dot.title = failed ? 'Engine not working' : 'Engine working';

        } catch (e) {
            dot.classList.remove('checking');
            dot.classList.add('error');
            dot.title = 'Engine check failed';
        }
    }
    function getFriendlyEngineError(engine, errorMsg) {
        if (!errorMsg) return '';

        if (errorMsg.includes('Google Blocked') || errorMsg.includes('Invalid Bing Response')) {
            return getSafeMessage('ERROR_NETWORK', 'API Blocked: Current IP triggered security risk or rate limit (common with public VPNs). Please try switching VPN nodes or translation services.');
        }
        if (errorMsg.includes('429')) {
            return getSafeMessage('ERROR_429', 'API Error: Rate limited or quota exceeded.');
        }
        if (errorMsg.includes('abort') || errorMsg.toLowerCase().includes('timeout')) {
            return getSafeMessage('ERROR_TIMEOUT', 'Request timeout: Check network or proxy.');
        }

        // 其他错误直接显示原始 message
        return errorMsg;
    }


    let switchVersion = 0;
    const TEST_BTN_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="rgb(0 255 73)" style="margin-right:6px;flex-shrink:0;"><path d="M13 2 3 14h7l-1 8 10-12h-7z"/></svg>';
    async function switchInstance(id) {
        await safeSetStorage({ lastActiveId: id });
        const myVersion = ++switchVersion;
        const uiLanguage = window.currentConfig?.ui_language || getBrowserLang() || 'en';
        currentId = id;
        const config = userConfigs.find(c => c.id === id) || userConfigs[0];
        const container = document.getElementById('dynamic-form-container');
        const actions = document.getElementById('global-actions');
        container.innerHTML = '';
        actions.classList.add('hidden');
        await renderSidebar();
        const res = await safeGetStorage(`data_${id}`);
        if (!res) return;
        if (myVersion !== switchVersion) return;
        const saved = res[`data_${id}`] || {};
        let activeEngine = config.engine;
        if (saved.geminiKey && activeEngine === 'google') {
            activeEngine = 'gemini';
        }
        const tpl = TEMPLATES[activeEngine] || TEMPLATES[_defaultEngine];
        const displayAlias = config.alias || tpl.name || activeEngine;
        const tipsDesc = document.getElementById('tips');
        const testBtn = document.getElementById('testApiConfig');
        const saveBtn = document.getElementById('saveApiConfig');
        const enableBtn = document.getElementById('enableCurrentEngine');
        if (tipsDesc) { tipsDesc.innerText = ""; tipsDesc.style.color = ""; }
        if (testBtn) {
            testBtn.innerHTML = `${TEST_BTN_ICON}${t('testConnection', uiLanguage)}`;
            testBtn.style.borderColor = "";
            testBtn.disabled = false;
        }
        if (saveBtn) {
            saveBtn.innerHTML = `${t('save', uiLanguage)}`;
            saveBtn.style.backgroundColor = "";
            saveBtn.disabled = false;
            saveBtn.style.display = '';
        }
        if (enableBtn) {
            enableBtn.innerText = t('enableEngineNow', uiLanguage);
            enableBtn.style.removeProperty('background-color');
            enableBtn.disabled = false;
        }

        // ----  isBuiltIn 逻辑（google / bing）----
        if (tpl.isBuiltIn) {
            actions.classList.remove('hidden');
            if (saveBtn) saveBtn.style.display = 'none';

            const githubLink = '<a href="https://github.com/os9sur/MiraTranslator" target="_blank" class="github-link">GitHub ↗</a>';

            // 渲染时识别 ---
            const noticeLines = t('builtInNoticeBody', uiLanguage, githubLink)
                .split('\n')
                .map(line => line.trim())
                .filter(line => line)
                .filter(line => {
                    if (!enable_pro_features && line.includes('🪄')) return false;
                    return true;
                })
                .map(line => {
                    if (line === '---') {
                        return `<div class="notice-divider"></div>`;
                    }

                    const isRTL = checkRTL(uiLanguage);

                    const emojiMatch = line.match(/^\p{Extended_Pictographic}\uFE0F?/u);
                    const emoji = emojiMatch ? emojiMatch[0] : '';
                    const textWithoutEmoji = line.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '');
                    const finalizedText = textWithoutEmoji.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #f0f6fc; font-weight: 600;">$1</strong>');

                    // 只针对 ⬆ 单独放大变色,其它 emoji 用默认样式
                    const isUpArrow = emoji === '⬆️' || emoji === '⬆';
                    const emojiStyle = isUpArrow
                        ? 'margin-right:6px;color:#bdbdbd;font-size:larger;'
                        : 'margin-right:6px;';

                    return `
        <p dir="${isRTL ? 'rtl' : 'ltr'}" 
            style="color:#b0bac6; font-size:14px; line-height:1.8; margin:0 0 10px 0;
            ${isRTL ? 'text-align:right;' : ''}">
            ${emoji ? `<span style="${emojiStyle}">${emoji}</span>` : ''}${finalizedText}
        </p>`;
                }).join('');
            const builtInTemplate = `
                <div class="main-header">
                <h2 dir="auto" style="margin:0">${displayAlias}</h2>
            </div>
            <div class="form-container">
                <div class="built-in-notice" dir="auto" style="border:1px dashed #30363d;padding:20px;border-radius:8px;margin-top:10px;">
                    
                    <div style="max-height: 460px;cursor: default; overflow-y: auto; padding-right: 5px;">
                        ${noticeLines}
                    </div>
                    
                </div>
            </div>`;
            container.innerHTML = builtInTemplate;
            return;
        }
        actions.classList.remove('hidden');
        const getRow = (field) => {
            const { k, l, t: inputType, p, d, placeholderOnly, hint } = field;
            let val = saved[k] ?? (k === 'alias' ? (config.alias || '') : (placeholderOnly ? '' : (d || '')));
            const isKeyField = k.toLowerCase().includes('key');
            const showGetKey = (isKeyField && tpl.url && tpl.url !== '#');
            const isPasswordField = inputType === 'password';
            let inputHtml = '';
            const placeholder = (k === 'alias') ? displayAlias : (p || '');
            if (isPasswordField) {
                inputHtml = `
        <div class="api-input-wrapper">
            <input type="password" data-key="${k}" class="api-input-field" placeholder="${placeholder}" value="${val}" spellcheck="false">
            <button type="button" class="toggle-visibility-btn" tabindex="-1" title="${t('common.toggleVisibility', uiLanguage)}">
                <svg class="icon-eye" viewBox="0 0 28 20" width="18" height="16" fill="none" stroke="rgb(0 255 73)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
                <path d="M1.5 10s4.5-7 12.5-7 12.5 7 12.5 7-4.5 7-12.5 7S1.5 10 1.5 10z"></path>
                <ellipse cx="14" cy="7.2" rx="5.2" ry="5.5" fill="rgb(0 255 73)" stroke="none"></ellipse>
            </svg>
               <svg class="icon-eye-off" viewBox="0 0 28 20" width="18" height="16" fill="none" stroke="rgb(0 255 73)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
                <path d="M1.5 10s4.5-7 12.5-7 12.5 7 12.5 7-4.5 7-12.5 7S1.5 10 1.5 10z"></path>
                <ellipse cx="14" cy="7.2" rx="5.2" ry="5.5" fill="rgb(0 255 73)" stroke="none"></ellipse>
                <line x1="2" y1="2" x2="26" y2="18" stroke-width="3"></line>
            </svg>
            </button>
        </div>`;
            } else {
                inputHtml = `<input type="${inputType || 'text'}" data-key="${k}" class="api-input-field" placeholder="${placeholder}" value="${val}" spellcheck="false">`;
            }
            return `
        <div class="form-group">
            <div class="field-header" style="display:flex; justify-content: flex-start; align-items:center; margin-bottom:8px; margin-top:17px; gap:12px;">
                <label style="margin:0">${l.toUpperCase()}</label>
                ${showGetKey ? `<a href="${tpl.url}" target="_blank" class="get-key-link">${t('getApiKey', uiLanguage)}</a>` : ''}
            </div>
            ${inputHtml}
            ${placeholderOnly && (hint || d) ? `<div class="field-hint" style="font-size:11px;color:#6e7681;margin-top:6px;padding-left:20px;line-height:1.5;">${hint || `${uiLanguage.startsWith('zh') ? '例如: ' : 'e.g. '}${d}`}</div>` : ''}
        </div>`;
        };
        let html = `
                <div class="main-header">
                    <h2 dir="auto" style="margin:0">${t('engineConfig', uiLanguage)}: ${displayAlias}</h2>
                </div>
                <div class="form-container">
                    ${tpl.tip ? `<p class="tip-yellow" dir="auto" style="color:#fbbf24; font-size:11px; margin-bottom:15px; opacity:0.9;-webkit-user-select:text !important; user-select:text !important; cursor:text !important;">${tpl.tip}</p>` : ''}
                    ${getRow({ k: 'alias', l: t('configAlias', uiLanguage) })} 
                    ${(tpl.fields || []).map(f => getRow(f)).join('')}
                </div>`;
        container.innerHTML = html;
        await renderAIPromptSection();
    }
    function bindEvents() {

        const modal = document.getElementById('engine-modal');
        const hexToRgb = (hex) => {
            hex = hex.replace('#', '');
            if (hex.length === 3) hex = hex.split('').map(s => s + s).join('');
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            return `${r}, ${g}, ${b}`;
        };
        document.getElementById('add-new-config').onclick = () => {
            const grid = document.getElementById('template-grid');
            const modal = document.getElementById('engine-modal');
            let html = '';
            ENGINE_GROUPS.forEach(group => {
                html += `<div class="group-label">${group.label}</div>`;
                group.engines.forEach(key => {
                    if (['google', 'bing'].includes(key)) return;
                    const tpl = TEMPLATES[key];
                    if (tpl) {
                        const color = tpl.color || '#38bdf8';
                        const rgb = hexToRgb(color);
                        const meta = tpl.meta || key.toUpperCase().substring(0, 6);
                        //const desc = tpl.url === '#' ? t('customAiInterface', uiLanguage) : t('accessService', uiLanguage).replace('{0}', tpl.name);
                        const desc = tpl.url === '#' ? t('customAiInterface', uiLanguage) : '';
                        html += `
                    <div class="tpl-card" 
                         data-type="${key}" 
                         
                         style="--accent-color: ${color}; --accent-rgb: ${rgb};">
                        <span class="name">${tpl.name}</span>
                        <span class="desc">${desc}</span>
                    </div>`;
                    }
                });
            });
            grid.innerHTML = html;
            modal.classList.remove('hidden');
        };

        document.getElementById('dynamic-form-container').addEventListener('click', (e) => {
            const btn = e.target.closest('.toggle-visibility-btn');
            if (!btn) return;

            const input = btn.closest('.api-input-wrapper').querySelector('.api-input-field');
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';

            btn.querySelector('.icon-eye').style.display = isPassword ? 'none' : 'block';
            btn.querySelector('.icon-eye-off').style.display = isPassword ? 'block' : 'none';
        });
        document.getElementById('template-grid').onclick = async (e) => {
            const card = e.target.closest('.tpl-card');
            if (!card) return;
            const engineKey = card.dataset.type;
            const template = TEMPLATES[engineKey];
            const newId = `inst_${Date.now()}`;
            userConfigs.push({
                id: newId,
                engine: engineKey,
                alias: `${t('newBadge', uiLanguage)} ${template.name}`
            });

            await safeSetStorage({ userConfigs });
            modal.classList.add('hidden');
            if (typeof renderSidebar === 'function') renderSidebar();
            switchInstance(newId);
            logger.log(`成功添加引擎: ${template.name}`);
        };
        const closeBtn = document.getElementById('close-modal') || document.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => modal.classList.add('hidden');
        }
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });
    }
    async function deleteItem(id, event) {
        const icon = event.target;
        if (!icon || !icon.classList.contains('del-icon')) return;
        event.stopPropagation();
        if (!icon.classList.contains('confirming')) {
            const originalHtml = icon.innerHTML;
            icon.classList.add('confirming');
            icon.innerHTML = "确认删除?";
            const timer = setTimeout(() => {
                if (icon) {
                    icon.classList.remove('confirming');
                    icon.innerHTML = originalHtml;
                    icon.removeAttribute('data-has-timer');
                }
            }, 3000);
            icon.setAttribute('data-has-timer', timer);
            return;
        }
        const timerId = icon.getAttribute('data-has-timer');
        if (timerId) clearTimeout(parseInt(timerId));
        const item = icon.closest('.engine-item');
        if (item) {
            item.style.pointerEvents = "none";
            item.style.transition = "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)";
            item.style.opacity = "0";
            item.style.transform = "translateX(-20px)";
            item.style.height = "0";
            item.style.margin = "0";
            item.style.padding = "0";
        }
        setTimeout(async () => {
            userConfigs = userConfigs.filter(c => String(c.id) !== String(id));
            await safeSetStorage({ userConfigs });
            await safeRemoveStorage(`data_${id}`);
            if (currentId === id) {
                currentId = userConfigs.length > 0 ? userConfigs[0].id : '';
            }
            showToast("引擎已移除", "info");
            if (typeof init === 'function') {
                init();
            } else if (typeof renderSidebar === 'function') {
                renderSidebar();
            }
        }, 400);
    }
    init();

    // ── 连接测试核心逻辑，供"测试连接"按钮和"启用当前引擎"按钮共用 ──
    // 只负责跑测试 + 把结果画到 btn/tipsDesc 上，返回 boolean；不做延时重置、不碰 lastActiveId
    async function runEngineTest(btn, tipsDesc) {
        const i18n = {
            success: t('success', uiLanguage),
            failed: t('failed', uiLanguage),
            error_no_response: t('error_no_response', uiLanguage),
            error_timeout: t('error_timeout', uiLanguage),
            error_same_as_original: t('error_same_as_original', uiLanguage),
            error_generic: t('error_generic', uiLanguage),
        };
        if (tipsDesc) {
            tipsDesc.style.color = "";
            tipsDesc.innerText = "";
        }

        const userConfig = userConfigs.find(c => c.id === currentId);
        if (!userConfig) return false;

        let testResult = false;
        try {
            // 其他引擎的处理逻辑
            const storage = await safeGetStorage(['ui_language']).catch(() => ({}));
            const testTargetLang = storage?.ui_language || window.currentConfig?.ui_language || getBrowserLang() || 'en';
            const tempKeys = {};
            document.querySelectorAll('.api-input-field').forEach(input => {
                const key = input.getAttribute('data-key');
                if (key) tempKeys[key] = input.value.trim();
            });

            const isTargetEn = testTargetLang.toLowerCase().startsWith('en');
            const testText = isTargetEn ? '早上好' : 'Good morning';
            logger.log("Testing info: ", "text:", testText, "targetLang: ", testTargetLang, "engine", userConfig.engine);

            const res = await safeSendMessage({
                type: 'TRANSLATE',
                text: testText,
                targetLang: testTargetLang,
                isTest: true,
                engine: userConfig.engine,
                tempKeys
            });
            if (!res) throw new Error(i18n.error_no_response || 'No response from background');
            if (res.error) throw new Error(res.error);
            const data = res.currentTranslationResponse;
            if (!data) throw new Error('Invalid response structure');
            if (data.error) throw new Error(data.error);
            const translatedText = (typeof data === 'string' ? data : (data.translatedText || data.basic)) || "";
            const isNotOriginal = translatedText.trim().toLowerCase() !== testText.toLowerCase();
            const hasValidStructure = translatedText.length > 0 || (data.dictData?.length > 0);
            if (hasValidStructure && isNotOriginal) {
                if (btn) {
                    btn.innerHTML = `<span style="color: rgb(0 255 73); font-size: 20px; margin-right: 8px;">✓</span><span> ${i18n.success}</span>`;
                    btn.style.setProperty('border-color', '#10a37f', 'important');
                }
                testResult = true;
            } else {
                throw new Error(translatedText.length === 0 ? "Empty Content" : "Same as Original");
            }
        }
        catch (e) {
            logger.error("[Test] Failed:", e);
            if (btn) {
                btn.innerHTML = `<span>❌ ${i18n.failed}</span>`;
                btn.style.setProperty('border-color', '#f87171', 'important');
                btn.style.userSelect = 'text';
            }
            testResult = false;

            if (tipsDesc) {
                tipsDesc.style.color = "#f87171";
                tipsDesc.style.userSelect = 'text';
                tipsDesc.style.cursor = 'text';

                const errorText = e.message || String(e);
                const match = errorText.match(/400|401|402|403|404|429|500|502|503|504|505/);
                let displayMessage = "";

                if (match) {
                    let errorCode = match[0];
                    if (errorCode === "400" && errorText.toLowerCase().includes("balance")) errorCode = "402";

                    // 第一步：尝试获取友好消息
                    const friendlyMsg = getSafeMessage(`ERROR_${errorCode}`);

                    if (friendlyMsg) {
                        // ✅ 有翻译：显示友好消息
                        displayMessage = `${friendlyMsg} (Code: ${errorCode})`;
                    } else {
                        // ❌ 没有翻译：尝试提取 API 的详细错误信息
                        const jsonMatch = errorText.match(/\{.*\}/);
                        if (jsonMatch) {
                            try {
                                const errorObj = JSON.parse(jsonMatch[0]);
                                const apiMessage = errorObj.error?.message || errorObj.message;
                                if (apiMessage) {
                                    // ✅ 显示 API 返回的详细错误
                                    displayMessage = `HTTP ${errorCode}: ${apiMessage}`;
                                } else {
                                    displayMessage = `HTTP Error ${errorCode}`;
                                }
                            } catch {
                                displayMessage = `HTTP Error ${errorCode}`;
                            }
                        } else {
                            displayMessage = `HTTP Error ${errorCode}`;
                        }
                    }
                } else if (errorText.toLowerCase().includes("timeout")) {
                    const hostKey = HOST_KEY_MAP[userConfig.engine] || 'baseUrl';
                    const baseUrl = document.querySelector(`[data-key="${hostKey}"]`)?.value || '';
                    const isLocalModel = isLocalModelHost(baseUrl);
                    displayMessage = isLocalModel
                        ? t('timeoutLocalModel')
                        : (i18n.error_timeout || "Timeout ⌛");
                } else if (errorText === "Same as Original") {
                    displayMessage = i18n.error_same_as_original || "API returned original text";
                } else {
                    displayMessage = (errorText.length > 2 && errorText.length < 80) ? errorText : (i18n.error_generic || "Config Error");
                }

                tipsDesc.innerText = displayMessage;
            }
        }
        return testResult;
    }

    // ── 收集表单数据并落盘，供"保存"按钮和"启用当前引擎"共用 ──
    // 返回 { finalEngine, data }；找不到当前配置实例时返回 null
    async function persistCurrentConfig() {
        const config = userConfigs.find(c => c.id === currentId);
        if (!config) {
            logger.error("[Mira] 找不到当前配置实例");
            return null;
        }

        const inputs = document.querySelectorAll('#dynamic-form-container input');
        const data = {};
        inputs.forEach(i => {
            const key = i.dataset.key;
            if (key) data[key] = i.value.trim();
        });

        const idx = userConfigs.findIndex(c => c.id === currentId);
        let finalEngine = config.engine;
        if (idx > -1) {
            const detectedEngine = Object.keys(TEMPLATES).find(key => {
                const tpl = TEMPLATES[key];
                return tpl.fields?.length > 0 && data[tpl.fields[0].k] !== undefined;
            });
            if (detectedEngine && userConfigs[idx].engine === 'google') {
                userConfigs[idx].engine = detectedEngine;
            }
            finalEngine = userConfigs[idx].engine;
            const engineTemplate = TEMPLATES[finalEngine] || {};
            if (!engineTemplate.isBuiltIn) {
                userConfigs[idx].alias = data.alias || engineTemplate.name || finalEngine;
            }
        }

        const webTA = document.getElementById('ai-prompt-web');
        const subTA = document.getElementById('ai-prompt-subtitle');
        const storagePayload = {
            [`data_${currentId}`]: data,
            userConfigs: userConfigs,
            lastActiveId: currentId
        };
        if (webTA || subTA) {
            storagePayload[AI_PROMPT_KEY] = {
                web: (webTA?.value || '').trim(),
                subtitle: (subTA?.value || '').trim()
            };
        }

        await safeSetStorage(storagePayload);
        logger.log("配置已保存: ", uiLanguage);

        return { finalEngine, data };
    }

    document.getElementById('testApiConfig').onclick = async () => {
        const btn = document.getElementById('testApiConfig');
        const tipsDesc = document.getElementById('tips');
        if (!btn) return;
        btn.disabled = true;
        const originalHTML = `${TEST_BTN_ICON}${t('testConnection', uiLanguage)}`;
        btn.innerHTML = `<span>⏳ ${t('testing', uiLanguage)}</span>`;

        const testResult = await runEngineTest(btn, tipsDesc);

        setTimeout(() => {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHTML;
                btn.style.removeProperty('border-color');
            }
            // 测试完成后更新sidebar状态点和当前引擎激活状态
            if (testResult) {
                // 测试成功 - 激活这个引擎为当前使用的引擎
                safeSetStorage({ lastActiveId: currentId }).then(() => {
                    if (typeof renderSidebar === 'function') {
                        renderSidebar();
                    }
                });
            } else if (typeof renderSidebar === 'function') {
                // 测试失败或其他情况 - 只更新状态点
                renderSidebar();
            }
        }, 3000);
    };

    // ── 启用当前引擎：必须测试通过才真正切换线上使用的引擎 ──
    document.getElementById('enableCurrentEngine').onclick = async () => {
        const enableBtn = document.getElementById('enableCurrentEngine');
        const testBtn = document.getElementById('testApiConfig');
        const tipsDesc = document.getElementById('tips');
        if (!enableBtn) return;

        enableBtn.disabled = true;
        if (testBtn) testBtn.disabled = true;
        const originalText = t('enableEngineNow', uiLanguage);
        enableBtn.innerText = `⏳ ${t('testing', uiLanguage)}`;

        const saved = await persistCurrentConfig();
        if (!saved) {
            enableBtn.disabled = false;
            if (testBtn) testBtn.disabled = false;
            enableBtn.innerText = originalText;
            return;
        }

        const testResult = await runEngineTest(testBtn, tipsDesc);

        if (testResult) {
            if (typeof syncGlobalConfig === 'function') {
                await syncGlobalConfig(currentId, saved.finalEngine, saved.data);
            }
            await safeSetStorage({ lastActiveId: currentId });
            enableBtn.innerText = t('enabled', uiLanguage);
            enableBtn.style.setProperty('background-color', '#22c55e', 'important');
            if (typeof renderSidebar === 'function') renderSidebar();
        } else {
            enableBtn.innerText = t('failed', uiLanguage);
            enableBtn.style.setProperty('background-color', '#ef4444', 'important');
        }

        setTimeout(() => {
            if (testBtn) {
                testBtn.disabled = false;
                testBtn.innerHTML = `${TEST_BTN_ICON}${t('testConnection', uiLanguage)}`;
                testBtn.style.removeProperty('border-color');
            }
            enableBtn.disabled = false;
            enableBtn.innerText = originalText;
            enableBtn.style.removeProperty('background-color');
        }, 1500);
    };

    document.getElementById('saveApiConfig').onclick = async () => {
        const saveBtn = document.getElementById('saveApiConfig');
        if (!saveBtn) return;

        saveBtn.disabled = true;
        const originalText = saveBtn.innerText;
        const originalBg = saveBtn.style.backgroundColor;
        try {
            const result = await persistCurrentConfig();
            if (!result) {
                saveBtn.disabled = false;
                return;
            }

            //  保存只做持久化，不再自动切换线上生效引擎、也不再自动触发测试连接。
            // 想切换到这个引擎，用户需要单独点"启用当前引擎"（会先保存、再测试，通过才生效）。 
            if (typeof renderSidebar === 'function') renderSidebar();
            // 显示保存成功提示（固定时间）
            saveBtn.innerText = `${t('save', uiLanguage)}${t('success', uiLanguage)}`;
            saveBtn.style.setProperty('background-color', '#22c55e', 'important');
            // 恢复按钮状态
            setTimeout(() => {
                if (saveBtn) {
                    saveBtn.innerText = originalText;
                    saveBtn.style.removeProperty('background-color');
                    saveBtn.style.backgroundColor = originalBg;
                    saveBtn.disabled = false;
                }
            }, 1500);
        } catch (error) {
            logger.error("[Mira] 保存配置失败:", error);
            saveBtn.innerText = `${t('save', uiLanguage)} ${t('failed', uiLanguage)}`;
            saveBtn.style.setProperty('background-color', '#ef4444', 'important');
            setTimeout(() => {
                if (saveBtn) {
                    saveBtn.innerText = originalText;
                    saveBtn.style.removeProperty('background-color');
                    saveBtn.style.backgroundColor = originalBg;
                    saveBtn.disabled = false;
                }
            }, 1500);
        }
    };
    async function syncGlobalConfig(instanceId, engineType, instanceData) {
        const activeConfig = {
            id: instanceId,
            engine: engineType,
            data: instanceData
        };
        await safeSetStorage({
            activeConfig,
            lastActiveId: instanceId
        });
        window.currentConfig = { activeConfig };
        logger.log(`[Config] 激活配置: ${instanceId}`);
    }
    const langRes = await safeGetStorage(['ui_language']);
    if (!langRes) return;
    const effectiveLang = langRes.ui_language || getBrowserLang() || 'en';
    const targetLang = effectiveLang.replace('_', '-');
    window.applyI18n(targetLang);
    const formatCountByLang = (num, lang) => {
        const n = Number(num);
        if (n >= 10000) {
            const wan = (n / 10000).toFixed(1).replace('.0', '');
            if (lang.startsWith('zh')) {
                return wan + 'w';
            } else if (lang === 'ja') {
                return wan + '万';
            } else if (lang === 'ko') {
                return wan + '만';
            }
        }
        if (n >= 1000) {
            return (n / 1000).toFixed(1).replace('.0', '') + 'k';
        }
        return n;
    };
    document.getElementById('clear-cache-btn')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const cacheSizeEl = document.getElementById('cache-size');
        if (btn.disabled) return;
        if (!btn.dataset.confirmed) {
            const count = await idb?.getCount('tr_').catch(() => 0) || 0;
            if (count === 0) {
                if (typeof showToast === 'function') showToast(t("noCacheToClear"), "info");
                return;
            }
            btn.dataset.confirmed = "true";
            btn.dataset.originalText = btn.innerText;
            const rawCount = typeof formatCountByLang === 'function' ? formatCountByLang(count, targetLang) : count;
            const formattedCount = `\u2066${rawCount}\u2069`;
            btn.innerText = t("confirm", uiLanguage).replace('{0}', formattedCount);
            btn.style.setProperty('background', 'rgba(248, 113, 113, 0.2)', 'important');
            btn.style.setProperty('border-color', '#f87171', 'important');
            btn.style.setProperty('color', '#f87171', 'important');
            const timer = setTimeout(() => {
                if (btn.dataset.confirmed === "true" && !btn.disabled) {
                    resetClearBtn(btn);
                }
            }, 4000);
            btn.dataset.timer = String(timer);
            return;
        }
        try {
            const activeTimer = btn.dataset.timer;
            if (activeTimer) clearTimeout(Number(activeTimer));
            btn.disabled = true;
            btn.innerText = `${t("clearing")}`;
            await idb.clearPrefix('tr_');
            let animationDuration = 800;
            if (cacheSizeEl) {
                const currentVal = parseFloat(cacheSizeEl.innerText.replace(/[^\d.]/g, '')) || 0;
                if (typeof animateNumber === 'function') {
                    animateNumber(cacheSizeEl, currentVal, 0, animationDuration);
                } else {
                    cacheSizeEl.innerText = "0";
                    animationDuration = 0;
                }
            }
            setTimeout(() => {
                btn.innerText = `${t('completed', uiLanguage)} ✓`;
                btn.style.setProperty('color', 'rgb(0 255 73)', 'important');
                btn.style.setProperty('background', 'rgba(74, 222, 128, 0.1)', 'important');
                btn.style.setProperty('border-color', '#4ade80', 'important');
                if (typeof showToast === 'function') showToast(t("cacheCleared"), "success");
                setTimeout(() => {
                    delete btn.dataset.confirmed;
                    delete btn.dataset.timer;
                    if (typeof resetClearBtn === 'function') resetClearBtn(btn);
                    if (typeof updateCacheSizeDisplay === 'function') updateCacheSizeDisplay();
                }, 2000);
            }, animationDuration + 100);
        } catch (err) {
            logger.log("[Mira] Clear Cache Error:", err);
            if (typeof showToast === 'function') showToast(t('failed', uiLanguage), "error");
            resetClearBtn(btn);
        }
    });
    function resetClearBtn(btn) {
        btn.dataset.confirmed = "";
        btn.disabled = false;
        btn.innerText = btn.dataset.originalText || t('clearBtn', uiLanguage);
        btn.style.background = "";
        btn.style.borderColor = "";
        btn.style.color = "";
    }
    function animateNumber(el, start, end, duration) {
        let startTime = null;
        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            const current = start + progress * (end - start);
            el.innerText = current.toFixed(2) + " MB";
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        }
        window.requestAnimationFrame(step);
    }
    await updateCacheSizeDisplay();
    let isDirty = false;
    document.addEventListener('input', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
            isDirty = true;
        }
    });
    window.addEventListener('beforeunload', (e) => {
        if (isDirty) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
    const closeBtn = document.getElementById('close-engineSettingsWindow');
    if (closeBtn) {
        closeBtn.addEventListener('click', async () => {
            if (isDirty) {
                if (!confirm(window.t("confirmClose"))) {
                    return;
                }
            }
            if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.remove) {
                try {
                    chrome.tabs.getCurrent((tab) => {
                        const err1 = chrome.runtime.lastError;
                        if (!err1 && tab && tab.id) {
                            chrome.tabs.remove(tab.id, () => {
                                const err2 = chrome.runtime.lastError;
                                if (err2) {
                                    window.close();
                                }
                            });
                        } else {
                            window.close();
                        }
                    });
                } catch (e) {
                    window.close();
                }
            } else {
                window.close();
            }
        });
    }
});
async function updateCacheSizeDisplay() {
    const el = document.getElementById('cache-size');
    if (!el) return;
    try {
        const totalBytes = await idb.getSize('tr_');
        if (totalBytes === 0) {
            el.innerText = "0 KB";
        } else if (totalBytes < 1024 * 1024) {
            el.innerText = (totalBytes / 1024).toFixed(2) + " KB";
        } else {
            el.innerText = (totalBytes / (1024 * 1024)).toFixed(2) + " MB";
        }
    } catch (err) {
        logger.error("更新缓存显示失败:", err);
        el.innerText = "0 KB";
    }
}


/* AI Prompt Section */


function isAIEngine(id) {
    const config = userConfigs.find(c => c.id === id);
    return config && AI_LLM_WHITE_LIST.includes(config.engine);
}

async function renderAIPromptSection() {
    const old = document.getElementById('ai-prompt-section');
    if (old) old.remove();

    if (!isAIEngine(currentId)) return;
    const stored = await safeGetStorage([AI_PROMPT_KEY]);
    const saved = stored?.[AI_PROMPT_KEY] || { web: '', subtitle: '' };

    const section = document.createElement('div');
    section.id = 'ai-prompt-section';
    section.className = 'ai-prompt-section';
    section.innerHTML = _buildAIPromptHTML(saved);

    const formContainer = document.querySelector('#dynamic-form-container .form-container');
    if (formContainer) {
        formContainer.appendChild(section);
    } else {
        document.getElementById('dynamic-form-container').appendChild(section);
    }

    _bindAIPromptEvents(section, saved);

    const isRTL = checkRTL(window.currentConfig.ui_language);
    document.querySelectorAll('.ai-prompt-textarea').forEach(el => {
        if (isRTL) {
            el.style.textAlign = 'right';
            el.style.direction = 'rtl';
        }
    });
}

function _buildAIPromptHTML(saved) {
    const webVal = saved.web || '';
    const subVal = saved.subtitle || '';

    return `
        <div class="ai-prompt-header" id="ai-prompt-toggle" dir="auto">
            <div class="ai-prompt-header-left">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                     stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                <span class="ai-prompt-title">${t('cpTitle', uiLanguage)}</span>
                <span class="ai-prompt-badge">${t('cpOptional', uiLanguage)}</span>
            </div>
            <svg class="ai-prompt-chevron ${webVal || subVal ? 'open' : ''}"
                 id="ai-prompt-chevron"
                 viewBox="0 0 24 24" fill="none" stroke="rgb(0 255 73)"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
            </svg>
        </div>

        <div class="ai-prompt-body ${webVal || subVal ? 'open' : ''}" id="ai-prompt-body">

  <div class="ai-prompt-item">
    <div class="ai-prompt-item-header" 
      style="${checkRTL(window.currentConfig.ui_language) ? 'flex-direction:row-reverse;' : ''}">
      <div class="ai-prompt-item-label" 
        style="${checkRTL(window.currentConfig.ui_language) ? 'flex-direction:row-reverse;' : ''}">
        🌐 <span>${t('cpWeb', uiLanguage)}</span>
      </div>
      <button class="ai-prompt-clear-btn ${webVal ? 'visible' : ''}"
        data-target="ai-prompt-web">${t('cpClear', uiLanguage)}</button>
    </div>
    <textarea id="ai-prompt-web" dir="auto" class="ai-prompt-textarea"
      maxlength="150" placeholder="${t('cpWebPH', uiLanguage)}" spellcheck="false"
    >${_escapeHtml(webVal)}</textarea>
    <div class="ai-prompt-char-count" id="ai-prompt-web-count">${webVal.length} / 150</div>
  </div>

  <div class="ai-prompt-item">
    <div class="ai-prompt-item-header" 
      style="${checkRTL(window.currentConfig.ui_language) ? 'flex-direction:row-reverse;' : ''}">
      <div class="ai-prompt-item-label" 
        style="${checkRTL(window.currentConfig.ui_language) ? 'flex-direction:row-reverse;' : ''}">
        <svg viewBox="0 0 24 24" width="18" height="18" style="vertical-align: middle;">
          <path fill="#FF0000" d="M21.593 5.72a2.61 2.61 0 0 0-1.842-1.844C18.337 3.5 12 3.5 12 3.5s-6.337 0-7.751.376A2.61 2.61 0 0 0 2.407 5.72 27.6 27.6 0 0 0 2 12c0 2.21.033 4.39.407 6.28a2.61 2.61 0 0 0 1.842 1.844C5.663 20.5 12 20.5 12 20.5s6.337 0 7.751-.376a2.61 2.61 0 0 0 1.842-1.844C21.967 16.39 22 14.21 22 12c0-2.21-.033-4.39-.407-6.28z"/>
          <path fill="#FFFFFF" d="M10 15.5V8.5l7 3.5-7 3.5z"/>
        </svg>
        YouTube<span>${t('cpSub', uiLanguage)}</span>
      </div>
      <button class="ai-prompt-clear-btn ${subVal ? 'visible' : ''}"
        data-target="ai-prompt-subtitle">${t('cpClear', uiLanguage)}</button>
    </div>
    <textarea id="ai-prompt-subtitle" dir="auto" class="ai-prompt-textarea"
      maxlength="150" placeholder="${t('cpSubPH', uiLanguage)}" spellcheck="false"
    >${_escapeHtml(subVal)}</textarea>
    <div class="ai-prompt-char-count" id="ai-prompt-subtitle-count">${subVal.length} / 150</div>
    <div class="ai-prompt-style-hint" dir="auto">${t('cpHint', uiLanguage)}</div>
  </div>


</div>
    `;
}

function _bindAIPromptEvents(section, initialSaved) {
    const toggle = section.querySelector('#ai-prompt-toggle');
    const body = section.querySelector('#ai-prompt-body');
    const chevron = section.querySelector('#ai-prompt-chevron');
    const webTA = section.querySelector('#ai-prompt-web');
    const subTA = section.querySelector('#ai-prompt-subtitle');
    const webCount = section.querySelector('#ai-prompt-web-count');
    const subCount = section.querySelector('#ai-prompt-subtitle-count');

    toggle.addEventListener('click', () => {
        const isOpen = body.classList.toggle('open');
        chevron.classList.toggle('open', isOpen);

        if (isOpen) {
            setTimeout(() => {
                section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 300);
        }
    });
    // ── 字符计数 
    function updateCount(ta, countEl) {
        const len = ta.value.length;
        countEl.textContent = `${len} / 150`;
        countEl.classList.toggle('warn', len > 120);
    }

    // ── dirty 标记 → 激活保存按钮
    webTA.addEventListener('input', () => {
        updateCount(webTA, webCount);
        section.querySelector('[data-target="ai-prompt-web"]')
            .classList.toggle('visible', webTA.value.length > 0);
    });

    subTA.addEventListener('input', () => {
        updateCount(subTA, subCount);
        section.querySelector('[data-target="ai-prompt-subtitle"]')
            .classList.toggle('visible', subTA.value.length > 0);
    });

    section.querySelectorAll('.ai-prompt-clear-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const ta = document.getElementById(btn.dataset.target);
            if (!ta) return;
            ta.value = '';
            btn.classList.remove('visible');
            const countEl = document.getElementById(btn.dataset.target + '-count');
            if (countEl) updateCount(ta, countEl);
        });
    });
}

// ── HTML 转义（防止 saved prompt 里有 < > 破坏 innerHTML）──
function _escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}