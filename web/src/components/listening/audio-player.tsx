"use client";
import {
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import type { Attempt, ListeningTest } from "@/lib/listening/schema";

export type AudioPlayerHandle = {
  pauseAndRead: () => { index: number; time: number } | null;
};
type Position = (index: number, time: number, fromIndex: number) => boolean;

export function AudioPlayer({
  test,
  attempt,
  onPosition,
  expired,
  disabled = false,
  controlRef,
}: {
  test: ListeningTest;
  attempt: Attempt;
  onPosition: Position;
  expired: boolean;
  disabled?: boolean;
  controlRef?: Ref<AudioPlayerHandle>;
}) {
  const transport = useRef<AudioPlayerHandle>(null);
  const autoNext = useRef<string | null>(null);
  const current = useRef("");
  const token = `${attempt.id}:${attempt.audioIndex}`;
  useLayoutEffect(() => {
    current.current = token;
    if (autoNext.current && autoNext.current !== token) autoNext.current = null;
  }, [token]);
  const item = test.audio[attempt.audioIndex];
  const active = attempt.status === "active" && !expired && !disabled;
  useImperativeHandle(
    controlRef,
    () => ({ pauseAndRead: () => transport.current?.pauseAndRead() ?? null }),
    [],
  );
  return (
    <section className="listening-audio" aria-label="Listening audio">
      <div>
        <strong>{item.label}</strong>
        <span>
          {test.audio.length === 1
            ? "Original full-test recording"
            : `Recording ${attempt.audioIndex + 1} of ${test.audio.length}`}
        </span>
      </div>
      <Recording
        key={token}
        controlRef={transport}
        url={item.url}
        index={attempt.audioIndex}
        initialTime={attempt.audioTime}
        mode={attempt.mode}
        active={active}
        isCurrent={() => current.current === token}
        onTime={(time) =>
          onPosition(attempt.audioIndex, time, attempt.audioIndex)
        }
        takeAutoPlay={() => {
          const play = autoNext.current === token;
          if (play) autoNext.current = null;
          return play;
        }}
        onEnded={(shouldPlay) => {
          if (attempt.audioIndex + 1 >= test.audio.length) return false;
          const next = attempt.audioIndex + 1;
          const accepted = onPosition(next, 0, attempt.audioIndex);
          autoNext.current =
            accepted && shouldPlay ? `${attempt.id}:${next}` : null;
          return accepted;
        }}
      />
      {attempt.mode === "practice" && (
        <label>
          Recording
          <select
            disabled={!active}
            value={attempt.audioIndex}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (next === attempt.audioIndex) return;
              autoNext.current = null;
              onPosition(next, 0, attempt.audioIndex);
            }}
          >
            {test.audio.map((audio, index) => (
              <option value={index} key={audio.id}>
                {audio.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}

function Recording({
  url,
  index,
  initialTime,
  mode,
  active,
  isCurrent,
  onTime,
  onEnded,
  takeAutoPlay,
  controlRef,
}: {
  url: string;
  index: number;
  initialTime: number;
  mode: Attempt["mode"];
  active: boolean;
  isCurrent: () => boolean;
  onTime: (time: number) => void;
  onEnded: (playing: boolean) => boolean;
  takeAutoPlay: () => boolean;
  controlRef: Ref<AudioPlayerHandle>;
}) {
  const player = useRef<HTMLAudioElement>(null);
  const alive = useRef(true),
    played = useRef(false);
  const initial = useRef(initialTime),
    lastSaved = useRef(initialTime);
  const [playing, setPlaying] = useState(false),
    [message, setMessage] = useState("");
  const current = (node: HTMLAudioElement) =>
    alive.current && isCurrent() && player.current === node;
  useEffect(() => {
    alive.current = true;
    const node = player.current;
    return () => {
      alive.current = false;
      node?.pause();
    };
  }, []);
  useEffect(() => {
    if (!active) player.current?.pause();
  }, [active]);
  useImperativeHandle(controlRef, () => ({
    pauseAndRead: () => {
      const node = player.current;
      if (!node || !current(node)) return null;
      const time = Number.isFinite(node.currentTime)
        ? node.currentTime
        : initial.current;
      node.pause();
      return { index, time };
    },
  }));
  function save(node: HTMLAudioElement, force = false) {
    if (!active || !current(node) || !Number.isFinite(node.currentTime)) return;
    if (force || Math.abs(node.currentTime - lastSaved.current) >= 5) {
      lastSaved.current = node.currentTime;
      onTime(node.currentTime);
    }
  }
  async function play() {
    const node = player.current;
    if (!node || !active || !current(node)) return;
    try {
      await node.play();
      if (current(node)) setMessage("");
    } catch {
      if (current(node))
        setMessage(
          "Playback was blocked. Press Play audio, or check browser audio settings.",
        );
    }
  }
  return (
    <>
      <audio
        ref={player}
        src={url}
        preload="metadata"
        controls={mode === "practice" && active}
        controlsList="nodownload"
        onLoadedMetadata={(e) => {
          const node = e.currentTarget;
          if (!current(node)) return;
          node.currentTime = Math.min(initial.current, node.duration || 0);
          if (takeAutoPlay()) void play();
        }}
        onPlay={(e) => {
          if (current(e.currentTarget)) {
            played.current = true;
            setPlaying(true);
          }
        }}
        onPause={(e) => {
          if (!current(e.currentTarget)) return;
          setPlaying(false);
          if (!e.currentTarget.ended) played.current = false;
          if (mode === "practice") save(e.currentTarget, true);
        }}
        onSeeked={(e) => {
          if (mode === "practice") save(e.currentTarget, true);
        }}
        onTimeUpdate={(e) => save(e.currentTarget)}
        onEnded={(e) => {
          if (!active || !current(e.currentTarget)) return;
          setPlaying(false);
          if (!onEnded(played.current && e.currentTarget.ended))
            setMessage(
              "All recordings finished. Review your answers before submission.",
            );
        }}
        onError={(e) => {
          if (current(e.currentTarget))
            setMessage(
              "Audio could not be loaded. Check the local server and reload. Your answers are retained.",
            );
        }}
      />
      <button
        className="secondary-button"
        disabled={!active || (mode === "exam" && playing)}
        onClick={() => {
          if (playing && mode === "practice") player.current?.pause();
          else void play();
        }}
      >
        {playing
          ? mode === "practice"
            ? "Pause audio"
            : "Playing…"
          : "Play audio"}
      </button>
      {message && (
        <p role="status" className="audio-message">
          {message}
        </p>
      )}
    </>
  );
}
