/**
 * IndexedDB storage for Pokémon Sleep Box.
 * Current game subskill unlock slots: Lv.10, Lv.25, Lv.50, Lv.70, Lv.80 (max Pokémon level cap: 70).
 */

export interface BoxSubskills {
  level10?: string;
  level25?: string;
  level50?: string;
  level70?: string;
  level80?: string;
  /** Legacy migration fields */
  level75?: string;
  level100?: string;
}

export interface BoxPokemon {
  id: string;
  pokemonName: string; // Canonical name, e.g. "PIKACHU"
  nickname?: string;
  level: number; // 1 to 70
  nature: string; // Canonical nature name, e.g. "Adamant"
  subskills: BoxSubskills;
  ingredients: {
    slotA: string;
    slotB?: string;
    slotC?: string;
  };
  mainSkillLevel?: number;
  ribbonLevel?: number;
  carryLimitBonus?: number;
  createdAt: number;
  tags?: string[];
}

export function normalizeBoxSubskills(sub?: BoxSubskills): {
  level10: string;
  level25: string;
  level50: string;
  level70: string;
  level80: string;
} {
  return {
    level10: sub?.level10 || '',
    level25: sub?.level25 || '',
    level50: sub?.level50 || '',
    level70: sub?.level70 ?? sub?.level75 ?? '',
    level80: sub?.level80 ?? sub?.level100 ?? '',
  };
}

export function normalizeBoxPokemon(item: BoxPokemon): BoxPokemon {
  const normSubs = normalizeBoxSubskills(item.subskills);
  return {
    ...item,
    level: Math.max(1, Math.min(70, item.level || 1)),
    subskills: normSubs,
  };
}

const DB_NAME = 'pokesleep_db';
const DB_VERSION = 1;
const STORE_POKEMON = 'pokemon_box';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_POKEMON)) {
        const store = db.createObjectStore(STORE_POKEMON, { keyPath: 'id' });
        store.createIndex('pokemonName', 'pokemonName', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllPokemon(): Promise<BoxPokemon[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_POKEMON, 'readonly');
    const store = tx.objectStore(STORE_POKEMON);
    const req = store.getAll();
    req.onsuccess = () => {
      const raw: BoxPokemon[] = req.result || [];
      resolve(raw.map(normalizeBoxPokemon));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function savePokemon(pokemon: BoxPokemon): Promise<void> {
  const db = await openDB();
  const normalized = normalizeBoxPokemon(pokemon);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_POKEMON, 'readwrite');
    const store = tx.objectStore(STORE_POKEMON);
    const req = store.put(normalized);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deletePokemon(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_POKEMON, 'readwrite');
    const store = tx.objectStore(STORE_POKEMON);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function importBox(items: BoxPokemon[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_POKEMON, 'readwrite');
    const store = tx.objectStore(STORE_POKEMON);
    for (const item of items) {
      store.put(normalizeBoxPokemon(item));
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearBox(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_POKEMON, 'readwrite');
    const store = tx.objectStore(STORE_POKEMON);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
