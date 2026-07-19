import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Simulator } from "@/components/sim/Simulator";
import { decodeShare, SHARE_PARAM, sharedMechLabel } from "@/share/codec";
import { mechanismOfTheDay } from "@/share/motd";

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * Shared links unfurl with the actual mechanism: the `?m=` param feeds both
 * the page title and the /api/og card. Without one, the card features the
 * mechanism of the day.
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const raw = (await searchParams)[SHARE_PARAM];
  const param = typeof raw === "string" ? raw : undefined;
  const shared = param ? decodeShare(param) : null;

  const title = shared
    ? `${sharedMechLabel(shared)} — Kinemagic`
    : "Kinemagic — planar mechanism simulator";
  const description = shared
    ? "A shared mechanism — the whole design lives in this link. Open it to drag joints, watch the coupler curve morph, and export it to fabricate."
    : `Design four-bar linkages and other planar mechanisms in the browser. Today: ${mechanismOfTheDay().title}. Drag joints, watch coupler curves trace live, then export to fabricate.`;
  const ogImage = shared ? `/api/og?${SHARE_PARAM}=${param}` : "/api/og";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default function Home() {
  return (
    <div className="flex h-dvh flex-col">
      <Header />
      <main className="flex min-h-0 flex-1 flex-col">
        <Simulator />
      </main>
    </div>
  );
}
