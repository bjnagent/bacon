"use client";

// TEMPORARY bridge — replaced by the reworked chat sheet.
import "@/app/legacy.css";
import ChatPanel from "@/components/ChatPanel";
import type { ChatContext } from "@/lib/prompts";

export default function ChatSheet({ open, context, onClose }: { open: boolean; context: ChatContext | null; onClose: () => void }) {
  return <div className="pr-app" style={{ minHeight: 0 }}><ChatPanel open={open} context={context} onClose={onClose} /></div>;
}
