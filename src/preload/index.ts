import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { PaperinAPI } from "../shared/types";
const api: PaperinAPI = {
  conversionPick: (kind) => ipcRenderer.invoke("conversion:pick", kind),
  conversionImport: (files) =>
    ipcRenderer.invoke(
      "conversion:import",
      files.map((file) => webUtils.getPathForFile(file)),
    ),
  conversionRead: (id) => ipcRenderer.invoke("conversion:read", id),
  conversionRelease: (ids) => ipcRenderer.invoke("conversion:release", ids),
  conversionBegin: (plan) => ipcRenderer.invoke("conversion:begin", plan),
  conversionAppend: (id, bytes) =>
    ipcRenderer.invoke("conversion:append", { id, bytes }),
  conversionFinish: (id) => ipcRenderer.invoke("conversion:finish", id),
  conversionAbort: (id, failed) =>
    ipcRenderer.invoke("conversion:abort", { id, failed }),
  pickFiles: (multiple) => ipcRenderer.invoke("files:pick", multiple),
  importFiles: (files) =>
    ipcRenderer.invoke(
      "files:import",
      files.map((file) => webUtils.getPathForFile(file)),
    ),
  sample: () => ipcRenderer.invoke("files:sample"),
  setPassword: (id, password) =>
    ipcRenderer.invoke("files:password", { id, password }),
  export: (plan) => ipcRenderer.invoke("pdf:export", plan),
  beginSignature: (id) => ipcRenderer.invoke("signature:begin", id),
  pickSignature: (id) => ipcRenderer.invoke("signature:pick", id),
  endSignature: (id) => ipcRenderer.invoke("signature:end", id),
  exportSignature: (plan) => ipcRenderer.invoke("signature:export", plan),
  openSaved: (id) => ipcRenderer.invoke("saved:open", id),
  showSaved: (id) => ipcRenderer.invoke("saved:show", id),
  window: (action) => ipcRenderer.send("window:action", action),
  onProgress: (callback) => {
    const listener = (_: unknown, message: string | null) => callback(message);
    ipcRenderer.on("pdf:progress", listener);
    return () => ipcRenderer.removeListener("pdf:progress", listener);
  },
};
contextBridge.exposeInMainWorld("paperin", api);
