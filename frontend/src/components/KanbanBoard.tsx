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
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen w-full flex-col gap-10 px-4 pb-16 pt-12 sm:px-6 xl:px-10 2xl:px-16">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-6 shadow-[var(--shadow)] backdrop-blur sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--navy-dark)] sm:text-4xl">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            {onLogout ? (
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Signed in
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  {userName}
                </p>
                <button
                  type="button"
                  onClick={onLogout}
                  disabled={isLoggingOut}
                  className="mt-4 rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoggingOut ? "Signing out..." : "Log out"}
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Focus
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  One board. Five columns. Zero clutter.
                </p>
              </div>
            )}
          </div>
          {error ? (
            <p className="text-sm font-semibold text-[var(--secondary-purple)]">{error}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_min(360px,28vw)] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_400px]">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            {/* Scroll horizontally on narrow viewports; expand to full grid at lg+ */}
            <div className="overflow-x-auto pb-2 lg:overflow-visible lg:pb-0">
              <section className="grid gap-4 [grid-template-columns:repeat(5,minmax(220px,1fr))] lg:gap-6 lg:[grid-template-columns:repeat(5,minmax(0,1fr))]">
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

          <div className="xl:sticky xl:top-8">
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
