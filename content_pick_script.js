window.browser = (function () {
    return window.msBrowser || window.browser || window.chrome;
})();
(function () {
    let isInspecting = false;
    let hoverOverlay = null;
    let lastHoveredElement = null;
    function createOverlay() {
        if (hoverOverlay) return;
        hoverOverlay = document.createElement('div');
        hoverOverlay.id = "translate-helper-overlay";
        hoverOverlay.style.cssText = `
            position: fixed !important; 
            pointer-events: none !important; 
            border: 2px solid #38bdf8 !important; 
            background: rgba(56, 189, 248, 0.2) !important; 
            z-index: 2147483647 !important; 
            display: none; 
            border-radius: 4px !important;
            box-sizing: border-box !important;
            transition: top 0.1s, left 0.1s, width 0.1s, height 0.1s;
            box-shadow: 0 0 12px rgba(56, 189, 248, 0.6) !important;
        `;
        document.body.appendChild(hoverOverlay);
    }
    function syncOverlayPosition() {
        if (!isInspecting || !lastHoveredElement || !hoverOverlay) return;
        const rect = lastHoveredElement.getBoundingClientRect();
        hoverOverlay.style.top = rect.top + "px";
        hoverOverlay.style.left = rect.left + "px";
        hoverOverlay.style.width = rect.width + "px";
        hoverOverlay.style.height = rect.height + "px";
    }
    window.startInspector = function () {
        logger.log("拾取器激活...");
        isInspecting = true;
        createOverlay();
        hoverOverlay.style.display = "block";
        hoverOverlay.style.borderColor = "#38bdf8";
        document.body.style.cursor = "crosshair";
        window.addEventListener('scroll', syncOverlayPosition, { passive: true });
    };
    function stopInspecting() {
        isInspecting = false;
        if (hoverOverlay) hoverOverlay.style.display = "none";
        document.body.style.cursor = "default";
        window.removeEventListener('scroll', syncOverlayPosition);
        lastHoveredElement = null;
    }
    const cancelHandler = (e) => {
        if (!isInspecting) return;
        if (e.type === 'keydown' && e.key !== "Escape") return;
        if (e.type === 'contextmenu') {
            e.preventDefault();
        }
        logger.log("用户取消了拾取器");
        stopInspecting();
    };
    document.addEventListener('keydown', cancelHandler);
    document.addEventListener('contextmenu', cancelHandler);
    document.addEventListener('mouseover', (e) => {
        if (!isInspecting || !hoverOverlay) return;
        const target = e.composedPath ? e.composedPath()[0] : e.target;
        if (target.id === "translate-helper-overlay") return;
        lastHoveredElement = target;
        syncOverlayPosition();
    }, true);
    document.addEventListener('click', async (e) => {
        if (!isInspecting) return;
        e.preventDefault();
        e.stopPropagation();
        let el = e.composedPath ? e.composedPath()[0] : e.target;
        if (el.tagName === 'DIV' && el.innerText.trim().length > 0) {
            const spans = el.querySelectorAll('span');
            if (spans.length === 1) el = spans[0];
        }
        let selector = "";
        const rootNode = el.getRootNode();
        const shadowHost = rootNode instanceof ShadowRoot ? rootNode.host : null;
        const testIdEl = (typeof el.closest === 'function' ? el.closest('[data-testid]') : null) ||
            (shadowHost && typeof shadowHost.closest === 'function' ? shadowHost.closest('[data-testid]') : null);
        if (testIdEl) {
            const tid = testIdEl.getAttribute('data-testid');
            selector = `${testIdEl.tagName.toLowerCase()}[data-testid="${tid}"] ${el.tagName.toLowerCase()}`;
        } else if (el.id) {
            selector = `#${el.id}`;
        } else {
            const tagName = el.tagName.toLowerCase();
            const classList = Array.from(el.classList || []).filter(c => typeof c === 'string').slice(0, 2);
            selector = classList.length > 0 ? `${tagName}.${classList.join('.')}` : tagName;
        }
        const domain = location.hostname.replace('www.', '');
        try {
            const data = await safeGetStorage(['scanConfig', 'siteSettings']);
            if (!data) {
                if (typeof stopInspecting === 'function') stopInspecting();
                return;
            }
            const scanConfig = data.scanConfig || {
                global: { selectors: SiteRules.generic.selectors, minLen: SiteRules.generic.minLen },
                custom: {}
            };
            if (!scanConfig.custom) scanConfig.custom = {};
            const presetRule = SiteRules.getRule(location.hostname);
            let baseSelectors = (scanConfig.custom[domain]?.selectors) ||
                (presetRule.selectors) ||
                (scanConfig.global?.selectors) || "p";
            let oldArray = baseSelectors.split(',').map(s => s.trim()).filter(Boolean);
            let finalSelectors = [...new Set([...oldArray, selector])].join(', ');
            scanConfig.custom[domain] = {
                selectors: finalSelectors,
                minLen: scanConfig.custom[domain]?.minLen || presetRule.minLen || 0
            };
            let ss = data.siteSettings || {};
            if (!ss[domain]) {
                ss[domain] = { page: true };
            } else {
                ss[domain].page = true;
            }
            if (chrome.runtime?.id) {
                await chrome.storage.local.set({
                    scanConfig,
                    siteSettings: ss
                });
            } else {
                showUpdateNotice();
                if (typeof stopInspecting === 'function') stopInspecting();
                return;
            }
            document.dispatchEvent(new CustomEvent('MIRA_INTERNAL_RESCAN', {
                detail: { selectors: finalSelectors }
            }));
            document.dispatchEvent(new CustomEvent('KT_CONFIG_UPDATED', {
                detail: { selectors: finalSelectors }
            }));
            if (typeof hoverOverlay !== 'undefined') {
                hoverOverlay.style.borderColor = "#22c55e";
                hoverOverlay.style.background = "rgba(34, 197, 94, 0.3)";
            }
            if (typeof stopInspecting === 'function') {
                setTimeout(stopInspecting, 300);
            }
        } catch (error) {
            if (error.message?.includes("context invalidated")) {
                showUpdateNotice();
            } else {
                logger.error("保存选择器失败:", error);
            }
            if (typeof stopInspecting === 'function') {
                stopInspecting();
            }
        }
    }, true);
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (!chrome.runtime || !chrome.runtime.id) {
            if (typeof showUpdateNotice === 'function') showUpdateNotice();
            return false;
        }
        try {
            if (msg.action === "START_INSPECT") {
                if (typeof window.startInspector === 'function') {
                    window.startInspector();
                    sendResponse({ status: "started" });
                } else {
                    logger.warn("[Mira] startInspector is not defined. Script might be corrupted.");
                    if (typeof showUpdateNotice === 'function') showUpdateNotice();
                    sendResponse({ status: "error", message: "script_corrupted" });
                }
                return false;
            }
        } catch (e) {
            logger.error("[Mira] Message listener error:", e);
            if (e.message.includes("context invalidated") && typeof showUpdateNotice === 'function') {
                showUpdateNotice();
            }
            sendResponse({ status: "error", message: e.message });
        }
        return false;
    });
})();