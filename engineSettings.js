window.browser = (function () {
    return window.msBrowser || window.browser || window.chrome;
})();
let userConfig = null;
let currentId = '';
let userConfigs = [];

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
        'mira_pro': {
            name: 'Mira Pro',
            isBuiltIn: true,
            isPro: true,
            color: '#7c3aed',
            meta: 'MIRA.PRO',
        },
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
            default_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
            fields: [
                { k: 'geminiKey', l: 'API Key', t: 'password', p: 'AIza...' },
                { k: 'geminiHost', l: 'Base URL', t: 'text', d: 'https://generativelanguage.googleapis.com/v1beta/openai' },
                { k: 'geminiModel', l: 'Model Name', t: 'text', d: 'gemini-2.5-flash', opts: ['gemini-2.5-flash', 'gemini-2.0-flash'] }
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
                { k: 'grokHost', l: 'Base URL', t: 'text', d: 'https://api.x.ai/v1' },
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
                { k: 'siliconflowHost', l: 'Base URL', t: 'text', d: 'https://api.siliconflow.cn/v1' },
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
                        'gpt-4o', 'gpt-4o-mini', 'deepseek/deepseek-v3.2',
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

    async function init() {
        const data = await safeGetStorage(['userConfigs', 'lastActiveId', 'selectedEngine', 'apiKeys']);
        if (!data) return;
        let storedConfigs = data.userConfigs || [];
        const oldApiKeys = data.apiKeys || {};
        const builtInEngines = [
            { id: 'mira_pro', engine: 'mira_pro', alias: '✦ Mira AI Translator' },
            { id: 'google_builtin', engine: 'google', alias: `Google (${window.t("builtin", ui_lang)})` },
            { id: 'bing_builtin', engine: 'bing', alias: `Bing (${window.t("builtin", ui_lang)})` }
        ];
        const customConfigs = storedConfigs.filter(c =>
            c.id !== 'google_builtin' &&
            c.id !== 'bing_builtin' &&
            c.id !== 'mira_pro'
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
            statusValueEl.innerText = activeConfig ? activeConfig.alias : t('notEnabled', ui_lang);
        }
        list.innerHTML = userConfigs.map(c => {
            const isEditing = c.id === lastActiveId;
            const isRunning = c.id === runningId;

            //  判断是否为 mira_pro
            const isMiraPro = c.id === 'mira_pro';

            const tpl = TEMPLATES[c.engine] || {};
            const proTag = tpl.isPro ? `<span style="background:#7c3aed;color:#fff;font-size:10px;padding:1px 6px;border-radius:10px;margin-left:4px;">Pro</span>` : '';

            return `
    <div class="engine-item ${isEditing ? 'active' : ''} ${isMiraPro ? 'item-gold-pro' : ''}" data-id="${c.id}">
        <div class="engine-info">
            ${isRunning ? `<span class="status-dot success" data-id="${c.id}"></span>` : ''}
            <span class="engine-name">${c.alias}</span>${proTag}
        </div>
        ${(c.id !== 'google_builtin' && c.id !== 'bing_builtin' && c.id !== 'mira_pro') ?
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

        // Mira Pro 特殊处理：只检查登录和余额，不做翻译测试（避免扣费）
        if (config.engine === 'mira_pro') {
            try {
                const userData = await safeGetStorage(['mira_user']);
                const user = userData?.mira_user;
                if (!user) {
                    dot.classList.remove('checking');
                    dot.classList.add('error');
                    dot.title = 'Mira Pro 未登录';
                    return;
                }

                const res = await safeSendMessage({ action: 'getBalance', uid: user.uid });
                const failed = !res?.balance || res.balance <= 0;
                dot.classList.remove('checking');
                dot.classList.add(failed ? 'error' : 'success');
                dot.title = failed
                    ? 'Mira Pro 余额不足'
                    : `Mira Pro 正常 余额$${res.balance.toFixed(2)}`;
            } catch (e) {
                dot.classList.remove('checking');
                dot.classList.add('error');
                dot.title = 'Mira Pro 状态检查失败';
            }
            return;
        }

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

    let currentModel = null;
    async function switchInstance(id) {
        await safeSetStorage({ lastActiveId: id });
        const myVersion = ++switchVersion;
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
        const saveBtn = document.getElementById('saveApiConfig');
        if (tipsDesc) { tipsDesc.innerText = ""; tipsDesc.style.color = ""; }
        if (testBtn) {
            testBtn.innerHTML = `⚡ ${t('testConnection', uiLanguage)}`;
            testBtn.style.borderColor = "";
            testBtn.disabled = false;
        }
        if (saveBtn) {
            saveBtn.innerHTML = `${t('save', uiLanguage)}`;
            saveBtn.style.backgroundColor = "";
            saveBtn.disabled = false;
        }
        // ---- Mira Pro 专属页面 ----
        if (config.engine === 'mira_pro') {
            actions.classList.remove('hidden');
            const miraSaved = (await safeGetStorage(`data_mira_pro`)) || {};
            const selectedModel = miraSaved[`data_mira_pro`]?.model || MIRA_DEFAULT_MODEL;

            // 从 background.js 获取真实余额数据
            let balance = 0;
            let usedTokens = 0;
            let usedCost = '0.00';
            try {
                const userData = await safeGetStorage(['mira_user', 'mira_user_balance']);
                const balanceData = userData?.mira_user_balance;
                if (balanceData?.balance !== undefined) {
                    balance = balanceData.balance;
                }
                if (miraSaved[`data_mira_pro`]?.usedTokens !== undefined) {
                    usedTokens = miraSaved[`data_mira_pro`].usedTokens;
                    usedCost = (usedTokens / 1000000 * 1.8).toFixed(2);
                }
            } catch (e) {
                logger.warn('获取 Mira 余额数据失败:', e);
                balance = 0;
            }

            // ── 语言工具函数 ──────────────────────────────────────────

            const getDesc = (descObj, lang) => {
                if (!descObj) return '';
                return descObj[lang] || descObj['en'] || '';
            };

            // ── 动态加载模型列表 ──────────────────────────────────────
            let models = [];
            const browserLang = getBrowserLang();
            // 先显示 loading
            container.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;gap:12px;color:#8b949e;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2"
                    style="animation:spin 1s linear infinite;">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                </svg>
                <span style="font-size:13px;">Loading models...</span>
            </div>
            <style>@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style>`;

            try {
                const resp = await fetch(MODELS_URL);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const notice = await resp.json();
                models = (notice.models || []).map(m => ({
                    id: m.id,
                    label: m.label,
                    tag: m.tag || '',
                    tagColor: m.tagColor || '#7c3aed',
                    desc: getDesc(m.desc, browserLang),
                }));
            } catch (e) {
                logger.warn('加载模型列表失败，使用内置备用列表:', e);
                // 备用列表（与 JSON 保持一致）
                models = MIRA_FALLBACK_MODELS
            }

            // ── 渲染页面 ──────────────────────────────────────────────
            container.innerHTML = `
            <div class="main-header" style="display:flex;margin-bottom:10px; justify-content:space-between;align-items:center;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div>
                        <h2 style="margin:0; display:flex; align-items:center; gap:8px; 
                            background: linear-gradient(135deg, #fbbf24 0%, #d97706 100%); 
                            -webkit-background-clip: text; 
                            background-clip: text;
                            -webkit-text-fill-color: transparent; 
                            font-weight: 800; 
                            letter-spacing: -0.2px;">
                            
                            <span style="-webkit-text-fill-color: #fbbf24; text-shadow: 0 0 8px rgba(251, 191, 36, 0.6);">✦</span> 
                            Mira AI Translator
                            
                            <span style="background: linear-gradient(135deg, #f59e0b, #d97706); 
                                        -webkit-text-fill-color: #fff; 
                                        color: #fff; 
                                        font-size: 11px; 
                                        padding: 2px 8px; 
                                        border-radius: 10px; 
                                        font-weight: 600; 
                                        margin-left: 2px;
                                        box-shadow: 0 2px 6px rgba(217, 119, 6, 0.3);">
                                Pro
                            </span>
                        </h2>
                        <p style="margin:4px 0 0;font-size:12px;color:#8b949e;">${t('byokNotice', ui_lang) || 'No API Key required. Out-of-the-box'}</p>
                    </div>
                </div>
            </div>
            <div class="form-container" style="padding-left:2px;">
                <div style="background:#161b22;border:1px solid #30363d;border-radius:10px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
                    <div>
                        <div style="font-size:12px;color:#8b949e;margin-bottom:4px;">${t('balance', ui_lang) || 'Current Balance'}</div>
                        <div id="miraBalance" style="font-size:28px;font-weight:600;">$${balance.toFixed(2)}</div>
                    </div>
                    <button id="miraRechargeBtn"><span>+ ${t('recharge', ui_lang) || 'Recharge'}</span></button>
                </div>
                <div style="font-size:13px;color:#8b949e;margin-bottom:12px;">${t('selectModel', ui_lang) || 'Select Translation Model'}</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;" id="miraModelGrid">
                        ${models.map(m => `
                <div class="mira-model-card" data-model="${m.id}"
                    style="border:1.5px solid ${m.id === selectedModel ? '#7c3aed' : '#30363d'};
                            border-radius:10px;padding:14px;cursor:pointer;
                        background:${m.id === selectedModel ? '#1a1230' : 'transparent'};">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                    <div style="width:16px;height:16px;border-radius:50%;
                                border:2px solid ${m.id === selectedModel ? '#7c3aed' : '#30363d'};
                                background:${m.id === selectedModel ? '#7c3aed' : 'transparent'};
                                display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        ${m.id === selectedModel ? '<div style="width:6px;height:6px;border-radius:50%;background:#fff;"></div>' : ''}
                                </div>
                                <span style="font-size:14px;font-weight:500;">${m.label}</span>
                                <span style="margin-left:auto;background:${m.tagColor};color:#fff;font-size:10px;padding:2px 7px;border-radius:10px;">${m.tag}</span>
                            </div>
                            <div class='model-desc' style="font-size:12px;color:#8b949e;padding-left:24px;">${m.desc}</div>
                        </div>`).join('')}
                    </div>
                </div>`;
            // ── 模型切换：只更新存储+重绘卡片，不重新渲染整页 ──
            const renderCards = (activeModel) => {
                document.getElementById('miraModelGrid').innerHTML = models.map(m => `
                <div class="mira-model-card" data-model="${m.id}"
                    style="border:1.5px solid ${m.id === activeModel ? '#7c3aed' : '#30363d'};
                            border-radius:10px;padding:14px;cursor:pointer;
                            background:${m.id === activeModel ? '#1a1230' : 'transparent'};">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                        <div style="width:16px;height:16px;border-radius:50%;
                                    border:2px solid ${m.id === activeModel ? '#7c3aed' : '#30363d'};
                                    background:${m.id === activeModel ? '#7c3aed' : 'transparent'};
                                    display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            ${m.id === activeModel ? '<div style="width:6px;height:6px;border-radius:50%;background:#fff;"></div>' : ''}
                        </div>
                        <span style="font-size:14px;font-weight:500;">${m.label}</span>
                        <span style="margin-left:auto;background:${m.tagColor};color:#fff;font-size:10px;padding:2px 7px;border-radius:10px;">${m.tag}</span>
                    </div>
                    <div class='model-desc' style="font-size:12px;color:#8b949e;padding-left:24px;">${m.desc}</div>
                </div>`).join('');
                // 绑定模型切换
                document.getElementById('miraModelGrid').querySelectorAll('.mira-model-card').forEach(card => {
                    card.onclick = async () => {
                        currentModel = card.dataset.model;
                        // const existing = (await safeGetStorage(`data_mira_pro`))?.[`data_mira_pro`] || {};
                        // await safeSetStorage({ [`data_mira_pro`]: { ...existing, model: modelId } });
                        renderCards(currentModel);
                    };
                });
            };

            renderCards(selectedModel);

//  防止重复注册
if (window._miraStorageListener) {
    chrome.storage.onChanged.removeListener(window._miraStorageListener);
}

window._miraStorageListener = (changes, area) => {
    if (area !== 'local') return;

    if (changes.mira_user) {
        const newUser = changes.mira_user.newValue;
        if (!newUser) {
            const balanceEl = document.getElementById('miraBalance');
            if (balanceEl) balanceEl.textContent = '$0.00';

            const wrap = document.getElementById('miraUserAvatar');
            if (wrap) wrap.style.display = 'none';

            updateModalUserInfo(null);
        } else {
            showMiraAvatar(newUser);
            updateModalUserInfo(newUser);
        }
    }
};

chrome.storage.onChanged.addListener(window._miraStorageListener);
            const res = await safeSendMessage({ action: 'getUser' });
            if (res?.user) {
                showMiraAvatar(res.user);
                // 已登录，确保登录弹窗关闭
                const modal = document.getElementById('loginModal');
                const backdrop = document.getElementById('loginModalBackdrop');
                if (modal) modal.style.display = 'none';
                if (backdrop) backdrop.style.display = 'none';
            } else {
                // 未登录，隐藏头像
                const wrap = document.getElementById('miraUserAvatar');
                if (wrap) wrap.style.display = 'none';
            }

            function showMiraAvatar(user) {
                const wrap = document.getElementById('miraUserAvatar');
                const img = document.getElementById('miraAvatarImg');
                const initial = document.getElementById('miraAvatarInitial');
                const name = document.getElementById('miraUserName');
                if (!wrap) return;

                wrap.style.display = 'flex';
                if (user.photoURL) {
                    img.src = user.photoURL;
                    img.style.display = 'block';
                    initial.style.display = 'none';
                } else {
                    initial.textContent = (user.displayName || user.email || '?')[0].toUpperCase();
                    initial.style.display = 'block';
                    img.style.display = 'none';
                }
                if (name) name.textContent = user.displayName || user.email || '';
            }
            // 绑定充值按钮
            document.getElementById('miraRechargeBtn').onclick = async () => {
                const userData = await safeGetStorage(['mira_user']);
                const user = userData?.mira_user;

                if (!user) {
                    _loginTrigger = 'recharge';

                    // 未登录，重置弹窗为未登录状态
                    updateModalUserInfo(null);

                    const modal = document.getElementById('loginModal');
                    const backdrop = document.getElementById('loginModalBackdrop');
                    if (modal) {
                        const isOpen = modal.style.display === 'block';
                        modal.style.display = isOpen ? 'none' : 'block';
                        if (backdrop) backdrop.style.display = isOpen ? 'none' : 'block';
                    }
                    return;
                }

                // 已登录，打开充值页
                const btn = document.getElementById('miraRechargeBtn');
                btn.disabled = true;
                btn.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                        style="animation:spin 1s linear infinite;">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                    </svg>
                    <span>Redirecting...</span>
                `;
                safeSendMessage({ action: 'openRecharge' }).then(() => {
                    chrome.tabs.getCurrent((tab) => {
                        if (tab?.id) {
                            chrome.tabs.remove(tab.id);
                        } else {
                            window.close();
                        }
                    });
                });
            };

            // 更新弹窗内用户信息
            function updateModalUserInfo(user) {
                const userInfo = document.getElementById('modalUserInfo');
                const loginPrompt = document.getElementById('modalLoginPrompt');
                const avatarImg = document.getElementById('modalAvatarImg');
                const avatarInitial = document.getElementById('modalAvatarInitial');
                const userName = document.getElementById('modalUserName');
                const userEmail = document.getElementById('modalUserEmail');

                if (user) {
                    if (userInfo) userInfo.style.display = 'block';
                    if (loginPrompt) loginPrompt.style.display = 'none';
                    if (user.photoURL && avatarImg) {
                        avatarImg.src = user.photoURL;
                        avatarImg.style.display = 'block';
                        if (avatarInitial) avatarInitial.style.display = 'none';
                    } else if (avatarInitial) {
                        avatarInitial.textContent = (user.displayName || user.email || '?')[0].toUpperCase();
                        avatarInitial.style.display = 'block';
                        if (avatarImg) avatarImg.style.display = 'none';
                    }
                    if (userName) userName.textContent = user.displayName || '';
                    if (userEmail) userEmail.textContent = user.email || '';
                } else {
                    if (userInfo) userInfo.style.display = 'none';
                    if (loginPrompt) loginPrompt.style.display = 'block';
                }
            }

            // 登录按钮处理
            async function doLogin(provider) {
                const action = provider === 'google' ? 'googleLogin' : 'microsoftLogin';
                const btn = document.getElementById(provider === 'google' ? 'btnGoogleLogin' : 'btnMicrosoftLogin');

                // 显示loading状态
                if (btn) {
                    btn.disabled = true;
                    btn.style.opacity = '0.6';
                    btn.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" 
                        style="animation:spin 1s linear infinite;">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                    </svg>
                    ${t('loggingIn', ui_lang) || 'Logging in...'}`;
                }

                const res = await safeSendMessage({ action });

                if (btn) {
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    btn.innerHTML = provider === 'google'
                        ? `<svg width="14" height="14" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908C16.658 14.095 17.64 11.787 17.64 9.2z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"/></svg> Google `
                        : `<svg width="14" height="14" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#F25022"/><rect x="11" y="1" width="9" height="9" fill="#7FBA00"/><rect x="11" y="11" width="9" height="9" fill="#FFB900"/><rect x="1" y="11" width="9" height="9" fill="#00A4EF"/></svg> Microsoft`;
                }

                if (res?.user) {
                    showMiraAvatar(res.user);
                    updateModalUserInfo(res.user);
                    switchInstance(currentId);

                    //  登录成功，显示用户信息后自动关闭
                    if (_loginTrigger !== 'recharge') {
                        // 先显示登录成功的用户头像信息，等1.5秒后动画关闭
                        setTimeout(() => {
                            const modal = document.getElementById('loginModal');
                            const backdrop = document.getElementById('loginModalBackdrop');

                            // 同时播放淡出动画
                            if (modal) {
                                modal.style.animation = 'fadeOutScale 0.4s ease forwards';
                            }
                            if (backdrop) {
                                backdrop.style.animation = 'fadeOut 0.4s ease forwards';
                            }

                            // 动画结束后隐藏元素
                            setTimeout(() => {
                                if (modal) {
                                    modal.style.display = 'none';
                                    modal.style.animation = '';
                                }
                                if (backdrop) {
                                    backdrop.style.display = 'none';
                                    backdrop.style.animation = '';
                                }
                            }, 400);

                        }, 1500);
                    }

                    if (_loginTrigger === 'recharge') {
                        setTimeout(() => {
                            chrome.runtime.sendMessage({ action: 'openRecharge' }, () => {
                                chrome.tabs.getCurrent((tab) => {
                                    if (tab?.id) {
                                        chrome.tabs.remove(tab.id);
                                    } else {
                                        window.close();
                                    }
                                });
                            });
                        }, 300);
                    }
                } else if (res?.error && res.error !== 'USER_CANCELED') {
                    logger.error('Login error:', res.error);
                }

            }

            document.getElementById('btnGoogleLogin')?.addEventListener('click', () => doLogin('google'));
            document.getElementById('btnMicrosoftLogin')?.addEventListener('click', () => doLogin('microsoft'));

            // 点击遮罩关闭弹窗
            document.getElementById('loginModalBackdrop')?.addEventListener('click', () => {
                document.getElementById('loginModal').style.display = 'none';
                document.getElementById('loginModalBackdrop').style.display = 'none';
            });

            // 页面初始化时检查登录状态，更新弹窗头像
            const resUser = await safeSendMessage({ action: 'getUser' });
            if (resUser?.user) updateModalUserInfo(resUser.user);
            await renderAIPromptSection();
            return;
        }

        // ----  isBuiltIn 逻辑（google / bing）----
        if (tpl.isBuiltIn) {
            actions.classList.add('hidden');
            container.innerHTML = `
        <div class="main-header">
            <h2 style="margin:0">${displayAlias}</h2>
        </div>
        <div class="form-container">
            <div class="built-in-notice" style="border:1px dashed #30363d;padding:20px;border-radius:8px;margin-top:10px;">
                <div id="statusIcon" class="notice-icon" style="color:#8b949e;font-size:24px;margin-bottom:10px;">⌛</div>
                <p style="margin:0 0 15px 0;"><strong id="statusText">${displayAlias} ${t('testing', uiLanguage)}</strong></p>
                <hr style="border:0;border-top:1px solid #30363d;margin:15px 0;">
                <p style="color:#8b949e;font-size:12px;line-height:1.6;margin:0">${t('freeInterfaceTipsInfo', uiLanguage)}</p>
                <p style="color:#d1d5da;font-size:12px;margin-top:8px;">✨ ${t('wantBetterExperience', uiLanguage)} <span style="color:#f2cc60;font-size:larger;">${t('clickBottomTip', uiLanguage)}</span></p>
            </div>
            <button id="activateBuiltIn" class="btn-save" style="margin-top:25px;margin-left:155px;width:100%;display:none;">
                ${t('enableEngineNow', uiLanguage)}
            </button>
        </div>`;

            const checkConnectivity = async () => {

                if (myVersion !== switchVersion) return;
                const icon = document.getElementById('statusIcon');
                const text = document.getElementById('statusText');
                const btn = document.getElementById('activateBuiltIn');
                if (!icon || !text || !btn) return;
                let isOk = false;
                let errorMsg = '';
                try {
                    const storage = await safeGetStorage(['ui_language']).catch(() => ({}));
                    const targetLang = storage?.ui_language || 'en';
                    const isTargetEn = targetLang.toLowerCase().startsWith('en');
                    const testText = isTargetEn ? '早上好' : 'Good morning';
                    const res = await Promise.race([
                        safeSendMessage({ type: 'TRANSLATE', text: testText, targetLang, isTest: true, engine: config.engine }),
                        new Promise(resolve => setTimeout(() => resolve(null), 5000))
                    ]);
                    if (!res) { errorMsg = 'Timeout'; }
                    else if (res.error) { errorMsg = res.error; }
                    else {
                        const data = res.currentTranslationResponse;
                        if (!data || data.error) { errorMsg = data?.error || 'No response'; }
                        else {
                            const translatedText = (typeof data === 'string' ? data : (data?.translatedText || data?.basic || '')).trim();
                            isOk = translatedText.length > 0 && translatedText.toLowerCase() !== testText.toLowerCase() && !data?.isError;
                            if (!isOk) errorMsg = 'Invalid result';
                        }
                    }
                } catch (e) { errorMsg = e.message; }
                if (!document.getElementById('statusIcon')) return;
                if (isOk) {
                    icon.innerText = '✓'; icon.style.color = '#3fb950';
                    text.innerHTML = `<strong>${displayAlias}</strong> ${t('ready', uiLanguage)}`;
                    btn.style.display = 'block';
                    await safeSetStorage({ _engineAvailable: true, _engineCheckTime: Date.now() });
                } else {
                    icon.innerText = '✕'; icon.style.color = '#f85149';
                    const friendlyError = getFriendlyEngineError(config.engine, errorMsg);
                    text.innerHTML = `<strong>${displayAlias}</strong> ${t('failed', uiLanguage)}${friendlyError ? `<span style="font-size:11px;opacity:0.7;display:block;margin-top:11px;line-height:1.4;">${friendlyError}</span>` : ''}`;
                    btn.style.display = 'block'; btn.style.opacity = '0.6';
                    await safeSetStorage({ _engineAvailable: false, _engineCheckTime: Date.now() });
                }
            };

            checkConnectivity();

            const activateBtn = document.getElementById('activateBuiltIn');
            if (activateBtn) {
                activateBtn.onclick = async (e) => {
                    const btn = e.target;
                    btn.disabled = true;
                    // 直接切换并激活这个内置引擎
                    await safeSetStorage({ lastActiveId: id });
                    if (typeof syncGlobalConfig === 'function') await syncGlobalConfig(id, config.engine, {});
                    btn.innerText = t('enabled', uiLanguage);
                    btn.style.background = "#22c55e";
                    isDirty = false;
                    renderSidebar();
                    setTimeout(() => { btn.disabled = false; btn.innerText = t('enableEngineNow', uiLanguage); btn.style.background = ""; }, 1000);
                };
            }
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
        await renderAIPromptSection();
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
                    dropdown.style.overflowY = 'auto';
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

        const userConfig = userConfigs.find(c => c.id === currentId);
        if (!userConfig) {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
            return;
        }

        let testResult = false;
        try {
            // Mira Pro 特殊处理 - 实际测试翻译功能
            if (userConfig.engine === 'mira_pro') {
                const userData = await safeGetStorage(['mira_user', 'mira_user_balance']);
                const user = userData?.mira_user;
                const balanceData = userData?.mira_user_balance;


                if (!user) {
                    _loginTrigger = 'test';
                    btn.disabled = false;
                    btn.innerHTML = originalHTML;

                    const modal = document.getElementById('loginModal');
                    const backdrop = document.getElementById('loginModalBackdrop');

                    if (modal) {
                        const modalUserInfo = document.getElementById('modalUserInfo');
                        const modalLoginPrompt = document.getElementById('modalLoginPrompt');
                        const btnGoogle = document.getElementById('btnGoogleLogin');
                        const btnMicrosoft = document.getElementById('btnMicrosoftLogin');

                        if (modalUserInfo) modalUserInfo.style.display = 'none';
                        if (modalLoginPrompt) modalLoginPrompt.style.display = 'block';
                        if (btnGoogle) btnGoogle.style.display = 'flex';
                        if (btnMicrosoft) btnMicrosoft.style.display = 'flex';

                        const isOpen = modal.style.display === 'block';
                        modal.style.display = isOpen ? 'none' : 'block';
                        if (backdrop) backdrop.style.display = isOpen ? 'none' : 'block';
                    }
                    return;
                }

                let hasBalance = false;
                if (balanceData?.balance !== undefined && balanceData.balance > 0) {
                    hasBalance = true;
                } else if (!balanceData) {
                    // 尝试从后端获取余额
                    const response = await new Promise((resolve) => {
                        safeSendMessage({ action: 'getBalance', uid: user.uid }, resolve);
                    });
                    hasBalance = response?.balance && response.balance > 0;
                }

                if (!hasBalance) {
                    throw new Error('No balance / 余额不足');
                }

                // 第二步：实际测试翻译功能
                const storage = await safeGetStorage(['ui_language']).catch(() => ({}));
                const testTargetLang = storage?.ui_language || window.currentConfig?.ui_language || getBrowserLang() || 'en';
                const isTargetEn = testTargetLang.toLowerCase().startsWith('en');
                const testText = isTargetEn ? '早上好' : 'Good morning';

                logger.log("Testing Mira Pro: ", "text:", testText, "targetLang: ", testTargetLang);

                const res = await safeSendMessage({
                    type: 'TRANSLATE',
                    text: testText,
                    targetLang: testTargetLang,
                    isTest: true,
                    engine: 'mira_pro'
                });

                if (!res) throw new Error('No response from Mira Pro');
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
                    testResult = true;
                } else {
                    throw new Error(translatedText.length === 0 ? "Empty Content from Mira Pro" : "Mira Pro returned original text");
                }
            } else {
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
                    btn.innerHTML = `<span style="color: #3fb950; font-size: 20px; margin-right: 8px;">✓</span><span> ${i18n.success}</span>`;
                    btn.style.setProperty('border-color', '#10a37f', 'important');
                    testResult = true;
                } else {
                    throw new Error(translatedText.length === 0 ? "Empty Content" : "Same as Original");
                }
            }
        } catch (e) {
            // Mira Pro 的特殊错误处理
            if (userConfig && userConfig.engine === 'mira_pro' && e.message.includes('connection check passed')) {
                // 这是成功的情况，不需要显示错误
                btn.disabled = false;
                btn.innerHTML = originalHTML;
                btn.style.removeProperty('border-color');
                return;
            }

            logger.error("[Test] Failed:", e);
            btn.innerHTML = `<span>❌ ${i18n.failed}</span>`;
            btn.style.setProperty('border-color', '#f87171', 'important');
            btn.style.userSelect = 'text';
            testResult = false;

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
                    const isLocalModel = (((userConfig && userConfig.engine !== 'mira_pro') ? (document.querySelector('[data-key="baseUrl"]')?.value || '') : '').includes('localhost') ||
                        (document.querySelector('[data-key="baseUrl"]')?.value || '').includes('127.0.0.1'));
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
                // 测试完成后更新sidebar状态点和当前引擎激活状态
                if (userConfig && testResult) {
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
        }
    };

    document.getElementById('saveApiConfig').onclick = async () => {
        const saveBtn = document.getElementById('saveApiConfig');
        if (!saveBtn) return;
        const uiLanguage = window.currentConfig?.ui_language || getBrowserLang() || 'en';
        const config = userConfigs.find(c => c.id === currentId);
        if (!config) {
            logger.error("[Mira] 找不到当前配置实例");
            return;
        }

        saveBtn.disabled = true;
        const originalText = saveBtn.innerText;
        const originalBg = saveBtn.style.backgroundColor;
        try {
            // Mira Pro 特殊处理 - 保存后触发测试
            if (config.engine === 'mira_pro') {
                const userData = await safeGetStorage(['mira_user']);
                const user = userData?.mira_user;

                if (!user) {
                    _loginTrigger = 'save';
                    saveBtn.disabled = false;
                    // 未登录，显示登录弹窗
                    const modal = document.getElementById('loginModal');
                    const backdrop = document.getElementById('loginModalBackdrop');
                    if (modal) {
                        const isOpen = modal.style.display === 'block';
                        modal.style.display = isOpen ? 'none' : 'block';
                        if (backdrop) backdrop.style.display = isOpen ? 'none' : 'block';
                    }
                    return;
                }

                await safeSetStorage({ lastActiveId: currentId });
                const existing = (await safeGetStorage(`data_mira_pro`))?.[`data_mira_pro`] || {};
                await safeSetStorage({ [`data_mira_pro`]: { ...existing, model: currentModel } });

                if (typeof syncGlobalConfig === 'function') {
                    await syncGlobalConfig(currentId, config.engine, {});
                }

                logger.log("Mira Pro 配置已保存，准备测试: ", uiLanguage);

                // 显示保存成功提示（固定时间，只显示消息）
                saveBtn.innerText = `${t('save', uiLanguage)}${t('success', uiLanguage)}`;
                saveBtn.style.setProperty('background-color', '#22c55e', 'important');

                // 延迟后触发测试，这样用户能看到保存成功的提示
                setTimeout(() => {
                    if (saveBtn) {
                        saveBtn.innerText = originalText;
                        saveBtn.style.removeProperty('background-color');
                        saveBtn.style.backgroundColor = originalBg;
                        saveBtn.disabled = false;
                    }
                    // 触发测试连接
                    const testBtn = document.getElementById('testApiConfig');
                    if (testBtn) {
                        testBtn.click();
                    }
                }, 1500);
                return;
            }

            // 其他自定义引擎的处理逻辑 - 先保存配置
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

            logger.log("配置已保存，准备测试: ", uiLanguage);

            // 现在触发自动测试连接
            const testBtn = document.getElementById('testApiConfig');
            if (testBtn) {
                // 触发测试连接的点击事件
                testBtn.click();
            }

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
}

function _buildAIPromptHTML(saved) {
    const webVal = saved.web || '';
    const subVal = saved.subtitle || '';

    return `
        <div class="ai-prompt-header" id="ai-prompt-toggle">
            <div class="ai-prompt-header-left">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                <span class="ai-prompt-title">${t('cpTitle')}</span>
                <span class="ai-prompt-badge">${t('cpOptional')}</span>
            </div>
            <svg class="ai-prompt-chevron ${webVal || subVal ? 'open' : ''}"
                 id="ai-prompt-chevron"
                 viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
            </svg>
        </div>

        <div class="ai-prompt-body ${webVal || subVal ? 'open' : ''}" id="ai-prompt-body">

            <div class="ai-prompt-item">
                <div class="ai-prompt-item-header">
                    <div class="ai-prompt-item-label">
                        🌐 <span>${t('cpWeb')}</span>
                    </div>
                    <button class="ai-prompt-clear-btn ${webVal ? 'visible' : ''}"
                            data-target="ai-prompt-web">${t('cpClear')}</button>
                </div>
                <textarea
                    id="ai-prompt-web"
                    class="ai-prompt-textarea"
                    maxlength="150"
                    placeholder="${t('cpWebPH')}"
                    spellcheck="false"
                >${_escapeHtml(webVal)}</textarea>
                <div class="ai-prompt-char-count" id="ai-prompt-web-count">${webVal.length} / 150</div>
                <div class="ai-prompt-style-hint">${t('cpHint')}</div>
            </div>

            <div class="ai-prompt-item">
                <div class="ai-prompt-item-header">
                    <div class="ai-prompt-item-label">
                        🎬 <span>${t('cpSub')}</span>
                    </div>
                    <button class="ai-prompt-clear-btn ${subVal ? 'visible' : ''}"
                            data-target="ai-prompt-subtitle">${t('cpClear')}</button>
                </div>
                <textarea
                    id="ai-prompt-subtitle"
                    class="ai-prompt-textarea"
                    maxlength="150"
                    placeholder="${t('cpSubPH')}"
                    spellcheck="false"
                >${_escapeHtml(subVal)}</textarea>
                <div class="ai-prompt-char-count" id="ai-prompt-subtitle-count">${subVal.length} / 150</div>
                <div class="ai-prompt-style-hint">${t('cpHint')}</div>
            </div>

            <div class="ai-prompt-footer">
                <button class="ai-prompt-save-btn" id="ai-prompt-save-btn" disabled>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2.5"
                         stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                        <polyline points="17 21 17 13 7 13 7 21"/>
                        <polyline points="7 3 7 8 15 8"/>
                    </svg>
                    ${t('cpSave')}
                </button>
            </div>
        </div>
    `;
}

function _bindAIPromptEvents(section, initialSaved) {
    const toggle = section.querySelector('#ai-prompt-toggle');
    const body = section.querySelector('#ai-prompt-body');
    const chevron = section.querySelector('#ai-prompt-chevron');
    const saveBtn = section.querySelector('#ai-prompt-save-btn');
    const webTA = section.querySelector('#ai-prompt-web');
    const subTA = section.querySelector('#ai-prompt-subtitle');
    const webCount = section.querySelector('#ai-prompt-web-count');
    const subCount = section.querySelector('#ai-prompt-subtitle-count');

    let isDirty = false;
    let saveTimer = null;
 
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
    function markDirty() {
        if (!isDirty) {
            isDirty = true;
            saveBtn.disabled = false;
            _setPromptBtnState(saveBtn, 'idle');
        }
    }

    webTA.addEventListener('input', () => {
        updateCount(webTA, webCount);
        section.querySelector('[data-target="ai-prompt-web"]')
            .classList.toggle('visible', webTA.value.length > 0);
        markDirty();
    });

    subTA.addEventListener('input', () => {
        updateCount(subTA, subCount);
        section.querySelector('[data-target="ai-prompt-subtitle"]')
            .classList.toggle('visible', subTA.value.length > 0);
        markDirty();
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
            markDirty();
        });
    });

    // ── 保存 ───
    saveBtn.addEventListener('click', async () => {
        if (!isDirty || saveBtn.disabled) return;

        _setPromptBtnState(saveBtn, 'saving');

        try {
            await safeSetStorage({
                [AI_PROMPT_KEY]: {
                    web: webTA.value.trim(),
                    subtitle: subTA.value.trim(),
                }
            });

            isDirty = false;
            _setPromptBtnState(saveBtn, 'saved');

            // 2s 后恢复，但 disable（无变化不可再按）
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                _setPromptBtnState(saveBtn, 'idle');
                saveBtn.disabled = true;
            }, 2000);

        } catch (e) {
            _setPromptBtnState(saveBtn, 'error');
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                _setPromptBtnState(saveBtn, 'idle');
                saveBtn.disabled = false; // 出错可重试
            }, 2000);
        }
    });
}

// ── 按钮状态切换 ──── 
function _setPromptBtnState(btn, state) {
    btn.classList.remove('state-saving', 'state-saved', 'state-error');
    const icons = {
        idle: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save`,
        saving: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Saving...`,
        saved: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Saved`,
        error: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Failed`,
    };
    if (state !== 'idle') btn.classList.add(`state-${state}`);
    btn.innerHTML = icons[state] || icons.idle;
    btn.disabled = (state === 'saving');
}

// ── HTML 转义（防止 saved prompt 里有 < > 破坏 innerHTML）──
function _escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
