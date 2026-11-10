"use client";

import dynamic from "next/dynamic";
import type { SpawnMapProps } from "./SpawnMap";

const SpawnMap = dynamic(() => import("./SpawnMap"), {
  ssr: false,
  loading: () => <div className="panel flex h-[70dvh] items-center justify-center title-fell text-ink-soft">Apertura della mappa…</div>,
});

export function SpawnMapLoader(props: SpawnMapProps) {
  return <SpawnMap {...props} />;
}
