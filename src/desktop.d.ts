import type { Notebook } from "./model";
declare global {
  interface Window {
    notebookDesktop?: {
      load: () => Promise<Notebook | null>;
      export: (state: Notebook) => Promise<string | null>;
      save: (state: Notebook) => Promise<void>;
      backup: (reason: "manual" | "restore") => Promise<string | null>;
      location: () => Promise<{ database: string; backups: string }>;
      openDataFolder: () => Promise<void>;
      openLink: (url: string) => Promise<void>;
      onClose: (callback: () => void) => () => void;
      closeReady: () => void;
    };
  }
}
