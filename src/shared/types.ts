export type Workspace = "home" | "reader" | "merge" | "split";
export type Source = { id: string; pages: number[] };
export type Output = { name: string; sources: Source[] };
export type ExportPlan = { outputs: Output[] };
export type LocalFile = {
  id: string;
  name: string;
  size: number;
  bytes: Uint8Array;
};
export type SavedFile = { id: string; name: string };
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export interface FolioAPI {
  pickFiles(multiple: boolean): Promise<Result<LocalFile[]>>;
  importFiles(files: File[]): Promise<Result<LocalFile[]>>;
  sample(): Promise<Result<LocalFile[]>>;
  setPassword(id: string, password: string): Promise<Result<void>>;
  export(plan: ExportPlan): Promise<Result<SavedFile[] | null>>;
  openSaved(id: string): Promise<Result<LocalFile[]>>;
  showSaved(id: string): Promise<Result<void>>;
  window(action: "minimize" | "maximize" | "close"): void;
  onProgress(callback: (message: string | null) => void): () => void;
}
declare global {
  interface Window {
    folio: FolioAPI;
  }
}
