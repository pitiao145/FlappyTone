// Remotion (the promo editor, video/) — see .claude/skills/demo-video/SKILL.md.
// Its own public dir, so Vite's public/ (shipped to the site) never holds renders.
import { Config } from "@remotion/cli/config";

Config.setEntryPoint("./video/src/index.ts");
Config.setPublicDir("./video/public");
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
