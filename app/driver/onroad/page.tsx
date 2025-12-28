import DriverDashboard from "@/app/driver/_pages/DriverDashboard";

export const dynamic = "force-dynamic";

export default function DriverOnRoadPage() {
  return <DriverDashboard initialTab="IN_TRANSIT" routeMode />;
}
