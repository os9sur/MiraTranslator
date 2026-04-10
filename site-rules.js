const SiteRules = {
    defaults: {
        "x.com": {
            selectors: "p, [data-testid='tweetText'], [data-testid='trend'] div[dir='ltr'][style*='line-clamp'] > span, [data-testid='trend'] div[dir='ltr']:not([style*='line-clamp']):not([style*='color: rgb(113']) > span, div[data-testid='UserDescription'] span, [data-testid^='news_sidebar_article'] div[dir='ltr']:first-of-type span, [data-testid='primaryColumn'] div[dir='auto'] > span, [data-testid='primaryColumn'] div.r-knv0ih div[dir='ltr'] > span, [data-testid='placementTracking'] button div[style*='line-clamp: 2'] > span",
            minLen: 3
        },
        "facebook.com": {
            selectors: "div[dir='auto']:not([role='button']):not([role='tab']):not([role='article']), span[dir='auto']:not([role='button']):not([role='tab']), h2[dir='auto'], h3[dir='auto'], h4[dir='auto']",
            minLen: 3
        },
        "grok.com": {
            selectors: "h1, h2, h3, h4, p, li, [class*='message'] p, [class*='response'] p, [class*='answer'] p",
            minLen: 10
        },
        "youtube.com": {
            selectors: "p:not(ytd-active-account-header-renderer *), #content-text:not(ytd-active-account-header-renderer *), #video-title:not(ytd-active-account-header-renderer *), .yt-lockup-metadata-view-model__title:not(ytd-active-account-header-renderer *), .yt-core-attributed-string:not(button *):not([role='button'] *):not(ytd-active-account-header-renderer *):not(yt-content-metadata-view-model *):not(.yt-spec-button-shape-next *), yt-formatted-string:not(#info):not(#title):not(button *):not(ytd-active-account-header-renderer *):not(ytd-metadata-line-renderer *)",
            minLen: 10
        },
        "news.ycombinator.com": {
            selectors: "p, li, td.title, div.commtext.c00",
            minLen: 3
        },
        "amazon.com": {
            selectors: [
                "p",
                "#productTitle",
                "div[data-testid='overall-summary'] span",
                "#featurebullets_feature_div .a-list-item",
                "[data-hook='review-collapsed'] > span",
                "span.review-text-content > span",
                "[class*='line-clamp-4']",
                "[class*='line-clamp-6']",
                ".p13n-sc-uncoverable-faceout a.aok-block span:not([class])",
                "li.p13n-intuition-product-grid__grid-item span.a-size-base-plus",
                "[class*='prodInfo'] span.a-size-base-plus:not([class*='brand'])",
                "[class*='twoAsinsProductDetail'] span.a-size-base-plus:not([class*='brand'])",
                "span.inline-twister-dim-title-value",
                ".prodDetTable td",
                "span.a-size-base.a-text-bold",
                "h3.a-size-medium.a-color-base",
            ].join(", "),
            minLen: 8
        },
        "wikipedia.org": {
            selectors: "#content h1, #mw-content-text p, #mw-content-text h2, #mw-content-text h3, #mw-content-text li:not(:has(.autonym)), #mw-content-text figcaption,.thumbcaption",
            minLen: 3
        },
        "msn.com": {
            selectors: "p, h1.viewsHeaderText, span.image-caption",
            minLen: 3
        },
        "github.com": {
            selectors: [
                ".markdown-body p",
                ".markdown-body li",
                ".comment-body p",
                ".comment-body li",
                "bdi.markdown-title",
                "[data-component='PH_Title'] span.markdown-title",
                ".tmp-pr-3 a.markdown-title",
                "a[class*='IssuePullRequestTitle']",
                "p.f4.tmp-my-3",
                "section[aria-label*='repository body'] .pt-2 > div:not([class])"
            ].join(", "),
            minLen: 3
        },
        "stackoverflow.com": {
            selectors: ".s-prose p, .s-prose li, .question-hyperlink",
            minLen: 5
        },
        "reddit.com": {
            selectors: "shreddit-post p, [id^='post-title'], shreddit-comment div[id$='-post-rtjson-content'] > p, .comment p, #comment-tree .md p",
            minLen: 3
        },
        "google.com": {
            selectors: "h3, .VwiC3b > span, .VwiC3b:not(:has(> span)), .hgKElc, .LGOj9e span",
            minLen: 3
        },
        "quora.com": {
            selectors: ".puppeteer_test_question_title, .q-text p, .q-text li, [class*='RelatedQuestions'] a span, .related_questions a span, .qu-display--block.qu-cursor--pointer span",
            minLen: 4
        },
        "medium.com": {
            selectors: "article p, article h1, article h2, .pw-post-body-paragraph",
            minLen: 5
        },
        "discord.com": {
            selectors: "[class^='messageContent']",
            minLen: 2
        },
        "producthunt.com": {
            selectors: "[class*='styles_title__'], [class*='styles_description__'], [class*='comment_body__']",
            minLen: 3
        },
        "dev.to": {
            selectors: "#article-body p, #article-body li, .crayons-article__title",
            minLen: 3
        },
        "threads.com": {
            selectors: [
                "div[data-pressable-container='true'] span[dir='auto']",
                "div[data-testid='userInfoBio'] span",
                "article span[dir='auto']",
            ].join(", "),
            minLen: 3
        },
        "claude.com": {
            selectors: "h1, h2, h3, h4, p, [data-as='p'], [data-as='li'], li, td",
            minLen: 10
        },
        "foxnews.com": {
            selectors: "h1:not(.branding h1), h2, h3:not(a h3):not(:has(button)), h4:not(a h4):not(.content h4):not(.more-section-item-title), p, .headline, .dek, article p, .related-item a",
            minLen: 15
        },
        "reuters.com": {
            selectors: "h1, h2, h3, p, span[data-testid='TitleHeading'], [class*='nav-dropdown'] li, article li",
            minLen: 10
        }, 
        "instagram.com": {
            selectors: [
                // 标题元素(带dir="auto"的所有标题)- 覆盖评论区的h1
                "h1[dir='auto']",
                "h2[dir='auto']",
                "h3[dir='auto']",
                "h4[dir='auto']",

                // 主要文本容器 - 带dir="auto"的span(首页消息流主要文本)
                "span[dir='auto']:not([role='button']):not([role='tab']):not([aria-label*='likes']):not([aria-label*='comments'])",

                // 特定类名的元素
                "span[class*='_ap3a'][dir='auto']",
                "span[class*='_a9zr']",
                "span[class*='_aacu']",
                "div[class*='_a9zs'] span",

                // 帖子内容
                "article span[role='menuitem']:not([aria-label*='liked by'])",
                "article h2 + div span",
                "h2 + div span:not([class*='_'])",
                "h2._ap3a",

                // 帖子描述和评论
                "span[style*='word-wrap']",
                "span._a9zr",
                "div._a9zs span",

                // 个人介绍和头部
                "header span:not([class*='icon']):not([aria-label])",
                "header h2 + div span",
                "header [class*='_aat0'] span",

                // 文章内容
                "article h1",
                "article h2",
                "article h3",
                "article p",

                // 动态内容区域
                "div[role='main'] span[dir='auto']:not([role='button'])",
                "[role='main'] div[style*='text-align'] span",
                "[role='main'] div[style*='display: inline'] span",

                // 对话框/模态框内容
                "[role='dialog'] span[dir='auto']:not([role='button'])",
                "[role='dialog'] h1[dir='auto']",
                "[role='dialog'] h2[dir='auto']",
                "[role='dialog'] h3[dir='auto']",

                // Instagram特定的消息流结构
                "div[class*='xdt5ytf'] span[dir='auto']",
                "div[class*='xt0psk2'] span[dir='auto']",
                "div[class*='xt0psk2'] h1",
                "div[class*='xt0psk2'] h2"
            ].join(", "),
            minLen: 2
        }
    },
    generic: {
        selectors: [
            "h1, h2, h3, p",
            "article li",
            "section li",
            "main li",
            "[role='main'] li",
            ".content li",
            ".post li",
            ".entry li",
            "li:not(nav *):not(header *):not(footer *):not([role='menuitem']):not([role='option']):not([role='tab']):not([role='listbox'] *):not([role='combobox'] *):not([class*='menu'] *):not([class*='sidebar'] *):not([class*='nav'] *)"
        ].join(", "),
        minLen: 15
    },
    getRule(hostname) {
        if (this.defaults[hostname]) return this.defaults[hostname];
        const keys = Object.keys(this.defaults);
        for (const key of keys) {
            if (hostname.endsWith('.' + key) || hostname === key) {
                return this.defaults[key];
            }
        }
        return this.generic;
    },
    hasRule(hostname) {
        if (this.defaults[hostname]) return true;
        const keys = Object.keys(this.defaults);
        for (const key of keys) {
            if (hostname.endsWith('.' + key) || hostname === key) return true;
        }
        return false;
    },
};
const rule = SiteRules.getRule(location.hostname);