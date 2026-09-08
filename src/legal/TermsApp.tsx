import { LegalPage } from "../ui/LegalPage.tsx";
import { termsOfServiceMd } from "../ui/legalContent.ts";
import "../App.css";

/** The whole of what `/terms-of-service` serves — one static document. */
export default function TermsApp() {
  return (
    <div className="app">
      <div className="app-main">
        <div className="frame">
          <LegalPage markdown={termsOfServiceMd} />
        </div>
      </div>
    </div>
  );
}
