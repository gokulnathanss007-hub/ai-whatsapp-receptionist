import { defineConfig } from "@trigger.dev/sdk";
import { additionalFiles } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: "proj_nqbpvemckwtqbfysizvp",
  dirs: ["./trigger"],
  maxDuration: 60,
  build: {
    extensions: [additionalFiles({ files: ["./prompts/**/*.md"] })],
  },
});
