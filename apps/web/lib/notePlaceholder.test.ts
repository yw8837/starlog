import { TOPICS_BY_WHO } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_NOTE_PLACEHOLDER, notePlaceholder } from "./notePlaceholder";

describe("notePlaceholder", () => {
  it("has a topic-specific example for every topic the builder offers", () => {
    for (const topics of Object.values(TOPICS_BY_WHO)) {
      for (const topic of topics) expect(notePlaceholder(topic.id)).not.toBe(DEFAULT_NOTE_PLACEHOLDER);
    }
  });

  it("never shows the contact example on a money question", () => {
    expect(notePlaceholder("money")).not.toContain("연락");
    expect(notePlaceholder(undefined)).toBe(DEFAULT_NOTE_PLACEHOLDER);
  });
});
