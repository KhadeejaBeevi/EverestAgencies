import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import DashboardLayout from './components/DashboardLayout';
import Sales from './components/Salesimage';
import Datapage from './components/Datapage';

function Dashboard() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<DashboardLayout />}>
          <Route path="/dashsales" element={<Sales />} />
          <Route path="/dashdata" element={<Datapage />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default Dashboard;
