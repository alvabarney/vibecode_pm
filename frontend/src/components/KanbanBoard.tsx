"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragOverEvent,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { CardEditModal } from "@/components/CardEditModal";
import { AiSidebar, type ChatMessage } from "@/components/AiSidebar";
import {
  ApiError,
  createCard,
  deleteCard,
  getBoard,
  moveCard as moveCardRequest,
  renameColumn,
  sendChat,
  updateCard,
} from "@/lib/api";
import {
  getCardByDndId,
  getColumnIdForDndTarget,
  getMoveDestination,
  type BoardData,
  type Card,
} from "@/lib/kanban";

type KanbanBoardProps = {
  userName?: string;
  onLogout?: () => void;
  isLoggingOut?: boolean;
};

export const KanbanBoard = ({
  userName = "user",
  onLogout,
  isLoggingOut = false,
}: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [overColumnId, setOverColumnId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const loadBoard = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const nextBoard = await getBoard();
      setBoard(nextBoard);
    } catch (fetchError) {
      const message =
        fetchError instanceof ApiError
          ? fetchError.message
          : "Unable to load the board.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadBoard();
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    if (!board) {
      return;
    }
    setOverColumnId(getColumnIdForDndTarget(board, event.over?.id ?? null));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);
    setOverColumnId(null);

    if (!board || !over || active.id === over.id) {
      return;
    }

    const activeCard = getCardByDndId(board, String(active.id));
    const destination = getMoveDestination(board, active.id, over.id);
    if (!activeCard || !destination) {
      return;
    }

    const sourceColumn = board.columns.find((column) =>
      column.cards.some((card) => card.id === activeCard.id)
    );
    if (!sourceColumn) {
      return;
    }

    const currentPosition = sourceColumn.cards.findIndex(
      (card) => card.id === activeCard.id
    );
    if (
      sourceColumn.id === destination.columnId &&
      currentPosition === destination.position
    ) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      setBoard(
        await moveCardRequest(activeCard.id, destination.columnId, destination.position)
      );
    } catch (moveError) {
      const message =
        moveError instanceof ApiError ? moveError.message : "Unable to move the card.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRenameColumn = async (columnId: number, title: string) => {
    setIsSaving(true);
    setError(null);

    try {
      setBoard(await renameColumn(columnId, title));
    } catch (renameError) {
      const message =
        renameError instanceof ApiError
          ? renameError.message
          : "Unable to rename the column.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddCard = async (columnId: number, title: string, details: string) => {
    setIsSaving(true);
    setError(null);

    try {
      setBoard(await createCard(columnId, title, details));
    } catch (createError) {
      const message =
        createError instanceof ApiError ? createError.message : "Unable to add the card.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCard = async (cardId: number) => {
    setIsSaving(true);
    setError(null);

    try {
      setBoard(await deleteCard(cardId));
    } catch (deleteError) {
      const message =
        deleteError instanceof ApiError
          ? deleteError.message
          : "Unable to delete the card.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditCard = (card: Card) => {
    setEditingCard(card);
  };

  const handleSaveCard = async (cardId: number, title: string, details: string) => {
    setIsSaving(true);
    setError(null);

    try {
      setBoard(await updateCard(cardId, title, details));
    } catch (saveError) {
      const message =
        saveError instanceof ApiError ? saveError.message : "Unable to save the card.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const appendMessage = (role: ChatMessage["role"], content: string) => ({
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
  });

  const handleSendMessage = async (message: string) => {
    setIsSendingChat(true);
    setChatError(null);

    try {
      const response = await sendChat(message);
      setMessages((prev) => [
        ...prev,
        appendMessage("user", message),
        appendMessage("assistant", response.assistant_message),
      ]);
      if (response.board) {
        setBoard(response.board);
      }
    } catch (chatRequestError) {
      const messageText =
        chatRequestError instanceof ApiError
          ? chatRequestError.message
          : "Unable to send the message right now.";
      setChatError(messageText);
      throw chatRequestError;
    } finally {
      setIsSendingChat(false);
    }
  };

  const activeCard = board ? getCardByDndId(board, activeCardId) : null;

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="rounded-3xl border border-[var(--stroke)] bg-white px-6 py-5 shadow-[var(--shadow)]">
          Loading your board...
        </div>
      </main>
    );
  }

  if (!board) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md rounded-3xl border border-[var(--stroke)] bg-white px-6 py-5 shadow-[var(--shadow)]">
          <p className="text-sm font-semibold text-[var(--secondary-purple)]">
            {error ?? "Unable to load the board."}
          </p>
          <button
            type="button"
            onClick={() => {
              void loadBoard();
            }}
            className="mt-4 rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="relative">
      {/* Decorative blobs clipped to their own layer so they don't cause scrollbars */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
        <div className="absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />
      </div>

      <main className="relative mx-auto flex min-h-screen w-full flex-col gap-8 px-4 pb-16 pt-10 sm:px-6 xl:px-6 2xl:px-10">
        <header className="flex items-center justify-between gap-3 rounded-[28px] border border-[var(--stroke)] bg-white/80 px-5 py-3.5 shadow-[var(--shadow)] backdrop-blur sm:rounded-[32px] sm:px-8 sm:py-4">
          {/* Left: title + column badges (lg+) */}
          <div className="flex min-w-0 items-center gap-4 lg:gap-6">
            <div className="min-w-0 shrink-0">
              <p className="hidden text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)] sm:block">
                Single Board Kanban
              </p>
              <h1 className="font-display text-xl font-semibold text-[var(--navy-dark)] sm:mt-0.5 sm:text-2xl lg:text-3xl">
                Kanban Studio
              </h1>
            </div>
            <div className="hidden items-center gap-1.5 lg:flex lg:flex-wrap">
              {board.columns.map((column) => (
                <div
                  key={column.id}
                  className="flex items-center gap-1.5 rounded-full border border-[var(--stroke)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-yellow)]" />
                  {column.title}
                </div>
              ))}
            </div>
          </div>

          {/* Right: error + user badge */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {error ? (
              <p className="max-w-[160px] truncate text-xs font-semibold text-[var(--secondary-purple)] sm:max-w-none sm:text-sm">
                {error}
              </p>
            ) : null}
            {onLogout ? (
              <div className="flex items-center gap-2 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
                {/* Username — hidden on very small screens */}
                <div className="hidden sm:block">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                    Signed in as
                  </p>
                  <p className="text-sm font-semibold text-[var(--primary-blue)]">{userName}</p>
                </div>
                {/* Username initial — mobile only */}
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary-blue)] text-xs font-bold text-white sm:hidden"
                  aria-hidden="true"
                >
                  {userName.charAt(0).toUpperCase()}
                </div>
                <button
                  type="button"
                  onClick={onLogout}
                  disabled={isLoggingOut}
                  title="Log out"
                  className="flex items-center gap-1 rounded-full bg-[var(--secondary-purple)] px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:gap-1.5 sm:px-3"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                    <path fillRule="evenodd" d="M2 4.75A2.75 2.75 0 0 1 4.75 2h3a2.75 2.75 0 0 1 2.75 2.75v.5a.75.75 0 0 1-1.5 0v-.5c0-.69-.56-1.25-1.25-1.25h-3c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h3c.69 0 1.25-.56 1.25-1.25v-.5a.75.75 0 0 1 1.5 0v.5A2.75 2.75 0 0 1 7.75 14h-3A2.75 2.75 0 0 1 2 11.25v-6.5Zm9.47.47a.75.75 0 0 1 1.06 0l2.25 2.25a.75.75 0 0 1 0 1.06l-2.25 2.25a.75.75 0 1 1-1.06-1.06l.97-.97H6.75a.75.75 0 0 1 0-1.5h5.69l-.97-.97a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                  </svg>
                  <span className="hidden sm:inline">{isLoggingOut ? "..." : "Log out"}</span>
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <section className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_300px] 2xl:items-start">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            {/* Scroll horizontally on narrow viewports; expand to full grid at lg+ */}
            <div className="overflow-x-auto pb-2 lg:overflow-visible lg:pb-0">
              <section className="grid gap-3 [grid-template-columns:repeat(5,minmax(180px,1fr))] lg:gap-4 lg:[grid-template-columns:repeat(5,minmax(0,1fr))]">
                {board.columns.map((column) => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    cards={column.cards}
                    onRename={handleRenameColumn}
                    onAddCard={handleAddCard}
                    onDeleteCard={handleDeleteCard}
                    onEditCard={handleEditCard}
                    isSaving={isSaving}
                    isActiveDropTarget={overColumnId === column.id}
                  />
                ))}
              </section>
            </div>
            <DragOverlay>
              {activeCard ? (
                <div className="w-[260px]">
                  <KanbanCardPreview card={activeCard} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          <div className="2xl:sticky 2xl:top-8">
            <AiSidebar
              messages={messages}
              isSending={isSendingChat}
              error={chatError}
              onSendMessage={handleSendMessage}
            />
          </div>
        </section>
      </main>

      {editingCard && (
        <CardEditModal
          card={editingCard}
          isSaving={isSaving}
          onSave={handleSaveCard}
          onClose={() => setEditingCard(null)}
        />
      )}
    </div>
  );
};
