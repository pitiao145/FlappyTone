import { LegalPage, LegalShell } from "../ui/LegalPage.tsx";
import { privacyPolicyMd } from "../ui/legalContent.ts";
import "../App.css";
import "../site/site.css";

/** The whole of what `/privacy-policy` serves — one static document. */
export default function PrivacyApp() {
  return (
    <LegalShell path="/privacy-policy">
      <LegalPage markdown={privacyPolicyMd} />
    </LegalShell>
  );
}
