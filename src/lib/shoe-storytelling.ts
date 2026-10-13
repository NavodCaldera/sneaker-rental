import type { Audience, ShoeCondition, Grade } from "@/generated/prisma/enums";
import { formatWear } from "@/lib/format";

export type PairingOccasion = {
  icon: string;
  title: string;
  description: string;
};

export type ShoePairingStory = {
  occasions: PairingOccasion[];
  terrain: string;
  terrainDetail: string;
  stylingTip: string;
};

export type JourneyChapter = {
  number: string;
  title: string;
  status: string;
  description: string;
  highlight?: boolean;
};

export type CircularJourneyStory = {
  headline: string;
  subheadline: string;
  daysCirculated: string;
  daysRemaining: string;
  divertedCo2Kg: string;
  chapters: JourneyChapter[];
  careCommitment: string;
};

export type BarometerPhase = "fresh" | "sweet-spot" | "seasoned";

export type WearBarometerStory = {
  phase: BarometerPhase;
  phaseLabel: string;
  wearPercent: number;
  comfortIndex: number; // 0 to 100
  valueAdvantage: string;
  summary: string;
  comfortNote: string;
};

/**
 * Derives rich occasion, terrain, and styling guidance based on shoe attributes.
 */
export function getShoePairingStory(shoe: {
  brand?: string;
  model?: string;
  experiences: string[];
  audience: Audience;
}): ShoePairingStory {
  const experiences = shoe.experiences.length > 0 ? shoe.experiences : ["Weekend Stroll"];
  const brandLower = (shoe.brand || "").toLowerCase();
  const modelLower = (shoe.model || "").toLowerCase();

  const isRunner =
    experiences.some((e) => e.toLowerCase().includes("run") || e.toLowerCase().includes("gym")) ||
    brandLower.includes("nike") ||
    brandLower.includes("asics") ||
    modelLower.includes("runner") ||
    modelLower.includes("pegasus");

  const isFormalOrChic =
    experiences.some(
      (e) =>
        e.toLowerCase().includes("work") ||
        e.toLowerCase().includes("occasion") ||
        e.toLowerCase().includes("night"),
    ) ||
    brandLower.includes("prada") ||
    brandLower.includes("gucci") ||
    modelLower.includes("derby") ||
    modelLower.includes("loafer");

  // Build occasion list
  const occasions: PairingOccasion[] = experiences.slice(0, 3).map((exp) => {
    switch (exp) {
      case "Morning Run":
        return {
          icon: "⚡",
          title: "Tempos & Coastal Runs",
          description: "Engineered for responsive ground contact, morning endurance, and pace transitions.",
        };
      case "Work Day":
        return {
          icon: "💼",
          title: "All-Day Work Polish",
          description: "Sleek silhouette that commands professional respect while keeping feet cushioned through transit.",
        };
      case "Night Out":
        return {
          icon: "🍸",
          title: "Evening Occasions & Lounges",
          description: "Elevated silhouette with statement presence under evening ambient lighting.",
        };
      case "Weekend Stroll":
      case "Brunch & Errands":
        return {
          icon: "☕",
          title: "Cafes & Weekend Living",
          description: "Effortless casual luxury made for relaxed terrace hangouts and city exploration.",
        };
      case "Big Occasion":
        return {
          icon: "✨",
          title: "Celebrations & Special Moments",
          description: "A head-turning profile designed to elevate formal and celebratory attire.",
        };
      case "Gym Session":
      case "Studio & Gym":
        return {
          icon: "🏋️",
          title: "Training & High Intensity",
          description: "Supportive lateral stability and durable outsole grip for diverse workout regimens.",
        };
      default:
        return {
          icon: "✦",
          title: exp,
          description: "Curated for versatile comfort and distinct styling across daily moments.",
        };
    }
  });

  // Terrain advice
  let terrain = "Urban Pavement & Seafront Promenades";
  let terrainDetail = "Optimized for asphalt, pedestrian walkways, and hard city transit surfaces.";
  if (isRunner) {
    terrain = "Paved Tracks, Boardwalks & Urban Asphalt";
    terrainDetail = "High-traction tread built for asphalt streets, track loops, and outdoor cardio sessions.";
  } else if (isFormalOrChic) {
    terrain = "Interior Polish, Hardwood & City Walkways";
    terrainDetail = "Ideal for climate-controlled indoor spaces, boardroom floors, and paved urban venues.";
  }

  // Styling advice
  let stylingTip =
    "Pair with relaxed pleated trousers or cuffed Japanese selvedge denim for a modern architectural silhouette.";
  if (isRunner) {
    stylingTip =
      "Styles seamlessly with technical nylon windbreakers, tapered athletic joggers, or minimalist performance shorts.";
  } else if (isFormalOrChic) {
    stylingTip =
      "Compliment with tailored wool separates, crisp oversized linen shirts, or subtle tonal knitwear.";
  } else if (shoe.audience === "BOYS" || shoe.audience === "GIRLS") {
    stylingTip =
      "Built for energetic movement—pairs effortlessly with casual weekend sets or school event sportswear.";
  }

  return { occasions, terrain, terrainDetail, stylingTip };
}

