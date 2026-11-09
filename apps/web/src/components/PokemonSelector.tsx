import React, { useState, useMemo } from 'react';
import {
  GAME_DATA,
  SupportedLocale,
  getPokemonImageUrl,
  getTypeImageUrl,
  getBerryImageUrl,
  getIngredientImageUrl,
  getSkillImageUrl,
} from '@pokesleep/data';
import { getEntityName, getPokemonTypeLabel, getUIText } from '../i18n';
import { Search, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

interface PokemonSelectorProps {
  value: string;
  onChange: (pokemonName: string) => void;
  locale: SupportedLocale;
}

const ALL_TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice',
  'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug',
  'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
];

export const PokemonSelector: React.FC<PokemonSelectorProps> = ({
  value,
  onChange,
  locale,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [ingredientFilter, setIngredientFilter] = useState<string>('all');
  const [evoFilter, setEvoFilter] = useState<'all' | 'final' | 'unevolved'>('all');

  const selectedSpecies = useMemo(() => {
    return (
      GAME_DATA.pokemon.find((p) => p.name.toUpperCase() === value.toUpperCase()) ||
      GAME_DATA.pokemon[0]
    );
  }, [value]);

  const selectedBerry = useMemo(() => {
    return GAME_DATA.berries.find(
      (b) => b.name.toUpperCase() === selectedSpecies.berry.toUpperCase()
    );
  }, [selectedSpecies]);

  const filteredList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GAME_DATA.pokemon.filter((p) => {
      if (specialtyFilter !== 'all' && p.specialty !== specialtyFilter) return false;
      if (typeFilter !== 'all' && p.type?.toLowerCase() !== typeFilter) return false;
      if (evoFilter === 'final' && p.remainingEvolutions > 0) return false;
      if (evoFilter === 'unevolved' && p.remainingEvolutions === 0) return false;

      if (ingredientFilter !== 'all') {
        const allIngs = [
          ...(p.ingredient0 || []),
          ...(p.ingredient30 || []),
          ...(p.ingredient60 || []),
        ];
        const hasIng = allIngs.some(
          (slot) => slot.ingredient.toLowerCase() === ingredientFilter.toLowerCase()
        );
        if (!hasIng) return false;
      }

      if (q) {
        const matchName =
          p.name.toLowerCase().includes(q) ||
          p.displayName.toLowerCase().includes(q) ||
          p.pokedexNumber.toString() === q ||
          `#${p.pokedexNumber}` === q ||
          Object.values(p.translations || {}).some(
            (t) => typeof t === 'string' && t.toLowerCase().includes(q)
          );
        if (!matchName) return false;
      }
      return true;
    });
  }, [query, specialtyFilter, typeFilter, ingredientFilter, evoFilter]);

  const activeFilterCount =
    (specialtyFilter !== 'all' ? 1 : 0) +
    (typeFilter !== 'all' ? 1 : 0) +
    (ingredientFilter !== 'all' ? 1 : 0) +
    (evoFilter !== 'all' ? 1 : 0) +
    (query.trim() ? 1 : 0);

  const resetFilters = () => {
    setQuery('');
    setSpecialtyFilter('all');
    setTypeFilter('all');
    setIngredientFilter('all');
    setEvoFilter('all');
  };

  const specialtyLabel = (spec: string) => {
    if (spec === 'berry') return getUIText('filterBerry', locale);
    if (spec === 'ingredient') return getUIText('filterIngredient', locale);
    if (spec === 'skill') return getUIText('filterSkill', locale);
    return getUIText('allAroundSpec', locale) || '全能';
  };

  return (
    <div className="space-y-2">
      {/* Trigger Card */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full text-left p-2.5 rounded-xl border border-[#eae4d6] bg-[#fbf9f4] hover:border-[var(--primary)] transition-all flex items-center justify-between cursor-pointer shadow-2xs tap-feedback"
      >
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center p-1 border border-[#eae4d6] shrink-0">
            <img
              src={getPokemonImageUrl(selectedSpecies.name)}
              alt={selectedSpecies.displayName}
              className="w-10 h-10 object-contain"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5 flex-wrap">
              <span className="text-xs font-mono text-[var(--text-subtle)]">
                #{selectedSpecies.pokedexNumber}
              </span>
              <span className="font-bold text-sm text-[var(--text-main)] truncate">
                {getEntityName(selectedSpecies, locale)}
              </span>
              <span className={`badge badge-${selectedSpecies.specialty} text-2xs`}>
                {specialtyLabel(selectedSpecies.specialty)}
              </span>
            </div>
            <div className="flex items-center space-x-2.5 mt-1 text-2xs text-[var(--text-muted)]">
              {selectedSpecies.type && (
                <span className="inline-flex items-center space-x-1">
                  <img
                    src={getTypeImageUrl(selectedSpecies.type)}
                    alt={selectedSpecies.type}
                    className="w-3.5 h-3.5 object-contain"
                  />
                  <span>{getPokemonTypeLabel(selectedSpecies.type, locale)}</span>
                </span>
              )}
              {selectedBerry && (
                <span className="inline-flex items-center space-x-1">
                  <img
                    src={getBerryImageUrl(selectedBerry.name)}
                    alt={selectedBerry.name}
                    className="w-3.5 h-3.5 object-contain"
                  />
                  <span>{getEntityName(selectedBerry, locale)}</span>
                </span>
              )}
              <span className="inline-flex items-center space-x-1 truncate">
                <img
                  src={getSkillImageUrl(selectedSpecies.skill.image)}
                  alt=""
                  className="w-3.5 h-3.5 object-contain"
                />
                <span className="truncate">
                  {selectedSpecies.skill.translations?.[locale] || selectedSpecies.skill.name}
                </span>
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-1 text-xs text-[var(--primary)] font-semibold shrink-0 ml-2">
          <span>{getUIText('switchSearch', locale)}</span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expandable Multi-Dimensional Filter & Grid Picker */}
      {isOpen && (
        <div className="p-3.5 rounded-2xl border border-[#eae4d6] bg-[#f7f5ee] space-y-3 shadow-md animate-panel-in">
          {/* Search + Reset */}
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[var(--text-subtle)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={getUIText('searchPkmnPlaceholder', locale)}
                className="input-field pl-9 text-xs py-1.5 bg-white"
                autoFocus
              />
            </div>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="btn btn-secondary text-2xs py-1.5 px-2.5 shrink-0"
                title={getUIText('reset', locale)}
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                {getUIText('reset', locale)} ({activeFilterCount})
              </button>
            )}
          </div>

          {/* Specialty + Evolution Row */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: getUIText('allSpecialties', locale) },
                { id: 'berry', label: getUIText('berrySpec', locale) },
                { id: 'ingredient', label: getUIText('ingredientSpec', locale) },
                { id: 'skill', label: getUIText('skillSpec', locale) },
                { id: 'all_spec', label: getUIText('allAroundSpec', locale) },
              ] as const
            ).map((sp) => {
              const isSelected =
                (sp.id === 'all' && specialtyFilter === 'all') ||
                (sp.id === 'all_spec' && specialtyFilter === 'all_only') ||
                specialtyFilter === sp.id;
              return (
                <button
                  type="button"
                  key={sp.id}
                  onClick={() =>
                    setSpecialtyFilter(sp.id === 'all_spec' ? 'all_only' : sp.id)
                  }
                  className={`px-2.5 py-1 rounded-full text-2xs font-semibold border cursor-pointer tap-feedback transition-colors ${
                    isSelected
                      ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                      : 'bg-white text-[var(--text-muted)] border-[#eae4d6] hover:bg-[#f3efe6]'
                  }`}
                >
                  {sp.label}
                </button>
              );
            })}

            <div className="h-4 w-px bg-[#d8cfbf] mx-1" />

            {(
              [
                { id: 'all', label: getUIText('allStages', locale) },
                { id: 'final', label: getUIText('finalEvo', locale) },
                { id: 'unevolved', label: getUIText('unevolved', locale) },
              ] as const
            ).map((ev) => (
              <button
                type="button"
                key={ev.id}
                onClick={() => setEvoFilter(ev.id)}
                className={`px-2 py-1 rounded-full text-2xs font-medium border cursor-pointer tap-feedback ${
                  evoFilter === ev.id
                    ? 'bg-[var(--skill)] text-white border-[var(--skill)]'
                    : 'bg-white text-[var(--text-muted)] border-[#eae4d6] hover:bg-[#f3efe6]'
                }`}
              >
                {ev.label}
              </button>
            ))}
          </div>

          {/* Type Icons Filter Row */}
          <div>
            <div className="text-2xs font-semibold text-[var(--text-muted)] mb-1">
              {getUIText('filterByType', locale)}
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className={`px-2 py-0.5 rounded-md text-2xs font-semibold border cursor-pointer tap-feedback ${
                  typeFilter === 'all'
                    ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                    : 'bg-white text-[var(--text-muted)] border-[#eae4d6] hover:bg-[#f3efe6]'
                }`}
              >
                {getUIText('allOption', locale)}
              </button>
              {ALL_TYPES.map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
                  title={getPokemonTypeLabel(t, locale)}
                  className={`px-1.5 py-0.5 rounded-md text-2xs border inline-flex items-center space-x-1 cursor-pointer tap-feedback transition-colors ${
                    typeFilter === t
                      ? 'bg-[var(--primary-light)] border-[var(--primary)] text-[var(--primary)] font-bold'
                      : 'bg-white border-[#eae4d6] text-[var(--text-muted)] hover:bg-[#f3efe6]'
                  }`}
                >
                  <img src={getTypeImageUrl(t)} alt={t} className="w-3.5 h-3.5 object-contain" />
                  <span>{getPokemonTypeLabel(t, locale)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Ingredient Icons Filter Row */}
          <div>
            <div className="text-2xs font-semibold text-[var(--text-muted)] mb-1">
              {getUIText('filterByIngredient', locale)}
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setIngredientFilter('all')}
                className={`px-2 py-0.5 rounded-md text-2xs font-semibold border cursor-pointer tap-feedback ${
                  ingredientFilter === 'all'
                    ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                    : 'bg-white text-[var(--text-muted)] border-[#eae4d6] hover:bg-[#f3efe6]'
                }`}
              >
                {getUIText('allOption', locale)}
              </button>
              {GAME_DATA.ingredients.map((ing) => (
                <button
                  type="button"
                  key={ing.name}
                  onClick={() =>
                    setIngredientFilter(ingredientFilter === ing.name ? 'all' : ing.name)
                  }
                  title={getEntityName(ing, locale)}
                  className={`p-1 rounded-md border inline-flex items-center space-x-1 cursor-pointer tap-feedback transition-colors ${
                    ingredientFilter === ing.name
                      ? 'bg-[var(--ingredient-bg)] border-[var(--ingredient)] text-[var(--ingredient-text)] font-bold'
                      : 'bg-white border-[#eae4d6] text-[var(--text-muted)] hover:bg-[#f3efe6]'
                  }`}
                >
                  <img
                    src={getIngredientImageUrl(ing.name)}
                    alt={ing.name}
                    className="w-4 h-4 object-contain"
                  />
                  <span className="text-2xs hidden sm:inline">{getEntityName(ing, locale)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Results Grid */}
          <div className="text-2xs text-[var(--text-muted)] flex items-center justify-between pt-1">
            <span>{getUIText('matchedCount', locale).replace('{0}', filteredList.length.toString())}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-60 overflow-y-auto pr-1">
            {filteredList
              .filter((p) => (specialtyFilter === 'all_only' ? p.specialty === 'all' : true))
              .map((p) => {
                const isCurrent = p.name.toUpperCase() === selectedSpecies.name.toUpperCase();
                return (
                  <button
                    type="button"
                    key={p.name}
                    onClick={() => {
                      onChange(p.name);
                      setIsOpen(false);
                    }}
                    className={`p-2 rounded-xl border text-left flex items-center space-x-2 cursor-pointer tap-feedback transition-all ${
                      isCurrent
                        ? 'bg-[var(--primary-light)] border-[var(--primary)] ring-1 ring-[var(--primary)]/30'
                        : 'bg-white border-[#eae4d6] hover:border-[var(--primary-border)] hover:bg-[#fbf9f4]'
                    }`}
                  >
                    <img
                      src={getPokemonImageUrl(p.name)}
                      alt={p.displayName}
                      loading="lazy"
                      className="w-9 h-9 object-contain shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-[var(--text-main)] truncate">
                        {getEntityName(p, locale)}
                      </div>
                      <div className="flex items-center space-x-1 mt-0.5">
                        <span className="text-2xs text-[var(--text-subtle)]">#{p.pokedexNumber}</span>
                        {p.type && (
                          <img
                            src={getTypeImageUrl(p.type)}
                            alt={p.type}
                            className="w-3 h-3 object-contain"
                          />
                        )}
                        <span className={`badge badge-${p.specialty} text-[10px] px-1 py-0`}>
                          {specialtyLabel(p.specialty).replace('专长', '').replace('型', '')}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};
