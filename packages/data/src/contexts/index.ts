import type { Area, Context, ContextInput } from '@azkaban/contracts';
import { currentUserId, db } from '../client';

export const contextsRepository = {
  async listAreas(): Promise<Area[]> {
    const { data, error } = await db()
      .from('areas')
      .select('id, key, i18n_key, icon, color_token')
      .order('sort_order');
    if (error) throw error;
    return data.map((row) => ({
      id: row.id,
      key: row.key,
      i18nKey: row.i18n_key,
      icon: row.icon,
      colorToken: row.color_token,
    }));
  },

  async list(): Promise<Context[]> {
    const { data, error } = await db()
      .from('contexts')
      .select('id, area_id, group_id, name, color_token, icon')
      .is('archived_at', null)
      .order('created_at');
    if (error) throw error;
    return data.map((row) => ({
      id: row.id,
      areaId: row.area_id,
      groupId: row.group_id,
      name: row.name,
      colorToken: row.color_token,
      icon: row.icon,
    }));
  },

  async create({ areaId, groupId, name, colorToken, icon }: ContextInput) {
    const { error } = await db()
      .from('contexts')
      .insert({
        area_id: areaId,
        group_id: groupId,
        owner_user_id: groupId ? null : await currentUserId(),
        name,
        color_token: colorToken,
        icon,
      });
    if (error) throw error;
  },

  async update(id: string, { areaId, name, colorToken, icon }: ContextInput) {
    const { error } = await db()
      .from('contexts')
      .update({ area_id: areaId, name, color_token: colorToken, icon })
      .eq('id', id);
    if (error) throw error;
  },

  async archive(id: string) {
    const { error } = await db()
      .from('contexts')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },
};
