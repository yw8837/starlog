import type { Metadata } from "next";
import { TarotGuide } from "@/components/seo/toolGuides";
import { NightSky } from "@/components/sky/NightSky";
import { pageMetadata } from "@/lib/seo";
import { QuestionBuilder } from "./QuestionBuilder";

export const metadata: Metadata = pageMetadata({
  title: "타로 보기 · 내 질문에 맞춘 카드 3장 풀이",
  description: "누구의 일인지, 무엇이 궁금한지, 언제까지인지 골라 질문을 만들고 카드 3장을 뽑아요. 1909년 원판 그림에 그려진 장면을 내 상황에 비춰 읽어 드려요.",
  path: "/tarot/new",
});

export default function TarotNewPage() {
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className="page-col">
        <QuestionBuilder />
        <TarotGuide />
      </main>
    </div>
  );
}
