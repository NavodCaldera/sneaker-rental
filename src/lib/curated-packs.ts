export type OccasionMoment = {
  id: string;
  name: string;
  shortName: string;
  tagline: string;
  experience: string;
  iconKind: "run" | "briefcase" | "coffee" | "sparkles";
  imageSrc: string;
};

/**
 * The home page's Moments & Occasions cards (titles set by the product owner, see CLAUDE.md).
 * Each card opens Browse filtered by `experience`, which is also the Closet slot name, so its
 * title contains that experience's name.
 */
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
    name: "The Daily Commute & Work Day",
    shortName: "Work Day",
    tagline: "Smart casual, office polish & transit",
    experience: "Work Day",
    iconKind: "briefcase",
    imageSrc: "/occasions/work-day.jpg",
  },
  {
    id: "weekend-stroll",
    name: "Weekend Stroll & Brunch",
    shortName: "Weekend Stroll",
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
