import DriverDashboard from "@/app/driver/_pages/DriverDashboard";

export const dynamic = "force-dynamic";

export default function DriverOpenPage() {
  return <DriverDashboard initialTab="OFFERS" routeMode />;
}
