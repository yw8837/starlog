import { describe } from "vitest";
import { bondsRepoContract } from "./contract";
import { createMemoryBondsRepo } from "./memoryBondsRepo";

describe("memory BondsRepo", () => bondsRepoContract(() => createMemoryBondsRepo()));
