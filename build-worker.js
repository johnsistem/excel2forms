const fs = require('fs');
const path = require('path');

// 1. Read the core code
let coreCode = fs.readFileSync(
  path.join(__dirname, 'node_modules/tesseract.js-core/tesseract-core-simd.wasm.js'),
  'utf8'
);

// 2. Patch Oa() to skip fetch and go straight to sync base64 decoder (Na)
//    This avoids hanging when fetch(data:URL) is called in extension workers.
const Oa_ORIG = 'function Oa(a){if(!ra&&(fa||ha)){if("function"==typeof fetch&&!a.startsWith("file://"))return fetch(a,{credentials:"same-origin"}).then(c=>{if(!c.ok)throw"failed to load wasm binary file at \'"+a+"\'";return c.arrayBuffer()}).catch(()=>Na(a));if(ka)return new Promise((c,d)=>{ka(a,e=>c(new Uint8Array(e)),d)})}return Promise.resolve().then(()=>Na(a))}';
const Oa_PATCHED = 'function Oa(a){return Promise.resolve().then(function(){return Na(a)})}';

if (!coreCode.includes(Oa_ORIG)) {
  console.error('ERROR: Could not find original Oa function in core code');
  process.exit(1);
}
coreCode = coreCode.replace(Oa_ORIG, Oa_PATCHED);
console.log('OK: Oa function patched');

// 3. Read the worker code
const workerCode = fs.readFileSync(
  path.join(__dirname, 'node_modules/tesseract.js/dist/worker.min.js'),
  'utf8'
);

// 4. Remove importScripts calls from worker code
const fixedWorker = workerCode.replace(/\.importScripts\([^)]+\)/g, '');

// 5. Inject debug inside core code
const debugInner = coreCode
  .replace(
    'var _scriptDir =',
    'try { self.postMessage({type: \'__debug\', msg: \'c1-outer-body\'}); } catch(_) {}; var _scriptDir ='
  )
  .replace(
    'function(TesseractCore = {})  {',
    'function(TesseractCore = {})  { try { self.postMessage({type: \'__debug\', msg: \'c2-inner-fn\'}); } catch(_) {};'
  )
  .replace(
    'La="data:application/octet-stream;base64,',
    'try { self.postMessage({type: \'__debug\', msg: \'c3-before-la\'}); } catch(_) {}; La="data:application/octet-stream;base64,'
  );

// 6. Build the combined file
const combined = `// Worker bundle: core + worker combined (no importScripts, fetch bypassed)

// Debug: report start
try { self.postMessage({type: '__debug', msg: 'a-script-start'}); } catch(_) {}

// Set base URL from worker script URL
try {
  var urlParams = new URL(self.location.href).searchParams;
  self.__tesseractBase = urlParams.get('base') || '';
} catch(e) {}
self.__tesseractScriptDir = self.location.href.substring(0, self.location.href.lastIndexOf('/') + 1);
if (!self.__tesseractBase) self.__tesseractBase = self.__tesseractScriptDir;

try { self.postMessage({type: '__debug', msg: 'b-before-core', coreExists: typeof self.TesseractCore !== 'undefined'}); } catch(_) {}

// Core code (Oa patched to skip fetch, with inner debug)
${debugInner}

try { self.postMessage({type: '__debug', msg: 'c4-after-core-iife', coreType: typeof self.TesseractCore}); } catch(_) {}

// Wrapper: add locateFile to Core factory
(function() {
  var __origCore = self.TesseractCore;
  if (__origCore) {
    self.TesseractCore = function(moduleConfig) {
      moduleConfig = moduleConfig || {};
      moduleConfig.locateFile = function(wasmFile, scriptDir) {
        return (self.__tesseractBase || self.__tesseractScriptDir) + wasmFile;
      };
      return __origCore(moduleConfig);
    };
    try { self.postMessage({type: '__debug', msg: 'd-core-wrapped'}); } catch(_) {}
  } else {
    try { self.postMessage({type: '__debug', msg: 'e-CORE-NOT-FOUND'}); } catch(_) {}
  }
})();

try { self.postMessage({type: '__debug', msg: 'f-before-worker-code'}); } catch(_) {}

// Patch fetch inside worker to use XMLHttpRequest for extension URL compatibility
try {
  var __origFetch = self.fetch;
  self.fetch = function(url, opts) {
    if (typeof url === 'string' && (url.startsWith('chrome-extension://') || url.startsWith('moz-extension://'))) {
      return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({
              ok: true,
              status: xhr.status,
              statusText: xhr.statusText,
              arrayBuffer: function() { return Promise.resolve(xhr.response); }
            });
          } else {
            resolve({
              ok: false,
              status: xhr.status,
              statusText: xhr.statusText
            });
          }
        };
        xhr.onerror = function() { reject(new Error('Network error')); };
        xhr.send();
      });
    }
    return __origFetch.call(this, url, opts);
  };
} catch(e) {}

// Worker code (importScripts removed)
${fixedWorker}

try { self.postMessage({type: '__debug', msg: 'g-worker-code-done'}); } catch(_) {}
`;

// 6. Write the combined file
fs.writeFileSync(path.join(__dirname, 'tesseract/worker-bundle.js'), combined);

// Verify syntax
try {
  new Function(combined);
  console.log('OK: worker-bundle.js syntax is valid');
} catch(e) {
  console.error('ERROR: Invalid syntax in worker-bundle.js:', e.message);
  process.exit(1);
}

const size = fs.statSync(path.join(__dirname, 'tesseract/worker-bundle.js')).size;
console.log(`Size: ${(size / 1024 / 1024).toFixed(2)} MB`);
