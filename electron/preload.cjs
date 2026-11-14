'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function call(channel, key, value) {
  const reply = ipcRenderer.sendSync(channel, key, value);
  if (!reply || reply.ok !== true) {
    throw new Error(reply?.error || 'Secure storage is unavailable');
  }
  return reply.value;
}

contextBridge.exposeInMainWorld('financeHubDesktop', {
  secureStorage: {
    getItem: (key) => call('secure-storage:get', key),
    setItem: (key, value) => { call('secure-storage:set', key, value); },
    removeItem: (key) => { call('secure-storage:remove', key); },
  },
  onBeforeClose: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('app:before-close', listener);
    return () => ipcRenderer.removeListener('app:before-close', listener);
  },
  closeReady: () => ipcRenderer.send('app:close-ready'),
  oauth: {
    redirectUrl: 'http://127.0.0.1:53682/auth/callback',
    openExternal: (url) => ipcRenderer.send('oauth:open-external', url),
    onCallback: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('oauth:callback', listener);
      return () => ipcRenderer.removeListener('oauth:callback', listener);
    },
  },
  updater: {
    check: (current) => ipcRenderer.invoke('updater:check', current),
    download: () => ipcRenderer.invoke('updater:download'),
    cancel: () => ipcRenderer.invoke('updater:cancel'),
    install: () => ipcRenderer.invoke('updater:install'),
    onState: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('updater:state', listener);
      return () => ipcRenderer.removeListener('updater:state', listener);
    },
  },
});
