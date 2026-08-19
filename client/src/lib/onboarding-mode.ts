type SupabaseConfig = { url?: string; serviceRoleKey?: string };

export function hasSupabaseConfig(config: SupabaseConfig): config is Required<SupabaseConfig> {
  return Boolean(config.url && config.serviceRoleKey);
}