/**
 * Builds the authentic circular lifecycle story of the shoe, celebrating sustainability over "used".
 */
export function getShoeCircularJourney(shoe: {
  committedWear: { toString(): string };
  lifespanDays: number;
  condition: ShoeCondition;
  upgradeNotes?: string | null;
  latestGrade?: Grade | null;
  merchant?: { businessName: string };
}): CircularJourneyStory {
  const wear = parseFloat(shoe.committedWear.toString()) || 0;
  const lifespan = shoe.lifespanDays || 365;
  const remaining = Math.max(0, lifespan - wear);

  // Approximately ~14.5kg CO2 is produced in manufacturing a single pair of luxury athletic shoes.
  // By circulating this pair, each wear-day represents diverted manufacturing waste.
  const divertedCo2 = ((wear / lifespan) * 14.5).toFixed(1);

  const chapters: JourneyChapter[] = [
    {
      number: "01",
      title: "Provenance & Entry",
      status: shoe.condition === "NEW" ? "Unworn Archive Release" : "Pre-Loved & Curated",
      description:
        shoe.condition === "NEW"
          ? `Sourced pristine from verified partner ${shoe.merchant?.businessName || "Nova Archive"} with certified authenticity.`
          : `Hand-selected by ${shoe.merchant?.businessName || "Nova Curators"} for exceptional structural integrity and premium materials.`,
    },
    {
      number: "02",
      title: "Life in Circular Rotation",
      status: `${formatWear(wear.toString())} active days shared`,
      description:
        wear === 0
          ? "Awaiting its debut rotation. You will be the very first community borrower to wear this pair."
          : `Enjoyed across community rotations with complete wear-sharing ledger transparency and zero landfill contribution.`,
      highlight: wear > 0,
    },
    {
      number: "03",
      title: "Nova Sanitization & Refresh",
      status: `Grade ${shoe.latestGrade ?? "A"} Care Standard`,
      description: shoe.upgradeNotes
        ? `Refreshed with certified enhancements: ${shoe.upgradeNotes}. Deeply sanitized with antimicrobial ultrasonic care before every handover.`
        : "Thoroughly inspected, deep-cleaned, and sanitized with hospital-grade antimicrobial standards between every borrower.",
    },
  ];

  return {
    headline: "The Circular Lifecycle",
    subheadline: "Luxury shared, never discarded. An authentic sustainability journey.",
    daysCirculated: formatWear(wear.toString()),
    daysRemaining: `${Math.round(remaining)} days`,
    divertedCo2Kg: divertedCo2,
    chapters,
    careCommitment:
      "Every pair undergoes Nova's 5-point eco-sanitization and handoff inspection to ensure uncompromising hygiene and freshness.",
  };
}

/**
 * Calculates the Wear-Curve Value Barometer metrics:
 * Illustrates why broken-in pairs deliver peak ergonomic comfort while saving significant daily rent.
 */
export function getWearBarometerStory(
  committedWear: { toString(): string },
  lifespanDays: number,
  discountPercent = 0,
): WearBarometerStory {
  const wear = parseFloat(committedWear.toString()) || 0;
  const lifespan = lifespanDays || 365;
  const wearRatio = Math.min(1, Math.max(0, wear / lifespan));
  const wearPercent = Math.round(wearRatio * 100);

  let phase: BarometerPhase = "fresh";
  let phaseLabel = "Factory Fresh (0–15%)";
  let comfortIndex = 72; // Out of the box sneakers can be stiff
  let valueAdvantage = "Original Baseline";
  let summary =
    "Mint condition aesthetics with factory-fresh stiffness. Great for special moments requiring crisp out-of-the-box prestige.";
  let comfortNote = "Upper materials are firm and will naturally mold to your foot shape over your first week.";

  if (wearPercent >= 15 && wearPercent <= 60) {
    phase = "sweet-spot";
    phaseLabel = "The Golden Sweet Spot (15–60%)";
    comfortIndex = 98; // Peak broken-in comfort
    valueAdvantage = discountPercent > 0 ? `${discountPercent}% Daily Discount` : "Up to 50% Rent Advantage";
    summary =
      "The pinnacle of footwear economics. Outsole cushioning and upper leather have softened to ergonomic perfection while daily rent is dramatically discounted.";
    comfortNote =
      "No painful break-in period. Midsole cushioning and upper flex points are already dialed for immediate all-day comfort.";
  } else if (wearPercent > 60) {
    phase = "seasoned";
    phaseLabel = "Seasoned Veteran (60–100%)";
    comfortIndex = 92;
    valueAdvantage = discountPercent > 0 ? `${discountPercent}% Deep Value` : "Maximum Rent Economy";
    summary =
      "Supreme circular economy choice. Highly supple, broken-in flex with our lowest daily rental tier for unbeatable everyday utility.";
    comfortNote = "Extremely pliable and relaxed, delivering a glove-like second-skin feel.";
  }

  return {
    phase,
    phaseLabel,
    wearPercent,
    comfortIndex,
    valueAdvantage,
    summary,
    comfortNote,
  };
}
