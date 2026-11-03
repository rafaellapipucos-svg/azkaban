import type { Profile, ProfileUpdateInput } from '@azkaban/contracts';
import { currentUserId, db } from '../client';

export const profilesRepository = {
  async getMine(): Promise<Profile> {
    const { data, error } = await db()
      .from('profiles')
      .select('id, display_name, timezone, locale')
      .eq('id', await currentUserId())
      .single();
    if (error) throw error;
    return {
      id: data.id,
      displayName: data.display_name,
      timezone: data.timezone,
      locale: data.locale,
    };
  },

  async updateMine({ displayName, timezone }: ProfileUpdateInput) {
    const { error } = await db()
      .from('profiles')
      .update({ display_name: displayName, timezone })
      .eq('id', await currentUserId());
    if (error) throw error;
  },
};
