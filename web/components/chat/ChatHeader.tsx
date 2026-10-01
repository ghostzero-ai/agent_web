import type { ReactNode } from "react";

type ChatHeaderProps = { onOpenSidebar?: () => void; sidebarOpen?: boolean; actions?: ReactNode };

export function ChatHeader({ onOpenSidebar, sidebarOpen = false, actions }: ChatHeaderProps) {
  return <div className="flex items-center gap-1 sm:gap-2">
    {onOpenSidebar && <button type="button" onClick={onOpenSidebar} className="workspace-icon-button md:hidden" aria-label="打开对话列表" aria-controls="mobile-session-drawer" aria-expanded={sidebarOpen}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 5h16v12H8l-4 3z" /></svg>
    </button>}
    {actions}
  </div>;
}
