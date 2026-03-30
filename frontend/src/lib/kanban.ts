import type { UniqueIdentifier } from "@dnd-kit/core";

export type Card = {
  id: number;
  title: string;
  details: string;
  position: number;
};

export type Column = {
  id: number;
  slug: string;
  title: string;
  position: number;
  cards: Card[];
};

export type BoardData = {
  id: number;
  name: string;
  userId: number;
  columns: Column[];
};

export const getColumnDndId = (columnId: number) => `column-${columnId}`;

export const getCardDndId = (cardId: number) => `card-${cardId}`;

const parseDndId = (id: UniqueIdentifier) => {
  const value = String(id);
  if (value.startsWith("column-")) {
    return { kind: "column" as const, id: Number(value.replace("column-", "")) };
  }
  if (value.startsWith("card-")) {
    return { kind: "card" as const, id: Number(value.replace("card-", "")) };
  }
  return null;
};

const findColumnForCard = (board: BoardData, cardId: number) =>
  board.columns.find((column) => column.cards.some((card) => card.id === cardId));

export const getCardByDndId = (board: BoardData, dndId: string | null) => {
  if (!dndId) {
    return null;
  }

  const parsed = parseDndId(dndId);
  if (!parsed || parsed.kind !== "card") {
    return null;
  }

  return board.columns
    .flatMap((column) => column.cards)
    .find((card) => card.id === parsed.id);
};

export const getColumnIdForDndTarget = (
  board: BoardData,
  dndId: UniqueIdentifier | null
) => {
  if (!dndId) {
    return null;
  }

  const parsed = parseDndId(dndId);
  if (!parsed) {
    return null;
  }

  if (parsed.kind === "column") {
    return parsed.id;
  }

  return findColumnForCard(board, parsed.id)?.id ?? null;
};

export const getMoveDestination = (
  board: BoardData,
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier
) => {
  const active = parseDndId(activeId);
  const over = parseDndId(overId);

  if (!active || !over || active.kind !== "card") {
    return null;
  }

  const activeColumn = findColumnForCard(board, active.id);
  if (!activeColumn) {
    return null;
  }

  const targetColumn =
    over.kind === "column"
      ? board.columns.find((column) => column.id === over.id)
      : findColumnForCard(board, over.id);

  if (!targetColumn) {
    return null;
  }

  const sourceCards = activeColumn.cards.filter((card) => card.id !== active.id);
  const targetCards =
    activeColumn.id === targetColumn.id ? sourceCards : [...targetColumn.cards];

  const insertIndex = (() => {
    if (over.kind === "column") {
      return targetCards.length;
    }

    if (activeColumn.id === targetColumn.id) {
      return targetColumn.cards.findIndex((card) => card.id === over.id);
    }

    return targetCards.findIndex((card) => card.id === over.id);
  })();

  return {
    columnId: targetColumn.id,
    position: insertIndex === -1 ? targetCards.length : insertIndex,
  };
};
