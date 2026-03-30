import type { BoardData } from "@/lib/kanban";

export type SessionResponse = {
  authenticated: boolean;
  username: string | null;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type ChatAction =
  | {
      type: "create_card";
      column_id: number;
      title: string;
      details: string;
      position?: number;
    }
  | {
      type: "edit_card";
      card_id: number;
      title?: string;
      details?: string;
    }
  | {
      type: "move_card";
      card_id: number;
      column_id: number;
      position: number;
    }
  | {
      type: "delete_card";
      card_id: number;
    }
  | {
      type: "rename_column";
      column_id: number;
      title: string;
    };

export type ChatResponse = {
  assistant_message: string;
  kanban_actions: ChatAction[];
  board?: BoardData;
};

const getApiBaseUrl = () => {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:18000";
  }

  return `${window.location.protocol}//${window.location.hostname}:18000`;
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const data = (await response.json()) as T | { detail?: string };
  if (!response.ok) {
    const message =
      typeof data === "object" && data
        ? ("detail" in data && typeof data.detail === "string" && data.detail) ||
          ("details" in data && typeof data.details === "string" && data.details) ||
          ("error" in data && typeof data.error === "string" && data.error) ||
          "Request failed."
        : "Request failed.";
    throw new ApiError(message, response.status);
  }

  return data as T;
};

export const getSession = () => request<SessionResponse>("/api/auth/session");

export const login = (username: string, password: string) =>
  request<SessionResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

export const logout = () =>
  request<SessionResponse>("/api/auth/logout", {
    method: "POST",
  });

export const getBoard = () => request<BoardData>("/api/board");

export const renameColumn = (columnId: number, title: string) =>
  request<BoardData>(`/api/columns/${columnId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });

export const createCard = (columnId: number, title: string, details: string) =>
  request<BoardData>("/api/cards", {
    method: "POST",
    body: JSON.stringify({ column_id: columnId, title, details }),
  });

export const moveCard = (cardId: number, columnId: number, position: number) =>
  request<BoardData>(`/api/cards/${cardId}/move`, {
    method: "PATCH",
    body: JSON.stringify({ column_id: columnId, position }),
  });

export const updateCard = (cardId: number, title: string, details: string) =>
  request<BoardData>(`/api/cards/${cardId}`, {
    method: "PATCH",
    body: JSON.stringify({ title, details }),
  });

export const deleteCard = (cardId: number) =>
  request<BoardData>(`/api/cards/${cardId}`, {
    method: "DELETE",
  });

export const sendChat = (message: string) =>
  request<ChatResponse>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
