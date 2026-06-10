import { useTheme } from "@carbon/react";

const DARK_MAP: Record<string, string> = {
  "white": "#262626",
  "#fff": "#262626",
  "#ffffff": "#262626",
  "#f4f4f4": "#262626",
  "#fafafa": "#333333",
  "#e0e0e0": "#393939",
  "#e8f0fe": "#1a2a3a",
  "#f0f7ff": "#1a2530",
  "#161616": "#f4f4f4",
  "#525252": "#c6c6c6",
  "#6f6f6f": "#a8a8a8",
  "#8d8d8d": "#a0a0a0",
  "#e8e8e8": "#333333",
  "#f0f0f0": "#333333",
  "#c6c6c6": "#525252",
  "#002d9c": "#78a9ff",
};

function useIsDark(): boolean {
  const { theme } = useTheme();
  return theme === "g90" || theme === "g100";
}

export function useThemeColor(light: string, dark: string): string {
  return useIsDark() ? dark : light;
}

export function useAutoThemeColor(lightColor: string): string {
  return useIsDark() ? (DARK_MAP[lightColor.toLowerCase()] ?? lightColor) : lightColor;
}

export { useIsDark };
