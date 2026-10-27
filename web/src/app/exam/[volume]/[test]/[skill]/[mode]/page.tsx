import { ContentReview } from "@/components/content-review";
import { notFound } from "next/navigation";
import { ListeningWorkspace } from "@/components/listening/workspace";
import { modes, parseSelection, skills, tests, volumes } from "@/lib/catalog";

export function generateStaticParams() {
  return volumes.flatMap((volume) =>
    tests.flatMap((test) =>
      skills.flatMap(({ id: skill }) =>
        modes.map(({ id: mode }) => ({ volume, test, skill, mode })),
      ),
    ),
  );
}

export default async function ExamPage({
  params,
}: PageProps<"/exam/[volume]/[test]/[skill]/[mode]">) {
  const selection = parseSelection(await params);
  if (!selection) notFound();
  if (selection.skill === "listening")
    return (
      <ListeningWorkspace
        key={`${selection.volume}-${selection.test}-${selection.mode}`}
        selection={selection}
      />
    );
  return (
    <ContentReview
      initialUnit={`${selection.volume}-${selection.test}-${selection.skill}`}
      mode={selection.mode}
    />
  );
}
