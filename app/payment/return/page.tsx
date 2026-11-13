import PaymentReturnClient from "@/components/PaymentReturnClient";

export const dynamic = "force-dynamic";

export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ payment_group_id?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawGroupId = params.payment_group_id;
  const paymentGroupId = Array.isArray(rawGroupId) ? rawGroupId[0] ?? "" : rawGroupId ?? "";

  return <PaymentReturnClient paymentGroupId={paymentGroupId} />;
}
