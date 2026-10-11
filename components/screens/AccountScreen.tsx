"use client";

// TEMPORARY bridge — replaced by the reworked Account screen.
import "@/app/legacy.css";
import AccountView from "@/components/AccountView";
import { useApp } from "@/components/app/AppContext";

export default function AccountScreen({ active }: { active: boolean }) {
  const app = useApp();
  void active;
  return <div className="pr-app"><AccountView email={app.email} /></div>;
}
