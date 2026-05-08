/**
 * copy-assets.cjs
 * 
 * Copies static assets to dist/ after Vite build.
 * Run this after `npm run build` to ensure all static assets are included.
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..');
const distDir = path.join(srcDir, 'dist');

// Directories to copy to dist/
const dirsToCopy = [
    'libs',
    'models',
    'images',
    'iconfont'
];

// Individual root-level files to copy to dist/
const filesToCopy = [
    'favicon.ico',
    'robots.txt',
    'CNAME'
];

function copyDirectory(src, dest) {
    // Create destination directory if it doesn't exist
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
        console.log(`Created directory: ${dest}`);
    }

    // Get all files and directories in source
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            // Recursively copy subdirectories
            copyDirectory(srcPath, destPath);
        } else {
            // Copy files
            try {
                fs.copyFileSync(srcPath, destPath);
                console.log(`Copied: ${entry.name}`);
            } catch (err) {
                console.error(`Error copying ${entry.name}: ${err.message}`);
            }
        }
    }
}

function copyFile(src, dest) {
    try {
        fs.copyFileSync(src, dest);
        console.log(`Copied: ${path.basename(src)}`);
    } catch (err) {
        console.error(`Error copying ${src}: ${err.message}`);
    }
}

function main() {
    console.log('========================================');
    console.log('Copying static assets to dist/');
    console.log('========================================\n');

    for (const dir of dirsToCopy) {
        const srcPath = path.join(srcDir, dir);
        const destPath = path.join(distDir, dir);

        if (fs.existsSync(srcPath)) {
            console.log(`\nProcessing: ${dir}/`);
            copyDirectory(srcPath, destPath);
        } else {
            console.warn(`Warning: ${dir}/ not found in source, skipping`);
        }
    }

    // Copy individual root-level files
    console.log('\nProcessing: root files');
    for (const file of filesToCopy) {
        const srcPath = path.join(srcDir, file);
        const destPath = path.join(distDir, file);

        if (fs.existsSync(srcPath)) {
            copyFile(srcPath, destPath);
        } else {
            console.warn(`Warning: ${file} not found in source, skipping`);
        }
    }

    console.log('\n========================================');
    console.log('Asset copy complete!');
    console.log('========================================');
}

main();
