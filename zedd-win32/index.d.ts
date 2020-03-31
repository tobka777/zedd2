export function getMillisSinceLastUserInput(): number;
export function getWindowInfos(): {
  name: string;
  foreground: boolean;
  placement: "maximized" | "minimized" | "normal";
  processName: string;
};
