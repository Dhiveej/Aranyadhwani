import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar, LineChart, Line,
} from 'recharts';
import {
  Shield, Radio, Activity, AlertTriangle, Battery, Wifi, Clock, MapPin,
  Cpu, Server, Zap, Eye, ChevronRight, Terminal, Volume2, Crosshair,
  TreePine, CloudRain, Wind, Thermometer, Signal, CheckCircle, XCircle,
  Info, BarChart3, Users, Award, Heart, Globe, Layers, Database,
  Smartphone, Bell, MessageSquare, ChevronDown, ExternalLink,
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { db } from './firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';

/* ═══════════════════════════════════════════════════════════════
   MOCK/STATIC DATA FALLBACKS
   ═══════════════════════════════════════════════════════════════ */

const HOURLY_DATA = Array.from({ length: 24 }, (_, i) => ({
  hour: `${String(i).padStart(2, '0')}:00`,
  detections: [0,0,1,2,3,1,0,0,0,1,0,0,0,0,1,0,0,1,2,1,0,1,2,1][i],
  confidence: [0,0,0.8,0.9,0.95,0.7,0,0,0,0.6,0,0,0,0,0.5,0,0,0.7,0.85,0.9,0,0.6,0.88,0.7][i],
}));

const WEEKLY_TREND = [
  { day: 'Mon', detections: 3, avgConf: 0.82 }, { day: 'Tue', detections: 5, avgConf: 0.79 },
  { day: 'Wed', detections: 2, avgConf: 0.91 }, { day: 'Thu', detections: 7, avgConf: 0.85 },
  { day: 'Fri', detections: 4, avgConf: 0.77 }, { day: 'Sat', detections: 8, avgConf: 0.88 },
  { day: 'Sun', detections: 5, avgConf: 0.83 },
];

const CONF_DIST = [
  { range: '0.5-0.6', count: 3 }, { range: '0.6-0.7', count: 5 }, { range: '0.7-0.8', count: 8 },
  { range: '0.8-0.9', count: 12 }, { range: '0.9-1.0', count: 7 },
];

const THREAT_CLASSES = [
  { name: 'Gunshot', value: 38, color: '#ff2020' }, { name: 'Explosion', value: 22, color: '#ffaa00' },
  { name: 'Bang', value: 18, color: '#00ff41' }, { name: 'Machine gun', value: 8, color: '#00aaff' },
  { name: 'Other', value: 14, color: '#666' },
];

const COST_DATA = [
  { item: '1 Node (Pi Zero 2W + ReSpeaker + Enclosure)', cost: '₹3,000' },
  { item: '20 Nodes — 5 km² Coverage', cost: '₹60,000' },
  { item: '500 Nodes — Full Nagarhole (643 km²)', cost: '₹15,00,000' },
];

const ARCH_LAYERS = [
  { icon: Cpu, name: 'EDGE LAYER', desc: 'Raspberry Pi Zero 2W + ReSpeaker 2-Mic HAT', detail: 'Solar-powered, weatherproof enclosure, 16kHz audio capture' },
  { icon: Zap, name: 'AI LAYER', desc: 'YAMNet TFLite — 3.8MB Model', detail: 'On-device inference, 0.9398 mAP score, <200ms latency' },
  { icon: Database, name: 'CLOUD LAYER', desc: 'Firebase Firestore Real-time DB', detail: 'Event streaming, geo-indexed queries, offline sync' },
  { icon: Bell, name: 'ALERT LAYER', desc: 'FCM Push + Twilio SMS', detail: 'Multi-channel alerts, ranger dispatch, escalation chains' },
];

/* ═══════════════════════════════════════════════════════════════
   PARTICLE SYSTEM
   ═══════════════════════════════════════════════════════════════ */
const ParticleField = () => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    const particles = [];
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3, vy: -Math.random() * 0.4 - 0.1,
        size: Math.random() * 2.5 + 0.5, alpha: Math.random() * 0.5 + 0.1,
        pulse: Math.random() * Math.PI * 2,
      });
    }
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.pulse += 0.02;
        if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;
        const a = p.alpha * (0.5 + 0.5 * Math.sin(p.pulse));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,255,65,${a})`;
        ctx.shadowBlur = 8; ctx.shadowColor = 'rgba(0,255,65,0.3)';
        ctx.fill();
      });
      ctx.shadowBlur = 0;
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }} />;
};

/* ═══════════════════════════════════════════════════════════════
   ANIMATED COUNTER
   ═══════════════════════════════════════════════════════════════ */
const CountUp = ({ end, decimals = 0, duration = 1800, prefix = '', suffix = '' }) => {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const target = parseFloat(end);
    if (isNaN(target)) { setVal(end); return; }
    let start = 0; const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setVal(target); clearInterval(timer); }
      else setVal(start);
    }, 16);
    return () => clearInterval(timer);
  }, [end, duration]);
  return <>{prefix}{typeof val === 'number' ? val.toFixed(decimals) : val}{suffix}</>;
};

/* ═══════════════════════════════════════════════════════════════
   CONFIDENCE ARC
   ═══════════════════════════════════════════════════════════════ */
const ConfidenceArc = ({ value, size = 56 }) => {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setProgress(value), 100);
    return () => clearTimeout(timer);
  }, [value]);
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - progress * circ;
  const color = value >= 0.85 ? '#ff2020' : value >= 0.7 ? '#ffaa00' : '#00ff41';
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#0d2016" strokeWidth="4" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1.2s ease-out', filter: `drop-shadow(0 0 4px ${color})` }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={size * 0.22} fontWeight="700"
        style={{ transform: 'rotate(90deg)', transformOrigin: 'center', fontFamily: "'Share Tech Mono', monospace" }}>
        {(value * 100).toFixed(0)}%
      </text>
    </svg>
  );
};

/* ═══════════════════════════════════════════════════════════════
   SIGNAL BARS
   ═══════════════════════════════════════════════════════════════ */
const SignalBars = ({ level }) => (
  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 18 }}>
    {[1, 2, 3, 4].map(i => (
      <div key={i} style={{
        width: 4, height: 4 + i * 3.5, borderRadius: 1,
        background: i <= level ? '#00ff41' : '#0d2016',
        boxShadow: i <= level ? '0 0 4px rgba(0,255,65,0.4)' : 'none',
        transition: 'background 0.3s',
      }} />
    ))}
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   CUSTOM TOOLTIP
   ═══════════════════════════════════════════════════════════════ */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'rgba(4,15,6,0.95)', border: '1px solid #0d2016', borderRadius: 6, padding: '10px 14px', backdropFilter: 'blur(10px)' }}>
      <div style={{ color: '#00ff41', fontFamily: "'Share Tech Mono', monospace", fontSize: '0.8rem', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || '#a8ffa8', fontSize: '0.75rem', margin: '2px 0' }}>
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════════════════════════ */
const DashboardPreview = () => {
  const [tab, setTab] = useState(0);
  const [time, setTime] = useState(new Date());
  const [flashAlert, setFlashAlert] = useState(true);
  
  // LIVE FIREBASE STATE
  const [detections, setDetections] = useState([]);
  const [nodes, setNodes] = useState([]);

  // Fetch Live Detections
  useEffect(() => {
    const q = query(collection(db, 'detections'), orderBy('timestamp', 'desc'), limit(15));
    const unsub = onSnapshot(q, (snapshot) => {
      const dets = snapshot.docs.map(doc => {
        const data = doc.data();
        const date = data.timestamp ? data.timestamp.toDate() : new Date();
        const diffMins = Math.floor((new Date() - date) / (1000 * 60));
        
        return {
          id: doc.id,
          node: data.device_id || 'UNKNOWN_NODE',
          location: 'Nagarhole — Sector ' + (data.device_id === 'aranya_pi_01' ? 'A (North)' : 'B (Deep)'), // Mock location mapping
          confidence: data.confidence / 100, // DB stores as 84.5, UI expects 0.845
          timestamp: date.toLocaleTimeString('en-US', { hour12: false }),
          timeAgo: diffMins === 0 ? 'Just now' : `${diffMins} min ago`,
          volume: data.rms_loudness ? data.rms_loudness.toFixed(3) : 0,
          classes: [data.threat],
          lat: 12.0433 + (Math.random() * 0.02 - 0.01), // Jitter map pin slightly to avoid overlapping
          lng: 76.1398 + (Math.random() * 0.02 - 0.01),
          status: data.status || 'NEW ALERT',
          severity: data.severity || 'HIGH'
        };
      });
      setDetections(dets);
    });
    return () => unsub();
  }, []);

  // Fetch Live Node Status
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'devices'), (snapshot) => {
      // Map out the data but keep the document ID in case device_id is missing
      const rawNodes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Combine live heartbeat nodes with mock visual nodes for the map
      const combinedNodes = [
        ...rawNodes.map(n => {
          const isAlive = n.last_heartbeat && (new Date() - n.last_heartbeat.toDate()) < (1000 * 120);
          return {
            id: n.device_id || n.id,
            status: isAlive && n.status !== 'OFFLINE' ? 'ACTIVE' : 'OFFLINE',
            battery: n.battery || 100, // Using 100 if not sent yet
            uptime: isAlive ? 'Live' : 'Offline',
            lastDetection: 'N/A',
            totalDetections: 0,
            signal: 4,
            lat: 12.0433, lng: 76.1398, sector: 'Sector A'
          };
        }),
        // Padding with some fake nodes so the map looks cool
        { id: 'ARANYA_02', status: 'ACTIVE', battery: 72, uptime: '9d 11h', lastDetection: '1 hour ago', totalDetections: 189, signal: 3, lat: 11.9876, lng: 76.0934, sector: 'Deep Forest B' },
        { id: 'ARANYA_03', status: 'ACTIVE', battery: 91, uptime: '3d 2h', lastDetection: '18 min ago', totalDetections: 156, signal: 4, lat: 12.0821, lng: 76.2102, sector: 'River Bend C' },
      ];
      setNodes(combinedNodes);
    });
    return () => unsub();
  }, []);

  const tabs = useMemo(() => [
    { label: 'OPERATIONS', icon: Shield },
    { label: 'NODE NETWORK', icon: Radio },
    { label: 'ANALYTICS', icon: BarChart3 },
    { label: 'ABOUT / SYSTEM', icon: Info },
  ], []);

  return (
    <div style={S.root}>
      <style>{GLOBAL_CSS}</style>
      <ParticleField />
      {/* Scanline overlay */}
      <div style={S.scanlines} />
      {/* Red flash on load */}
      {flashAlert && <div style={S.redFlash} />}

      {/* ═══ HEADER ═══ */}
      <header style={S.header}>
        <div style={S.hdrLeft}>
          <TreePine size={28} color="#00ff41" style={{ filter: 'drop-shadow(0 0 8px rgba(0,255,65,0.5))' }} />
          <div>
            <div style={S.logoText}>ARANYADHWANI</div>
            <div style={S.logoSub}>FOREST ACOUSTIC SURVEILLANCE SYSTEM</div>
          </div>
        </div>
        <div style={S.hdrCenter}>
          <div style={S.clock}>{time.toLocaleTimeString('en-IN', { hour12: false })}</div>
          <div style={S.locTag}><MapPin size={12} /> NAGARHOLE TIGER RESERVE</div>
        </div>
        <div style={S.hdrRight}>
          <div style={S.sysStatus}><span style={S.greenPulse} /> SYSTEM ACTIVE</div>
          <div style={S.weatherTag}><TreePine size={11}/> Forest · <Thermometer size={11}/> 24°C · <Wind size={11}/> 12 km/h</div>
        </div>
      </header>

      {/* ═══ TAB BAR ═══ */}
      <nav style={S.tabBar}>
        {tabs.map((t, i) => {
          const Icon = t.icon;
          return (
          <button key={i} onClick={() => setTab(i)}
            style={{ ...S.tabBtn, ...(tab === i ? S.tabActive : {}) }}>
            <Icon size={14} /> {t.label}
          </button>
        );})}
      </nav>

      {/* ═══ CONTENT ═══ */}
      <main style={S.main}>
        {tab === 0 && <OperationsTab detections={detections} nodes={nodes} />}
        {tab === 1 && <NodeNetworkTab nodes={nodes} />}
        {tab === 2 && <AnalyticsTab />}
        {tab === 3 && <AboutTab />}
      </main>

      {/* ═══ FOOTER ═══ */}
      <footer style={S.footer}>
        <div style={S.marquee}>
          <span style={S.marqueeInner}>
            ◈ ARANYADHWANI v1.0 &nbsp;·&nbsp; PROTECTING NAGARHOLE TIGER RESERVE &nbsp;·&nbsp; 4 NODES ACTIVE &nbsp;·&nbsp; 847 THREATS LOGGED &nbsp;·&nbsp; SYSTEM NOMINAL &nbsp;·&nbsp; NEXT MAINTENANCE: NODE_05 &nbsp;·&nbsp; UPLINK STABLE &nbsp;·&nbsp;
            ◈ ARANYADHWANI v1.0 &nbsp;·&nbsp; PROTECTING NAGARHOLE TIGER RESERVE &nbsp;·&nbsp; 4 NODES ACTIVE &nbsp;·&nbsp; 847 THREATS LOGGED &nbsp;·&nbsp; SYSTEM NOMINAL &nbsp;·&nbsp; NEXT MAINTENANCE: NODE_05 &nbsp;·&nbsp; UPLINK STABLE &nbsp;·&nbsp;
          </span>
        </div>
      </footer>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   TAB 1: OPERATIONS
   ═══════════════════════════════════════════════════════════════ */
const OperationsTab = ({ detections, nodes }) => (
  <div style={{ animation: 'fadeSlideIn 0.4s ease-out' }}>
    {/* Alert Banner */}
    {detections.length > 0 && detections[0].severity === 'CRITICAL' && (
      <div style={S.alertBanner}>
        <div style={S.alertBannerInner}>
          <AlertTriangle size={16} />
          <span style={S.ticker}>
            <span style={S.tickerInner}>
              ⚠ CRITICAL DETECTION — {detections[0].node} — {detections[0].classes[0]} detected — Confidence {(detections[0].confidence * 100).toFixed(0)}% — {detections[0].timeAgo} — Rangers dispatched &nbsp;&nbsp;&nbsp;
              ⚠ CRITICAL DETECTION — {detections[0].node} — {detections[0].classes[0]} detected — Confidence {(detections[0].confidence * 100).toFixed(0)}% — {detections[0].timeAgo} — Rangers dispatched &nbsp;&nbsp;&nbsp;
            </span>
          </span>
        </div>
      </div>
    )}

    {/* Stats Row */}
    <div style={S.statsRow}>
      {[
        { label: 'TOTAL DETECTIONS', value: detections.length, icon: Crosshair, color: '#00ff41' },
        { label: "TODAY'S DETECTIONS", value: detections.length, icon: AlertTriangle, color: '#ff2020' },
        { label: 'AVG CONFIDENCE', value: detections.length > 0 ? detections.reduce((a, b) => a + b.confidence, 0) / detections.length : 0, decimals: 2, icon: Eye, color: '#ffaa00' },
        { label: 'NODES ONLINE', value: nodes.filter(n => n.status === 'ACTIVE').length, suffix: `/${nodes.length}`, icon: Radio, color: '#00ff41' },
      ].map((s, i) => (
        <div key={i} style={S.statCard} className="hoverCard">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <s.icon size={16} color={s.color} />
            <span style={{ ...S.statLabel, color: s.color }}>{s.label}</span>
          </div>
          <div style={{ ...S.statValue, color: s.color }}>
            <CountUp end={s.value} decimals={s.decimals || 0} suffix={s.suffix || ''} />
          </div>
        </div>
      ))}
    </div>

    {/* Threat Feed + Chart */}
    <div style={S.opsGrid}>
      {/* Feed */}
      <div style={S.card}>
        <div style={S.cardHead}><Shield size={14} color="#00ff41"/> LIVE THREAT FEED</div>
        <div style={S.feedList}>
          {detections.length === 0 && <div style={{ color: '#5a9a6e', padding: 20, textAlign: 'center', fontFamily: "'Share Tech Mono'" }}>Listening to the forest... No recent threats.</div>}
          {detections.map((d) => {
            const sevColor = d.severity === 'CRITICAL' ? '#ff2020' : d.severity === 'HIGH' ? '#ffaa00' : '#00ff41';
            return (
              <div key={d.id} style={{ ...S.feedCard, borderLeftColor: sevColor, animation: d.severity === 'CRITICAL' ? 'criticalPulse 2s ease-in-out infinite' : 'none' }} className="hoverCard">
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <ConfidenceArc value={d.confidence} size={52} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ ...S.sevBadge, background: sevColor + '22', color: sevColor, boxShadow: `0 0 8px ${sevColor}33` }}>{d.severity}</span>
                      <span style={{ ...S.statusBadge, color: d.status === 'VERIFIED' ? '#00ff41' : '#ffaa00' }}>
                        {d.status === 'VERIFIED' ? <CheckCircle size={11}/> : <Clock size={11}/>} {d.status}
                      </span>
                    </div>
                    <div style={S.feedNode}><Terminal size={11}/> {d.node} <span style={S.feedLoc}><MapPin size={10}/> {d.location}</span></div>
                    <div style={S.feedTime}><Clock size={10}/> {d.timestamp} · {d.timeAgo} <Volume2 size={10} style={{marginLeft:8}}/> Vol: {d.volume}</div>
                    <div style={S.tagRow}>
                      {d.classes.map((c, j) => <span key={j} style={S.tag}>{c}</span>)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Map + Chart Column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Tactical Map */}
        <div style={{ ...S.card, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 400 }}>
          <div style={S.cardHead}><Globe size={14} color="#00ff41"/> LIVE TACTICAL MAP</div>
          <div style={{ flex: 1, minHeight: 0, borderRadius: 6, overflow: 'hidden', border: '1px solid #0d2016', position: 'relative' }}>
            <MapContainer center={[12.035, 76.135]} zoom={11} style={{ height: '100%', width: '100%', background: '#020b04', zIndex: 1 }} zoomControl={false}>
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              />
              
              {/* Sensor Nodes */}
              {nodes.map(n => {
                const isActive = n.status === 'ACTIVE';
                const nodeColor = isActive ? '#00ff41' : '#ff2020';
                const anim = isActive ? 'animation: livePulse 2s infinite' : '';
                return (
                  <Marker key={n.id} position={[n.lat, n.lng]} icon={L.divIcon({
                    className: 'clear-marker',
                    html: `<div style="width: 14px; height: 14px; background: ${nodeColor}33; border: 2px solid ${nodeColor}; border-radius: 50%; box-shadow: 0 0 8px ${nodeColor}; ${anim}"></div>`,
                    iconSize: [14,14], iconAnchor: [7,7], popupAnchor: [0, -7]
                  })}>
                    <Popup className="tactical-popup auth-border" style={{ borderColor: nodeColor }}>
                      <div style={{ fontFamily: "'Share Tech Mono'", fontSize: '0.85rem', color: nodeColor, fontWeight: 700 }}>{n.id} <span style={{fontSize:'0.65rem', marginLeft:4}}>({n.status})</span></div>
                      <div style={{ fontSize: '0.7rem', color: '#6aaa7e', marginTop: 4 }}>{n.sector}</div>
                      <div style={{ fontSize: '0.75rem', color: '#d4ffd4', marginTop: 4 }}>Battery: {n.battery}%</div>
                      <div style={{ fontSize: '0.7rem', color: '#6aaa7e', marginTop: 2 }}>Last Alert: {n.lastDetection}</div>
                    </Popup>
                  </Marker>
                );
              })}

              {/* Active Threats */}
              {detections.map(d => {
                const sevColor = d.severity === 'CRITICAL' ? '#ff2020' : d.severity === 'HIGH' ? '#ffaa00' : '#00ff41';
                return (
                  <Marker key={`t-${d.id}`} position={[d.lat, d.lng]} icon={L.divIcon({
                    className: 'clear-marker',
                    html: `<div style="width: 20px; height: 20px; border: 2px solid ${sevColor}; border-radius: 50%; box-shadow: 0 0 10px ${sevColor}; animation: livePulse 1.5s infinite"></div>`,
                    iconSize: [20,20],
                    iconAnchor: [10,10],
                    popupAnchor: [0, -10]
                  })}>
                    <Popup className="tactical-popup auth-border" style={{ borderColor: sevColor }}>
                      <div style={{ fontFamily: "'Share Tech Mono'", fontSize: '0.8rem', color: sevColor, fontWeight: 700 }}>⚠ {d.severity} THREAT</div>
                      <div style={{ fontSize: '0.75rem', color: '#d4ffd4', marginTop: 4 }}>{d.classes.join(', ')}</div>
                      <div style={{ fontSize: '0.7rem', color: '#6aaa7e', marginTop: 2 }}>{d.timestamp} · Vol: {d.volume}</div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
            {/* Map Overlay Vignette */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', boxShadow: 'inset 0 0 40px rgba(2,11,4,0.8)', zIndex: 2 }} />
          </div>
        </div>

        {/* 24h Chart */}
        <div style={{ ...S.card, height: 240, display: 'flex', flexDirection: 'column' }}>
          <div style={S.cardHead}><Activity size={14} color="#00ff41"/> 24-HOUR ACTIVITY</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={HOURLY_DATA} margin={{ top: 10, right: 10, left: -25, bottom: -10 }}>
                <defs>
                  <linearGradient id="aGreen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00ff41" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#00ff41" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#0d2016" />
                <XAxis dataKey="hour" tick={{ fill: '#5a9a6e', fontSize: 10, fontFamily: "'Share Tech Mono'" }} axisLine={{ stroke: '#0d2016' }} interval={3} />
                <YAxis tick={{ fill: '#5a9a6e', fontSize: 10 }} axisLine={{ stroke: '#0d2016' }} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="detections" name="Detections" stroke="#00ff41" fill="url(#aGreen)" strokeWidth={2} dot={{ r: 3, fill: '#00ff41', stroke: '#020b04' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   TAB 2: NODE NETWORK
   ═══════════════════════════════════════════════════════════════ */
const NodeNetworkTab = ({ nodes }) => (
  <div style={{ animation: 'fadeSlideIn 0.4s ease-out' }}>
    {/* Summary Stats */}
    <div style={{ ...S.statsRow, marginBottom: 20 }}>
      {[
        { label: 'NETWORK HEALTH', value: `${((nodes.filter(n => n.status === 'ACTIVE').length / nodes.length) * 100).toFixed(0)}%`, color: '#00ff41', icon: Heart },
        { label: 'COVERAGE AREA', value: '12.4 km²', color: '#00aaff', icon: Globe },
        { label: 'NEED MAINTENANCE', value: nodes.filter(n => n.status === 'OFFLINE').length, color: '#ff2020', icon: AlertTriangle },
      ].map((s, i) => (
        <div key={i} style={{ ...S.statCard, flex: 1 }} className="hoverCard">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <s.icon size={16} color={s.color} />
            <span style={{ ...S.statLabel, color: s.color }}>{s.label}</span>
          </div>
          <div style={{ ...S.statValue, color: s.color, fontSize: '1.8rem' }}>{s.value}</div>
        </div>
      ))}
    </div>

    {/* Node Grid */}
    <div style={S.nodeGrid}>
      {nodes.map(n => {
        const isOffline = n.status === 'OFFLINE';
        const battColor = n.battery > 50 ? '#00ff41' : n.battery > 20 ? '#ffaa00' : '#ff2020';
        return (
          <div key={n.id} style={{ ...S.nodeCard, opacity: isOffline ? 0.5 : 1, borderColor: isOffline ? '#ff202033' : '#0d2016' }} className="hoverCard">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={S.nodeId}>{n.id}</span>
              <span style={{ ...S.nodeStatus, color: isOffline ? '#ff2020' : '#00ff41' }}>
                {isOffline ? <XCircle size={12}/> : <span style={S.greenPulse}/>} {n.status}
              </span>
            </div>
            <div style={S.nodeDetail}><MapPin size={11}/> {n.sector}</div>
            <div style={S.nodeDetail}><Globe size={11}/> {n.lat.toFixed(4)}°N, {n.lng.toFixed(4)}°E</div>

            {/* Battery */}
            <div style={{ margin: '12px 0 4px' }}>
              <div style={S.barHead}><Battery size={11} color={battColor}/> <span>Battery</span> <span style={{ color: battColor }}>{n.battery}%</span></div>
              <div style={S.barTrack}>
                <div style={{ ...S.barFill, width: `${n.battery}%`, background: battColor, boxShadow: `0 0 6px ${battColor}55` }} />
              </div>
            </div>

            {/* Signal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <div style={S.nodeDetail}><Signal size={11}/> Signal</div>
              <SignalBars level={n.signal} />
            </div>

            <div style={S.nodeDivider} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
              <span style={S.nodeDetail}><Clock size={10}/> Uptime: {n.uptime}</span>
              <span style={S.nodeDetail}><Crosshair size={10}/> {n.totalDetections}</span>
            </div>
            <div style={{ ...S.nodeDetail, marginTop: 4 }}><Activity size={10}/> Last: {n.lastDetection}</div>
          </div>
        );
      })}
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   TAB 3: ANALYTICS
   ═══════════════════════════════════════════════════════════════ */
const AnalyticsTab = () => (
  <div style={{ animation: 'fadeSlideIn 0.4s ease-out' }}>
    {/* Insight Cards */}
    <div style={{ ...S.statsRow, marginBottom: 20 }}>
      {[
        { label: 'PEAK POACHING TIME', value: '02:00 — 04:00', icon: Clock, color: '#ff2020' },
        { label: 'MOST ACTIVE SECTOR', value: 'North Ridge', icon: MapPin, color: '#ffaa00' },
        { label: 'AVG RESPONSE CONF.', value: '83%', icon: Eye, color: '#00ff41' },
        { label: 'FALSE POSITIVE RATE', value: '< 5%', icon: CheckCircle, color: '#00aaff' },
      ].map((c, i) => (
        <div key={i} style={S.statCard} className="hoverCard">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <c.icon size={14} color={c.color}/>
            <span style={{ ...S.statLabel, color: c.color }}>{c.label}</span>
          </div>
          <div style={{ ...S.statValue, color: c.color, fontSize: '1.3rem' }}>{c.value}</div>
        </div>
      ))}
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* Hourly Heatmap */}
      <div style={S.card}>
        <div style={S.cardHead}><Activity size={14} color="#00ff41"/> DETECTION HEATMAP BY HOUR</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={HOURLY_DATA} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#0d2016" />
            <XAxis dataKey="hour" tick={{ fill: '#5a9a6e', fontSize: 9, fontFamily: "'Share Tech Mono'" }} axisLine={{ stroke: '#0d2016' }} interval={3} />
            <YAxis tick={{ fill: '#5a9a6e', fontSize: 9 }} axisLine={{ stroke: '#0d2016' }} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="detections" name="Detections" fill="#ff2020" radius={[3, 3, 0, 0]}>
              {HOURLY_DATA.map((e, i) => <Cell key={i} fill={e.detections >= 2 ? '#ff2020' : e.detections === 1 ? '#ffaa00' : '#0d2016'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Weekly */}
      <div style={S.card}>
        <div style={S.cardHead}><Activity size={14} color="#00ff41"/> WEEKLY DETECTION TREND</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={WEEKLY_TREND} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#0d2016" />
            <XAxis dataKey="day" tick={{ fill: '#5a9a6e', fontSize: 10 }} axisLine={{ stroke: '#0d2016' }} />
            <YAxis tick={{ fill: '#5a9a6e', fontSize: 10 }} axisLine={{ stroke: '#0d2016' }} />
            <Tooltip content={<ChartTooltip />} />
            <Line type="monotone" dataKey="detections" name="Detections" stroke="#00ff41" strokeWidth={2} dot={{ r: 4, fill: '#00ff41', stroke: '#020b04', strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Confidence Distribution */}
      <div style={S.card}>
        <div style={S.cardHead}><BarChart3 size={14} color="#00ff41"/> CONFIDENCE DISTRIBUTION</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={CONF_DIST} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#0d2016" />
            <XAxis dataKey="range" tick={{ fill: '#5a9a6e', fontSize: 10 }} axisLine={{ stroke: '#0d2016' }} />
            <YAxis tick={{ fill: '#5a9a6e', fontSize: 10 }} axisLine={{ stroke: '#0d2016' }} />
            <Tooltip content={<ChartTooltip />} />
            <defs>
              <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00ff41" />
                <stop offset="100%" stopColor="#004d13" />
              </linearGradient>
            </defs>
            <Bar dataKey="count" name="Count" fill="url(#confGrad)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Threat Classes Pie */}
      <div style={S.card}>
        <div style={S.cardHead}><Crosshair size={14} color="#00ff41"/> TOP THREAT CLASSES</div>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={THREAT_CLASSES} cx="50%" cy="50%" innerRadius={55} outerRadius={80}
              paddingAngle={3} dataKey="value" labelLine={false}
              label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                const R = Math.PI / 180;
                const r = innerRadius + (outerRadius - innerRadius) * 0.5;
                return <text x={cx + r * Math.cos(-midAngle * R)} y={cy + r * Math.sin(-midAngle * R)}
                  fill="#a8ffa8" textAnchor="middle" dominantBaseline="central"
                  style={{ fontSize: '0.7rem', fontWeight: 700 }}>{(percent * 100).toFixed(0)}%</text>;
              }}>
              {THREAT_CLASSES.map((e, i) => <Cell key={i} fill={e.color} stroke="none" />)}
            </Pie>
            <Legend formatter={v => <span style={{ color: '#a8ffa8', fontSize: '0.72rem' }}>{v}</span>} iconType="circle" iconSize={8} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   TAB 4: ABOUT / SYSTEM
   ═══════════════════════════════════════════════════════════════ */
const AboutTab = () => (
  <div style={{ animation: 'fadeSlideIn 0.4s ease-out' }}>
    {/* Hero */}
    <div style={S.aboutHero}>
      <TreePine size={40} color="#00ff41" style={{ filter: 'drop-shadow(0 0 12px rgba(0,255,65,0.5))' }} />
      <div>
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '2rem', fontWeight: 700, color: '#00ff41', letterSpacing: 2 }}>ARANYADHWANI</div>
        <div style={{ color: '#6aaa7e', fontSize: '0.9rem', fontStyle: 'italic', marginTop: 2 }}>"Aranya" (अरण्य) = Forest &nbsp;·&nbsp; "Dhwani" (ध्वनि) = Sound</div>
        <div style={{ color: '#d4ffd4', fontSize: '0.88rem', marginTop: 8, maxWidth: 600, lineHeight: 1.7 }}>
          An AI-powered acoustic surveillance system that turns every tree into a sentinel. Deployed across Nagarhole Tiger Reserve, it listens to the forest 24/7, detecting gunshots in real time and alerting rangers within seconds — giving wildlife a fighting chance against poaching.
        </div>
      </div>
    </div>

    {/* Architecture */}
    <div style={{ ...S.card, marginTop: 16 }}>
      <div style={S.cardHead}><Layers size={14} color="#00ff41"/> TECHNICAL ARCHITECTURE</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 8 }}>
        {ARCH_LAYERS.map((l, i) => (
          <div key={i} style={S.archCard} className="hoverCard">
            <l.icon size={22} color="#00ff41" style={{ marginBottom: 8 }} />
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '0.85rem', fontWeight: 700, color: '#00ff41', letterSpacing: 1 }}>{l.name}</div>
            <div style={{ color: '#d4ffd4', fontSize: '0.82rem', marginTop: 4 }}>{l.desc}</div>
            <div style={{ color: '#6aaa7e', fontSize: '0.75rem', marginTop: 6, lineHeight: 1.5 }}>{l.detail}</div>
          </div>
        ))}
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
      {/* Hardware */}
      <div style={S.card}>
        <div style={S.cardHead}><Cpu size={14} color="#00ff41"/> HARDWARE SPECS</div>
        <table style={S.table}>
          <tbody>
            {[
              ['Compute', 'Raspberry Pi Zero 2W (1GHz, 512MB)'],
              ['Microphone', 'ReSpeaker 2-Mic Pi HAT'],
              ['Model', 'YAMNet TFLite — 3.8 MB'],
              ['Accuracy', '0.9398 mAP Score'],
              ['Latency', '< 200ms on-device inference'],
              ['Power', 'Solar panel + 18650 LiPo'],
              ['Enclosure', 'IP67 weatherproof casing'],
            ].map(([k, v], i) => (
              <tr key={i} style={S.tableRow}>
                <td style={S.tableKey}>{k}</td>
                <td style={S.tableVal}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cost */}
      <div style={S.card}>
        <div style={S.cardHead}><Zap size={14} color="#00ff41"/> DEPLOYMENT COST</div>
        <table style={S.table}>
          <tbody>
            {COST_DATA.map((c, i) => (
              <tr key={i} style={S.tableRow}>
                <td style={S.tableKey}>{c.item}</td>
                <td style={{ ...S.tableVal, color: '#00ff41', fontFamily: "'Share Tech Mono', monospace", fontWeight: 700 }}>{c.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <span style={{ background: '#00ff4115', border: '1px solid #00ff4133', borderRadius: 20, padding: '6px 18px', fontSize: '0.72rem', color: '#00ff41', fontWeight: 700, letterSpacing: 1 }}>
            <Award size={12} style={{ verticalAlign: -2, marginRight: 6 }}/> BUILT FOR HACKATHON
          </span>
        </div>
      </div>
    </div>

    {/* Team */}
    <div style={{ ...S.card, marginTop: 16 }}>
      <div style={S.cardHead}><Users size={14} color="#00ff41"/> TEAM ARANYADHWANI</div>
      <div style={{ color: '#d4ffd4', fontSize: '0.85rem', lineHeight: 1.8, marginTop: 4 }}>
        A passionate team of engineers, conservationists, and AI researchers dedicated to protecting India's forests through technology. Built with ❤️ for wildlife.
      </div>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   GLOBAL CSS (keyframes + effects)
   ═══════════════════════════════════════════════════════════════ */
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Exo+2:wght@300;400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; margin: 0; padding: 0; overflow: hidden; background: #020b04; }
  @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes criticalPulse { 0%,100% { box-shadow: inset 0 0 0 0 transparent; } 50% { box-shadow: inset 0 0 20px rgba(255,32,32,0.1); } }
  @keyframes livePulse { 0%,100% { opacity: 1; box-shadow: 0 0 0 0 rgba(0,255,65,0.6); } 50% { opacity: 0.6; box-shadow: 0 0 0 5px rgba(0,255,65,0); } }
  @keyframes tickerScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
  @keyframes marqueeScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
  @keyframes scanlineAnim { 0% { background-position: 0 0; } 100% { background-position: 0 4px; } }
  @keyframes flashFade { 0% { opacity: 0.2; } 100% { opacity: 0; } }
  @keyframes barGrow { from { width: 0; } }
  .hoverCard { transition: transform 0.2s ease, box-shadow 0.2s ease !important; }
  .hoverCard:hover { transform: translateY(-2px) !important; box-shadow: 0 0 24px rgba(0,255,65,0.2), 0 0 0 1px rgba(0,255,65,0.3) !important; }
  *::-webkit-scrollbar { width: 6px; }
  *::-webkit-scrollbar-track { background: #040f06; }
  *::-webkit-scrollbar-thumb { background: #1a3a28; border-radius: 3px; }
  *::-webkit-scrollbar-thumb:hover { background: #2d6b40; }
  
  /* Leaflet Tactical Overrides */
  .leaflet-container { background: #020b04 !important; font-family: 'Exo 2', sans-serif !important; }
  .leaflet-popup-content-wrapper, .leaflet-popup-tip {
    background: rgba(4,15,6,0.95); border: 1px solid #0d2016; color: #a8ffa8;
    backdrop-filter: blur(4px); box-shadow: 0 0 20px rgba(0,0,0,0.8);
  }
  .auth-border .leaflet-popup-content-wrapper { border: 1px solid inherit; }
  .leaflet-popup-content { margin: 10px 14px; line-height: 1.4; }
  .leaflet-control-attribution {
    background: rgba(4,15,6,0.8) !important; color: #5a9a6e !important;
    font-family: 'Share Tech Mono', monospace; font-size: 0.6rem !important;
  }
  .leaflet-control-attribution a { color: #6aaa7e !important; text-decoration: none; }
  .clear-marker { background: none; border: none; }
`;

