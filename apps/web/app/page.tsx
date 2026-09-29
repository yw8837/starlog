"use client";

// Temporary shell preview. Replaced when the real home page lands.
import { useState } from "react";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Segmented } from "@/components/ui/Segmented";
import { SITE } from "@/lib/config";

type Mode = "tarot" | "saju";
const TOPICS = ["연애", "일", "관계", "오늘"] as const;

export default function HomePage() {
  const [mode, setMode] = useState<Mode>("tarot");
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>("오늘");

  return (
    <div className="page-shell">
      <NightSky constellation />
      <main className="page-col with-tabbar">
        <header style={{ padding: "72px 0 28px" }}>
          <h1 style={{ fontSize: "var(--fs-title)" }}>{SITE.name}</h1>
          <p style={{ color: "var(--ink-sub)", marginTop: 8 }}>
            {SITE.nameKo}에서 오늘의 별을 따라 읽어요
          </p>
        </header>

        <div style={{ display: "grid", gap: 20 }}>
          <Segmented
            label="보기 방식"
            options={[
              { value: "tarot", label: "타로" },
              { value: "saju", label: "사주" },
            ]}
            value={mode}
            onChange={setMode}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {TOPICS.map((t) => (
              <Chip key={t} selected={t === topic} onClick={() => setTopic(t)}>
                {t}
              </Chip>
            ))}
          </div>
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            <Button block trailing="→">
              카드 한 장 뽑기
            </Button>
            <Button block variant="secondary">
              사주 살펴보기
            </Button>
            <Button block variant="ghost" size="md">
              나중에 할게요
            </Button>
          </div>
        </div>

        <Footer />
      </main>
      <TabBar active="home" />
    </div>
  );
}
