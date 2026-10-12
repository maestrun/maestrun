export const COLUMN_IDS = [
  "task",
  "name",
  "status",
  "stage",
  "model",
  "effort",
  "steps",
  "tokens",
] as const;
export type LayoutColumn = Readonly<{
  id: (typeof COLUMN_IDS)[number];
  width: number | "auto";
}>;
export type FlowchartLayout = Readonly<{
  visible: boolean;
  position: "left" | "right" | "top" | "bottom";
  width: number | "auto";
  height: number | "auto";
}>;
export type Layout = Readonly<{
  columns?: readonly LayoutColumn[];
  flowchart: FlowchartLayout;
}>;
export const DEFAULT_LAYOUT: Layout = {
  flowchart: { visible: true, position: "right", width: "auto", height: "auto" },
};
