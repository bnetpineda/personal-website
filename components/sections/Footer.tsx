import { ArrowUp } from "lucide-react";

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer__top">
          <div className="footer__big">
            STILL
            <br />
            BUILD<em>.</em>
          </div>
          <a className="btn btn--accent btn--lg" href="#top">
            Back to top <ArrowUp size={18} />
          </a>
        </div>
        <div className="footer__bottom">
          <span>© {new Date().getFullYear()} Mark Bennett Pineda — built with endurance.</span>
          <span>React · Next.js · Node · 1% better daily</span>
        </div>
      </div>
    </footer>
  );
}
