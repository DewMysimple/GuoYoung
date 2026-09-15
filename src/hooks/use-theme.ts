import { useEffect } from "react";

export function useTheme() {
  useEffect(() => {
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.colorScheme = "light";
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", "#f4f6f9");
  }, []);
}
