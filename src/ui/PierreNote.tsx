import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { track } from "../analytics/client.ts";
import {
  accountEmail,
  dismissNote,
  markNoteAnswered,
  NOTE_MAX_CHARS,
  sendNote,
  type NoteContext,
  type NoteCopy,
  type NoteKind,
} from "../data/note.ts";
import { currentDisplayMode } from "../lib/displayMode.ts";
import "./pierreNote.css";

/** Pierre's photo. Until the file exists the avatar falls back to the bird. */
const PHOTO = "/pierre-note.jpg";
const BIRD = "/Bird-hor-no-halo.png";

type Stage = "collapsed" | "card" | "sent";
type Status = "idle" | "sending" | "failed";

/** The generic note's copy. A targeted note (migration 0035) brings its own. */
const GENERIC: NoteCopy = {
  peek: "You've been practising a lot, can I ask you one question?",
  body: "You've been training your tones a lot, that's awesome! I really hope this helps.",
  question: "What are you learning Mandarin for, and what's one thing I should fix?",
};

/**
 * Dev preview copy for `/app?note=targeted`: brief 36's first targeted note
 * (DEV only, dropped from the build with the preview branch).
 */
export const PREVIEW_TARGETED: NoteCopy = {
  peek: "A bug hit your second account, sorry! Can I ask you one question?",
  body:
    "When you made a second account, a bug gave it your first account's name and a used-up run counter. " +
    "Sorry, it's fixed now! A second account is totally fine, by the way. It made my week that you wanted to keep playing.",
  question: "When you ran out of runs, what were you practising, and what did you do next?",
};

function noteContext(tier: string): NoteContext {
  return {
    screen: "play",
    tier,
    display_mode: currentDisplayMode(),
    lang: typeof navigator === "undefined" ? null : navigator.language.slice(0, 20),
  };
}

function Avatar({ className }: { className: string }) {
  const [src, setSrc] = useState(PHOTO);
  return (
    <span className={`pn-avatar ${className}`}>
      <img src={src} alt="Pierre" className="pn-photo" onError={() => setSrc(BIRD)} />
      <img src={BIRD} alt="" className="pn-badge" />
    </span>
  );
}

/**
 * The note-from-Pierre card (migration 0033, `api/note.ts`): a small card at
 * the bottom of the Play home, then the full card with one question.
 *
 * `GameApp.tsx` mounts it only after the server said this player qualifies,
 * or with `preview` from the dev-only `/app?note` (no server call, no event).
 * `note` = a targeted note's own peek, body and question (migration 0035);
 * rendered as React text, never as HTML. Heading, placeholder, checkbox and
 * buttons are the same for both kinds.
 * Portaled to `<body>`: `.frame` is a `container-type` element, so
 * `position: fixed` inside it would anchor to the frame (same as FeedbackWidget).
 */
export function PierreNote({
  onDone,
  note,
  tier = "free",
  preview: previewProp = false,
}: {
  onDone: () => void;
  note?: NoteCopy;
  tier?: string;
  preview?: boolean;
}) {
  // Constant-false in production, so the build drops every preview branch.
  const preview = import.meta.env.DEV && previewProp;
  const titleId = useId();
  const textId = useId();
  const [stage, setStage] = useState<Stage>("collapsed");
  const [message, setMessage] = useState("");
  const [wantsChat, setWantsChat] = useState(false);
  const [email, setEmail] = useState<string | null>(preview ? "player@preview.dev" : null);
  const [status, setStatus] = useState<Status>("idle");
  const copy = note ?? GENERIC;
  const kind: NoteKind = note ? "targeted" : "generic";

  useEffect(() => {
    if (preview) return;
    track({ type: "note_shown", kind });
    void accountEmail().then(setEmail);
    // Once per mount: kind does not change while the card is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  // Close on its own a moment after the thank-you.
  useEffect(() => {
    if (stage !== "sent") return;
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [stage, onDone]);

  const dismiss = (from: "collapsed" | "card") => {
    if (!preview) {
      markNoteAnswered();
      track({ type: "note_dismissed", kind, stage: from });
      void dismissNote(kind, noteContext(tier));
    }
    onDone();
  };

  const canSend = message.trim().length > 0 && status !== "sending";

  const send = async () => {
    if (!canSend) return;
    setStatus("sending");
    if (preview) {
      setStage("sent");
      return;
    }
    const ok = await sendNote(kind, message, wantsChat, noteContext(tier));
    if (!ok) {
      setStatus("failed");
      return;
    }
    markNoteAnswered();
    // Never the message or the email: counts and flags only.
    track({ type: "note_sent", kind, wants_chat: wantsChat });
    setStage("sent");
  };

  if (stage === "collapsed") {
    return createPortal(
      <div className="pn-peek" role="dialog" aria-labelledby={titleId}>
        <button type="button" className="pn-x" onClick={() => dismiss("collapsed")} aria-label="Close">
          ×
        </button>
        <div className="pn-peek-row">
          <Avatar className="pn-avatar--peek" />
          <div>
            <p id={titleId} className="pn-peek-title">
              Hey, Pierre here!
            </p>
            <p className="pn-peek-body">{copy.peek}</p>
          </div>
        </div>
        <div className="pn-actions">
          <button type="button" className="pn-later" onClick={() => dismiss("collapsed")}>
            Not now
          </button>
          <button type="button" className="pn-primary" onClick={() => setStage("card")}>
            Sure, open it
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="pn-backdrop">
      <div className="pn-card" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <span className="pn-tag">
          <img src={BIRD} alt="" />
          Flappy greetings
        </span>
        {stage === "card" && (
          <button type="button" className="pn-x" onClick={() => dismiss("card")} aria-label="Close">
            ×
          </button>
        )}
        <div className="pn-head">
          <Avatar className="pn-avatar--card" />
          <h2 id={titleId} className="pn-title">
            Hey, Pierre here. I build FlappyTone alone.
          </h2>
        </div>

        {stage === "sent" ? (
          <p className="pn-thanks" role="status">
            Thank you! I read every one of these myself.
          </p>
        ) : (
          <>
            <p className="pn-body">{copy.body}</p>
            <p className="pn-kicker">Quick question:</p>
            <label htmlFor={textId} className="pn-question">
              {copy.question}
            </label>
            <textarea
              id={textId}
              className="pn-text"
              rows={4}
              maxLength={NOTE_MAX_CHARS}
              placeholder="Type anything, short is fine"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <p className="pn-kicker pn-kicker--chat">Want to talk more?</p>
            <label className="pn-check">
              <input type="checkbox" checked={wantsChat} onChange={(e) => setWantsChat(e.target.checked)} />
              <span>Happy to do a 10-min chat (I'll email you)</span>
            </label>
            {wantsChat && email && <p className="pn-email">I'll write to {email}</p>}
            {status === "failed" && (
              <p className="pn-error" role="alert">
                Couldn't send that. Check your connection and try again.
              </p>
            )}
            <div className="pn-actions">
              <button type="button" className="pn-later" onClick={() => dismiss("card")}>
                Not now
              </button>
              <button type="button" className="pn-primary pn-send" onClick={() => void send()} disabled={!canSend}>
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path
                    d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
                {status === "sending" ? "Sending…" : "Send to Pierre"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
