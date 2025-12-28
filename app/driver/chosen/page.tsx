import DriverDashboard from "@/app/driver/_pages/DriverDashboard";

export const dynamic = "force-dynamic";

export default function DriverChosenPage() {
  return <DriverDashboard initialTab="PICKUP" routeMode />;
}
