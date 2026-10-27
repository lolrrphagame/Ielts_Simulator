import Link from "next/link";
import { Icon } from "./icon";

export function SiteHeader() {
  return <header className="site-header"><div className="page-width header-inner"><Link href="/" className="brand" aria-label="IELTS Simulator home"><span className="brand-mark"><Icon name="book" /></span><span>IELTS<span className="font-normal text-slate-500"> Simulator</span></span></Link><nav aria-label="Main navigation"><Link href="/#library">Test Library</Link><Link href="/#how-it-works">How it works</Link></nav><span className="header-tag"><span />Your space to improve</span></div></header>;
}
export function SiteFooter() {
  return <footer className="page-width site-footer"><span>IELTS Simulator <span className="footer-dot">·</span> A little practice. A step forward.</span><span>Independent practice workspace. Not affiliated with Cambridge or IELTS.</span></footer>;
}
