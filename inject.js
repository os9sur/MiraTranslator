/**
 * Mira Translator
 * Copyright (C) 2026 David Bai
 * Licensed under a custom Source-Available License.
 * Unauthorized modification, redistribution, or rebranding is
 * prohibited. See LICENSE file or:
 * https://github.com/os9sur/MiraTranslator/blob/main/LICENSE
 * Contact: mira.studio@proton.me
 */

window.browser = (function () {
    return window.msBrowser || window.browser || window.chrome;
})();

(function () {
    logger.log("KT-Translator: 网络拦截模块启动 (支持移动端 Fetch)");

    let subtitleFetchSuccess = false;
    const retryHistory = new Set();
 
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const url = args[0];
        if (typeof url === 'string' && (
            url.includes('youtube.com/api/timedtext') ||
            url.includes('&fmt=json3') ||
            url.includes('pc=yt') ||
            url.includes('/timedtext?')
        )) {
            try {
                const response = await originalFetch.apply(this, args);
                const cloneRes = response.clone();
                cloneRes.json().then(data => {
                    if (data && data.events) {
                        const cleanSubs = data.events
                            .filter(ev => ev.segs)
                            .map(ev => ({
                                start: ev.tStartMs / 1000,
                                end: (ev.tStartMs + (ev.dDurationMs || 3000)) / 1000,
                                text: ev.segs.map(s => s.utf8).join('').replace(/\n/g, ' ').trim()
                            }))
                            .filter(s => s.text.length > 0);

                        if (cleanSubs.length > 0) {
                            subtitleFetchSuccess = true;
                            window.dispatchEvent(new CustomEvent('KT_DATA_READY', { detail: cleanSubs }));

                            const urlLang = (() => {
                                try {
                                    const u = new URL(url, location.href);
                                    return u.searchParams.get('lang') || u.searchParams.get('tlang') || null;
                                } catch { return null; }
                            })();
                            if (urlLang) {
                                window.dispatchEvent(new CustomEvent('KT_SOURCE_LANG_READY', {
                                    detail: { lang: urlLang.split('-')[0].toLowerCase() }
                                }));
                                logger.log('[KT] Fetch 源语言:', urlLang);
                            }
                        }
                    }
                }).catch(e => logger.warn("KT: Fetch拦截数据解析失败", e.message));
                
                return response;
            } catch (err) {
                return originalFetch.apply(this, args);
            }
        }
        return originalFetch.apply(this, args);
    };
 
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function (method, url) {
        if (url && (
            url.includes('youtube.com/api/timedtext') ||
            url.includes('&fmt=json3') ||
            url.includes('pc=yt') ||
            url.includes('/timedtext?')
        )) {
            this._ktUrl = url;
            this.addEventListener('load', function () {
                if (this.status !== 200 || !this.responseText || this.responseText.trim() === "") {
                    handleRetry(this._ktUrl, "响应为空或状态码非200");
                    return;
                }
                try {
                    const data = JSON.parse(this.responseText);
                    if (data && data.events) {
                        const cleanSubs = data.events
                            .filter(ev => ev.segs)
                            .map(ev => ({
                                start: ev.tStartMs / 1000,
                                end: (ev.tStartMs + (ev.dDurationMs || 3000)) / 1000,
                                text: ev.segs.map(s => s.utf8).join('').replace(/\n/g, ' ').trim()
                            }))
                            .filter(s => s.text.length > 0);

                        subtitleFetchSuccess = true;
                        window.dispatchEvent(new CustomEvent('KT_DATA_READY', { detail: cleanSubs }));

                        const urlLang = (() => {
                            try {
                                const u = new URL(this._ktUrl, location.href);
                                return u.searchParams.get('lang') || u.searchParams.get('tlang') || null;
                            } catch { return null; }
                        })();
                        if (urlLang) {
                            window.dispatchEvent(new CustomEvent('KT_SOURCE_LANG_READY', {
                                detail: { lang: urlLang.split('-')[0].toLowerCase() }
                            }));
                            logger.log('[KT] XHR 源语言:', urlLang);
                        }

                        retryHistory.delete(url);
                    } else {
                        handleRetry(this._ktUrl, "JSON有效但无字幕数据");
                    }
                } catch (e) {
                    logger.warn("KT: 解析拦截数据失败:", e.message);
                    handleRetry(this._ktUrl, "JSON解析异常");
                }
            });
        }
        return originalOpen.apply(this, arguments);
    };

    function handleRetry(url, reason) {
        if (url.includes('&kt_retry=1') || retryHistory.has(url)) {
            logger.log(`KT: 重试也失败或已达上限，放弃。原因: ${reason}`);
            return;
        }
        logger.log(`KT: 字幕获取异常 (${reason})，1秒后尝试自动重新获取...`);
        retryHistory.add(url);
        setTimeout(() => {
            try {
                const retryUrl = url + "&kt_retry=1";
                const xhr = new XMLHttpRequest();
                xhr.open("GET", retryUrl);
                xhr.setRequestHeader('X-YouTube-Client-Name', '1');
                xhr.setRequestHeader('X-YouTube-Client-Version', '2.20210721.00.00');
                xhr.send();
            } catch (err) {
                logger.error("KT: 重试请求发送失败", err);
            }
        }, 1000);
    }
 
    async function fetchManualCaptions(retryCount = 0) {
        if (subtitleFetchSuccess) return; 
        try {
            const playerResponse = window.ytInitialPlayerResponse ||
                JSON.parse(document.getElementById('scriptTag')?.textContent || 'null');

            if (!playerResponse) {
                if (retryCount < 5) setTimeout(() => fetchManualCaptions(retryCount + 1), 2000);
                return;
            }

            const captionTracks = playerResponse
                ?.captions
                ?.playerCaptionsTracklistRenderer
                ?.captionTracks;

            if (!captionTracks || captionTracks.length === 0) {
                if (retryCount < 5) setTimeout(() => fetchManualCaptions(retryCount + 1), 2000);
                return;
            }

            const track = captionTracks.find(t => t.kind !== 'asr') || captionTracks[0];
            if (!track?.baseUrl) return;

            const url = track.baseUrl + '&fmt=json3';
            const res = await fetch(url);
            const data = await res.json();

            if (data?.events) {
                const cleanSubs = data.events
                    .filter(ev => ev.segs)
                    .map(ev => ({
                        start: ev.tStartMs / 1000,
                        end: (ev.tStartMs + (ev.dDurationMs || 3000)) / 1000,
                        text: ev.segs.map(s => s.utf8).join('').replace(/\n/g, ' ').trim()
                    }))
                    .filter(s => s.text.length > 0);

                if (cleanSubs.length > 0) {
                    subtitleFetchSuccess = true; 
                    logger.log('[KT] 主动获取字幕成功:', cleanSubs.length, '条');
                    window.dispatchEvent(new CustomEvent('KT_DATA_READY', { detail: cleanSubs }));
                    const sourceLang = captionTracks[0]?.languageCode?.split('-')[0].toLowerCase();
                    if (sourceLang) {
                        window.dispatchEvent(new CustomEvent('KT_SOURCE_LANG_READY', { detail: { lang: sourceLang } }));
                    }
                } else {
                    if (retryCount < 5) setTimeout(() => fetchManualCaptions(retryCount + 1), 2000);
                }
            }
        } catch (e) {
            logger.warn('[KT] 主动获取字幕失败:', e.message);
            if (retryCount < 3) {
                const delay = 1500 * (retryCount + 1); 
                setTimeout(() => fetchManualCaptions(retryCount + 1), delay);
            } else {
                const hintEl = document.getElementById("kt-loading-hint");
                if (hintEl) {
                    hintEl.innerText = "Subtitles unavailable";
                    setTimeout(() => hintEl?.remove(), 3000);
                }
            }
        }
    }

    function initUltimateObserver() {
        window.addEventListener('popstate', () => {
            logger.log("[KT] 侦测到 popstate 路由变化");
            triggerRefetch();
        });

        const originalPushState = history.pushState;
        history.pushState = function () {
            originalPushState.apply(this, arguments);
            logger.log("[KT] 侦测到 pushState 路由变化");
            triggerRefetch();
        };

        const originalReplaceState = history.replaceState;
        history.replaceState = function () {
            originalReplaceState.apply(this, arguments);
            logger.log("[KT] 侦测到 replaceState 路由变化");
            triggerRefetch();
        };
        
        window.addEventListener('yt-navigate-finish', () => {
            logger.log("[KT] 侦测到 YouTube 官方 navigate 事件");
            triggerRefetch();
        });
    }

    let refetchTimer = null;
    function triggerRefetch() {
        subtitleFetchSuccess = false;
        if (refetchTimer) clearTimeout(refetchTimer);
        refetchTimer = setTimeout(fetchManualCaptions, 2000);
    }

    setTimeout(() => {
        logger.log("KT-Translator: 初始执行 fetchManualCaptions");
        fetchManualCaptions();
    }, 2500);

    initUltimateObserver();
})();