import React, { useState, useEffect, useCallback } from 'react';
import { SupportedLocale } from '@pokesleep/data';
import { BoxPokemon, getAllPokemon, savePokemon } from './storage/db';
import { Header, TabType } from './components/Header';
import { BoxManager } from './components/BoxManager';
import { RatingView } from './components/RatingView';
import { TeamAndCookingView } from './components/TeamAndCookingView';
import { PokedexView } from './components/PokedexView';

const SEED_POKEMON: BoxPokemon[] = [
  {
    id: 'seed_pikachu_01',
    pokemonName: 'PIKACHU',
    nickname: '雷电先锋',
    level: 25,
    nature: 'Adamant',
    subskills: {
      level10: 'Berry Finding S',
      level25: 'Helping Speed M',
      level50: 'Inventory Up L',
    },
    ingredients: {
      slotA: 'Apple',
      slotB: 'Apple',
      slotC: 'Apple',
    },
    ribbonLevel: 1,
    createdAt: Date.now() - 100000,
  },
  {
    id: 'seed_charizard_02',
    pokemonName: 'CHARIZARD',
    nickname: '火龙大厨',
    level: 35,
    nature: 'Naughty',
    subskills: {
      level10: 'Helping Bonus',
      level25: 'Ingredient Finder M',
      level50: 'Inventory Up L',
    },
    ingredients: {
      slotA: 'Sausage',
      slotB: 'Ginger',
      slotC: 'Sausage',
    },
    ribbonLevel: 2,
    createdAt: Date.now() - 50000,
  },
  {
    id: 'seed_blastoise_03',
    pokemonName: 'BLASTOISE',
    nickname: '纯奶大管家',
    level: 32,
    nature: 'Quiet',
    subskills: {
      level10: 'Ingredient Finder M',
      level25: 'Skill Trigger S',
      level50: 'Helping Speed S',
    },
    ingredients: {
      slotA: 'Milk',
      slotB: 'Cacao',
      slotC: 'Milk',
    },
    ribbonLevel: 0,
    createdAt: Date.now() - 20000,
  },
];

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<TabType>('box');
  const [locale, setLocale] = useState<SupportedLocale>(() => {
    return (localStorage.getItem('pokesleep_locale') as SupportedLocale) || 'zh-CN';
  });

  const [pokemonList, setPokemonList] = useState<BoxPokemon[]>([]);
  const [selectedForRating, setSelectedForRating] = useState<BoxPokemon | null>(null);

  const [teamIds, setTeamIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('pokesleep_team_ids');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const loadPokemon = useCallback(async () => {
    try {
      let list = await getAllPokemon();
      if (list.length === 0) {
        // Seed default sample data so user immediately has a functional experience
        for (const seed of SEED_POKEMON) {
          await savePokemon(seed);
        }
        list = await getAllPokemon();
        // Default seed active team
        setTeamIds(list.map((p) => p.id));
      }
      setPokemonList(list);
    } catch (err) {
      console.error('Failed to load pokemon box:', err);
    }
  }, []);

  useEffect(() => {
    loadPokemon();
  }, [loadPokemon]);

  const handleLocaleChange = (newLoc: SupportedLocale) => {
    setLocale(newLoc);
    localStorage.setItem('pokesleep_locale', newLoc);
  };

  const handleToggleTeam = (pokemon: BoxPokemon) => {
    setTeamIds((prev) => {
      let next: string[];
      if (prev.includes(pokemon.id)) {
        next = prev.filter((id) => id !== pokemon.id);
      } else {
        if (prev.length >= 5) {
          alert('出阵队伍最多容纳 5 只宝可梦，请先移出一只！');
          return prev;
        }
        next = [...prev, pokemon.id];
      }
      localStorage.setItem('pokesleep_team_ids', JSON.stringify(next));
      return next;
    });
  };

  const handleAnalyzeFromBox = (pokemon: BoxPokemon) => {
    setSelectedForRating(pokemon);
    setCurrentTab('rating');
  };

  const teamPokemon = pokemonList.filter((p) => teamIds.includes(p.id));

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      <Header
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        locale={locale}
        onLocaleChange={handleLocaleChange}
        pokemonCount={pokemonList.length}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentTab === 'box' && (
          <BoxManager
            pokemonList={pokemonList}
            onReload={loadPokemon}
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
          />
        )}

        {currentTab === 'pokedex' && <PokedexView locale={locale} />}
      </main>

      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <p>Pokémon Sleep Companion Toolkit © 2026. Made with ❤️ for the Pokémon Sleep Community.</p>
        <p className="mt-1 text-slate-400">
          Pokémon and its trademarks are © Nintendo / Creatures Inc. / GAME FREAK inc. / The Pokémon Company.
        </p>
      </footer>
    </div>
  );
};

