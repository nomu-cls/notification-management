import { useState, useEffect } from 'react';
import { Bell, CheckSquare, Database, Send, Save, Calendar, Clock, Copy, FileText, Users, ArrowUp, ArrowDown, Settings, BookOpen, Link, Lock, LogIn } from 'lucide-react';
import { db } from './lib/firebase';
import { doc, getDoc, setDoc, collection, getDocs, addDoc, deleteDoc } from 'firebase/firestore';
import TaskFilterSettings from './components/TaskFilterSettings'; // [NEW]

// --- Constants ---
const DEFAULT_TEMPLATE = "【新着通知】\n項目：{内容}\n担当：{担当者}\nご確認お願いします。";

const TIME_SLOTS = [
  { start: '10:00', end: '12:00' },
  { start: '13:00', end: '15:00' },
  { start: '16:00', end: '18:00' },
  { start: '20:00', end: '22:00' },
  { start: '21:00', end: '23:00' }
];

const DAYS_JP = ['日', '月', '火', '水', '木', '金', '土'];


// --- Login Component ---
function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // Simple password check against environment variable
    // In production, this should preferably be more secure, but for this use case it provides basic protection
    // independent of Vercel auth.
    const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD || 'admin123';

    if (password === adminPassword) {
      onLogin();
    } else {
      setError('パスワードが間違っています');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-100 w-full max-w-sm">
        <div className="flex justify-center mb-6 text-blue-600">
          <div className="bg-blue-50 p-3 rounded-full">
            <Lock size={32} />
          </div>
        </div>
        <h2 className="text-xl font-bold text-center text-slate-800 mb-6">管理者ログイン</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="パスワードを入力"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
              autoFocus
            />
          </div>
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <LogIn size={18} />
            ログイン
          </button>
        </form>
        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400">Notification Management System</p>
        </div>
      </div>
    </div>
  );
}


