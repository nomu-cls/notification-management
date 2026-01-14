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

export default function App() {
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
    // Case 2
    applicationRoomA: '',
    applicationRoomB: '',
    applicationTemplateA: '【本講座申込通知】\n申込者：{氏名}\n講座：{講座名}\nメール：{メールアドレス}\n電話：{電話番号}',
    applicationTemplateB: '【本講座申込】\n申込者：{氏名}\n講座：{講座名}\n※ タスクを確認してください',
    taskAssigneeIds: [],
    // Case 3
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
          setConfig(prev => ({ ...prev, ...docSnap.data() }));
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
      await setDoc(docRef, config, { merge: true });
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
          <TabButton active={activeTab === 'case2'} onClick={() => setActiveTab('case2')} icon={<Bell size={18} />} label="Case2: 本講座申込" />
          <TabButton active={activeTab === 'case3'} onClick={() => setActiveTab('case3')} icon={<FileText size={18} />} label="Case3: WS報告" />
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
                        // In dev mode, we can't fetch headers easily without proxy, 
                        // so we might need to rely on manual entry or deployed env.
                        // For now we'll match the user's requested layout purely visually if fetch fails
                        const res = await fetch(`/api/sheets/headers?spreadsheetId=${config.spreadsheetId}&sheetName=${config.bookingListSheet}`);
                        if (res.ok) {
                          const data = await res.json();
                          if (data.headers) {
                            // Update UI state with headers (we need a local state for headers)
                            // For simplicity in this iteration, we'll store headers in config or local state
                            // Let's us a local state in the component if possible, but simpler to just alert for now or use a dedicated state
                            alert('ヘッダーを取得しました: ' + data.headers.join(', '));
                            // Ideally we save this to config or state to render
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
            </section>
          )}

          {/* Case 2: Main Course Application */}
          {activeTab === 'case2' && (
            <Case2Section
              config={config}
              setConfig={setConfig}
            />
          )}

          {/* Case 3: Workshop Report */}
          {activeTab === 'case3' && (
            <section className="space-y-6">
              <h2 className="text-lg font-semibold border-b pb-2">Case 3: ワークショップ報告</h2>
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800">
                報告内容を指定のストックルームへ転送します。
              </div>
              <InputGroup label="報告ルームID" placeholder="123456789" value={config.workshopReportRoom} onChange={(v) => setConfig({ ...config, workshopReportRoom: v })} />
            </section>
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

function Case2Section({ config, setConfig }) {
  const [members, setMembers] = useState([]);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const fetchMembers = async () => {
    if (!config.applicationRoomB || !config.chatworkToken) {
      setFetchError('ルームBのIDとAPIトークンを先に設定してください');
      return;
    }

    // Check if running in dev mode (API routes don't work with vite dev)
    const isDevMode = window.location.port === '5173' || window.location.port === '5174';
    if (isDevMode) {
      setFetchError('ローカル開発ではメンバー取得できません。Vercelデプロイ後に利用するか、手動でIDを入力してください。');
      return;
    }

    setIsFetching(true);
    setFetchError('');

    try {
      const response = await fetch(
        `/api/chatwork/members?roomId=${config.applicationRoomB}&token=${config.chatworkToken}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch members');
      }

      setMembers(data.members || []);
    } catch (error) {
      setFetchError(error.message);
    } finally {
      setIsFetching(false);
    }
  };

  const toggleMember = (memberId) => {
    const currentIds = config.taskAssigneeIds || [];
    const memberIdStr = String(memberId);

    if (currentIds.includes(memberIdStr)) {
      setConfig({
        ...config,
        taskAssigneeIds: currentIds.filter(id => id !== memberIdStr)
      });
    } else {
      setConfig({
        ...config,
        taskAssigneeIds: [...currentIds, memberIdStr]
      });
    }
  };

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold border-b pb-2">Case 2: 本講座申し込み</h2>
      <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
        申込データを2つのルームに通知し、ルームBにタスクを作成します。
      </div>

      {/* Placeholder hints */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
        <strong>使用可能な埋め込み文字:</strong><br />
        <code className="bg-blue-100 px-1 rounded">{'{氏名}'}</code>
        <code className="bg-blue-100 px-1 rounded ml-2">{'{講座名}'}</code>
        <code className="bg-blue-100 px-1 rounded ml-2">{'{メールアドレス}'}</code>
        <code className="bg-blue-100 px-1 rounded ml-2">{'{電話番号}'}</code><br />
        ※ スプレッドシートの列名をそのまま <code className="bg-blue-100 px-1 rounded">{'{列名}'}</code> 形式で使用できます
      </div>

      <div className="grid gap-4">
        <InputGroup
          label="通知ルームA ID"
          placeholder="123456789"
          value={config.applicationRoomA}
          onChange={(v) => setConfig({ ...config, applicationRoomA: v })}
        />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">ルームA メッセージテンプレート</label>
          <textarea
            className="w-full h-28 p-3 bg-slate-50 border border-slate-300 rounded-md font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            value={config.applicationTemplateA || ''}
            onChange={(e) => setConfig({ ...config, applicationTemplateA: e.target.value })}
            placeholder="【本講座申込通知】&#10;申込者：{氏名}&#10;講座：{講座名}"
          />
        </div>

        <InputGroup
          label="通知ルームB ID（タスク作成先）"
          placeholder="987654321"
          value={config.applicationRoomB}
          onChange={(v) => setConfig({ ...config, applicationRoomB: v })}
        />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">ルームB メッセージテンプレート</label>
          <textarea
            className="w-full h-28 p-3 bg-slate-50 border border-slate-300 rounded-md font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            value={config.applicationTemplateB || ''}
            onChange={(e) => setConfig({ ...config, applicationTemplateB: e.target.value })}
            placeholder="【本講座申込】&#10;申込者：{氏名}&#10;※ タスクを確認してください"
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-slate-700">タスク担当者</label>
          <button
            onClick={fetchMembers}
            disabled={isFetching}
            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded border border-slate-300 transition-all disabled:opacity-50"
          >
            {isFetching ? '取得中...' : 'Chatworkからメンバー取得'}
          </button>
        </div>

        {/* Manual Input for IDs */}
        <div className="space-y-1">
          <p className="text-[10px] text-slate-400 mb-1">
            担当者のChatwork IDをカンマ区切りで入力してください
          </p>
          <input
            type="text"
            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="1234567, 9876543"
            value={(config.taskAssigneeIds || []).join(', ')}
            onChange={(e) => {
              const ids = e.target.value.split(',').map(id => id.trim()).filter(id => id !== '');
              setConfig({ ...config, taskAssigneeIds: ids });
            }}
          />
        </div>

        {fetchError && (
          <div className="text-xs text-red-600 bg-red-50 p-2 rounded">{fetchError}</div>
        )}

        {members.length > 0 && (
          <div className="border border-slate-200 rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">取得済みメンバー</p>
            {members.map(member => (
              <label key={member.id} className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-1 rounded">
                <input
                  type="checkbox"
                  checked={(config.taskAssigneeIds || []).includes(String(member.id))}
                  onChange={() => toggleMember(member.id)}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className="text-sm">{member.name}</span>
                <span className="text-xs text-slate-400">ID: {member.id}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </section>
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
        登録済み課題シート: {assignments.length}件
      </div>
    </section>
  );
}
