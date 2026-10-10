import { PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";

export default async function MerchantHome() {
  const user = await requireUser("MERCHANT");
  return <PageHeader title="My shoes" description={`Signed in as ${user.name}`} />;
}
