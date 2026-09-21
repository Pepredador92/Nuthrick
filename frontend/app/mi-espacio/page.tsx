import type { Metadata } from "next";
import { ClientApplication } from "@/src/app/ClientApplication";

export const metadata: Metadata = {
  title: "Mi espacio privado · Nuthrick",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function PatientSpaceRoute() {
  return <ClientApplication />;
}
