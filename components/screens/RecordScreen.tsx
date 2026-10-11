"use client";

// TEMPORARY bridge — replaced by the reworked Track record screen.
import "@/app/legacy.css";
import TrackRecordView from "@/components/TrackRecordView";

export default function RecordScreen({ active }: { active: boolean }) {
  void active;
  return <div className="pr-app"><TrackRecordView /></div>;
}
