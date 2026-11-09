import React from 'react';
import { SupportedLocale } from '@pokesleep/data';
import { getUIText } from '../i18n';
import { Box, Sparkles, ChefHat, BookOpen, Globe, User, ChevronDown } from 'lucide-react';

export type TabType = 'box' | 'rating' | 'team' | 'pokedex';

interface HeaderProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  locale: SupportedLocale;
  onLocaleChange: (loc: SupportedLocale) => void;
  pokemonCount: number;
  currentUser: string;
  onOpenProfileModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onTabChange,
  locale,
  onLocaleChange,
  pokemonCount,
  currentUser,
  onOpenProfileModal,
}) => {
  const tabs = [
    { id: 'box' as TabType, label: getUIText('tabBox', locale), icon: Box, badge: pokemonCount },
    { id: 'rating' as TabType, label: getUIText('tabRating', locale), icon: Sparkles },
    { id: 'team' as TabType, label: getUIText('tabTeam', locale), icon: ChefHat },
    { id: 'pokedex' as TabType, label: getUIText('tabPokedex', locale), icon: BookOpen },
  ];

  return (
    <>
      <header className="bg-[var(--surface)]/85 backdrop-blur-md border-b border-[var(--border-subtle)] sticky top-0 z-30 shadow-2xs pt-safe">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Logo with Cozy Camp Identity */}
            <div
              className="flex items-center space-x-2.5 sm:space-x-3 cursor-pointer tap-feedback"
              onClick={() => onTabChange('box')}
            >
              <span className="text-xl sm:text-2xl drop-shadow-xs">💤</span>
              <div>
                <h1 className="text-sm sm:text-lg font-bold text-[var(--text-main)] leading-tight tracking-tight">
                  {getUIText('appName', locale)}
                </h1>
                <span className="text-[10px] sm:text-xs text-[var(--text-muted)] font-medium">
                  Camp Slumber Journal
                </span>
              </div>
            </div>

            {/* Profile & Language Selector */}
            <div className="flex items-center space-x-2">
              {/* User Profile Selector Badge */}
              <button
                type="button"
                onClick={onOpenProfileModal}
                className="flex items-center space-x-1.5 px-2.5 py-1 sm:py-1.5 rounded-lg bg-[#f4efe6] hover:bg-[#eae4d6] text-xs font-semibold text-[var(--text-main)] tap-feedback cursor-pointer transition-colors border border-[#eae4d6]"
                title="切换或注册家庭成员档案"
              >
                <User className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
                <span className="max-w-[70px] sm:max-w-[100px] truncate">{currentUser}</span>
                <ChevronDown className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
              </button>

              {/* Language Selector */}
              <div className="flex items-center space-x-1">
                <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--text-muted)] hidden sm:inline" />
                <select
                  value={locale}
                  onChange={(e) => onLocaleChange(e.target.value as SupportedLocale)}
                  className="text-xs bg-[#f4efe6] hover:bg-[#eae4d6] border-none rounded-lg px-2 sm:px-2.5 py-1 sm:py-1.5 font-medium text-[var(--text-main)] cursor-pointer focus:ring-2 focus:ring-[var(--primary)] transition-colors"
                >
                  <option value="zh-CN">简体中文</option>
                  <option value="zh-TW">繁體中文</option>
                  <option value="ja">日本語</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>
          </div>

          {/* Desktop Tab Navigation */}
          <div className="hidden sm:flex space-x-1.5 sm:space-x-3 overflow-x-auto border-t border-[#eae4d6]/60 py-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer tap-feedback ${
                    active
                      ? 'bg-[var(--primary)] text-white shadow-2xs'
                      : 'text-[var(--text-muted)] hover:bg-[#f4efe6] hover:text-[var(--text-main)]'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-[var(--text-muted)]'}`} />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span
                      className={`ml-1 px-1.5 py-0.5 text-2xs rounded-full font-bold ${
                        active ? 'bg-white/20 text-white' : 'bg-[#eae4d6] text-[var(--text-main)]'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar (Tailored for thumb reach & iOS safe area) */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--surface)]/95 backdrop-blur-lg border-t border-[var(--border-subtle)] pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <div className="grid grid-cols-4 h-14">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`relative flex flex-col items-center justify-center tap-feedback transition-colors py-1 cursor-pointer ${
                  active ? 'text-[var(--primary)] font-bold' : 'text-[var(--text-muted)]'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 transition-transform ${active ? 'scale-110 stroke-[2.5]' : 'stroke-2'}`} />
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="absolute -top-1 -right-2 px-1 py-0.2 min-w-[14px] text-[9px] text-center font-bold bg-amber-500 text-white rounded-full leading-tight">
                      {tab.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] mt-0.5 leading-tight tracking-tight">
                  {tab.label}
                </span>
                {active && (
                  <span className="absolute top-0 w-8 h-0.5 bg-[var(--primary)] rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