function AssignmentViewer() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const parts = window.location.pathname.split('/');
    const id = decodeURIComponent(parts[parts.length - 1]); // hash or email
    const searchParams = new URLSearchParams(window.location.search);
    const promotionId = searchParams.get('promotionId');

    async function fetchData() {
      try {
        const url = `/api/viewer/data?id=${encodeURIComponent(id)}${promotionId ? `&promotionId=${encodeURIComponent(promotionId)}` : ''}`;
        const res = await fetch(url);
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to fetch data');
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">読み込み中...</div>;
  if (error) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-red-100 text-center">
        <div className="text-red-500 text-4xl mb-4">⚠️</div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">データの取得に失敗しました</h2>
        <p className="text-slate-500 text-sm mb-6">{error}</p>
        <button onClick={() => window.location.reload()} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-md text-sm transition-all">
          再試行
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
        <div className="bg-gradient-to-br from-indigo-600 to-blue-500 p-8 text-white relative">
          <div className="relative z-10">
            <h1 className="text-2xl font-bold mb-1">{data.userName} 様</h1>
            <p className="opacity-80 text-sm">課題提出状況</p>
          </div>
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <CheckSquare size={120} />
          </div>
        </div>

        <div className="p-6">
          <div className="space-y-3">
            {data.assignments.map((a, i) => (
              <div key={i} className="bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-200 transition-all overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 bg-white border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${a.submitted ? 'bg-green-100 text-green-600' : 'bg-slate-200 text-slate-400'}`}>
                      <FileText size={20} />
                    </div>
                    <span className="font-medium text-slate-700">{a.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.submitted ? (
                      <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded">提出済み ✓</span>
                    ) : (
                      <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">未提出</span>
                    )}
                  </div>
                </div>

                {/* Details */}
                {a.submitted && a.details && a.details.length > 0 && (
                  <div className="p-4 bg-slate-50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {a.details.map((item, idx) => (
                        <div key={idx} className="text-sm">
                          <div className="text-xs text-slate-400 font-medium mb-1 truncate" title={item.label}>{item.label}</div>
                          <div className="text-slate-700 bg-slate-100/50 p-2.5 rounded-lg whitespace-pre-wrap leading-relaxed">
                            {item.value || '-'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {data.assignments.length === 0 && (
              <div className="text-center py-8 text-slate-400 italic text-sm">
                課題が登録されていません
              </div>
            )}
          </div>
        </div>

        <div className="bg-slate-50 p-4 text-center border-t border-slate-200">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest">Notification Management System</p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const isViewer = window.location.pathname.startsWith('/viewer/');

  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    // Check local storage for existing session
    const storedAuth = localStorage.getItem('adminAuthenticated');
    if (storedAuth === 'true') {
      setIsAuthenticated(true);
    }
    setAuthChecked(true);
  }, []);

  const handleLogin = () => {
    setIsAuthenticated(true);
    localStorage.setItem('adminAuthenticated', 'true');
  };

  // authChecked is checked later to satisfy Hook Rules




  const [config, setConfig] = useState({
    spreadsheetId: '',
    staffListSheet: '',
    bookingListSheet: '',
    staffChatSheet: '',
    chatworkToken: '',
    roomId: '',
    // Default mapping: A=No(Empty), B=Date, C=Name, D=Kana, E=Mail, F=Phone, G=Fee, H=Consultant, I=Staff(Empty), J=Zoom
    bookingColumnMapping: [
      '', // A: No (Empty for ArrayFormula)
      '{dateTime}',
      '{clientName}',
      '{allFields.カナ}',
      '{email}',
      '{allFields.Phone}',
      '',
      '{staff}',
      '',
      '{allFields.Zoom}'
    ],
    messageTemplate: DEFAULT_TEMPLATE,
    selectedColumns: [],
    taskColumn: '',
    assigneeColumn: '',

    // Universal Config
    notificationRules: [],

    // Deprecated but kept for safe transitions or simple fallbacks in legacy code?
    applicationRoomA: '',
    applicationRoomB: '',
    applicationTemplateA: '',
    applicationTemplateB: '',
    taskAssigneeIds: [],
    workshopReportRoom: '',
    workshopTemplate: '',

    // Case 4
    reminderTemplate: '',

    // Case 5
    assignmentViewer: {
      questionnaire: { ssId: '', sheetName: '' },
      assignments: []
    },

    // Admin Error Notification
    adminChatworkToken: '',
    adminChatworkRoomId: ''
  });

  const [activeTab, setActiveTab] = useState('general');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');

  // Multi-Promotion Management
  const [promotions, setPromotions] = useState([]);
  const [currentPromotionId, setCurrentPromotionId] = useState(null);
  const [showPromotionMenu, setShowPromotionMenu] = useState(false);
  const [newPromotionName, setNewPromotionName] = useState('');
  const [showNewPromotionModal, setShowNewPromotionModal] = useState(false);
  const [duplicateMode, setDuplicateMode] = useState(false);

  // Case 6: Time Slot Generator
  const [slotStartDate, setSlotStartDate] = useState('');
  const [slotEndDate, setSlotEndDate] = useState('');
  const [generatedSlots, setGeneratedSlots] = useState('');

  // Load promotions list and config
  useEffect(() => {
    async function loadPromotionsAndConfig() {
      try {
        // 1. Fetch all promotions
        const promoSnapshot = await getDocs(collection(db, 'promotions'));
        const promoList = promoSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setPromotions(promoList);

        // 2. Determine which promotion to load
        let targetId = null;
        if (promoList.length > 0) {
          // Use first promotion or saved preference
          const savedId = localStorage.getItem('currentPromotionId');
          targetId = promoList.find(p => p.id === savedId) ? savedId : promoList[0].id;
        }

        // 3. Load config
        if (targetId) {
          setCurrentPromotionId(targetId);
          const promoDoc = await getDoc(doc(db, 'promotions', targetId));
          if (promoDoc.exists()) {
            const data = promoDoc.data().config || promoDoc.data();
            if (data.notificationRules) {
              data.notificationRules = data.notificationRules.filter(r => r && r.id);
            }
            setConfig(prev => ({ ...prev, ...data }));
          }
        } else {
          // Fallback to legacy
          const legacyDoc = await getDoc(doc(db, 'notification_config', 'main'));
          if (legacyDoc.exists()) {
            const data = legacyDoc.data();
            if (data.notificationRules) {
              data.notificationRules = data.notificationRules.filter(r => r && r.id);
            }
            setConfig(prev => ({ ...prev, ...data }));
            setCurrentPromotionId('_legacy');
          }
        }
      } catch (error) {
        console.error('Failed to load:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadPromotionsAndConfig();
  }, []);

  // Switch promotion
  const switchPromotion = async (promoId) => {
    setIsLoading(true);
    setShowPromotionMenu(false);
    try {
      if (promoId === '_legacy') {
        const legacyDoc = await getDoc(doc(db, 'notification_config', 'main'));
        if (legacyDoc.exists()) {
          setConfig(legacyDoc.data());
        }
      } else {
        const promoDoc = await getDoc(doc(db, 'promotions', promoId));
        if (promoDoc.exists()) {
          const data = promoDoc.data().config || promoDoc.data();
          setConfig(data);
        }
      }
      setCurrentPromotionId(promoId);
      localStorage.setItem('currentPromotionId', promoId);
    } catch (error) {
      console.error('Switch failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Create/Duplicate promotion
  const createPromotion = async () => {
    if (!newPromotionName.trim()) return;
    try {
      const newPromoData = {
        name: newPromotionName.trim(),
        createdAt: new Date().toISOString(),
        config: duplicateMode ? { ...config } : {}
      };
      const docRef = await addDoc(collection(db, 'promotions'), newPromoData);
      setPromotions(prev => [...prev, { id: docRef.id, ...newPromoData }]);
      setShowNewPromotionModal(false);
      setNewPromotionName('');
      setDuplicateMode(false);
      switchPromotion(docRef.id);
    } catch (error) {
      alert('作成に失敗しました: ' + error.message);
    }
  };

  // Migrate legacy config to new promotion
  const migrateFromLegacy = async () => {
    const name = prompt('レガシー設定を新しいプロモーションにコピーします。\nプロモーション名を入力してください:', 'メイン');
    if (!name) return;

    try {
      // Load legacy config
      const legacyDoc = await getDoc(doc(db, 'notification_config', 'main'));
      if (!legacyDoc.exists()) {
        alert('レガシー設定が見つかりませんでした。');
        return;
      }

      const legacyConfig = legacyDoc.data();
      const newPromoData = {
        name: name.trim(),
        createdAt: new Date().toISOString(),
        config: legacyConfig
      };

      const docRef = await addDoc(collection(db, 'promotions'), newPromoData);
      setPromotions(prev => [...prev, { id: docRef.id, ...newPromoData }]);
      setShowPromotionMenu(false);
      switchPromotion(docRef.id);
      alert(`レガシー設定を「${name}」として復元しました！`);
    } catch (error) {
      alert('復元に失敗しました: ' + error.message);
    }
  };

  // Delete promotion (with strict confirmation)
  const deletePromotion = async (promoId) => {
    const promoName = promotions.find(p => p.id === promoId)?.name || promoId;
    const confirmText = prompt(
      `⚠️ 警告: この操作は取り消せません！\n\nプロモーション「${promoName}」を削除するには、\n下の入力欄に「削除」と入力してください:`
    );

    if (confirmText !== '削除') {
      if (confirmText !== null) {
        alert('削除がキャンセルされました。');
      }
      return;
    }

    try {
      await deleteDoc(doc(db, 'promotions', promoId));
      setPromotions(prev => prev.filter(p => p.id !== promoId));
      if (currentPromotionId === promoId) {
        const remaining = promotions.filter(p => p.id !== promoId);
        if (remaining.length > 0) {
          switchPromotion(remaining[0].id);
        } else {
          setCurrentPromotionId(null);
        }
      }
      alert(`「${promoName}」を削除しました。`);
    } catch (error) {
      alert('削除に失敗しました: ' + error.message);
    }
  };


  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('');
    try {
      const configToSave = {
        ...config,
        notificationRules: (config.notificationRules || []).filter(r => r)
      };

      if (currentPromotionId && currentPromotionId !== '_legacy') {
        // Save to promotions collection
        const promoRef = doc(db, 'promotions', currentPromotionId);
        await setDoc(promoRef, {
          name: promotions.find(p => p.id === currentPromotionId)?.name || currentPromotionId,
          config: configToSave,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } else {
        // Legacy fallback
        const docRef = doc(db, 'notification_config', 'main');
        await setDoc(docRef, configToSave, { merge: true });
      }

      setSaveStatus('保存しました ✓');
      setTimeout(() => setSaveStatus(''), 3000);

    } catch (error) {
      console.error('Save error:', error);
      setSaveStatus('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  // Case 6: Generate time slots
  const generateTimeSlots = () => {
    if (!slotStartDate || !slotEndDate) {
      alert('開始日と終了日を選択してください');
      return;
    }

    const start = new Date(slotStartDate);
    const end = new Date(slotEndDate);
    const slots = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(d.getDate()).padStart(2, '0');
      const dayName = DAYS_JP[d.getDay()];

      for (const slot of TIME_SLOTS) {
        slots.push(`${year}/${month}/${date}(${dayName}) ${slot.start}〜${slot.end}`);
      }
    }

    setGeneratedSlots(slots.join('\n'));
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedSlots);
    alert('コピーしました！');
  };

  // Early returns moved here to satisfy Hook Rules (Error #310)
  if (isViewer) return <AssignmentViewer />;
  if (!authChecked) return null;
  if (!isAuthenticated) return <Login onLogin={handleLogin} />;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* New Promotion Modal */}
      {showNewPromotionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNewPromotionModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">
              {duplicateMode ? '現在の設定を複製' : '新規プロモーション作成'}
            </h3>
            <input
              type="text"
              placeholder="プロモーション名（例: 2026春キャンペーン）"
              className="w-full px-4 py-3 border border-slate-300 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={newPromotionName}
              onChange={e => setNewPromotionName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createPromotion()}
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowNewPromotionModal(false); setNewPromotionName(''); setDuplicateMode(false); }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                キャンセル
              </button>
              <button
                onClick={createPromotion}
                disabled={!newPromotionName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {duplicateMode ? '複製して作成' : '作成'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="bg-blue-600 p-2 rounded-lg text-white">
                <Send size={20} />
              </div>
              <h1 className="text-xl font-bold tracking-tight">通知管理システム</h1>
            </div>

            {/* Promotion Switcher */}
            <div className="relative">
              <button
                onClick={() => setShowPromotionMenu(!showPromotionMenu)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium transition-colors"
              >
                <span className="max-w-[200px] truncate">
                  {currentPromotionId === '_legacy'
                    ? 'レガシー設定'
                    : promotions.find(p => p.id === currentPromotionId)?.name || 'プロモーション未選択'}
                </span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showPromotionMenu && (
                <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-xl z-50">
                  <div className="p-2 border-b border-slate-100">
                    <div className="text-xs text-slate-400 px-2 py-1">プロモーション一覧</div>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {promotions.map(p => (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between px-3 py-2 hover:bg-slate-50 cursor-pointer group ${p.id === currentPromotionId ? 'bg-blue-50' : ''
                          }`}
                        onClick={() => switchPromotion(p.id)}
                      >
                        <span className={`text-sm truncate ${p.id === currentPromotionId ? 'font-medium text-blue-600' : ''}`}>
                          {p.name || p.id}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); deletePromotion(p.id); }}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 p-1"
                          title="削除"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {promotions.length === 0 && (
                      <div className="px-3 py-4 text-sm text-slate-400 text-center">
                        プロモーションがありません
                      </div>
                    )}
                    <div
                      className={`flex items-center justify-between px-3 py-2 hover:bg-slate-50 cursor-pointer ${currentPromotionId === '_legacy' ? 'bg-blue-50' : ''
                        }`}
                      onClick={() => switchPromotion('_legacy')}
                    >
                      <span className={`text-sm truncate ${currentPromotionId === '_legacy' ? 'font-medium text-blue-600' : ''}`}>
                        レガシー設定
                      </span>
                    </div>
                  </div>
                  <div className="border-t border-slate-100 p-2 space-y-1">
                    <button
                      onClick={() => { setShowPromotionMenu(false); setDuplicateMode(false); setShowNewPromotionModal(true); }}
                      className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-md"
                    >
                      + 新規作成
                    </button>
                    {currentPromotionId && currentPromotionId !== '_legacy' && (
                      <button
                        onClick={() => { setShowPromotionMenu(false); setDuplicateMode(true); setShowNewPromotionModal(true); }}
                        className="w-full text-left px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-md"
                      >
                        ⏘ 現在の設定を複製
                      </button>
                    )}
                    <button
                      onClick={migrateFromLegacy}
                      className="w-full text-left px-3 py-2 text-sm text-orange-600 hover:bg-orange-50 rounded-md"
                    >
                      ↻ レガシー設定から復元
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {saveStatus && (
              <span className={`text-sm ${saveStatus.includes('失敗') ? 'text-red-600' : 'text-green-600'}`}>
                {saveStatus}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {isSaving ? <span className="animate-spin">◌</span> : <Save size={18} />}
              設定を保存
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto py-8 px-4 flex flex-col md:flex-row gap-8">
        {/* Sidebar Tabs */}
        <aside className="w-full md:w-64 space-y-2">
          <TabButton active={activeTab === 'general'} onClick={() => setActiveTab('general')} icon={<Database size={18} />} label="接続設定" />
          <TabButton active={activeTab === 'case1'} onClick={() => setActiveTab('case1')} icon={<Users size={18} />} label="個別相談" />
          <TabButton active={activeTab === 'custom'} onClick={() => setActiveTab('custom')} icon={<Bell size={18} />} label="カスタム通知設定" />
          <TabButton active={activeTab === 'case4'} onClick={() => setActiveTab('case4')} icon={<Clock size={18} />} label="リマインダー" />
          <TabButton active={activeTab === 'case5'} onClick={() => setActiveTab('case5')} icon={<CheckSquare size={18} />} label="課題集約" />
          <TabButton active={activeTab === 'case6'} onClick={() => setActiveTab('case6')} icon={<Calendar size={18} />} label="枠生成" />
          <div className="border-t border-slate-200 my-2" />
          <TabButton active={activeTab === 'manual'} onClick={() => setActiveTab('manual')} icon={<BookOpen size={18} />} label="マニュアル" />
        </aside>

        {/* Main Content */}
        <main className="flex-1 bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
          {/* General Settings */}
          {activeTab === 'general' && (
            <section className="space-y-6">
              {/* Promotion ID Display */}
              {currentPromotionId && currentPromotionId !== '_legacy' && (
                <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <h3 className="text-sm font-semibold text-indigo-800 mb-2">📌 このプロモーションID（GAS設定用）</h3>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-white border border-indigo-300 rounded font-mono text-sm text-indigo-700 select-all">
                      {currentPromotionId}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(currentPromotionId);
                        alert('コピーしました: ' + currentPromotionId);
                      }}
                      className="px-3 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 transition-colors"
                    >
                      コピー
                    </button>
                  </div>
                  <p className="text-xs text-indigo-600 mt-2">
                    このIDをGASの <code className="bg-white px-1 rounded">PROMOTION_ID</code> に設定してください。
                  </p>
                </div>
              )}

              <h2 className="text-lg font-semibold border-b pb-2">Google スプレッドシート連携</h2>
              <div className="grid gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <label className="block text-sm font-medium text-slate-700">メイン スプレッドシートID</label>
                    {config.spreadsheetId && (
                      <a
                        href={`https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        📊 スプレッドシートを開く ↗
                      </a>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="1abc1234567890..."
                    value={config.spreadsheetId || ''}
                    onChange={(e) => setConfig({ ...config, spreadsheetId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <InputGroup label="スタッフ一覧シート名" placeholder="スタッフ一覧" value={config.staffListSheet} onChange={(v) => setConfig({ ...config, staffListSheet: v })} />
                <InputGroup label="予約一覧シート名" placeholder="個別相談予約一覧" value={config.bookingListSheet} onChange={(v) => setConfig({ ...config, bookingListSheet: v })} />
                <InputGroup label="スタッフChat対応表シート名" placeholder="スタッフChat" value={config.staffChatSheet} onChange={(v) => setConfig({ ...config, staffChatSheet: v })} />
                <InputGroup label="Webhook Secret (テスト用)" placeholder="Vercelの環境変数と同じ値を入力" value={config.webhookSecret} onChange={(v) => setConfig({ ...config, webhookSecret: v })} />
              </div>


              <h2 className="text-lg font-semibold border-b pb-2 mt-8">Chatwork API連携</h2>
              <div className="grid gap-4">
                <InputGroup label="APIトークン" type="password" placeholder="Your Chatwork API Token" value={config.chatworkToken} onChange={(v) => setConfig({ ...config, chatworkToken: v })} />
                <InputGroup label="メインルームID" placeholder="123456789" value={config.roomId} onChange={(v) => setConfig({ ...config, roomId: v })} />
              </div>

              <h2 className="text-lg font-semibold border-b pb-2 mt-8">エラー通知設定（管理者用）</h2>
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 mb-4">
                システムエラー発生時に管理者へ通知を送信します。未設定の場合は環境変数にフォールバックします。
              </div>
              <div className="grid gap-4">
                <InputGroup label="管理者用 APIトークン" type="password" placeholder="Admin Chatwork API Token" value={config.adminChatworkToken} onChange={(v) => setConfig({ ...config, adminChatworkToken: v })} />
                <InputGroup label="管理者用 ルームID" placeholder="987654321" value={config.adminChatworkRoomId} onChange={(v) => setConfig({ ...config, adminChatworkRoomId: v })} />
              </div>
            </section>
          )}

          {/* Case 1: Individual Consultation */}
          {activeTab === 'case1' && (
            <section className="space-y-6">
              <h2 className="text-lg font-semibold border-b pb-2 mb-4">個別相談</h2>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                予約データから担当者をマッチングし、Chatworkへ通知を送信します。
              </div>
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 space-y-2">
                  <label className="block text-sm font-medium text-slate-700">通知テンプレート</label>
                  <textarea
                    className="w-full h-48 p-3 bg-slate-50 border border-slate-300 rounded-md font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={config.consultationTemplate || '【個別相談予約】\n日時：{dateTime}\nお客様：{clientName}\n担当：{staff}'}
                    onChange={(e) => setConfig({ ...config, consultationTemplate: e.target.value })}
                  />
                </div>

                <div className="w-full md:w-64 pt-7">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg h-full">
                    <h4 className="text-xs font-semibold text-slate-600 mb-3 border-b pb-2">使用可能な埋め込み文字</h4>
                    <div className="space-y-2 text-xs text-slate-600">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">予約日時</span>
                        <code className="bg-white px-2 py-1 border rounded w-full block text-center cursor-pointer hover:bg-slate-100" onClick={() => {
                          setConfig({ ...config, consultationTemplate: (config.consultationTemplate || '') + '{dateTime}' })
                        }}>{'{dateTime}'}</code>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">お客様名</span>
                        <code className="bg-white px-2 py-1 border rounded w-full block text-center cursor-pointer hover:bg-slate-100" onClick={() => {
                          setConfig({ ...config, consultationTemplate: (config.consultationTemplate || '') + '{clientName}' })
                        }}>{'{clientName}'}</code>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">担当者名</span>
                        <code className="bg-white px-2 py-1 border rounded w-full block text-center cursor-pointer hover:bg-slate-100" onClick={() => {
                          setConfig({ ...config, consultationTemplate: (config.consultationTemplate || '') + '{staff}' })
                        }}>{'{staff}'}</code>
                      </div>
                      <div className="pt-2 border-t mt-2">
                        <p className="mb-1">スプレッドシート列名:</p>
                        <code className="bg-white px-2 py-1 border rounded w-full block text-center text-[10px]">{'{列名}'}</code>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Column Mapping Section */}
              <div className="space-y-4 pt-4 border-t">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-medium text-slate-700">予約一覧シートの列設定</h3>
                    <p className="text-xs text-slate-500">UTAGE等からの連携時に、行追加する値を設定します</p>
                  </div>
                  <button
                    onClick={async () => {
                      if (!config.spreadsheetId || !config.bookingListSheet) {
                        alert('スプレッドシートIDとシート名を入力してください');
                        return;
                      }
                      try {
                        const res = await fetch(`/api/sheets/headers?spreadsheetId=${config.spreadsheetId}&sheetName=${config.bookingListSheet}`);
                        if (res.ok) {
                          const data = await res.json();
                          if (data.headers) {
                            alert('ヘッダーを取得しました: ' + data.headers.join(', '));
                            setConfig({ ...config, _headers: data.headers });
                          }
                        } else {
                          throw new Error('Failed to fetch');
                        }
                      } catch (e) {
                        alert('ヘッダー取得に失敗しました (デプロイ後に動作します)');
                      }
                    }}
                    className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded border border-slate-300 transition-all"
                  >
                    シート情報取得
                  </button>
                </div>

                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Left: Column settings */}
                  <div className="flex-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                      {/* Default to 10 columns (A-J) if mapping is smaller, to match user request */}
                      {Array.from({ length: Math.max((config.bookingColumnMapping || []).length, 10) }).map((_, idx) => {
                        const header = config._headers ? config._headers[idx] : null;
                        const label = header ? `${String.fromCharCode(65 + idx)}列 (${header})` : `${String.fromCharCode(65 + idx)}列`;

                        return (
                          <div key={idx} className="flex items-center gap-2 bg-slate-50/50 p-1 rounded-md border border-slate-100">
                            <span className="w-24 text-[11px] font-bold text-slate-400 text-right truncate" title={label}>
                              {label}
                            </span>
                            <input
                              type="text"
                              className="flex-1 px-2 py-1 bg-white border border-slate-300 rounded text-sm font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
                              placeholder=""
                              value={(config.bookingColumnMapping || [])[idx] || ''}
                              onChange={(e) => {
                                const newMapping = [...(config.bookingColumnMapping || [])];
                                while (newMapping.length <= idx) newMapping.push('');
                                newMapping[idx] = e.target.value;
                                setConfig({ ...config, bookingColumnMapping: newMapping });
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right: Replacement Tags Helper */}
                  <div className="w-full lg:w-48">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg sticky top-4">
                      <h4 className="text-xs font-semibold text-slate-600 mb-2 border-b pb-1">置き換え文字</h4>
                      <div className="grid grid-cols-1 gap-1 text-[10px] text-slate-600">
                        <div className="flex justify-between"><span>日時</span> <code className="bg-white px-1 border rounded">{'{dateTime}'}</code></div>
                        <div className="flex justify-between"><span>お名前</span> <code className="bg-white px-1 border rounded">{'{clientName}'}</code></div>
                        <div className="flex justify-between"><span>メール</span> <code className="bg-white px-1 border rounded">{'{email}'}</code></div>
                        <div className="flex justify-between"><span>担当者</span> <code className="bg-white px-1 border rounded">{'{staff}'}</code></div>
                        <div className="mt-2 pt-1 border-t font-semibold">UTAGE項目</div>
                        <div className="flex justify-between"><span>全項目</span> <code className="bg-white px-1 border rounded text-[9px]">{'{allFields.xxx}'}</code></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Webhook Mapping Section */}
              <div className="space-y-4 pt-4 border-t">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-medium text-slate-700">Webhookパラメータ設定</h3>
                    <p className="text-xs text-slate-500">外部システム(UTAGE等)のキー名を内部キーに紐付けます</p>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    {/* Name Mapping */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-500 font-medium">お名前 (clientName)</label>
                      <input
                        type="text"
                        placeholder="例: name, お名前"
                        className="px-3 py-2 bg-white border border-slate-300 rounded text-sm"
                        value={config.webhookMapping?.clientName || ''}
                        onChange={(e) => setConfig({ ...config, webhookMapping: { ...config.webhookMapping, clientName: e.target.value } })}
                      />
                    </div>

                    {/* Email Mapping */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-500 font-medium">メールアドレス (email)</label>
                      <input
                        type="text"
                        placeholder="例: email, メールアドレス"
                        className="px-3 py-2 bg-white border border-slate-300 rounded text-sm"
                        value={config.webhookMapping?.email || ''}
                        onChange={(e) => setConfig({ ...config, webhookMapping: { ...config.webhookMapping, email: e.target.value } })}
                      />
                    </div>

                    {/* DateTime Mapping */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-500 font-medium">予約日時 (dateTime)</label>
                      <input
                        type="text"
                        placeholder="例: schedule, 日時"
                        className="px-3 py-2 bg-white border border-slate-300 rounded text-sm"
                        value={config.webhookMapping?.dateTime || ''}
                        onChange={(e) => setConfig({ ...config, webhookMapping: { ...config.webhookMapping, dateTime: e.target.value } })}
                      />
                    </div>

                    {/* Staff Mapping */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-500 font-medium">担当者/認定コンサル (staff)</label>
                      <input
                        type="text"
                        placeholder="例: member_name, 担当者"
                        className="px-3 py-2 bg-white border border-slate-300 rounded text-sm"
                        value={config.webhookMapping?.staff || ''}
                        onChange={(e) => setConfig({ ...config, webhookMapping: { ...config.webhookMapping, staff: e.target.value } })}
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-4 italic">※ カンマ区切りで複数のキーを指定可能です。</p>
                </div>
              </div>
            </section>
          )}

          {/* Custom Notifications (Replaces Case 2 & 3) */}
          {activeTab === 'custom' && (
            <CustomNotificationsSection
              config={config}
              setConfig={setConfig}
            />
          )}

          {/* Case 4: Reminder */}
          {activeTab === 'case4' && (
            <section className="space-y-6">
              <h2 className="text-lg font-semibold border-b pb-2 mb-4">リマインダー</h2>
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                毎日18:00に翌日の予約担当者へリマインドを送信します。
              </div>
              <div className="grid gap-4 bg-yellow-50/50 p-4 rounded-lg border border-yellow-100 mb-6">
                <h3 className="font-medium text-yellow-900 border-b border-yellow-200 pb-2 mb-2 flex items-center gap-2">
                  <Settings size={16} /> 配信設定
                </h3>
                <InputGroup
                  label="通知先チャットルームID (任意)"
                  placeholder="指定がない場合は担当者の個人チャットへ通知"
                  value={config.reminderRoomId || ''}
                  onChange={(v) => setConfig({ ...config, reminderRoomId: v })}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InputGroup
                    label="対象スプレッドシートID (任意)"
                    placeholder="メイン設定を使用する場合は空欄"
                    value={config.reminderSpreadsheetId || ''}
                    onChange={(v) => setConfig({ ...config, reminderSpreadsheetId: v })}
                  />
                  <InputGroup
                    label="対象シート名 (任意)"
                    placeholder="メイン設定を使用する場合は空欄"
                    value={config.reminderSheetName || ''}
                    onChange={(v) => setConfig({ ...config, reminderSheetName: v })}
                  />
                </div>
                <InputGroup
                  label="開催日時の列名"
                  placeholder="例: 開催日時 / 日付 (空欄時は自動判定)"
                  value={config.reminderDateCol || ''}
                  onChange={(v) => setConfig({ ...config, reminderDateCol: v })}
                />
                <p className="text-xs text-slate-500 mt-1">※ 指定された列の日付が「翌日」である行を抽出してリマインドします。</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">リマインドテンプレート</label>
                <textarea
                  className="w-full h-32 p-3 bg-slate-50 border border-slate-300 rounded-md font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={config.reminderTemplate || '【明日のご予約リマインド】\n日時：{date} {time}\nお客様：{client}\nよろしくお願いいたします。'}
                  onChange={(e) => setConfig({ ...config, reminderTemplate: e.target.value })}
                />
              </div>

              <div className="pt-6 border-t">
                <h3 className="text-sm font-medium text-slate-900 mb-2">動作テスト</h3>
                <button
                  onClick={async () => {
                    if (!confirm('明日の予約リマインド通知を今すぐテスト実行しますか？\n（指定されたチャットへ通知が送信されます）')) return;
                    try {
                      const url = `/api/webhook?type=reminder${currentPromotionId ? `&promotionId=${currentPromotionId}` : ''}`;
                      const res = await fetch(url, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'x-webhook-secret': config.webhookSecret
                        },
                        body: JSON.stringify({ type: 'reminder', data: { promotionId: currentPromotionId } })
                      });
                      const result = await res.json();
                      if (res.ok) {
                        const sent = result.result?.sent || 0;
                        alert(`テスト実行リクエストを送信しました。\n送信件数: ${sent}件\nチャットを確認してください。`);
                      }
                      else if (res.status === 401) alert('認証に失敗しました。接続設定のWebhook Secretが正しいか確認してください。');
                      else alert('送信に失敗しました。設定等を確認してください。');
                    } catch (e) {
                      alert('エラーが発生しました。');
                    }
                  }}
                  className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-md text-sm hover:bg-slate-50 flex items-center gap-2"
                >
                  <Send size={16} />
                  テスト実行
                </button>
              </div>
            </section>
          )}

          {/* Case 5: Assignment Viewer */}
          {activeTab === 'case5' && (
            <Case5Section config={config} setConfig={setConfig} currentPromotionId={currentPromotionId} />
          )}

          {/* Case 6: Time Slot Generator */}
          {activeTab === 'case6' && (
            <section className="space-y-6">
              <h2 className="text-lg font-semibold border-b pb-2 mb-4">枠生成ツール</h2>
              <div className="p-4 bg-teal-50 border border-teal-200 rounded-lg text-sm text-teal-800">
                指定期間の予約枠リストを生成します。（10:00〜12:00, 13:00〜15:00, 16:00〜18:00, 20:00〜22:00）
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-700">開始日</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={slotStartDate}
                    onChange={(e) => setSlotStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-700">終了日</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={slotEndDate}
                    onChange={(e) => setSlotEndDate(e.target.value)}
                  />
                </div>
              </div>

              <button
                onClick={generateTimeSlots}
                className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-md flex items-center gap-2 transition-all"
              >
                <Calendar size={18} />
                枠を生成
              </button>

              {generatedSlots && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-sm font-medium text-slate-700">生成結果</label>
                    <button
                      onClick={copyToClipboard}
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <Copy size={14} />
                      コピー
                    </button>
                  </div>
                  <textarea
                    className="w-full h-64 p-3 bg-slate-50 border border-slate-300 rounded-md font-mono text-sm"
                    value={generatedSlots}
                    readOnly
                  />
                </div>
              )}
            </section>
          )}

          {/* Manual */}
          {activeTab === 'manual' && (
            <ManualSection />
          )}
        </main>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${active
        ? 'bg-blue-600 text-white shadow-md'
        : 'text-slate-600 hover:bg-slate-100'
        }`}
    >
      {icon}
      {label}
    </button>
  );
}

function InputGroup({ label, placeholder, value, onChange, type = "text" }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <input
        type={type}
        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// --- Custom Notification Section ---
// --- Custom Notification Section ---
function CustomNotificationsSection({ config, setConfig }) {
  const rules = config.notificationRules || [];

  const updateConfigRules = (newRules) => {
    setConfig({ ...config, notificationRules: newRules });
  };

  const addRule = () => {
    const newRule = {
      id: Date.now().toString() + Math.random().toString().slice(2),
      sheetName: '',
      notifications: [
        {
          id: Date.now().toString() + Math.random().toString().slice(2) + '_n',
          roomId: '',
          template: '',
          columns: []
        }
      ],
      task: {
        enabled: false,
        roomId: '',
        assigneeIds: [],
        bodyTemplate: ''
      }
    };
    updateConfigRules([...rules, newRule]);
  };

  const removeRule = (id) => {
    if (confirm('この設定を削除しますか？')) {
      updateConfigRules(rules.filter(r => r.id !== id));
    }
  };

  const onRuleUpdate = (updatedRule) => {
    updateConfigRules(rules.map(r => r.id === updatedRule.id ? updatedRule : r));
  };

  // Helper to fetch columns for a specific rule
  const fetchHeadersForRule = async (ruleId, sheetName) => {
    if (!config.spreadsheetId || !sheetName) {
      alert('スプレッドシートIDとシート名が必要です');
      return [];
    }
    try {
      const res = await fetch(`/api/sheets/headers?spreadsheetId=${config.spreadsheetId}&sheetName=${encodeURIComponent(sheetName)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data.headers || [];
    } catch (e) {
      alert('列の取得に失敗しました: ' + e.message);
      return [];
    }
  };

  return (
    <section className="space-y-8">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h2 className="text-lg font-semibold">カスタム通知設定</h2>
          <p className="text-sm text-slate-500">シートごとの通知ルールを自由に作成できます。</p>
        </div>
        <button
          onClick={addRule}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md text-sm flex items-center gap-2"
        >
          <Bell size={16} />
          新しい通知ルールを追加
        </button>
      </div>

      <div className="space-y-6">
        {rules.length === 0 && (
          <div className="text-center py-12 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
            <p className="text-slate-400">通知ルールがありません。「新しい通知ルールを追加」ボタンから作成してください。</p>
          </div>
        )}

        {rules.map((rule, index) => (
          <NotificationRuleCard
            key={rule.id || index}
            rule={rule}
            index={index}
            config={config}
            onUpdate={onRuleUpdate}
            onDelete={() => removeRule(rule.id)}
            fetchHeaders={() => fetchHeadersForRule(rule.id, rule.sheetName)}
          />
        ))}
      </div>
    </section>
  );
}

function NotificationRuleCard({ rule, index, config, onUpdate, onDelete, fetchHeaders }) {
  const [headers, setHeaders] = useState([]);
  const [isFetching, setIsFetching] = useState(false);

  const handleFetchHeaders = async () => {
    setIsFetching(true);
    const cols = await fetchHeaders();
    if (cols) setHeaders(cols);
    setIsFetching(false);
  };

  const updateTask = (field, value) => {
    onUpdate({ ...rule, task: { ...rule.task, [field]: value } });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
        <h3 className="font-semibold text-slate-700">Rule #{index + 1}</h3>
        <button onClick={onDelete} className="text-red-500 hover:text-red-700 text-xs">削除</button>
      </div>

      <div className="p-4 space-y-6">
        {/* Trigger Sheet */}
        <div className="grid gap-4">
          <InputGroup
            label="対象シート名 (トリガー)"
            placeholder="例: 本講座申込 / 日報"
            value={rule.sheetName}
            onChange={(v) => onUpdate({ ...rule, sheetName: v })}
          />
        </div>

        {/* Notifications Loop (Only 1 supported initially for simplicity UI, but data structure allows array) */}
        <div className="border-t pt-4">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <Send size={16} /> 通知メッセージ設定
            </h4>
            <button
              onClick={handleFetchHeaders}
              disabled={!rule.sheetName || isFetching}
              className="text-xs bg-slate-100 border border-slate-300 px-2 py-1 rounded"
            >
              {isFetching ? '...' : '列情報を取得'}
            </button>
          </div>

          <div className="space-y-2 mb-4 bg-slate-50 p-2 rounded text-xs">
            {headers.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {headers.map(h => (
                  <label key={h} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={rule.notifications[0]?.columns?.includes(h) || false}
                      onChange={(e) => {
                        const currentCols = rule.notifications[0]?.columns || [];
                        const newCols = e.target.checked
                          ? [...currentCols, h]
                          : currentCols.filter(c => c !== h);

                        const newNotifs = [...rule.notifications];
                        newNotifs[0] = { ...newNotifs[0], columns: newCols };
                        onUpdate({ ...rule, notifications: newNotifs });
                      }}
                    />
                    {h}
                  </label>
                ))}
              </div>
            ) : (
              <span className="text-slate-400">「列情報を取得」を押すと、通知に含める列を選択できます</span>
            )}
          </div>

          <div className="grid gap-3">
            <InputGroup
              label="通知先ルームID"
              placeholder="12345678"
              value={rule.notifications[0]?.roomId || ''}
              onChange={(v) => {
                const newNotifs = [...rule.notifications];
                newNotifs[0] = { ...newNotifs[0], roomId: v };
                onUpdate({ ...rule, notifications: newNotifs });
              }}
            />
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">テンプレート</label>
              <textarea
                className="w-full h-24 p-2 text-sm border border-slate-300 rounded"
                placeholder="メッセージ本文 ({列名}で埋め込み可)"
                value={rule.notifications[0]?.template || ''}
                onChange={(e) => {
                  const newNotifs = [...rule.notifications];
                  newNotifs[0] = { ...newNotifs[0], template: e.target.value };
                  onUpdate({ ...rule, notifications: newNotifs });
                }}
              />
            </div>
          </div>
        </div>

        {/* Task Settings */}
        <div className="border-t pt-4">
          <div className="flex items-center gap-3 mb-4">
            <h4 className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <CheckSquare size={16} /> タスク自動作成
            </h4>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={rule.task?.enabled || false}
                onChange={(e) => updateTask('enabled', e.target.checked)}
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {rule.task?.enabled && (
            <div className="space-y-4 pl-4 border-l-2 border-blue-100">
              <InputGroup
                label="タスク作成ルームID (空欄なら通知先と同じ)"
                placeholder="指定する場合のみ入力"
                value={rule.task.roomId}
                onChange={(v) => updateTask('roomId', v)}
              />

              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700">担当者ID (カンマ区切り)</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                  placeholder="11111, 22222"
                  value={(rule.task.assigneeIds || []).join(', ')}
                  onChange={(e) => updateTask('assigneeIds', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                />
              </div>

              {/* Task Filter Settings */}
              <TaskFilterSettings
                filter={rule.task.filter || {}}
                headers={headers}
                onChange={(newFilter) => updateTask('filter', newFilter)}
              />

              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700">タスク内容</label>
                <textarea
                  className="w-full h-20 p-2 text-sm border border-slate-300 rounded"
                  value={rule.task.bodyTemplate || ''}
                  onChange={(e) => updateTask('bodyTemplate', e.target.value)}
                  placeholder="タスクの詳細内容 ({列名}使用可)"
                />
                {headers.length > 0 && (
                  <div className="mt-1 text-xs text-slate-500">
                    <p className="mb-1">使用可能な埋め込みタグ（クリックでコピー）:</p>
                    <div className="flex flex-wrap gap-2">
                      {headers.map(h => (
                        <span
                          key={h}
                          className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded cursor-pointer hover:bg-slate-200"
                          onClick={() => {
                            const val = rule.task.bodyTemplate || '';
                            updateTask('bodyTemplate', val + `{${h}}`);
                          }}
                        >
                          {`{${h}}`}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function Case5Section({ config, setConfig, currentPromotionId }) {
  const [newSheetName, setNewSheetName] = useState('');

  const assignments = config.assignmentViewer?.assignments || [];
  const spreadsheetId = config.assignmentViewer?.spreadsheetId || '';

  const addAssignment = () => {
    if (!newSheetName.trim()) {
      alert('シート名を入力してください');
      return;
    }

    const updatedAssignments = [...assignments, { name: newSheetName.trim(), id: Date.now() }];
    setConfig({
      ...config,
      assignmentViewer: {
        ...config.assignmentViewer,
        assignments: updatedAssignments
      }
    });
    setNewSheetName('');
  };

  const removeAssignment = (id) => {
    const updatedAssignments = assignments.filter(a => a.id !== id);
    setConfig({
      ...config,
      assignmentViewer: {
        ...config.assignmentViewer,
        assignments: updatedAssignments
      }
    });
  };

  const moveAssignment = (index, direction) => {
    const updatedAssignments = [...assignments];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= assignments.length) return;

    [updatedAssignments[index], updatedAssignments[newIndex]] = [updatedAssignments[newIndex], updatedAssignments[index]];

    setConfig({
      ...config,
      assignmentViewer: {
        ...config.assignmentViewer,
        assignments: updatedAssignments
      }
    });
  };

  const updateSpreadsheetId = (value) => {
    setConfig({
      ...config,
      assignmentViewer: {
        ...config.assignmentViewer,
        spreadsheetId: value
      }
    });
  };

  const updateQuestionnaire = (field, value) => {
    setConfig({
      ...config,
      assignmentViewer: {
        ...config.assignmentViewer,
        questionnaire: {
          ...config.assignmentViewer?.questionnaire,
          [field]: value
        }
      }
    });
  };

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold border-b pb-2 mb-4">課題集約</h2>
      <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-800">
        事前アンケートと課題シートから提出状況を集約し、個別ページを生成します。
      </div>

      <div className="bg-white border-2 border-dashed border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-blue-700 font-bold mb-1">
          <Link size={18} />
          <span>外部システム（UTAGE・会員サイト等）連携用URL</span>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          メールアドレスを使って直接ページを開くためのURL形式です。リンクボタンなどに設定して活用してください。
        </p>
        <div className="bg-slate-900 text-slate-100 p-3 rounded-lg font-mono text-xs break-all relative group">
          {window.location.origin}/viewer/<span className="text-blue-400">メールアドレス</span>?promotionId={currentPromotionId}
          <button
            onClick={() => {
              const url = `${window.location.origin}/viewer/{email}?promotionId=${currentPromotionId}`;
              navigator.clipboard.writeText(url);
              alert('URL形式をコピーしました！メールアドレス部分は各サービスの見込み客変数を指定してください。');
            }}
            className="absolute right-2 top-2 p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"
            title="コピー"
          >
            <Copy size={14} />
          </button>
        </div>
        <p className="text-[10px] text-slate-400">
          ※ 「メールアドレス」の部分は、UTAGEなら <code>{'{email}'}</code> など、各サービスの差し込み変数に書き換えてください。
        </p>
      </div>

      {/* Assignment Spreadsheet */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div className="space-y-3">
          <h3 className="font-medium text-slate-700">📋 事前アンケート</h3>
          <div className="grid grid-cols-1 gap-2">
            <InputGroup
              label="スプレッドシートID"
              placeholder="1abc1234567890..."
              value={config.assignmentViewer?.questionnaire?.ssId || ''}
              onChange={(v) => updateQuestionnaire('ssId', v)}
            />
            <InputGroup
              label="シート名"
              placeholder="事前アンケート"
              value={config.assignmentViewer?.questionnaire?.sheetName || ''}
              onChange={(v) => updateQuestionnaire('sheetName', v)}
            />
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-medium text-slate-700">📝 課題一覧</h3>
          <InputGroup
            label="スプレッドシートID"
            placeholder="1abc1234567890..."
            value={spreadsheetId}
            onChange={updateSpreadsheetId}
          />
          <p className="text-xs text-slate-500">※ 課題シートが含まれるスプレッドシート</p>
        </div>
      </div>

      {/* Assignment Sheets */}
      <div className="space-y-3">
        <h3 className="font-medium text-slate-700">課題シート一覧</h3>

        {assignments.length === 0 ? (
          <p className="text-sm text-slate-400 italic">まだ課題シートが登録されていません</p>
        ) : (
          <div className="space-y-2">
            {assignments.map((assignment, idx) => (
              <div key={assignment.id} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg group">
                <span className="text-sm font-medium text-slate-600 w-6">{idx + 1}.</span>
                <span className="flex-1 text-sm font-medium">{assignment.name}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => moveAssignment(idx, -1)}
                    disabled={idx === 0}
                    className="p-1 hover:bg-slate-200 rounded text-slate-500 disabled:opacity-30"
                    title="上に移動"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    onClick={() => moveAssignment(idx, 1)}
                    disabled={idx === assignments.length - 1}
                    className="p-1 hover:bg-slate-200 rounded text-slate-500 disabled:opacity-30"
                    title="下に移動"
                  >
                    <ArrowDown size={16} />
                  </button>
                </div>
                <button
                  onClick={() => removeAssignment(assignment.id)}
                  className="text-red-500 hover:text-red-700 text-sm px-2 border-l ml-1"
                >
                  削除
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new assignment */}
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">シート名を追加</label>
            <input
              type="text"
              placeholder="例：Day1課題"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={newSheetName}
              onChange={(e) => setNewSheetName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addAssignment()}
            />
          </div>
          <button
            onClick={addAssignment}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm transition-all"
          >
            追加
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="text-xs text-slate-500 border-t pt-3">
        Viewer URL: <code>/viewer/[hash|email]</code>
      </div>

      {/* Operation Test */}
      <div className="border-t pt-4 mt-4">
        <h3 className="font-medium text-slate-700 mb-2">🔍 動作テスト</h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">確認用メールアドレス</label>
            <input
              type="text"
              placeholder="user@example.com"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm"
              id="test-email-input"
            />
          </div>
          <button
            onClick={() => {
              const email = document.getElementById('test-email-input').value;
              if (email) {
                window.open(`/viewer/${email}`, '_blank');
              } else {
                alert('メールアドレスを入力してください');
              }
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm transition-all"
          >
            ページを確認
          </button>
        </div>
      </div>
    </section>
  );
}

function ManualSection() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/manual.md')
      .then(res => res.text())
      .then(text => {
        setContent(text);
        setLoading(false);
      })
      .catch(() => {
        setContent('マニュアルの読み込みに失敗しました。');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <section className="space-y-6">
        <h2 className="text-lg font-semibold border-b pb-2">マニュアル</h2>
        <div className="animate-pulse text-slate-400">読み込み中...</div>
      </section>
    );
  }

  // Simple markdown-like rendering
  const renderMarkdown = (md) => {
    const lines = md.split('\n');
    const elements = [];
    let inCodeBlock = false;
    let codeLines = [];
    let codeLang = '';
    let inTable = false;
    let tableRows = [];

    const processText = (text) => {
      // Basic inline formatting
      return text
        .replace(/`([^`]+)`/g, '<code class="bg-slate-100 px-1 py-0.5 rounded text-sm font-mono">$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="text-blue-600 hover:underline">$1</a>');
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code blocks
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          elements.push(
            <pre key={i} className="bg-slate-800 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm font-mono my-4">
              {codeLines.join('\n')}
            </pre>
          );
          codeLines = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
          codeLang = line.slice(3);
        }
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      // Table handling
      if (line.startsWith('|')) {
        if (!inTable) {
          inTable = true;
          tableRows = [];
        }
        if (!line.includes('---')) {
          tableRows.push(line.split('|').filter(c => c.trim()).map(c => c.trim()));
        }
        continue;
      } else if (inTable) {
        // End of table
        const isHeader = tableRows.length > 0;
        elements.push(
          <div key={`table-${i}`} className="overflow-x-auto my-4">
            <table className="min-w-full border border-slate-200 text-sm">
              {isHeader && (
                <thead className="bg-slate-50">
                  <tr>
                    {tableRows[0].map((cell, ci) => (
                      <th key={ci} className="border border-slate-200 px-3 py-2 text-left font-medium">{cell}</th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {tableRows.slice(1).map((row, ri) => (
                  <tr key={ri} className="hover:bg-slate-50">
                    {row.map((cell, ci) => (
                      <td key={ci} className="border border-slate-200 px-3 py-2" dangerouslySetInnerHTML={{ __html: processText(cell) }} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableRows = [];
        inTable = false;
      }

      // Headers
      if (line.startsWith('# ')) {
        elements.push(<h1 key={i} className="text-2xl font-bold text-slate-900 mt-8 mb-4">{line.slice(2)}</h1>);
      } else if (line.startsWith('## ')) {
        elements.push(<h2 key={i} className="text-xl font-semibold text-slate-800 mt-6 mb-3 border-b pb-2">{line.slice(3)}</h2>);
      } else if (line.startsWith('### ')) {
        elements.push(<h3 key={i} className="text-lg font-medium text-slate-700 mt-4 mb-2">{line.slice(4)}</h3>);
      } else if (line.startsWith('---')) {
        elements.push(<hr key={i} className="my-6 border-slate-200" />);
      } else if (line.startsWith('- ')) {
        elements.push(
          <li key={i} className="ml-4 list-disc text-slate-600" dangerouslySetInnerHTML={{ __html: processText(line.slice(2)) }} />
        );
      } else if (/^\d+\.\s/.test(line)) {
        elements.push(
          <li key={i} className="ml-4 list-decimal text-slate-600" dangerouslySetInnerHTML={{ __html: processText(line.replace(/^\d+\.\s/, '')) }} />
        );
      } else if (line.trim() === '') {
        elements.push(<div key={i} className="h-2" />);
      } else {
        elements.push(<p key={i} className="text-slate-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: processText(line) }} />);
      }
    }

    return elements;
  };

  return (
    <section className="space-y-4">
      <div className="flex justify-between items-center border-b pb-2">
        <h2 className="text-lg font-semibold">マニュアル</h2>
        <a
          href="/manual.md"
          download
          className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          <FileText size={14} />
          ダウンロード
        </a>
      </div>
      <div className="prose prose-slate max-w-none">
        {renderMarkdown(content)}
      </div>
    </section>
  );
}
