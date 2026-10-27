const paths = {
  book: "M12 5C8 2 4 3 2 4v15c3-2 7-1 10 1m0-15c4-3 8-2 10-1v15c-3-2-7-1-10 1V5Z",
  headphones: "M4 14v-3a8 8 0 0 1 16 0v3M4 12H3v8h4v-8H4Zm16 0h1v8h-4v-8h3Z",
  pen: "m15 4 5 5M3 21l5-1L21 7a2 2 0 0 0-5-5L3 15v6Z",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11v1a7 7 0 0 0 14 0v-1M12 19v3m-4 0h8",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  leaf: "M4 20c0-8 8-8 12-13M4 16C-2 4 12 6 21 2c0 15-7 21-17 14Z",
  check: "m5 12 4 4L19 6",
  grid: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z",
  monitor: "M3 3h18v13H3V3Zm5 18h8m-4-5v5",
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
