// Civic Signal style: a warm editorial operations dashboard for visible, accountable campus service resolution.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CsrmsApiError, csrmsApi, tokenStore, type CsrmsRequest, type CsrmsTelemetryPoint, type CsrmsTelemetryResponse, type CsrmsUser } from "@/lib/csrms-api";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Activity,
  AlertTriangle,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ClipboardList,
  CloudRain,
  Flame,
  Home as HomeIcon,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Network,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  UserRound,
  Users,
  Wifi,
  X,
  Zap,
} from "lucide-react";

type Role = "Student" | "Staff" | "Admin";
type Section = "Overview" | "Requests" | "Sensors" | "People";

type Request = {
  id: string;
  apiId?: number;
  title: string;
  category: string;
  location: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  status: "Pending" | "Assigned" | "In progress" | "Resolved";
  source: "Student" | "System";
  updated: string;
};

const requests: Request[] = [
  { id: "CSR-2048", title: "WiFi outage in Science Lab 2", category: "IT Support", location: "Science block · Lab 2", priority: "High", status: "In progress", source: "Student", updated: "12 min ago" },
  { id: "CSR-2047", title: "Moisture detected near residence geyser", category: "Facilities", location: "Residence C · Ground floor", priority: "High", status: "Assigned", source: "System", updated: "18 min ago" },
  { id: "CSR-2046", title: "Broken projector before afternoon lecture", category: "Equipment", location: "Lecture hall 4", priority: "Medium", status: "Pending", source: "Student", updated: "31 min ago" },
  { id: "CSR-2045", title: "Smoke threshold crossed in server room", category: "Safety", location: "ICT building · Server room", priority: "Critical", status: "Resolved", source: "System", updated: "1 hr ago" },
];

const navItems: { label: Section; icon: typeof LayoutDashboard; roles?: Role[] }[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Requests", icon: ClipboardList },
  { label: "Sensors", icon: Activity, roles: ["Staff", "Admin"] },
  { label: "People", icon: Users, roles: ["Admin"] },
];

const priorityTone: Record<Request["priority"], string> = {
  Critical: "bg-[#fce7df] text-[#a5452d]",
  High: "bg-[#fff0ce] text-[#a16312]",
  Medium: "bg-[#e8eef1] text-[#49616b]",
  Low: "bg-[#e6f0e8] text-[#39704c]",
};

const statusTone: Record<Request["status"], string> = {
  Pending: "bg-[#f6eee1] text-[#906c3a]",
  Assigned: "bg-[#e6eef1] text-[#416271]",
  "In progress": "bg-[#e7effc] text-[#315b96]",
  Resolved: "bg-[#e3f0e5] text-[#39704c]",
};

function SignalMark({ small = false }: { small?: boolean }) {
  const size = small ? 32 : 40;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="CSRMS signal mark" className="shrink-0">
      <rect width="40" height="40" rx="12" fill="#e6a649" />
      <path d="M10 20h5l3-8 5 17 3-9h4" fill="none" stroke="#102a35" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="20" r="2" fill="#102a35" />
    </svg>
  );
}

function mapApiRequest(item: CsrmsRequest): Request {
  const category = typeof item.category === "string" ? item.category : item.category?.name ?? "General";
  const statusMap: Record<string, Request["status"]> = { PENDING: "Pending", ASSIGNED: "Assigned", IN_PROGRESS: "In progress", RESOLVED: "Resolved", CANCELLED: "Resolved" };
  const priorityMap: Record<string, Request["priority"]> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical" };
  return { id: item.reference ?? `CSR-${item.id}`, apiId: item.id, title: item.title, category, location: item.location ?? "Campus", priority: priorityMap[item.priority] ?? "Medium", status: statusMap[item.status] ?? "Pending", source: item.source === "SYSTEM" ? "System" : "Student", updated: item.updated_at ? new Date(item.updated_at).toLocaleString([], { hour: "2-digit", minute: "2-digit" }) : "Recently" };
}

