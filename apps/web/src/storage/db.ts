/**
 * IndexedDB storage for Pokémon Sleep Box.
 */

export interface BoxPokemon {
  id: string;
  pokemonName: string; // Canonical name, e.g. "PIKACHU"
  nickname?: string;
  level: number;
  nature: string; // Canonical nature name, e.g. "Adamant"
  subskills: {
    level10?: string;
    level25?: string;
    level50?: string;
    level75?: string;
    level100?: string;
  };
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
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function savePokemon(pokemon: BoxPokemon): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_POKEMON, 'readwrite');
    const store = tx.objectStore(STORE_POKEMON);
    const req = store.put(pokemon);
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
      store.put(item);
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
