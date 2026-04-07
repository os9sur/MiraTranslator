window.browser = (function () {
    return window.msBrowser || window.browser || window.chrome;
})();
let userConfig = null;
document.addEventListener('DOMContentLoaded', async () => {
    const res = await safeGetStorage(['ui_language', 'selectedEngine', 'apiKeys']);
    if (!res) return;
    window.currentConfig = {
        ui_language: res.ui_language || (getBrowserLang() || 'en').replace('_', '-'),//ui_language
        selectedEngine: res.selectedEngine || _defaultEngine,
        apiKeys: res.apiKeys || {}
    };
    const ui_lang = window.currentConfig.ui_language;
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
                { k: 'oaModel', l: 'Model Name', t: 'text', d: 'gpt-4o-mini', opts: ['gpt-5.2', 'gpt-5.1', 'gpt-5', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
                { k: 'oaApiHost', l: 'Proxy Address', t: 'text', d: 'https://api.openai.com/v1' }
            ]
        },
        'claude': {
            name: 'Anthropic (Claude)', url: 'https://console.anthropic.com/settings/keys', color: '#d97752', meta: 'CL.35',
            fields: [
                { k: 'claudeKey', l: 'API Key', t: 'password', p: 'sk-ant-api03-...' },
                { k: 'claudeModel', l: 'Model Name', t: 'text', d: 'claude-3-5-sonnet-latest', opts: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest'] },
                { k: 'claudeApiHost', l: 'Proxy Address', t: 'text', d: 'https://api.anthropic.com/v1' }
            ]
        },
        'gemini': {
            name: 'Google (Gemini)', url: 'https://aistudio.google.com/app/apikey', color: '#fbbf24', meta: 'G.PRO',
            fields: [
                { k: 'geminiKey', l: 'API Key', t: 'password', p: 'AIza...' },
                { k: 'geminiModel', l: 'Model Name', t: 'text', d: 'gemini-2.0-flash', opts: ['gemini-2.5-flash', 'gemini-2.0-flash'] }
            ]
        },
        'deepseek': {
            name: 'DeepSeek', url: 'https://platform.deepseek.com/api_keys', default_url: 'https://api.deepseek.com', color: '#3b82f6', meta: 'DS.R1',
            fields: [
                { k: 'dsKey', l: 'API Key', t: 'password', p: 'sk-...' },
                { k: 'dsHost', l: 'Base URL', t: 'text', d: 'https://api.deepseek.com' },
                { k: 'dsModel', l: 'Model Name', t: 'text', d: 'deepseek-chat', opts: ['deepseek-chat', 'deepseek-reasoner'] }
            ]
        },
        'grok': {
            name: 'xAI (Grok)', url: 'https://x.ai/api', color: '#ffffff', meta: 'GROK',
            fields: [
                { k: 'grokKey', l: 'API Key', t: 'password', p: 'xai-...' },
                { k: 'grokModel', l: 'Model Name', t: 'text', d: 'grok-beta', opts: ['grok-2-1212', 'grok-beta', 'grok-vision-beta'] }
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
                { k: 'groqModel', l: 'Model Name', t: 'text', d: 'llama-3.3-70b-versatile', opts: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'] }
            ]
        },
        'siliconflow': {
            name: 'SiliconFlow', url: 'https://cloud.siliconflow.cn/account/ak', color: '#6366f1', meta: 'SF.AGGR',
            fields: [
                { k: 'siliconflowKey', l: 'API Key', t: 'password' },
                { k: 'siliconflowModel', l: 'Model Name', t: 'text', d: 'deepseek-ai/DeepSeek-V3', opts: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1'] }
            ]
        },
        'custom_ai': {
            name: 'Custom API', url: '#', default_url: 'https://api.openai.com/v1', color: '#a855f7', meta: 'ANY.API',
            tip: t('customApiTip', ui_lang),
            fields: [
                { k: 'customKey', l: 'API Key', t: 'password' },
                { k: 'customHost', l: 'Base URL', t: 'text', d: 'https://api.your-provider.com/v1' },
                {
                    k: 'customModel', l: 'Model Name', t: 'text', d: 'gpt-4o',
                    opts: [
                        // 代理/中转场景
                        'gpt-4o', 'gpt-4o-mini', 'deepseek-chat',
                        '───── Local Models ─────',
                        // 低配 
                        'gemma3:1b', 'qwen2.5:1.5b', 'phi4-mini', 'llama3.2:3b',
                        // 中配 
                        'gemma3:4b', 'qwen2.5:7b', 'qwen3:8b', 'llama3.3:8b', 'mistral:7b',
                        // 高配 
                        'deepseek-r1:8b', 'llama4:8b',
                    ]
                }
            ]
        }
    };
    const ENGINE_GROUPS = [
        {
            label: "Advanced & Custom",
            engines: ['groq', 'siliconflow', 'custom_ai']
        },
        {
            label: "AI Models (LLM)",
            engines: ['openai', 'claude', 'gemini', 'deepseek', 'grok']
        },
        {
            label: "Cloud Infrastructure",
            engines: ['google_v3', 'microsoft', 'volc', 'tencent']
        },
        {
            label: "General Translation",
            engines: ['google', 'bing', 'deepl', 'baidu']
        }
    ];
    let userConfigs = [];
    let currentId = '';
    async function init() {
        const data = await safeGetStorage(['userConfigs', 'lastActiveId', 'selectedEngine', 'apiKeys']);
        if (!data) return;
        let storedConfigs = data.userConfigs || [];
        const oldApiKeys = data.apiKeys || {};
        const builtInEngines = [
            { id: 'google_builtin', engine: 'google', alias: `Google (${window.t("builtin", ui_lang)})` },
            { id: 'bing_builtin', engine: 'bing', alias: `Bing (${window.t("builtin", ui_lang)})` }
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
        const data = await safeGetStorage('lastActiveId');
        if (!data) return;
        const defaultId = userConfigs.find(c => c.engine === _defaultEngine)?.id ?? userConfigs[0].id;
        const lastActiveId = data?.lastActiveId ?? defaultId;//默认引擎
        const activeConfig = userConfigs.find(c => c.id === lastActiveId);
        const statusValueEl = document.getElementById('active-engine-name');
        if (statusValueEl) {
            statusValueEl.innerText = activeConfig ? activeConfig.alias : t('notEnabled', ui_lang);
        }
        list.innerHTML = userConfigs.map(c => {
            const isEditing = c.id === currentId;
            const isRunning = c.id === lastActiveId;
            return `
            <div class="engine-item ${isEditing ? 'active' : ''}" data-id="${c.id}">
                <div class="engine-info">
                    ${isRunning ? `<span class="status-dot checking" data-id="${c.id}"></span>` : ''}
                    <span class="engine-name">${c.alias}</span>
                </div>
                ${(c.id !== 'google_builtin' && c.id !== 'bing_builtin') ?
                    `<span class="del-icon" data-id="${c.id}">×</span>` : ''}
            </div>
        `;
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
        checkCurrentEngineStatus(lastActiveId, userConfigs);
    }
    async function checkCurrentEngineStatus(lastActiveId, userConfigs) {
        const dot = document.querySelector(`.status-dot[data-id="${lastActiveId}"]`);
        if (!dot) return;

        const config = userConfigs.find(c => c.id === lastActiveId);
        if (!config) return;

        const storage = await safeGetStorage(['ui_language']).catch(() => ({}));
        const targetLang = storage?.ui_language || 'en';
        const isTargetEn = targetLang.toLowerCase().startsWith('en');
        const testText = isTargetEn ? '你好' : 'Good morning';

        try {
            let failed = false;

            //  google/bing/AI 统一走 TRANSLATE 消息，isTest=true 跳过降级逻辑
            const instanceData = ['google', 'bing'].includes(config.engine)
                ? {}
                : (await safeGetStorage(`data_${lastActiveId}`))?.[`data_${lastActiveId}`] || {};

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

    async function switchInstance(id) {
        const uiLanguage = window.currentConfig?.ui_language || getBrowserLang() || 'en';
        currentId = id;
        const config = userConfigs.find(c => c.id === id) || userConfigs[0];
        const container = document.getElementById('dynamic-form-container');
        const actions = document.getElementById('global-actions');
        container.innerHTML = '';
        renderSidebar();
        const res = await safeGetStorage(`data_${id}`);
        if (!res) return;
        const saved = res[`data_${id}`] || {};
        let activeEngine = config.engine;
        if (saved.geminiKey && activeEngine === 'google') {
            activeEngine = 'gemini';
        }
        const tpl = TEMPLATES[activeEngine] || TEMPLATES[_defaultEngine];
        const displayAlias = config.alias || tpl.name || activeEngine;
        const tipsDesc = document.getElementById('tips');
        const testBtn = document.getElementById('testApiConfig');
        if (tipsDesc) { tipsDesc.innerText = ""; tipsDesc.style.color = ""; }
        if (testBtn) {
            testBtn.innerHTML = `⚡ ${t('testConnection', uiLanguage)}`;
            testBtn.style.borderColor = "";
            testBtn.disabled = false;
        }
        if (tpl.isBuiltIn) {
            actions.classList.add('hidden');
            container.innerHTML = `
                <div class="main-header">
                    <h2 style="margin:0">${displayAlias}</h2>
                </div>
                <div class="form-container">
                    <div class="built-in-notice" style="border: 1px dashed #30363d; padding: 20px; border-radius: 8px;margin-top: 10px;">
                        <div id="statusIcon" class="notice-icon" style="color: #8b949e; font-size: 24px; margin-bottom: 10px;">⌛</div>
                        <p style="margin: 0 0 15px 0;"><strong id="statusText">${displayAlias} ${t('testing', uiLanguage)}</strong></p>
                        <hr style="border: 0; border-top: 1px solid #30363d; margin: 15px 0;">
                        <p style="color:#8b949e; font-size:12px; line-height:1.6; margin:0">
                            ${t('freeInterfaceTipsInfo', uiLanguage)}
                        </p>
                        <p style="color:#d1d5da; font-size:12px; margin-top: 8px;">
                            ✨ ${t('wantBetterExperience', uiLanguage)} <span style="color: #f2cc60;font-size: larger;">${t('clickBottomTip', uiLanguage)}</span>
                        </p>
                    </div>
                    <button id="activateBuiltIn" class="btn-save" style="margin-top: 25px; margin-left: 155px;width: 100%; display: none;">
                        ${t('enableEngineNow', uiLanguage)}
                    </button>
                </div>
                `;

            const checkConnectivity = async () => {
                const icon = document.getElementById('statusIcon');
                const text = document.getElementById('statusText');
                const btn = document.getElementById('activateBuiltIn');

                let isOk = false;
                let errorMsg = '';
                try {
                    if (config.engine === 'google' || config.engine === 'bing') {
                        const storage = await safeGetStorage(['ui_language']).catch(() => ({}));
                        const targetLang = storage?.ui_language || 'en';
                        const isTargetEn = targetLang.toLowerCase().startsWith('en');
                        const testText = isTargetEn ? '你好' : 'Good morning';

                        const res = await Promise.race([
                            safeSendMessage({
                                type: 'TRANSLATE',
                                text: testText,
                                targetLang,
                                isTest: true,
                                engine: config.engine,
                            }),
                            new Promise(resolve => setTimeout(() => resolve(null), 8000))
                        ]);

                        if (!res) {
                            errorMsg = 'Timeout';
                        } else if (res.error) {
                            errorMsg = res.error;
                            errorCode = res.errorCode || '';
                        } else {
                            const data = res.currentTranslationResponse;
                            if (!data || data.error) {
                                errorMsg = data?.error || 'No response';
                                errorCode = data?.errorCode || '';
                            } else {
                                const translatedText = (typeof data === 'string'
                                    ? data
                                    : (data?.translatedText || data?.basic || '')
                                ).trim();
                                isOk = translatedText.length > 0
                                    && translatedText.toLowerCase() !== testText.toLowerCase()
                                    && !data?.isError;
                                if (!isOk) errorMsg = 'Invalid result';
                            }
                        }
                    }
                } catch (e) {
                    errorMsg = e.message;
                }

                if (isOk) {
                    icon.innerText = '✓';
                    icon.style.color = '#3fb950';
                    text.innerHTML = `<strong>${displayAlias}</strong> ${t('ready', uiLanguage)}`;
                    btn.style.display = 'block';
                } else {
                    icon.innerText = '✕';
                    icon.style.color = '#f85149';
                    const friendlyError = getFriendlyEngineError(config.engine, errorMsg);
                    text.innerHTML = `<strong>${displayAlias}</strong> ${t('failed', uiLanguage)}${friendlyError ? `<span style="font-size:11px; opacity:0.7; display:block; margin-top:11px; line-height:1.4;">${friendlyError}</span>` : ''}`;
                    btn.style.display = 'block';
                    btn.style.opacity = '0.6';
                }
            };

            checkConnectivity();

            document.getElementById('activateBuiltIn').onclick = async (e) => {
                const btn = e.target;
                btn.disabled = true;
                await safeSetStorage({ lastActiveId: id });
                if (typeof syncGlobalConfig === 'function') {
                    await syncGlobalConfig(id, config.engine, {});
                }
                btn.innerText = t('enabled', uiLanguage);
                btn.style.background = "#22c55e";
                isDirty = false;
                renderSidebar();
                setTimeout(() => {
                    btn.disabled = false;
                    btn.innerText = t('enableEngineNow', uiLanguage);
                    btn.style.background = "";
                }, 1000);
            };
            return;
        }
        actions.classList.remove('hidden');
        const getRow = (field) => {
            const { k, l, t: inputType, p, d, opts } = field;
            let val = saved[k] ?? (k === 'alias' ? (config.alias || '') : (d || ''));
            const isKeyField = k.toLowerCase().includes('key');
            const showGetKey = (isKeyField && tpl.url && tpl.url !== '#');
            let inputHtml = '';
            if (opts && opts.length > 0) {
                inputHtml = `
            <div class="custom-combobox">
                <input type="${inputType || 'text'}" data-key="${k}" class="api-input-field" placeholder="${p || ''}" value="${val}" spellcheck="false">
                <div class="combobox-toggle"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"></path></svg></div>
                <div class="combobox-dropdown">
                    ${opts.map(opt =>
                    opt.startsWith('─')
                        ? `<div class="dropdown-divider" style="color:#666;font-size:10px;padding:4px 8px;cursor:default;pointer-events:none;">${opt}</div>`
                        : `<div class="dropdown-item" data-value="${opt}">${opt}</div>`
                ).join('')}
                </div>
            </div>`;
            } else {
                const placeholder = (k === 'alias') ? displayAlias : (p || '');
                inputHtml = `<input type="${inputType || 'text'}" data-key="${k}" class="api-input-field" placeholder="${placeholder}" value="${val}" spellcheck="false">`;
            }
            return `
            <div class="form-group">
                <div class="field-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;margin-top:17px;">
                    <label style="margin:0">${l.toUpperCase()}</label>
                    ${showGetKey ? `<a href="${tpl.url}" target="_blank" class="get-key-link">${t('getApiKey', uiLanguage)}</a>` : ''}
                </div>
                ${inputHtml}
            </div>`;
        };
        let html = `
        <div class="main-header">
            <h2 style="margin:0">${t('engineConfig', uiLanguage)}：${displayAlias}</h2>
        </div>
        <div class="form-container">
            ${tpl.tip ? `<p class="tip-yellow" style="color:#fbbf24; font-size:11px; margin-bottom:15px; opacity:0.9;">⚡ ${tpl.tip}</p>` : ''}
            ${getRow({ k: 'alias', l: t('configAlias', uiLanguage) })} 
            ${(tpl.fields || []).map(f => getRow(f)).join('')}
        </div>`;
        container.innerHTML = html;
        if (typeof initAllComboboxes === 'function') initAllComboboxes();
    }
    function initAllComboboxes() {
        document.querySelectorAll('.combobox-toggle').forEach(toggle => {
            toggle.onclick = (e) => {
                e.stopPropagation();
                const container = toggle.parentElement;

                // ↓ dropdown 可能已经在 body 里，用 _dropdown 引用追踪
                const dropdown = container._dropdown || container.querySelector('.combobox-dropdown');
                if (!dropdown) return;
                container._dropdown = dropdown; // 缓存引用

                const isOpen = dropdown.classList.contains('show');

                // 关闭所有
                document.querySelectorAll('.combobox-dropdown.show').forEach(d => {
                    d.classList.remove('show');
                    if (d._originalParent) {
                        d._originalParent.classList.remove('open');
                        d._originalParent._dropdown = null;
                        d._originalParent.appendChild(d);
                        d._originalParent = null;
                    }
                    d.style.cssText = '';
                });

                if (!isOpen) {
                    const rect = container.getBoundingClientRect();
                    dropdown._originalParent = container;
                    document.body.appendChild(dropdown);

                    dropdown.style.position = 'fixed';
                    dropdown.style.top = (rect.bottom + 2) + 'px';
                    dropdown.style.left = rect.left + 'px';
                    dropdown.style.width = rect.width + 'px';
                    dropdown.style.maxHeight = '180px';
                    dropdown.style.overflowY = 'auto'; // ← 加这个
                    dropdown.style.zIndex = '999999';
                    dropdown.classList.add('show');
                    container.classList.add('open');
                }
            };
        });

        document.querySelectorAll('.dropdown-item').forEach(item => {
            item.onclick = (e) => {
                e.stopPropagation();
                const val = item.dataset.value;
                const dropdown = item.closest('.combobox-dropdown');
                const originalParent = dropdown._originalParent;
                const input = originalParent?.querySelector('input');
                if (input) {
                    input.value = val;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
                dropdown.classList.remove('show');
                if (originalParent) {
                    originalParent.classList.remove('open');
                    originalParent._dropdown = null;
                    originalParent.appendChild(dropdown);
                    dropdown._originalParent = null;
                }
                dropdown.style.cssText = '';
            };
        });

        document.addEventListener('click', () => {
            document.querySelectorAll('.combobox-dropdown.show').forEach(d => {
                d.classList.remove('show');
                if (d._originalParent) {
                    d._originalParent.classList.remove('open');
                    d._originalParent._dropdown = null;
                    d._originalParent.appendChild(d);
                    d._originalParent = null;
                }
                d.style.cssText = '';
            });
        });
    }
    function bindEvents() {
        document.getElementById('saveApiConfig').onclick = async () => {
            const saveBtn = document.getElementById('saveApiConfig');
            if (!saveBtn) return;
            const uiLanguage = window.currentConfig?.ui_language || getBrowserLang() || 'en';
            const inputs = document.querySelectorAll('#dynamic-form-container input');
            const data = {};
            inputs.forEach(i => {
                const key = i.dataset.key;
                if (key) data[key] = i.value.trim();
            });
            const config = userConfigs.find(c => c.id === currentId);
            if (!config) {
                logger.error("[Mira] 找不到当前配置实例");
                return;
            }
            saveBtn.disabled = true;
            const originalText = saveBtn.innerText;
            const originalBg = saveBtn.style.backgroundColor;
            try {
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
                    userConfigs[idx].alias = data.alias || engineTemplate.name || finalEngine;
                }
                await safeSetStorage({
                    [`data_${currentId}`]: data,
                    userConfigs: userConfigs,
                    lastActiveId: currentId
                });
                if (typeof syncGlobalConfig === 'function') {
                    await syncGlobalConfig(currentId, finalEngine, data);
                }
                if (typeof renderSidebar === 'function') renderSidebar();
                logger.log("保存成功提示: ", uiLanguage);
                saveBtn.innerText = `${t('save', uiLanguage)}${t('success', uiLanguage)}`;
                saveBtn.style.setProperty('background-color', '#22c55e', 'important');
                if (typeof checkEngineStatus === 'function') {
                    await checkEngineStatus();
                }
            } catch (error) {
                logger.error("[Mira] 保存配置失败:", error);
                saveBtn.innerText = `${t('save', uiLanguage)} ${t('failed', uiLanguage)}`;
                saveBtn.style.setProperty('background-color', '#ef4444', 'important');
            } finally {
                setTimeout(() => {
                    if (saveBtn) {
                        saveBtn.innerText = originalText;
                        saveBtn.style.removeProperty('background-color');
                        saveBtn.style.backgroundColor = originalBg;
                        saveBtn.disabled = false;
                    }
                }, 1000);
            }
        };
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
                        const desc = tpl.url === '#' ? t('customAiInterface', ui_lang) : t('accessService', ui_lang).replace('{0}', tpl.name);
                        html += `
                    <div class="tpl-card" 
                         data-type="${key}" 
                         data-meta="${meta}"
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
        document.getElementById('template-grid').onclick = async (e) => {
            const card = e.target.closest('.tpl-card');
            if (!card) return;
            const engineKey = card.dataset.type;
            const template = TEMPLATES[engineKey];
            const newId = `inst_${Date.now()}`;
            userConfigs.push({
                id: newId,
                engine: engineKey,
                alias: `${t('newBadge', ui_lang)} ${template.name}`
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
    document.getElementById('testApiConfig').onclick = async () => {
        const btn = document.getElementById('testApiConfig');
        const tipsDesc = document.getElementById('tips');
        if (!btn) return;
        const i18n = {
            testConnection: t('testConnection', ui_lang),
            testing: t('testing', ui_lang),
            success: t('success', ui_lang),
            failed: t('failed', ui_lang),
            error_no_response: t('error_no_response', ui_lang),
            error_timeout: t('error_timeout', ui_lang),
            error_same_as_original: t('error_same_as_original', ui_lang),
            error_generic: t('error_generic', ui_lang),
        };
        btn.disabled = true;
        const originalHTML = `⚡ ${i18n.testConnection}`;
        btn.innerHTML = `<span>⏳ ${i18n.testing}</span>`;
        if (tipsDesc) {
            tipsDesc.style.color = "";
            tipsDesc.innerText = "";
        }
        const storage = await safeGetStorage(['ui_language']).catch(() => ({}));
        const testTargetLang = storage?.ui_language || window.currentConfig?.ui_language || getBrowserLang() || 'en';
        const tempKeys = {};
        document.querySelectorAll('.api-input-field').forEach(input => {
            const key = input.getAttribute('data-key');
            if (key) tempKeys[key] = input.value.trim();
        });
        const userConfig = userConfigs.find(c => c.id === currentId);
        if (!userConfig) {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
            return;
        }
        const isTargetEn = testTargetLang.toLowerCase().startsWith('en');
        const testText = isTargetEn ? '你好' : 'Good morning';
        logger.log("Testing info: ", "text:", testText, "targetLang: ", testTargetLang, "engine", userConfig.engine);
        try {
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
                btn.innerHTML = `<span style="color: #3fb950; font-size: 20px; margin-right: 8px;">✓</span><span> ${i18n.success}</span>`;
                btn.style.setProperty('border-color', '#10a37f', 'important');
            } else {
                throw new Error(translatedText.length === 0 ? "Empty Content" : "Same as Original");
            }
        } catch (e) {
            logger.error("[Test] Failed:", e);
            btn.innerHTML = `<span>❌ ${i18n.failed}</span>`;
            btn.style.setProperty('border-color', '#f87171', 'important');
            btn.style.userSelect = 'text';
            if (tipsDesc) {
                tipsDesc.style.color = "#f87171";
                tipsDesc.style.userSelect = 'text';
                tipsDesc.style.cursor = 'text';
                const errorText = e.message || String(e);
                const match = errorText.match(/400|401|402|403|404|429|500|502|503/);
                let displayMessage = "";
                if (match) {
                    let errorCode = match[0];
                    if (errorCode === "400" && errorText.toLowerCase().includes("balance")) errorCode = "402";
                    const friendlyMsg = getSafeMessage(`ERROR_${errorCode}`);
                    displayMessage = friendlyMsg ? `${friendlyMsg} (Code: ${errorCode})` : `API Error: ${errorCode}`;
                } else if (errorText.toLowerCase().includes("timeout")) {
                    const isLocalModel = (tempKeys?.baseUrl || '').includes('localhost') ||
                        (tempKeys?.baseUrl || '').includes('127.0.0.1');
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
        } finally {
            setTimeout(() => {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalHTML;
                    btn.style.removeProperty('border-color');
                }
            }, 3000);
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
            const formattedCount = typeof formatCountByLang === 'function' ? formatCountByLang(count, targetLang) : count;
            btn.innerText = t("confirm", ui_lang).replace('{0}', formattedCount);
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
                btn.innerText = `${t('completed', ui_lang)} ✓`;
                btn.style.setProperty('color', '#4ade80', 'important');
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
            if (typeof showToast === 'function') showToast(t('failed', ui_lang), "error");
            resetClearBtn(btn);
        }
    });
    function resetClearBtn(btn) {
        btn.dataset.confirmed = "";
        btn.disabled = false;
        btn.innerText = btn.dataset.originalText || t('clearBtn', ui_lang);
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