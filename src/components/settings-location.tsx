import { createContext, useContext, useState } from "react";

// Owned by the mounted settings controller, never written to browser storage.
export const SettingsLocationContext = createContext<Map<string, boolean> | null>(null);

export function useSettingsDisclosure(key: string) {
  const memory = useContext(SettingsLocationContext);
  const [open, setOpen] = useState(() => memory?.get(key) ?? false);
  const change = (value: boolean | ((previous: boolean) => boolean)) => {
    setOpen(previous => {
      const next = typeof value === "function" ? value(previous) : value;
      memory?.set(key, next);
      return next;
    });
  };
  return [open, change] as const;
}
