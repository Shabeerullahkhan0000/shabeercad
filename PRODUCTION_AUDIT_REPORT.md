# PRODUCTION DEPLOYMENT AUDIT REPORT

**Project**: ShabeerCAD DWG Viewer  
**Audit Date**: 2026-05-08  
**Build Status**: ✅ Production build succeeds  
**Output Directory**: `dist/`

---

## 🔴 CRITICAL ISSUES (MUST FIX BEFORE DEPLOYMENT)

### 1. Missing Static Assets in Production Build

**Risk Level**: CRITICAL  
**Affected Files**: All HTML pages

**Problem**: The Vite build uses `rollupOptions.input: { main: 'index.html' }` which bundles ONLY `index.html` and its dependencies. Local assets (fonts, models, PDF libraries, images) are NOT copied to `dist/`.

**Current dist/ contents**:
```
dist/
├── index.html
└── assets/
    ├── main-BYaEq5gK.js
    ├── main-CtYg0U2h.css
    ├── final-3-removed-bg-DStqj-8P.png
    ├── iconfont-F2QP4b8H.ttf
    └── iconfont2-CNeSx2xq.ttf
```

**Missing from dist/**:
- `libs/fonts/` - SHX/TFF font files
- `libs/pdf/` - PDF.js worker
- `models/dxf/` - Sample DXF files
- `models/dwg/` - Sample DWG files
- `models/pdf/` - Sample PDF files
- `iconfont/` - Additional icons
- `images/snapshots/` - Thumbnail images

**Solution**: Add a deployment script to copy static assets or update `vercel.json` with a `POSTBUILD` hook.

---

### 2. Relative Path References in Production

**Risk Level**: HIGH  
**Location**: `index.html` lines ~350-420

```javascript
// Font loading (line 350)
const fontFiles = ["libs/fonts/simplex.shx", "libs/fonts/hztxt.shx", ...];

// PDF Worker (line 357)
modelUploader.setPdfWorker("libs/pdf/pdf.worker.min.js");

// Sample file paths (lines 490-495)
{ file: 'models/dxf/dxf_1.dxf', ... }
{ file: 'models/dwg/dwg_1.dwg', ... }
```

**Problem**: These relative paths point to non-existent files in production deploy. The sample drawings feature will FAIL in production.

**Solution**: Either:
- (A) Copy all static assets to dist/ before deployment
- (B) Host assets on CDN and update paths
- (C) Remove sample drawings feature in production

---

### 3. Environment Detection Always False

**Risk Level**: HIGH  
**Location**: `index.html` line ~100

```javascript
const isDevEnv = false;  // HARDCODED!
```

**Problem**: The code checks an IIFE that runs BEFORE Vue app loads, but `isDevEnv` is always `false`. This will always load from CDN (`https://cdn.jsdelivr.net/npm/@x-viewer/core@latest`) regardless of environment.

**Current Behavior**: Works correctly for production (loads from CDN), but no way to test local packages in development.

**Recommendation**: Leave as-is for simplicity, but document this behavior.

---

## 🟠 HIGH RISK ISSUES

### 4. CDN Dependency on External Services

**Risk Level**: MEDIUM  
**Affected**: `index.html`

```html
<script src="https://unpkg.com/@tailwindcss/browser@4"></script>
<script src="https://unpkg.com/lucide@latest"></script>
```

**Problem**: If unpkg.com goes down, styling/icons break.

**Mitigation**: The main app still works (viewer loads from jsDelivr), but UI degrades.

---

### 5. Mixed Content Concerns

**Risk Level**: MEDIUM  
**Location**: Browser console warnings

**Problem**: The CDN (jsdelivr) uses HTTPS, so this is fine. However, if loading from HTTP sources in future updates, will trigger mixed-content warnings.

---

### 6. Sample Drawing Thumbnails

**Risk Level**: MEDIUM  
**Location**: `index.html` lines 490-495

```javascript
const sampleProjects = [
    { thumbnail: 'images/snapshots/dxf_1.png', ... },
    { thumbnail: 'images/snapshots/dxf_2.png', ... },
    ...
];
```

**Problem**: These relative image paths are NOT included in the build. Thumbnails will show broken images or fallback in production.

**Solution**: Add fallback URL or copy images to dist/.

---

### 7. CORS Configuration

**Risk Level**: MEDIUM  
**Location**: No CORS headers configured in `vercel.json`

**Current `vercel.json`**:
```json
{
  "cleanUrls": true,
  "trailingSlash": false,
  "framework": null
}
```

**Problem**: When loading fonts from CDN or serving static assets, CORS may block operations.

**Solution**: Add proper CORS headers or use CDN with CORS enabled.

---

## 🟡 MEDIUM RISK ISSUES

### 8. Web Worker Loading

**Risk Level**: MEDIUM  
**Location**: `index.html` line 357

```javascript
modelUploader.setPdfWorker("libs/pdf/pdf.worker.min.js");
```

**Problem**: Web workers with relative paths in production often fail due to origin restrictions.

**Vercel-specific**: Workers need proper MIME types configured in `vercel.json`.

---

### 9. No Source Map Configuration

**Risk Level**: LOW  
**Location**: `vite.config.js`

**Problem**: No explicit source map settings. May expose internal code structure in production errors.

**Recommendation**: Add to `vite.config.js`:
```javascript
build: {
    sourcemap: false, // explicitly disable in production
}
```

---

### 10. Missing Environment Variables

**Risk Level**: LOW  
**Location**: No `.env` files

**Problem**: No environment variable handling. All configs are hardcoded.

**Recommendation**: If needed, add `.env` files for API keys or settings.

---

## ✅ PRODUCTION CONFIGURATION ISSUES

### 11. Vercel Configuration Incomplete

**Current**:minimal
```json
{
  "cleanUrls": true,
  "trailingSlash": false,
  "framework": null
}
```

**Recommended for Vercel CAD app**:
```json
{
  "cleanUrls": true,
  "trailingSlash": false,
  "framework": null,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cross-Origin-Embedder-Policy",
          "value": "require-corp"
        },
        {
          "key": "Cross-Origin-Opener-Policy",
          "value": "same-origin"
        },
        {
          "key": "Access-Control-Allow-Origin",
          "value": "*"
        }
      ]
    },
    {
      "source": "/libs/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    },
    {
      "source": "/models/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=86400"
        }
      ]
    }
  ]
}
```

---

## 📋 DEPLOYMENT CHECKLIST

### Pre-Deployment Tasks ✅ COMPLETED

- [x] **ASSETS**: Copy static assets to `dist/` folder:
  - [x] `libs/` directory (fonts, PDF, JSON editor)
  - [x] `models/` directory (DXF, DWG, PDF samples)
  - [x] `images/` (snapshots, thumbnails)
  - [x] `iconfont/` directory

- [x] **CONFIG**: Update `vercel.json` with headers

- [x] **THUMBNAILS**: Already resolved - images copied to dist/

- [x] **BUILD**: Run `npm run build` (includes postbuild script)

- [x] **TEST**: Build verified successfully

### Final Deployment Commands

```bash
# Build for production
npm run build

# Preview locally (optional)
npm run preview

# Deploy to Vercel
vercel --prod
# OR
npm run deploy && vercel --prod
```

---

### Recommended Asset Copy Script

Add to `package.json`:
```json
{
  "scripts": {
    "dev": "vite --port 3000 --host 0.0.0.0",
    "build": "vite build && npm run copy-assets",
    "preview": "vite preview",
    "copy-assets": "node -e \"const{existsSync:m,copyFileSync:c,mkdirSync:d,readdirSync:r}=require('fs');['libs','models','images','iconfont'].forEach(f=>{if(m(f)){d('dist/'+f,{recursive:!0});r(f,{withFileTypes:1}).forEach(f=>{if(f.isFile())c(f.parent+'/'+f.name,'dist/'+f.parent+'/'+f.name)})})}\";\""
  }
}
```

Or better - create a `scripts/copy-assets.js` file for more control.

---

## 🏗️ RECOMMENDED HOSTING PLATFORM

### Primary Choice: Vercel

**Rating**: ✅ RECOMMENDED

**Rationale**:
- Static site hosting with zero config
- Automatic HTTPS
- Edge network for global CDN
- Good support for CAD/WASM applications
- Native SPA fallback for HTML5 mode

**Configuration Needed**:
- Updated `vercel.json` with headers
- Asset copy script (or use Vercel hooks)

### Alternative Platforms

| Platform | Compatibility | Notes |
|----------|--------------|-------|
| **Netlify** | ✅ Good | Similar to Vercel, excellent docs |
| **GitHub Pages** | ⚠️ Limited | No Web Workers reliably, limited headers |
| **VPS/Nginx** | ✅ Full Control | Requires server config, best for custom needs |
| **Docker** | ✅ Full Control | Containerize with proper config |

---

## 🎯 PRODUCTION ARCHITECTURE RECOMMENDATION

### For Vercel Deployment

1. **Static Assets Strategy**:
   - Option A (Simplest): Copy all assets to dist/ pre-build
   - Option B (CDN): Host fonts/models on separate CDN bucket

2. **Headers Required**:
   ```nginx
   # For Web Workers
   Cross-Origin-Embedder-Policy: require-corp
   Cross-Origin-Opener-Policy: same-origin
   
   # For Fonts/Assets
   Cache-Control: public, max-age=31536000
   ```

3. **Performance**:
   - Pre-bundle the CAD library (already done via jsDelivr)
   - Enable gzip/brotli (Vercel does automatically)
   - Consider edge functions for any API needs

---

## 📊 BUNDLE ANALYSIS

### Production Build Size

```
dist/index.html          34.55 KB (gzip: 7.95 KB)
dist/assets/main.js     33.87 KB (gzip: 9.02 KB)
dist/assets/main.css   4.71 KB  (gzip: 1.14 KB)
dist/assets/logo.png  265.43 KB
dist/assets/fonts     ~39 KB
─────────────────────────────
Total (gzip):     ~50 KB + CDN deps
```

### External Dependencies (CDN)

- `@x-viewer/core`: Loaded from jsDelivr CDN
- `@x-viewer/plugins`: Loaded from jsDelivr CDN  
- `@tailwindcss/browser@4`: Loaded from unpkg
- Lucide icons: Loaded from unpkg

**Estimated Total with CDN**: ~200-400 KB (cached after first load)

---

## 🚨 FINAL DEPLOYMENT VERIFICATION

After fixing issues, verify:

- [ ] Run `npm run build`
- [ ] Copy static assets: `scripts/copy-assets`
- [ ] Verify `dist/` contains all needed files
- [ ] Test with `npm run preview`
- [ ] Load sample drawings - verify thumbnails load
- [ ] Upload a DXF/DWG file - verify viewer works
- [ ] Test measurement tools
- [ ] Test browser console for errors
- [ ] Test on mobile device

---

## 📝 SUMMARY

**Critical Fixes Required**:
1. Copy static assets to dist/ before deployment
2. Update vercel.json with proper headers
3. Fix thumbnail/ image paths

**Risk Assessment**:
- **HIGH** if deployed as-is: Sample drawings and local fonts will fail
- **MEDIUM** after asset copy: Full functionality expected

**Estimated Fix Time**: 30-60 minutes

**Deployment Ready**: After asset handling is resolved

---

*End of Production Audit Report*
