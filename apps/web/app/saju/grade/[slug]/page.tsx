import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/app/birth-card/BackLink";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { SITE } from "@/lib/config";
import { NOINDEX_FOLLOW, NOT_FOUND_METADATA, pageMetadata } from "@/lib/seo";
import { GRADE_FIXED_LINE, GRADE_NOTICE, gradeSlug, gradeStaticSlugs, parseGradeSlug, yearName } from "@/lib/sajuGrade";
import { GradeVisitor, SharedGradeCard } from "./GradeVisitor";
import s from "../grade.module.css";

/**
 * The ten chips' years from the build are built ahead (generateStaticParams); any other year of GRADE_YEARS (2026–2085), and a
 * built copy that cannot be read (a location missing the new static assets right after a deploy, as /birth-card/[card]), renders
 * on demand. Anything parseGradeSlug refuses is a 404.
 */
export const dynamicParams = true;

export function generateStaticParams() {
  return gradeStaticSlugs().map((slug) => ({ slug }));
}

const ogPath = (slug: string) => `/api/og/saju-grade/${slug}`;

export async function generateMetadata({ params }: PageProps<"/saju/grade/[slug]">): Promise<Metadata> {
  const card = parseGradeSlug((await params).slug);
  if (!card) return NOT_FOUND_METADATA;
  const slug = gradeSlug(card.year, card.grade);
  const base = pageMetadata({
    title: `올해의 사주 등급 · ${yearName(card)} ${card.grade} ${card.nickname}`,
    description: `친구가 보낸 ${yearName(card)} 사주 등급이에요. 내 생일로 내 등급도 로그인 없이 무료로 볼 수 있어요. 재미로 보는 계산이에요.`,
    path: `/saju/grade/${slug}`,
  });
  // The card's own preview (KakaoTalk, Threads): its year and grade, never the site's brand picture.
  const image = { url: ogPath(slug), width: 1200, height: 630, alt: `${yearName(card)} 사주 등급 ${card.grade} · ${card.nickname} · ${SITE.nameKo}` };
  return { ...base, robots: NOINDEX_FOLLOW, openGraph: { ...base.openGraph, images: [image] } };
}

/**
 * A shared 사주 등급 card (spec 2026-11-11 C): the same for whoever opens it, knowing only the year and the grade in its address.
 * The visitor finds their own (GradeVisitor) without leaving, and the compare line uses nothing but the address and this device.
 */
export default async function SharedGradePage({ params }: PageProps<"/saju/grade/[slug]">) {
  const card = parseGradeSlug((await params).slug);
  if (!card) notFound();
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} seed={28} />
      <main className={`page-col ${s.screen}`}>
        <BackLink href="/saju/grade" label="사주 등급 처음으로" />
        <header className={s.intro}>
          <h1 className={s.title}>친구의 사주 등급</h1>
          <p className={s.lead}>친구는 어떤 등급일까요? 내 등급도 로그인 없이 무료로 볼 수 있어요.</p>
        </header>
        <SharedGradeCard year={card.year} ko={card.ko} grade={card.grade} />
        <p className={s.fixed}>{GRADE_FIXED_LINE}</p>
        <GradeVisitor year={card.year} grade={card.grade} />
        <p className={s.notice}>
          {GRADE_NOTICE}{" "}
          <Link href="/saju/grade/how" className={s.howLink}>
            규칙 보기
          </Link>
        </p>
      </main>
      <Footer />
    </div>
  );
}
