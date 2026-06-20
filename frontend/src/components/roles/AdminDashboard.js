import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { getGrievances, updateGrievance, getUsersByRole, getVoters, initiateCampaignBlast } from '../../api';
import {
    Users,
    ChevronRight,
    MapPin,
    Activity,
    CheckCircle,
    Clock,
    TrendingUp,
    AlertCircle,
    LayoutDashboard,
    X,
    Shield,
    RefreshCw,
    User,
    Zap,
    Info,
    Send,
    MessageSquare,
    Globe,
    Sparkles,
    Film,
    Image as ImageIcon,
    ShieldCheck
} from 'lucide-react';
import { translations, languages } from '../../translations';

const STATUS_CONFIG = {
    submitted: { label: 'Open', icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    assigned: { label: 'Assigned', icon: Clock, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    in_progress: { label: 'Working', icon: Activity, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' },
    resolved: { label: 'Resolved', icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    verified: { label: 'Verified', icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-600/10', border: 'border-emerald-600/20' },
};

const MetricCard = ({ label, value, icon: Icon, color, trend, delay }) => (
    <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay }}
        className="bg-card p-5 rounded-[2rem] border border-border relative overflow-hidden group hover:border-emerald-500/30 transition-all"
    >
        <div className="absolute top-0 right-0 p-4 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity">
            <Icon size={80} />
        </div>
        <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
                <div className="size-8 rounded-xl flex items-center justify-center bg-muted text-muted-foreground group-hover:text-emerald-400 transition-colors border border-border">
                    <Icon size={14} />
                </div>
                <p className="text-[9px] font-black uppercase tracking-[2px] text-muted-foreground/50">{label}</p>
            </div>
            <div className="flex items-end justify-between">
                <h3 className="text-3xl font-black text-foreground tracking-tighter leading-none">{value}</h3>
                {trend && (
                    <div className="flex items-center gap-1.5 text-[8px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase tracking-widest">
                        <TrendingUp size={8} strokeWidth={3} /> {trend}
                    </div>
                )}
            </div>
        </div>
    </motion.div>
);

export default function AdminDashboard({ currentUser, boothId }) {
    const location = useLocation();
    const navigate = useNavigate();

    const getTabFromPath = (path) => {
        if (path.includes('/voters')) return 'voters';
        if (path.includes('/campaigns')) return 'campaigns';
        return 'dashboard';
    };

    const [currentLanguage, setCurrentLanguage] = useState('en');
    const t = (key) => translations[currentLanguage]?.[key] || key;

    const [grievances, setGrievances] = useState([]);
    const [workers, setWorkers] = useState([]);
    const [voters, setVoters] = useState([]);
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState(getTabFromPath(location.pathname));
    const [assignModal, setAssignModal] = useState(null);
    const [selectedWorker, setSelectedWorker] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [filter, setFilter] = useState('all');
    const [expandedId, setExpandedId] = useState(null);

    const safeBoothId = boothId || 17;

    useEffect(() => {
        setTab(getTabFromPath(location.pathname));
    }, [location.pathname]);

    const handleTabChange = (newTab) => {
        setTab(newTab);
        if (newTab === 'dashboard') navigate('/admin');
        else navigate(`/admin/${newTab}`);
    };

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const results = await Promise.allSettled([
                getGrievances({ booth_id: safeBoothId }), // Fetch grievances for this booth
                getUsersByRole('worker'),
                getVoters(safeBoothId) // Keep booth-specific for voter context
            ]);
            
            const [gRes, wRes, vRes] = results;
            
            setGrievances(gRes.status === 'fulfilled' ? gRes.value || [] : []);
            setWorkers(wRes.status === 'fulfilled' ? wRes.value || [] : []);
            setVoters(vRes.status === 'fulfilled' ? vRes.value || [] : []);
            
            if (results.some(r => r.status === 'rejected')) {
                console.error("Admin sync partial failure:", results.filter(r => r.status === 'rejected'));
            }
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [safeBoothId]);

    useEffect(() => {
        loadData();

        const wsUrl = (process.env.REACT_APP_BACKEND_URL || 'https://booth-iq-api.onrender.com').replace(/^http/, 'ws');
        const socket = new WebSocket(`${wsUrl}/ws/notifications/${currentUser.id}`);

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'new_grievance') {
                // Optimistically add the new grievance to the top of the list
                setGrievances(prev => [data.grievance, ...prev]);
            }
        };

        socket.onopen = () => console.log("Admin WebSocket Connected");
        socket.onclose = () => console.log("Admin WebSocket Disconnected");

        return () => {
            socket.close();
        };
    }, [loadData, currentUser.id]);

    const handleAssign = async () => {
        if (!assignModal || !selectedWorker) return;
        setSubmitting(true);
        try {
            const worker = workers.find(w => w.id.toString() === selectedWorker.toString());
            await updateGrievance({
                id: String(assignModal.id),
                status: 'assigned',
                assigned_to: String(selectedWorker),
                assigned_worker: worker?.name || 'Assigned Personnel'
            });
            setAssignModal(null);
            setSelectedWorker('');
            loadData();
        } catch (e) { console.error(e); }
        setSubmitting(false);
    };

    const handleVerify = async (grievanceId) => {
        setSubmitting(true);
        try {
            await updateGrievance({
                id: String(grievanceId),
                status: 'verified'
            });
            loadData();
        } catch (e) { console.error(e); }
        setSubmitting(false);
    };

    const filtered = grievances.filter(g => {
        if (filter === 'all') return true;
        if (filter === 'open') return g.status === 'submitted';
        return g.status === filter;
    });

    const handleCampaignBlast = async () => {
        if (!window.confirm("Initiate AI-segmented campaign blast to regional voter segments?")) return;
        setSubmitting(true);
        try {
            const result = await initiateCampaignBlast({ 
                booth_id: safeBoothId,
                segment: 'all'
            });
            alert(result.message || "Campaign blast initiated successfully!");
        } catch (e) {
            console.error(e);
            alert("Campaign initiation failed.");
        }
        setSubmitting(false);
    };

    return (
        <div className="space-y-6 animate-fade-in relative z-10">
            {/* Header / Sub-nav - Compact */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 md:gap-4 pb-3 md:pb-4 border-b border-border">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 md:gap-4 mb-3 md:mb-4 overflow-x-auto no-scrollbar pb-1">
                        <button 
                            onClick={() => handleTabChange('dashboard')}
                            className={`px-3 py-1 md:px-4 md:py-1.5 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-[2px] md:tracking-[3px] flex items-center gap-2 transition-all whitespace-nowrap ${
                                tab === 'dashboard' ? 'bg-emerald-500 text-black shadow-2xl' : 'bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <Shield size={12} strokeWidth={3} /> Admin Dashboard
                        </button>
                        <button 
                            onClick={() => handleTabChange('voters')}
                            className={`px-3 py-1 md:px-4 md:py-1.5 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-[2px] md:tracking-[3px] flex items-center gap-2 transition-all whitespace-nowrap ${
                                tab === 'voters' ? 'bg-emerald-500 text-black shadow-2xl' : 'bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <Users size={12} strokeWidth={3} /> Voter List
                        </button>
                        <button 
                            onClick={() => handleTabChange('campaigns')}
                            className={`px-3 py-1 md:px-4 md:py-1.5 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-[2px] md:tracking-[3px] flex items-center gap-2 transition-all whitespace-nowrap ${
                                tab === 'campaigns' ? 'bg-orange-500 text-black shadow-2xl' : 'bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <Zap size={12} strokeWidth={3} /> Campaigns
                        </button>
                    </div>
                    <h1 className="text-2xl md:text-4xl font-black text-foreground tracking-tighter uppercase leading-none">
                        {tab === 'voters' ? 'Voter Database' : tab === 'campaigns' ? 'Outreach Hub' : 'Admin Overview'}
                    </h1>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative group mr-2">
                        <select
                            value={currentLanguage}
                            onChange={(e) => setCurrentLanguage(e.target.value)}
                            className="appearance-none bg-muted/50 border border-border text-[9px] font-black text-foreground rounded-full pl-4 pr-10 py-2 outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-sm cursor-pointer hover:border-emerald-500/50 transition-all uppercase tracking-widest"
                        >
                            {languages.map((lang) => (
                                <option key={lang.code} value={lang.code} className="bg-background text-foreground font-sans">
                                    {lang.native}
                                </option>
                            ))}
                        </select>
                        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                            <Globe size={10} />
                        </div>
                    </div>
                    <button onClick={loadData} className="px-8 py-4 rounded-2xl bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-all flex items-center gap-3 border border-border group">
                        <RefreshCw size={18} className={`${loading ? 'animate-spin' : ''} group-hover:rotate-180 transition-transform duration-500`} />
                        <span className="text-[10px] font-black uppercase tracking-[4px]">Refresh</span>
                    </button>
                </div>
            </div>

            {tab === 'dashboard' ? (
                <>
                    {/* Metric Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <MetricCard 
                            label={t ? t('openIssues') : "Open Complaints"} 
                            value={grievances.filter(g => g.status === 'submitted').length} 
                            icon={AlertCircle} 
                            color="#f59e0b"
                            trend="+2 new"
                            delay={0.1}
                        />
                        <MetricCard 
                            label={t ? t('pendingVerification') : "Pending Review"} 
                            value={grievances.filter(g => g.status === 'resolved').length} 
                            icon={Activity} 
                            color="#c9a84c"
                            delay={0.2}
                        />
                        <MetricCard 
                            label={t ? t('verifiedBySupervisor') : "Verified"} 
                            value={grievances.filter(g => g.status === 'verified').length} 
                            icon={ShieldCheck} 
                            color="#10b981"
                            delay={0.3}
                        />
                        <MetricCard 
                            label="Workers Online" 
                            value={workers.length} 
                            icon={Users} 
                            color="#3b82f6"
                            delay={0.4}
                        />
                    </div>

                    {/* Tactical Control Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2">
                        <div className="flex flex-wrap items-center gap-2 p-1.5 bg-muted/30 rounded-2xl border border-border w-fit">
                            {['all', 'open', 'assigned', 'resolved'].map(f => (
                                <button 
                                    key={f} 
                                    onClick={() => setFilter(f)}
                                    className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-[2px] transition-all ${
                                        filter === f 
                                            ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' 
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {f === 'open' ? 'Recent' : f}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="px-6 py-3 rounded-full bg-emerald-500/5 border border-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-[4px] flex items-center gap-3">
                                <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                                Live Sync
                            </div>
                        </div>
                    </div>

                    {/* Data Feed - Compact */}
                    <div className="max-h-[800px] overflow-y-auto pr-2 custom-scrollbar space-y-3">
                        {loading ? (
                            <div className="p-32 text-center bg-card rounded-[4rem] border border-border border-dashed">
                                <RefreshCw className="w-16 h-16 text-emerald-500/20 animate-spin mx-auto mb-8" />
                                <p className="text-[11px] font-black uppercase tracking-[5px] text-muted-foreground/30">Loading data...</p>
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="p-24 text-center bg-card rounded-[4rem] border border-border">
                                <div className="size-24 rounded-[2.5rem] bg-muted/50 flex items-center justify-center mx-auto mb-10 border border-border">
                                    <LayoutDashboard className="text-muted-foreground/30" size={48} />
                                </div>
                                <h4 className="text-4xl font-black text-foreground mb-4 uppercase tracking-tighter">All Clear</h4>
                                <p className="text-muted-foreground text-sm font-bold uppercase tracking-widest max-w-sm mx-auto">No issues reported in this booth. Status: Normal.</p>
                            </div>
                        ) : (
                            filtered.map((g, idx) => {
                                const config = STATUS_CONFIG[g.status] || STATUS_CONFIG.submitted;
                                const isAwaiting = g.status === 'submitted';
                                const isExpanded = expandedId === g.id;

                                return (
                                    <motion.div 
                                        key={g.id} 
                                        initial={{ opacity: 0, y: 20 }} 
                                        animate={{ opacity: 1, y: 0 }} 
                                        transition={{ delay: idx * 0.05 }}
                                        className={`bg-card p-4 rounded-[2rem] border border-border group hover:border-primary/30 transition-all cursor-pointer ${isExpanded ? 'ring-2 ring-primary/20' : ''}`}
                                        onClick={() => setExpandedId(isExpanded ? null : g.id)}
                                    >
                                        <div className="flex items-center gap-4 relative overflow-hidden">
                                            <div className={`size-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${config.bg} ${config.color} border border-border/50`}>
                                                <config.icon size={20} strokeWidth={2.5} />
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2 mb-3">
                                                    <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground/60 text-[8px] font-black uppercase tracking-[2px] border border-border">
                                                        ID: #{g.id}
                                                    </span>
                                                    <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-[2px] border ${config.bg} ${config.color} ${config.border}`}>
                                                        {config.label}
                                                    </span>
                                                </div>
                                                <h4 className="text-xl font-black text-foreground mb-3 uppercase tracking-tighter leading-tight group-hover:text-primary transition-colors truncate">
                                                    {g.description}
                                                </h4>
                                                <div className="flex flex-wrap items-center gap-4 text-[9px] font-black text-muted-foreground/40 uppercase tracking-[2px]">
                                                    <span className="flex items-center gap-2"><User size={12} className="text-muted-foreground/40" /> {g.voter_name}</span>
                                                    <span className="flex items-center gap-2"><MapPin size={12} className="text-muted-foreground/40" /> Booth {g.booth_id}</span>
                                                    {g.assigned_worker && (
                                                        <span className="flex items-center gap-2 text-primary bg-primary/10 px-3 py-1 rounded-lg border border-primary/20">
                                                            <Zap size={10} strokeWidth={3} /> {g.assigned_worker}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="shrink-0" onClick={e => e.stopPropagation()}>
                                                {isAwaiting ? (
                                                    <button 
                                                        onClick={() => setAssignModal(g)}
                                                        className="px-6 py-3 bg-foreground text-background rounded-xl font-black uppercase tracking-[2px] text-[9px] hover:bg-primary hover:text-primary-foreground transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                                                    >
                                                        <Shield size={14} strokeWidth={3} /> Assign
                                                    </button>
                                                ) : (
                                                    <div className="px-6 py-3 bg-muted border border-border text-muted-foreground/40 rounded-xl font-black uppercase tracking-[2px] text-[9px] flex items-center justify-center gap-2">
                                                        <CheckCircle size={14} /> Assigned
                                                    </div>
                                                )}
                                            </div>
                                            <div className="ml-4">
                                                <ChevronRight size={24} className={`text-stone-700 transition-all ${isExpanded ? 'rotate-90 text-emerald-500' : ''}`} />
                                            </div>
                                        </div>

                                        <AnimatePresence>
                                            {isExpanded && (
                                                <motion.div 
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="pt-4 mt-4 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-4">
                                                        <div className="p-3 bg-muted/30 rounded-xl border border-border">
                                                            <p className="text-[8px] font-black text-muted-foreground/30 uppercase tracking-[2px] mb-1">Assigned to</p>
                                                            <p className="text-sm font-black text-foreground uppercase tracking-tighter flex items-center gap-2">
                                                                <User size={14} className="text-primary" /> 
                                                                {g.assigned_worker || (g.status !== 'submitted' ? 'Assigned Personnel' : 'Not Assigned')}
                                                            </p>
                                                        </div>
                                                        <div className="p-3 bg-muted/30 rounded-xl border border-border">
                                                            <p className="text-[8px] font-black text-muted-foreground/30 uppercase tracking-[2px] mb-1">Reported at</p>
                                                            <p className="text-sm font-black text-foreground uppercase tracking-tighter flex items-center gap-2">
                                                                <Clock size={14} className="text-primary" /> {new Date(g.created_at).toLocaleDateString()} at {new Date(g.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </p>
                                                        </div>
                                                        <div className="p-3 bg-muted/30 rounded-xl border border-border">
                                                            <p className="text-[8px] font-black text-muted-foreground/30 uppercase tracking-[2px] mb-1">Status</p>
                                                            <p className="text-sm font-black text-primary uppercase tracking-tighter flex items-center gap-2">
                                                                <Shield size={14} /> {g.status}
                                                            </p>
                                                        </div>

                                                        {/* AI Vision & Media Feed */}
                                                        {(g.ai_vision_details || (g.attachments && g.attachments.length > 0)) && (
                                                            <div className="md:col-span-3 space-y-4 pt-4 border-t border-border">
                                                                <div className="flex items-center justify-between">
                                                                    <h5 className="text-[10px] font-black text-foreground uppercase tracking-[3px] flex items-center gap-2">
                                                                        <ImageIcon size={14} className="text-primary" /> Evidence & AI Insight
                                                                    </h5>
                                                                </div>
                                                                
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                    {/* Media Grid */}
                                                                    {g.attachments && g.attachments.length > 0 && (
                                                                        <div className="grid grid-cols-4 gap-2">
                                                                            {g.attachments.map((url, i) => (
                                                                                <div key={i} className="aspect-square rounded-xl border border-border overflow-hidden bg-muted group relative">
                                                                                    {url.match(/\.(mp4|webm|ogg)$/) ? (
                                                                                        <div className="w-full h-full flex items-center justify-center text-primary bg-primary/5">
                                                                                            <Film size={20} />
                                                                                        </div>
                                                                                    ) : (
                                                                                        <img src={url} alt="Evidence" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                                                                    )}
                                                                                    <a href={url} target="_blank" rel="noreferrer" className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                        <Send size={14} className="text-white" />
                                                                                    </a>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}

                                                                    {/* AI Analysis Box */}
                                                                    {g.ai_vision_details && (
                                                                        <div className="p-4 bg-primary/5 rounded-2xl border border-primary/20 relative overflow-hidden">
                                                                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                                                                <Sparkles size={40} className="text-primary" />
                                                                            </div>
                                                                            <p className="text-[8px] font-black text-primary uppercase tracking-[3px] mb-2 flex items-center gap-2">
                                                                                <Sparkles size={12} /> AI Vision Analysis
                                                                            </p>
                                                                            <p className="text-xs font-bold text-foreground leading-relaxed uppercase tracking-tight italic">
                                                                                {g.ai_vision_details}
                                                                            </p>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {g.after_images && g.after_images.length > 0 && (
                                                            <div className="mt-6 p-6 bg-emerald-500/5 rounded-3xl border border-emerald-500/10">
                                                                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[3px] mb-4">
                                                                    Impact Evidence (After Images)
                                                                </p>
                                                                <div className="grid grid-cols-2 gap-4">
                                                                    {g.after_images.map((img, i) => (
                                                                        <div key={i} className="aspect-video rounded-2xl overflow-hidden border border-emerald-500/20">
                                                                            <img src={img} alt="Resolution" className="w-full h-full object-cover" />
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                <div className="mt-6 flex justify-end">
                                                                    <button 
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleVerify(g.id);
                                                                        }}
                                                                        disabled={submitting || g.status === 'verified'}
                                                                        className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-black uppercase tracking-[2px] text-[10px] hover:bg-emerald-500 transition-all shadow-xl active:scale-95 flex items-center gap-2"
                                                                    >
                                                                        {g.status === 'verified' ? (
                                                                            <><ShieldCheck size={14} /> Verified</>
                                                                        ) : (
                                                                            <><CheckCircle size={14} /> Verify & Close</>
                                                                        )}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    
                                                        {g.resolution_note && (
                                                            <div className="md:col-span-3 p-4 bg-primary/5 rounded-xl border border-primary/10">
                                                                <p className="text-[8px] font-black text-primary uppercase tracking-[2px] mb-2">Officer Note</p>
                                                                <p className="text-sm font-black text-muted-foreground/80 leading-tight uppercase tracking-tighter italic">"{g.resolution_note}"</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                );
                            })
                        )}
                    </div>
                </>
            ) : tab === 'campaigns' ? (
                <div className="space-y-12">
                    {/* Outreach & Schemes Section - Compact */}
                    <div className="bg-card/50 rounded-[2.5rem] p-6 border border-primary/10 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-6 opacity-5">
                            <Zap size={100} className="text-primary" />
                        </div>
                        
                        <div className="relative z-10">
                            <div className="flex items-center gap-4 mb-10">
                                <p className="text-orange-500 text-[12px] font-black uppercase tracking-[6px]">Outreach & Schemes</p>
                            </div>

                            <div className="flex flex-col lg:flex-row lg:items-start gap-12">
                                <div className="size-20 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-500 shrink-0 border border-orange-500/20">
                                    <Globe size={40} />
                                </div>

                                <div className="flex-1">
                                    <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase mb-4 leading-none">
                                        Campaign ENGINE
                                    </h2>
                                    <p className="text-sm text-muted-foreground/60 font-medium uppercase tracking-widest leading-relaxed max-w-3xl mb-8">
                                        SMS/WhatsApp campaign blasts to segmented voter lists. Auto-generates 
                                        outreach by scheme type.
                                    </p>

                                    <div className="flex flex-wrap gap-6">
                                        <button 
                                            onClick={handleCampaignBlast}
                                            disabled={submitting}
                                            className="px-10 py-5 bg-orange-500/10 border border-orange-500/30 text-orange-500 rounded-2xl font-black uppercase tracking-[4px] hover:bg-orange-500 hover:text-black transition-all group flex items-center gap-4 disabled:opacity-50"
                                        >
                                            {submitting ? <RefreshCw className="animate-spin" size={20} /> : 'Direct to 950M voters'}
                                            <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                                        </button>

                                        <div className="px-8 py-5 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-4 text-white/40">
                                            <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                                            <span className="text-[10px] font-black uppercase tracking-[3px]">Engine Ready</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Campaign Controls - Compact */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-card p-6 rounded-[2rem] border border-border space-y-4">
                            <h3 className="text-lg font-black text-foreground uppercase tracking-tighter flex items-center gap-3">
                                <MessageSquare size={18} className="text-primary" /> Protocols
                            </h3>
                            <div className="space-y-2">
                                {[
                                    { id: 'wa', label: 'WhatsApp', status: 'Optimal' },
                                    { id: 'sms', label: 'SMS Carrier', status: 'Active' },
                                    { id: 'email', label: 'Email Relay', status: 'Ready' }
                                ].map(p => (
                                    <div key={p.id} className="p-3 bg-muted/50 rounded-xl border border-border flex items-center justify-between">
                                        <span className="text-[9px] font-black uppercase tracking-[2px] text-muted-foreground/60">{p.label}</span>
                                        <span className="text-[9px] font-black uppercase tracking-[2px] text-primary">{p.status}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-card p-6 rounded-[2rem] border border-border space-y-4">
                            <h3 className="text-lg font-black text-foreground uppercase tracking-tighter flex items-center gap-3">
                                <Users size={18} className="text-primary" /> Segments
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { label: 'Unenrolled', count: voters.filter(v => v.segment === 'Unenrolled').length || '12.4K' },
                                    { label: 'Scheme Ready', count: voters.filter(v => v.segment === 'Scheme Ready').length || '8.2K' },
                                    { label: 'Low Engage', count: voters.filter(v => v.sentiment === 'negative').length || '4.1K' },
                                    { label: 'Booth Area', count: voters.length || '1.2K' }
                                ].map(s => (
                                    <div key={s.label} className="p-3 bg-muted/50 rounded-xl border border-border">
                                        <p className="text-lg font-black text-foreground leading-none mb-1">{s.count}</p>
                                        <p className="text-[8px] font-black uppercase tracking-[1px] text-muted-foreground/30">{s.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : tab === 'voters' ? (
                <div className="space-y-4">
                    <div className="dashboard-grid-compact">
                        {voters.map((v, i) => (
                            <motion.div 
                                key={v.id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.02 }}
                                className="bg-card p-4 rounded-2xl border border-border group hover:border-primary/30 transition-all relative overflow-hidden"
                            >
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="size-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground/60 group-hover:text-primary transition-colors border border-border">
                                        <User size={18} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-lg font-black text-foreground truncate tracking-tighter uppercase leading-none mb-1">{v.name}</h4>
                                        <p className="text-[8px] font-black text-muted-foreground/40 uppercase tracking-[2px]">UID: {v.id}</p>
                                    </div>
                                </div>
                                <div className="space-y-3 mb-4">
                                    <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-[1px]">
                                        <span className="text-muted-foreground/40">Sentiment</span>
                                        <span className={
                                            v.sentiment === 'positive' ? 'text-primary' : 
                                            v.sentiment === 'negative' ? 'text-rose-500' : 'text-stone-500'
                                        }>{v.sentiment || 'Neutral'}</span>
                                    </div>
                                    <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all duration-1000 ${
                                            v.sentiment === 'positive' ? 'bg-primary w-full' : 
                                            v.sentiment === 'negative' ? 'bg-rose-500 w-full' : 'bg-muted-foreground/20 w-1/2'
                                        }`} />
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 pt-3 border-t border-border">
                                    <span className="px-3 py-1 rounded-lg bg-muted text-muted-foreground/60 text-[8px] font-black uppercase tracking-[1px] border border-border">
                                        {v.segment || 'General'}
                                    </span>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            ) : null}

            {/* Deployment Modal */}
            {createPortal(
                <AnimatePresence>
                    {assignModal && (
                        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6">
                            <motion.div 
                                initial={{ opacity: 0 }} 
                                animate={{ opacity: 1 }} 
                                exit={{ opacity: 0 }}
                                onClick={() => setAssignModal(null)}
                                className="absolute inset-0 bg-background/90 backdrop-blur-3xl" 
                            />
                            
                            <motion.div 
                                initial={{ y: '100%', opacity: 0 }} 
                                animate={{ y: 0, opacity: 1 }} 
                                exit={{ y: '100%', opacity: 0 }}
                                className="relative w-full max-w-2xl bg-card rounded-t-[4rem] sm:rounded-[4rem] shadow-2xl overflow-hidden border border-border"
                            >
                                <div className="p-12">
                                    <div className="flex justify-between items-start mb-12">
                                        <div>
                                            <div className="px-5 py-2 bg-emerald-500/10 text-emerald-400 rounded-full text-[10px] font-black uppercase tracking-[4px] border border-emerald-500/20 mb-6 inline-block">
                                                Assign Task
                                            </div>
                                            <h4 className="text-4xl font-black text-foreground tracking-tighter uppercase leading-none">Select Officer</h4>
                                            <p className="text-[10px] font-mono font-bold uppercase tracking-[3px] text-muted-foreground/30 mt-3">Issue #: {assignModal.id}</p>
                                        </div>
                                        <button onClick={() => setAssignModal(null)} className="size-14 rounded-2xl bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all border border-border">
                                            <X size={28} />
                                        </button>
                                    </div>

                                    <div className="space-y-10">
                                        <div className="p-8 bg-muted/30 rounded-[2.5rem] border border-border relative overflow-hidden">
                                            <div className="absolute top-6 right-6 text-emerald-500/5">
                                                <Info size={64} />
                                            </div>
                                            <p className="text-[10px] font-black uppercase text-muted-foreground/30 tracking-[3px] mb-4">Complaint Details</p>
                                            <p className="text-xl font-black text-muted-foreground/80 leading-tight uppercase tracking-tighter pr-12">{assignModal.description}</p>
                                        </div>

                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black uppercase tracking-[5px] text-emerald-500 pl-2">Select Officer</label>
                                            <div className="relative">
                                                <select 
                                                    value={selectedWorker} 
                                                    onChange={(e) => setSelectedWorker(e.target.value)}
                                                    className="w-full p-6 bg-muted/50 rounded-2xl border border-border focus:border-emerald-500/50 outline-none text-foreground text-lg font-black uppercase tracking-tighter appearance-none cursor-pointer pr-16"
                                                >
                                                    <option value="" className="bg-card">Select an officer...</option>
                                                    {workers.map(w => (
                                                        <option key={w.id} value={w.id} className="bg-card">{w.name} (ID: {w.id})</option>
                                                    ))}
                                                </select>
                                                <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-emerald-500">
                                                    <ChevronRight size={24} className="rotate-90" strokeWidth={3} />
                                                </div>
                                            </div>
                                        </div>

                                        <button 
                                            onClick={handleAssign} 
                                            disabled={!selectedWorker || submitting}
                                            className="w-full py-6 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-[5px] shadow-2xl shadow-emerald-600/20 hover:bg-emerald-500 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-4 border border-white/10"
                                        >
                                            {submitting ? (
                                                <RefreshCw className="size-6 animate-spin" />
                                            ) : (
                                                <><Shield size={24} strokeWidth={3} /> Confirm Assignment</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
}
