
import type { Metadata } from "next";
import MaxAppClient from "./MaxAppClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PongLab — MAX",
  robots: {
    index: false,
    follow: false,
  },
};

export default function MaxAppPage() {
  return <MaxAppClient />;
}
