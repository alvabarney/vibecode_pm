"use client";

import { FormEvent, useState } from "react";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type AiSidebarProps = {
  messages: ChatMessage[];
  isSending: boolean;
  error: string | null;
  onSendMessage: (message: string) => Promise<void>;
};

export const AiSidebar = ({
  messages,
  isSending,
  error,
  onSendMessage,
}: AiSidebarProps) => {
  const [draft, setDraft] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message) {
      return;
    }

    setDraft("");
    try {
      await onSendMessage(message);
    } catch {
      setDraft(message);
    }
  };

  return (
    <aside className="rounded-[32px] border border-[var(--stroke)] bg-white/90 p-6 shadow-[var(--shadow)] backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
            AI Chat
          </p>
          <h2 className="mt-3 font-display text-2xl font-semibold text-[var(--navy-dark)]">
            Assistant
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
            Ask for updates, card edits, or quick board cleanups.
          </p>
        </div>
        <div className="rounded-full border border-[var(--stroke)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--primary-blue)]">
          Live
        </div>
      </div>

      <div
        className="mt-6 flex h-[420px] flex-col gap-4 overflow-y-auto rounded-[24px] border border-[var(--stroke)] bg-[var(--surface)] p-4"
        aria-label="AI conversation"
      >
        {messages.length === 0 ? (
          <p className="text-sm leading-6 text-[var(--gray-text)]">
            Try: “Create a card in Backlog called Draft launch notes.”
          </p>
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className={`max-w-[92%] rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm ${
                message.role === "user"
                  ? "ml-auto bg-[var(--primary-blue)] text-white"
                  : "border border-[var(--stroke)] bg-white text-[var(--navy-dark)]"
              }`}
            >
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] opacity-75">
                {message.role === "user" ? "You" : "Assistant"}
              </p>
              <p>{message.content}</p>
            </article>
          ))
        )}
      </div>

      {error ? (
        <p className="mt-4 text-sm font-semibold text-[var(--secondary-purple)]">{error}</p>
      ) : null}

      <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
        <label className="block text-sm font-semibold text-[var(--navy-dark)]">
          Message
          <textarea
            className="mt-2 min-h-28 w-full rounded-[24px] border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--primary-blue)]"
            placeholder="Ask the assistant to create, edit, move, or explain a card..."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={isSending}
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSending || !draft.trim()}
        >
          {isSending ? "Sending..." : "Send message"}
        </button>
      </form>
    </aside>
  );
};
