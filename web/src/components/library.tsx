"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { defaultSelection, examHref, modes, parseSelection, skills, tests, volumes, type Selection } from "@/lib/catalog";
import { ChoiceGroup } from "./choice-group";
import { Icon } from "./icon";

export function Library() {
  const query = useSearchParams();
  const initial = parseSelection({ volume: query.get("volume"), test: query.get("test"), skill: query.get("skill"), mode: query.get("mode") }) ?? defaultSelection;
  return <LibraryContent key={JSON.stringify(initial)} initial={initial} />;
}

function LibraryContent({ initial }: { initial: Selection }) {
  const [selection, setSelection] = useState(initial);
  function select<K extends keyof Selection>(key: K, value: Selection[K]) { setSelection((previous) => ({ ...previous, [key]: value })); }
  const skill = skills.find((item) => item.id === selection.skill)!;
  const mode = modes.find((item) => item.id === selection.mode)!;
  return <main id="main-content" className="page-width">
    <section className="hero"><div><div className="eyebrow"><span /> YOUR NEXT CHAPTER STARTS HERE</div><h1>Practice with purpose.<br /><span>Walk in with confidence.</span></h1><p>A focused space for your IELTS preparation.<br className="hidden sm:block" /> Pick your test, find your rhythm, and take the next step.</p><div className="hero-details"><span><Icon name="monitor" /> Computer-based experience</span><span><Icon name="grid" /> All four skills, one place</span></div></div><div className="hero-art" aria-hidden="true"><div className="art-orbit" /><div className="art-paper paper-back" /><div className="art-paper"><div className="art-paper-heading"><span className="art-logo">i.</span><span>YOUR IELTS JOURNEY</span></div><div className="art-title">Small steps.<br />Big possibilities.</div><div className="art-line" /><div className="art-line short" /><div className="art-check"><Icon name="check" /><span>A little better, every day.</span></div><div className="art-bottom">LET’S GET STARTED <Icon name="arrow" /></div></div><div className="art-float"><Icon name="book" /> Made for focused practice</div><span className="art-spark">✦</span></div></section>
    <section id="library" className="library-section"><div className="section-heading"><div><div className="eyebrow">THE TEST LIBRARY</div><h2>Make today a practice day.</h2><p>Choose your starting point. We’ll take it from here.</p></div><span className="catalog-count">3 volumes <span>·</span> 12 test selections</span></div>
    <div className="library-layout"><div className="setup-card"><div className="step-heading"><span>01</span><h3>Choose your test</h3><span className="step-caption">Your starting point</span></div>
    <ChoiceGroup legend="Cambridge collection" options={volumes} value={selection.volume} onChange={(value) => select("volume", value)} className="volume-group" render={(volume, selected) => <><span className={`book-cover cover-${volume}`} aria-hidden="true"><span>CAMBRIDGE</span><strong>IELTS <b>{volume}</b></strong><span>ACADEMIC<br />TEST COLLECTION</span><i /></span><span className="volume-label">Cambridge {volume}<span className={`radio-dot ${selected ? "checked" : ""}`} /></span><span className="volume-caption">4 tests · 4 skills</span></>} />
    <ChoiceGroup legend="Test number" options={tests} value={selection.test} onChange={(value) => select("test", value)} className="test-group" render={(test) => <>Test {test}</>} />
    <div className="step-heading skill-heading"><span>02</span><h3>Pick a skill</h3><span className="step-caption">One focus at a time</span></div>
    <ChoiceGroup legend="Skill" options={skills.map((item) => item.id)} value={selection.skill} onChange={(value) => select("skill", value)} className="skill-group" render={(id, selected) => { const item = skills.find((item) => item.id === id)!; return <><span className={`skill-icon ${item.color}`}><Icon name={item.icon} /></span><span className="skill-name">{item.name}</span><span className="skill-description">{item.description}</span>{selected && <span className="skill-check"><Icon name="check" /></span>}</>; }} />
    </div><aside className="session-card"><div className="step-heading"><span>03</span><h3>Make it your session</h3></div><ChoiceGroup legend="Choose a mode" options={modes.map((item) => item.id)} value={selection.mode} onChange={(value) => select("mode", value)} className="mode-group" render={(id, selected) => { const item = modes.find((item) => item.id === id)!; return <><Icon name={item.icon} /><span><strong>{item.name}</strong><small>{item.description}</small></span><span className={`radio-dot ${selected ? "checked" : ""}`} /></>; }} />
    <div className="session-summary" aria-live="polite"><span className="eyebrow">YOUR SESSION</span><h3>Cambridge {selection.volume} <span>/</span> Test {selection.test}</h3><div><span className={`skill-icon ${skill.color}`}><Icon name={skill.icon} /></span><span>{skill.name}<small>{mode.name}</small></span></div></div><Link className="primary-button" href={examHref(selection)}>{selection.mode === "practice" ? "Start Practice" : "Start Exam"}<Icon name="arrow" /></Link><p className="session-note">Phase 1 preview · Opens a placeholder workspace.<br />Test content and timers are not active yet.</p><div className="session-tip"><Icon name="leaf" /><p><strong>Consistency makes the difference.</strong>Start with one skill. Build from there.</p></div></aside></div></section>
    <section id="how-it-works" className="how-section"><div><span className="eyebrow">A SIMPLE ROUTINE</span><h2>A clear path to your next session.</h2></div><div className="how-grid">{[{ number: "01", title: "Find your test", text: "Choose a Cambridge collection and a test number." }, { number: "02", title: "Set your focus", text: "Pick a skill and the mode that fits your study session." }, { number: "03", title: "Open your workspace", text: "Explore your session preview. Test activities arrive in a later phase." }].map((item) => <article key={item.number}><span>{item.number}</span><div><h3>{item.title}</h3><p>{item.text}</p></div></article>)}</div></section>
  </main>;
}
