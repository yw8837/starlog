import type { Metadata } from "next";
import { NightSky } from "@/components/sky/NightSky";
import { QuestionBuilder } from "./QuestionBuilder";

export const metadata: Metadata = { title: "질문 만들기" };

export default function TarotNewPage() {
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className="page-col">
        <QuestionBuilder />
      </main>
    </div>
  );
}
