/**
 * Mira Translator
 * Copyright (C) 2026 David Bai (Mira Studio)
 * License: AGPL-3.0 (https://github.com/os9sur)
 * Contact: mira.studio@proton.me
 */

const fs = require('fs-extra');
const path = require('path');
const config = require('./private_config.js');
const pkg = require('./package.json');
const { minify } = require('terser');
const logger = console;
const archiver = require('archiver');

const IS_DEV_MODE = process.argv.includes('--dev');
const targetBrowser = process.argv.find(arg => arg.startsWith('--browser='))?.split('=')[1] || 'chrome';
const srcDir = __dirname;
const distDir = path.join(__dirname, 'dists');

const browserDistDir = path.join(distDir, targetBrowser);

async function build() {
    try {
        logger.log(`🚀 Building for [Browser: ${targetBrowser.toUpperCase()}] [Mode: ${IS_DEV_MODE ? 'Development' : 'Production'}]...`);
        logger.log(`📁 Output directory: ${browserDistDir}`);

        // 1. Clean and prepare distribution directory
        if (fs.existsSync(browserDistDir)) fs.emptyDirSync(browserDistDir);
        else fs.ensureDirSync(browserDistDir);

        // 2. Copy source files to dist
        const items = fs.readdirSync(srcDir);
        const excludeList = [
            'dists', '.git', '.vscode', '.gitignore', 'node_modules',
            'private_config.js', 'build.js', 'package.json',
            'package-lock.json', 'pnpm-lock.yaml', 'README.md',
            'tools', 'LICENSE', 'img', 'images', '.gitattributes', 'assets', 'private_config.example.js', '.nojekyll'
        ];

        items.forEach(item => {
            if (!excludeList.includes(item)) {
                fs.copySync(path.join(srcDir, item), path.join(browserDistDir, item));
            }
        });

        // 3. Process target files with unified placeholder replacement
        const targetFiles = ['manifest.json', 'background.js', 'popup.js', 'recharge.js', 'utils.js', 'README.md', 'engineSettings.js'];

        targetFiles.forEach(file => {
            const isReadme = file === 'README.md';
            const filePath = isReadme ? path.join(srcDir, file) : path.join(browserDistDir, file);

            if (!fs.existsSync(filePath)) return;

            let content = fs.readFileSync(filePath, 'utf8');

            // --- Unified Placeholder Replacement ---
            const finalClientId = targetBrowser === 'edge'
                ? (config.CLIENT_ID_EDGE || config.CLIENT_ID)
                : targetBrowser === 'firefox'
                    ? (config.FIREFOX_CLIENT_ID || config.CLIENT_ID)
                    : config.CLIENT_ID;

            content = content.replace(/{{MY_ID}}/g, finalClientId || '');
            content = content.replace(/{{FIREFOX_CLIENT_ID}}/g, config.FIREFOX_CLIENT_ID || '');
            content = content.replace(/{{GA_MEASUREMENT_ID}}/g, config.GA_MEASUREMENT_ID || '');
            content = content.replace(/{{GA_API_SECRET}}/g, config.GA_API_SECRET || '');
            content = content.replace(/{{MY_KEY}}/g, config.MANIFEST_KEY || '');
            content = content.replace(/{{ONEDRIVE_CLIENT_ID}}/g, config.ONEDRIVE_CLIENT_ID || '');
            content = content.replace(/{{MIRA_WORKER_URLS}}/g, config.MIRA_WORKER_URLS.join(','));
            content = content.replace(/IS_DEV\s*=\s*(true|false)/g, `IS_DEV = ${IS_DEV_MODE}`);
            content = content.replace(/enable_pro_features\s*=\s*(true|false)/g, `enable_pro_features = ${IS_DEV_MODE}`);

            // --- Smart Version Update ---
            if (isReadme) {
                const versionBadgeRegex = /(https:\/\/img\.shields\.io\/badge\/Version-)([\d\.]+)(-[a-z]+)/g;
                content = content.replace(versionBadgeRegex, `$1${pkg.version}$3`);
            }

            // --- Firefox: 隐藏 Google 登录按钮（popup.js 里的动态显示）--- 
            if (targetBrowser === 'firefox' && (file === 'popup.js' || file === 'engineSettings.js')) {
                content = content.replace(
                    /if \(btnGoogle\) btnGoogle\.style\.display = ['"]flex['"]/g,
                    "if (btnGoogle) btnGoogle.style.display = 'none'"
                );
            }
            if (targetBrowser === 'firefox' && file === 'background.js') {
                content = content.replace(/^importScripts\([^)]*\);?\s*$/gm, '');
            }
            // --- File-Specific Logic (Manifest) ---
            if (file === 'manifest.json') {
                let manifest = JSON.parse(content);
                manifest.version = pkg.version;

                if (targetBrowser === 'chrome' && IS_DEV_MODE) {
                    manifest.update_url = "https://clients2.google.com/service/update2/crx";
                }

                let vName = pkg.version_name || pkg.version;
                if (IS_DEV_MODE) vName += ` (Dev-${new Date().toLocaleDateString()})`;
                manifest.version_name = vName;

                if (targetBrowser === 'firefox') {
                    manifest.background = { "scripts": ["utils.js", "background.js"] };
                    manifest.browser_specific_settings = {
                        gecko: {
                            id: config.FIREFOX_ID,
                            strict_min_version: "140.0",
                            data_collection_permissions: {
                                required: ["none"],
                                optional: []
                            }
                        }
                    };
                    delete manifest.key;
                    delete manifest.oauth2;
                } else if (targetBrowser === 'edge') {
                    manifest.background = { "service_worker": "background.js" };
                    delete manifest.browser_specific_settings;
                    delete manifest.oauth2;
                    delete manifest.key;

                    const localesDir = path.join(browserDistDir, '_locales');
                    if (fs.existsSync(localesDir)) {
                        const edgeWhitespaces = ['en', 'zh_CN', 'zh_TW', 'ja', 'ko'];
                        fs.readdirSync(localesDir).forEach(lang => {
                            if (!edgeWhitespaces.includes(lang)) {
                                fs.removeSync(path.join(localesDir, lang));
                            }
                        });
                        logger.log(` 🧹 Edge build: 已裁剪语言包，仅保留 [${edgeWhitespaces.join(', ')}]`);
                    }
                } else {
                    manifest.background = { "service_worker": "background.js" };
                    delete manifest.browser_specific_settings;
                }

                content = JSON.stringify(manifest, null, 2);
            }

            fs.writeFileSync(filePath, content);
            if (isReadme) logger.log(` ✅ README.md updated: Version bumped to ${pkg.version}`);
        });

        // 4. Firefox 专属 HTML/locales 后处理（在 targetFiles 循环之后，独立执行一次）
        if (targetBrowser === 'firefox') {
            logger.log(' 🦊 Firefox: 处理 HTML 和 locales...');

            // 处理所有 HTML 文件里的 btnGoogleLogin
            const htmlFiles = ['popup.html', 'engineSettings.html'];
            htmlFiles.forEach(htmlFile => {
                const htmlPath = path.join(browserDistDir, htmlFile);
                if (!fs.existsSync(htmlPath)) return;

                let html = fs.readFileSync(htmlPath, 'utf8');

                // 1. 清理之前可能误加的多余 style="display:none"
                html = html.replace(/(<button[^>]*id="btnGoogleLogin"[^>]*?)(\s+style="display:none")+/g, '$1');

                // 2. 替换原始 style 里的 display:flex 为 display:none
                html = html.replace(
                    /(<button[^>]*id="btnGoogleLogin"[^>]*style="[^"]*?)display\s*:\s*flex([^"]*")/g,
                    '$1display:none$2'
                );

                // 3. 如果按钮没有 style 属性，追加一个（兜底）
                html = html.replace(
                    /(<button[^>]*id="btnGoogleLogin")(?![^>]*style=)([^>]*>)/g,
                    '$1 style="display:none"$2'
                );

                // 4. 移除 Google Drive option
                html = html.replace(/<option[^>]*value="googleDrive"[^>]*>.*?<\/option>/g, '');

                fs.writeFileSync(htmlPath, html);
                logger.log(`  └─ 已处理: ${htmlFile}`);
            });

            // 处理 _locales：Google Drive → OneDrive
            const localesDir = path.join(browserDistDir, '_locales');
            if (fs.existsSync(localesDir)) {
                fs.readdirSync(localesDir).forEach(lang => {
                    const msgPath = path.join(localesDir, lang, 'messages.json');
                    if (!fs.existsSync(msgPath)) return;
                    let content = fs.readFileSync(msgPath, 'utf8');
                    content = content.replace(/Google Drive/g, 'OneDrive');
                    fs.writeFileSync(msgPath, content);
                });
                logger.log(`  └─ 已处理: _locales Google Drive → OneDrive`);
            }
        }

        // 5. Minification (Only for Production Mode)
        if (IS_DEV_MODE) {
            logger.log(' 🛠️  Development mode: Skipping minification...');
        } else {
            logger.log(' ⚡ Production mode: Minifying JS bundle...');
            const distItems = fs.readdirSync(browserDistDir);
            for (const file of distItems) {
                const filePath = path.join(browserDistDir, file);

                if (fs.statSync(filePath).isFile() && path.extname(file) === '.js') {
                    if (file === 'constants.js') continue;

                    const originalCode = fs.readFileSync(filePath, 'utf8');
                    const terserOptions = {
                        compress: {
                            dead_code: true,
                            drop_console: true,
                            passes: 2,
                            pure_funcs: [
                                'logger.log', 'logger.warn', 'logger.error',
                                'logger.group', 'logger.groupCollapsed', 'logger.groupEnd'
                            ]
                        },
                        mangle: true,
                        sourceMap: false
                    };

                    try {
                        const result = await minify(originalCode, terserOptions);
                        fs.writeFileSync(filePath, result.code);
                        logger.log(`  └─ Compressed: ${file}`);
                    } catch (minError) {
                        logger.error(`  └─ Minification failed [${file}]:`, minError.message);
                    }
                }
            }
        }

        logger.log(`\n ✨ Build completed successfully! [${new Date().toLocaleString()}]`);
        logger.log(`📦 Output: ${browserDistDir}`);

        // 6. Package as zip
        if (!IS_DEV_MODE) {
            await zipDist(browserDistDir, targetBrowser, pkg.version);
        }
    } catch (err) {
        logger.error(' ❌ Build failed:', err);
    }
}
async function zipDist(sourceDir, browser, version) {
    const zipName = `v${version}-${browser}.zip`;
    const zipPath = path.join(distDir, zipName);
    logger.log(` 🔍 Zipping from: ${sourceDir}`);
    if (fs.existsSync(zipPath)) {
        logger.log(` ⚠️  Overwriting existing zip: ${zipName}`);
    }
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            logger.log(`\n 🗜️  Zipped: ${zipName} (${(archive.pointer() / 1024).toFixed(1)} KB)`);
            logger.log(`📍 Location: ${zipPath}`);
            resolve();
        });

        archive.on('error', err => reject(err));
        archive.pipe(output);

        // 将 browserDistDir 下的所有内容打包到 zip 根目录
        archive.directory(sourceDir, false);
        archive.finalize();
    });
}

build();