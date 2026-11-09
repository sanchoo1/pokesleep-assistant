import React, { useState } from 'react';
import { User, Plus, Check, Trash2, X, Shield, Sparkles, Users } from 'lucide-react';
import { ProfileSummary } from '../storage/profileSync';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: string;
  profiles: ProfileSummary[];
  onSelectUser: (username: string) => void;
  onCreateUser: (username: string) => Promise<void>;
  onDeleteUser: (username: string) => Promise<void>;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  profiles,
  onSelectUser,
  onCreateUser,
  onDeleteUser,
}) => {
  const [newUsername, setNewUsername] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newUsername.trim();
    if (!clean) return;
    if (profiles.some((p) => p.username.toLowerCase() === clean.toLowerCase())) {
      setErrorMsg('该用户名已存在，请换一个名称或直接切换');
      return;
    }
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await onCreateUser(clean);
      setNewUsername('');
      onClose();
    } catch {
      setErrorMsg('注册失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (username: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (username === 'hxc') {
      alert('默认用户 hxc 不允许删除');
      return;
    }
    if (confirm(`确定删除档案「${username}」及其所有宝可梦数据吗？此操作无法撤销。`)) {
      await onDeleteUser(username);
    }
  };

  return (
    <div
      className="modal-backdrop animate-backdrop-in"
      onClick={onClose}
    >
      <div
        className="modal-panel p-5 sm:p-6 animate-panel-in max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-[#eae4d6]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-[var(--primary-light)] flex items-center justify-center text-[var(--primary)]">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-main)] leading-tight">
                家庭成员档案切换
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                免密随心切换 · 独立记录宝可梦盒与队伍
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-[#f4efe6] tap-feedback cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current User Callout */}
        <div className="my-3.5 p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs flex items-center space-x-2.5">
          <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="text-amber-900 leading-relaxed">
            当前记忆已分配给 <strong className="font-bold underline decoration-amber-400">hxc</strong>。新成员可直接在下方免密注册专属档案，各成员宝可梦与配队完全独立！
          </div>
        </div>

        {/* Profile List */}
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          <label className="block text-2xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            已有档案 ({profiles.length})
          </label>
          {profiles.map((p) => {
            const isActive = p.username === currentUser;
            const isHxc = p.username === 'hxc';
            return (
              <div
                key={p.username}
                onClick={() => {
                  onSelectUser(p.username);
                  onClose();
                }}
                className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer tap-feedback transition-all ${
                  isActive
                    ? 'bg-[var(--primary-light)] border-[var(--primary)] ring-1 ring-[var(--primary)]/30'
                    : 'bg-white border-[#eae4d6] hover:bg-[#fbf9f4]'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                      isActive
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-[#f4efe6] text-[var(--text-main)]'
                    }`}
                  >
                    {p.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-bold text-sm text-[var(--text-main)] truncate">
                        {p.username}
                      </span>
                      {isHxc && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700 font-bold border border-indigo-200">
                          默认 / 主记忆
                        </span>
                      )}
                      {isActive && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                          当前使用中
                        </span>
                      )}
                    </div>
                    <span className="text-2xs text-[var(--text-muted)]">
                      已录入 {p.pokemonCount} 只宝可梦
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-1">
                  {isActive ? (
                    <Check className="w-5 h-5 text-[var(--primary)]" />
                  ) : (
                    !isHxc && (
                      <button
                        type="button"
                        onClick={(e) => handleDelete(p.username, e)}
                        title="删除档案"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 tap-feedback cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick Passwordless Registration */}
        <form onSubmit={handleCreate} className="mt-4 pt-3.5 border-t border-[#eae4d6] space-y-2.5">
          <label className="block text-xs font-semibold text-[var(--text-main)]">
            免密注册新成员档案
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              value={newUsername}
              onChange={(e) => {
                setNewUsername(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="输入成员名字 (例如：妈妈、Alice、弟弟)"
              maxLength={24}
              className="input-field text-xs flex-1"
            />
            <button
              type="submit"
              disabled={isSubmitting || !newUsername.trim()}
              className="btn btn-primary text-xs shrink-0 tap-feedback disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              注册并切换
            </button>
          </div>
          {errorMsg && <p className="text-2xs text-rose-600 font-medium">{errorMsg}</p>}
        </form>

        {/* Close Button */}
        <div className="flex justify-end pt-3 mt-3 border-t border-[#eae4d6]/60">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary text-xs tap-feedback"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

