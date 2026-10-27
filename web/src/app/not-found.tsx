import Link from "next/link";

export default function NotFound() {
  return <main id="main-content" className="page-width exam-page"><section className="placeholder-card"><span className="eyebrow">404 · SESSION NOT FOUND</span><h1>Let’s find your starting point.</h1><p>This test selection does not exist. Choose a collection, test, skill, and mode from the library.</p><Link href="/#library" className="primary-button">Back to Library →</Link></section></main>;
}
