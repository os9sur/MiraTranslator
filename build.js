const fs = require('fs-extra');
const path = require('path');
const config = require('./private_config.js');
const pkg = require('./package.json');
const { minify } = require('terser');
const logger = console;

const IS_DEV_MODE = process.argv.includes('--dev');
const targetBrowser = process.argv.find(arg => arg.startsWith('--browser='))?.split('=')[1] || 'chrome';
const srcDir = __dirname;
const distDir = path.join(__dirname, 'dists');

// 每个浏览器输出到独立子目录
const browserDistDir = path.join(distDir, targetBrowser);

async function build() {
    try {
        logger.log(`🚀 Building for [Browser: ${targetBrowser.toUpperCase()}] [Mode: ${IS_DEV_MODE ? 'Development' : 'Production'}]...`);
        logger.log(`📁 Output directory: ${browserDistDir}`);

        // 1. Clean and prepare distribution directory (only current browser's folder)
        if (fs.existsSync(browserDistDir)) fs.emptyDirSync(browserDistDir);
        else fs.ensureDirSync(browserDistDir);

        // 2. Copy source files to dist (excluding dev-specific files)
        const items = fs.readdirSync(srcDir);
        const excludeList = [
            'dists', '.git', '.vscode', '.gitignore', 'node_modules',
            'private_config.js', 'build.js', 'package.json',
            'package-lock.json', 'pnpm-lock.yaml', 'README.md',
            'tools', 'LICENSE', 'img', 'images', '.gitattributes'
        ];

        items.forEach(item => {
            if (!excludeList.includes(item)) {
                fs.copySync(path.join(srcDir, item), path.join(browserDistDir, item));
            }
        });

        // 3. Process target files with unified placeholder replacement
        const targetFiles = ['manifest.json', 'background.js', 'popup.js', 'utils.js', 'README.md'];

        targetFiles.forEach(file => {
            const isReadme = file === 'README.md';
            const filePath = isReadme ? path.join(srcDir, file) : path.join(browserDistDir, file);

            if (!fs.existsSync(filePath)) return;

            let content = fs.readFileSync(filePath, 'utf8');

            // --- Unified Placeholder Replacement ---
            const finalClientId = targetBrowser === 'edge'
                ? (config.CLIENT_ID_EDGE || config.CLIENT_ID)
                : config.CLIENT_ID;

            content = content.replace(/{{MY_ID}}/g, finalClientId || '');
            content = content.replace(/{{MY_KEY}}/g, config.MANIFEST_KEY || '');
            content = content.replace(/{{ONEDRIVE_CLIENT_ID}}/g, config.ONEDRIVE_CLIENT_ID || '');
            content = content.replace(/IS_DEV\s*=\s*(true|false)/g, `IS_DEV = ${IS_DEV_MODE}`);

            // --- Smart Version Update ---
            if (isReadme) {
                const versionBadgeRegex = /(https:\/\/img\.shields\.io\/badge\/Version-)([\d\.]+)(-[a-z]+)/g;
                content = content.replace(versionBadgeRegex, `$1${pkg.version}$3`);
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
                    manifest.background = { "scripts": ["background.js"] };
                    manifest.browser_specific_settings = { gecko: { id: config.FIREFOX_ID } };
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
                    // Chrome
                    manifest.background = { "service_worker": "background.js" };
                    delete manifest.browser_specific_settings;
                    // key 和 oauth2 保留给 Chrome
                }

                content = JSON.stringify(manifest, null, 2);
            }

            fs.writeFileSync(filePath, content);
            if (isReadme) logger.log(` ✅ README.md updated: Version bumped to ${pkg.version}`);
        });

        // 4. Minification (Only for Production Mode)
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
                                'logger.log',
                                'logger.warn',
                                'logger.error',
                                'logger.group',
                                'logger.groupCollapsed',
                                'logger.groupEnd'
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
    } catch (err) {
        logger.error(' ❌ Build failed:', err);
    }
}

build();