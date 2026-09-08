import { LegalPage } from "../ui/LegalPage.tsx";
import { privacyPolicyMd } from "../ui/legalContent.ts";
import "../App.css";

/** The whole of what `/privacy-policy` serves — one static document. */
export default function PrivacyApp() {
  return (
    <div className="app">
      <div className="app-main">
        <div className="frame">
          <LegalPage markdown={privacyPolicyMd} />
        </div>
      </div>
    </div>
  );
}
