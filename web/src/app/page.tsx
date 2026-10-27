import { Suspense } from "react";
import { Library } from "@/components/library";

export default function Home() {
  return <Suspense fallback={<main className="page-width py-20">Loading your library…</main>}><Library /></Suspense>;
}
