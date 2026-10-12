export type OccasionMoment = {
  id: string;
  name: string;
  shortName: string;
  tagline: string;
  experience: string;
  iconKind: "run" | "briefcase" | "coffee" | "sparkles";
  imageSrc: string;
};

export const OCCASIONS: OccasionMoment[] = [
  {
    id: "morning-run",
    name: "Morning Run & Performance",
    shortName: "Morning Run",
    tagline: "Miles, tempos, and race days",
    experience: "Morning Run",
    iconKind: "run",
    imageSrc: "/occasions/morning-run.jpg",
  },
  {
    id: "work-day",
    name: "Daily Office & Work",
    shortName: "Daily Office",
    tagline: "Smart casual, office polish & transit",
    experience: "Work Day",
    iconKind: "briefcase",
    imageSrc: "/occasions/work-day.jpg",
  },
  {
    id: "weekend-hangouts",
    name: "Weekend Hangouts & Cafes",
    shortName: "Weekend Hangouts",
    tagline: "Effortless casual comfort for days off",
    experience: "Weekend Stroll",
    iconKind: "coffee",
    imageSrc: "/occasions/weekend-stroll.jpg",
  },
  {
    id: "night-out",
    name: "Night Out & Big Occasions",
    shortName: "Night Out",
    tagline: "Evening silhouettes and standout pairs",
    experience: "Night Out",
    iconKind: "sparkles",
    imageSrc: "/occasions/night-out.jpg",
  },
];

export type RotationSlot = {
  role: string;
  description: string;
  experience: string;
  suggestedStyles: string[];
};

export type CuratedPack = {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  pairsCount: number;
  highlight: string;
  description: string;
  idealFor: string[];
  slots: RotationSlot[];
  browseHref: string;
};

export const CURATED_PACKS: CuratedPack[] = [
  {
    id: "marathon-recovery",
    title: "The Marathon & Active Recovery",
    subtitle: "Peak performance on tempo runs, cushioned support on recovery days.",
    badge: "3-Pair Rotation",
    pairsCount: 3,
    highlight: "Hold 3 pairs · Wear splits 3-ways · ~1/3 daily wear cost each",
    description:
      "Engineered for runners and high-mileage athletes. Rotating between a daily trainer, a responsive tempo pair, and a recovery sneaker protects your joints and triples overall shoe life.",
    idealFor: ["Morning Run", "Gym Session", "Weekend Stroll"],
    slots: [
      {
        role: "Daily Mileage Eater",
        description: "Max-cushion road endurance for daily miles",
        experience: "Morning Run",
        suggestedStyles: ["Nike Pegasus 41", "Asics Gel-Kayano"],
      },
      {
        role: "Speed & Tempo Day",
        description: "Lightweight, propulsive ride for fast workouts",
        experience: "Morning Run",
        suggestedStyles: ["Saucony Endorphin", "Adidas Adizero"],
      },
      {
        role: "Active Recovery",
        description: "Ultra-plush comfort for post-run errands & rest days",
        experience: "Weekend Stroll",
        suggestedStyles: ["Adidas Ultraboost", "New Balance 550"],
      },
    ],
    browseHref: "/browse?experience=Morning+Run",
  },
  {
    id: "urban-wardrobe",
    title: "The All-Week Urban Wardrobe",
    subtitle: "Boardroom polish by day, commute comfort in transit, casual weekend statements.",
    badge: "3-Pair Rotation",
    pairsCount: 3,
    highlight: "1 work shoe + 1 commuter + 1 weekend icon",
    description:
      "Transition seamlessly from Monday meetings to Saturday dinners. Keep your formal pairs pristine while heavy commuting wear is absorbed by dedicated transit sneakers.",
    idealFor: ["Work Day", "Weekend Stroll", "Night Out"],
    slots: [
      {
        role: "The Office Sharp",
        description: "Refined silhouette & leather finish for meetings",
        experience: "Work Day",
        suggestedStyles: ["Classic Loafers", "Minimalist Derbies"],
      },
      {
        role: "The Transit Commuter",
        description: "All-day walking support for subway & sidewalk",
        experience: "Work Day",
        suggestedStyles: ["New Balance 550", "Adidas Samba OG"],
      },
      {
        role: "The Weekend Statement",
        description: "Effortless street silhouette for cafes & evening hangouts",
        experience: "Night Out",
        suggestedStyles: ["Converse Chuck 70", "Vans Old Skool"],
      },
    ],
    browseHref: "/browse?experience=Work+Day",
  },
  {
    id: "city-explorer",
    title: "The 24/7 City Explorer",
    subtitle: "Timeless street silhouettes paired with athletic all-day comfort.",
    badge: "2-Pair Rotation",
    pairsCount: 2,
    highlight: "Daily alternate rotation · Doubles breathability & hygiene",
    description:
      "The ultimate two-pair foundation for city life. Alternating each pair day-by-day allows shoes to dry, air out, and stay in near-new condition for months.",
    idealFor: ["Street Session", "Weekend Stroll"],
    slots: [
      {
        role: "The Low-Top Classic",
        description: "Low-profile heritage sneaker matching any fit",
        experience: "Street Session",
        suggestedStyles: ["Adidas Samba", "Puma Suede Classic"],
      },
      {
        role: "The High-Mileage Mover",
        description: "Flexible cushion for 15,000+ step weekend exploration",
        experience: "Weekend Stroll",
        suggestedStyles: ["Nike Air Jordan", "Veja V-10"],
      },
    ],
    browseHref: "/browse?experience=Street+Session",
  },
];
