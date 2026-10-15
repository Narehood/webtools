import { lazy } from "react";
import { extraTools } from "../../data/extraTools";

const workbenches = {
  crypto: lazy(() => import("./workbenches/CryptoWorkbench")),
  formats: lazy(() => import("./workbenches/FormatWorkbench")),
  text: lazy(() => import("./workbenches/TextWorkbench")),
  network: lazy(() => import("./workbenches/NetworkWorkbench")),
  developer: lazy(() => import("./workbenches/DeveloperWorkbench")),
  browser: lazy(() => import("./workbenches/BrowserWorkbench")),
  calculators: lazy(() => import("./workbenches/CalculatorWorkbench")),
  images: lazy(() => import("./workbenches/ImageWorkbench")),
  files: lazy(() => import("./workbenches/FileWorkbench")),
};

export default function ExtraToolPage({ slug }: { slug: string }) {
  const tool = extraTools.find((item) => item.slug === slug);
  if (!tool) return null;
  const Workbench = workbenches[tool.group];
  return <Workbench key={slug} slug={slug} />;
}
