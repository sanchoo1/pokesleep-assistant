import React from 'react';
import { SupportedLocale } from '@pokesleep/data';
import { getUIText } from '../i18n';
import { Box, Sparkles, ChefHat, BookOpen, Globe } from 'lucide-react';

export type TabType = 'box' | 'rating' | 'team' | 'pokedex';

interface HeaderProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  locale: SupportedLocale;
  onLocaleChange: (loc: SupportedLocale) => void;
  pokemonCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onTabChange,
  locale,
  onLocaleChange,
  pokemonCount,
}) => {
  const tabs = [
    { id: 'box' as TabType, label: getUIText('tabBox', locale), icon: Box, badge: pokemonCount },
    { id: 'rating' as TabType, label: getUIText('tabRating', locale), icon: Sparkles },
    { id: 'team' as TabType, label: getUIText('tabTeam', locale), icon: ChefHat },
    { id: 'pokedex' as TabType, label: getUIText('tabPokedex', locale), icon: BookOpen },
  ];

  return (
    <header className="bg-[var(--surface)]/85 backdrop-blur-md border-b border-[var(--border-subtle)] sticky top-0 z-30 shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo with Cozy Camp Identity */}
          <div
            className="flex items-center space-x-3 cursor-pointer tap-feedback"
            onClick={() => onTabChange('box')}
          >
            <span className="text-2xl drop-shadow-xs">💤</span>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-[var(--text-main)] leading-tight tracking-tight">
                {getUIText('appName', locale)}
              </h1>
              <span className="text-xs text-[var(--text-muted)] font-medium">
                Camp Slumber Journal
              </span>
            </div>
          </div>

          {/* Language Selector */}
          <div className="flex items-center space-x-2">
            <Globe className="w-4 h-4 text-[var(--text-muted)]" />
            <select
              value={locale}
              onChange={(e) => onLocaleChange(e.target.value as SupportedLocale)}
              className="text-xs bg-[#f4efe6] hover:bg-[#eae4d6] border-none rounded-lg px-2.5 py-1.5 font-medium text-[var(--text-main)] cursor-pointer focus:ring-2 focus:ring-[var(--primary)] transition-colors"
            >
              <option value="zh-CN">简体中文</option>
              <option value="zh-TW">繁體中文</option>
              <option value="ja">日本語</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        {/* Tab Navigation with Apple-style Fluid Segmented Feel */}
        <div className="flex space-x-1.5 sm:space-x-3 overflow-x-auto border-t border-[#eae4d6]/60 py-2">
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
  );
};
