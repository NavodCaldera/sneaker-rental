import { PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";

export default async function AdminHome() {
  await requireUser("ADMIN");
  return <PageHeader title="Admin overview" />;
}
