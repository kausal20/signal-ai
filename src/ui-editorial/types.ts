// Presentation contract for the editorial UI. Backend-agnostic: pages and
// components only ever receive these shapes (via props); `src/adapters/editorial.ts`
// maps the real feed / search models onto them. Nothing here is invented — every
// optional field is simply absent when the source data doesn't have it.

export type EdNavKey = "home" | "search" | "signal" | "saved" | "profile";

export interface EdStory {
  id: string;
  title: string;
  /** Short factual description from the publisher's own summary. */
  deck?: string;
  /** Publisher display name (real; falls back to the domain). */
  source: string;
  domain?: string;
  /** Original article URL (opens at the publisher). */
  url?: string;
  /** Topic / event label shown as a small kicker. */
  kicker?: string;
  timeAgo?: string;
  publishedAt?: string;
  /** First-party / official source (verified by the source-intelligence layer). */
  official?: boolean;
  /** Real publisher image when we have one. Never generated. */
  image?: string;
  imageCredit?: string;
  saved: boolean;
  read?: boolean;
  /** ISO time the user saved it — present only for saves made after tracking began. */
  savedAt?: string;
}

export interface EdTopic {
  id: string;
  label: string;
}

export type EdLoadState = "loading" | "ready" | "empty" | "error";
