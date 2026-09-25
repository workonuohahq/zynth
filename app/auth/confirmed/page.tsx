import ConfirmedClient from "@/components/confirmed-client";

export default function ConfirmedPage({ searchParams }: { searchParams?: { email?: string } }) {
  return <ConfirmedClient email={searchParams?.email || ""} />;
}
