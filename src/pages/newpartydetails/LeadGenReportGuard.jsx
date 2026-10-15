import { Link } from "react-router-dom";
import Banner from "../../components/Banner/Banner.jsx";
import useIsAdmin from "./useIsAdmin";

// Lead GEN reports are visible to admins only.
export function AdminOnly({ children }) {
  const { isAdmin, loaded } = useIsAdmin();

  if (!loaded) return <div>Loading...</div>;

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-blue-100 flex flex-col">
        <Banner />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <h1 className="text-3xl font-bold text-red-600">Access Denied</h1>
          <p className="text-gray-700">This report is available to admins only.</p>
          <BackToLeadGen />
        </div>
      </div>
    );
  }

  return children;
}

export function BackToLeadGen() {
  return (
    <Link
      to="/newpartyledgerdetails"
      className="inline-flex items-center gap-2 bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm"
    >
      ← Back to Lead GEN
    </Link>
  );
}
