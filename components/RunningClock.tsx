"use client";
import { useEffect, useState } from "react";
import { formatClock } from "@/lib/time";

export function RunningClock({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return <span className="running-clock" role="timer" aria-label="Tiempo transcurrido">{formatClock(Math.max(0, (now ?? Date.parse(startedAt)) - Date.parse(startedAt)))}</span>;
}
