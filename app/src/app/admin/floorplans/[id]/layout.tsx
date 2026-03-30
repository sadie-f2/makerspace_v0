import { requireStaff } from "@/lib/requireStaff";

export default async function FloorplanDetailLayout({ children }: { children: React.ReactNode }) {
  await requireStaff();
  return <>{children}</>;
}
