import { create } from "zustand";
import {
  defaultImageOptions,
  type ImageOptions,
  type ConversionInput,
  type ConversionResult,
} from "../../../../shared/conversion";
import { useApp } from "../../store";

export type ImageItem = ConversionInput & {
  width: number;
  height: number;
  thumbnail: string;
  rotation: 0 | 90 | 180 | 270;
};
type State = {
  mode: "home" | "image" | "pdf";
  images: ImageItem[];
  options: ImageOptions;
  docId: string | null;
  currentPage: number;
  selected: number[];
  selection: "all" | "current" | "selected" | "range";
  range: string;
  format: "jpeg" | "png";
  dpi: 72 | 150 | 200 | 300;
  quality: number;
  result: ConversionResult | null;
  set: (patch: Partial<Omit<State, "set">>, dirty?: boolean) => void;
};
export const useConverter = create<State>((update) => ({
  mode: "home",
  images: [],
  options: defaultImageOptions,
  docId: null,
  currentPage: 1,
  selected: [],
  selection: "all",
  range: "",
  format: "jpeg",
  dpi: 200,
  quality: 0.92,
  result: null,
  set: (patch, dirty = true) => {
    update(patch);
    if (dirty) {
      const app = useApp.getState();
      app.set({ dirtyWorkspaces: { ...app.dirtyWorkspaces, convert: true } });
    }
  },
}));