/* ═══════════════════════════════════════════════════════════════
   STYLE OBJECTS
   ═══════════════════════════════════════════════════════════════ */
const S = {
  root: {
    height: '100vh', background: '#020b04', color: '#d4ffd4',
    fontFamily: "'Exo 2', sans-serif", position: 'relative', zIndex: 1,
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  scanlines: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 999,
    background: 'repeating-linear-gradient(0deg, rgba(0,255,65,0.015) 0px, rgba(0,255,65,0.015) 1px, transparent 1px, transparent 3px)',
    animation: 'scanlineAnim 0.15s linear infinite',
  },
  redFlash: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 998,
    background: 'radial-gradient(ellipse at center, rgba(255,32,32,0.15) 0%, transparent 70%)',
    animation: 'flashFade 0.6s ease-out forwards',
  },
  // HEADER
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 24px', borderBottom: '1px solid #0d2016',
    background: 'rgba(4,15,6,0.9)', backdropFilter: 'blur(10px)', position: 'relative', zIndex: 10,
  },
  hdrLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  logoText: { fontFamily: "'Rajdhani', sans-serif", fontSize: '1.6rem', fontWeight: 700, color: '#00ff41', letterSpacing: 3, lineHeight: 1.1, textShadow: '0 0 12px rgba(0,255,65,0.4)' },
  logoSub: { fontFamily: "'Share Tech Mono', monospace", fontSize: '0.65rem', color: '#5a9a6e', letterSpacing: 2 },
  hdrCenter: { textAlign: 'center' },
  clock: { fontFamily: "'Share Tech Mono', monospace", fontSize: '1.5rem', color: '#00ff41', textShadow: '0 0 8px rgba(0,255,65,0.4)' },
  locTag: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: "'Share Tech Mono', monospace", fontSize: '0.72rem', color: '#6aaa7e', marginTop: 2, letterSpacing: 1 },
  hdrRight: { textAlign: 'right' },
  sysStatus: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, fontFamily: "'Share Tech Mono', monospace", fontSize: '0.78rem', color: '#00ff41', letterSpacing: 1 },
  weatherTag: { display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'Share Tech Mono', monospace", fontSize: '0.68rem', color: '#6aaa7e', marginTop: 4, justifyContent: 'flex-end' },
  greenPulse: { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#00ff41', animation: 'livePulse 1.5s ease-in-out infinite' },

  // TAB BAR
  tabBar: {
    display: 'flex', gap: 0, borderBottom: '1px solid #0d2016',
    background: 'rgba(4,15,6,0.8)', backdropFilter: 'blur(10px)', position: 'relative', zIndex: 10,
    padding: '0 24px',
  },
  tabBtn: {
    flex: 1, padding: '11px 16px', background: 'none', border: 'none', borderBottom: '2px solid transparent',
    color: '#5a9a6e', fontFamily: "'Rajdhani', sans-serif", fontSize: '0.88rem', fontWeight: 600,
    letterSpacing: 1.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    transition: 'all 0.2s',
  },
  tabActive: {
    color: '#00ff41', borderBottomColor: '#00ff41', textShadow: '0 0 10px rgba(0,255,65,0.4)',
  },

  // MAIN
  main: { flex: 1, padding: '16px 24px', position: 'relative', zIndex: 5, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 },

  // CARDS
  card: {
    background: '#040f06', border: '1px solid #0d2016', borderRadius: 8, padding: '16px 18px',
    transition: 'border-color 0.3s, box-shadow 0.3s',
  },
  cardHead: {
    display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Rajdhani', sans-serif",
    fontSize: '0.95rem', fontWeight: 700, color: '#d4ffd4', letterSpacing: 1.5, marginBottom: 12,
    textTransform: 'uppercase',
  },

  // ALERT BANNER
  alertBanner: {
    background: 'rgba(255,32,32,0.06)', border: '1px solid #ff2020', borderRadius: 6,
    padding: '8px 14px', marginBottom: 16,
    animation: 'criticalPulse 2s ease-in-out infinite',
  },
  alertBannerInner: {
    display: 'flex', alignItems: 'center', gap: 10, color: '#ff2020', overflow: 'hidden',
  },
  ticker: { overflow: 'hidden', flex: 1, whiteSpace: 'nowrap' },
  tickerInner: {
    display: 'inline-block', fontFamily: "'Share Tech Mono', monospace", fontSize: '0.82rem',
    animation: 'tickerScroll 20s linear infinite', letterSpacing: 0.5,
  },

  // STATS ROW
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 },
  statCard: {
    background: '#040f06', border: '1px solid #0d2016', borderRadius: 8, padding: '14px 16px',
  },
  statLabel: { fontFamily: "'Rajdhani', sans-serif", fontSize: '0.75rem', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' },
  statValue: { fontFamily: "'Share Tech Mono', monospace", fontSize: '2.2rem', fontWeight: 700 },

  // OPS GRID
  opsGrid: { display: 'grid', gridTemplateColumns: '1.1fr 1.6fr', gap: 16 },

  // FEED
  feedList: { display: 'flex', flexDirection: 'column', gap: 10, height: 656, overflowY: 'auto', paddingRight: 4 },
  feedCard: {
    background: '#020b04', border: '1px solid #0d2016', borderLeft: '3px solid', borderRadius: 6,
    padding: '12px 14px',
  },
  sevBadge: {
    fontFamily: "'Rajdhani', sans-serif", fontSize: '0.72rem', fontWeight: 700, letterSpacing: 1.5,
    padding: '3px 12px', borderRadius: 4, display: 'inline-flex', alignItems: 'center',
  },
  statusBadge: {
    fontFamily: "'Share Tech Mono', monospace", fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 4,
  },
  feedNode: {
    fontFamily: "'Share Tech Mono', monospace", fontSize: '0.8rem', color: '#d4ffd4',
    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3,
  },
  feedLoc: { color: '#6aaa7e', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.75rem' },
  feedTime: { fontFamily: "'Share Tech Mono', monospace", fontSize: '0.72rem', color: '#6aaa7e', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: 5 },
  tag: {
    fontFamily: "'Exo 2', sans-serif", fontSize: '0.7rem', color: '#c0ffc0',
    background: '#0d201644', border: '1px solid #1a3a28', borderRadius: 10, padding: '3px 10px',
  },

  // NODE GRID
  nodeGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 },
  nodeCard: { background: '#040f06', border: '1px solid #0d2016', borderRadius: 8, padding: '16px' },
  nodeId: { fontFamily: "'Share Tech Mono', monospace", fontSize: '1rem', fontWeight: 700, color: '#00ff41', letterSpacing: 1 },
  nodeStatus: { fontFamily: "'Share Tech Mono', monospace", fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, letterSpacing: 1 },
  nodeDetail: { fontSize: '0.78rem', color: '#6aaa7e', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 },
  barHead: { display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: '#6aaa7e', justifyContent: 'space-between', marginBottom: 3 },
  barTrack: { width: '100%', height: 6, background: '#0d2016', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3, transition: 'width 1.2s ease-out', animation: 'barGrow 1.2s ease-out' },
  nodeDivider: { height: 1, background: '#0d2016', margin: '10px 0' },

  // ABOUT
  aboutHero: {
    display: 'flex', alignItems: 'flex-start', gap: 20,
    background: '#040f06', border: '1px solid #0d2016', borderRadius: 8, padding: '24px',
  },
  archCard: {
    background: '#020b04', border: '1px solid #0d2016', borderRadius: 8, padding: '16px',
    textAlign: 'center',
  },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: 8 },
  tableRow: { borderBottom: '1px solid #0d2016' },
  tableKey: { padding: '10px 12px', fontFamily: "'Share Tech Mono', monospace", fontSize: '0.8rem', color: '#6aaa7e', textAlign: 'left' },
  tableVal: { padding: '10px 12px', fontSize: '0.82rem', color: '#d4ffd4', textAlign: 'right' },

  // FOOTER
  footer: {
    borderTop: '1px solid #0d2016', background: 'rgba(4,15,6,0.9)',
    padding: '6px 0', overflow: 'hidden', position: 'relative', zIndex: 10,
  },
  marquee: { overflow: 'hidden', whiteSpace: 'nowrap' },
  marqueeInner: {
    display: 'inline-block', fontFamily: "'Share Tech Mono', monospace", fontSize: '0.72rem',
    color: '#00ff41', letterSpacing: 1.2, animation: 'marqueeScroll 30s linear infinite',
    textShadow: '0 0 6px rgba(0,255,65,0.3)',
  },
};

export default DashboardPreview;
