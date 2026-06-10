/**
 * Mira Translator
 * Copyright (C) 2026 David Bai 
 * License: AGPL-3.0 (https://github.com/os9sur)
 * Contact: mira.studio@proton.me
 */

// 提取公共排除规则
const ignoreMenu = ":not(nav *):not(menu *):not([class*='menu'] *):not([class*='nav'] *)";

const SiteRules = {
    defaults: {
        "x.com": {
            selectors: "p, [data-testid='tweetText'],[data-testid='twitter-article-title'], [data-testid='trend'] div[dir='ltr'][style*='line-clamp'] > span, [data-testid='trend'] div[dir='ltr']:not([style*='line-clamp']):not([style*='color: rgb(113']) > span, div[data-testid='UserDescription'] span, [data-testid^='news_sidebar_article'] div[dir='ltr']:first-of-type span, [data-testid='primaryColumn'] div[dir='auto'] > span, [data-testid='primaryColumn'] div.r-knv0ih div[dir='ltr'] > span, [data-testid='placementTracking'] button div[style*='line-clamp: 2'] > span, div.public-DraftStyleDefault-block, h2.longform-header-two",
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
            selectors: [
                "p:not(ytd-active-account-header-renderer *)",
                "#content-text:not(ytd-active-account-header-renderer *)",
                "#video-title:not(ytd-active-account-header-renderer *)",
                ".yt-lockup-metadata-view-model__title:not(ytd-active-account-header-renderer *)",
                ".ytLockupMetadataViewModelTitle:not(ytd-active-account-header-renderer *)",
                ".ytLockupMetadataViewModelHeadingReset:not(ytd-active-account-header-renderer *)",
                ".yt-core-attributed-string:not(button *):not([role='button'] *):not(ytd-active-account-header-renderer *):not(yt-content-metadata-view-model *):not(.yt-spec-button-shape-next *)",
                "yt-formatted-string:not(#info):not(#title):not(button *):not(ytd-active-account-header-renderer *):not(ytd-metadata-line-renderer *)",
                // 视频描述区域
                "ytd-text-inline-expander yt-attributed-string span",
                "#description-inline-expander yt-attributed-string span",
                "#description yt-formatted-string",
                // about 页频道描述
                "ytd-about-channel-renderer yt-attributed-string span",
            ].join(", "),
            minLen: 3
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

        "temu.com": {
            selectors: [
                "span._25g_jM0z:not(.HZ_BBbqn *)",
                "div._2EO0yd2j",
            ].join(", "),
            minLen: 4
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
            selectors: [
                ".s-prose p",
                ".s-prose li",
                ".question-hyperlink",
                // 评论内容 - 正确选择器
                "div[itemprop='text']",
                // 问题标题详情页
                "#question-header h1 a",
                // 列表页问题标题
                ".s-post-summary--content-title a",
            ].join(", "),
            minLen: 5
        },
        "reddit.com": {
            selectors: [
                // 帖子正文
                "shreddit-post p",
                "div[slot='text-body'] p",
                ".md p",
                // 帖子标题（主列表）
                "h2.inline-block a",
                // 右侧侧边栏标题
                "h3.i18n-list-item-post-title",
                // 旧版兼容
                ".comment p",
                "#comment-tree .md p",
            ].join(", "),
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
            selectors: [
                "[class*='messageContent'] > span",
                "[class*='messageContent'] h1",
                "[class*='messageContent'] h2",
                "[class*='messageContent'] h3",
                "[class*='messageContent'] li",
                "[class*='messageContent'] p",
                "[class*='embedDescription']",
                "[class*='blockquote']",
                "[class*='topic']",
                "[class*='headerText']",
            ].join(", "),
            minLen: 2
        },
        "producthunt.com": {
            selectors: [
                "[class*='styles_title__']",
                "[class*='styles_description__']",
                "[class*='comment_body__']",

                "span.text-secondary",
                "span[class*='font-semibold'] a",
                "a.line-clamp-3.text-base.font-medium.text-dark-gray",
                "a[class*='line-clamp'][class*='font-medium']",
                "div.relative.text-base.font-normal.text-gray-700",
                "div[class*='text-gray-700']",
                "[class*='comment_body__']",
                "div[class*='comment'] p",
                "div[class*='text-base'] span",
                "h1, h2, h3, p",
                "[role='article'] p",
                "[role='article'] span.text-base",
                "div[class*='text-base'][class*='font-normal'] span",
            ].join(", "),
            minLen: 3
        },
        "dev.to": {
            selectors: [
                "#article-body p",
                "#article-body li",
                "#article-body h2",
                "#article-body h3",
                "h2.crayons-story__title a",
                "h2.crayons-story__title",
                ".crayons-article__title",
                "h1, h2, h3, h4",
                "a.crayons-link.crayons-link--contentful",
                "div.color-base-70",
                ".user-metadata-details-inner .value",
                ".user-metadata-details-inner .key",
                "span.crayons-subtitle-2",
                ".crayons-card--secondary p",
                ".crayons-card--secondary div[class*='color']",
            ].join(", "),
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

        "notion.so": {
            selectors: [
                "main h1",
                "main h2",
                "main p:not(:empty)",
                "[class*='Review'] [class*='typography']",
                "[class*='TemplateReviews_review'] span[class*='typography']",
                "article h1, article h2, article h3",
                "article p",

            ].join(", "),
            minLen: 3
        },
        "instagram.com": {
            selectors: [
                "span._ap3a._aaco._aacu._aacx._aad7._aade",
                "span._aacl._aaco._aacw._aacx._aad6._aade",
                "h1[dir='auto']",
                "h2[dir='auto']",
                "header span[dir='auto']:not([role='button'])",
                "ul li div span[dir='auto']",
                "[role='dialog'] span[dir='auto']:not([role='button'])",
                "[role='dialog'] h1[dir='auto']",
            ].join(", "),
            minLen: 2
        },
        "steamcommunity.com": {
            selectors: ".content, .commentthread_comment_text, .topic, .forum_topic_name",
            minLen: 3
        },
        "store.steampowered.com": {
            selectors: "div._1zbKizfCRpoX2D_zOLQes0",
            minLen: 5
        }
    },

    generic: {
        selectors: [
            `h1:not(button *)${ignoreMenu}`,
            `h2:not(button *)${ignoreMenu}`,
            `h3:not(button *)${ignoreMenu}`,
            `p:not(button *)${ignoreMenu}`,
            `span:not(button *):not(header *):not(footer *):not(.kt-paragraph-translation):not([class*='icon']):not([class*='badge']):not([class*='tag']):not(pre *):not(code *):not([class*='code'] *):not([class*='highlight'] *):not([class*='token'] *):not(td *):not(th *)${ignoreMenu}`,
            `article li${ignoreMenu}`,
            `section li${ignoreMenu}`,
            `main li${ignoreMenu}`,
            `[role='main'] li${ignoreMenu}`,
            `.content li${ignoreMenu}`,
            `.post li${ignoreMenu}`,
            `.entry li${ignoreMenu}`,
            //  通用菜单排除
            `li:not(header *):not(footer *):not([role='menuitem']):not([role='option']):not([role='tab']):not([role='listbox'] *):not([role='combobox'] *):not([class*='sidebar'] *)${ignoreMenu}`
        ].join(", "),
        minLen: 5
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