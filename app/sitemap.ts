import type { MetadataRoute } from "next";

const baseUrl = "https://ponglab.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${baseUrl}/`,
    },
    {
      url: `${baseUrl}/how-it-works`,
    },
    {
      url: `${baseUrl}/oferta`,
    },
  ];
}
