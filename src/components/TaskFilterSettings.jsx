import React from 'react';
import { Filter } from 'lucide-react';

const TaskFilterSettings = ({ filter = {}, onChange }) => {
    // Default values if undefined
    const paymentStatus = filter.paymentStatus || 'all';
    const attendance = filter.attendance || 'all';

    const updateFilter = (field, value) => {
        onChange({
            ...filter,
            [field]: value
        });
    };

    return (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3 mt-3">
            <div className="flex items-center gap-2 mb-1">
                <Filter size={14} className="text-slate-500" />
                <span className="text-xs font-bold text-slate-500">実行条件 (フィルタ)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">決済ステータス</label>
                    <select
                        value={paymentStatus}
                        onChange={(e) => updateFilter('paymentStatus', e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none"
                    >
                        <option value="all">全員 (除外なし)</option>
                        <option value="paid_only">決済完了者のみ (未払いは除外)</option>
                        <option value="unpaid_only">未払い者のみ (未入金フォロー等)</option>
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">参加状況</label>
                    <select
                        value={attendance}
                        onChange={(e) => updateFilter('attendance', e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none"
                    >
                        <option value="all">全員</option>
                        <option value="attended">参加済み</option>
                        <option value="unattended">未参加</option>
                    </select>
                </div>
            </div>
        </div>
    );
};

export default TaskFilterSettings;
