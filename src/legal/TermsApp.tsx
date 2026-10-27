import { LegalPage, LegalShell } from "../ui/LegalPage.tsx";
import { termsOfServiceMd } from "../ui/legalContent.ts";
import "../App.css";
import "../site/site.css";

/** The whole of what `/terms-of-service` serves — one static document. */
export default function TermsApp() {
  return (
    <LegalShell path="/terms-of-service">
      <LegalPage markdown={termsOfServiceMd} />
    </LegalShell>
  );
}
