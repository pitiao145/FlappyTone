// `?raw` inlines the file's text at build time, so editing the markdown
// updates the page on the next build — no fetch, no CMS.
import termsOfServiceMd from "../../docs/legal/terms-of-service.md?raw";
import privacyPolicyMd from "../../docs/legal/privacy-policy.md?raw";

export { termsOfServiceMd, privacyPolicyMd };
