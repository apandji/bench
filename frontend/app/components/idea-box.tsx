"use client";

import { type FormEvent, useState } from "react";
import type { Idea } from "../lib/types";

export function IdeaBox({
  ideas,
  isOpen,
  onSubmit,
  onToggle,
}: {
  ideas: Idea[];
  isOpen: boolean;
  onSubmit: (text: string) => Promise<string | null>;
  onToggle: () => void;
}) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSending || text.trim().length < 3) {
      return;
    }

    setIsSending(true);
    const error = await onSubmit(text);
    setIsSending(false);

    if (error) {
      setStatus(error);
      return;
    }

    setText("");
    setStatus("Dropped in the box. Thanks!");
  };

  const recent = ideas.slice(-5).reverse();

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="h-8 border border-[var(--line)] bg-[color-mix(in_oklab,var(--paper)_88%,transparent)] px-3 font-[family-name:var(--font-body)] text-xs font-medium text-[var(--ink)] backdrop-blur-sm transition hover:bg-[var(--paper)]"
      >
        {isOpen ? "Close idea box" : `Idea box · ${ideas.length}`}
      </button>

      {isOpen ? (
        <div className="w-[min(20rem,calc(100vw-2.5rem))] rounded-sm bg-[color-mix(in_oklab,var(--paper)_92%,transparent)] p-3 text-left shadow-[0_12px_40px_rgba(28,40,28,0.16)] backdrop-blur-sm">
          <p className="font-[family-name:var(--font-body)] text-xs text-[var(--ink-soft)]">
            What should this park have next? Ideas are saved to a markdown file
            that Claude reads to build new features.
          </p>
          <form onSubmit={submit} className="mt-2 flex flex-col gap-2">
            <textarea
              value={text}
              onChange={(event) => {
                setText(event.target.value.slice(0, 500));
                setStatus(null);
              }}
              rows={3}
              placeholder="A pond with ducks you can feed…"
              className="w-full resize-none border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 font-[family-name:var(--font-body)] text-sm text-[var(--ink)] outline-none focus:border-[var(--ink)]"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="font-[family-name:var(--font-body)] text-xs text-[var(--ink-soft)]">
                {status ?? `${text.length}/500`}
              </span>
              <button
                type="submit"
                disabled={isSending || text.trim().length < 3}
                className="h-8 bg-[var(--ink)] px-3 font-[family-name:var(--font-body)] text-xs font-semibold text-[var(--paper)] transition disabled:opacity-40"
              >
                {isSending ? "Sending…" : "Drop it in"}
              </button>
            </div>
          </form>

          {recent.length ? (
            <ul className="mt-3 flex max-h-48 flex-col gap-1.5 overflow-y-auto border-t border-[var(--line)] pt-2">
              {recent.map((idea) => (
                <li
                  key={`${idea.createdAt}-${idea.author}`}
                  className="font-[family-name:var(--font-body)] text-xs leading-snug text-[var(--ink)]"
                >
                  <span className="font-semibold">{idea.author}:</span>{" "}
                  {idea.text}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
