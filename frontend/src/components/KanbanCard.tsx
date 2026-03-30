import { useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { getCardDndId, type Card } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: number) => void;
  onEdit: (card: Card) => void;
  isSaving?: boolean;
};

export const KanbanCard = ({
  card,
  onDelete,
  onEdit,
  isSaving = false,
}: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: getCardDndId(card.id), disabled: isSaving });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Track whether a drag actually occurred so we can suppress the post-drag click.
  const wasDragging = useRef(false);
  useEffect(() => {
    if (isDragging) wasDragging.current = true;
  }, [isDragging]);

  const handleClick = () => {
    if (wasDragging.current) {
      wasDragging.current = false;
      return;
    }
    if (!isSaving) onEdit(card);
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group relative cursor-pointer overflow-hidden rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]",
        !isSaving && !isDragging &&
          "hover:border-[var(--stroke)] hover:shadow-[0_16px_32px_rgba(3,33,71,0.12)]"
      )}
      onClick={handleClick}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      {/* Delete — icon-only, revealed on hover; always faintly visible on touch */}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onDelete(card.id);
        }}
        disabled={isSaving}
        aria-label={`Delete ${card.title}`}
        className={clsx(
          "absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full text-[var(--gray-text)]",
          "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
          "[@media(hover:none)]:opacity-40",
          "hover:bg-red-50 hover:text-red-400",
          "disabled:cursor-not-allowed"
        )}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
          <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Content — right-padded so text never runs under the × button */}
      <div className="pr-6">
        <h4 className="break-words font-display text-base font-semibold text-[var(--navy-dark)]">
          {card.title}
        </h4>
        {card.details && (
          <p className="mt-2 break-words text-sm leading-6 text-[var(--gray-text)]">
            {card.details}
          </p>
        )}
      </div>
    </article>
  );
};
