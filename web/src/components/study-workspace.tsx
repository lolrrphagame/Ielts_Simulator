"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import type { ConversionDetail } from "@/lib/conversion";
import type { StudyDraft } from "@/lib/server/study-drafts";
import { AnnotationSurface } from "./annotation-tools";

export function StudyWorkspace({ detail, draft, onChange, status, error }: {
  detail: ConversionDetail; draft: StudyDraft; onChange: (patch: Partial<StudyDraft>) => void; status: string; error: string;
}) {
  const [scan, setScan] = useState(false);
  const [task, setTask] = useState(0);
  const [width, setWidth] = useState(52);
  const [zoom, setZoom] = useState(false);
  const columns = useRef<HTMLDivElement>(null);
  const content = detail.reviewed;
  const answer = (number: string, value: string) => onChange({ responses: { ...draft.responses, [number]: value } });
  const verified = !!content || !!detail.cards;
  const sourcePages = content?.sourcePages.map(s => s.page) ?? detail.pages.map(p => p.name);
  return <div className="study-workspace">
    <header className="study-status"><strong>{detail.unit.skill.toUpperCase()} · Cambridge {detail.unit.testId.replace("-", " / Test ")}</strong><span role="status">{status}</span>
      <button className="secondary-button" onClick={() => setScan(!scan)}>{scan ? "Hide original scan" : "View original scan"}</button>
    </header>
    {error && <p role="alert">{error}</p>}
    {scan && <details open className="optional-scan"><summary>Original source pages</summary>{sourcePages.map(name => <a key={name} href={`/api/private/conversion-source/${detail.unit.id}/${name}`} target="_blank" rel="noreferrer">{name}</a>)}<Image src={`/api/private/conversion-source/${detail.unit.id}/${sourcePages[0]}`} alt="Original source scan" width={1032} height={1458} unoptimized /></details>}
    {!verified && <p className="workspace-alert">Needs Review — verified text is not available for this task yet. Your saved work is retained. <Link href="/review">Open source review</Link>.</p>}
    {content?.kind === "reading" && <>
      <div className="study-controls"><strong>Passage 1 · Verified · Questions 1–13</strong><span>Passages 2–3: Needs Review</span>
        <label>Passage width<input aria-label="Passage column width" type="range" min={30} max={70} value={width} onChange={e => setWidth(Number(e.target.value))} /></label>
      </div>
      <AnnotationSurface contentId={`${detail.unit.id}-reviewed-reading-v1`} annotations={draft.annotations} onChange={annotations => onChange({ annotations })}>
        {mark => <div ref={columns} className="reading-workspace" style={{ "--passage-width": `${width}fr`, "--question-width": `${100-width}fr` } as CSSProperties}>
          <section className="reading-passage" aria-label="Reading passage">
            {content.passages.map(p => <article key={p.id}><p className="source-instruction">{mark(`${p.id}-instruction`, p.instruction)}</p><h2>{mark(`${p.id}-title`, p.title)}</h2>{p.paragraphs.map(b => <p key={b.id}>{mark(b.id, b.text)}</p>)}</article>)}
          </section>
          <div role="separator" aria-label="Resize passage columns" aria-orientation="vertical" aria-valuemin={30} aria-valuemax={70} aria-valuenow={width} tabIndex={0} className="column-divider"
            onKeyDown={e => { if (["ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); setWidth(w => Math.max(30, Math.min(70, w + (e.key === "ArrowRight" ? 2 : -2)))); } }}
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); }}
            onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; const rect = columns.current?.getBoundingClientRect(); if (rect) setWidth(Math.max(30, Math.min(70, Math.round((e.clientX - rect.left) / rect.width * 100)))); }} />
          <section className="reading-questions" aria-label="Reading questions">
            {content.passages.flatMap(p => p.groups).map(g => <section key={g.id}><h2>{mark(`${g.id}-title`, g.title)}</h2>{g.instructions.map((line, i) => <p key={i} className="question-instruction">{mark(`${g.id}-instruction-${i}`, line)}</p>)}
              {g.questions.map(q => <div className="reading-question" key={q.number} id={`reading-question-${q.number}`}>
                {q.options ? <><p><strong>{q.number} </strong>{mark(`reading-q${q.number}-before`, q.before)}</p><select aria-label={`Answer for question ${q.number}`} value={draft.responses[q.number] ?? ""} onChange={e => answer(String(q.number), e.target.value)}><option value="">Choose an answer</option>{q.options.map(o => <option key={o} value={o}>{o}</option>)}</select></> : <p>{mark(`reading-q${q.number}-before`, q.before)}<label className="inline-gap"><span className="gap-number">{q.number}</span><input aria-label={`Answer for question ${q.number}`} autoComplete="off" maxLength={200} value={draft.responses[q.number] ?? ""} onChange={e => answer(String(q.number), e.target.value)} /></label>{mark(`reading-q${q.number}-after`, q.after)}</p>}
              </div>)}
            </section>)}
          </section>
        </div>}
      </AnnotationSurface>
    </>}
    {content?.kind === "writing" && <>
      <nav className="study-tabs" aria-label="Writing tasks">{content.tasks.map((t, i) => <button key={t.id} aria-pressed={task === i} onClick={() => setTask(i)}>{t.title}</button>)}</nav>
      <div className="writing-workspace"><section className="writing-prompt"><h2>{content.tasks[task].title}</h2>{content.tasks[task].paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        {content.tasks[task].chart && <figure><Image src={`/api/private/conversion-crop/${detail.unit.id}/task-1-enhanced.png`} alt="Verified Task 1 chart with original labels, axes and legend" width={1326} height={827} unoptimized /><button className="secondary-button" onClick={() => setZoom(true)}>Zoom chart</button></figure>}
      </section><section className="writing-editor"><label htmlFor="writing-response">Your response</label><textarea id="writing-response" aria-label={`Writing ${content.tasks[task].id} response`} value={draft.responses[content.tasks[task].id] ?? ""} maxLength={30000} spellCheck={false} onChange={e => answer(content.tasks[task].id, e.target.value)} /><p role="status">{(draft.responses[content.tasks[task].id] ?? "").trim().split(/\s+/).filter(Boolean).length} words</p></section></div>
      {zoom && <ChartZoom url={`/api/private/conversion-crop/${detail.unit.id}/task-1-enhanced.png`} onClose={() => setZoom(false)} />}
    </>}
    {detail.cards && <>
      <nav className="study-tabs" aria-label="Speaking parts">{detail.cards.map((c, i) => <button key={c.part} aria-pressed={task === i} onClick={() => setTask(i)}>Part {c.part}</button>)}</nav>
      <div className="speaking-workspace"><AnnotationSurface contentId={`${detail.unit.id}-${detail.pages[0].name}-${detail.pages[0].ocr?.sourceSha256.slice(0,12) ?? "source"}`} annotations={draft.annotations} onChange={annotations => onChange({ annotations })}>
        {mark => <article className="speaking-card"><h2>Part {detail.cards![task].part}</h2><h3>{mark(`card-${task+1}-title`, detail.cards![task].title)}</h3>{detail.cards![task].lines.map((line,i) => <p key={i}>{mark(`card-${task+1}-${i}`,line)}</p>)}</article>}
      </AnnotationSurface><aside className="speaking-tools"><PreparationTimer /><div className="recording-controls"><button disabled>Record response</button><button disabled>Play recording</button><p>Recording and playback are not enabled yet.</p></div><label>Preparation notes<textarea aria-label="Preparation notes" value={draft.responses.preparation ?? ""} maxLength={30000} onChange={e => answer("preparation", e.target.value)} /></label></aside></div>
    </>}
    <details className="personal-study-notes"><summary>Personal notes</summary><textarea aria-label="Review notes" value={draft.notes} maxLength={10000} onChange={e => onChange({ notes: e.target.value })} /></details>
  </div>;
}

