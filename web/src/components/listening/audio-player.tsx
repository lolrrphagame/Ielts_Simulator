"use client";

import { useEffect, useRef, useState } from "react";
import type { Attempt, ListeningTest } from "@/lib/listening/schema";

export function AudioPlayer({
  test,
  attempt,
  onPosition,
  expired,
}: {
  test: ListeningTest;
  attempt: Attempt;
  onPosition: (index: number, time: number) => void;
  expired: boolean;
}) {
  const player = useRef<HTMLAudioElement>(null);
  const lastSaved = useRef(0);
  const savedTime = useRef(attempt.audioTime);
  const autoNext = useRef(false);
  const [message, setMessage] = useState("");
  const [playing, setPlaying] = useState(false);
  const item = test.audio[attempt.audioIndex];
  const active = attempt.status === "active" && !expired;
  useEffect(() => {
    if (!active) player.current?.pause();
  }, [active]);
  async function play() {
    try {
      await player.current?.play();
      setMessage("");
    } catch {
      setMessage(
        "Playback was blocked. Press Play audio again, or check your browser audio settings.",
      );
    }
  }
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
      <audio
        ref={player}
        key={item.id}
        src={item.url}
        preload="metadata"
        controls={attempt.mode === "practice" && active}
        controlsList="nodownload"
        onLoadedMetadata={() => {
          if (player.current)
            player.current.currentTime = Math.min(
              savedTime.current,
              player.current.duration || 0,
            );
          if (autoNext.current) {
            autoNext.current = false;
            void play();
          }
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() =>
          setMessage(
            "Audio could not be loaded. Check the local server and reload to renew access. Your saved answers are retained.",
          )
        }
        onTimeUpdate={() => {
          const time = player.current?.currentTime ?? 0;
          if (Math.abs(time - lastSaved.current) >= 5) {
            lastSaved.current = time;
            savedTime.current = time;
            onPosition(attempt.audioIndex, time);
          }
        }}
        onEnded={() => {
          if (attempt.audioIndex + 1 < test.audio.length) {
            savedTime.current = 0;
            lastSaved.current = 0;
            autoNext.current = true;
            onPosition(attempt.audioIndex + 1, 0);
          } else
            setMessage(
              "All recordings finished. Review your answers before submission.",
            );
        }}
      />
      {attempt.mode === "exam" && (
        <button
          className="secondary-button"
          disabled={!active || playing}
          onClick={() => void play()}
        >
          {playing ? "Playing…" : "Play audio"}
        </button>
      )}
      {attempt.mode === "practice" && (
        <label>
          Recording
          <select
            disabled={!active}
            value={attempt.audioIndex}
            onChange={(event) => {
              savedTime.current = 0;
              lastSaved.current = 0;
              autoNext.current = false;
              onPosition(Number(event.target.value), 0);
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
      {message && (
        <p role="status" className="audio-message">
          {message}
        </p>
      )}
    </section>
  );
}
