import type { SignatureExport, SignatureImage } from "./signature";
import type {
  ConversionImport,
  ConversionPlan,
  ConversionResult,
  ConversionStart,
} from "./conversion";
export type Workspace = "home" | "reader" | "merge" | "split" | "convert";
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
export interface PaperinAPI {
  conversionPick(kind: "image" | "pdf"): Promise<Result<ConversionImport>>;
  conversionImport(files: File[]): Promise<Result<ConversionImport>>;
  conversionRead(id: string): Promise<Result<Uint8Array>>;
  conversionRelease(ids: string[]): Promise<Result<void>>;
  conversionBegin(
    plan: ConversionPlan,
  ): Promise<Result<ConversionStart | null>>;
  conversionAppend(id: string, bytes: Uint8Array): Promise<Result<number>>;
  conversionFinish(id: string): Promise<Result<ConversionResult>>;
  conversionAbort(
    id: string,
    failed: boolean,
  ): Promise<Result<ConversionResult>>;
  pickFiles(multiple: boolean): Promise<Result<LocalFile[]>>;
  importFiles(files: File[]): Promise<Result<LocalFile[]>>;
  sample(): Promise<Result<LocalFile[]>>;
  setPassword(id: string, password: string): Promise<Result<void>>;
  export(plan: ExportPlan): Promise<Result<SavedFile[] | null>>;
  beginSignature(documentId: string): Promise<Result<string>>;
  pickSignature(sessionId: string): Promise<Result<SignatureImage | null>>;
  endSignature(sessionId: string): Promise<Result<void>>;
  exportSignature(plan: SignatureExport): Promise<Result<SavedFile | null>>;
  openSaved(id: string): Promise<Result<LocalFile[]>>;
  showSaved(id: string): Promise<Result<void>>;
  window(action: "minimize" | "maximize" | "close"): void;
  onProgress(callback: (message: string | null) => void): () => void;
}
declare global {
  interface Window {
    paperin: PaperinAPI;
  }
}
