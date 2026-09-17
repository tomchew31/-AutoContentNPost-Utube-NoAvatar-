/**
 * Splits the script into timed cues, distributing timing across the
 * video's actual duration (from the edge-tts narration) proportionally to each sentence's
 * word count. Not word-perfect lip-sync timing, but close enough for
 * readable captions without needing speech-to-text.
 *
 * Returns raw cue objects — used directly by burnCaptions.js (drawtext
 * approach). cuesToSrt() below converts the same data to .srt format,
 * kept only for saving alongside the run's output as a human-readable
 * reference file, not used for the actual burn-in anymore.
 */
export function buildCues(script, durationSeconds) {
  const sentences = script
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length === 0) return [];

  const wordCounts = sentences.map((s) => s.split(/\s+/).length);
  const totalWords = wordCounts.reduce((a, b) => a + b, 0);

  let cursor = 0;
  const cues = [];

  sentences.forEach((sentence, i) => {
    const share = wordCounts[i] / totalWords;
    const start = cursor;
    const end = i === sentences.length - 1 ? durationSeconds : cursor + share * durationSeconds;
    cursor = end;
    cues.push({ text: sentence, start, end });
  });

  return cues;
}

export function cuesToSrt(cues) {
  const lines = [];
  cues.forEach((cue, i) => {
    lines.push(String(i + 1));
    lines.push(`${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}`);
    lines.push(cue.text);
    lines.push("");
  });
  return lines.join("\n");
}

function formatTimestamp(totalSeconds) {
  const ms = Math.round((totalSeconds % 1) * 1000);
  const totalWholeSeconds = Math.floor(totalSeconds);
  const s = totalWholeSeconds % 60;
  const m = Math.floor(totalWholeSeconds / 60) % 60;
  const h = Math.floor(totalWholeSeconds / 3600);
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}
