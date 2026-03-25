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
                        window.dispatchEvent(new CustomEvent('KT_DATA_READY', { detail: cleanSubs }));
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
    // 从 ytInitialPlayerResponse 直接读字幕列表，主动请求
    async function fetchManualCaptions() {
        try {
            const playerResponse = window.ytInitialPlayerResponse ||
                JSON.parse(document.getElementById('scriptTag')?.textContent || 'null');

            if (!playerResponse) return;

            const captionTracks = playerResponse
                ?.captions
                ?.playerCaptionsTracklistRenderer
                ?.captionTracks;

            if (!captionTracks || captionTracks.length === 0) return;

            logger.log('[KT] 发现字幕轨道:', captionTracks.map(t => t.languageCode));

            // 优先选英文，其次第一条
            const track = captionTracks.find(t => t.languageCode === 'en')
                || captionTracks.find(t => t.kind !== 'asr')  // 非自动生成优先
                || captionTracks[0];

            if (!track?.baseUrl) return;

            // 转成 json3 格式请求
            const url = track.baseUrl + '&fmt=json3';
            logger.log('[KT] 主动请求字幕:', url);

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
                    logger.log('[KT] 主动获取字幕成功:', cleanSubs.length, '条');
                    window.dispatchEvent(new CustomEvent('KT_DATA_READY', { detail: cleanSubs }));
                }
            }
        } catch (e) {
            logger.warn('[KT] 主动获取字幕失败:', e.message);
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

    setTimeout(pokePlayer, 3000);  // 3秒重试

    // URL变化时（切换视频）重新触发
    function initUrlObserver() {
        if (!document.body) {
            setTimeout(initUrlObserver, 500);
            return;
        }
        let lastUrl = location.href;
        new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                setTimeout(fetchManualCaptions, 2000);
            }
        }).observe(document.body, { childList: true, subtree: true });
    }

    initUrlObserver();
})();