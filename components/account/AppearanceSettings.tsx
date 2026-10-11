"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { SunMoon } from "lucide-react";
import { List, Row, Segmented } from "@/components/ui";
import { applyTheme, readTheme, serverTheme, subscribeTheme, type ThemePref } from "./theme";

const OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function AppearanceSettings({ title }: { title: ReactNode }) {
  const pref = useSyncExternalStore(subscribeTheme, readTheme, serverTheme);
  return (
    <List title={title} footer="Saved on this device. System follows your phone or computer.">
      <Row
        icon={<SunMoon />}
        title="Theme"
        trailing={<Segmented<ThemePref> label="Theme" value={pref} onChange={applyTheme} options={OPTIONS} />}
      />
    </List>
  );
}
