/**
 * Mira Translator
 * Copyright (C) 2026 David Bai 
 * License: AGPL-3.0 (https://github.com/os9sur)
 * Contact: mira.studio@proton.me
 */

window.browser = (function () {
    return window.msBrowser || window.browser || window.chrome;
})();
(function () {
    logger.log("KT-Translator: 网络拦截模块启动");
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    const retryHistory = new Set();
    XMLHttpRequest.prototype.open = function (method, url) {
        if (url && (
            url.includes('youtube.com/api/timedtext') ||
            url.includes('&fmt=json3') ||
            url.includes('pc=yt') ||          // 人工字幕
            url.includes('/timedtext?')        //  另一种格式
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
    let subtitleFetchSuccess = false;

    async function fetchManualCaptions(retryCount = 0) {
        if (subtitleFetchSuccess) return; //  成功过就不再重试
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
                    subtitleFetchSuccess = true; // ← 成功，后续不再重试
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
                const delay = 1500 * (retryCount + 1); // 1.5s, 3s, 4.5s，总共9秒
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
    // 扩展 pokePlayer，同时触发主动获取
    function pokePlayer() {
        const player = document.querySelector('.html5-video-player');
        if (player && player.loadModule) {
            try {
                player.loadModule("captions");
                const tracklist = player.getOption && player.getOption('captions', 'tracklist');
                if (tracklist && tracklist.length > 0) {
                    player.setOption('captions', 'track', tracklist[0]);
                }
            } catch (e) { }
        }
        // 同时尝试主动获取
        fetchManualCaptions();
    }


    function initCCButtonObserver() {
        const player = document.querySelector('.html5-video-player');
        if (!player) {
            setTimeout(initCCButtonObserver, 1000);
            return;
        }
        player.addEventListener('click', (e) => {
            const ccBtn = e.target.closest('.ytp-subtitles-button');
            if (!ccBtn) return;
            setTimeout(() => {
                const isOn = ccBtn.getAttribute('aria-pressed') === 'true';
                if (isOn) fetchManualCaptions();
            }, 500);
        });
    }

    function initUrlObserver() {
        if (!document.body) {
            setTimeout(initUrlObserver, 500);
            return;
        }
        let lastUrl = location.href;
        new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                subtitleFetchSuccess = false;
                setTimeout(fetchManualCaptions, 2000);
            }
        }).observe(document.body, { childList: true, subtree: true });
    }

    setTimeout(() => {
        pokePlayer();
        initCCButtonObserver();
    }, 3000);

    initUrlObserver();
})();