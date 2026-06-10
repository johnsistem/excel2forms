const SECRET = 'Digitar2024!MachineLock';
const MAX_TRIAL_STUDENTS = 50;

async function getTrialUsed() {
  const result = await chrome.storage.local.get('trialUsed');
  return result.trialUsed || 0;
}

async function tryUseTrial(count) {
  const used = await getTrialUsed();
  if (used + count > MAX_TRIAL_STUDENTS) {
    return { allowed: false, remaining: Math.max(0, MAX_TRIAL_STUDENTS - used) };
  }
  await chrome.storage.local.set({ trialUsed: used + count });
  return { allowed: true, remaining: MAX_TRIAL_STUDENTS - (used + count) };
}

async function getOrCreateUUID() {
  const result = await chrome.storage.local.get('machineUUID');
  if (result.machineUUID) return result.machineUUID;
  const uuid = crypto.randomUUID();
  await chrome.storage.local.set({ machineUUID: uuid });
  return uuid;
}

async function getMachineID() {
  const uuid = await getOrCreateUUID();
  const data = new TextEncoder().encode(chrome.runtime.id + ':' + uuid);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hash));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function validateLicense(token) {
  const parts = token.trim().split(':');
  if (parts.length !== 2) return { valid: false };
  const [expiryStr, hashPart] = parts;
  const expiry = new Date(expiryStr + 'T23:59:59');
  if (isNaN(expiry.getTime()) || expiry < new Date()) return { valid: false, expired: true };
  const machineID = await getMachineID();
  const data = new TextEncoder().encode(machineID + ':' + expiryStr + ':' + SECRET);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hash));
  const expected = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return { valid: hashPart.toLowerCase() === expected, expiry: expiryStr };
}

async function findTargetTab() {
  const patterns = [
    '*://serviciosenlinea.mined.gob.ni/*',
    'http://localhost/*',
    'http://127.0.0.1/*'
  ];
  for (const url of patterns) {
    const tabs = await chrome.tabs.query({ url });
    if (tabs.length > 0) return tabs[0];
  }
  return null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_MACHINE_ID':
      getMachineID().then(id => sendResponse({ id }));
      return true;

    case 'VALIDATE_LICENSE':
      validateLicense(message.payload.token).then(result => {
        if (result.valid) {
          chrome.storage.local.set({ licenseValid: true, licenseToken: message.payload.token, licenseExpiry: result.expiry });
          sendResponse({ valid: true, expiry: result.expiry });
        } else {
          sendResponse({ valid: false, expired: result.expired });
        }
      });
      return true;

    case 'CHECK_LICENSE':
      chrome.storage.local.get(['licenseValid', 'licenseExpiry']).then(r => sendResponse({ valid: !!r.licenseValid, expiry: r.licenseExpiry || null }));
      return true;

    case 'CHECK_TRIAL':
      getTrialUsed().then(used => sendResponse({ used, remaining: Math.max(0, MAX_TRIAL_STUDENTS - used) }));
      return true;

    case 'USE_TRIAL':
      tryUseTrial(message.payload.count).then(result => sendResponse(result));
      return true;

    case 'INJECT_START':
      (async () => {
        const tab = await findTargetTab();
        if (!tab) {
          sendResponse({ error: 'No se encontró la página del MINED ni el sandbox.' });
          return;
        }
        const result = await chrome.storage.session.get('injectTask');
        const injectTask = result.injectTask || null;
        await chrome.tabs.sendMessage(tab.id, { type: 'INJECT_START', payload: injectTask });
        sendResponse({ ok: true });
      })();
      return true;
  }
});
