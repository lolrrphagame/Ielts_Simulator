import path from "node:path";

// Test runners supply a fresh directory. HTTP requests can never choose it.
export const localDataRoot = () =>
  path.resolve(
    /* turbopackIgnore: true */ process.env.IELTS_DATA_ROOT || ".local",
  );
