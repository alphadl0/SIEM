import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from "react-router-dom";
import {
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
  useMsal,
} from "@azure/msal-react";
import { loginRequest } from "./authConfig";
import { SignalRProvider, useSignalR } from "./hooks/useSignalR";
import {
  Activity,
  ShieldAlert,
  CircleUserRound,
  FileText,
  Search,
  Database,
  LayoutDashboard,
  CloudRain,
  ChevronRight
} from "lucide-react";
import React from "react";
import Dashboard from "./pages/Dashboard";
import { formatTimestamp } from "./lib/format";
import AlertHistory from "./pages/AlertHistory";
import SecuritySearch from "./pages/SecuritySearch";
import AccessLog from "./pages/AccessLog";
import AuditLog from "./pages/AuditLog";
import ProcessMonitor from "./pages/ProcessMonitor";
import AssetExplorer from "./pages/AssetExplorer";
import AzureActivity from "./pages/AzureActivity";

function Layout({ children }: { children: React.ReactNode }) {
  const { instance, accounts } = useMsal();
  const { connectionStatus, lastPoll } = useSignalR();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside className={`sidebar ${isSidebarOpen ? '' : 'closed'}`}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", marginBottom: "2.5rem", padding: "0 0.5rem" }}>
              <img src="/logo1.png" alt="Logo" style={{ width: "36px", height: "36px", marginBottom: '0.4rem', display: 'block' }} />
              <h4 className="sidebar-title" style={{ color: "white", margin: 0, fontWeight: 700, fontSize: "1.05rem", textAlign: 'center' }}>SIEM Portal</h4>
            </div>
        <nav style={{ flex: 1, display: "flex", flexDirection: "column" }} onClick={() => setIsSidebarOpen(false)}>
          <NavLink to="/dashboard" data-title="Overview" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <LayoutDashboard size={16} className="nav-icon" /> <span className="nav-text" style={{ fontSize: "0.825rem", fontWeight: 500 }}>Overview</span>
          </NavLink>
          <NavLink to="/alerts" data-title="Security Incidents" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <ShieldAlert size={16} className="nav-icon" /> <span className="nav-text" style={{ fontSize: "0.825rem", fontWeight: 500 }}>Security Incidents</span>
          </NavLink>
          <NavLink to="/access-log" data-title="Identity Logs" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <CircleUserRound size={16} className="nav-icon" /> <span className="nav-text" style={{ fontSize: "0.825rem", fontWeight: 500 }}>Identity Logs</span>
          </NavLink>
          <NavLink to="/audit-log" data-title="Audit Logs" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <FileText size={16} className="nav-icon" /> <span className="nav-text" style={{ fontSize: "0.825rem", fontWeight: 500 }}>Audit Logs</span>
          </NavLink>
          <NavLink to="/processes" data-title="Forensic Processes" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <Activity size={16} className="nav-icon" /> <span className="nav-text" style={{ fontSize: "0.825rem", fontWeight: 500 }}>Forensic Processes</span>
          </NavLink>
          <NavLink to="/infrastructure-assets" data-title="Infrastructure Assets" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <Database size={16} className="nav-icon" /> <span className="nav-text" style={{ fontSize: "0.825rem", fontWeight: 500 }}>Infrastructure Assets</span>
          </NavLink>          <NavLink to="/azure-activity" data-title="Azure Activity" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <CloudRain size={16} className="nav-icon" /> <span className="nav-text" style={{ fontSize: "0.825rem", fontWeight: 500 }}>Azure Activity</span>
          </NavLink>          <NavLink to="/search" data-title="KQL Log Explorer" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <Search size={16} className="nav-icon" /> <span className="nav-text" style={{ fontSize: "0.825rem", fontWeight: 500 }}>KQL Log Explorer</span>
          </NavLink>
        </nav>
        <div style={{ padding: 0, marginRight: isSidebarOpen ? "-1rem" : 0, marginTop: "auto", marginBottom: "-1.5rem", display: "flex", justifyContent: isSidebarOpen ? "flex-end" : "center", position: "relative" }}>
          <button className="btn-no-anim toggle-nav-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            data-title={isSidebarOpen ? "Collapse menu" : "Expand menu"}
            style={{
              cursor: "pointer",
              marginBottom: 0,
              gap: 0,
              justifyContent: "center",
              width: "40px",
              height: "40px",
              padding: 0,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.1)",
              border: "none",
              color: "white"
            }}
          >
            <div style={{ display: "flex", transition: "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)", transform: isSidebarOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
              <ChevronRight size={16} color="currentColor" style={{ marginLeft: "-2px" }} />
              <ChevronRight size={16} color="currentColor" style={{ marginLeft: "-8px", marginRight: "-2px" }} />
            </div>
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, overflowY: 'auto', overflowX: 'visible' }}>
        <header style={{ height: '42px', background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <h2 style={{ fontSize: '1rem', margin: 0, color: 'var(--primary)', fontWeight: 700 }}>Sporthink SIEM Dashboard</h2>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {lastPoll && (
                  <div style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 500 }}>
                    Poll: {formatTimestamp(lastPoll.timestamp)} • Status: <span className="text-success" style={{ fontWeight: 600 }}>{lastPoll.status.charAt(0).toUpperCase() + lastPoll.status.slice(1)}</span>
                  </div>
                )}
                <div
                  className={`badge ${
                    connectionStatus === 'Connected' ? 'low' :
                    connectionStatus === 'Unauthorized' ? 'critical' : 'medium'     
                  }`}
                  style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.15rem 0.5rem' }}
                >
                  SIGNALR: {connectionStatus.toUpperCase()}
                </div>
                <div style={{ borderLeft: '1px solid #e2e8f0', height: '24px', margin: '0 4px' }}></div>
                <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center' }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#334155', fontWeight: 600, lineHeight: 1 }}>
                        {accounts[0]?.name} ({accounts[0]?.username})
                    </p>
                </div>
                <div style={{ borderLeft: '1px solid #e2e8f0', height: '24px', margin: '0 4px' }}></div>
                <button 
                    onClick={() => instance.logoutRedirect()}
                    className="btn-outline"
                    style={{ fontSize: '0.85rem', fontWeight: 600, padding: '0.2rem 0.75rem', height: 'auto' }}
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
          SIEM - SPORTHINK
        </h1>
        
        <p style={{ 
          color: '#334155', 
          fontSize: '0.925rem',
          fontWeight: 500,
          margin: '0 0 3.5rem 0',
          lineHeight: 1.5
        }}>
          Security Information & Event Management<br/><br/>
          Please sign in to access your dashboard
        </p>
        
        <button 
          onClick={() => instance.loginRedirect(loginRequest)}
          className="login-btn"
          style={{ fontSize: '1.05rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}
        >
          <MicrosoftIcon />
          Sign in with Microsoft
        </button>
        
        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #cbd5e1' }}>
          <p style={{ margin: 0, fontSize: '0.925rem', color: '#334155', fontWeight: 500 }}>
            Authorized Personnel Only • Sporthink Security Operations
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
              <Route path="/audit-log" element={<AuditLog />} />
              <Route path="/processes" element={<ProcessMonitor />} />
              <Route path="/infrastructure-assets" element={<AssetExplorer />} />
              <Route path="/azure-activity" element={<AzureActivity />} />
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
