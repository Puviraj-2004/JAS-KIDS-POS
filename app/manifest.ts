import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JAS Kids POS",
    short_name: "JAS Kids POS",
    description: "JAS Kids point of sale",
    start_url: "/pos/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#006747",
    icons: [
      {
        src: "/Jaskids_Logo.png?app-icon=2",
        sizes: "420x136",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
