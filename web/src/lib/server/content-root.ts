import path from "node:path";

// Server-owned configuration, never request-controlled. Tests copy converted
// content here so promotion cannot touch the user's real reviewed documents.
export const privateContentRoot = () =>
  path.resolve(
    /* turbopackIgnore: true */ process.env.IELTS_CONTENT_ROOT ||
      "../private-content",
  );
