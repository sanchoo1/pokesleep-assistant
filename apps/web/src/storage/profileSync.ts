/**
 * Profile synchronization service for multi-user family support.
 */

export interface ProfileSummary {
  username: string;
  displayName: string;
  pokemonCount: number;
  updatedAt: number;
}

export interface ProfileData {
  username: string;
  displayName?: string;
  pokemonList?: any[];
  teamIds?: string[];
  inventory?: Record<string, number>;
  potSize?: number;
  goodCampTicket?: boolean;
  islandBonus?: number;
  locale?: string;
  updatedAt?: number;
}

export async function fetchProfilesList(): Promise<ProfileSummary[]> {
  try {
    const res = await fetch('/api/profiles');
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) {
        return list;
      }
    }
  } catch (err) {
    console.warn('Backend /api/profiles unreachable, using local fallback:', err);
  }

  // Local fallback
  try {
    const saved = localStorage.getItem('pokesleep_user_list');
    const users: string[] = saved ? JSON.parse(saved) : ['hxc'];
    return users.map((u) => ({
      username: u,
      displayName: u,
      pokemonCount: 0,
      updatedAt: Date.now(),
    }));
  } catch {
    return [{ username: 'hxc', displayName: 'hxc', pokemonCount: 0, updatedAt: Date.now() }];
  }
}

export async function createProfileOnServer(username: string): Promise<ProfileData> {
  const cleanName = username.trim();
  try {
    const res = await fetch('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: cleanName }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Failed to call create profile on backend:', err);
  }

  // Local cache update
  try {
    const saved = localStorage.getItem('pokesleep_user_list');
    const users: string[] = saved ? JSON.parse(saved) : ['hxc'];
    if (!users.includes(cleanName)) {
      users.push(cleanName);
      localStorage.setItem('pokesleep_user_list', JSON.stringify(users));
    }
  } catch {}

  return {
    username: cleanName,
    displayName: cleanName,
    pokemonList: [],
    teamIds: [],
  };
}

export async function fetchProfileDataFromServer(username: string): Promise<ProfileData | null> {
  try {
    const res = await fetch(`/api/profiles/${encodeURIComponent(username)}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn(`Failed to fetch profile ${username} from backend:`, err);
  }
  return null;
}

export async function saveProfileToServer(
  username: string,
  payload: Partial<ProfileData>
): Promise<void> {
  try {
    await fetch(`/api/profiles/${encodeURIComponent(username)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn(`Failed to sync profile ${username} to server:`, err);
  }
}

export async function deleteProfileFromServer(username: string): Promise<boolean> {
  if (username === 'hxc') return false;
  try {
    const res = await fetch(`/api/profiles/${encodeURIComponent(username)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (err) {
    console.warn(`Failed to delete profile ${username}:`, err);
    return false;
  }
}

