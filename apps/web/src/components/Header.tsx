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
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onTabChange('box')}>
            <span className="text-2xl">💤</span>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">
                {getUIText('appName', locale)}
              </h1>
              <span className="text-xs text-blue-600 font-medium">PokéSleep Companion MVP</span>
            </div>
          </div>

          {/* Language Selector */}
          <div className="flex items-center space-x-2">
            <Globe className="w-4 h-4 text-slate-500" />
            <select
              value={locale}
              onChange={(e) => onLocaleChange(e.target.value as SupportedLocale)}
              className="text-xs bg-slate-100 hover:bg-slate-200 border-none rounded-md px-2 py-1.5 font-medium text-slate-700 cursor-pointer focus:ring-2 focus:ring-blue-500"
            >
              <option value="zh-CN">简体中文</option>
              <option value="zh-TW">繁體中文</option>
              <option value="ja">日本語</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 sm:space-x-4 overflow-x-auto border-t border-slate-100 py-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-200 text-blue-800 rounded-full font-bold">
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
