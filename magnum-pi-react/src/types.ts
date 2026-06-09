export interface Episode {
  rank: number;
  title: string;
  season: number;
  /** Episode number within the season; a string to allow two-parters like "1-2". */
  episode: string;
  score: number;
  synopsis: string;
}

export type SortKey = "rank" | "score" | "season" | "title";
