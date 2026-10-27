export const volumes = ["19", "20", "21"] as const;
export const tests = ["1", "2", "3", "4"] as const;
export const skills = [
  {
    id: "listening",
    name: "Listening",
    description: "Tune in. Pick out the details.",
    icon: "headphones",
    color: "blue",
  },
  {
    id: "reading",
    name: "Reading",
    description: "Read closely. Find your focus.",
    icon: "book",
    color: "green",
  },
  {
    id: "writing",
    name: "Writing",
    description: "Organise ideas. Make your point.",
    icon: "pen",
    color: "orange",
  },
  {
    id: "speaking",
    name: "Speaking",
    description: "Find your voice. Build confidence.",
    icon: "mic",
    color: "purple",
  },
] as const;
export const modes = [
  {
    id: "practice",
    name: "Practice Mode",
    description: "A space to learn at your own pace.",
    icon: "leaf",
  },
  {
    id: "exam",
    name: "Exam Mode",
    description: "Prepare for a focused test experience.",
    icon: "clock",
  },
] as const;
export type Selection = {
  volume: (typeof volumes)[number];
  test: (typeof tests)[number];
  skill: (typeof skills)[number]["id"];
  mode: (typeof modes)[number]["id"];
};
export const defaultSelection: Selection = {
  volume: "19",
  test: "1",
  skill: "listening",
  mode: "practice",
};
export function parseSelection(
  value: Record<keyof Selection, string | null>,
): Selection | null {
  const volume = volumes.find((item) => item === value.volume);
  const test = tests.find((item) => item === value.test);
  const skill = skills.find((item) => item.id === value.skill)?.id;
  const mode = modes.find((item) => item.id === value.mode)?.id;
  return volume && test && skill && mode ? { volume, test, skill, mode } : null;
}
export function examHref(selection: Selection) {
  return `/exam/${selection.volume}/${selection.test}/${selection.skill}/${selection.mode}`;
}
export function libraryHref(selection: Selection) {
  return `/?${new URLSearchParams(selection).toString()}#library`;
}
