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
    case 'VALIDATE_LICENSE':
      try {
        const [encodedDate] = message.payload.token.split('-');
        const expDate = new Date(atob(encodedDate));
        sendResponse({ valid: expDate > new Date() });
      } catch {
        sendResponse({ valid: false });
      }
      return true;

    case 'INJECT_START':
      (async () => {
        const tab = await findTargetTab();
        if (!tab) {
          sendResponse({ error: 'No se encontró la página del MINED ni el sandbox.' });
          return;
        }
        await chrome.tabs.sendMessage(tab.id, { type: 'INJECT_START' });
        sendResponse({ ok: true });
      })();
      return true;
  }
});
