import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { libraryHref, modes, parseSelection, skills, tests, volumes } from "@/lib/catalog";

export function generateStaticParams() {
  return volumes.flatMap((volume) => tests.flatMap((test) => skills.flatMap(({ id: skill }) => modes.map(({ id: mode }) => ({ volume, test, skill, mode })))));
}

export default async function ExamPage({ params }: PageProps<"/exam/[volume]/[test]/[skill]/[mode]">) {
  const selection = parseSelection(await params);
  if (!selection) notFound();
  const skill = skills.find((item) => item.id === selection.skill)!;
  const mode = modes.find((item) => item.id === selection.mode)!;
  return <main id="main-content" className="page-width exam-page"><Link className="back-link" href={libraryHref(selection)}>← Back to Library</Link><div className="exam-heading"><div><div className="eyebrow">CAMBRIDGE {selection.volume} / TEST {selection.test}</div><h1>{skill.name} workspace</h1></div><span className="mode-badge"><Icon name={mode.icon} />{mode.name}</span></div><section className="placeholder-card"><span className={`placeholder-icon skill-icon ${skill.color}`}><Icon name={skill.icon} /></span><span className="eyebrow">PHASE 1 · WORKSPACE PREVIEW</span><h2>Your session has a place to begin.</h2><p>You selected Cambridge {selection.volume}, Test {selection.test}, {skill.name}, in {mode.name}. This workspace is ready for the next phase of development.</p><div className="placeholder-notice"><strong>Test content is not available yet.</strong><p>No Cambridge questions or answers are included. Audio playback, timers, recording, submissions, and grading are not active in this preview.</p></div><Link className="primary-button" href={libraryHref(selection)}>Back to Library<Icon name="arrow" /></Link></section></main>;
}
