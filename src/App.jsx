import { useState, useEffect } from 'react';
import { Bell, CheckSquare, Database, Send, Save, Calendar, Clock, Copy, FileText, Users } from 'lucide-react';
import { db } from './lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

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


function AssignmentViewer() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const parts = window.location.pathname.split('/');
    const id = parts[parts.length - 1]; // hash or email

    async function fetchData() {
      try {
        const res = await fetch(`/api/viewer/data?id=${encodeURIComponent(id)}`);
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
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
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
                  <div className="p-4 space-y-3 bg-slate-50">
                    {a.details.map((item, idx) => (
                      <div key={idx} className="text-sm">
                        <div className="text-xs text-slate-400 font-medium mb-1">{item.label}</div>
                        <div className="text-slate-700 bg-white p-2 rounded border border-slate-200 whitespace-pre-wrap">
                          {item.value || '-'}
                        </div>
                      </div>
                    ))}
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
  if (isViewer) return <AssignmentViewer />;

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

  // Case 6: Time Slot Generator
  const [slotStartDate, setSlotStartDate] = useState('');
  const [slotEndDate, setSlotEndDate] = useState('');
  const [generatedSlots, setGeneratedSlots] = useState('');

  // Load config from Firestore on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        const docRef = doc(db, 'notification_config', 'main');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          // Sanitize rules on load
          if (data.notificationRules) {
            data.notificationRules = data.notificationRules.filter(r => r && r.id);
          }
          setConfig(prev => ({ ...prev, ...data }));
        }
      } catch (error) {
        console.error('Failed to load config:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadConfig();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('');
    try {
      const docRef = doc(db, 'notification_config', 'main');
      // Sanitize before save
      const configToSave = {
        ...config,
        notificationRules: (config.notificationRules || []).filter(r => r)
      };
      console.log('Saving keys:', configToSave.notificationRules); // Debug log
      await setDoc(docRef, configToSave, { merge: true });
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
      const month = d.getMonth() + 1;
      const date = d.getDate();
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-lg text-white">
            <Send size={20} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">通知管理システム</h1>
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
      </header>

      <div className="max-w-6xl mx-auto py-8 px-4 flex flex-col md:flex-row gap-8">
        {/* Sidebar Tabs */}
        <aside className="w-full md:w-64 space-y-2">
          <TabButton active={activeTab === 'general'} onClick={() => setActiveTab('general')} icon={<Database size={18} />} label="接続設定" />
          <TabButton active={activeTab === 'case1'} onClick={() => setActiveTab('case1')} icon={<Users size={18} />} label="Case1: 個別相談" />
          <TabButton active={activeTab === 'custom'} onClick={() => setActiveTab('custom')} icon={<Bell size={18} />} label="カスタム通知設定" />
          <TabButton active={activeTab === 'case4'} onClick={() => setActiveTab('case4')} icon={<Clock size={18} />} label="Case4: リマインダー" />
          <TabButton active={activeTab === 'case5'} onClick={() => setActiveTab('case5')} icon={<CheckSquare size={18} />} label="Case5: 課題集約" />
          <TabButton active={activeTab === 'case6'} onClick={() => setActiveTab('case6')} icon={<Calendar size={18} />} label="Case6: 枠生成" />
        </aside>

        {/* Main Content */}
        <main className="flex-1 bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
          {/* General Settings */}
          {activeTab === 'general' && (
            <section className="space-y-6">
              <h2 className="text-lg font-semibold border-b pb-2">Google スプレッドシート連携</h2>
              <div className="grid gap-4">
                <InputGroup label="メイン スプレッドシートID" placeholder="1abc1234567890..." value={config.spreadsheetId} onChange={(v) => setConfig({ ...config, spreadsheetId: v })} />
                <InputGroup label="スタッフ一覧シート名" placeholder="スタッフ一覧" value={config.staffListSheet} onChange={(v) => setConfig({ ...config, staffListSheet: v })} />
                <InputGroup label="予約一覧シート名" placeholder="個別相談予約一覧" value={config.bookingListSheet} onChange={(v) => setConfig({ ...config, bookingListSheet: v })} />
                <InputGroup label="スタッフChat対応表シート名" placeholder="スタッフChat" value={config.staffChatSheet} onChange={(v) => setConfig({ ...config, staffChatSheet: v })} />
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
              <h2 className="text-lg font-semibold border-b pb-2">Case 1: 個別相談予約</h2>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                予約データから担当者をマッチングし、Chatworkへ通知を送信します。
              </div>
              <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-600">
                <strong>使用可能な埋め込み文字:</strong><br />
                <code className="bg-slate-200 px-1 rounded">{'{dateTime}'}</code> - 予約日時
                <code className="bg-slate-200 px-1 rounded">{'{clientName}'}</code> - お客様名
                <code className="bg-slate-200 px-1 rounded">{'{staff}'}</code> - 担当者名<br />
                ※ スプレッドシートの列名も <code className="bg-slate-200 px-1 rounded">{'{列名}'}</code> 形式で使用可能
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">通知テンプレート</label>
                <textarea
                  className="w-full h-32 p-3 bg-slate-50 border border-slate-300 rounded-md font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={config.consultationTemplate || '【個別相談予約】\n日時：{dateTime}\nお客様：{clientName}\n担当：{staff}'}
                  onChange={(e) => setConfig({ ...config, consultationTemplate: e.target.value })}
                />
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

                <div className="flex gap-6">
                  {/* Left: Column settings */}
                  <div className="flex-1 space-y-2">
                    {/* Default to 10 columns (A-J) if mapping is smaller, to match user request */}
                    {Array.from({ length: Math.max((config.bookingColumnMapping || []).length, 10) }).map((_, idx) => {
                      const header = config._headers ? config._headers[idx] : null;
                      const label = header ? `${String.fromCharCode(65 + idx)}列 (${header})` : `${String.fromCharCode(65 + idx)}列`;

                      return (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="w-32 text-sm font-medium text-slate-500 text-right truncate" title={label}>
                            {label}
                          </span>
                          <input
                            type="text"
                            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            placeholder=""
                            value={(config.bookingColumnMapping || [])[idx] || ''}
                            onChange={(e) => {
                              const newMapping = [...(config.bookingColumnMapping || [])];
                              // Ensure array is long enough
                              while (newMapping.length <= idx) newMapping.push('');
                              newMapping[idx] = e.target.value;
                              setConfig({ ...config, bookingColumnMapping: newMapping });
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Right: Replacement Tags Helper */}
                  <div className="w-64 space-y-3">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <h4 className="text-xs font-semibold text-slate-600 mb-2 border-b pb-1">置き換え文字</h4>
                      <div className="space-y-1 text-xs text-slate-600">
                        <div className="flex justify-between"><span>日時</span> <code className="bg-white px-1 border rounded">{'{dateTime}'}</code></div>
                        <div className="flex justify-between"><span>お名前</span> <code className="bg-white px-1 border rounded">{'{clientName}'}</code></div>
                        <div className="flex justify-between"><span>メール</span> <code className="bg-white px-1 border rounded">{'{email}'}</code></div>
                        <div className="flex justify-between"><span>担当者</span> <code className="bg-white px-1 border rounded">{'{staff}'}</code></div>
                        <div className="mt-2 pt-2 border-t font-semibold">UTAGE項目</div>
                        <div className="flex justify-between"><span>全項目</span> <code className="bg-white px-1 border rounded">{'{allFields.xxx}'}</code></div>
                        <div className="text-gray-400 text-[10px] mt-1">例: {`{allFields.Phone}`}</div>
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

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-xs font-medium text-slate-500 mb-1">
                    <div>外部システムキー (入力)</div>
                    <div>内部キー (固定)</div>
                  </div>

                  {/* Name Mapping */}
                  <div className="grid grid-cols-2 gap-4 items-center">
                    <input
                      type="text"
                      placeholder="例: name, お名前"
                      className="px-3 py-2 bg-white border border-slate-300 rounded text-sm"
                      value={config.webhookMapping?.clientName || ''}
                      onChange={(e) => setConfig({ ...config, webhookMapping: { ...config.webhookMapping, clientName: e.target.value } })}
                    />
                    <div className="text-sm text-slate-700">お名前 (clientName)</div>
                  </div>

                  {/* Email Mapping */}
                  <div className="grid grid-cols-2 gap-4 items-center">
                    <input
                      type="text"
                      placeholder="例: email, メールアドレス"
                      className="px-3 py-2 bg-white border border-slate-300 rounded text-sm"
                      value={config.webhookMapping?.email || ''}
                      onChange={(e) => setConfig({ ...config, webhookMapping: { ...config.webhookMapping, email: e.target.value } })}
                    />
                    <div className="text-sm text-slate-700">メールアドレス (email)</div>
                  </div>

                  {/* DateTime Mapping */}
                  <div className="grid grid-cols-2 gap-4 items-center">
                    <input
                      type="text"
                      placeholder="例: schedule, 日時"
                      className="px-3 py-2 bg-white border border-slate-300 rounded text-sm"
                      value={config.webhookMapping?.dateTime || ''}
                      onChange={(e) => setConfig({ ...config, webhookMapping: { ...config.webhookMapping, dateTime: e.target.value } })}
                    />
                    <div className="text-sm text-slate-700">予約日時 (dateTime)</div>
                  </div>

                  {/* Staff Mapping */}
                  <div className="grid grid-cols-2 gap-4 items-center">
                    <input
                      type="text"
                      placeholder="例: member_name, 担当者"
                      className="px-3 py-2 bg-white border border-slate-300 rounded text-sm"
                      value={config.webhookMapping?.staff || ''}
                      onChange={(e) => setConfig({ ...config, webhookMapping: { ...config.webhookMapping, staff: e.target.value } })}
                    />
                    <div className="text-sm text-slate-700">担当者/認定コンサル (staff)</div>
                  </div>

                  {/* Zoom Mapping */}
                  <div className="grid grid-cols-2 gap-4 items-center">
                    <input
                      type="text"
                      placeholder="例: zoom_url, ZoomURL"
                      className="px-3 py-2 bg-white border border-slate-300 rounded text-sm"
                      value={config.webhookMapping?.zoom || ''}
                      onChange={(e) => setConfig({ ...config, webhookMapping: { ...config.webhookMapping, zoom: e.target.value } })}
                    />
                    <div className="text-sm text-slate-700">ZoomURL (zoom)</div>
                  </div>

                  {/* Phone Mapping */}
                  <div className="grid grid-cols-2 gap-4 items-center">
                    <input
                      type="text"
                      placeholder="例: tel, 電話番号, phone"
                      className="px-3 py-2 bg-white border border-slate-300 rounded text-sm"
                      value={config.webhookMapping?.phone || ''}
                      onChange={(e) => setConfig({ ...config, webhookMapping: { ...config.webhookMapping, phone: e.target.value } })}
                    />
                    <div className="text-sm text-slate-700">電話番号 (phone)</div>
                  </div>

                  <p className="text-[10px] text-slate-400 mt-2">※ カンマ区切りで複数のキーを指定可能です。</p>
                </div>
              </div>
            </section>
          )}

          {/* New Custom Notifications (Was Case 2 & 3) */}
          {activeTab === 'custom' && (
            <CustomNotificationsSection
              config={config}
              setConfig={setConfig}
            />
          )}

          {/* Case 4: Reminder */}
          {activeTab === 'case4' && (
            <section className="space-y-6">
              <h2 className="text-lg font-semibold border-b pb-2">Case 4: 前日リマインダー</h2>
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                毎日18:00に翌日の予約担当者へリマインドを送信します。
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">リマインドテンプレート</label>
                <textarea
                  className="w-full h-32 p-3 bg-slate-50 border border-slate-300 rounded-md font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={config.reminderTemplate || '【明日のご予約リマインド】\n日時：{date} {time}\nお客様：{client}\nよろしくお願いいたします。'}
                  onChange={(e) => setConfig({ ...config, reminderTemplate: e.target.value })}
                />
              </div>
            </section>
          )}

          {/* Case 5: Assignment Viewer */}
          {activeTab === 'case5' && (
            <Case5Section config={config} setConfig={setConfig} />
          )}

          {/* Case 6: Time Slot Generator */}
          {activeTab === 'case6' && (
            <section className="space-y-6">
              <h2 className="text-lg font-semibold border-b pb-2">Case 6: 予約枠生成ツール</h2>
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

function Case5Section({ config, setConfig }) {
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
      <h2 className="text-lg font-semibold border-b pb-2">Case 5: 課題集約ページ</h2>
      <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-800">
        事前アンケートと課題シートから提出状況を集約し、個別ページを生成します。
      </div>

      {/* Questionnaire */}
      <div className="space-y-3">
        <h3 className="font-medium text-slate-700">📋 事前アンケート</h3>
        <div className="grid grid-cols-2 gap-4">
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
        <p className="text-xs text-slate-500">※ 受講者の氏名・メールアドレスを含むマスターシート</p>
      </div>

      {/* Assignment Spreadsheet */}
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

      {/* Assignment Sheets */}
      <div className="space-y-3">
        <h3 className="font-medium text-slate-700">課題シート一覧</h3>

        {assignments.length === 0 ? (
          <p className="text-sm text-slate-400 italic">まだ課題シートが登録されていません</p>
        ) : (
          <div className="space-y-2">
            {assignments.map((assignment, idx) => (
              <div key={assignment.id} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-sm font-medium text-slate-600 w-6">{idx + 1}.</span>
                <span className="flex-1 text-sm font-medium">{assignment.name}</span>
                <button
                  onClick={() => removeAssignment(assignment.id)}
                  className="text-red-500 hover:text-red-700 text-sm px-2"
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
