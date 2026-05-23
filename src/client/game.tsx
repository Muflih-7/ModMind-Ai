import './index.css';
import { StrictMode, useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { FlaggedItem, SubredditStats } from '../shared/api';

type Tab = 'queue' | 'analytics' | 'history' | 'offenders' | 'settings';
type Offender = { author: string; count: number; removed: number; lastSeen: number; riskLevel: string };
type UserProfile = { author: string; totalFlagged: number; removed: number; approved: number; pending: number; avgScore: number; topViolations: string[]; items: FlaggedItem[]; firstSeen: number; lastSeen: number; riskLevel: string };

const C = {
  bg: '#0d0d0d', surface: '#141414', surface2: '#181818',
  border: '#222', borderLight: '#1a1a1a',
  accent: '#ea580c', accentDim: 'rgba(234,88,12,0.1)', accentBorder: 'rgba(234,88,12,0.2)',
  text: '#e4e4e4', textMuted: '#6b6b6b', textDim: '#3a3a3a',
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e',
  criticalBg: 'rgba(239,68,68,0.08)', highBg: 'rgba(249,115,22,0.08)',
  mediumBg: 'rgba(234,179,8,0.08)', lowBg: 'rgba(34,197,94,0.08)',
};

function sColor(s: string) { return s === 'critical' ? C.critical : s === 'high' ? C.high : s === 'medium' ? C.medium : C.low; }
function sBg(s: string) { return s === 'critical' ? C.criticalBg : s === 'high' ? C.highBg : s === 'medium' ? C.mediumBg : C.lowBg; }
function timeAgo(ts: number) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function formatDate(ts: number) { return ts ? new Date(ts).toLocaleDateString() : 'N/A'; }

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
    const json = await res.json();
    return json.data ?? null;
  } catch { return null; }
}

function useCountUp(target: number) {
  const [v, setV] = useState(0); const prev = useRef(0);
  useEffect(() => {
    const start = prev.current, diff = target - start;
    if (!diff) return;
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - t0) / 600, 1), e = 1 - Math.pow(1 - p, 3);
      setV(Math.round(start + diff * e));
      if (p < 1) requestAnimationFrame(tick); else prev.current = target;
    };
    requestAnimationFrame(tick);
  }, [target]);
  return v;
}

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return <span style={{ color, background: bg, border: `1px solid ${color}25`, borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</span>;
}

function TypeBadge({ type }: { type: string }) {
  const color = type === 'post' ? '#60a5fa' : '#a78bfa';
  return <span style={{ color, background: `${color}15`, border: `1px solid ${color}20`, borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>{type}</span>;
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? C.critical : score >= 45 ? C.high : score >= 20 ? C.medium : C.low;
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(score), 80); return () => clearTimeout(t); }, [score]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 3, background: '#1e1e1e', borderRadius: 2 }}>
        <div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: 12, color, fontWeight: 600, minWidth: 28, textAlign: 'right' }}>{score}</span>
    </div>
  );
}

function StatCard({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  const a = useCountUp(value);
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 18px', flex: 1, minWidth: 80 }}>
      <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: warn && value > 0 ? C.medium : C.text }}>{a}</div>
    </div>
  );
}

function Toggle({ value, onChange, label, description }: { value: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: `1px solid ${C.borderLight}` }}>
      <div>
        <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{description}</div>}
      </div>
      <div onClick={() => onChange(!value)} style={{ width: 40, height: 22, borderRadius: 11, background: value ? C.accent : '#222', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0, marginLeft: 16, border: `1px solid ${value ? C.accent : '#333'}` }}>
        <div style={{ width: 16, height: 16, borderRadius: 8, background: '#fff', position: 'absolute', top: 2, left: value ? 20 : 2, transition: 'left 0.2s' }} />
      </div>
    </div>
  );
}