export default function Home() {
  const [role, setRole] = useState<Role>("Staff");
  const [section, setSection] = useState<Section>("Overview");
  const [query, setQuery] = useState("");
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [liveRequests, setLiveRequests] = useState<Request[] | null>(null);
  const [dashboardSummary, setDashboardSummary] = useState<Record<string, number> | null>(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const [apiError, setApiError] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const [currentUser, setCurrentUser] = useState<CsrmsUser | null>(null);

  const visibleNav = navItems.filter((item) => !item.roles || item.roles.includes(role));
  const liveDisplayName = currentUser?.first_name || currentUser?.username;
  const roleName = liveDisplayName ?? (role === "Student" ? "Naledi" : role === "Admin" ? "Thabo" : "Lerato");
  const roleBrief = role === "Student" ? "Track your campus requests and see what is happening next." : role === "Admin" ? "See the whole campus picture and keep the service system accountable." : "Review what needs a human hand next and keep campus moving.";
  const isLiveSession = Boolean(currentUser);
  const filteredRequests = useMemo(
    () => (liveRequests ?? requests).filter((request) => role !== "Student" || request.source === "Student").filter((request) => `${request.title} ${request.category} ${request.location}`.toLowerCase().includes(query.toLowerCase())),
    [query, liveRequests, role],
  );

  useEffect(() => {
    if (!tokenStore.access) return;
    Promise.all([csrmsApi.me(), csrmsApi.requests(), csrmsApi.dashboard(), csrmsApi.notifications()])
      .then(([user, apiItems, summary, notifications]) => {
        setCurrentUser(user);
        setRole(user.role === "ADMIN" ? "Admin" : user.role === "STUDENT" ? "Student" : "Staff");
        setLiveRequests(apiItems.map(mapApiRequest));
        setDashboardSummary(summary);
        setNotificationCount(notifications.filter((item) => item.is_read === false).length);
        setApiError("");
      })
      .catch((error: unknown) => setApiError(error instanceof CsrmsApiError ? error.message : "The CSRMS API could not be reached."));
  }, []);

  const handlePlaceholder = (message: string) => toast(message);
  const cycleDemoRole = () => { if (currentUser) { toast(`Signed in as ${currentUser.username}. Demo role switching is disabled for this live session.`); return; } const next = role === "Staff" ? "Student" : role === "Student" ? "Admin" : "Staff"; setRole(next); setSection("Overview"); toast(`Demo workspace switched to ${next}.`); };
  const handleLogin = async (username: string, password: string) => {
    try {
      const result = await csrmsApi.login(username, password);
      setShowAuth(false);
      if (result.user) setCurrentUser(result.user);
      setRole(result.user?.role === "ADMIN" ? "Admin" : result.user?.role === "STUDENT" ? "Student" : "Staff");
      const [user, apiItems, summary, notifications] = await Promise.all([csrmsApi.me(), csrmsApi.requests(), csrmsApi.dashboard(), csrmsApi.notifications()]);
      setCurrentUser(user);
      setRole(user.role === "ADMIN" ? "Admin" : user.role === "STUDENT" ? "Student" : "Staff");
      setLiveRequests(apiItems.map(mapApiRequest));
      setDashboardSummary(summary);
      setNotificationCount(notifications.filter((item) => item.is_read === false).length);
      toast("Signed in to the CSRMS operations desk.");
    } catch (error) {
      toast(error instanceof CsrmsApiError ? error.message : "Sign in failed. Check the API and credentials.");
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f0e8] text-[#182b35]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col border-r border-[#d8d0c3] bg-[#102a35] text-white lg:flex">
        <div className="flex items-center gap-3 border-b border-white/10 px-7 py-6">
          <SignalMark />
          <div><div className="font-serif text-xl tracking-tight">CSRMS</div><div className="text-[10px] uppercase tracking-[0.2em] text-[#b9c8c8]">Campus service desk</div></div>
        </div>
        <div className="px-5 py-6"><div className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8ea3a4]">Workspace</div>
          <nav className="space-y-1">{visibleNav.map(({ label, icon: Icon }) => <button key={label} onClick={() => setSection(label)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${section === label ? "bg-[#e6a649] font-semibold text-[#102a35] shadow-[0_8px_20px_rgba(230,166,73,.18)]" : "text-[#d1dada] hover:bg-white/10"}`}><Icon className="h-4 w-4" />{label}{label === "Requests" && <span className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-[10px]">24</span>}</button>)}</nav>
        </div>
        <div className="mt-auto border-t border-white/10 p-5"><button onClick={() => handlePlaceholder("Settings are ready for the API connection.")} className="mb-4 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-[#d1dada] hover:bg-white/10"><Settings className="h-4 w-4" />Settings</button><button onClick={cycleDemoRole} className="flex w-full items-center gap-3 rounded-2xl bg-white/10 p-3 text-left hover:bg-white/15"><div className="grid h-9 w-9 place-items-center rounded-full bg-[#e6a649] font-semibold text-[#102a35]">{role[0]}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{currentUser ? (currentUser.first_name || currentUser.username) : role === "Staff" ? "Lerato Mokoena" : role === "Admin" ? "Thabo Ndlovu" : "Naledi K."}</div><div className="text-xs text-[#a9b9b8]">{currentUser ? `${currentUser.username} · live session` : `${role} demo · switch role`}</div></div><ChevronDown className="h-4 w-4 text-[#a9b9b8]" /></button></div>
      </aside>

      <main className="lg:pl-[252px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-[#ddd5c8] bg-[#f5f0e8]/95 px-5 backdrop-blur-xl sm:px-8 lg:px-12"><div className="flex items-center gap-3 lg:hidden"><SignalMark small /><span className="font-serif text-xl">CSRMS</span></div><div className="hidden lg:block"><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7950]">Tuesday · 18 August 2026 · {role} workspace{isLiveSession ? " · live API" : " · demo"}</div><div className="font-serif text-2xl leading-tight">Good morning, {roleName}.</div></div><div className="flex items-center gap-3"><button className="hidden h-10 items-center gap-2 rounded-xl border border-[#d9d0c2] bg-[#faf7f1] px-3 text-sm text-[#68767a] sm:flex"><Search className="h-4 w-4" />Search requests <kbd className="ml-2 rounded bg-[#eee7dc] px-1.5 py-0.5 text-[10px]">⌘K</kbd></button><button onClick={() => handlePlaceholder(notificationCount ? `You have ${notificationCount} unread notifications.` : "No unread notifications.")} className="relative grid h-10 w-10 place-items-center rounded-xl border border-[#d9d0c2] bg-[#faf7f1] text-[#45616a] hover:bg-white"><Bell className="h-4 w-4" />{notificationCount > 0 && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#d16848]" />}</button><button onClick={() => setShowAuth(true)} className="grid h-10 w-10 place-items-center rounded-xl bg-[#102a35] text-sm font-semibold text-white hover:bg-[#1d4250]" title="Sign in with CSRMS"><UserRound className="h-4 w-4" /></button></div></header>

        <div className="mx-auto max-w-[1480px] px-5 py-7 sm:px-8 lg:px-12 lg:py-10">
          {section === "Overview" && <>
            <section className="relative overflow-hidden rounded-[26px] bg-[#173d48] p-7 text-white shadow-[0_20px_55px_rgba(29,56,65,.15)] sm:p-10"><div className="relative z-10 max-w-xl"><div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f0c477]"><span className="h-px w-8 bg-[#f0c477]" />{role === "Student" ? "Your service brief" : role === "Admin" ? "Campus command brief" : "Operational brief"}</div><h1 className="font-serif text-4xl leading-[1.05] tracking-tight sm:text-5xl">Bring the campus<br /><span className="text-[#f0c477]">back into rhythm.</span></h1><p className="mt-5 max-w-lg text-sm leading-6 text-[#c5d2d0]">{roleBrief}</p><div className="mt-7 flex flex-wrap gap-3"><button onClick={() => setShowNewRequest(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#e6a649] px-4 py-3 text-sm font-semibold text-[#102a35] transition hover:-translate-y-0.5 hover:bg-[#f0bb69] active:scale-[.98]"><Plus className="h-4 w-4" />Log a request</button><button onClick={() => setSection("Requests")} className="rounded-xl border border-white/20 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10">Review worklist <span className="ml-1">→</span></button></div></div><div className="absolute inset-y-0 right-0 hidden w-[52%] overflow-hidden opacity-80 lg:block" aria-hidden="true"><div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_35%,rgba(240,196,119,.28),transparent_28%),linear-gradient(135deg,rgba(240,196,119,.14),transparent_54%)]" /><div className="absolute right-[-8%] top-[12%] h-64 w-64 rounded-full border border-[#f0c477]/25" /><div className="absolute right-[8%] top-[28%] h-40 w-40 rounded-full border border-[#f0c477]/20" /><div className="absolute bottom-[-18%] right-[28%] h-72 w-72 rounded-full border border-[#f0c477]/15" /></div><div className="absolute -bottom-24 right-20 h-56 w-56 rounded-full border border-[#f0c477]/20" /><div className="absolute -bottom-16 right-32 h-40 w-40 rounded-full border border-[#f0c477]/20" /></section>
            <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[{ label: "Open requests", value: String((dashboardSummary?.pending ?? 18) + (dashboardSummary?.assigned ?? 6)), note: dashboardSummary ? "Live from Django API" : "Demo data · sign in to sync", icon: ClipboardList, tone: "text-[#aa6c18]" }, { label: "In progress", value: String(dashboardSummary?.in_progress ?? 11), note: dashboardSummary ? "Live from Django API" : "3 due today", icon: Zap, tone: "text-[#3d6da5]" }, { label: "Resolved this week", value: String(dashboardSummary?.resolved ?? 39), note: dashboardSummary ? "Live from Django API" : "+12% from last week", icon: Check, tone: "text-[#3c8055]" }, { label: "Live sensor signals", value: "03", note: "All devices reporting", icon: Activity, tone: "text-[#b24d36]" }].map(({ label, value, note, icon: Icon, tone }) => <div key={label} className="rounded-2xl border border-[#ded5c8] bg-[#fbf8f3] p-5 shadow-[0_8px_26px_rgba(36,51,55,.04)]"><div className="flex items-start justify-between"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8d9795]">{label}</div><Icon className={`h-4 w-4 ${tone}`} /></div><div className="mt-3 font-serif text-4xl text-[#173d48]">{value}</div><div className="mt-2 text-xs text-[#748184]">{note}</div></div>)}</section>
            <div className="mt-8 grid gap-7 xl:grid-cols-[1.6fr_1fr]"><section><div className="mb-4 flex items-end justify-between"><div><div className="signal-label">{role === "Student" ? "Track your service journey" : role === "Admin" ? "Accountability at a glance" : "Needs a human hand"}</div><h2 className="mt-1 font-serif text-2xl text-[#173d48]">{role === "Student" ? "My requests" : role === "Admin" ? "Campus request queue" : "Active requests"}</h2></div><button onClick={() => setSection("Requests")} className="text-xs font-semibold text-[#a16312] hover:underline">View all →</button></div><div className="overflow-hidden rounded-2xl border border-[#ded5c8] bg-[#fbf8f3]">{filteredRequests.slice(0, 3).map((request) => <button key={request.id} onClick={() => setSelectedRequest(request)} className="group flex w-full items-center gap-4 border-b border-[#e9e2d8] p-4 text-left transition last:border-0 hover:bg-[#fffdf9] sm:p-5"><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${request.source === "System" ? "bg-[#f8e8d2] text-[#ae6e1e]" : "bg-[#e7eff0] text-[#396477]"}`}>{request.source === "System" ? <Activity className="h-4 w-4" /> : <MessageSquareText className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold tracking-[.12em] text-[#9a7950]">{request.id}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityTone[request.priority]}`}>{request.priority}</span></div><div className="mt-1 truncate text-sm font-semibold text-[#24414b]">{request.title}</div><div className="mt-1 text-xs text-[#809091]">{request.location} · {request.updated}</div></div><span className={`hidden rounded-full px-2.5 py-1 text-[10px] font-semibold sm:block ${statusTone[request.status]}`}>{request.status}</span><ChevronDown className="h-4 w-4 -rotate-90 text-[#a7aaa4] transition group-hover:translate-x-1" /></button>)}</div></section>
              <section><div className="mb-4"><div className="signal-label">Automatic watch</div><h2 className="mt-1 font-serif text-2xl text-[#173d48]">System signals</h2></div><div className="space-y-3">{[{ icon: Wifi, label: "Network monitor", detail: "Campus gateway reachable", value: "18 ms", color: "text-[#3c8055]", bg: "bg-[#e7f0e8]" }, { icon: CloudRain, label: "Water leak sensor", detail: "Residence C · moisture normal", value: "12%", color: "text-[#3d6da5]", bg: "bg-[#e7eff5]" }, { icon: Flame, label: "Fire & smoke sensor", detail: "Server room · all clear", value: "24°C", color: "text-[#b66c28]", bg: "bg-[#f8eadb]" }].map(({ icon: Icon, label, detail, value, color, bg }) => <div key={label} className="flex items-center gap-4 rounded-2xl border border-[#ded5c8] bg-[#fbf8f3] p-4"><div className={`grid h-10 w-10 place-items-center rounded-xl ${bg} ${color}`}><Icon className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-[#24414b]">{label}</div><div className="truncate text-xs text-[#809091]">{detail}</div></div><div className={`text-sm font-semibold ${color}`}>{value}</div></div>)}</div><div className="mt-5 overflow-hidden rounded-2xl bg-[#e9e2d7] p-5"><div className="mb-4 flex h-28 w-full items-center justify-center overflow-hidden rounded-xl bg-[radial-gradient(circle_at_20%_30%,rgba(230,166,73,.55),transparent_3%),radial-gradient(circle_at_72%_68%,rgba(61,109,165,.5),transparent_3%),linear-gradient(135deg,#173d48,#315d66)]" role="img" aria-label="IoT sensor monitoring facilities"><div className="relative h-16 w-4/5"><span className="absolute left-[12%] top-[25%] h-3 w-3 rounded-full bg-[#f0c477] shadow-[0_0_0_6px_rgba(240,196,119,.14)]" /><span className="absolute left-[48%] top-[55%] h-3 w-3 rounded-full bg-[#b9d7df] shadow-[0_0_0_6px_rgba(185,215,223,.14)]" /><span className="absolute right-[12%] top-[12%] h-3 w-3 rounded-full bg-[#e6a649] shadow-[0_0_0_6px_rgba(230,166,73,.14)]" /><span className="absolute left-[16%] top-[31%] h-px w-[38%] rotate-[18deg] bg-white/40" /><span className="absolute left-[50%] top-[48%] h-px w-[32%] -rotate-[24deg] bg-white/40" /></div></div><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[#876a46]"><ShieldAlert className="h-3.5 w-3.5" /> Proactive monitoring</div><p className="mt-2 text-sm leading-5 text-[#4b5c5d]">When a threshold is crossed, CSRMS creates a request and puts it in the same worklist as every student report.</p></div></section></div>
          </>}

          {section === "Requests" && <RequestWorklist requests={filteredRequests} query={query} setQuery={setQuery} onSelect={setSelectedRequest} onCreate={() => setShowNewRequest(true)} role={role} />}
          {section === "Sensors" && <SensorsView />}
          {section === "People" && <PeopleView />}
        </div>
      </main>

      {showNewRequest && <NewRequestModal onClose={() => setShowNewRequest(false)} onSubmit={async (payload) => { try { const created = await csrmsApi.createRequest(payload); setLiveRequests((current) => [mapApiRequest(created), ...(current ?? requests)]); setShowNewRequest(false); toast("Request created and added to the CSRMS worklist."); } catch (error) { toast(error instanceof CsrmsApiError ? error.message : "Request could not be created."); } }} />}
      {selectedRequest && <RequestDetail request={selectedRequest} onClose={() => setSelectedRequest(null)} role={role} />}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onLogin={handleLogin} apiError={apiError} />}
      <div className="fixed bottom-4 right-4 z-40 lg:hidden"><button onClick={() => handlePlaceholder("Use the desktop navigation to switch workspace sections.")} className="grid h-12 w-12 place-items-center rounded-full bg-[#102a35] text-white shadow-xl"><Menu className="h-5 w-5" /></button></div>
    </div>
  );
}

function RequestWorklist({ requests, query, setQuery, onSelect, onCreate, role }: { requests: Request[]; query: string; setQuery: (s: string) => void; onSelect: (r: Request) => void; onCreate: () => void; role: Role }) {
  return <section><div className="flex flex-wrap items-end justify-between gap-4"><div><div className="signal-label">{role === "Student" ? "Personal request history" : role === "Admin" ? "Campus-wide request ledger" : "Request pipeline"}</div><h1 className="mt-2 font-serif text-4xl text-[#173d48]">{role === "Student" ? "My requests" : role === "Admin" ? "All requests" : "Team worklist"}</h1><p className="mt-2 max-w-xl text-sm text-[#718083]">{role === "Student" ? "Follow your reports from pending through resolution." : role === "Admin" ? "Review service performance across every campus queue." : "Assign, progress, and resolve the next issue that needs a human hand."}</p></div><button onClick={onCreate} className="inline-flex items-center gap-2 rounded-xl bg-[#102a35] px-4 py-3 text-sm font-semibold text-white hover:bg-[#1d4250]"><Plus className="h-4 w-4" /> Log a request</button></div><div className="mt-8 flex flex-wrap gap-3"><div className="relative min-w-[240px] flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-[#9ba3a0]" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, category or location" className="h-10 w-full rounded-xl border border-[#d9d0c2] bg-[#fbf8f3] pl-10 pr-3 text-sm outline-none focus:border-[#e6a649]" /></div>{["All statuses", "All priorities", "All categories"].map((filter) => <button key={filter} onClick={() => toast(`${filter} filter is ready for API connection.`)} className="rounded-xl border border-[#d9d0c2] bg-[#fbf8f3] px-3 text-xs font-medium text-[#587078]">{filter} <ChevronDown className="ml-2 inline h-3 w-3" /></button>)}</div><div className="mt-5 overflow-hidden rounded-2xl border border-[#ded5c8] bg-[#fbf8f3]"><div className="hidden grid-cols-[1.4fr_.8fr_.7fr_.7fr_24px] gap-4 border-b border-[#e9e2d8] px-5 py-3 text-[10px] font-semibold uppercase tracking-[.14em] text-[#929c9b] sm:grid"><span>Request</span><span>Source</span><span>Priority</span><span>Status</span><span /></div>{requests.map((r) => <button key={r.id} onClick={() => onSelect(r)} className="grid w-full gap-3 border-b border-[#e9e2d8] px-5 py-4 text-left transition last:border-0 hover:bg-[#fffdf9] sm:grid-cols-[1.4fr_.8fr_.7fr_.7fr_24px] sm:items-center sm:gap-4"><div><div className="text-[10px] font-semibold tracking-[.12em] text-[#9a7950]">{r.id}</div><div className="mt-1 text-sm font-semibold text-[#24414b]">{r.title}</div><div className="mt-1 text-xs text-[#809091]">{r.category} · {r.location}</div></div><div className="text-xs text-[#647b81]">{r.source === "System" ? "Automatic signal" : "Student report"}</div><div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${priorityTone[r.priority]}`}>{r.priority}</span></div><div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusTone[r.status]}`}>{r.status}</span></div><ChevronDown className="h-4 w-4 -rotate-90 text-[#a7aaa4]" /></button>)}</div></section>;
}

const telemetrySeries = {
  source: "deterministic-demo",
  networkThreshold: 50,
  waterThreshold: 30,
  fireSmokeThreshold: 25,
  fireTemperatureThreshold: 45,
  network: [{ time: "03:00", value: 21 }, { time: "04:00", value: 19 }, { time: "05:00", value: 24 }, { time: "06:00", value: 17 }, { time: "07:00", value: 20 }, { time: "08:00", value: 22 }, { time: "09:00", value: 18 }, { time: "10:00", value: 24 }, { time: "11:00", value: 16 }, { time: "12:00", value: 19 }, { time: "13:00", value: 18 }, { time: "14:00", value: 18 }],
  water: [{ time: "03:00", value: 8 }, { time: "04:00", value: 9 }, { time: "05:00", value: 10 }, { time: "06:00", value: 11 }, { time: "07:00", value: 9 }, { time: "08:00", value: 9 }, { time: "09:00", value: 11 }, { time: "10:00", value: 12 }, { time: "11:00", value: 10 }, { time: "12:00", value: 13 }, { time: "13:00", value: 12 }, { time: "14:00", value: 12 }],
  fire: [{ time: "03:00", smoke: 7, temperature: 21 }, { time: "04:00", smoke: 8, temperature: 22 }, { time: "05:00", smoke: 9, temperature: 22 }, { time: "06:00", smoke: 8, temperature: 23 }, { time: "07:00", smoke: 10, temperature: 23 }, { time: "08:00", smoke: 8, temperature: 22 }, { time: "09:00", smoke: 10, temperature: 23 }, { time: "10:00", smoke: 9, temperature: 23 }, { time: "11:00", smoke: 12, temperature: 24 }, { time: "12:00", smoke: 11, temperature: 24 }, { time: "13:00", smoke: 9, temperature: 24 }, { time: "14:00", smoke: 8, temperature: 24 }],
};
const chartTooltip = { contentStyle: { background: "#102a35", border: "0", borderRadius: 10, color: "#fffaf2", fontSize: 12 }, itemStyle: { color: "#f0c477" }, labelStyle: { color: "#c5d2d0" } };

function telemetryLabel(point: CsrmsTelemetryPoint, index: number) {
  const raw = point.time || point.timestamp || point.recorded_at;
  if (!raw) return `Reading ${index + 1}`;
  const date = new Date(raw);
  return Number.isNaN(date.valueOf()) ? raw : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function normalizeTelemetry(payload: CsrmsTelemetryResponse) {
  const results = payload.results ?? [];
  const grouped = results.reduce<Record<string, CsrmsTelemetryPoint[]>>((acc, point) => { const key = (point.sensor_type || "").toLowerCase(); const group = key.includes("water") || key.includes("moisture") ? "water" : key.includes("fire") || key.includes("smoke") ? "fire" : "network"; (acc[group] ||= []).push(point); return acc; }, {});
  const network = (payload.network ?? grouped.network ?? []).map((point, index) => ({ time: telemetryLabel(point, index), value: Number(point.value ?? point.latency_ms ?? point.latency ?? 0) }));
  const water = (payload.water ?? grouped.water ?? []).map((point, index) => ({ time: telemetryLabel(point, index), value: Number(point.value ?? point.moisture_percent ?? point.moisture ?? 0) }));
  const fire = (payload.fire ?? grouped.fire ?? []).map((point, index) => ({ time: telemetryLabel(point, index), smoke: Number(point.smoke ?? point.smoke_level ?? point.value ?? 0), temperature: Number(point.temperature ?? point.temperature_c ?? 0) }));
  return { ...telemetrySeries, network: network.length ? network : telemetrySeries.network, water: water.length ? water : telemetrySeries.water, fire: fire.length ? fire : telemetrySeries.fire };
}

function SensorChart({ title, subtitle, data, color, unit, threshold }: { title: string; subtitle: string; data: Array<Record<string, string | number>>; color: string; unit: string; threshold: number }) {
  return <div className="rounded-2xl border border-[#ded5c8] bg-[#fbf8f3] p-5"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-[#24414b]">{title}</div><div className="mt-1 text-xs text-[#809091]">{subtitle}</div></div><span className="rounded-full bg-[#e7f0e8] px-2.5 py-1 text-[10px] font-semibold text-[#39704c]">Live</span></div><div className="mt-4 h-[190px] w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 8, right: 6, left: -24, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e8e2d9" strokeDasharray="3 3" /><ReferenceLine y={threshold} stroke="#b66c28" strokeDasharray="4 4" label={{ value: "alert threshold", fill: "#b66c28", fontSize: 9, position: "insideTopRight" }} /><XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fill: "#98a19e", fontSize: 10 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: "#98a19e", fontSize: 10 }} width={34} /><Tooltip {...chartTooltip} formatter={(value) => [String(value) + " " + unit, title]} /><Area type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} fill={color} fillOpacity={0.12} dot={{ r: 2.5, fill: color, strokeWidth: 0 }} activeDot={{ r: 5, fill: color, stroke: "#fbf8f3", strokeWidth: 2 }} /></AreaChart></ResponsiveContainer></div><div className="mt-2 flex items-center justify-between border-t border-[#eee7dc] pt-3 text-[10px] uppercase tracking-[.12em] text-[#9aa4a3]"><span>Last 7 hours</span><span className="font-semibold" style={{ color }}>{data[data.length - 1]?.value} {unit} now</span></div></div>;
}

function FireChart({ data }: { data: Array<{ time: string; smoke: number; temperature: number }> }) {
  return <div className="rounded-2xl border border-[#ded5c8] bg-[#fbf8f3] p-5"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-[#24414b]">Fire & smoke sensor</div><div className="mt-1 text-xs text-[#809091]">Smoke concentration and temperature</div></div><span className="rounded-full bg-[#f8eadb] px-2.5 py-1 text-[10px] font-semibold text-[#a45b29]">All clear</span></div><div className="mt-4 h-[190px] w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 8, right: 6, left: -24, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e8e2d9" strokeDasharray="3 3" /><ReferenceLine yAxisId="left" y={telemetrySeries.fireSmokeThreshold} stroke="#b24d36" strokeDasharray="4 4" label={{ value: "smoke threshold", fill: "#b24d36", fontSize: 9, position: "insideTopRight" }} /><ReferenceLine yAxisId="right" y={telemetrySeries.fireTemperatureThreshold} stroke="#e6a649" strokeDasharray="4 4" /><XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fill: "#98a19e", fontSize: 10 }} /><YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fill: "#98a19e", fontSize: 10 }} width={34} /><YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={{ fill: "#98a19e", fontSize: 10 }} width={30} /><Tooltip {...chartTooltip} /><Line yAxisId="left" type="monotone" dataKey="smoke" name="Smoke" stroke="#b24d36" strokeWidth={2.5} dot={{ r: 2.5, fill: "#b24d36", strokeWidth: 0 }} activeDot={{ r: 5, fill: "#b24d36", stroke: "#fbf8f3", strokeWidth: 2 }} /><Line yAxisId="right" type="monotone" dataKey="temperature" name="Temperature" stroke="#e6a649" strokeWidth={2.5} dot={{ r: 2.5, fill: "#e6a649", strokeWidth: 0 }} activeDot={{ r: 5, fill: "#e6a649", stroke: "#fbf8f3", strokeWidth: 2 }} /></LineChart></ResponsiveContainer></div><div className="mt-2 flex items-center justify-between border-t border-[#eee7dc] pt-3 text-[10px] uppercase tracking-[.12em] text-[#9aa4a3]"><span>Smoke / temperature</span><span className="font-semibold text-[#a45b29]">8% / 24°C now</span></div></div>;
}

function SensorsView() {
  const [range, setRange] = useState("Live");
  const [series, setSeries] = useState(telemetrySeries);
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tokenStore.access) return;
    let mounted = true;
    setLoading(true);
    csrmsApi.telemetryHistory(range)
      .then((payload) => { if (mounted) { setSeries(normalizeTelemetry(payload)); setMode("live"); setError(""); } })
      .catch((reason: unknown) => { if (mounted) { setMode("demo"); setError(reason instanceof CsrmsApiError ? "Live telemetry history is unavailable; showing demo readings." : "Live telemetry could not be loaded; showing demo readings."); } })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [range]);

  const latestNetwork = series.network[series.network.length - 1]?.value ?? 0;
  const latestWater = series.water[series.water.length - 1]?.value ?? 0;
  const latestFire = series.fire[series.fire.length - 1];
  return <section><div className="rounded-2xl border border-[#ded5c8] bg-[#173d48] p-5 text-white"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[#f0c477]"><span className="h-px w-7 bg-[#f0c477]" />{mode === "live" ? "Live telemetry" : "Telemetry demo"}</div><div className="mt-2 text-sm text-[#c5d2d0]">{loading ? "Connecting to the Django telemetry history endpoint…" : mode === "live" ? "Authenticated readings are flowing from the Django service." : "Deterministic readings keep the monitoring story visible while the backend is offline."}</div></div><div className="flex items-center gap-3 text-xs font-semibold text-[#b8d6bd]"><span className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[.12em] ${mode === "live" ? "bg-[#b8d6bd] text-[#173d48]" : "bg-[#e6a649] text-[#102a35]"}`}>{mode === "live" ? "Live API" : "Demo data"}</span><span className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${loading ? "animate-pulse bg-[#e6a649]" : "bg-[#73b47f]"}`} />{loading ? "Connecting" : "3/3 online"}</span></div></div></div>{error && <div className="mt-4 rounded-xl border border-[#e9c9bb] bg-[#fce7df] px-4 py-3 text-xs text-[#a5452d]">{error}</div>}<div className="mt-7 flex flex-wrap items-end justify-between gap-4"><div><div className="signal-label">Telemetry service · monitored signals</div><h1 className="mt-2 font-serif text-4xl text-[#173d48]">Sensor activity</h1><p className="mt-2 max-w-xl text-sm text-[#718083]">Explore readings over time and spot the small changes that precede a service request.</p></div><div className="flex rounded-xl border border-[#d9d0c2] bg-[#fbf8f3] p-1">{["Live", "24 hours", "7 days"].map((option) => <button key={option} onClick={() => setRange(option)} className={range === option ? "rounded-lg bg-[#102a35] px-3 py-2 text-xs font-semibold text-white" : "rounded-lg px-3 py-2 text-xs font-semibold text-[#718083] hover:bg-[#eee7dc]"}>{option}</button>)}</div></div><div className="mt-7 grid gap-5 xl:grid-cols-2"><SensorChart title="Network monitor" subtitle="Campus gateway latency" data={series.network} color="#3d6da5" unit="ms" threshold={series.networkThreshold} /><SensorChart title="Water leak sensor" subtitle="Moisture near Residence C geyser" data={series.water} color="#3c8055" unit="%" threshold={series.waterThreshold} /><div className="xl:col-span-2"><FireChart data={series.fire} /></div></div><div className="mt-6 grid gap-4 md:grid-cols-3">{[{ name: "Network monitor", icon: Network, value: `${latestNetwork} ms`, state: latestNetwork > series.networkThreshold ? "Attention" : "Reachable", detail: mode === "live" ? "Latest API reading" : "Demo reading · 2 min interval", color: "#3c8055" }, { name: "Water leak sensor", icon: CloudRain, value: `${latestWater}%`, state: latestWater > series.waterThreshold ? "Attention" : "Normal", detail: mode === "live" ? "Latest API reading" : "Residence C · demo reading", color: "#3d6da5" }, { name: "Fire & smoke sensor", icon: Flame, value: `${latestFire?.temperature ?? 0}°C`, state: (latestFire?.smoke ?? 0) > series.fireSmokeThreshold ? "Attention" : "All clear", detail: mode === "live" ? `Smoke ${latestFire?.smoke ?? 0}% · Latest API reading` : `Smoke ${latestFire?.smoke ?? 0}% · Server room demo`, color: "#b66c28" }].map(({ name, icon: Icon, value, state, detail, color }) => <div key={name} className="rounded-2xl border border-[#ded5c8] bg-[#fbf8f3] p-5"><div className="flex items-center justify-between"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#e9e2d7]" style={{ color }}><Icon className="h-4 w-4" /></div><span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color }}><span className="h-2 w-2 animate-pulse rounded-full" style={{ backgroundColor: color }} />{state}</span></div><div className="mt-5 text-sm font-semibold text-[#24414b]">{name}</div><div className="mt-1 font-serif text-3xl text-[#173d48]">{value}</div><div className="mt-2 text-xs text-[#809091]">{detail}</div></div>)}</div></section>;
}

function PeopleView() { return <section><div className="signal-label">Admin workspace</div><h1 className="mt-2 font-serif text-4xl text-[#173d48]">People & categories</h1><p className="mt-2 text-sm text-[#718083]">Manage the roles and service vocabulary that keep CSRMS accountable.</p><div className="mt-6 flex flex-wrap gap-3"><button onClick={() => toast("Add-user form is ready for the Django admin endpoint.")} className="rounded-xl bg-[#102a35] px-4 py-3 text-sm font-semibold text-white hover:bg-[#1d4250]"><Plus className="mr-2 inline h-4 w-4" />Add staff account</button><button onClick={() => toast("Category creation is ready for the categories endpoint.")} className="rounded-xl border border-[#d9d0c2] bg-[#fbf8f3] px-4 py-3 text-sm font-semibold text-[#587078] hover:bg-white">Manage categories</button></div><div className="mt-8 grid gap-4 md:grid-cols-3">{[{ role: "Students", count: "1,284", detail: "Can report and track own requests", icon: BookOpen }, { role: "Staff", count: "42", detail: "Can assign, update, and resolve", icon: UserRound }, { role: "Admins", count: "6", detail: "Can manage users and categories", icon: ShieldAlert }].map(({ role, count, detail, icon: Icon }) => <div key={role} className="rounded-2xl border border-[#ded5c8] bg-[#fbf8f3] p-6"><Icon className="h-5 w-5 text-[#a16312]" /><div className="mt-8 font-serif text-4xl text-[#173d48]">{count}</div><div className="mt-1 text-sm font-semibold text-[#24414b]">{role}</div><div className="mt-2 text-xs leading-5 text-[#809091]">{detail}</div></div>)}</div></section> }

function AuthModal({ onClose, onLogin, apiError }: { onClose: () => void; onLogin: (username: string, password: string) => Promise<void>; apiError: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); try { await onLogin(username, password); } finally { setBusy(false); } };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#102a35]/60 p-4 backdrop-blur-sm"><form onSubmit={submit} className="w-full max-w-md rounded-[24px] bg-[#fbf8f3] p-7 shadow-2xl sm:p-9"><div className="flex items-start justify-between"><div><div className="signal-label">JWT access</div><h2 className="mt-2 font-serif text-3xl text-[#173d48]">Sign in to CSRMS</h2><p className="mt-2 text-sm text-[#718083]">Use your Django account to load live requests and campus signals.</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-[#748184] hover:bg-[#eee7dc]"><X className="h-5 w-5" /></button></div><div className="mt-7 space-y-4"><label className="block text-xs font-semibold text-[#52696f]">Username<input required value={username} onChange={(event) => setUsername(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#d9d0c2] bg-white px-3 text-sm outline-none focus:border-[#e6a649]" autoComplete="username" /></label><label className="block text-xs font-semibold text-[#52696f]">Password<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#d9d0c2] bg-white px-3 text-sm outline-none focus:border-[#e6a649]" autoComplete="current-password" /></label></div>{apiError && <div className="mt-4 rounded-xl bg-[#fce7df] px-3 py-2 text-xs text-[#a5452d]">{apiError}</div>}<div className="mt-7 flex items-center justify-between gap-3"><div className="text-[11px] leading-4 text-[#9aa4a3]">API: {csrmsApi.baseUrl}</div><button disabled={busy} type="submit" className="rounded-xl bg-[#e6a649] px-4 py-3 text-sm font-semibold text-[#102a35] disabled:opacity-60">{busy ? "Signing in…" : "Sign in"}</button></div></form></div>;
}

function NewRequestModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (payload: Record<string, unknown>) => Promise<void> }) { const [title, setTitle] = useState(""); const [category, setCategory] = useState("IT Support"); const [priority, setPriority] = useState("MEDIUM"); const [location, setLocation] = useState(""); const [description, setDescription] = useState(""); return <div className="fixed inset-0 z-50 grid place-items-center bg-[#102a35]/55 p-4 backdrop-blur-sm"><div className="w-full max-w-lg rounded-[24px] bg-[#fbf8f3] p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between"><div><div className="signal-label">Manual report</div><h2 className="mt-2 font-serif text-3xl text-[#173d48]">Log a request</h2></div><button onClick={onClose} className="rounded-lg p-2 text-[#748184] hover:bg-[#eee7dc]"><X className="h-5 w-5" /></button></div><div className="mt-6 space-y-4"><label className="block text-xs font-semibold text-[#52696f]">Title<input value={title} onChange={(event) => setTitle(event.target.value)} required className="mt-2 h-11 w-full rounded-xl border border-[#d9d0c2] bg-white px-3 text-sm outline-none focus:border-[#e6a649]" placeholder="What needs attention?" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-semibold text-[#52696f]">Category<select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#d9d0c2] bg-white px-3 text-sm"><option>IT Support</option><option>Facilities</option><option>Safety</option><option>Equipment</option></select></label><label className="block text-xs font-semibold text-[#52696f]">Priority<select value={priority} onChange={(event) => setPriority(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#d9d0c2] bg-white px-3 text-sm"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select></label></div><label className="block text-xs font-semibold text-[#52696f]">Location<input value={location} onChange={(event) => setLocation(event.target.value)} required className="mt-2 h-11 w-full rounded-xl border border-[#d9d0c2] bg-white px-3 text-sm outline-none focus:border-[#e6a649]" placeholder="Building, room or residence" /></label><label className="block text-xs font-semibold text-[#52696f]">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} required className="mt-2 min-h-24 w-full rounded-xl border border-[#d9d0c2] bg-white px-3 py-3 text-sm outline-none focus:border-[#e6a649]" placeholder="Add enough detail for the right person to act." /></label></div><div className="mt-7 flex justify-end gap-3"><button onClick={onClose} className="rounded-xl px-4 py-3 text-sm font-semibold text-[#607176] hover:bg-[#eee7dc]">Cancel</button><button onClick={() => onSubmit({ title, category, priority, location, description })} className="rounded-xl bg-[#e6a649] px-4 py-3 text-sm font-semibold text-[#102a35] hover:bg-[#f0bb69]">Submit request</button></div></div></div> }
function RequestDetail({ request, onClose, role }: { request: Request; onClose: () => void; role: Role }) { return <div className="fixed inset-0 z-50 flex justify-end bg-[#102a35]/40 backdrop-blur-sm"><div className="h-full w-full max-w-xl overflow-y-auto bg-[#fbf8f3] p-6 shadow-2xl sm:p-9"><div className="flex items-center justify-between"><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#9a7950]">Request detail · {request.id}</div><button onClick={onClose} className="rounded-lg p-2 text-[#748184] hover:bg-[#eee7dc]"><X className="h-5 w-5" /></button></div><div className="mt-8"><div className="flex flex-wrap gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${priorityTone[request.priority]}`}>{request.priority} priority</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusTone[request.status]}`}>{request.status}</span></div><h2 className="mt-4 font-serif text-4xl leading-tight text-[#173d48]">{request.title}</h2><p className="mt-3 text-sm text-[#718083]">{request.category} · {request.location}</p></div><div className="mt-9 rounded-2xl bg-[#e9e2d7] p-5"><div className="signal-label">Workflow history</div><div className="mt-5 space-y-5">{[{ label: "Request created", detail: `${request.source} report · Today, 09:12`, done: true }, { label: "Assigned to Facilities team", detail: "Today, 09:26", done: true }, { label: "Work in progress", detail: "Today, 09:34", done: request.status !== "Pending" }, { label: "Resolved", detail: "Waiting for completion", done: request.status === "Resolved" }].map((step, i) => <div key={step.label} className="flex gap-3"><div className="flex flex-col items-center"><div className={`grid h-6 w-6 place-items-center rounded-full ${step.done ? "bg-[#3c8055] text-white" : "border border-[#bfc7c2] text-[#95a09e]"}`}>{step.done ? <Check className="h-3.5 w-3.5" /> : <span className="text-[10px]">{i + 1}</span>}</div>{i < 3 && <div className={`mt-1 h-7 w-px ${step.done ? "bg-[#88ae91]" : "bg-[#c8cec8]"}`} />}</div><div><div className="text-sm font-semibold text-[#24414b]">{step.label}</div><div className="mt-1 text-xs text-[#809091]">{step.detail}</div></div></div>)}</div></div><button onClick={async () => { if (role === "Student") { toast("Demo note added: the service team has been notified."); return; } if (!request.apiId) { toast("Sign in to update this demo request."); return; } try { await csrmsApi.updateStatus(request.apiId, "IN_PROGRESS", role === "Admin" ? "Admin advanced the request for demonstration." : "Staff member started work."); toast("Request status updated through the Django API."); } catch (error) { toast(error instanceof CsrmsApiError ? error.message : "Status update failed."); } }} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#102a35] py-3 text-sm font-semibold text-white hover:bg-[#1d4250]"><Zap className="h-4 w-4 text-[#e6a649]" />{role === "Student" ? "Add a follow-up note" : role === "Admin" ? "Advance request status" : "Start work"}</button></div></div> }
