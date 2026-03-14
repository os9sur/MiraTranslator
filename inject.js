window.browser = (function () {
    return window.msBrowser || window.browser || window.chrome;
})();
(function () {
    logger.log("KT-Translator: 网络拦截模块启动");
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    const retryHistory = new Set();
    XMLHttpRequest.prototype.open = function (method, url) {
        if (url && (url.includes('youtube.com/api/timedtext') || url.includes('&fmt=json3'))) {
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
    }
    setTimeout(pokePlayer, 3000);
})();