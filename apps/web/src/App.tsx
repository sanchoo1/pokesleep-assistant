import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SupportedLocale } from '@pokesleep/data';
import {
  BoxPokemon,
  getAllPokemon,
  savePokemon,
  getActiveUsername,
  setActiveUsername,
  clearBox,
} from './storage/db';
import {
  fetchProfilesList,
  fetchProfileDataFromServer,
  createProfileOnServer,
  saveProfileToServer,
  deleteProfileFromServer,
  ProfileSummary,
} from './storage/profileSync';
import { Header, TabType } from './components/Header';
import { BoxManager } from './components/BoxManager';
import { RatingView } from './components/RatingView';
import { TeamAndCookingView } from './components/TeamAndCookingView';
import { PokedexView } from './components/PokedexView';
import { ProfileModal } from './components/ProfileModal';
import { getUIText } from './i18n';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<TabType>('box');
  const [currentUser, setCurrentUser] = useState<string>(() => getActiveUsername());
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const [locale, setLocale] = useState<SupportedLocale>(() => {
    return (localStorage.getItem(`pokesleep_locale_${getActiveUsername()}`) as SupportedLocale) ||
      (localStorage.getItem('pokesleep_locale') as SupportedLocale) || 'zh-CN';
  });

  const [pokemonList, setPokemonList] = useState<BoxPokemon[]>([]);
  const [selectedForRating, setSelectedForRating] = useState<BoxPokemon | null>(null);

  const [teamIds, setTeamIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`pokesleep_team_ids_${getActiveUsername()}`) ||
        localStorage.getItem('pokesleep_team_ids');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const isInitialSyncDone = useRef(false);

  // Refresh profile list
  const refreshProfiles = useCallback(async () => {
    try {
      const list = await fetchProfilesList();
      setProfiles(list);
    } catch (err) {
      console.warn('Failed to load profiles:', err);
    }
  }, []);

  // Load user data for a specific user
  const loadUserData = useCallback(async (user: string) => {
    try {
      // 1. Load from local IndexedDB
      let localList = await getAllPokemon(user);

      // 2. Try fetching remote server profile
      const serverProfile = await fetchProfileDataFromServer(user);

      if (serverProfile) {
        const localSyncTime = parseInt(localStorage.getItem(`pokesleep_last_sync_${user}`) || '0', 10);
        const serverTime = serverProfile.updatedAt || 0;
        const hasObsoleteSeed = localList.some(
          (p) => p.id === 'seed_pikachu_01' || p.id === 'seed_gardevoir_03'
        );

        // Populate local from server if local is empty, or has outdated mock seeds, or server is newer
        if (
          serverProfile.pokemonList &&
          (localList.length === 0 || hasObsoleteSeed || serverTime > localSyncTime)
        ) {
          await clearBox(user);
          for (const item of serverProfile.pokemonList) {
            await savePokemon(item, user);
          }
          localList = await getAllPokemon(user);
          localStorage.setItem(`pokesleep_last_sync_${user}`, String(serverTime || Date.now()));

          if (serverProfile.teamIds && serverProfile.teamIds.length > 0) {
            const validSet = new Set(localList.map((p) => p.id));
            const cleaned = serverProfile.teamIds.filter((id) => validSet.has(id)).slice(0, 5);
            setTeamIds(cleaned);
            localStorage.setItem(`pokesleep_team_ids_${user}`, JSON.stringify(cleaned));
          }
        } else if (localList.length > 0 && (!serverProfile.pokemonList || serverProfile.pokemonList.length === 0)) {
          // Local has data, push to server
          const now = Date.now();
          await saveProfileToServer(user, {
            pokemonList: localList,
            teamIds: teamIds,
            updatedAt: now,
          });
          localStorage.setItem(`pokesleep_last_sync_${user}`, String(now));
        } else if (serverProfile.teamIds && serverProfile.teamIds.length > 0 && teamIds.length === 0) {
          const validSet = new Set(localList.map((p) => p.id));
          const cleaned = serverProfile.teamIds.filter((id) => validSet.has(id)).slice(0, 5);
          if (cleaned.length > 0) {
            setTeamIds(cleaned);
            localStorage.setItem(`pokesleep_team_ids_${user}`, JSON.stringify(cleaned));
          }
        }
      }

      // Clean team IDs
      setTeamIds((prev) => {
        let currentTeam = prev;
        try {
          const saved = localStorage.getItem(`pokesleep_team_ids_${user}`);
          if (saved) currentTeam = JSON.parse(saved);
        } catch {}
        const validSet = new Set(localList.map((p) => p.id));
        const cleaned = Array.from(new Set(currentTeam)).filter((id) => validSet.has(id)).slice(0, 5);
        localStorage.setItem(`pokesleep_team_ids_${user}`, JSON.stringify(cleaned));
        return cleaned;
      });

      setPokemonList(localList);
      refreshProfiles();
    } catch (err) {
      console.error('Failed to load user box:', err);
    }
  }, [refreshProfiles, teamIds]);

  // Initial load
  useEffect(() => {
    if (!isInitialSyncDone.current) {
      isInitialSyncDone.current = true;
      refreshProfiles();
      loadUserData(currentUser);
    }
  }, [currentUser, loadUserData, refreshProfiles]);

  const handleSwitchUser = useCallback(async (newUser: string) => {
    if (newUser === currentUser) return;
    setCurrentUser(newUser);
    setActiveUsername(newUser);
    // Switch locale if saved per user
    const userLocale = (localStorage.getItem(`pokesleep_locale_${newUser}`) as SupportedLocale) || locale;
    setLocale(userLocale);
    await loadUserData(newUser);
  }, [currentUser, locale, loadUserData]);

  const handleCreateUser = useCallback(async (newUsername: string) => {
    await createProfileOnServer(newUsername);
    await refreshProfiles();
    await handleSwitchUser(newUsername);
  }, [refreshProfiles, handleSwitchUser]);

  const handleDeleteUser = useCallback(async (username: string) => {
    await deleteProfileFromServer(username);
    await clearBox(username);
    if (currentUser === username) {
      await handleSwitchUser('hxc');
    }
    await refreshProfiles();
  }, [currentUser, handleSwitchUser, refreshProfiles]);

  const handleLocaleChange = (newLoc: SupportedLocale) => {
    setLocale(newLoc);
    localStorage.setItem(`pokesleep_locale_${currentUser}`, newLoc);
    localStorage.setItem('pokesleep_locale', newLoc);
    saveProfileToServer(currentUser, { locale: newLoc });
  };

  const handleToggleTeam = (pokemon: BoxPokemon) => {
    setTeamIds((prev) => {
      const validSet = new Set(pokemonList.map((p) => p.id));
      const validIds = Array.from(new Set(prev)).filter((id) => validSet.has(id));

      let next: string[];
      if (validIds.includes(pokemon.id)) {
        next = validIds.filter((id) => id !== pokemon.id);
      } else {
        if (validIds.length >= 5) {
          alert(getUIText('teamLimitAlert', locale));
          return validIds;
        }
        next = [...validIds, pokemon.id];
      }
      localStorage.setItem(`pokesleep_team_ids_${currentUser}`, JSON.stringify(next));
      const now = Date.now();
      localStorage.setItem(`pokesleep_last_sync_${currentUser}`, String(now));
      saveProfileToServer(currentUser, { teamIds: next, updatedAt: now });
      return next;
    });
  };

  const handleReloadBox = async () => {
    const list = await getAllPokemon(currentUser);
    setPokemonList(list);
    const now = Date.now();
    localStorage.setItem(`pokesleep_last_sync_${currentUser}`, String(now));
    saveProfileToServer(currentUser, { pokemonList: list, teamIds, updatedAt: now });
    refreshProfiles();
  };

  const handleAnalyzeFromBox = (pokemon: BoxPokemon) => {
    setSelectedForRating(pokemon);
    setCurrentTab('rating');
  };

  const teamPokemon = pokemonList.filter((p) => teamIds.includes(p.id));

  return (
    <div className="min-h-screen flex flex-col bg-[var(--canvas)] text-[var(--text-main)] selection:bg-[var(--primary-light)] selection:text-[var(--primary)]">
      <Header
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        locale={locale}
        onLocaleChange={handleLocaleChange}
        pokemonCount={pokemonList.length}
        currentUser={currentUser}
        onOpenProfileModal={() => setIsProfileModalOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 sm:pb-8">
        {currentTab === 'box' && (
          <BoxManager
            pokemonList={pokemonList}
            onReload={handleReloadBox}
            locale={locale}
            onAnalyze={handleAnalyzeFromBox}
            teamIds={teamIds}
            onToggleTeam={handleToggleTeam}
          />
        )}

        {currentTab === 'rating' && (
          <RatingView
            initialPokemon={selectedForRating}
            locale={locale}
            onClearInitial={() => setSelectedForRating(null)}
          />
        )}

        {currentTab === 'team' && (
          <TeamAndCookingView
            teamPokemon={teamPokemon}
            locale={locale}
            onRemoveFromTeam={handleToggleTeam}
            currentUser={currentUser}
          />
        )}

        {currentTab === 'pokedex' && <PokedexView locale={locale} />}
      </main>

      <footer className="bg-[var(--surface)] border-t border-[var(--border-subtle)] py-6 pb-24 sm:pb-6 text-center text-xs text-[var(--text-muted)] px-4">
        <p>Pokémon Sleep Companion Toolkit © 2026. Made with ❤️ for the Pokémon Sleep Community.</p>
        <p className="mt-1 text-[var(--text-subtle)]">
          当前活跃档案：<strong className="text-[var(--text-main)]">{currentUser}</strong> · 支持免密多成员档案随时切换与云端同步。
        </p>
      </footer>

      {/* Profile Switch & Registration Modal */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        currentUser={currentUser}
        profiles={profiles}
        onSelectUser={handleSwitchUser}
        onCreateUser={handleCreateUser}
        onDeleteUser={handleDeleteUser}
      />
    </div>
  );
};


