import type { Area, Context, ContextInput, ContextLocation } from '@azkaban/contracts';
import { currentUserId, db } from '../client';

type LocationRow = {
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_radius_m: number | null;
};

// The four columns are all set or all null (`contexts_location_check`).
const toLocation = (row: LocationRow): ContextLocation | null =>
  row.location_address === null ||
  row.location_lat === null ||
  row.location_lng === null ||
  row.location_radius_m === null
    ? null
    : {
        address: row.location_address,
        lat: row.location_lat,
        lng: row.location_lng,
        radiusM: row.location_radius_m,
      };

/** Always writes the four columns together; nulls remove the place. */
const locationColumns = (location: ContextLocation | null): LocationRow => ({
  location_address: location?.address ?? null,
  location_lat: location?.lat ?? null,
  location_lng: location?.lng ?? null,
  location_radius_m: location?.radiusM ?? null,
});

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
      .select(
        'id, area_id, group_id, name, color_token, icon, location_address, location_lat, location_lng, location_radius_m',
      )
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
      location: toLocation(row),
    }));
  },

  async create({ areaId, groupId, name, colorToken, icon, location }: ContextInput) {
    const { error } = await db()
      .from('contexts')
      .insert({
        area_id: areaId,
        group_id: groupId,
        owner_user_id: groupId ? null : await currentUserId(),
        name,
        color_token: colorToken,
        icon,
        ...locationColumns(location),
      });
    if (error) throw error;
  },

  async update(id: string, { areaId, name, colorToken, icon, location }: ContextInput) {
    const { error } = await db()
      .from('contexts')
      .update({
        area_id: areaId,
        name,
        color_token: colorToken,
        icon,
        ...locationColumns(location),
      })
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
