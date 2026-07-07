import anthropicLogo from "@/assets/brand-logos/anthropic.svg";
import appleLogo from "@/assets/brand-logos/apple.svg";
import arxivLogo from "@/assets/brand-logos/arxiv.svg";
import azureLogo from "@/assets/brand-logos/azure.svg";
import cursorLogo from "@/assets/brand-logos/cursor.svg";
import githubLogo from "@/assets/brand-logos/github.svg";
import googleLogo from "@/assets/brand-logos/google.svg";
import hackernewsLogo from "@/assets/brand-logos/hackernews.svg";
import huggingfaceLogo from "@/assets/brand-logos/huggingface.svg";
import langchainLogo from "@/assets/brand-logos/langchain.svg";
import metaLogo from "@/assets/brand-logos/meta.svg";
import microsoftLogo from "@/assets/brand-logos/microsoft.svg";
import mistralLogo from "@/assets/brand-logos/mistral.svg";
import nvidiaLogo from "@/assets/brand-logos/nvidia.svg";
import openaiLogo from "@/assets/brand-logos/openai.svg";
import perplexityLogo from "@/assets/brand-logos/perplexity.svg";
import producthuntLogo from "@/assets/brand-logos/producthunt.svg";
import redditLogo from "@/assets/brand-logos/reddit.svg";
import runwayLogo from "@/assets/brand-logos/runway.svg";

export const BRAND_LOGOS = {
  anthropic: anthropicLogo,
  apple: appleLogo,
  arxiv: arxivLogo,
  azure: azureLogo,
  cursor: cursorLogo,
  github: githubLogo,
  google: googleLogo,
  hackernews: hackernewsLogo,
  huggingface: huggingfaceLogo,
  langchain: langchainLogo,
  meta: metaLogo,
  microsoft: microsoftLogo,
  mistral: mistralLogo,
  nvidia: nvidiaLogo,
  openai: openaiLogo,
  perplexity: perplexityLogo,
  producthunt: producthuntLogo,
  reddit: redditLogo,
  runway: runwayLogo,
} as const;

export type BrandLogoKey = keyof typeof BRAND_LOGOS;
