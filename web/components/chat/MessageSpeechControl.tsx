"use client";

import { useEffect, useState } from "react";
import {
  getSpeechPlaybackState,
  playSpeech,
  stopSpeech,
  subscribeSpeechPlayback,
  type SpeechPlaybackState,
} from "@/lib/speech/speechPlayback";

export function MessageSpeechControl(props: { messageId: string; content: string }) {
  const [playback, setPlayback] = useState<SpeechPlaybackState>(
    getSpeechPlaybackState,
  );

  useEffect(() => subscribeSpeechPlayback(setPlayback), []);

  const active = playback.messageId === props.messageId;
  const busy = active && ["loading", "speaking"].includes(playback.status);

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() =>
          busy
            ? void stopSpeech()
            : void playSpeech(props.messageId, props.content)
        }
        className="text-xs text-zinc-400 transition-colors hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
        aria-label={busy ? "停止朗读" : "朗读回答"}
      >
        {busy ? "停止朗读" : "朗读"}
      </button>
      {active && playback.message && (
        <span
          role={playback.status === "error" ? "alert" : "status"}
          className={
            playback.status === "error"
              ? "text-xs text-red-600 dark:text-red-400"
              : "text-xs text-amber-600 dark:text-amber-400"
          }
        >
          {playback.message}
        </span>
      )}
    </span>
  );
}
