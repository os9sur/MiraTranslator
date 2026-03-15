const SiteRules = {
    defaults: {
        "x.com": {
            selectors: "p, [data-testid='tweetText'], [data-testid='trend'] div[dir='ltr'][style*='line-clamp'] > span, [data-testid='trend'] div[dir='ltr']:not([style*='line-clamp']):not([style*='color: rgb(113']) > span, div[data-testid='UserDescription'] span, [data-testid^='news_sidebar_article'] div[dir='ltr']:first-of-type span, [data-testid='primaryColumn'] div[dir='auto'] > span, [data-testid='primaryColumn'] div.r-knv0ih div[dir='ltr'] > span",
            minLen: 3
        },
        "youtube.com": {
            selectors: "p, #content-text, #video-title, .yt-lockup-metadata-view-model__title, .yt-core-attributed-string:not(button *):not([role='button'] *), yt-formatted-string:not(#info):not(#title):not(button *)",
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
            selectors: "h3, .VwiC3b, .hgKElc, .LGOj9e span",
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
    },
    generic: {
        selectors: "article li, section li, .article-body li, .post-content li,h1, h2, h3, p",
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