function ChartZoom({ url, onClose }: { url: string; onClose: () => void }) {
  const [scale, setScale] = useState(100);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="chart-zoom" onCancel={onClose}><header><h2>Original chart · enhanced copy</h2><button onClick={onClose} autoFocus>Close chart</button></header><label>Zoom<input aria-label="Chart zoom" type="range" min={50} max={200} step={10} value={scale} onChange={e => setScale(Number(e.target.value))} />{scale}%</label><div className="chart-zoom-scroll"><Image src={url} alt="Zoomed verified chart" width={1326} height={827} style={{ width: `${1326 * scale / 100}px`, maxWidth: "none", height: "auto" }} unoptimized /></div></dialog>;
}
function PreparationTimer() {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(60);
  useEffect(() => {
    if (!deadline) return;
    const timer = setInterval(() => { const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000)); setRemaining(seconds); if (!seconds) setDeadline(null); }, 250);
    return () => clearInterval(timer);
  }, [deadline]);
  return <section><h3>Preparation timer</h3><output aria-label="Preparation time remaining">{Math.floor(remaining/60)}:{String(remaining%60).padStart(2,"0")}</output><button onClick={() => setDeadline(deadline ? null : Date.now()+remaining*1000)}>{deadline ? "Pause" : "Start preparation"}</button><button onClick={() => { setDeadline(null); setRemaining(60); }}>Reset timer</button></section>;
}
