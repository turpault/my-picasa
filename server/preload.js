const ipcRenderer = window.ipcRenderer = require('electron').ipcRenderer;
const remote = require('electron').remote;
for(const method of ["info", "error", "log"]) {
  console[method] = (...args) => ipcRenderer.invoke(method, args);
}
