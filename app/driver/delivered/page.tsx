import DriverDashboard from "@/app/driver/_pages/DriverDashboard";

export const dynamic = "force-dynamic";

export default function DriverDeliveredPage() {
  return <DriverDashboard initialTab="DONE" routeMode />;
}
