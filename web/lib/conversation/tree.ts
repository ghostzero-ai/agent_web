import type { ChatMessage } from "@/lib/ai/messages";
import type { Session } from "@/lib/config";

export const CONVERSATION_SCHEMA_VERSION = 2 as const;

function createMessageId(): string {
  return crypto.randomUUID();
}

function stripLegacyVersions(message: ChatMessage): ChatMessage {
  const current = { ...message };
  delete current.versions;
  delete current.activeVersion;
  return current;
}

function hasValidTreeShape(session: Session): boolean {
  if (session.schemaVersion !== CONVERSATION_SCHEMA_VERSION) return false;
  if (session.activeLeafId === undefined) return false;

  const ids = new Set<string>();
  for (const message of session.messages) {
    if (!message.id || ids.has(message.id)) return false;
    ids.add(message.id);
  }

  if (session.activeLeafId !== null && !ids.has(session.activeLeafId)) {
    return false;
  }

  for (const message of session.messages) {
    if (message.parentId === undefined) return false;
    if (message.parentId !== null && !ids.has(message.parentId)) return false;
    if (message.parentId === message.id) return false;
  }

  for (const message of session.messages) {
    const visited = new Set<string>();
    let current: ChatMessage | undefined = message;
    while (current?.parentId) {
      if (!current.id || visited.has(current.id)) return false;
      visited.add(current.id);
      current = session.messages.find((item) => item.id === current?.parentId);
    }
  }

  return true;
}

/**
 * 将旧的线性消息和单消息 versions 迁移为父子消息树。
 * 旧消息的当前 activeVersion 承接后续链路，其他版本成为保留的兄弟叶节点。
 */
export function normalizeSessionTree(session: Session): Session {
  if (hasValidTreeShape(session)) return session;

  const nodes: ChatMessage[] = [];
  const usedIds = new Set<string>();
  let parentId: string | null = null;

  const uniqueId = (preferred?: string): string => {
    if (preferred && !usedIds.has(preferred)) {
      usedIds.add(preferred);
      return preferred;
    }
    let generated = createMessageId();
    while (usedIds.has(generated)) generated = createMessageId();
    usedIds.add(generated);
    return generated;
  };

  for (const legacyMessage of session.messages) {
    const versions =
      legacyMessage.role === "assistant" && legacyMessage.versions?.length
        ? legacyMessage.versions
        : [legacyMessage.content];
    const requestedVersion = legacyMessage.activeVersion ?? versions.length - 1;
    const activeVersion = Math.min(
      Math.max(requestedVersion, 0),
      versions.length - 1,
    );
    let activeNodeId: string | null = null;

    versions.forEach((content, versionIndex) => {
      const nodeId = uniqueId(
        versionIndex === activeVersion ? legacyMessage.id : undefined,
      );
      nodes.push({
        ...stripLegacyVersions(legacyMessage),
        id: nodeId,
        parentId,
        content,
      });
      if (versionIndex === activeVersion) activeNodeId = nodeId;
    });

    parentId = activeNodeId;
  }

  return {
    ...session,
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    messages: nodes,
    activeLeafId: parentId,
  };
}

export function getActiveMessages(session: Session): ChatMessage[] {
  const normalized = normalizeSessionTree(session);
  if (!normalized.activeLeafId) return [];

  const byId = new Map(
    normalized.messages.map((message) => [message.id!, message]),
  );
  const path: ChatMessage[] = [];
  const visited = new Set<string>();
  let current = byId.get(normalized.activeLeafId);

  while (current?.id && !visited.has(current.id)) {
    path.push(current);
    visited.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return path.reverse();
}

export function appendMessage(
  session: Session,
  message: ChatMessage,
): Session {
  const normalized = normalizeSessionTree(session);
  const messageId =
    message.id && !normalized.messages.some((item) => item.id === message.id)
      ? message.id
      : createMessageId();
  const node: ChatMessage = {
    ...stripLegacyVersions(message),
    id: messageId,
    parentId: normalized.activeLeafId ?? null,
  };

  return {
    ...normalized,
    messages: [...normalized.messages, node],
    activeLeafId: messageId,
  };
}

export function checkoutSessionAt(
  session: Session,
  messageId: string | null,
): Session {
  const normalized = normalizeSessionTree(session);
  if (
    messageId !== null &&
    !normalized.messages.some((message) => message.id === messageId)
  ) {
    return normalized;
  }
  return { ...normalized, activeLeafId: messageId };
}

export function appendAssistantBranch(
  session: Session,
  targetMessageId: string,
  reply: ChatMessage,
): Session {
  const normalized = normalizeSessionTree(session);
  const target = normalized.messages.find(
    (message) => message.id === targetMessageId,
  );
  if (!target || target.role !== "assistant") return normalized;

  const replyId =
    reply.id && !normalized.messages.some((item) => item.id === reply.id)
      ? reply.id
      : createMessageId();
  const branch: ChatMessage = {
    ...stripLegacyVersions(reply),
    id: replyId,
    parentId: target.parentId ?? null,
    role: "assistant",
  };

  return {
    ...normalized,
    messages: [...normalized.messages, branch],
    activeLeafId: replyId,
  };
}

export function getAssistantSiblings(
  session: Session,
  messageId: string,
): ChatMessage[] {
  const normalized = normalizeSessionTree(session);
  const target = normalized.messages.find((message) => message.id === messageId);
  if (!target || target.role !== "assistant") return [];
  const parentId = target.parentId ?? null;
  return normalized.messages.filter(
    (message) =>
      message.role === "assistant" && (message.parentId ?? null) === parentId,
  );
}

function findLatestLeafInSubtree(
  messages: ChatMessage[],
  rootMessageId: string,
): string {
  const children = new Map<string, ChatMessage[]>();
  for (const message of messages) {
    if (!message.parentId) continue;
    const siblings = children.get(message.parentId) ?? [];
    siblings.push(message);
    children.set(message.parentId, siblings);
  }

  let latestLeafId = rootMessageId;
  let latestIndex = messages.findIndex((message) => message.id === rootMessageId);
  const stack = [rootMessageId];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const currentId = stack.pop()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    const currentChildren = children.get(currentId) ?? [];
    if (currentChildren.length === 0) {
      const index = messages.findIndex((message) => message.id === currentId);
      if (index >= latestIndex) {
        latestIndex = index;
        latestLeafId = currentId;
      }
      continue;
    }
    for (const child of currentChildren) {
      if (child.id) stack.push(child.id);
    }
  }

  return latestLeafId;
}

export function switchAssistantVersion(
  session: Session,
  messageId: string,
  direction: "prev" | "next",
): Session {
  const normalized = normalizeSessionTree(session);
  const siblings = getAssistantSiblings(normalized, messageId);
  const currentIndex = siblings.findIndex((message) => message.id === messageId);
  if (currentIndex === -1 || siblings.length <= 1) return normalized;

  const nextIndex =
    direction === "next"
      ? Math.min(currentIndex + 1, siblings.length - 1)
      : Math.max(currentIndex - 1, 0);
  if (nextIndex === currentIndex || !siblings[nextIndex].id) return normalized;

  return {
    ...normalized,
    activeLeafId: findLatestLeafInSubtree(
      normalized.messages,
      siblings[nextIndex].id!,
    ),
  };
}
