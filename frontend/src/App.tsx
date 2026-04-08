import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from "react-router-dom";
import {
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
  useMsal,
} from "@azure/msal-react";
import { loginRequest } from "./authConfig";
import { SignalRProvider } from "./hooks/useSignalR";
import {
  Activity,
  ShieldAlert,
  CircleUserRound,
  Search,
  Database,
  LayoutDashboard,
  Menu
} from "lucide-react";
import React from "react";
import Dashboard from "./pages/Dashboard";
import AlertHistory from "./pages/AlertHistory";
import SecuritySearch from "./pages/SecuritySearch";
import AccessLog from "./pages/AccessLog";
import ProcessMonitor from "./pages/ProcessMonitor";
import AssetExplorer from "./pages/AssetExplorer";

function Layout({ children }: { children: React.ReactNode }) {
  const { instance, accounts } = useMsal();

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside className="sidebar">
        <div style={{ display: "flex", alignItems: "center", gap: "0.8rem", marginBottom: "2.5rem", padding: "0 1rem" }}>
           <img src="/logo.png" alt="Logo" style={{ width: "35px", height: "35px" }} />
           <h4 style={{ color: "white", margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>SIEM SECUNARY</h4>
        </div>
        
        <nav style={{ flex: 1 }}>
          <NavLink to="/dashboard" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <LayoutDashboard size={18} className="nav-icon" /> Overview
          </NavLink>
          <NavLink to="/alerts" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <ShieldAlert size={18} className="nav-icon" /> Security Incidents
          </NavLink>
          <NavLink to="/access-log" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <CircleUserRound size={18} className="nav-icon" /> Identity Logs
          </NavLink>
          <NavLink to="/processes" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <Activity size={18} className="nav-icon" /> Forensic Processes
          </NavLink>
          <NavLink to="/infrastructure-assets" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <Database size={18} className="nav-icon" /> Infrastructure Assets
          </NavLink>
          <NavLink to="/search" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <Search size={18} className="nav-icon" /> KQL Log Explorer
          </NavLink>
        </nav>
      </aside>
      <main style={{ flex: 1, overflowY: 'auto' }}>
        <header style={{ height: '55px', background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <Menu size={18} style={{ marginRight: '0.8rem', color: '#64748b' }} />
                <h2 style={{ fontSize: '1rem', margin: 0, color: 'var(--primary)', fontWeight: 700 }}>Secunary SIEM Dashboard</h2>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600 }}>
                        {accounts[0]?.name} ({accounts[0]?.username})
                    </p>
                </div>
                <div style={{ borderLeft: '1px solid #e2e8f0', height: '24px', margin: '0 4px' }}></div>
                <button 
                    onClick={() => instance.logoutRedirect()}
                    className="btn-outline"
                >
                    Sign Out
                </button>
            </div>
        </header>
        <div style={{ padding: "1rem" }}>
          {children}
        </div>
      </main>
    </div>
  );
}

const MicrosoftIcon = () => (
  <svg width="20" height="20" viewBox="0 0 23 23" fill="none">
    <rect width="10.8" height="10.8" fill="#f35325"/>
    <rect x="12.2" width="10.8" height="10.8" fill="#81bc06"/>
    <rect y="12.2" width="10.8" height="10.8" fill="#05a6f0"/>
    <rect x="12.2" y="12.2" width="10.8" height="10.8" fill="#ffba08"/>
  </svg>
);

function Welcome() {
  const { instance } = useMsal();
  return (
    <div style={{ 
      height: "100vh", 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center", 
      background: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)",
      padding: '1rem'
    }}>
      <div className="card" style={{ 
        width: "100%", 
        maxWidth: "420px", 
        padding: "3rem 2.5rem", 
        textAlign: "center",
        border: '1px solid rgba(17, 75, 95, 0.1)'
      }}>
        <div style={{ 
          width: '80px', 
          height: '80px', 
          background: 'white', 
          borderRadius: '50%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          margin: '0 auto 1.5rem auto',
          border: '1px solid #f1f5f9'
        }}>
          <img src="/logo.png" alt="Logo" style={{ width: '50px', height: '50px', objectFit: 'contain' }} />
        </div>
        
        <h1 style={{ 
          fontSize: '1.75rem', 
          fontWeight: 800, 
          margin: '0 0 0.5rem 0',
          color: 'var(--primary)',
          letterSpacing: '-0.02em'
        }}>
          SIEM - SECUNARY
        </h1>
        
        <p style={{ 
          color: 'var(--text-secondary)', 
          fontSize: '0.925rem',
          margin: '0 0 2.5rem 0',
          lineHeight: 1.5
        }}>
          Enterprise Security Information & Event Management. Please sign in to access your dashboard.
        </p>
        
        <button 
          onClick={() => instance.loginRedirect(loginRequest)}
          className="login-btn"
        >
          <MicrosoftIcon />
          Sign In with Microsoft
        </button>
        
        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #f1f5f9' }}>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Authorized Personnel Only • Secunary Security Operations
          </p>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <UnauthenticatedTemplate>
        <Welcome />
      </UnauthenticatedTemplate>
      <AuthenticatedTemplate>
        <SignalRProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/alerts" element={<AlertHistory />} />
              <Route path="/access-log" element={<AccessLog />} />
              <Route path="/processes" element={<ProcessMonitor />} />
              <Route path="/infrastructure-assets" element={<AssetExplorer />} />
              <Route path="/sql-monitor" element={<Navigate to="/infrastructure-assets" replace />} />
              <Route path="/search" element={<SecuritySearch />} />
              <Route path="*" element={<div><h1>404 Not Found</h1></div>} />
            </Routes>
          </Layout>
        </SignalRProvider>
      </AuthenticatedTemplate>
    </Router>
  );
}

export default App;
