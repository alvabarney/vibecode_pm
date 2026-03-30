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
          "absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full text-base leading-none text-[var(--gray-text)]",
          "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
          "[@media(hover:none)]:opacity-40",
          "hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]",
          "disabled:cursor-not-allowed"
        )}
      >
        ×
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
