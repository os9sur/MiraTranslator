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

async function build() {
    try {
        logger.log(`🚀 Building for [Browser: ${targetBrowser.toUpperCase()}] [Mode: ${IS_DEV_MODE ? 'Development' : 'Production'}]...`);

        // 1. Clean and prepare distribution directory
        if (fs.existsSync(distDir)) fs.emptyDirSync(distDir);
        else fs.ensureDirSync(distDir);

        // 2. Copy source files to dist (excluding dev-specific files)
        const items = fs.readdirSync(srcDir);
        const excludeList = ['dists', '.git', '.vscode', '.gitignore', 'node_modules', 'private_config.js', 'build.js', 'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'README.md', 'tools', 'LICENSE', 'img', 'images'];

        items.forEach(item => {
            if (!excludeList.includes(item)) {
                fs.copySync(path.join(srcDir, item), path.join(distDir, item));
            }
        });

        // 3. Process target files with unified placeholder replacement
        const targetFiles = ['manifest.json', 'background.js', 'popup.js', 'utils.js', 'README.md'];
        
        targetFiles.forEach(file => {
            // README.md is updated in the source root to keep Git history in sync, others in dists
            const isReadme = file === 'README.md';
            const filePath = isReadme ? path.join(srcDir, file) : path.join(distDir, file);
            
            if (!fs.existsSync(filePath)) return;

            let content = fs.readFileSync(filePath, 'utf8');

            // --- Unified Placeholder Replacement ---
            content = content.replace(/{{MY_ID}}/g, config.CLIENT_ID || '');
            content = content.replace(/{{MY_KEY}}/g, config.MANIFEST_KEY || '');
            content = content.replace(/IS_DEV\s*=\s*(true|false)/g, `IS_DEV = ${IS_DEV_MODE}`);

            // --- Smart Version Update (No manual placeholders needed in README) ---
            if (isReadme) {
                // Regex to find Shields.io badge: https://img.shields.io/badge/Version-3.3.6.0-blue
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
                } else {
                    manifest.background = { "service_worker": "background.js" };
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
            const distItems = fs.readdirSync(distDir);
            for (const file of distItems) {
                const filePath = path.join(distDir, file);

                if (fs.statSync(filePath).isFile() && path.extname(file) === '.js') {
                    if (file === 'constants.js') continue;

                    const originalCode = fs.readFileSync(filePath, 'utf8');
                    const terserOptions = {
                        compress: {
                            dead_code: true,
                            drop_console: true, 
                            passes: 2
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
    } catch (err) {
        logger.error(' ❌ Build failed:', err);
    }
}

build();