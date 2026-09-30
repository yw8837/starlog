import type { Metadata } from "next";
import { NightSky } from "@/components/sky/NightSky";
import { NowOracle } from "./NowOracle";

export const metadata: Metadata = {
  title: "지금의 한 장",
  description: "고민 하나를 떠올리고 타로 카드 한 장을 골라요. 카드 그림에서 읽은 한 문장과 그 이유, 오늘 해 볼 일을 바로 보여 드려요.",
  alternates: { canonical: "/now" },
};

export default function NowPage() {
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className="page-col">
        <NowOracle />
      </main>
    </div>
  );
}
