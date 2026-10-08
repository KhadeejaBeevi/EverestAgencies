import React, { useEffect, useState } from "react";
import './index.css';
import { auth } from "./components/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import UserDashboard from './components/UserDashboard/UserDashboard';
import Login from './components/UserLogin/UserLogin';
import Home from './components/Home/Home';
import UserLogin from './components/UserLogin/UserLogin';
import Dashboard from './pages/Dashboard';
import DashboardLayout from './pages/components/DashboardLayout';
import Datapage from './pages/components/Datapage';
import Sales from './pages/components/Salesimage';
import Banner from './pages/Checkstockcomp/Banner';
import StockSearch from './pages/Checkstockcomp/StockSearch';
import AdminDashboard from './components/AdminDashboard/AdminDashboard';
import CreateUser from './components/CreateUser/CreateUser';
import Sidebarbanner from './pages/Checkstockcomp/Sidebar';
import ProductList from './pages/Checkstockcomp/ProductListGodown';
import Salescrm from './pages/CRM/Salescrm';
import NewParty from './pages/newpartydetails/partydetailpage';
import CRMstock from './pages/CRMstockitem/maincrmpg';
import KsebUserDashboard from './components/KsebUserDashboard/KsebUserDashboard';
import PostDatedCheques from './components/postdatedCheques/postdatedCheques';
import CreateKsebUser from './components/CreateKsebUser/CreateKsebUser';
import KsebDirectory from './pages/kseb/KsebDirectory';
import CallHistory from './pages/kseb/CallHistory';
import CallEntry from './pages/kseb/CallEntry';
import Attendance from './pages/kseb/Attendance';
import ViewAttendance from "./components/ViewAttendance/ViewAttendance";
import NewKsebLead from './pages/kseb/NewKsebLead';
import ExcelSplit from './pages/kseb/SplitExcel';
import CreateSalesUser from './components/CreateSalesUser/CreateSalesUser';
import SalesUserDashboard from './components/SalesUserDashboard/SalesUserDashboard';
import SalesOrders from './pages/Sales/SalesOrders';
import SiteVisit from './pages/kseb/SiteVisit';
import LRPage from './pages/Sales/LorryReceipt';
import KsebDirectoryTable from './pages/kseb/KsebDirectoryTable';
import TravelPlanWidget from './pages/kseb/TravelPlanWidget';
import SolarNewLeads from './pages/Solar/SolarNewLeads';
import AIChatbot from './AIChatbot';
import TenderDetails from "./pages/kseb/TenderDetails";
import Unauthorized from "./Unauthorized";
import QuotationEntry from "./pages/Quotation/QuotationEntry";
import TenderExecutive from "./pages/kseb/TenderExecutive";
import ManageUsers from "./components/ManageUsers/ManageUsers";
import MyProfile from "./components/MyProfile/MyProfile";
import TableCompare from "./components/TableCompare/TableCompare";
import UserSessionManager from "./components/UserSessionManager";
import UserActivityReport from "./components/UserActivityReport/UserActivityReport";
import PageAccess from "./components/PageAccess/PageAccess";
import ProtectedRoute from "./components/ProtectedRoute";
import IdleLogout from "./components/IdleLogout";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import DeleteAccount from "./DeleteAccount";
import POEntry from "./pages/kseb/PODetails/POEntry"
import JobApplication from "./components/JobApplication/JobApplication";
import JobApplicationResponse from "./components/JobApplication/JobApplicationResponse";
import QuotationFollowup from "./pages/QuotationFollowup/QuotationFollowup";
import EnquiryReport from "./components/SalesOrder/EnquiryReport/EnquiryReport";
import QuotationWise from "./components/SalesOrder/QuotationWise/QuotationWise";
import GlobalAlterationAlert from "./components/GlobalAlterationAlert";
import TelecallerReport from "./components/SalesOrder/TelecallerReport/TelecallerReport";
import KSEBPayment from "./pages/kseb/KSEBPayment";
import KsebOverallSales from "./pages/kseb/KSEBOverallSales";
import KsebLocationReport from "./pages/kseb/KsebLocationReport";
import KsebDetailReport from "./pages/kseb/KsebDetailReport";
import SolarCustomers from "./pages/Solar/SolarCustomers";
import LeadContributionReport from "./pages/newpartydetails/LeadContributionReport";


