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
    <aside className="rounded-[32px] border border-[var(--stroke)] bg-white/90 p-5 shadow-[var(--shadow)] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-[var(--secondary-purple)]">
            <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902.848.137 1.705.248 2.57.331v3.443a.75.75 0 0 0 1.28.53l3.58-3.579a.78.78 0 0 1 .527-.224 41.202 41.202 0 0 0 5.183-.5c1.437-.232 2.43-1.49 2.43-2.903V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0 0 10 2Zm0 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM8 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm5 1a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">AI</p>
            <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">Assistant</h2>
          </div>
        </div>
        <div className="rounded-full border border-[var(--stroke)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--primary-blue)]">
          Live
        </div>
      </div>

      <div
        className="mt-4 flex h-[380px] flex-col gap-3 overflow-y-auto rounded-[24px] border border-[var(--stroke)] bg-[var(--surface)] p-3"
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
            className="mt-2 min-h-16 w-full rounded-[24px] border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--primary-blue)]"
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