// User Profile Modal
function UserProfileModal({ author, onClose, onAction }: { author: string; onClose: () => void; onAction: (id: string, action: 'approve' | 'remove' | 'ignore') => void }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<UserProfile>(`/api/user/${author}`).then(p => { setProfile(p); setLoading(false); });
  }, [author]);

  const riskColor = profile?.riskLevel === 'high' ? C.critical : profile?.riskLevel === 'medium' ? C.medium : C.low;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: '100%', maxWidth: 500, maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>u/{author}</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>User profile</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 18, padding: '4px 8px' }}>×</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: C.textMuted, fontSize: 13 }}>Loading profile...</div>
        ) : profile ? (
          <>
            {/* Risk indicator */}
            <div style={{ background: C.bg, border: `1px solid ${riskColor}25`, borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.8 }}>Risk Level</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: riskColor, textTransform: 'capitalize' }}>{profile.riskLevel}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 2 }}>Avg Risk Score</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: riskColor }}>{profile.avgScore}/100</div>
              </div>
            </div>

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
              {[
                { label: 'Flagged', value: profile.totalFlagged },
                { label: 'Removed', value: profile.removed },
                { label: 'Approved', value: profile.approved },
                { label: 'Pending', value: profile.pending },
              ].map((s, i) => (
                <div key={i} style={{ background: C.bg, borderRadius: 8, padding: '10px 12px', border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Timeline */}
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16 }}>
              First seen: <span style={{ color: C.text }}>{formatDate(profile.firstSeen)}</span> · Last seen: <span style={{ color: C.text }}>{formatDate(profile.lastSeen)}</span>
            </div>

            {/* Top violations */}
            {profile.topViolations.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Top Violations</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {profile.topViolations.map((v, i) => (
                    <span key={i} style={{ background: C.criticalBg, color: C.critical, border: `1px solid ${C.critical}25`, borderRadius: 4, padding: '3px 10px', fontSize: 11 }}>{v}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Recent items */}
            {profile.items.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Recent Activity</div>
                {profile.items.map((item, i) => (
                  <div key={i} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 12px', marginBottom: 6 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <TypeBadge type={item.type} />
                      <Badge label={item.severity} color={sColor(item.severity)} bg={sBg(item.severity)} />
                      <span style={{ fontSize: 11, color: C.textDim, marginLeft: 'auto' }}>{timeAgo(item.timestamp)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.content.slice(0, 70)}</div>
                    {item.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button onClick={() => onAction(item.id, 'approve')} style={{ flex: 1, padding: '5px 0', borderRadius: 5, border: `1px solid rgba(34,197,94,0.3)`, background: 'rgba(34,197,94,0.08)', color: C.low, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Approve</button>
                        <button onClick={() => onAction(item.id, 'remove')} style={{ flex: 1, padding: '5px 0', borderRadius: 5, border: `1px solid rgba(239,68,68,0.3)`, background: 'rgba(239,68,68,0.08)', color: C.critical, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Remove</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0', color: C.textMuted }}>No data found</div>
        )}
      </div>
    </div>
  );
}

function QueueRow({ item, onAction, onUserClick, autoFlag, selected, onSelect }: {
  item: FlaggedItem;
  onAction: (id: string, action: 'approve' | 'remove' | 'ignore') => void;
  onUserClick: (author: string) => void;
  autoFlag: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState(false);
  const [similar, setSimilar] = useState<FlaggedItem[]>([]);

  async function act(action: 'approve' | 'remove' | 'ignore') {
    setActing(true); await onAction(item.id, action); setActing(false);
  }

  async function loadSimilar() {
    if (similar.length > 0) return;
    const data = await apiFetch<FlaggedItem[]>(`/api/similar/${item.id}`);
    if (data) setSimilar(data);
  }

  useEffect(() => { if (expanded) loadSimilar(); }, [expanded]);

  const isEscalated = item.severity !== (item.score >= 70 ? 'critical' : item.score >= 45 ? 'high' : item.score >= 20 ? 'medium' : 'low');

  return (
    <div style={{ background: selected ? '#1a1a1a' : C.surface, border: `1px solid ${selected ? C.accent + '40' : expanded ? C.border : C.borderLight}`, borderLeft: `2px solid ${sColor(item.severity)}`, borderRadius: 8, marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
        {/* Checkbox */}
        <div onClick={() => onSelect(item.id)} style={{ width: 16, height: 16, borderRadius: 3, border: `1px solid ${selected ? C.accent : C.border}`, background: selected ? C.accent : 'transparent', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {selected && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
        </div>

        <div onClick={() => setExpanded(!expanded)} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, cursor: 'pointer', overflow: 'hidden' }}>
          <TypeBadge type={item.type} />
          <Badge label={item.severity} color={sColor(item.severity)} bg={sBg(item.severity)} />
          {isEscalated && <Badge label="escalated" color={C.medium} bg={C.mediumBg} />}
          {autoFlag && item.score >= 90 && <Badge label="auto-flagged" color={C.accent} bg={C.accentDim} />}
          <span style={{ flex: 1, color: C.text, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.content.slice(0, 70)}{item.content.length > 70 ? '...' : ''}
          </span>
        </div>

        <button onClick={() => onUserClick(item.author)} style={{ background: 'none', border: 'none', color: C.accent, fontSize: 12, cursor: 'pointer', padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
          u/{item.author}
        </button>
        <span style={{ color: C.textDim, fontSize: 11, flexShrink: 0 }}>{timeAgo(item.timestamp)}</span>
        <span onClick={() => setExpanded(!expanded)} style={{ color: C.textDim, fontSize: 12, cursor: 'pointer', marginLeft: 4 }}>{expanded ? '↑' : '↓'}</span>
      </div>

      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${C.borderLight}` }}>
          {/* Full content */}
          <div style={{ padding: '12px 14px', background: '#111', borderRadius: 6, margin: '12px 0', fontSize: 13, color: '#aaa', lineHeight: 1.6, fontStyle: 'italic' }}>
            "{item.content}"
          </div>

          {/* Score */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.8 }}>Risk Score</span>
              <span style={{ fontSize: 11, color: C.textMuted }}>Confidence {Math.min(95, 60 + Math.floor(item.score / 4))}%</span>
            </div>
            <ScoreBar score={item.score} />
          </div>

          {/* AI Explanation */}
          {item.explanation && (
            <div style={{ background: C.accentDim, border: `1px solid ${C.accentBorder}`, borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#ccc', lineHeight: 1.6 }}>
              <span style={{ fontSize: 10, color: C.accent, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 4 }}>AI Analysis</span>
              {item.explanation}
            </div>
          )}

          {/* Reasons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {item.reasons.map((r, i) => (
              <span key={i} style={{ background: '#1a1a1a', color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 4, padding: '3px 10px', fontSize: 11 }}>{r}</span>
            ))}
          </div>

          {/* Similar content */}
          {similar.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                Similar removed content ({similar.length})
              </div>
              {similar.map((s, i) => (
                <div key={i} style={{ background: '#111', borderRadius: 5, padding: '8px 10px', marginBottom: 4, fontSize: 11, color: C.textMuted, borderLeft: `2px solid ${C.critical}` }}>
                  <span style={{ color: C.textDim, marginRight: 6 }}>u/{s.author}</span>{s.content.slice(0, 60)}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => act('approve')} disabled={acting} style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: `1px solid rgba(34,197,94,0.3)`, background: 'rgba(34,197,94,0.08)', color: C.low, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Approve</button>
            <button onClick={() => act('remove')} disabled={acting} style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: `1px solid rgba(239,68,68,0.3)`, background: 'rgba(239,68,68,0.08)', color: C.critical, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Remove</button>
            <button onClick={() => act('ignore')} disabled={acting} style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.textMuted, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Ignore</button>
            <a href={item.permalink} target="_blank" rel="noreferrer" style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.textMuted, fontSize: 12, textDecoration: 'none' }}>↗</a>
          </div>
        </div>
      )}
    </div>
  );
}

function Bar({ label, count, max }: { label: string; count: number; max: number }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(max > 0 ? (count / max) * 100 : 0), 150); return () => clearTimeout(t); }, [count, max]);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: C.textMuted }}>{label}</span>
        <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{count}</span>
      </div>
      <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2 }}>
        <div style={{ width: `${w}%`, height: '100%', background: C.accent, borderRadius: 2, transition: 'width 0.7s ease' }} />
      </div>
    </div>
  );
}

function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const steps = [
    { title: 'ModMind AI', subtitle: 'Moderation Intelligence Platform', desc: 'Automated content detection, queue management, and community health monitoring for Reddit moderators.' },
    { title: 'Real-time Detection', subtitle: 'Every post. Every comment.', desc: 'ModMind scans all incoming content using a multi-layer analysis engine — keyword scoring, pattern matching, and behavioral signals.' },
    { title: 'Actionable Queue', subtitle: 'Review, approve, remove.', desc: 'Flagged content is prioritized by risk score. Take action in seconds with full context — no tab switching required.' },
    { title: 'User Intelligence', subtitle: 'Know your offenders.', desc: 'Click any username to see their full history, risk level, violation patterns, and take bulk action on repeat offenders.' },
    { title: 'Ready to go', subtitle: 'Your community is protected.', desc: 'Use Simulate to test the system, or install on a live subreddit to start catching real violations automatically.' },
  ];
  const s = steps[step];
  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: 400, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 48 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>ModMind</span>
          <span style={{ fontSize: 14, color: C.accent }}>AI</span>
        </div>
        <div style={{ fontSize: 10, color: C.accent, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>{s.subtitle}</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: C.text, marginBottom: 16, lineHeight: 1.2 }}>{s.title}</h1>
        <p style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.8, marginBottom: 48 }}>{s.desc}</p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 32 }}>
          {steps.map((_, i) => <div key={i} style={{ height: 2, flex: i === step ? 2 : 1, background: i <= step ? C.accent : '#222', borderRadius: 1, transition: 'all 0.3s' }} />)}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {step > 0 && <button onClick={() => setStep(step - 1)} style={{ padding: '10px 20px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.textMuted, cursor: 'pointer', fontSize: 13 }}>Back</button>}
          <button onClick={() => step < steps.length - 1 ? setStep(step + 1) : onDone()} style={{ flex: 1, padding: '10px 0', borderRadius: 6, border: 'none', background: C.accent, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {step < steps.length - 1 ? 'Continue' : 'Get started'}
          </button>
        </div>
      </div>
    </div>
  );
}

const App = () => {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [tab, setTab] = useState<Tab>('queue');
  const [queue, setQueue] = useState<FlaggedItem[]>([]);
  const [history, setHistory] = useState<FlaggedItem[]>([]);
  const [stats, setStats] = useState<SubredditStats | null>(null);
  const [offenders, setOffenders] = useState<Offender[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [profileUser, setProfileUser] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [autoFlag, setAutoFlag] = useState(false);
  const [autoThreshold, setAutoThreshold] = useState(90);
  const [showLowRisk, setShowLowRisk] = useState(true);
  const [customKeywords, setCustomKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem('modmind_v3_seen');
    if (!seen) setShowOnboarding(true);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'q') setTab('queue');
      if (e.key === 'a') setTab('analytics');
      if (e.key === 'h') setTab('history');
      if (e.key === 'o') setTab('offenders');
      if (e.key === 's') setTab('settings');
      if (e.key === 'r') loadData();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [q, s, h, o] = await Promise.all([
      apiFetch<FlaggedItem[]>('/api/queue'),
      apiFetch<SubredditStats>('/api/stats'),
      apiFetch<FlaggedItem[]>('/api/all'),
      apiFetch<Offender[]>('/api/offenders'),
    ]);
    if (q) setQueue(showLowRisk ? q : q.filter(i => i.score >= 45));
    if (s) setStats(s);
    if (h) setHistory(h.filter(i => i.status !== 'pending'));
    if (o) setOffenders(o);
    setLastRefresh(Date.now());
    setLoading(false);
  }, [showLowRisk]);

  useEffect(() => {
    if (!showOnboarding) {
      loadData();
      const t = setInterval(loadData, 30000);
      return () => clearInterval(t);
    }
  }, [loadData, showOnboarding]);

  async function handleAction(id: string, action: 'approve' | 'remove' | 'ignore') {
    await apiFetch('/api/action', { method: 'POST', body: JSON.stringify({ itemId: id, action }) });
    await loadData();
    if (profileUser) setProfileUser(null);
  }

  async function handleBulkAction(action: 'approve' | 'remove') {
    if (selectedItems.size === 0) return;
    await apiFetch('/api/bulk-action', { method: 'POST', body: JSON.stringify({ action, itemIds: Array.from(selectedItems) }) });
    setSelectedItems(new Set());
    await loadData();
  }

  async function simulate() {
    setScanning(true);
    const items = [
      { id: 'sim_1', type: 'post', author: 'suspicious_user99', content: 'BUY NOW click here FREE MONEY make $500 guaranteed!!!', permalink: 'https://reddit.com/r/test/1' },
      { id: 'sim_2', type: 'comment', author: 'spammer_bot', content: 'Visit my profile dm me limited offer 100% free www.scam.com', permalink: 'https://reddit.com/r/test/2' },
      { id: 'sim_3', type: 'post', author: 'hate_account', content: 'I hate all those stupid idiots they are trash and should die', permalink: 'https://reddit.com/r/test/3' },
      { id: 'sim_4', type: 'comment', author: 'new_user_2026', content: 'AAAAAAAAAAAAA spam spam spam kill everyone moron', permalink: 'https://reddit.com/r/test/4' },
      { id: 'sim_5', type: 'post', author: 'mild_user', content: 'Anyone know where to buy cheap stuff online? buy now!', permalink: 'https://reddit.com/r/test/5' },
      { id: 'sim_6', type: 'comment', author: 'suspicious_user99', content: 'CLICK HERE guaranteed free money scam bot fraud', permalink: 'https://reddit.com/r/test/6' },
      { id: 'sim_7', type: 'post', author: 'spammer_bot', content: 'Make $999 daily!! dm me now limited offer click here www.spam.com', permalink: 'https://reddit.com/r/test/7' },
    ];
    for (const item of items) {
      await apiFetch('/api/analyze', { method: 'POST', body: JSON.stringify({ ...item, customKeywords }) });
    }
    await loadData();
    setScanning(false);
  }

  async function clearData() {
    setClearing(true);
    await apiFetch('/api/clear', { method: 'DELETE' });
    setSelectedItems(new Set());
    await loadData();
    setClearing(false);
  }

  function toggleSelect(id: string) {
    setSelectedItems(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selectedItems.size === filteredQueue.length) setSelectedItems(new Set());
    else setSelectedItems(new Set(filteredQueue.map(i => i.id)));
  }

  if (showOnboarding) return <Onboarding onDone={() => { localStorage.setItem('modmind_v3_seen', '1'); setShowOnboarding(false); }} />;

  const healthScore = stats ? Math.max(0, 100 - Math.round((stats.pendingCount / Math.max(stats.totalFlagged, 1)) * 100)) : 100;
  const healthColor = healthScore >= 80 ? C.low : healthScore >= 50 ? C.medium : C.critical;

  const filteredQueue = queue.filter(item => {
    const matchSearch = !searchQuery || item.content.toLowerCase().includes(searchQuery.toLowerCase()) || item.author.toLowerCase().includes(searchQuery.toLowerCase());
    const matchSeverity = filterSeverity === 'all' || item.severity === filterSeverity;
    return matchSearch && matchSeverity;
  });

  const allItems = [...queue, ...history];

  const tabBtn = (t: Tab, label: string, shortcut: string) => (
    <button onClick={() => setTab(t)} title={`Shortcut: ${shortcut}`} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: tab === t ? '#1e1e1e' : 'transparent', color: tab === t ? C.text : C.textMuted, cursor: 'pointer', fontSize: 12, fontWeight: tab === t ? 600 : 400, transition: 'all 0.15s' }}>{label}</button>
  );

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column' }}>

      {profileUser && <UserProfileModal author={profileUser} onClose={() => setProfileUser(null)} onAction={async (id, action) => { await handleAction(id, action); }} />}

      {/* Top bar */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '0 20px', display: 'flex', alignItems: 'center', height: 52, gap: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>ModMind</span>
          <span style={{ fontSize: 13, color: C.accent }}>AI</span>
        </div>
        <div style={{ height: 20, width: 1, background: C.border }} />
        <div style={{ display: 'flex', gap: 2 }}>
          {tabBtn('queue', `Queue${queue.length > 0 ? ` (${queue.length})` : ''}`, 'Q')}
          {tabBtn('analytics', 'Analytics', 'A')}
          {tabBtn('history', 'History', 'H')}
          {tabBtn('offenders', `Offenders${offenders.length > 0 ? ` (${offenders.length})` : ''}`, 'O')}
          {tabBtn('settings', 'Settings', 'S')}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: healthColor }} />
          <span style={{ fontSize: 12, color: C.textMuted }}>Health <span style={{ color: healthColor, fontWeight: 600 }}>{healthScore}%</span></span>
        </div>
        {stats?.pendingCount ? <span style={{ fontSize: 12, color: C.critical, fontWeight: 600 }}>{stats.pendingCount} pending</span> : null}
        <button onClick={simulate} disabled={scanning} style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${C.accentBorder}`, background: C.accentDim, color: C.accent, cursor: scanning ? 'default' : 'pointer', fontSize: 12, fontWeight: 600, opacity: scanning ? 0.6 : 1 }}>
          {scanning ? 'Scanning...' : 'Simulate scan'}
        </button>
        <button onClick={loadData} title="Refresh (R)" style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.textMuted, cursor: 'pointer', fontSize: 13 }}>↻</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>

        {/* Stat cards */}
        {stats && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <StatCard label="Flagged" value={stats.totalFlagged} />
            <StatCard label="Pending" value={stats.pendingCount} warn />
            <StatCard label="Removed" value={stats.totalRemoved} />
            <StatCard label="Approved" value={stats.totalApproved} />
            <StatCard label="Offenders" value={offenders.length} warn />
          </div>
        )}

        {loading && <div style={{ textAlign: 'center', padding: '80px 0', color: C.textDim, fontSize: 13 }}>Loading...</div>}

        {/* Queue */}
        {!loading && tab === 'queue' && (
          <div>
            {/* Search + filter bar */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search content or username..."
                style={{ flex: 1, padding: '7px 12px', borderRadius: 6, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, outline: 'none' }}
              />
              <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} style={{ padding: '7px 10px', borderRadius: 6, background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
                <option value="all">All severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            {filteredQueue.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 20px', border: `1px dashed ${C.border}`, borderRadius: 10 }}>
                <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 6 }}>{searchQuery || filterSeverity !== 'all' ? 'No results match your filter' : 'Queue is empty'}</div>
                <div style={{ fontSize: 12, color: C.textDim }}>{searchQuery || filterSeverity !== 'all' ? 'Try adjusting your search or filter' : 'Run a simulate scan or wait for real content'}</div>
              </div>
            ) : (
              <>
                {/* Bulk actions bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: C.textMuted, cursor: 'pointer' }} onClick={selectAll}>
                    {selectedItems.size === filteredQueue.length && filteredQueue.length > 0 ? 'Deselect all' : `Select all (${filteredQueue.length})`}
                  </span>
                  {selectedItems.size > 0 && (
                    <>
                      <span style={{ fontSize: 12, color: C.textDim }}>·</span>
                      <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{selectedItems.size} selected</span>
                      <button onClick={() => handleBulkAction('approve')} style={{ padding: '4px 12px', borderRadius: 5, border: `1px solid rgba(34,197,94,0.3)`, background: 'rgba(34,197,94,0.08)', color: C.low, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Approve all</button>
                      <button onClick={() => handleBulkAction('remove')} style={{ padding: '4px 12px', borderRadius: 5, border: `1px solid rgba(239,68,68,0.3)`, background: 'rgba(239,68,68,0.08)', color: C.critical, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Remove all</button>
                      <button onClick={() => setSelectedItems(new Set())} style={{ padding: '4px 12px', borderRadius: 5, border: `1px solid ${C.border}`, background: 'transparent', color: C.textMuted, cursor: 'pointer', fontSize: 11 }}>Clear</button>
                    </>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: C.textDim }}>{filteredQueue.length} item{filteredQueue.length !== 1 ? 's' : ''} · sorted by risk score</span>
                </div>

                {filteredQueue.map(item => (
                  <QueueRow key={item.id} item={item} onAction={handleAction} onUserClick={setProfileUser} autoFlag={autoFlag} selected={selectedItems.has(item.id)} onSelect={toggleSelect} />
                ))}
              </>
            )}
          </div>
        )}

        {/* Analytics */}
        {!loading && tab === 'analytics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {!stats || stats.totalFlagged === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 20px', border: `1px dashed ${C.border}`, borderRadius: 10 }}>
                <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 6 }}>No analytics data</div>
                <div style={{ fontSize: 12, color: C.textDim }}>Run a simulate scan to generate data</div>
              </div>
            ) : (
              <>
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
                  <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>Overview</div>
                  <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Health Score', value: `${healthScore}%`, color: healthColor },
                      { label: 'Approval Rate', value: `${Math.round((stats.totalApproved / stats.totalFlagged) * 100)}%`, color: C.low },
                      { label: 'Removal Rate', value: `${Math.round((stats.totalRemoved / stats.totalFlagged) * 100)}%`, color: C.critical },
                      { label: 'Repeat Offenders', value: `${offenders.length}`, color: offenders.length > 0 ? C.medium : C.text },
                    ].map((m, i) => (
                      <div key={i}>
                        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>{m.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: m.color }}>{m.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {stats.topOffenses.length > 0 && (
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>Violation Breakdown</div>
                    {stats.topOffenses.map((o, i) => <Bar key={i} label={o.label} count={o.count} max={stats.topOffenses[0].count} />)}
                  </div>
                )}

                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
                  <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>Severity Distribution</div>
                  {(['critical', 'high', 'medium', 'low'] as const).map(sev => {
                    const count = allItems.filter(i => i.severity === sev).length;
                    const pct = allItems.length > 0 ? Math.round((count / allItems.length) * 100) : 0;
                    return (
                      <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <Badge label={sev} color={sColor(sev)} bg={sBg(sev)} />
                        <div style={{ flex: 1, height: 3, background: '#1a1a1a', borderRadius: 2 }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: sColor(sev), borderRadius: 2, transition: 'width 0.6s ease' }} />
                        </div>
                        <span style={{ fontSize: 12, color: C.textMuted, minWidth: 60, textAlign: 'right' }}>{count} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* History */}
        {!loading && tab === 'history' && (
          <div>
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 20px', border: `1px dashed ${C.border}`, borderRadius: 10 }}>
                <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 6 }}>No history</div>
                <div style={{ fontSize: 12, color: C.textDim }}>Actioned items appear here</div>
              </div>
            ) : (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 12, padding: '10px 14px', borderBottom: `1px solid ${C.border}`, background: '#111' }}>
                  <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, flex: 1 }}>CONTENT</span>
                  <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, width: 90 }}>AUTHOR</span>
                  <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, width: 70 }}>SEVERITY</span>
                  <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, width: 60 }}>STATUS</span>
                  <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, width: 60, textAlign: 'right' }}>TIME</span>
                </div>
                {history.map((item, i) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: i < history.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}>
                    <span style={{ flex: 1, fontSize: 12, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.content.slice(0, 60)}</span>
                    <button onClick={() => setProfileUser(item.author)} style={{ background: 'none', border: 'none', color: C.accent, fontSize: 12, cursor: 'pointer', width: 90, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>u/{item.author}</button>
                    <span style={{ width: 70 }}><Badge label={item.severity} color={sColor(item.severity)} bg={sBg(item.severity)} /></span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: item.status === 'approved' ? C.low : C.critical, width: 60, textTransform: 'uppercase' }}>{item.status}</span>
                    <span style={{ fontSize: 11, color: C.textDim, width: 60, textAlign: 'right' }}>{timeAgo(item.timestamp)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Offenders */}
        {!loading && tab === 'offenders' && (
          <div>
            {offenders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 20px', border: `1px dashed ${C.border}`, borderRadius: 10 }}>
                <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 6 }}>No repeat offenders detected</div>
                <div style={{ fontSize: 12, color: C.textDim }}>Users flagged 2+ times appear here</div>
              </div>
            ) : (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 12, padding: '10px 14px', borderBottom: `1px solid ${C.border}`, background: '#111' }}>
                  <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, flex: 1 }}>USER</span>
                  <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, width: 60, textAlign: 'center' }}>RISK</span>
                  <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, width: 60, textAlign: 'center' }}>FLAGS</span>
                  <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, width: 70, textAlign: 'center' }}>REMOVED</span>
                  <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, width: 100 }}>REMOVAL RATE</span>
                  <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, width: 60, textAlign: 'right' }}>LAST SEEN</span>
                </div>
                {offenders.map((o, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: i < offenders.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}>
                    <button onClick={() => setProfileUser(o.author)} style={{ flex: 1, background: 'none', border: 'none', color: C.accent, fontSize: 13, cursor: 'pointer', textAlign: 'left', fontWeight: 500 }}>u/{o.author}</button>
                    <span style={{ width: 60, textAlign: 'center' }}><Badge label={o.riskLevel} color={o.riskLevel === 'high' ? C.critical : o.riskLevel === 'medium' ? C.medium : C.low} bg={o.riskLevel === 'high' ? C.criticalBg : o.riskLevel === 'medium' ? C.mediumBg : C.lowBg} /></span>
                    <span style={{ width: 60, textAlign: 'center', fontSize: 13, fontWeight: 700, color: o.count >= 3 ? C.critical : C.medium }}>{o.count}</span>
                    <span style={{ width: 70, textAlign: 'center', fontSize: 13, color: C.textMuted }}>{o.removed}</span>
                    <div style={{ width: 100, height: 3, background: '#1a1a1a', borderRadius: 2 }}>
                      <div style={{ width: `${(o.removed / o.count) * 100}%`, height: '100%', background: C.critical, borderRadius: 2 }} />
                    </div>
                    <span style={{ width: 60, textAlign: 'right', fontSize: 11, color: C.textDim }}>{timeAgo(o.lastSeen)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settings */}
        {!loading && tab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Automation</div>
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 16 }}>Configure automatic moderation behavior</div>
              <Toggle value={autoFlag} onChange={setAutoFlag} label="Auto-flag high-risk content" description="Mark items above threshold for immediate attention" />
              <Toggle value={showLowRisk} onChange={setShowLowRisk} label="Show low-risk items" description="Display items with risk score below 45" />
              {autoFlag && (
                <div style={{ marginTop: 16, padding: 14, background: '#111', borderRadius: 8, border: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: C.textMuted }}>Auto-flag threshold</span>
                    <span style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>{autoThreshold}/100</span>
                  </div>
                  <input type="range" min={50} max={100} value={autoThreshold} onChange={e => setAutoThreshold(Number(e.target.value))} style={{ width: '100%', accentColor: C.accent }} />
                </div>
              )}
            </div>

            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Custom Keywords</div>
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 16 }}>Add subreddit-specific banned terms</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input value={newKeyword} onChange={e => setNewKeyword(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newKeyword.trim()) { setCustomKeywords([...customKeywords, newKeyword.trim().toLowerCase()]); setNewKeyword(''); } }} placeholder="Enter keyword and press Enter" style={{ flex: 1, padding: '8px 12px', borderRadius: 6, background: '#111', border: `1px solid ${C.border}`, color: C.text, fontSize: 12, outline: 'none' }} />
                <button onClick={() => { if (newKeyword.trim()) { setCustomKeywords([...customKeywords, newKeyword.trim().toLowerCase()]); setNewKeyword(''); } }} style={{ padding: '8px 14px', borderRadius: 6, border: `1px solid ${C.accentBorder}`, background: C.accentDim, color: C.accent, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Add</button>
              </div>
              {customKeywords.length === 0 ? (
                <div style={{ fontSize: 12, color: C.textDim, padding: '12px 0' }}>No custom keywords defined</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {customKeywords.map((kw, i) => (
                    <span key={i} style={{ background: '#111', color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 4, padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {kw}<span onClick={() => setCustomKeywords(customKeywords.filter((_, j) => j !== i))} style={{ cursor: 'pointer', color: C.critical, fontWeight: 700, fontSize: 14, lineHeight: 1 }}>×</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Keyboard Shortcuts</div>
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 16 }}>Navigate faster without a mouse</div>
              {[['Q', 'Queue tab'], ['A', 'Analytics tab'], ['H', 'History tab'], ['O', 'Offenders tab'], ['S', 'Settings tab'], ['R', 'Refresh data']].map(([key, label]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.borderLight}` }}>
                  <span style={{ fontSize: 12, color: C.textMuted }}>{label}</span>
                  <kbd style={{ background: '#1a1a1a', border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 8px', fontSize: 11, color: C.text, fontFamily: 'monospace' }}>{key}</kbd>
                </div>
              ))}
            </div>

            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Data Management</div>
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 16 }}>Reset all stored moderation data</div>
              <button onClick={clearData} disabled={clearing} style={{ padding: '8px 16px', borderRadius: 6, border: `1px solid rgba(239,68,68,0.3)`, background: 'rgba(239,68,68,0.08)', color: C.critical, cursor: clearing ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, opacity: clearing ? 0.6 : 1 }}>
                {clearing ? 'Clearing...' : 'Clear all data'}
              </button>
            </div>

            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>ModMind AI</div>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16 }}>v1.0.0 — Moderation Intelligence Platform</div>
              <button onClick={() => setShowOnboarding(true)} style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.textMuted, cursor: 'pointer', fontSize: 12 }}>View onboarding</button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{ borderTop: `1px solid ${C.border}`, padding: '8px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: C.textDim }}>ModMind AI — Moderation Intelligence Platform</span>
        <span style={{ fontSize: 11, color: C.textDim }}>Updated {new Date(lastRefresh).toLocaleTimeString()} · auto-refresh 30s</span>
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>
);