function App() {


  const [user, setUser] = useState(null);

  useEffect(() => {

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();

  }, []);
  return (
    <Router>
      <UserSessionManager />
       <IdleLogout/>
       <GlobalAlterationAlert/>
      <Routes>
         <Route path="/" element={<Home />} /> {/* ✅ Home is now the first page */}

        <Route path="/admin-dashboard" element={
          <ProtectedRoute page="Admin Dashboard">
            <AdminDashboard />
          </ProtectedRoute>} />

        <Route path="/Createuser" element={
          <ProtectedRoute page="Create User">
            <CreateUser />
          </ProtectedRoute>} />

        <Route path="/Createksebuser" element={
          <ProtectedRoute page="Create Kseb User">
            <CreateKsebUser />
          </ProtectedRoute>} />

        <Route path="/postdatedcheques" element={
          <ProtectedRoute page="Post Dated Cheques">
            <PostDatedCheques />
          </ProtectedRoute>} />

        <Route path="/login" element={<UserLogin />} />

        {/* Every logged-in user can open their own profile; the page
            itself sends logged-out visitors back to the home page. */}
        <Route path="/myprofile" element={<MyProfile />} />

        <Route path="/user-dashboard" element={
          <ProtectedRoute page="User Dashboard">
            <UserDashboard />
          </ProtectedRoute>} />


        <Route path="/useractivityreport" element={
          <ProtectedRoute page="User Activity Report">
            <UserActivityReport />
          </ProtectedRoute>} />

        <Route path="/pageaccess" element={
          <ProtectedRoute page="Page Access">
            <PageAccess />
          </ProtectedRoute>} />


        <Route path="/ksebuserdashboard" element={
          <ProtectedRoute page="KSEB User Dashboard">
            <KsebUserDashboard />
          </ProtectedRoute>} />

        <Route path="/Ksebdirectory" element={
          <ProtectedRoute page="KSEB Directory">
            <KsebDirectory />
          </ProtectedRoute>
        } />
        <Route path="/callhistory" element={
          <ProtectedRoute page="Call History">
            <CallHistory />
          </ProtectedRoute>
        } />
        <Route path="/call-entry/:id" element={
          <ProtectedRoute page="Call Entry">
            <CallEntry />
          </ProtectedRoute>} />

        <Route path="/attendance" element={
          <ProtectedRoute page="Attendance">
            <Attendance />
          </ProtectedRoute>} />

        <Route path="/viewattendance" element={
          <ProtectedRoute page="View Attendance">
            <ViewAttendance />
          </ProtectedRoute>} />

        <Route path="/new-kseb-lead" element={
          <ProtectedRoute page="New Kseb Lead">
            <NewKsebLead />
          </ProtectedRoute>
        } />

        <Route path="/splitexcel" element={
          <ProtectedRoute page="Split Excel">
            <ExcelSplit />
          </ProtectedRoute>
        } />

        <Route path="/sitevisitdetails" element={
          <ProtectedRoute page="Site Visit">
            <SiteVisit />
          </ProtectedRoute>} />

        <Route path="/travelplan" element={
          <ProtectedRoute page="Travel Plan">
            <TravelPlanWidget />
          </ProtectedRoute>} />

        <Route path="/tenderdetails" element={
          <ProtectedRoute page="Tender Details">
            <TenderDetails />
          </ProtectedRoute>} />

        <Route path="/tenderexecutive" element={
          <ProtectedRoute page="Tender Executive">
            <TenderExecutive />
          </ProtectedRoute>} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute page="Dashboard">
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashsales" replace />} />
          <Route path="dashsales" element={<Sales />} />
          <Route path="dashdata" element={<Datapage />} />
        </Route>

        <Route
          path="/stock-check"
          element={
            <ProtectedRoute page="Stock Check">
              <Sidebarbanner />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="stockgodown" replace />} />
          <Route path="stockgodown" element={<ProductList />} />
        </Route>

        <Route path="/salescrm" element={
          <ProtectedRoute page="Sales CRM">
            <Salescrm />
          </ProtectedRoute>} />

        <Route path="/newpartyledgerdetails" element={
          <ProtectedRoute page="New Party">
            <NewParty />
          </ProtectedRoute>} />

        <Route path="/CRMstockitem" element={
          <ProtectedRoute page="Stock Items" >
            <CRMstock />
          </ProtectedRoute>} />

        <Route path="/ksebdirectorytable" element={
          <ProtectedRoute page="Kseb Directory Table">
            <KsebDirectoryTable />
          </ProtectedRoute>} />


        <Route path="/createsalesuser" element={
          <ProtectedRoute page="Create Sales User">
            <CreateSalesUser />
          </ProtectedRoute>} />

        <Route path="/manageusers" element={
          <ProtectedRoute page="Manage Users">
            <ManageUsers />
          </ProtectedRoute>} />

        <Route path="/salesdashboard" element={
          <ProtectedRoute page="Sales Dashboard">
            <SalesUserDashboard />
          </ProtectedRoute>} />

        <Route path="/salesorders" element={
          <ProtectedRoute page="Sales Orders">
            <SalesOrders />
          </ProtectedRoute>} />

        <Route path="/lrdetails" element={
          <ProtectedRoute page="Lorry Receipt">
            <LRPage />
          </ProtectedRoute>} />

        <Route path="/solarnewleads" element={
          <ProtectedRoute page="Solar New Leads">
            <SolarNewLeads />
          </ProtectedRoute>
        } />

  <Route path="/podetails" element={
          <ProtectedRoute page="PO Details">
            <POEntry/>
            </ProtectedRoute>
          } />

            <Route path="/quotationfollowup" element={
          <ProtectedRoute page="Quotation Followup">
            <QuotationFollowup/>
            </ProtectedRoute>
          } />


              <Route path="/enquiryreport" element={
          <ProtectedRoute page="Enquiry Report">
            <EnquiryReport/>
            </ProtectedRoute>
          } />


               <Route path="/quotationwise" element={
        <ProtectedRoute page="Quotation Wise Followup">
            <QuotationWise/>
           </ProtectedRoute>
          } />

          <Route path="/telecallerreport" element={
            <ProtectedRoute page="Telecaller Report">
              <TelecallerReport />
            </ProtectedRoute>
          }/>

          <Route path="/leadcontributionreport" element={
            <ProtectedRoute page="Lead Contribution Report">
              <LeadContributionReport />
            </ProtectedRoute>
          }/>

          <Route path="/ksebpayment" element={
            <ProtectedRoute page="KSEB Payment">
              <KSEBPayment />
            </ProtectedRoute>
          }/>

          
          <Route path="/kseboverallsales" element={
            <ProtectedRoute page="KSEB Overall Sales">
              <KsebOverallSales />
            </ProtectedRoute>
          }/>

          <Route path="/kseblocationreport" element={
            <ProtectedRoute page="KSEB Location Report">
              <KsebLocationReport />
            </ProtectedRoute>
          }/>

          <Route path="/ksebdetailreport" element={
            <ProtectedRoute page="KSEB Detail Report">
              <KsebDetailReport />
            </ProtectedRoute>
          }/>

          <Route path="/solarcustomers" element={
            <ProtectedRoute page="Solar Customers">
              <SolarCustomers />
            </ProtectedRoute>
          }/>


          <Route path="/jobapplication" element={
          <ProtectedRoute page="Job Application">
            <JobApplication />
          </ProtectedRoute>
        }/>
          <Route path="/jobapplicationresponse" element={
          <ProtectedRoute page="Job Application Response">
            <JobApplicationResponse />
          </ProtectedRoute>
        }/>

        <Route path="/chatbot" element={
          <ProtectedRoute page="AI Chatbot">
            <AIChatbot />
          </ProtectedRoute>
        } />
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route path="/quotationentry" element={
          <ProtectedRoute page="Quotation Entry">
            <QuotationEntry />
          </ProtectedRoute>
        } />

        <Route path="/tablecompare" element={
          <ProtectedRoute page="Table Compare">
            <TableCompare />
          </ProtectedRoute>
        } />


        <Route path="/privacy-policy" element={<PrivacyPolicy/>} />

        <Route path="/delete-account" element={<DeleteAccount/>} />


      </Routes>

      <ToastContainer />

    </Router>
  );
}

export default App;

