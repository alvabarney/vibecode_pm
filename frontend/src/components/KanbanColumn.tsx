import clsx from "clsx";
import { useEffect, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { getCardDndId, getColumnDndId, type Card, type Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  onRename: (columnId: number, title: string) => Promise<void>;
  onAddCard: (columnId: number, title: string, details: string) => Promise<void>;
  onDeleteCard: (cardId: number) => Promise<void>;
  onEditCard: (card: Card) => void;
  isSaving: boolean;
  isActiveDropTarget: boolean;
};

export const KanbanColumn = ({
  column,
  cards,
  onRename,
  onAddCard,
  onDeleteCard,
  onEditCard,
  isSaving,
  isActiveDropTarget,
}: KanbanColumnProps) => {
  const { setNodeRef } = useDroppable({ id: getColumnDndId(column.id) });
  const [draftTitle, setDraftTitle] = useState(column.title);

  useEffect(() => {
    setDraftTitle(column.title);
  }, [column.title]);

  const submitRename = async () => {
    const cleanedTitle = draftTitle.trim();
    if (!cleanedTitle) {
      setDraftTitle(column.title);
      return;
    }

    if (cleanedTitle === column.title) {
      setDraftTitle(column.title);
      return;
    }

    await onRename(column.id, cleanedTitle);
  };

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[520px] flex-col rounded-3xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-4 shadow-[var(--shadow)] transition",
        isActiveDropTarget && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-full">
          <div className="flex items-center gap-3">
            <div className="h-2 w-10 rounded-full bg-[var(--accent-yellow)]" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              {cards.length} cards
            </span>
          </div>
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={() => {
              void submitRename();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
              if (event.key === "Escape") {
                setDraftTitle(column.title);
                event.currentTarget.blur();
              }
            }}
            className="mt-3 w-full bg-transparent font-display text-lg font-semibold text-[var(--navy-dark)] outline-none"
            aria-label="Column title"
            disabled={isSaving}
          />
        </div>
      </div>
      <NewCardForm
        onAdd={(title, details) => {
          void onAddCard(column.id, title, details);
        }}
        isSaving={isSaving}
      />
      <div className="mt-4 flex flex-1 flex-col gap-3">
        <SortableContext
          items={cards.map((card) => getCardDndId(card.id))}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onDelete={(cardId) => onDeleteCard(cardId)}
              onEdit={onEditCard}
              isSaving={isSaving}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Drop a card here
          </div>
        )}
      </div>
    </section>
  );
};
