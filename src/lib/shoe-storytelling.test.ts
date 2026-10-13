import { describe, expect, it } from "vitest";
import {
  getShoeCircularJourney,
  getShoePairingStory,
  getWearBarometerStory,
} from "./shoe-storytelling";
import { D } from "./decimal";

describe("shoe storytelling", () => {
  it("generates occasion pairings and terrain details based on experiences", () => {
    const runningStory = getShoePairingStory({
      brand: "Nike",
      model: "Pegasus 40",
      experiences: ["Morning Run", "Gym Session"],
      audience: "MEN",
    });

    expect(runningStory.occasions.length).toBeGreaterThan(0);
    expect(runningStory.occasions[0].title).toBe("Tempos & Coastal Runs");
    expect(runningStory.terrain).toContain("Paved Tracks");
    expect(runningStory.stylingTip).toContain("athletic");

    const chicStory = getShoePairingStory({
      brand: "Prada",
      model: "Monolith Derby",
      experiences: ["Work Day", "Night Out"],
      audience: "WOMEN",
    });

    expect(chicStory.occasions[0].title).toBe("All-Day Work Polish");
    expect(chicStory.terrain).toContain("Hardwood");
    expect(chicStory.stylingTip).toContain("tailored");
  });

  it("calculates circular lifecycle journey with sustainability metrics", () => {
    const journey = getShoeCircularJourney({
      committedWear: new D(120),
      lifespanDays: 365,
      condition: "SECOND_HAND_UPGRADED",
      upgradeNotes: "New Vibram soles and sanitized insoles",
      latestGrade: "A",
      merchant: { businessName: "Sole Collective" },
    });

    expect(journey.headline).toBe("The Circular Lifecycle");
    expect(journey.daysCirculated).toBe("120");
    expect(parseFloat(journey.divertedCo2Kg)).toBeGreaterThan(0);
    expect(journey.chapters).toHaveLength(3);
    expect(journey.chapters[0].status).toBe("Pre-Loved & Curated");
    expect(journey.chapters[1].status).toBe("120 active days shared");
    expect(journey.chapters[2].description).toContain("New Vibram soles");
  });

  it("calculates wear-curve barometer for different phases", () => {
    // 1. Fresh pair
    const fresh = getWearBarometerStory(new D(10), 365, 0);
    expect(fresh.phase).toBe("fresh");
    expect(fresh.phaseLabel).toContain("Factory Fresh");

    // 2. Sweet spot pair (20-60%)
    const sweetSpot = getWearBarometerStory(new D(100), 365, 20);
    expect(sweetSpot.phase).toBe("sweet-spot");
    expect(sweetSpot.comfortIndex).toBe(98);
    expect(sweetSpot.valueAdvantage).toContain("20% Daily Discount");

    // 3. Seasoned pair (>60%)
    const seasoned = getWearBarometerStory(new D(250), 365, 0);
    expect(seasoned.phase).toBe("seasoned");
    expect(seasoned.comfortIndex).toBe(92);
  });
});
