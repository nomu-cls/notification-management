import React from 'react';
import { Filter, AlertCircle } from 'lucide-react';

const TaskFilterSettings = ({ filter = {}, onChange, headers = [] }) => {
    // Default values if undefined
    const targetColumn = filter.targetColumn || '';
    const operator = filter.operator || 'equals'; // 'equals' or 'not_equals'
    const targetValue = filter.targetValue || '';

    const updateFilter = (field, value) => {
        onChange({
            ...filter,
            [field]: value
        });
    };

    return (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4 mt-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                <div className="flex items-center gap-2">
                    <Filter size={14} className="text-blue-500" />
                    <span className="text-xs font-bold text-slate-700">実行条件 (フィルタ)</span>
                </div>
                {!targetColumn && (
                    <div className="flex items-center gap-1 text-[10px] text-amber-600 font-medium">
                        <AlertCircle size={10} />
                        設定なし（常に実行）
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Column Selection */}
                <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">対象の列名</label>
                    <input
                        list={`headers-list-${targetColumn}`}
                        value={targetColumn}
                        onChange={(e) => updateFilter('targetColumn', e.target.value)}
                        placeholder="例: 決済状況"
                        className="w-full text-xs border border-slate-300 rounded px-2 py-2 focus:ring-1 focus:ring-blue-500 outline-none bg-white font-medium"
                    />
                    <datalist id={`headers-list-${targetColumn}`}>
                        {headers.map(h => (
                            <option key={h} value={h} />
                        ))}
                    </datalist>
                </div>

                {/* Operator Selection */}
                <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">条件</label>
                    <select
                        value={operator}
                        onChange={(e) => updateFilter('operator', e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded px-2 py-2 focus:ring-1 focus:ring-blue-500 outline-none bg-white font-medium"
                    >
                        <option value="equals">値が一致する場合に実行</option>
                        <option value="not_equals">値が一致しない場合に実行</option>
                    </select>
                </div>

                {/* Target Value */}
                <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">比較する値</label>
                    <input
                        type="text"
                        value={targetValue}
                        onChange={(e) => updateFilter('targetValue', e.target.value)}
                        placeholder="例: 完了 / 未払い"
                        className="w-full text-xs border border-slate-300 rounded px-2 py-2 focus:ring-1 focus:ring-blue-500 outline-none font-medium"
                    />
                </div>
            </div>

            <p className="text-[10px] text-slate-400 leading-relaxed italic">
                ※ 指定した列の値が、「比較する値」と {operator === 'equals' ? '一致する場合のみ' : '一致しない場合のみ'} タスクが作成されます。
                空欄（列を選択しない）の場合は、全件に対してタスクを作成します。
            </p>
        </div>
    );
};

export default TaskFilterSettings;
